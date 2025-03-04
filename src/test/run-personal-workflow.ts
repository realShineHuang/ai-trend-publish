import { PersonalWorkflow } from "../services/personal-workflow";

async function main() {
  console.log("开始测试个人工作流...");
  
  const workflow = new PersonalWorkflow();
  
  try {
    console.log("刷新工作流...");
    const result = await workflow.refresh();
    console.log("刷新结果:", result);
    
    if (result) {
      console.log("处理工作流...");
      await workflow.process();
      console.log("工作流处理完成");
    } else {
      console.log("没有新数据，跳过处理");
    }
  } catch (error) {
    console.error("工作流执行失败:", error);
  }
}

main().catch(console.error); 