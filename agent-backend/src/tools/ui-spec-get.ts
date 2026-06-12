/**
 * get_ui_data —— 获取单个 UI spec 组件的完整数据内容
 */

import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import fs from 'fs';
import path from 'path';
import { SPECS_DIR, sanitizeName, listAvailableSpecs, extractDataSchema } from './utils.js';

export const getUiDataTool = tool(
  ({ name }) => {
    const safeName = sanitizeName(name);
    const filePath = path.join(SPECS_DIR, `${safeName}.json`);

    if (!fs.existsSync(filePath)) {
      return { error: `UI spec '${safeName}' not found`, availableSpecs: listAvailableSpecs() };
    }

    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const parsed = JSON.parse(content);

      // 提取 data：优先从 data 字段取，兼容旧格式
      const specData = parsed.data || { root: parsed.root, elements: parsed.elements };
      const elements = specData.elements;

      return {
        name: safeName,
        displayName: parsed.displayName || safeName,
        description: parsed.description || '',
        file: `${safeName}.json`,
        dataSchema: extractDataSchema(elements),
        data: specData,
      };
    } catch (err: any) {
      return { error: `Failed to read spec: ${err.message}` };
    }
  },
  {
    name: 'get_ui_data',
    description: '获取指定 UI spec 组件的完整 JSON 数据内容，包括 root 和 elements。',
    schema: z.object({
      name: z.string().describe('UI spec 名称（不含 .json 后缀），如 "tool-settings"'),
    }),
  }
);
