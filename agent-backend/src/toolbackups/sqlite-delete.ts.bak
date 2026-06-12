/**
 * sqlite_delete —— 删除表中符合条件的行
 *
 * 安全设计：必须提供 WHERE 条件，列名白名单校验，值参数化查询。
 */

import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { getDb } from './sqlite-db.js';

export const sqliteDeleteTool = tool(
  ({ table, where }) => {
    try {
      const db = getDb();

      // 检查表是否存在
      const exists = db.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name=?"
      ).get(table);
      if (!exists) {
        return { success: false, error: `表 '${table}' 不存在。` };
      }

      // 必须提供 WHERE 条件
      if (!where || typeof where !== 'object' || Object.keys(where).length === 0) {
        return {
          success: false,
          error: '必须提供 where 条件。如需删除全表数据，请使用 sqlite_alter_table 删除后重建，或明确指定条件。',
        };
      }

      // 获取列白名单
      const tableCols = db.prepare(`PRAGMA table_info('${table}')`).all() as { name: string }[];
      const validCols = new Set(tableCols.map((c) => c.name));

      const invalidCols = Object.keys(where).filter((c) => !validCols.has(c));
      if (invalidCols.length > 0) {
        return {
          success: false,
          error: `WHERE 中无效列名: ${invalidCols.join(', ')}。可用列: ${[...validCols].join(', ')}`,
        };
      }

      // 先查询将要删除的行数
      const whereClauses = Object.keys(where).map((c) => `"${c}" = ?`);
      const params = Object.values(where);
      const countSql = `SELECT COUNT(*) as cnt FROM "${table}" WHERE ${whereClauses.join(' AND ')}`;
      const countResult = db.prepare(countSql).get(...params) as { cnt: number };

      // 执行删除
      const sql = `DELETE FROM "${table}" WHERE ${whereClauses.join(' AND ')}`;
      const result = db.prepare(sql).run(...params);

      return {
        success: true,
        table,
        sql,
        changes: result.changes,
        message: `成功从表 '${table}' 删除 ${result.changes} 行数据（符合条件共 ${countResult.cnt} 行）。`,
      };
    } catch (err: any) {
      return { success: false, error: `删除失败: ${err.message}` };
    }
  },
  {
    name: 'sqlite_delete',
    description:
      '从表中删除符合条件的行。必须提供 where 条件。执行前会先统计受影响行数。',
    schema: z.object({
      table: z.string().describe('目标表名'),
      where: z.record(z.string(), z.any()).describe('WHERE 筛选条件，如 { "id": 1 }。必须提供。'),
    }),
  }
);
