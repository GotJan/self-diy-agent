/**
 * sqlite_list_tables —— 列出数据库中所有表名
 */

import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { getDb, getDbPath } from './sqlite-db.js';

export const sqliteListTablesTool = tool(
  () => {
    try {
      const db = getDb();
      const rows = db.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
      ).all() as { name: string }[];

      const tables = rows.map((r) => r.name);

      return {
        success: true,
        count: tables.length,
        tables,
        dbPath: getDbPath(),
      };
    } catch (err: any) {
      return { success: false, error: `查询失败: ${err.message}` };
    }
  },
  {
    name: 'sqlite_list_tables',
    description: '列出 SQLite 数据库中所有表名。',
    schema: z.object({}),
  }
);
