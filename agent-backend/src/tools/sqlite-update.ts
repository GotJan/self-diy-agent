/**
 * sqlite_update —— 更新表中符合条件的行
 *
 * 安全设计：列名白名单校验，值参数化查询。
 */

import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { getDb } from './sqlite-db.js';

export const sqliteUpdateTool = tool(
  ({ table, set, where }) => {
    try {
      const db = getDb();

      // 检查表是否存在
      const exists = db.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name=?"
      ).get(table);
      if (!exists) {
        return { success: false, error: `表 '${table}' 不存在。` };
      }

      // 获取列白名单
      const tableCols = db.prepare(`PRAGMA table_info('${table}')`).all() as { name: string }[];
      const validCols = new Set(tableCols.map((c) => c.name));

      // 校验 SET 列
      if (!set || typeof set !== 'object' || Object.keys(set).length === 0) {
        return { success: false, error: 'set 必须是非空键值对对象' };
      }
      const invalidSetCols = Object.keys(set).filter((c) => !validCols.has(c));
      if (invalidSetCols.length > 0) {
        return {
          success: false,
          error: `SET 中无效列名: ${invalidSetCols.join(', ')}。可用列: ${[...validCols].join(', ')}`,
        };
      }

      // 校验 WHERE 列
      if (!where || typeof where !== 'object' || Object.keys(where).length === 0) {
        return { success: false, error: 'where 必须是非空键值对对象。如需更新所有行，请明确说明。' };
      }
      const invalidWhereCols = Object.keys(where).filter((c) => !validCols.has(c));
      if (invalidWhereCols.length > 0) {
        return {
          success: false,
          error: `WHERE 中无效列名: ${invalidWhereCols.join(', ')}`,
        };
      }

      // 构建 SQL（参数化）
      const setClauses = Object.keys(set).map((c) => `"${c}" = ?`);
      const whereClauses = Object.keys(where).map((c) => `"${c}" = ?`);
      const params = [...Object.values(set), ...Object.values(where)];

      const sql = `UPDATE "${table}" SET ${setClauses.join(', ')} WHERE ${whereClauses.join(' AND ')}`;

      const result = db.prepare(sql).run(...params);

      return {
        success: true,
        table,
        sql,
        changes: result.changes,
        message: `成功更新表 '${table}' 中 ${result.changes} 行数据。`,
      };
    } catch (err: any) {
      return { success: false, error: `更新失败: ${err.message}` };
    }
  },
  {
    name: 'sqlite_update',
    description:
      '更新表中符合条件的行。set 为要修改的列值映射，where 为筛选条件。必须提供 where 条件，不允许无条件全表更新。',
    schema: z.object({
      table: z.string().describe('目标表名'),
      set: z.record(z.string(), z.any()).describe('要更新的列值，如 { "status": "inactive" }'),
      where: z.record(z.string(), z.any()).describe('WHERE 筛选条件，如 { "id": 1 }。必须提供，不支持全表更新。'),
    }),
  }
);
