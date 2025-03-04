import { WeixinWorkflow } from "./weixin-article.workflow";
import { personalSourceConfigs, personalWorkflowConfig } from "../config/personal.config";
import { ContentScraper, ScrapedContent } from "../scrapers/interfaces/scraper.interface";
import { ContentRanker, RankResult } from "../utils/content-rank/content-ranker";
import { ConfigManager } from "../utils/config/config-manager";
import { SixtySecondsScraper } from "../scrapers/60s.scraper";
import axios from "axios";
import * as fs from 'fs';
import * as path from 'path';

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

export class PersonalWorkflow extends WeixinWorkflow {
  private readonly dataDir = path.join(process.cwd(), 'data', '60s');

  constructor() {
    super();
    // 替换默认的 FireCrawl 抓取器为《每天 60 秒读懂世界》抓取器
    this.scraper.set("fireCrawl", new SixtySecondsScraper());
    // 确保数据目录存在
    this.ensureDataDir();
  }

  private ensureDataDir(): void {
    if (!fs.existsSync(this.dataDir)) {
      fs.mkdirSync(this.dataDir, { recursive: true });
    }
  }

  private async saveDataToFile(data: SixtySecondsResponse['data']): Promise<void> {
    const date = data.date.split('T')[0]; // 从日期时间字符串中提取日期部分
    const filePath = path.join(this.dataDir, `${date}.json`);
    
    try {
      await fs.promises.writeFile(
        filePath,
        JSON.stringify(data, null, 2),
        'utf-8'
      );
      console.log(`数据已保存到: ${filePath}`);
    } catch (error) {
      console.error('保存数据到文件时出错:', error);
      throw error;
    }
  }

  async refresh(): Promise<{ date: string } | null> {
    await super.refresh();
    
    // 获取60秒新闻抓取器
    const scraper = this.scraper.get("fireCrawl") as SixtySecondsScraper;
    if (!scraper) {
      return null;
    }

    try {
      // 抓取数据
      const response = await axios.get<SixtySecondsResponse>("https://api.60s.viki.moe/60s");
      
      if (response.data.code !== 200) {
        throw new Error(response.data.message);
      }

      const { data } = response.data;
      // 保存数据到本地文件
      await this.saveDataToFile(data);
      
      // 使用 updated 时间作为判断依据
      return { date: data.updated };
    } catch (error) {
      console.error("获取《每天 60 秒读懂世界》数据失败:", error);
    }
    
    return null;
  }

  async process(): Promise<void> {
    try {
      console.log("=== 开始执行《每天 60 秒读懂世界》工作流 ===");
      
      // 使用个性化配置的数据源
      const sourceConfigs = personalSourceConfigs;
      
      // 获取内容
      const allContents: ScrapedContent[] = [];
      
      // 使用配置的批处理大小
      const batchSize = personalWorkflowConfig.contentProcessing.batchSize;
      
      // 内容排序
      const configManager = ConfigManager.getInstance();
      const ranker = new ContentRanker({
        provider: "deepseek", // 固定使用 deepseek
        apiKey: await configManager.get("DEEPSEEK_API_KEY") as string,
        modelName: "deepseek-reasoner"
      });
      
      // 只处理分数高于阈值的内容
      const rankedContents = await ranker.rankContents(allContents);
      const filteredContents = allContents.filter(content => {
        const rank = rankedContents.find(r => r.id === content.id);
        return rank && rank.score >= personalWorkflowConfig.contentProcessing.minScore;
      });
      
      // 限制处理的内容数量
      const maxContents = personalWorkflowConfig.contentProcessing.maxContents;
      const topContents = filteredContents.slice(0, maxContents);
      
      // 处理内容
      for (let i = 0; i < topContents.length; i += batchSize) {
        const batch = topContents.slice(i, i + batchSize);
        await Promise.all(
          batch.map(async (content) => {
            await this.processContent(content);
          })
        );
      }
      
      // 生成并发布内容
      await this.generateAndPublishContent(topContents);
      
    } catch (error) {
      console.error("《每天 60 秒读懂世界》工作流执行失败:", error);
      throw error;
    }
  }

  protected async generateAndPublishContent(contents: ScrapedContent[]): Promise<void> {
    // 在这里实现您的发布逻辑
    // 可以覆盖原有的发布逻辑，或添加新的发布渠道
    await super.generateAndPublishContent(contents);
  }
} 