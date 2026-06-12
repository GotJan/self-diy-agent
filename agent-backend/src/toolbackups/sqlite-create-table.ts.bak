/**
 * sqlite_create_table —— 创建新表
 *
 * columns 格式: [ { "name": "id", "type": "INTEGER", "pk": true, "notNull": true }, ... ]
 */

import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { getDb } from './sqlite-db.js';

export const sqliteCreateTableTool = tool(
  ({ table, columns }) => {
    try {
      const db = getDb();

      // 检查表是否已存在
      const exists = db.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name=?"
      ).get(table);

      if (exists) {
        return {
          success: false,
          error: `表 '${table}' 已存在。请用 sqlite_alter_table 修改结构或 sqlite_describe_table 查看结构。`,
        };
      }

      // 校验 columns
      if (!Array.isArray(columns) || columns.length === 0) {
        return { success: false, error: 'columns 必须是非空数组' };
      }

      // 构建列定义
      const colDefs: string[] = [];
      const pkColumns: string[] = [];

      for (const col of columns) {
        if (!col.name) {
          return { success: false, error: '每列必须有 name 字段' };
        }

        let def = `"${col.name}" ${col.type || 'TEXT'}`;
        if (col.notNull) def += ' NOT NULL';
        if (col.default !== undefined) {
          def += ` DEFAULT ${typeof col.default === 'string' ? `'${col.default}'` : col.default}`;
        }
        if (col.unique) def += ' UNIQUE';

        // AUTOINCREMENT 只能用于 INTEGER PRIMARY KEY
        if (col.autoIncrement && col.pk) {
          def = `"${col.name}" INTEGER PRIMARY KEY AUTOINCREMENT`;
        } else if (col.pk) {
          pkColumns.push(col.name);
        }

        colDefs.push(def);
      }

      // 有显式主键时添加 PRIMARY KEY 约束
      if (pkColumns.length > 0 && !columns.some((c) => c.autoIncrement)) {
        colDefs.push(`PRIMARY KEY (${pkColumns.map((c) => `"${c}"`).join(', ')})`);
      }

      const sql = `CREATE TABLE "${table}" (\n  ${colDefs.join(',\n  ')}\n)`;
      db.exec(sql);

      return {
        success: true,
        table,
        sql,
        columnCount: columns.length,
        message: `表 '${table}' 创建成功。`,
      };
    } catch (err: any) {
      return { success: false, error: `建表失败: ${err.message}` };
    }
  },
  {
    name: 'sqlite_create_table',
    description:
      '在 SQLite 数据库中创建新表。columns 为列定义数组，每列含 name(必填)、type(默认TEXT)、pk(主键)、notNull、default、unique、autoIncrement。',
    schema: z.object({
      table: z.string().describe('要创建的表名，英文命名，如 "users"'),
      columns: z.array(z.object({
        name: z.string().describe('列名，英文命名'),
        type: z.string().optional().describe('列类型，如 INTEGER, TEXT, REAL, BLOB。默认 TEXT'),
        pk: z.boolean().optional().describe('是否为主键'),
        notNull: z.boolean().optional().describe('是否 NOT NULL'),
        default: z.union([z.string(), z.number()]).optional().describe('默认值'),
        unique: z.boolean().optional().describe('是否唯一'),
        autoIncrement: z.boolean().optional().describe('是否自增（仅 INTEGER PRIMARY KEY 时可用）'),
      })).describe('列定义数组'),
    }),
  }
);
