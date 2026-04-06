import initSqlJs from 'sql.js'

const DB_NAME = '3dbuild_sqlite'
const DB_STORE = 'database'
const DB_KEY = 'main'

let db = null
let _saveTimer = null

// === IndexedDB 持久化 ===
function openIDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(DB_STORE)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function loadFromIDB() {
  const idb = await openIDB()
  return new Promise((resolve, reject) => {
    const tx = idb.transaction(DB_STORE, 'readonly')
    const req = tx.objectStore(DB_STORE).get(DB_KEY)
    req.onsuccess = () => resolve(req.result || null)
    req.onerror = () => reject(req.error)
  })
}

async function saveToIDB(data) {
  const idb = await openIDB()
  return new Promise((resolve, reject) => {
    const tx = idb.transaction(DB_STORE, 'readwrite')
    tx.objectStore(DB_STORE).put(data, DB_KEY)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

// === 初始化 ===
export async function initDB() {
  const SQL = await initSqlJs({
    locateFile: file => `https://cdn.jsdelivr.net/npm/sql.js@1.14.1/dist/${file}`
  })

  const saved = await loadFromIDB()
  if (saved) {
    db = new SQL.Database(new Uint8Array(saved))
  } else {
    db = new SQL.Database()
  }

  // 建表
  db.run(`CREATE TABLE IF NOT EXISTS workspaces (
    id TEXT PRIMARY KEY,
    name TEXT,
    createdAt TEXT,
    updatedAt TEXT
  )`)
  db.run(`CREATE TABLE IF NOT EXISTS workspace_data (
    workspace_id TEXT PRIMARY KEY,
    data_json TEXT
  )`)
  db.run(`CREATE TABLE IF NOT EXISTS kv (
    key TEXT PRIMARY KEY,
    value TEXT
  )`)

  // 迁移 localStorage 旧数据
  await migrateFromLocalStorage()

  await persistDB()
}

async function migrateFromLocalStorage() {
  if (typeof window === 'undefined' || !window.localStorage) return
  const oldKey = '3dbuild.workspaces.v1'
  const oldData = window.localStorage.getItem(oldKey)
  if (!oldData) return

  try {
    const workspaces = JSON.parse(oldData)
    if (!Array.isArray(workspaces)) return

    workspaces.forEach(ws => {
      db.run('INSERT OR IGNORE INTO workspaces VALUES (?,?,?,?)', [ws.id, ws.name, ws.createdAt, ws.updatedAt])
      const dataKey = '3dbuild.workspace.data.' + ws.id
      const dataStr = window.localStorage.getItem(dataKey)
      if (dataStr) {
        db.run('INSERT OR IGNORE INTO workspace_data VALUES (?,?)', [ws.id, dataStr])
        window.localStorage.removeItem(dataKey)
      }
    })

    // 迁移当前工作空间 ID
    const currentId = window.localStorage.getItem('3dbuild.currentWorkspace.v1')
    if (currentId) {
      db.run('INSERT OR REPLACE INTO kv VALUES (?,?)', ['currentWorkspaceId', currentId])
      window.localStorage.removeItem('3dbuild.currentWorkspace.v1')
    }

    window.localStorage.removeItem(oldKey)
  } catch {
    // 迁移失败静默忽略
  }
}

// === 持久化（debounced） ===
async function persistDB() {
  if (!db) return
  const data = db.export()
  await saveToIDB(data.buffer)
}

export function schedulePersist() {
  if (_saveTimer) clearTimeout(_saveTimer)
  _saveTimer = setTimeout(() => persistDB(), 350)
}

export function flushDB() {
  if (_saveTimer) { clearTimeout(_saveTimer); _saveTimer = null }
  if (db) {
    const data = db.export()
    // 同步写入不可能，用 best-effort
    saveToIDB(data.buffer)
  }
}

// === CRUD ===
export function getDB() {
  return db
}

export function kvGet(key) {
  if (!db) return null
  const res = db.exec('SELECT value FROM kv WHERE key = ?', [key])
  return res.length > 0 && res[0].values.length > 0 ? res[0].values[0][0] : null
}

export function kvSet(key, value) {
  if (!db) return
  db.run('INSERT OR REPLACE INTO kv VALUES (?,?)', [key, value])
  schedulePersist()
}

export function kvDelete(key) {
  if (!db) return
  db.run('DELETE FROM kv WHERE key = ?', [key])
  schedulePersist()
}
