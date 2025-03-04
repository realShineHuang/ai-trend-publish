export interface Workflow {
  /**
   * 刷新工作流所需的资源和配置，并返回最新数据
   */
  refresh(): Promise<void>;

  /**
   * 执行工作流的主要处理逻辑
   */
  process(): Promise<void>;
}
