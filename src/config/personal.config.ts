import type { NewsType, NewsPlatform } from "../data-sources/getCronSources";

interface SourceItem {
  identifier: string;
}

interface PlatformSources {
  firecrawl: SourceItem[];
  twitter: SourceItem[];
}

type SourceConfig = Record<NewsType, PlatformSources>;

export const personalSourceConfigs: SourceConfig = {
  AI: {
    firecrawl: [
      { identifier: "https://api.60s.viki.moe/60s" }
    ],
    twitter: [],
  },
  Tech: {
    firecrawl: [],
    twitter: [],
  },
  Crypto: {
    firecrawl: [],
    twitter: [],
  },
  All: {
    firecrawl: [],
    twitter: [],
  },
};

// 自定义工作流配置
export const personalWorkflowConfig = {
  // 内容处理配置
  contentProcessing: {
    batchSize: 1,
    maxContents: 10,
    minScore: 0.6
  },
  
  // AI 模型配置
  ai: {
    summarizer: {
      provider: "qianwen", // 或 "deepseek"
      model: "qwen-max",   // 模型名称
    },
    imageGenerator: {
      provider: "aliwanx2.1",
      style: "modern",
    },
  },
  
  // 发布配置
  publishing: {
    schedule: "0 3 * * *", // 每天凌晨3点
    timezone: "Asia/Shanghai",
    maxRetries: 3,
  },

  dataRetention: {
    days: 7
  }
}; 