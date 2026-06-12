/**
 * delete_ui_spec —— 删除 UI spec 组件
 */

import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import fs from 'fs';
import path from 'path';
import { SPECS_DIR, sanitizeName, listAvailableSpecs } from './utils.js';
import { notifySpecChanged } from './events.js';

export const deleteUiSpecTool = tool(
  ({ name }) => {
    const safeName = sanitizeName(name);
    const filePath = path.join(SPECS_DIR, `${safeName}.json`);

    if (!fs.existsSync(filePath)) {
      return {
        success: false,
        error: `UI spec '${safeName}' 不存在。可用: ${listAvailableSpecs().join(', ') || '(无)'}`,
      };
    }

    // 删除前读取元数据，方便 LLM 确认
    let deletedInfo = '';
    try {
      const content = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      const els = content.data?.elements || content.elements;
      deletedInfo = `displayName="${content.displayName || safeName}", ${els ? Object.keys(els).length : 0} 个元素`;
    } catch {}

    fs.unlinkSync(filePath);
    notifySpecChanged();

    return {
      success: true,
      name: safeName,
      deletedInfo,
      message: `UI spec '${safeName}' (${deletedInfo}) 已删除。`,
    };
  },
  {
    name: 'delete_ui_spec',
    description:
      '删除指定的 UI spec 组件文件。删除前会读取元数据确认。\n' +
      '⚠️ 操作不可逆，请先通过 get_ui_data 或 get_ui_specs 确认要删除的 spec。',
    schema: z.object({
      name: z.string().describe('要删除的 spec 名称（不含 .json 后缀），如 "user-card"'),
    }),
  }
);
