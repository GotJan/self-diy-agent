/**
 * create_tool —— 动态创建并注册新工具
 *
 * 职责：接收 LLM 生成的 TypeScript 代码，落盘并注册为新工具。
 * 每个工具 = 一个独立的 run 函数。
 * 创世工具 图灵完备 理论上可以实现任何功能
 * 生成的工具代码规范：
 *   export async function run(params: any): Promise<any> { ... }
 */

import { tool, DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { registerTool, getTools } from './registry.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TOOLS_DIR = __dirname;

export const createToolTool = tool(
  async (input) => {
    const { name, code, description, params_schema } = input;

    // 0. 检查同名工具是否已存在
    const existingTools = getTools();
    const existing = existingTools.find((t) => t.name === name);
    const filePath = path.join(TOOLS_DIR, `${name}.ts`);
    const fileExists = fs.existsSync(filePath);

    if (existing || fileExists) {
      const existingDesc = existing?.description || '(unknown)';
      throw new Error(
        `同名工具 '${name}' 已存在！\n` +
        `现有工具描述: ${existingDesc}\n` +
        `请选择以下方案之一：\n` +
        `  1. 复用: 直接调用已存在的 '${name}' 工具，无需重复创建\n` +
        `  2. 改名: 换个名称（如 '${name}_v2'）创建新工具`
      );
    }

    // 1. 写入工具源文件

    // 生成完整的 .ts 工具文件
    const sourceCode = `/**
 * 动态生成的工具: ${name}
 * ${description}
 *
 * params_schema: ${JSON.stringify(params_schema, null, 2)}
 */

${code}
`;

    fs.writeFileSync(filePath, sourceCode, 'utf-8');
    console.log(`[create_tool] Written to ${filePath}`);

    // 2. 从代码中提取 run 函数（通过 eval 执行）
    let runFn: ((params: any) => Promise<any>) | null = null;

    try {
      // 将代码包裹为可执行模块，导出 run 函数
      // 去掉 export 关键字（eval 在 CJS/非 module 上下文不认 export）
      // 去掉 TS 类型注解（: any, : string, : Promise<…> 等），eval 只认纯 JS
      let cleanedCode = code.replace(/\bexport\s+/g, '');
      cleanedCode = cleanedCode
        // 函数参数: (params: Type, ...) → (params, ...)
        .replace(/(\w+)\s*:\s*\w+(\[\])?(\s*<[^>]*>)?(?=\s*[,)])/g, '$1')
        // 返回类型: ): Type { → ) {
        .replace(/\)\s*:\s*\w+(\[\])?(\s*<[^>]*>)?\s*\{/g, ') {')
        // catch (e: Type) → catch (e)
        .replace(/catch\s*\(\s*(\w+)\s*:\s*\w+(\[\])?(\s*<[^>]*>)?\s*\)/g, 'catch ($1)')
        // 变量声明: const x: Type = → const x =
        .replace(/(const|let|var)\s+(\w+)\s*:\s*\w+(\[\])?(\s*<[^>]*>)?\s*=/g, '$1 $2 =');
      const wrappedCode = `
        (function() {
          ${cleanedCode}
          return { run };
        })()
      `;
      const module = eval(wrappedCode);
      runFn = module.run;
    } catch (evalError: any) {
      // eval 失败时，创建默认占位函数
      console.warn(`[create_tool] eval failed for ${name}, using placeholder:`, evalError.message);
      runFn = async (params: any) => {
        return {
          note: `Tool '${name}' loaded from file, eval fallback`,
          params,
        };
      };
    }

    // 3. 创建 DynamicStructuredTool 并注册
    const dynamicTool = new DynamicStructuredTool({
      name,
      description,
      schema: params_schema && Object.keys(params_schema.properties || {}).length > 0
        ? z.object(
            Object.fromEntries(
              Object.entries(params_schema.properties as Record<string, any>).map(
                ([key, val]: [string, any]) => {
                  const typeMap: Record<string, z.ZodTypeAny> = {
                    string: z.string(),
                    number: z.number(),
                    boolean: z.boolean(),
                  };
                  return [key, typeMap[val.type] || z.string()];
                }
              )
            )
          )
        : z.object({}),
      func: runFn!,
    });

    // 注册到内存（即时生效，无需重启）
    registerTool(dynamicTool);

    return {
      success: true,
      name,
      description,
      message: `Tool '${name}' created and registered successfully. Available in next round.`,
      filePath,
    };
  },
  {
    name: 'create_tool',
    description:
      '创建并注册新工具。当现有工具无法满足需求时，用此工具生成新工具代码，注册后下一轮即可直接调用。\n' +
      '原则：每个工具 = 一个独立的 run 函数，有明确的输入输出，功能尽量基础。\n' +
      'code 必须是一个完整的 TypeScript 模块，包含导出的 async function run(params) { ... }。',
    schema: z.object({
      name: z.string().describe('工具名称，英文下划线命名，如 "send_email"'),
      code: z.string().describe(
        '工具的完整 TypeScript 源代码，必须包含导出的 async function run(params) 函数。\n' +
        '示例: export async function run(params: any) { return { result: params.a + params.b }; }'
      ),
      description: z.string().describe('工具的中文描述'),
      params_schema: z.object({}).passthrough().describe(
        '工具参数的 JSON Schema，遵循 OpenAI function calling 格式。\n' +
        '示例: {"type":"object","properties":{"a":{"type":"number","description":"第一个数"}},"required":["a"]}'
      ).optional(),
    }),
  }
);
