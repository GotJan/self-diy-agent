/**
 * list_spec_files —— 列出所有 UI spec 文件详情
 *
 * 同时提供 SPECS_DIR/sanitizeName/listAvailableSpecs 供其他 ui-spec-* 工具内部使用。
 */

import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// specs 放在 agent-backend/specs/ 下，保证 dev/prod 统一路径
// dev:  agent-backend/specs/
// prod: resources/agent-backend/specs/
export const SPECS_DIR = path.resolve(__dirname, '../../specs');

/** 统一的文件名清洗：英文下划线小写 */
export function sanitizeName(raw: string): string {
  return raw.replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase();
}

/** 列出所有可用的 spec 名称 */
export function listAvailableSpecs(): string[] {
  if (!fs.existsSync(SPECS_DIR)) return [];
  return fs.readdirSync(SPECS_DIR)
    .filter((f) => f.endsWith('.json'))
    .map((f) => f.replace('.json', ''));
}

/**
 * 从 elements 提取 dataSchema：每个元素的类型、props 键名及类型、children
 * 供 LLM 了解每个元素的 prop 接口，指导生成正确的 update_ui_data 参数。
 */
export function extractDataSchema(elements: Record<string, any> | undefined): Record<string, any> {
  if (!elements) return {};
  const schema: Record<string, any> = {};
  for (const [id, el] of Object.entries(elements)) {
    schema[id] = {
      type: el.type || '?',
      props: el.props
        ? Object.fromEntries(
            Object.entries(el.props).map(([k, v]) => [k, typeof v])
          )
        : {},
      children: el.children || [],
    };
  }
  return schema;
}

// ========== Tool ==========

export const listSpecFilesTool = tool(
  () => {
    try {
      if (!fs.existsSync(SPECS_DIR)) {
        return { count: 0, files: [], dir: SPECS_DIR };
      }

      const files = fs.readdirSync(SPECS_DIR)
        .filter((f) => f.endsWith('.json'))
        .map((f) => {
          const filePath = path.join(SPECS_DIR, f);
          const stat = fs.statSync(filePath);
          const name = sanitizeName(f.replace('.json', ''));
          try {
            const content = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
            const data = content.data || { root: content.root, elements: content.elements };
            const elements = data?.elements;
            return {
              name,
              file: f,
              displayName: content.displayName || name,
              description: content.description || '',
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
        files,
      };
    } catch (err: any) {
      return { success: false, error: `读取 spec 文件列表失败: ${err.message}` };
    }
  },
  {
    name: 'list_spec_files',
    description: '列出 agent-backend/specs/ 目录下所有 UI spec JSON 文件的详细信息：名称、展示名、元素数量、文件大小、修改时间。',
    schema: z.object({}),
  }
);
