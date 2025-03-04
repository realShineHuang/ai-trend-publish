/// <reference types="jest" />

// 这个文件用于设置 Jest 测试环境
// 不需要额外的类型声明，因为 @types/jest 已经提供了全局类型 

import { jest } from '@jest/globals';

declare global {
  namespace NodeJS {
    interface Global {
      jest: typeof jest;
    }
  }
} 