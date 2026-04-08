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

  // ── 建表（含新表结构） ──
  db.run(`CREATE TABLE IF NOT EXISTS workspaces (
    id TEXT PRIMARY KEY,
    name TEXT,
    createdAt TEXT,
    updatedAt TEXT
  )`)

  // 旧表（保留用于迁移，迁移完成后数据清空）
  db.run(`CREATE TABLE IF NOT EXISTS workspace_data (
    workspace_id TEXT PRIMARY KEY,
    data_json TEXT
  )`)

  db.run(`CREATE TABLE IF NOT EXISTS kv (
    key TEXT PRIMARY KEY,
    value TEXT
  )`)

  // ── 新表：零件库 ──
  db.run(`CREATE TABLE IF NOT EXISTS parts (
    id TEXT NOT NULL,
    workspace_id TEXT NOT NULL,
    name TEXT,
    type TEXT NOT NULL,
    params_json TEXT,
    create_time TEXT,
    PRIMARY KEY (workspace_id, id)
  )`)

  // ── 新表：装配体实例 ──
  db.run(`CREATE TABLE IF NOT EXISTS assembly_items (
    id TEXT NOT NULL,
    workspace_id TEXT NOT NULL,
    original_part_id TEXT,
    name TEXT,
    type TEXT NOT NULL,
    params_json TEXT,
    pos_x REAL DEFAULT 0,
    pos_y REAL DEFAULT 0,
    pos_z REAL DEFAULT 0,
    rot_x REAL DEFAULT 0,
    rot_y REAL DEFAULT 0,
    rot_z REAL DEFAULT 0,
    assembly_time TEXT,
    PRIMARY KEY (workspace_id, id)
  )`)

  // ── 新表：操作历史 ──
  db.run(`CREATE TABLE IF NOT EXISTS history (
    workspace_id TEXT NOT NULL,
    seq INTEGER NOT NULL,
    id TEXT,
    type TEXT NOT NULL,
    target_id TEXT,
    name TEXT,
    time TEXT,
    data_json TEXT,
    PRIMARY KEY (workspace_id, seq)
  )`)

  // 迁移 localStorage 旧数据
  await migrateFromLocalStorage()

  // 迁移 workspace_data JSON → 新表
  migrateJsonToTables()

  await persistDB()
}

// === 迁移：localStorage → SQLite ===
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

// === 迁移：workspace_data JSON → 拆分表 ===
function migrateJsonToTables() {
  if (!db) return
  try {
    const res = db.exec('SELECT workspace_id, data_json FROM workspace_data')
    if (res.length === 0) return

    db.run('BEGIN TRANSACTION')
    for (const row of res[0].values) {
      const wsId = row[0]
      const json = row[1]
      if (!json) continue

      // 检查新表是否已有该工作空间的数据（避免重复迁移）
      const existing = db.exec('SELECT COUNT(*) FROM parts WHERE workspace_id = ?', [wsId])
      const existingAsm = db.exec('SELECT COUNT(*) FROM assembly_items WHERE workspace_id = ?', [wsId])
      if ((existing[0]?.values[0]?.[0] > 0) || (existingAsm[0]?.values[0]?.[0] > 0)) continue

      let data
      try { data = JSON.parse(json) } catch { continue }

      // 迁移零件
      if (Array.isArray(data.partsItems)) {
        for (const p of data.partsItems) {
          const { id, name, type, params, createTime } = p
          const paramsJson = params ? JSON.stringify(params) : null
          db.run('INSERT OR IGNORE INTO parts VALUES (?,?,?,?,?,?)',
            [id, wsId, name || null, type || 'straight', paramsJson, createTime || null])
        }
      }

      // 迁移装配体
      if (Array.isArray(data.assemblyItems)) {
        for (const a of data.assemblyItems) {
          const params = { ...a.params || a }
          // 清理非 params 字段
          delete params.id; delete params.position; delete params.rotation
          delete params.originalPartId; delete params.assemblyTime; delete params.name
          delete params.type; delete params.createTime

          db.run('INSERT OR IGNORE INTO assembly_items VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)', [
            a.id, wsId,
            a.originalPartId || null,
            a.name || null,
            a.type || 'straight',
            JSON.stringify(params),
            a.position?.x || 0, a.position?.y || 0, a.position?.z || 0,
            a.rotation?.x || 0, a.rotation?.y || 0, a.rotation?.z || 0,
            a.assemblyTime || null
          ])
        }
      }

      // 迁移历史
      if (Array.isArray(data.historyItems)) {
        for (let i = 0; i < data.historyItems.length; i++) {
          const h = data.historyItems[i]
          // 提取通用字段，其余存 data_json
          const { id, type, targetId, name, time, ...rest } = h
          db.run('INSERT OR IGNORE INTO history VALUES (?,?,?,?,?,?,?,?)', [
            wsId, i,
            id || null, type || 'unknown', targetId || null,
            name || null, time || null,
            Object.keys(rest).length > 0 ? JSON.stringify(rest) : null
          ])
        }
      }

      // 清空旧 JSON 数据（迁移完成）
      db.run('DELETE FROM workspace_data WHERE workspace_id = ?', [wsId])
    }
    db.run('COMMIT')
  } catch (e) {
    try { db.run('ROLLBACK') } catch {}
    console.warn('迁移 workspace_data → 拆分表失败:', e)
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
