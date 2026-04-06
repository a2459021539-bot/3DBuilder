/**
 * 工作空间管理工具
 * 使用 sql.js (SQLite WASM) 存储，数据持久化到 IndexedDB
 */

import { getDB, kvGet, kvSet, kvDelete, schedulePersist } from './sqliteStore.js'

export function getWorkspaces() {
  const db = getDB()
  if (!db) return []
  try {
    const res = db.exec('SELECT id, name, createdAt, updatedAt FROM workspaces ORDER BY createdAt')
    if (res.length === 0) return []
    return res[0].values.map(([id, name, createdAt, updatedAt]) => ({ id, name, createdAt, updatedAt }))
  } catch { return [] }
}

export function saveWorkspaces(workspaces) {
  const db = getDB()
  if (!db) return
  db.run('DELETE FROM workspaces')
  workspaces.forEach(ws => {
    db.run('INSERT INTO workspaces VALUES (?,?,?,?)', [ws.id, ws.name, ws.createdAt, ws.updatedAt])
  })
  schedulePersist()
}

export function createWorkspace(name) {
  const workspaces = getWorkspaces()
  const id = `workspace_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  const newWorkspace = {
    id,
    name: name || `工作空间 ${workspaces.length + 1}`,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }
  const db = getDB()
  if (db) {
    db.run('INSERT INTO workspaces VALUES (?,?,?,?)', [newWorkspace.id, newWorkspace.name, newWorkspace.createdAt, newWorkspace.updatedAt])
  }
  saveWorkspaceData(id, { partsItems: [], assemblyItems: [], historyItems: [] })
  return newWorkspace
}

export function deleteWorkspace(id) {
  const db = getDB()
  if (db) {
    db.run('DELETE FROM workspaces WHERE id = ?', [id])
    db.run('DELETE FROM workspace_data WHERE workspace_id = ?', [id])
    schedulePersist()
  }
  return getWorkspaces()
}

export function updateWorkspace(id, updates) {
  const workspaces = getWorkspaces()
  const ws = workspaces.find(w => w.id === id)
  if (!ws) return null
  const updated = { ...ws, ...updates, updatedAt: new Date().toISOString() }
  const db = getDB()
  if (db) {
    db.run('UPDATE workspaces SET name=?, createdAt=?, updatedAt=? WHERE id=?', [updated.name, updated.createdAt, updated.updatedAt, id])
    schedulePersist()
  }
  return updated
}

export function getCurrentWorkspaceId() {
  return kvGet('currentWorkspaceId')
}

export function setCurrentWorkspaceId(id) {
  if (id) { kvSet('currentWorkspaceId', id) }
  else { kvDelete('currentWorkspaceId') }
}

export function getWorkspaceData(workspaceId) {
  const db = getDB()
  const empty = { partsItems: [], assemblyItems: [], historyItems: [] }
  if (!db) return empty
  try {
    const res = db.exec('SELECT data_json FROM workspace_data WHERE workspace_id = ?', [workspaceId])
    if (res.length === 0 || res[0].values.length === 0) return empty
    const data = JSON.parse(res[0].values[0][0])
    return {
      partsItems: Array.isArray(data.partsItems) ? data.partsItems : [],
      assemblyItems: Array.isArray(data.assemblyItems) ? data.assemblyItems : [],
      historyItems: Array.isArray(data.historyItems) ? data.historyItems : []
    }
  } catch { return empty }
}

export function saveWorkspaceData(workspaceId, data) {
  const db = getDB()
  if (!db) return
  const payload = {
    partsItems: Array.isArray(data.partsItems) ? data.partsItems : [],
    assemblyItems: Array.isArray(data.assemblyItems) ? data.assemblyItems : [],
    historyItems: Array.isArray(data.historyItems) ? data.historyItems : []
  }
  db.run('INSERT OR REPLACE INTO workspace_data VALUES (?,?)', [workspaceId, JSON.stringify(payload)])
  updateWorkspace(workspaceId, { updatedAt: new Date().toISOString() })
}

export function shouldShowWorkspaceSelector() {
  const currentId = getCurrentWorkspaceId()
  if (currentId) {
    const workspaces = getWorkspaces()
    return workspaces.some(ws => ws.id === currentId)
  }
  return true
}

export function exportWorkspace(workspaceId) {
  const workspaces = getWorkspaces()
  const workspace = workspaces.find(ws => ws.id === workspaceId)
  if (!workspace) throw new Error('工作空间不存在')
  const data = getWorkspaceData(workspaceId)
  return {
    version: '1.0',
    exportDate: new Date().toISOString(),
    workspace: { id: workspace.id, name: workspace.name, createdAt: workspace.createdAt, updatedAt: workspace.updatedAt },
    data: { partsItems: data.partsItems, assemblyItems: data.assemblyItems, historyItems: data.historyItems }
  }
}

export function importWorkspace(importData, options = {}) {
  if (!importData || typeof importData !== 'object') throw new Error('无效的导入数据格式')
  if (!importData.workspace || !importData.data) throw new Error('导入数据缺少必要字段')
  if (!Array.isArray(importData.data.partsItems) || !Array.isArray(importData.data.assemblyItems) || !Array.isArray(importData.data.historyItems)) throw new Error('导入数据格式不正确')

  const workspaces = getWorkspaces()
  const existingWorkspace = workspaces.find(ws => ws.id === importData.workspace.id)
  let targetWorkspace

  if (existingWorkspace && options.overwrite) {
    targetWorkspace = updateWorkspace(existingWorkspace.id, { name: options.newName || `${importData.workspace.name} (导入)` })
  } else {
    targetWorkspace = createWorkspace(options.newName || `${importData.workspace.name} (导入)`)
  }

  saveWorkspaceData(targetWorkspace.id, importData.data)
  return targetWorkspace
}

export function downloadWorkspace(workspaceId, fileName = null) {
  const exportData = exportWorkspace(workspaceId)
  const workspaces = getWorkspaces()
  const workspace = workspaces.find(ws => ws.id === workspaceId)
  const defaultFileName = fileName || `${workspace.name || 'workspace'}_${new Date().toISOString().split('T')[0]}.json`
  const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = defaultFileName
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}
