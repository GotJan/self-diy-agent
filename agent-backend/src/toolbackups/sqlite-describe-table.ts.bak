/**
 * sqlite_describe_table —— 查看表结构（列名、类型、约束）
 */

import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { getDb } from './sqlite-db.js';

export const sqliteDescribeTableTool = tool(
  ({ table }) => {
    try {
      const db = getDb();

      // 检查表是否存在
      const tableExists = db.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name=?"
      ).get(table);

      if (!tableExists) {
        return {
          success: false,
          error: `表 '${table}' 不存在。请先调用 sqlite_list_tables 查看可用表。`,
        };
      }

      // 获取 CREATE TABLE 语句
      const createRow = db.prepare(
        "SELECT sql FROM sqlite_master WHERE type='table' AND name=?"
      ).get(table) as { sql: string } | undefined;

      // 获取列信息
      const columns = db.prepare(`PRAGMA table_info('${table}')`).all() as {
        cid: number;
        name: string;
        type: string;
        notnull: number;
        dflt_value: string | null;
        pk: number;
      }[];

      // 获取行数
      const countRow = db.prepare(`SELECT COUNT(*) as cnt FROM "${table}"`).get() as { cnt: number };

      return {
        success: true,
        table,
        rowCount: countRow.cnt,
        createSql: createRow?.sql || null,
        columns: columns.map((c) => ({
          name: c.name,
          type: c.type || 'TEXT',
          notNull: c.notnull === 1,
          default: c.dflt_value,
          primaryKey: c.pk === 1,
        })),
      };
    } catch (err: any) {
      return { success: false, error: `查询表结构失败: ${err.message}` };
    }
  },
  {
    name: 'sqlite_describe_table',
    description: '查看指定表的结构信息，包括列名、类型、是否可空、默认值、主键，以及行数和建表 SQL。',
    schema: z.object({
      table: z.string().describe('要查看结构的表名'),
    }),
  }
);
