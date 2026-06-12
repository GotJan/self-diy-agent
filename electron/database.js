const initSqlJs = require('sql.js')
const fs = require('fs')
const path = require('path')
const { app } = require('electron')

let db = null
let dbPath = ''

/**
 * 将数据库保存到文件
 */
function saveToFile() {
  if (!db || !dbPath) return
  const data = db.export()
  const buffer = Buffer.from(data)
  fs.writeFileSync(dbPath, buffer)
}

/**
 * 初始化 SQLite 数据库（使用 sql.js，纯 JS 实现）
 * 数据库文件存放在 app.getPath('userData')/app.db
 */
async function initDatabase() {
  if (db) return db

  dbPath = path.join(app.getPath('userData'), 'app.db')
  console.log('[Database] Initializing database at:', dbPath)

  const SQL = await initSqlJs()

  // 加载已有数据库文件（如果存在）
  if (fs.existsSync(dbPath)) {
    const fileBuffer = fs.readFileSync(dbPath)
    db = new SQL.Database(fileBuffer)
  } else {
    db = new SQL.Database()
  }

  // 启用外键约束
  db.run('PRAGMA foreign_keys = ON')

  // 创建 settings 表
  db.run(`
    CREATE TABLE IF NOT EXISTS settings (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `)

  // 插入默认设置（如果不存在）
  db.run(
    'INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)',
    ['app_version', '0.0.0']
  )
  db.run(
    'INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)',
    ['theme', 'light']
  )

  saveToFile()
  console.log('[Database] Initialization complete')
  return db
}

/**
 * 获取数据库实例
 */
function getDb() {
  if (!db) {
    throw new Error('Database not initialized. Call initDatabase() first.')
  }
  return db
}

/**
 * 关闭数据库连接
 */
function closeDatabase() {
  if (db) {
    saveToFile()
    db.close()
    db = null
    console.log('[Database] Connection closed')
  }
}

// ========== CRUD 操作 ==========

/**
 * 查询 setting
 */
function getSetting(key) {
  const database = getDb()
  const stmt = database.prepare('SELECT value FROM settings WHERE key = ?')
  stmt.bind([key])
  if (stmt.step()) {
    const row = stmt.getAsObject()
    stmt.free()
    return row.value
  }
  stmt.free()
  return undefined
}

/**
 * 设置（插入或更新）
 */
function setSetting(key, value) {
  const database = getDb()
  database.run(
    'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)',
    [key, value]
  )
  saveToFile()
}

/**
 * 删除 setting
 */
function deleteSetting(key) {
  const database = getDb()
  database.run('DELETE FROM settings WHERE key = ?', [key])
  const changes = database.getRowsModified()
  saveToFile()
  return changes > 0
}

/**
 * 获取所有设置
 */
function getAllSettings() {
  const database = getDb()
  const results = database.exec('SELECT key, value FROM settings')
  const settings = {}

  if (results.length > 0) {
    const { columns, values } = results[0]
    const keyIdx = columns.indexOf('key')
    const valueIdx = columns.indexOf('value')
    for (const row of values) {
      settings[row[keyIdx]] = row[valueIdx]
    }
  }

  return settings
}

module.exports = {
  initDatabase,
  closeDatabase,
  getSetting,
  setSetting,
  deleteSetting,
  getAllSettings,
}
