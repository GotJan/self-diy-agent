import { tool } from '@langchain/core/tools';
import { z } from 'zod';

// 时间查询工具
export const currentTimeTool = tool(
  () => {
    const now = new Date();
    return {
      currentTime: now.toLocaleString('zh-CN'),
      timestamp: now.toISOString(),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    };
  },
  {
    name: 'current_time',
    description: '获取当前的日期和时间',
    schema: z.object({}),
  }
);
