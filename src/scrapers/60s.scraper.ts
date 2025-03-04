import { ContentScraper, ScrapedContent } from "./interfaces/scraper.interface";
import axios from "axios";

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

export class SixtySecondsScraper implements ContentScraper {
  private apiUrl = "https://api.60s.viki.moe/60s";
  private useMockData = true; // 使用模拟数据进行测试

  async validateConfig(): Promise<boolean> {
    return true; // 不需要特殊配置验证
  }

  async refresh(): Promise<void> {
    // 无需特殊刷新
  }

  async scrape(identifier: string): Promise<ScrapedContent[]> {
    try {
      let data: SixtySecondsResponse['data'];
      
      if (this.useMockData) {
        // 使用模拟数据
        data = {
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
          link: "https://example.com",
          created: new Date().toISOString(),
          created_at: Date.now(),
          updated: new Date().toISOString(),
          updated_at: Date.now()
        };
      } else {
        // 从API获取数据
        const response = await axios.get<SixtySecondsResponse>(this.apiUrl);
        
        if (response.data.code !== 200) {
          throw new Error(response.data.message);
        }

        data = response.data.data;
      }
      
      // 将每条新闻转换为一个内容项
      return data.news.map((newsItem, index) => ({
        id: `60s-${data.date}-${index}`,
        title: `每天60秒读懂世界 - ${data.date.split('T')[0]}`,
        content: newsItem,
        url: data.link,
        publishDate: new Date(data.date).toISOString(),
        source: {
          name: "每天60秒读懂世界",
          url: data.link
        },
        metadata: {
          keywords: [],
          summary: data.tip,
          cover: data.cover,
          audio: data.audio.news
        },
        score: 1 // 默认分数
      }));
    } catch (error) {
      console.error("获取《每天 60 秒读懂世界》数据失败:", error);
      throw error;
    }
  }
} 