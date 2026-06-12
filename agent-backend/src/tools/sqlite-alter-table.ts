/**
 * sqlite_alter_table —— 修改表结构
 *
 * 支持三种操作:
 *   - add_column: 添加新列
 *   - drop_column: 删除列（SQLite 3.35+）
 *   - rename_column: 重命名列（SQLite 3.25+）
 */

import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { getDb } from './sqlite-db.js';

const ALLOWED_OPERATIONS = ['add_column', 'drop_column', 'rename_column'] as const;

export const sqliteAlterTableTool = tool(
  ({ table, operation, column, newName, columnType, columnDefault }) => {
    try {
      const db = getDb();

      // 检查表是否存在
      const exists = db.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name=?"
      ).get(table);
      if (!exists) {
        return { success: false, error: `表 '${table}' 不存在。` };
      }

      if (!ALLOWED_OPERATIONS.includes(operation as any)) {
        return {
          success: false,
          error: `不支持的操作: '${operation}'。支持: ${ALLOWED_OPERATIONS.join(', ')}`,
        };
      }

      // 获取当前列列表
      const tableCols = db.prepare(`PRAGMA table_info('${table}')`).all() as { name: string }[];
      const colNames = new Set(tableCols.map((c) => c.name));

      let sql = '';
      switch (operation) {
        case 'add_column': {
          if (!column) {
            return { success: false, error: 'add_column 操作需要 column 参数' };
          }
          if (colNames.has(column)) {
            return { success: false, error: `列 '${column}' 已存在于表 '${table}' 中` };
          }
          const type = columnType || 'TEXT';
          let def = `ALTER TABLE "${table}" ADD COLUMN "${column}" ${type}`;
          if (columnDefault !== undefined) {
            def += ` DEFAULT ${typeof columnDefault === 'string' ? `'${columnDefault}'` : columnDefault}`;
          }
          sql = def;
          break;
        }

        case 'drop_column': {
          if (!column) {
            return { success: false, error: 'drop_column 操作需要 column 参数' };
          }
          if (!colNames.has(column)) {
            return { success: false, error: `列 '${column}' 不存在于表 '${table}' 中。可用列: ${[...colNames].join(', ')}` };
          }
          sql = `ALTER TABLE "${table}" DROP COLUMN "${column}"`;
          break;
        }

        case 'rename_column': {
          if (!column || !newName) {
            return { success: false, error: 'rename_column 操作需要 column 和 newName 参数' };
          }
          if (!colNames.has(column)) {
            return { success: false, error: `列 '${column}' 不存在于表 '${table}' 中。可用列: ${[...colNames].join(', ')}` };
          }
          if (colNames.has(newName)) {
            return { success: false, error: `新列名 '${newName}' 已存在于表 '${table}' 中` };
          }
          sql = `ALTER TABLE "${table}" RENAME COLUMN "${column}" TO "${newName}"`;
          break;
        }
      }

      db.exec(sql);

      return {
        success: true,
        table,
        operation,
        sql,
        message: `表 '${table}' 结构变更成功: ${operation}${column ? ` '${column}'` : ''}${newName ? ` → '${newName}'` : ''}。`,
      };
    } catch (err: any) {
      return { success: false, error: `修改表结构失败: ${err.message}` };
    }
  },
  {
    name: 'sqlite_alter_table',
    description:
      '修改表结构。支持三种操作: add_column(添加列)、drop_column(删除列)、rename_column(重命名列)。\n' +
      'add_column 时可指定 columnType(默认TEXT) 和 columnDefault(默认值)。',
    schema: z.object({
      table: z.string().describe('目标表名'),
      operation: z.enum(['add_column', 'drop_column', 'rename_column']).describe('操作类型'),
      column: z.string().optional().describe('目标列名（add/drop/rename 都需要）'),
      newName: z.string().optional().describe('新列名（仅 rename_column 需要）'),
      columnType: z.string().optional().describe('列类型（仅 add_column 需要，默认 TEXT）'),
      columnDefault: z.union([z.string(), z.number()]).optional().describe('默认值（仅 add_column 需要）'),
    }),
  }
);
