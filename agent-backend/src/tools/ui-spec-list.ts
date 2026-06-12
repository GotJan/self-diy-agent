/**
 * get_ui_specs —— 查看当前所有 UI spec 组件列表
 */

import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import fs from 'fs';
import path from 'path';
import { SPECS_DIR, extractDataSchema } from './utils.js';

export const getUiSpecsTool = tool(
  () => {
    if (!fs.existsSync(SPECS_DIR)) {
      return { count: 0, specs: [], dir: SPECS_DIR };
    }

    const files = fs.readdirSync(SPECS_DIR)
      .filter((f) => f.endsWith('.json'))
      .map((f) => {
        const filePath = path.join(SPECS_DIR, f);
        const stat = fs.statSync(filePath);
        const name = f.replace('.json', '');
        try {
          const content = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
          const data = content.data || { root: content.root, elements: content.elements };
          const elements = data?.elements;
          return {
            name,
            file: f,
            displayName: content.displayName || name,
            root: data.root || null,
            elementCount: elements ? Object.keys(elements).length : 0,
            dataSchema: extractDataSchema(elements),
            size: stat.size,
            modified: stat.mtime.toISOString(),
          };
        } catch {
          return {
            name,
            file: f,
            error: 'Invalid JSON',
            size: stat.size,
            modified: stat.mtime.toISOString(),
          };
        }
      });

    return {
      count: files.length,
      dir: SPECS_DIR,
      specs: files,
    };
  },
  {
    name: 'get_ui_specs',
    description: '查看当前所有已创建的 UI spec 组件列表，包括名称、元素数量、文件大小、修改时间。',
    schema: z.object({}),
  }
);
