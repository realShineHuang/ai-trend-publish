import cron from "node-cron";
import { WeixinWorkflow } from "../services/weixin-article.workflow";
import { Workflow } from "../services/interfaces/workflow.interface";
import { WeixinAIBenchWorkflow } from "../services/weixin-aibench.workflow";
import { WeixinHelloGithubWorkflow } from "../services/weixin-hellogithub.workflow";
import { PersonalWorkflow } from "../services/personal-workflow";

// 工作流映射表，用于存储不同日期对应的工作流
const workflowMap = new Map<number, Workflow>();

// 记录最后更新的日期
let lastUpdateDate: string | null = null;

// 检查是否需要更新
const needsUpdate = (currentDate: string) => {
  if (!lastUpdateDate) return true;
  return currentDate > lastUpdateDate;
};

// 更新日期记录
const updateLastDate = (date: string) => {
  lastUpdateDate = date;
  console.log(`更新记录日期为: ${date}`);
};

// 初始化工作流映射
const initializeWorkflows = () => {
  // 每天使用《每天 60 秒读懂世界》工作流
  for (let i = 1; i <= 7; i++) {
    workflowMap.set(i, new PersonalWorkflow());
  }
};

// 执行工作流
const executeWorkflow = async (workflow: Workflow, dayOfWeek: number, description: string) => {
  try {
    // 先获取数据但不处理
    const refreshResult = await workflow.refresh();
    
    // 检查数据日期
    if (refreshResult && refreshResult.date) {
      console.log(`${description} - 发现新数据，日期: ${refreshResult.date}`);
      await workflow.process();
      updateLastDate(refreshResult.date);
      return true;
    } else {
      console.log(`${description} - 无需更新，当前数据日期: ${refreshResult?.date}, 最后更新日期: ${lastUpdateDate}`);
      return false;
    }
  } catch (error) {
    console.error(`${description} - 执行失败:`, error);
    return false;
  }
};

export const startCronJobs = async () => {
  console.log("初始化《每天 60 秒读懂世界》定时任务...");
  initializeWorkflows();

  // 每天 23:59 尝试获取数据
  cron.schedule(
    "59 23 * * *",
    async () => {
      const now = new Date();
      const dayOfWeek = now.getDay();
      const adjustedDay = dayOfWeek === 0 ? 7 : dayOfWeek;

      const workflow = workflowMap.get(adjustedDay);
      if (workflow) {
        await executeWorkflow(workflow, adjustedDay, "23:59 尝试");
      }
    },
    {
      timezone: "Asia/Shanghai",
    }
  );

  // 零点准时尝试
  cron.schedule(
    "0 0 * * *",
    async () => {
      const now = new Date();
      const dayOfWeek = now.getDay();
      const adjustedDay = dayOfWeek === 0 ? 7 : dayOfWeek;

      const workflow = workflowMap.get(adjustedDay);
      if (workflow) {
        await executeWorkflow(workflow, adjustedDay, "00:00 准时尝试");
      }
    },
    {
      timezone: "Asia/Shanghai",
    }
  );

  // 每小时的第 0 分钟和第 30 分钟执行
  cron.schedule(
    "0,30 * * * *",
    async () => {
      const now = new Date();
      const dayOfWeek = now.getDay();
      const adjustedDay = dayOfWeek === 0 ? 7 : dayOfWeek;
      const hour = now.getHours();
      const minute = now.getMinutes();

      const workflow = workflowMap.get(adjustedDay);
      if (workflow) {
        await executeWorkflow(workflow, adjustedDay, `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')} 定时尝试`);
      }
    },
    {
      timezone: "Asia/Shanghai",
    }
  );

  // 每 5 分钟尝试一次
  cron.schedule(
    "*/5 * * * *",
    async () => {
      const now = new Date();
      const dayOfWeek = now.getDay();
      const adjustedDay = dayOfWeek === 0 ? 7 : dayOfWeek;
      const hour = now.getHours();
      const minute = now.getMinutes();

      // 跳过整点和半点，因为已经由上面的任务处理
      if (minute === 0 || minute === 30) {
        return;
      }

      const workflow = workflowMap.get(adjustedDay);
      if (workflow) {
        await executeWorkflow(workflow, adjustedDay, `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')} 轮询尝试`);
      }
    },
    {
      timezone: "Asia/Shanghai",
    }
  );
};
