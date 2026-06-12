/**
 * sqlite_insert —— 向表中插入一行或多行数据
 */

import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { getDb } from './sqlite-db.js';

export const sqliteInsertTool = tool(
  ({ table, rows }) => {
    try {
      const db = getDb();

      // 检查表是否存在
      const exists = db.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name=?"
      ).get(table);
      if (!exists) {
        return { success: false, error: `表 '${table}' 不存在。请先用 sqlite_create_table 创建。` };
      }

      // 标准化 rows 为数组
      const rowsArr = Array.isArray(rows) ? rows : [rows];
      if (rowsArr.length === 0) {
        return { success: false, error: 'rows 不能为空' };
      }

      const firstRow = rowsArr[0];
      if (!firstRow || typeof firstRow !== 'object') {
        return { success: false, error: '每行数据必须是一个键值对对象' };
      }

      const columns = Object.keys(firstRow);
      const placeholders = columns.map(() => '?').join(', ');
      const sql = `INSERT INTO "${table}" (${columns.map((c) => `"${c}"`).join(', ')}) VALUES (${placeholders})`;

      const insert = db.prepare(sql);
      const insertMany = db.transaction((data: Record<string, any>[]) => {
        let count = 0;
        for (const row of data) {
          insert.run(...columns.map((c) => row[c]));
          count++;
        }
        return count;
      });

      const insertedCount = insertMany(rowsArr);

      return {
        success: true,
        table,
        insertedCount,
        message: `成功向表 '${table}' 插入 ${insertedCount} 行数据。`,
      };
    } catch (err: any) {
      return { success: false, error: `插入失败: ${err.message}` };
    }
  },
  {
    name: 'sqlite_insert',
    description:
      '向指定表插入数据。rows 为对象或对象数组，键为列名，值为数据。使用参数化查询，防止 SQL 注入。',
    schema: z.object({
      table: z.string().describe('目标表名'),
      rows: z.union([
        z.record(z.string(), z.any()),
        z.array(z.record(z.string(), z.any())),
      ]).describe('要插入的行数据，支持单行对象或多行数组'),
    }),
  }
);
