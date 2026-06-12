/**
 * sqlite_select —— 查询表中数据
 *
 * 安全设计：表名和列名使用白名单校验防止注入，值使用参数化查询。
 */

import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { getDb } from './sqlite-db.js';

export const sqliteSelectTool = tool(
  ({ table, columns, where, orderBy, limit, offset }) => {
    try {
      const db = getDb();

      // 检查表是否存在
      const exists = db.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name=?"
      ).get(table);
      if (!exists) {
        return { success: false, error: `表 '${table}' 不存在。` };
      }

      // 获取表的实际列名（白名单）
      const tableCols = db.prepare(`PRAGMA table_info('${table}')`).all() as { name: string }[];
      const validCols = new Set(tableCols.map((c) => c.name));

      // 列白名单校验
      let selectCols = '*';
      if (columns && Array.isArray(columns) && columns.length > 0) {
        const invalidCols = columns.filter((c) => !validCols.has(c));
        if (invalidCols.length > 0) {
          return {
            success: false,
            error: `无效列名: ${invalidCols.join(', ')}。可用列: ${[...validCols].join(', ')}`,
          };
        }
        selectCols = columns.map((c) => `"${c}"`).join(', ');
      }

      // 构建 SQL
      let sql = `SELECT ${selectCols} FROM "${table}"`;
      const params: any[] = [];

      // WHERE 子句（参数化）
      if (where) {
        const conditions: string[] = [];
        for (const [col, val] of Object.entries(where)) {
          if (!validCols.has(col)) {
            return { success: false, error: `WHERE 子句中无效列名: '${col}'` };
          }
          conditions.push(`"${col}" = ?`);
          params.push(val);
        }
        if (conditions.length > 0) {
          sql += ` WHERE ${conditions.join(' AND ')}`;
        }
      }

      // ORDER BY（白名单校验）
      if (orderBy) {
        if (!validCols.has(orderBy)) {
          return { success: false, error: `ORDER BY 中无效列名: '${orderBy}'` };
        }
        sql += ` ORDER BY "${orderBy}" DESC`;
      }

      // LIMIT / OFFSET
      if (limit !== undefined) {
        sql += ` LIMIT ${Math.min(Math.max(1, limit), 1000)}`;
      } else {
        sql += ' LIMIT 100'; // 默认限制
      }
      if (offset !== undefined && offset > 0) {
        sql += ` OFFSET ${offset}`;
      }

      const rows = db.prepare(sql).all(...params);

      return {
        success: true,
        table,
        sql,
        rowCount: rows.length,
        rows,
      };
    } catch (err: any) {
      return { success: false, error: `查询失败: ${err.message}` };
    }
  },
  {
    name: 'sqlite_select',
    description:
      '从表中查询数据。支持指定列、WHERE 条件（等值匹配）、ORDER BY（降序）、LIMIT（默认100，最大1000）、OFFSET。所有值使用参数化查询防注入。',
    schema: z.object({
      table: z.string().describe('要查询的表名'),
      columns: z.array(z.string()).optional().describe('要返回的列名数组，不传返回所有列'),
      where: z.record(z.string(), z.any()).optional().describe('WHERE 等值条件，如 { "status": "active" }'),
      orderBy: z.string().optional().describe('按此列降序排列，如 "created_at"'),
      limit: z.number().int().min(1).max(1000).optional().describe('返回行数上限，默认 100'),
      offset: z.number().int().min(0).optional().describe('偏移量，用于分页'),
    }),
  }
);
