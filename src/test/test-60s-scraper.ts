import { SixtySecondsScraper } from "../scrapers/60s.scraper";

async function main() {
  console.log("开始测试60秒抓取器...");
  
  const scraper = new SixtySecondsScraper();
  
  try {
    // 验证配置
    await scraper.validateConfig();
    
    // 刷新
    await scraper.refresh();
    
    // 抓取数据
    console.log("抓取数据...");
    const contents = await scraper.scrape("60s");
    
    console.log(`抓取到 ${contents.length} 条内容`);
    console.log("第一条内容:", JSON.stringify(contents[0], null, 2));
    
    console.log("测试完成！");
  } catch (error) {
    console.error("测试失败:", error);
  }
}

main().catch(console.error); 