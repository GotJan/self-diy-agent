/**
 * sqlite_db_info —— 数据库连接信息 + 管理
 *
 * 同时提供 getDb/closeDb/getDbPath/initDatabase 供其他 sqlite_* 工具内部使用。
 *
 * 使用 sql.js (纯 WASM, 零原生编译) 替代 better-sqlite3，
 * SqlJsAdapter 提供兼容层适配 .prepare().all()/.get()/.run() 等 API。
 */

import initSqlJs, { type Database as SqlJsDb, type Statement as SqlJsStmt, type SqlJsStatic } from 'sql.js';
import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const DB_PATH = process.env.SQLITE_DB_PATH
  || path.resolve(__dirname, '../../data/app.db');

let SQL: SqlJsStatic | null = null;
let db: SqlJsAdapter | null = null;

/** 将文件内容读到 Uint8Array */
function readDbFile(): Uint8Array | undefined {
  if (fs.existsSync(DB_PATH)) {
    return new Uint8Array(fs.readFileSync(DB_PATH));
  }
  return undefined;
}

/** 将内存数据库写回文件 */
function saveDbFile(raw: SqlJsDb) {
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(DB_PATH, Buffer.from(raw.export()));
}

/**
 * SqlJsAdapter —— 模拟 better-sqlite3 的 Database API
 * 提供 .prepare().all(params?) / .get(params?) / .run(params?) / .exec(sql) / .close()
 */
class SqlJsAdapter {
  private raw: SqlJsDb;
  private _closed = false;

  constructor(raw: SqlJsDb) {
    this.raw = raw;
  }

  /** 执行 SQL，无返回值 */
  exec(sql: string): void {
    this.raw.run(sql);
    saveDbFile(this.raw);
  }

  /** 设置 pragma */
  pragma(pragma: string): void {
    this.exec(`PRAGMA ${pragma}`);
  }

  /** 返回 PreparedStatement 兼容对象 */
  prepare(sql: string): PreparedStmt {
    return new PreparedStmt(this.raw, sql, this);
  }

  /** 关闭数据库 */
  close(): void {
    if (!this._closed) {
      saveDbFile(this.raw);
      this.raw.close();
      this._closed = true;
    }
  }

  /** 事务 (模拟 better-sqlite3 的 transaction) */
  transaction<R>(fn: (...args: any[]) => R): (...args: any[]) => R {
    return (...args: any[]) => {
      this.raw.run('BEGIN');
      try {
        const result = fn(...args);
        this.raw.run('COMMIT');
        saveDbFile(this.raw);
        return result;
      } catch (e) {
        this.raw.run('ROLLBACK');
        throw e;
      }
    };
  }

  /** 持久化到文件（供 PreparedStmt 内部调用） */
  _save() { saveDbFile(this.raw); }
}

/** 模拟 better-sqlite3 的 Statement */
class PreparedStmt {
  private db: SqlJsDb;
  private sql: string;
  private adapter: SqlJsAdapter;

  constructor(db: SqlJsDb, sql: string, adapter: SqlJsAdapter) {
    this.db = db;
    this.sql = sql;
    this.adapter = adapter;
  }

  /** .all(params?) → 返回所有匹配行 */
  all(...params: any[]): any[] {
    const stmt = this.db.prepare(this.sql);
    this._bind(stmt, params);
    const rows: any[] = [];
    while (stmt.step()) {
      rows.push(stmt.getAsObject());
    }
    stmt.free();
    return rows;
  }

  /** .get(params?) → 返回第一行 */
  get(...params: any[]): any | undefined {
    const stmt = this.db.prepare(this.sql);
    this._bind(stmt, params);
    let result: any | undefined;
    if (stmt.step()) {
      result = stmt.getAsObject();
    }
    stmt.free();
    return result;
  }

  /** .run(params?) → 执行写入，返回 { changes } */
  run(...params: any[]): { changes: number } {
    const before = this.db.getRowsModified();
    this.db.run(this.sql, this._extractParams(params));
    const after = this.db.getRowsModified();
    this.adapter._save();
    return { changes: after - before };
  }

  /** 绑定参数 (支持位置参数和命名参数) */
  private _bind(stmt: SqlJsStmt, params: any[]) {
    const flat = this._extractParams(params);
    if (flat.length > 0) {
      const positionals = this.sql.match(/\?|:\w+|@\w+|\$\w+/g) || [];
      if (positionals.length > 0 && positionals.every(p => p === '?')) {
        stmt.bind(flat);
      } else {
        // 命名参数暂不支持 → 改用位置参数
        stmt.bind(flat);
      }
    }
  }

  private _extractParams(params: any[]): any[] {
    if (params.length === 0) return [];
    // 兼容 .get(tableName) 传单个字符串作为参数
    if (params.length === 1 && typeof params[0] === 'string') return [params[0]];
    if (Array.isArray(params[0])) return params[0];
    return params;
  }
}

/** 获取或初始化数据库连接 */
export function getDb(): SqlJsAdapter {
  if (!db) {
    if (!SQL) {
      throw new Error('sql.js not initialized. Call initDatabase() first.');
    }
    const buf = readDbFile();
    const raw = new SQL.Database(buf);
    raw.run('PRAGMA journal_mode=WAL');
    raw.run('PRAGMA foreign_keys=ON');
    db = new SqlJsAdapter(raw);
    console.log(`[SQLite] Connected: ${DB_PATH}`);
  }
  return db;
}

/** 初始化 sql.js (异步加载 WASM) */
export async function initDatabase(): Promise<void> {
  if (!SQL) {
    SQL = await initSqlJs();
  }
}

/** 关闭数据库连接 */
export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
    console.log('[SQLite] Connection closed');
  }
}

/** 获取数据库文件路径 */
export function getDbPath(): string {
  return DB_PATH;
}

// ========== Tool ==========

export const sqliteDbInfoTool = tool(
  () => {
    try {
      const database = getDb();

      const tables = database.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
      ).all() as { name: string }[];

      const tableDetails = tables.map((t) => {
        const countRow = database.prepare(`SELECT COUNT(*) as cnt FROM "${t.name}"`).get() as { cnt: number };
        return { name: t.name, rowCount: countRow.cnt };
      });

      let fileSize = 0;
      if (fs.existsSync(DB_PATH)) {
        fileSize = fs.statSync(DB_PATH).size;
      }

      return {
        success: true,
        connected: true,
        dbPath: DB_PATH,
        fileSizeBytes: fileSize,
        fileSizeKB: (fileSize / 1024).toFixed(1),
        tableCount: tables.length,
        tables: tableDetails,
      };
    } catch (err: any) {
      return { success: false, error: `获取数据库信息失败: ${err.message}` };
    }
  },
  {
    name: 'sqlite_db_info',
    description: '获取 SQLite 数据库概览信息：连接状态、文件路径、文件大小、所有表名及行数。',
    schema: z.object({}),
  }
);
