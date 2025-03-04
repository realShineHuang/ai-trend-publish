import axios from "axios";
import * as fs from 'fs';
import * as path from 'path';
import * as zlib from 'zlib';
import { promisify } from 'util';

// 压缩函数
const gzip = promisify(zlib.gzip);

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

async function main() {
  console.log("开始测试60秒数据获取和保存...");
  
  const dataDir = path.join(process.cwd(), 'data', '60s');
  const backupDir = path.join(process.cwd(), 'data', '60s-backup');
  
  // 确保数据目录存在
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  
  // 确保备份目录存在
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }
  
  try {
    console.log("获取60秒数据...");
    // 使用模拟数据进行测试
    const mockData = {
      code: 200,
      message: "success",
      data: {
        date: "2025-03-04T15:05:08.646Z",
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
        link: "https://example.com",
        created: "2025-03-04T15:05:08.646Z",
        created_at: 1709564708646,
        updated: "2025-03-04T15:05:08.647Z",
        updated_at: 1709564708647
      }
    };
    
    // 保存数据到文件
    const date = mockData.data.date.split('T')[0]; // 从日期时间字符串中提取日期部分
    const filePath = path.join(dataDir, `${date}.json.gz`);
    const backupPath = path.join(backupDir, `${date}.json.gz`);
    
    // 压缩数据
    const compressedData = await gzip(JSON.stringify(mockData.data));
    
    // 保存到主数据目录
    await fs.promises.writeFile(filePath, compressedData);
    console.log(`数据已保存到: ${filePath}`);
    
    // 保存到备份目录
    await fs.promises.writeFile(backupPath, compressedData);
    console.log(`备份已保存到: ${backupPath}`);
    
    // 清理旧数据（保留7天）
    console.log("清理旧数据...");
    const now = new Date();
    const files = fs.readdirSync(dataDir);
    for (const file of files) {
      if (!file.endsWith('.json.gz')) continue;
      
      const fileDateStr = file.split('.')[0]; // 获取文件名中的日期部分
      const fileDate = new Date(fileDateStr);
      const diffDays = Math.floor((now.getTime() - fileDate.getTime()) / (1000 * 60 * 60 * 24));
      
      if (diffDays > 7) {
        const oldFilePath = path.join(dataDir, file);
        fs.unlinkSync(oldFilePath);
        console.log(`已删除过期文件: ${oldFilePath}`);
      }
    }
    
    // 验证保存的数据
    console.log("验证保存的数据...");
    const savedData = await fs.promises.readFile(filePath);
    const uncompressedData = zlib.gunzipSync(savedData).toString();
    const parsedData = JSON.parse(uncompressedData);
    
    console.log("文件大小:", savedData.length, "字节");
    console.log("日期:", parsedData.date);
    console.log("新闻数量:", parsedData.news.length);
    console.log("更新时间:", parsedData.updated);
    console.log("新闻内容:", parsedData.news);
    
    console.log("测试完成！");
  } catch (error) {
    console.error("测试失败:", error);
  }
}

main().catch(console.error); 