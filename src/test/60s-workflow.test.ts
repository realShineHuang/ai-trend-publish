import { SixtySecondsScraper } from '../scrapers/60s.scraper';
import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';
import * as zlib from 'zlib';
import { promisify } from 'util';
import * as crypto from 'crypto';

const gzip = promisify(zlib.gzip);
const gunzip = promisify(zlib.gunzip);

interface SixtySecondsResponse {
  code: number;
  message: string;
  data: {
    date: string;
    news: string[];
    audio: {
      music: string;
      news: string;
    };
    tip: string;
    cover: string;
    link: string;
    created: string;
    created_at: number;
    updated: string;
    updated_at: number;
  };
}

// 添加比较模式配置
interface CompareOptions {
  strictMode: boolean;
}

// 修改核心数据比较函数
function compareNewsData(data1: any, data2: any, options: CompareOptions = { strictMode: false }): boolean {
  try {
    if (options.strictMode) {
      // 严格模式：完全比较所有字段
      return JSON.stringify(data1) === JSON.stringify(data2);
    } else {
      // 宽松模式：只比较核心数据
      const isSameDate = data1.date.split('T')[0] === data2.date.split('T')[0];
      if (!isSameDate) return false;

      if (data1.news.length !== data2.news.length) return false;
      return data1.news.every((news: string, index: number) => news === data2.news[index]);
    }
  } catch (error) {
    console.error('比较数据失败:', error);
    return false;
  }
}

// 修改配置对象
const CONFIG = {
  dataDir: path.join(process.cwd(), 'data', '60s'),
  backupDir: path.join(process.cwd(), 'data', '60s-backup'),
  retentionDays: 30,
  compressionEnabled: true,
  strictComparison: true  // 启用严格比较模式
};

// 模拟数据
const mockData: SixtySecondsResponse = {
  code: 200,
  message: "success",
  data: {
    date: new Date().toISOString(),
    news: [
      "测试新闻1：这是一条测试新闻",
      "测试新闻2：这是另一条测试新闻"
    ],
    audio: {
      music: "https://example.com/music.mp3",
      news: "https://example.com/news.mp3"
    },
    tip: "这是一条测试提示",
    cover: "https://example.com/cover.jpg",
    link: "https://example.com/news",
    created: new Date().toISOString(),
    created_at: Date.now(),
    updated: new Date().toISOString(),
    updated_at: Date.now()
  }
};

// 数据验证
function validateData(data: any): boolean {
  try {
    // 检查必需字段
    const requiredFields = ['date', 'news', 'audio', 'tip', 'cover', 'link', 'created', 'updated'];
    for (const field of requiredFields) {
      if (!(field in data)) {
        console.error(`缺少必需字段: ${field}`);
        return false;
      }
    }

    // 验证日期格式
    const dateFields = ['date', 'created', 'updated'];
    for (const field of dateFields) {
      const date = new Date(data[field]);
      if (isNaN(date.getTime())) {
        console.error(`无效的日期格式: ${field}`);
        return false;
      }
    }

    // 验证新闻数组
    if (!Array.isArray(data.news) || data.news.length === 0) {
      console.error('新闻数组为空或格式不正确');
      return false;
    }

    return true;
  } catch (error) {
    console.error('数据验证失败:', error);
    return false;
  }
}

// 保存数据
async function saveData(data: any, date: string): Promise<void> {
  const fileName = `${date}.json`;
  const filePath = path.join(CONFIG.dataDir, fileName);
  const backupPath = path.join(CONFIG.backupDir, fileName);

  // 验证数据
  if (!validateData(data)) {
    throw new Error('数据验证失败');
  }

  // 准备数据
  const jsonData = JSON.stringify(data, null, 2);

  try {
    // 确保目录存在
    await fs.promises.mkdir(CONFIG.dataDir, { recursive: true });
    await fs.promises.mkdir(CONFIG.backupDir, { recursive: true });

    // 同时保存主数据和备份，使用相同的数据对象
    if (CONFIG.compressionEnabled) {
      const compressed = await gzip(jsonData);
      await Promise.all([
        fs.promises.writeFile(filePath + '.gz', compressed),
        fs.promises.writeFile(backupPath + '.gz', compressed)
      ]);
    } else {
      await Promise.all([
        fs.promises.writeFile(filePath, jsonData, 'utf-8'),
        fs.promises.writeFile(backupPath, jsonData, 'utf-8')
      ]);
    }

    console.log(`数据已保存到: ${filePath}${CONFIG.compressionEnabled ? '.gz' : ''}`);
    console.log(`备份已保存到: ${backupPath}${CONFIG.compressionEnabled ? '.gz' : ''}`);
  } catch (error) {
    console.error('保存数据失败:', error);
    throw error;
  }
}

// 清理旧数据
async function cleanupOldData(): Promise<void> {
  try {
    const now = new Date();
    const dirs = [CONFIG.dataDir, CONFIG.backupDir];

    for (const dir of dirs) {
      if (!fs.existsSync(dir)) continue;

      const files = await fs.promises.readdir(dir);
      for (const file of files) {
        const filePath = path.join(dir, file);
        const stats = await fs.promises.stat(filePath);
        const fileDate = new Date(file.split('.')[0]);

        // 如果文件超过保留天数，则删除
        const daysDiff = (now.getTime() - fileDate.getTime()) / (1000 * 60 * 60 * 24);
        if (daysDiff > CONFIG.retentionDays) {
          await fs.promises.unlink(filePath);
          console.log(`已删除过期文件: ${filePath}`);
        }
      }
    }
  } catch (error) {
    console.error('清理旧数据失败:', error);
    throw error;
  }
}

// 读取数据
async function readData(filePath: string): Promise<any> {
  try {
    if (filePath.endsWith('.gz')) {
      const compressed = await fs.promises.readFile(filePath);
      const decompressed = await gunzip(compressed);
      return JSON.parse(decompressed.toString());
    } else {
      const content = await fs.promises.readFile(filePath, 'utf-8');
      return JSON.parse(content);
    }
  } catch (error) {
    console.error('读取数据失败:', error);
    throw error;
  }
}

// 从备份恢复数据
async function restoreFromBackup(date: string): Promise<void> {
  const fileName = `${date}.json${CONFIG.compressionEnabled ? '.gz' : ''}`;
  const backupPath = path.join(CONFIG.backupDir, fileName);
  const targetPath = path.join(CONFIG.dataDir, fileName);

  try {
    // 检查备份是否存在
    if (!fs.existsSync(backupPath)) {
      throw new Error(`备份文件不存在: ${backupPath}`);
    }

    // 直接复制备份文件到主目录，保持完全一致
    await fs.promises.copyFile(backupPath, targetPath);
    console.log(`数据已从备份恢复: ${targetPath}`);

  } catch (error) {
    console.error('恢复数据失败:', error);
    throw error;
  }
}

async function testDataSaving() {
  try {
    console.log('=== 开始测试 60s 数据保存功能 ===');
    
    // 1. 创建必要的目录
    await fs.promises.mkdir(CONFIG.dataDir, { recursive: true });
    await fs.promises.mkdir(CONFIG.backupDir, { recursive: true });
    console.log(`数据目录: ${CONFIG.dataDir}`);
    console.log(`备份目录: ${CONFIG.backupDir}`);
    
    // 2. 使用固定时间戳的模拟数据
    console.log('\n使用模拟数据进行测试...');
    const timestamp = new Date('2025-03-04T12:00:00.000Z');
    const { data } = { ...mockData };
    data.date = timestamp.toISOString();
    data.created = timestamp.toISOString();
    data.updated = timestamp.toISOString();
    data.created_at = timestamp.getTime();
    data.updated_at = timestamp.getTime();
    
    // 3. 保存数据
    const date = data.date.split('T')[0];
    await saveData(data, date);
    
    // 4. 模拟主数据丢失
    console.log('\n模拟主数据丢失...');
    const mainFile = path.join(CONFIG.dataDir, `${date}.json${CONFIG.compressionEnabled ? '.gz' : ''}`);
    await fs.promises.unlink(mainFile);
    console.log(`已删除主数据文件: ${mainFile}`);
    
    // 5. 从备份恢复
    console.log('\n从备份恢复数据...');
    await restoreFromBackup(date);
    
    // 6. 清理旧数据
    console.log('\n清理旧数据...');
    await cleanupOldData();
    
    // 7. 验证恢复的数据
    console.log('\n验证恢复的数据:');
    const extension = CONFIG.compressionEnabled ? '.gz' : '';
    const savedFilePath = path.join(CONFIG.dataDir, `${date}.json${extension}`);
    const savedData = await readData(savedFilePath);
    
    console.log(`- 文件大小: ${(await fs.promises.stat(savedFilePath)).size} 字节`);
    console.log(`  日期: ${savedData.date}`);
    console.log(`  新闻条数: ${savedData.news.length}`);
    console.log(`  更新时间: ${savedData.updated}`);
    console.log(`  新闻内容:`);
    savedData.news.forEach((news: string, index: number) => {
      console.log(`    ${index + 1}. ${news}`);
    });
    
    console.log('\n测试完成');
    
  } catch (error) {
    console.error('测试过程中出错:', error);
  }
}

// 数据统计
interface DataStats {
  totalFiles: number;
  totalSize: number;
  oldestFile: string;
  newestFile: string;
  newsCount: number;
  averageNewsPerDay: number;
  compressionRatio: number;
  backupStatus: {
    total: number;
    synchronized: number;
    needSync: number;
  };
}

async function getDataStats(): Promise<DataStats> {
  const stats: DataStats = {
    totalFiles: 0,
    totalSize: 0,
    oldestFile: '',
    newestFile: '',
    newsCount: 0,
    averageNewsPerDay: 0,
    compressionRatio: 0,
    backupStatus: {
      total: 0,
      synchronized: 0,
      needSync: 0
    }
  };

  try {
    const files = await fs.promises.readdir(CONFIG.dataDir);
    stats.totalFiles = files.length;

    let totalUncompressedSize = 0;
    let totalCompressedSize = 0;
    let totalNews = 0;

    for (const file of files) {
      const filePath = path.join(CONFIG.dataDir, file);
      const fileStats = await fs.promises.stat(filePath);
      const fileDate = file.split('.')[0];

      // 更新文件统计
      stats.totalSize += fileStats.size;
      if (!stats.oldestFile || fileDate < stats.oldestFile) stats.oldestFile = fileDate;
      if (!stats.newestFile || fileDate > stats.newestFile) stats.newestFile = fileDate;

      // 读取数据统计新闻数量
      const data = await readData(filePath);
      totalNews += data.news.length;

      // 计算压缩比
      if (CONFIG.compressionEnabled) {
        const uncompressed = JSON.stringify(data);
        totalUncompressedSize += uncompressed.length;
        totalCompressedSize += fileStats.size;
      }
    }

    stats.newsCount = totalNews;
    stats.averageNewsPerDay = totalNews / stats.totalFiles;
    if (CONFIG.compressionEnabled && totalUncompressedSize > 0) {
      stats.compressionRatio = totalCompressedSize / totalUncompressedSize;
    }

    // 检查备份状态
    const backupFiles = await fs.promises.readdir(CONFIG.backupDir);
    stats.backupStatus.total = files.length;
    stats.backupStatus.synchronized = backupFiles.length;
    stats.backupStatus.needSync = files.length - backupFiles.length;

    return stats;
  } catch (error) {
    console.error('获取数据统计失败:', error);
    throw error;
  }
}

// 数据导出
type ExportFormat = 'csv' | 'json' | 'markdown';

async function exportData(format: ExportFormat, startDate?: string, endDate?: string): Promise<string> {
  try {
    const files = await fs.promises.readdir(CONFIG.dataDir);
    const allData = [];

    for (const file of files) {
      const fileDate = file.split('.')[0];
      if (startDate && fileDate < startDate) continue;
      if (endDate && fileDate > endDate) continue;

      const filePath = path.join(CONFIG.dataDir, file);
      const data = await readData(filePath);
      allData.push(data);
    }

    const exportDir = path.join(process.cwd(), 'exports');
    await fs.promises.mkdir(exportDir, { recursive: true });
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const exportPath = path.join(exportDir, `60s-news-${timestamp}.${format}`);

    let content = '';
    switch (format) {
      case 'json':
        content = JSON.stringify(allData, null, 2);
        break;
      case 'csv':
        content = 'Date,News\n';
        allData.forEach(data => {
          content += `${data.date},"${(data.news as string[]).join('|')}"\n`;
        });
        break;
      case 'markdown':
        content = '# 每天60秒读懂世界新闻汇总\n\n';
        allData.forEach(data => {
          content += `## ${data.date}\n\n`;
          (data.news as string[]).forEach((news: string) => {
            content += `- ${news}\n`;
          });
          content += '\n';
        });
        break;
    }

    await fs.promises.writeFile(exportPath, content, 'utf-8');
    return exportPath;
  } catch (error) {
    console.error('导出数据失败:', error);
    throw error;
  }
}

// 数据查询
interface QueryOptions {
  startDate?: string;
  endDate?: string;
  keyword?: string;
}

async function queryData(options: QueryOptions): Promise<any[]> {
  try {
    const files = await fs.promises.readdir(CONFIG.dataDir);
    const results = [];

    for (const file of files) {
      const fileDate = file.split('.')[0];
      if (options.startDate && fileDate < options.startDate) continue;
      if (options.endDate && fileDate > options.endDate) continue;

      const filePath = path.join(CONFIG.dataDir, file);
      const data = await readData(filePath);

      if (options.keyword) {
        const matchedNews = (data.news as string[]).filter((news: string) => 
          news.toLowerCase().includes(options.keyword!.toLowerCase())
        );
        if (matchedNews.length > 0) {
          results.push({
            date: data.date,
            news: matchedNews
          });
        }
      } else {
        results.push(data);
      }
    }

    return results;
  } catch (error) {
    console.error('查询数据失败:', error);
    throw error;
  }
}

// 数据完整性检查
interface IntegrityCheckResult {
  missingDates: string[];
  corruptedFiles: string[];
  backupMismatches: string[];
  totalChecked: number;
  status: 'ok' | 'warning' | 'error';
}

async function checkDataIntegrity(): Promise<IntegrityCheckResult> {
  const result: IntegrityCheckResult = {
    missingDates: [],
    corruptedFiles: [],
    backupMismatches: [],
    totalChecked: 0,
    status: 'ok'
  };

  try {
    const files = await fs.promises.readdir(CONFIG.dataDir);
    result.totalChecked = files.length;

    // 检查日期连续性
    const dates = files.map(f => f.split('.')[0]).sort();
    if (dates.length > 0) {
      const start = new Date(dates[0]);
      const end = new Date(dates[dates.length - 1]);
      const current = new Date(start);

      while (current <= end) {
        const dateStr = current.toISOString().split('T')[0];
        if (!dates.includes(dateStr)) {
          result.missingDates.push(dateStr);
        }
        current.setDate(current.getDate() + 1);
      }
    }

    // 检查文件完整性和备份一致性
    for (const file of files) {
      const mainPath = path.join(CONFIG.dataDir, file);
      const backupPath = path.join(CONFIG.backupDir, file);

      try {
        // 检查文件是否可读和格式是否正确
        const mainData = await readData(mainPath);
        if (!validateData(mainData)) {
          result.corruptedFiles.push(file);
          continue;
        }

        // 检查备份是否存在且内容一致
        if (fs.existsSync(backupPath)) {
          const backupData = await readData(backupPath);
          if (!compareNewsData(mainData, backupData, { strictMode: CONFIG.strictComparison })) {
            result.backupMismatches.push(file);
          }
        } else {
          result.backupMismatches.push(file);
        }
      } catch (error) {
        result.corruptedFiles.push(file);
      }
    }

    // 设置状态
    if (result.corruptedFiles.length > 0) {
      result.status = 'error';
    } else if (result.missingDates.length > 0 || result.backupMismatches.length > 0) {
      result.status = 'warning';
    }

    return result;
  } catch (error) {
    console.error('检查数据完整性失败:', error);
    throw error;
  }
}

// 自动修复
interface RepairResult {
  repairedFiles: string[];
  failedFiles: string[];
  restoredFromBackup: string[];
  totalRepaired: number;
}

async function autoRepair(): Promise<RepairResult> {
  const result: RepairResult = {
    repairedFiles: [],
    failedFiles: [],
    restoredFromBackup: [],
    totalRepaired: 0
  };

  try {
    // 获取完整性检查结果
    const integrityCheck = await checkDataIntegrity();

    // 处理损坏的文件
    for (const file of integrityCheck.corruptedFiles) {
      const date = file.split('.')[0];
      try {
        await restoreFromBackup(date);
        result.restoredFromBackup.push(file);
        result.totalRepaired++;
      } catch (error) {
        result.failedFiles.push(file);
      }
    }

    // 处理备份不一致的文件
    for (const file of integrityCheck.backupMismatches) {
      try {
        const mainPath = path.join(CONFIG.dataDir, file);
        const backupPath = path.join(CONFIG.backupDir, file);
        
        // 如果主文件存在且有效，更新备份
        if (fs.existsSync(mainPath)) {
          const data = await readData(mainPath);
          if (validateData(data)) {
            const date = file.split('.')[0];
            await saveData(data, date); // 这会同时更新主文件和备份
            result.repairedFiles.push(file);
            result.totalRepaired++;
          }
        }
      } catch (error) {
        result.failedFiles.push(file);
      }
    }

    return result;
  } catch (error) {
    console.error('自动修复失败:', error);
    throw error;
  }
}

// 添加清理函数
async function cleanupTestData(): Promise<void> {
  try {
    // 清理数据目录
    if (fs.existsSync(CONFIG.dataDir)) {
      const files = await fs.promises.readdir(CONFIG.dataDir);
      for (const file of files) {
        await fs.promises.unlink(path.join(CONFIG.dataDir, file));
      }
    }
    
    // 清理备份目录
    if (fs.existsSync(CONFIG.backupDir)) {
      const files = await fs.promises.readdir(CONFIG.backupDir);
      for (const file of files) {
        await fs.promises.unlink(path.join(CONFIG.backupDir, file));
      }
    }
    
    console.log('测试数据已清理');
  } catch (error) {
    console.error('清理测试数据失败:', error);
    throw error;
  }
}

// 修改测试函数
async function testAllFeatures() {
  try {
    console.log('=== 开始测试所有功能 ===');
    
    // 0. 清理测试数据
    console.log('\n=== 清理测试数据 ===');
    await cleanupTestData();
    
    // 1. 基础数据保存测试
    await testDataSaving();
    
    // 2. 测试数据统计
    console.log('\n=== 测试数据统计 ===');
    const stats = await getDataStats();
    console.log('数据统计结果:', JSON.stringify(stats, null, 2));
    
    // 3. 测试数据导出
    console.log('\n=== 测试数据导出 ===');
    const exportPath = await exportData('markdown');
    console.log('数据已导出到:', exportPath);
    
    // 4. 测试数据查询
    console.log('\n=== 测试数据查询 ===');
    const queryResults = await queryData({ keyword: '测试新闻' });
    console.log('查询结果:', queryResults);
    
    // 5. 测试数据完整性检查
    console.log('\n=== 测试数据完整性检查 ===');
    const integrityResult = await checkDataIntegrity();
    console.log('完整性检查结果:', JSON.stringify(integrityResult, null, 2));
    
    // 6. 测试自动修复
    console.log('\n=== 测试自动修复 ===');
    const repairResult = await autoRepair();
    console.log('修复结果:', JSON.stringify(repairResult, null, 2));
    
    console.log('\n所有测试完成');
    
  } catch (error) {
    console.error('测试过程中出错:', error);
  }
}

// 运行测试
testAllFeatures(); 