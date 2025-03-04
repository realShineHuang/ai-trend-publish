import {
  ContentScraper,
  ScrapedContent,
} from "../scrapers/interfaces/scraper.interface";
import { ContentSummarizer } from "../summarizer/interfaces/summarizer.interface";
import { ContentPublisher } from "../publishers/interfaces/publisher.interface";
import { WeixinPublisher } from "../publishers/weixin.publisher";
import { DeepseekAISummarizer } from "../summarizer/deepseek-ai.summarizer";
import { BarkNotifier } from "../utils/bark.notify";
import dotenv from "dotenv";
import { TwitterScraper } from "../scrapers/twitter.scraper";
import { FireCrawlScraper } from "../scrapers/fireCrawl.scraper";
import { getCronSources } from "../data-sources/getCronSources";
import cliProgress from "cli-progress";
import { WeixinTemplate } from "../render/interfaces/template.interface";
import { WeixinTemplateRenderer } from "../render/weixin/renderer";
import { AliWanX21ImageGenerator } from "../utils/gen-image/aliwanx2.1.image";
import { DeepseekAPI } from "../api/deepseek.api";
import { ContentRanker, RankResult } from "../utils/content-rank/content-ranker";
import { QianwenAISummarizer } from "../summarizer/qianwen-ai.summarizer";
import { ConfigManager } from "../utils/config/config-manager";
import { Workflow } from "./interfaces/workflow.interface";

dotenv.config();

export class WeixinWorkflow implements Workflow {
  protected scraper: Map<string, ContentScraper>;
  protected summarizer: ContentSummarizer;
  protected publisher: ContentPublisher;
  protected notifier: BarkNotifier;
  protected renderer: WeixinTemplateRenderer;
  protected imageGenerator: AliWanX21ImageGenerator;
  protected deepSeekClient: DeepseekAPI;
  protected stats = {
    success: 0,
    failed: 0,
    contents: 0,
  };

  constructor() {
    this.scraper = new Map<string, ContentScraper>();
    this.scraper.set("fireCrawl", new FireCrawlScraper());
    this.scraper.set("twitter", new TwitterScraper());
    this.summarizer = new QianwenAISummarizer();
    this.publisher = new WeixinPublisher();
    this.notifier = new BarkNotifier();
    this.renderer = new WeixinTemplateRenderer();
    this.imageGenerator = new AliWanX21ImageGenerator();
    this.deepSeekClient = new DeepseekAPI();
  }

  async refresh(): Promise<{ date: string } | null> {
    await this.notifier.refresh();
    await this.summarizer.refresh();
    await this.publisher.refresh();
    await this.scraper.get("fireCrawl")?.refresh();
    await this.scraper.get("twitter")?.refresh();
    await this.imageGenerator.refresh();
    await this.deepSeekClient.refresh();
    return null;
  }

  protected async scrapeSource(
    type: string,
    source: { identifier: string },
    scraper: ContentScraper
  ): Promise<ScrapedContent[]> {
    try {
      console.log(`[${type}] 抓取: ${source.identifier}`);
      const contents = await scraper.scrape(source.identifier);
      this.stats.success++;
      return contents;
    } catch (error) {
      this.stats.failed++;
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[${type}] ${source.identifier} 抓取失败:`, message);
      await this.notifier.warning(
        `${type}抓取失败`,
        `源: ${source.identifier}\n错误: ${message}`
      );
      return [];
    }
  }

  protected async processContent(content: ScrapedContent): Promise<void> {
    try {
      const summary = await this.summarizer.summarize(JSON.stringify(content));
      content.title = summary.title;
      content.content = summary.content;
      content.score = summary.score;
      content.metadata.keywords = summary.keywords;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[内容处理] ${content.id} 处理失败:`, message);
      await this.notifier.warning(
        "内容处理失败",
        `ID: ${content.id}\n保留原始内容`
      );
      content.title = content.title || "无标题";
      content.content = content.content || "内容处理失败";
      content.metadata.keywords = content.metadata.keywords || [];
    }
  }

  protected async generateAndPublishContent(contents: ScrapedContent[]): Promise<void> {
    // 5. 生成并发布
    console.log("\n[模板生成] 生成微信文章");
    const templateData: WeixinTemplate[] = contents.map((content) => ({
      id: content.id,
      title: content.title,
      content: content.content,
      url: content.url,
      publishDate: content.publishDate,
      metadata: content.metadata,
      keywords: content.metadata.keywords,
    }));

    // 将所有标题总结成一个标题，然后让AI生成一个最具有吸引力的标题
    const summaryTitle = await this.summarizer.generateTitle(
      contents.map((content) => content.title).join(" | ")
    ).then((title) => {
      // 限制标题长度 为 64 个字符
      return title.slice(0, 64);
    });

    console.log(`[标题生成] 生成标题: ${summaryTitle}`);

    // 生成封面图片
    const taskId = await this.imageGenerator
      .generateImage("AI新闻日报的封面", "1440*768")
      .then((res) => res.output.task_id);
    console.log(`[封面图片] 封面图片生成任务ID: ${taskId}`);
    const imageUrl = await this.imageGenerator
      .waitForCompletion(taskId)
      .then((res) => res.results?.[0]?.url)
      .then((url) => {
        if (!url) {
          return "";
        }
        return url;
      });

    // 上传封面图片
    const mediaId = await this.publisher.uploadImage(imageUrl);

    const renderedTemplate = this.renderer.render(templateData);
    console.log("[发布] 发布到微信公众号");
    const publishResult = await this.publisher.publish(
      renderedTemplate,
      `${new Date().toLocaleDateString()} AI速递 | ${summaryTitle}`,
      summaryTitle,
      mediaId
    );

    // 5. 完成报告
    const summary = `
      工作流执行完成
      - 数据源: ${contents.length} 个
      - 成功: ${this.stats.success} 个
      - 失败: ${this.stats.failed} 个
      - 内容: ${this.stats.contents} 条
      - 发布: ${publishResult.status}`.trim();

    console.log(`=== ${summary} ===`);

    if (this.stats.failed > 0) {
      await this.notifier.warning("工作流完成(部分失败)", summary);
    } else {
      await this.notifier.success("工作流完成", summary);
    }
  }

  async process(): Promise<void> {
    try {
      console.log("=== 开始执行微信工作流 ===");
      await this.notifier.info("工作流开始", "开始执行内容抓取和处理");

      // 检查 API 额度
      const deepSeekBalance = await this.deepSeekClient.getCNYBalance();
      console.log("DeepSeek余额：", deepSeekBalance);
      if (deepSeekBalance < 1.0) {
        this.notifier.warning("DeepSeek", "余额小于一元");
      }

      // 1. 获取数据源
      const sourceConfigs = await getCronSources();

      const sourceIds = sourceConfigs.AI;
      const totalSources =
        sourceIds.firecrawl.length + sourceIds.twitter.length;
      console.log(`[数据源] 发现 ${totalSources} 个数据源`);

      const progress = new cliProgress.SingleBar(
        {},
        cliProgress.Presets.shades_classic
      );
      progress.start(totalSources, 0);
      let currentProgress = 0;

      // 2. 抓取内容
      const allContents: ScrapedContent[] = [];

      // FireCrawl sources
      const fireCrawlScraper = this.scraper.get("fireCrawl");
      if (!fireCrawlScraper) throw new Error("FireCrawlScraper not found");

      for (const source of sourceIds.firecrawl) {
        const contents = await this.scrapeSource(
          "FireCrawl",
          source,
          fireCrawlScraper
        );
        allContents.push(...contents);
        progress.update(++currentProgress);
      }

      // Twitter sources
      const twitterScraper = this.scraper.get("twitter");
      if (!twitterScraper) throw new Error("TwitterScraper not found");

      for (const source of sourceIds.twitter) {
        const contents = await this.scrapeSource(
          "Twitter",
          source,
          twitterScraper
        );
        allContents.push(...contents);
        progress.update(++currentProgress);
      }
      progress.stop();

      this.stats.contents = allContents.length;
      if (this.stats.contents === 0) {
        const message = "未获取到任何内容";
        console.error(`[工作流] ${message}`);
        await this.notifier.error("工作流终止", message);
        return;
      }

      // 3. 内容排序
      console.log(`[内容排序] 开始排序 ${allContents.length} 条内容`);
      let rankedContents: RankResult[] = [];
      try {
        const configManager = ConfigManager.getInstance();
        const ranker = new ContentRanker({
          provider: "deepseek",
          apiKey: await configManager.get("DEEPSEEK_API_KEY") as string,
          modelName: "deepseek-reasoner"
        });
        rankedContents = await ranker.rankContents(allContents);

        console.log("内容排序完成", rankedContents);
      } catch (error) {
        console.error("内容排序失败:", error);
        await this.notifier.error("内容排序失败", "请检查API额度");
      }

      // 分数更新
      console.log(`[分数更新] 开始更新 ${allContents.length} 条内容`);
      if (rankedContents.length > 0) {
        for (const content of allContents) {
          const rankedContent = rankedContents.find(
            (ranked) => ranked.id === content.id
          );
          if (rankedContent) {
            content.score = rankedContent.score;
          }
        }
      }

      // 按照score排序
      allContents.sort((a, b) => b.score - a.score);

      // 只取前10条内容进行处理
      const topContents = allContents.slice(0, 10);

      // 4. 内容处理 (只处理排序后的前10条)
      console.log(`\n[内容处理] 处理排序后的前 ${topContents.length} 条内容`);
      const summaryProgress = new cliProgress.SingleBar(
        {},
        cliProgress.Presets.shades_classic
      );
      summaryProgress.start(topContents.length, 0);

      // 批量处理内容
      const batchSize = 1;
      for (let i = 0; i < topContents.length; i += batchSize) {
        const batch = topContents.slice(i, i + batchSize);
        await Promise.all(
          batch.map(async (content) => {
            await this.processContent(content);
            summaryProgress.increment();
          })
        );
      }
      summaryProgress.stop();

      // 5. 生成并发布
      await this.generateAndPublishContent(topContents);
      
    } catch (error) {
      console.error("工作流执行失败:", error);
      throw error;
    }
  }
}
