/**
 * 工作空间管理工具
 * 使用 sql.js (SQLite WASM) 存储，数据持久化到 IndexedDB
 * 数据拆分为 parts / assembly_items / history 三张表
 */

import { getDB, kvGet, kvSet, kvDelete, schedulePersist } from './sqliteStore.js'

// ── 工作空间 CRUD ──

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
    db.run('INSERT INTO workspaces VALUES (?,?,?,?)',
      [newWorkspace.id, newWorkspace.name, newWorkspace.createdAt, newWorkspace.updatedAt])
  }
  // 新工作空间不需要插入空数据，表本身就没有该 workspace_id 的行
  schedulePersist()
  return newWorkspace
}

export function deleteWorkspace(id) {
  const db = getDB()
  if (db) {
    db.run('DELETE FROM workspaces WHERE id = ?', [id])
    db.run('DELETE FROM parts WHERE workspace_id = ?', [id])
    db.run('DELETE FROM assembly_items WHERE workspace_id = ?', [id])
    db.run('DELETE FROM history WHERE workspace_id = ?', [id])
    // 兼容旧表
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
    db.run('UPDATE workspaces SET name=?, createdAt=?, updatedAt=? WHERE id=?',
      [updated.name, updated.createdAt, updated.updatedAt, id])
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

// ── 工作空间数据读写（拆分表） ──

const MAX_HISTORY_ITEMS = 500

export function getWorkspaceData(workspaceId) {
  const db = getDB()
  const empty = { partsItems: [], assemblyItems: [], historyItems: [] }
  if (!db) return empty

  try {
    // 读取零件
    const partsRes = db.exec(
      'SELECT id, name, type, params_json, create_time FROM parts WHERE workspace_id = ? ORDER BY create_time',
      [workspaceId]
    )
    const partsItems = partsRes.length > 0
      ? partsRes[0].values.map(([id, name, type, paramsJson, createTime]) => ({
          id, name, type,
          params: paramsJson ? JSON.parse(paramsJson) : {},
          createTime
        }))
      : []

    // 读取装配体
    const asmRes = db.exec(
      'SELECT id, original_part_id, name, type, params_json, pos_x, pos_y, pos_z, rot_x, rot_y, rot_z, assembly_time FROM assembly_items WHERE workspace_id = ? ORDER BY assembly_time',
      [workspaceId]
    )
    const assemblyItems = asmRes.length > 0
      ? asmRes[0].values.map(([id, originalPartId, name, type, paramsJson, px, py, pz, rx, ry, rz, assemblyTime]) => {
          // params_json 同时保存 params 和所有非 schema 列字段（parentGroupId/arrayConfig/expanded/children/...）
          let params = {}
          let extras = {}
          if (paramsJson) {
            try {
              const parsed = JSON.parse(paramsJson)
              if (parsed && typeof parsed === 'object' && parsed.__params !== undefined) {
                params = parsed.__params || {}
                extras = parsed.__extras || {}
              } else {
                // 兼容旧格式：整个 JSON 都是 params
                params = parsed || {}
              }
            } catch {}
          }
          return {
            id, originalPartId, name, type, params,
            position: { x: px || 0, y: py || 0, z: pz || 0 },
            rotation: { x: rx || 0, y: ry || 0, z: rz || 0 },
            assemblyTime,
            ...extras
          }
        })
      : []

    // 读取历史
    const histRes = db.exec(
      'SELECT id, type, target_id, name, time, data_json FROM history WHERE workspace_id = ? ORDER BY seq',
      [workspaceId]
    )
    const historyItems = histRes.length > 0
      ? histRes[0].values.map(([id, type, targetId, name, time, dataJson]) => {
          const base = { id, type, targetId, name, time }
          if (dataJson) {
            try { Object.assign(base, JSON.parse(dataJson)) } catch {}
          }
          return base
        })
      : []

    return { partsItems, assemblyItems, historyItems }
  } catch (e) {
    console.warn('读取工作空间数据失败:', e)
    return empty
  }
}

export function saveWorkspaceData(workspaceId, data) {
  const db = getDB()
  if (!db) return

  const partsItems = Array.isArray(data.partsItems) ? data.partsItems : []
  const assemblyItems = Array.isArray(data.assemblyItems) ? data.assemblyItems : []
  let historyItems = Array.isArray(data.historyItems) ? data.historyItems : []
  if (historyItems.length > MAX_HISTORY_ITEMS) {
    historyItems = historyItems.slice(0, MAX_HISTORY_ITEMS)
  }

  // 整个写入包在一个事务里（否则每条 INSERT 都是独立事务，极慢）
  db.run('BEGIN TRANSACTION')
  let failedItem = null
  try {
    // ── 写入零件 ──
    db.run('DELETE FROM parts WHERE workspace_id = ?', [workspaceId])
    for (const p of partsItems) {
      if (!p.id) { failedItem = { kind: 'part', item: p, reason: '缺少 id' }; throw new Error('零件缺少 id') }
      db.run('INSERT INTO parts VALUES (?,?,?,?,?,?)', [
        p.id, workspaceId,
        p.name || null,
        p.type || 'straight',
        p.params ? JSON.stringify(p.params) : null,
        p.createTime || null
      ])
    }

    // ── 写入装配体 ──
    db.run('DELETE FROM assembly_items WHERE workspace_id = ?', [workspaceId])
    // 这些是有专用列或会被显式恢复的字段，不进 extras
    const ASM_KNOWN_KEYS = new Set([
      'id', 'originalPartId', 'name', 'type', 'params',
      'position', 'rotation', 'assemblyTime'
    ])
    for (const a of assemblyItems) {
      if (!a.id) { failedItem = { kind: 'assembly', item: a, reason: '缺少 id' }; throw new Error('装配项缺少 id') }
      // 收集 schema 之外的所有字段（parentGroupId / arrayConfig / expanded / children / ...）
      const extras = {}
      for (const k in a) {
        if (!ASM_KNOWN_KEYS.has(k)) extras[k] = a[k]
      }
      // 包成 { __params, __extras } 双字段格式（带前缀避免与原 params 字段冲突）
      const wrapped = { __params: a.params || {}, __extras: extras }

      db.run('INSERT INTO assembly_items VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)', [
        a.id, workspaceId,
        a.originalPartId || null,
        a.name || null,
        a.type || 'straight',
        JSON.stringify(wrapped),
        a.position?.x || 0, a.position?.y || 0, a.position?.z || 0,
        a.rotation?.x || 0, a.rotation?.y || 0, a.rotation?.z || 0,
        a.assemblyTime || null
      ])
    }

    // ── 写入历史 ──
    db.run('DELETE FROM history WHERE workspace_id = ?', [workspaceId])
    for (let i = 0; i < historyItems.length; i++) {
      const h = historyItems[i]
      const { id, type, targetId, name, time, ...rest } = h
      db.run('INSERT INTO history VALUES (?,?,?,?,?,?,?,?)', [
        workspaceId, i,
        id || null, type || 'unknown', targetId || null,
        name || null, time || null,
        Object.keys(rest).length > 0 ? JSON.stringify(rest) : null
      ])
    }

    db.run('COMMIT')
  } catch (e) {
    try { db.run('ROLLBACK') } catch {}
    console.error('[saveWorkspaceData] 失败:', e, failedItem || '')
    throw new Error(`保存工作空间数据失败: ${e.message}${failedItem ? ` (${failedItem.kind} ${failedItem.reason})` : ''}`)
  }

  updateWorkspace(workspaceId, { updatedAt: new Date().toISOString() })
}

// ── 工作空间选择器 ──

export function shouldShowWorkspaceSelector() {
  const currentId = getCurrentWorkspaceId()
  if (currentId) {
    const workspaces = getWorkspaces()
    return workspaces.some(ws => ws.id === currentId)
  }
  return true
}

// ── 导入导出 ──

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
  const isNewWorkspace = !(existingWorkspace && options.overwrite)

  if (existingWorkspace && options.overwrite) {
    targetWorkspace = updateWorkspace(existingWorkspace.id, { name: options.newName || `${importData.workspace.name} (导入)` })
  } else {
    targetWorkspace = createWorkspace(options.newName || `${importData.workspace.name} (导入)`)
  }

  if (!targetWorkspace || !targetWorkspace.id) {
    throw new Error('创建/更新工作空间失败')
  }

  try {
    saveWorkspaceData(targetWorkspace.id, importData.data)
  } catch (e) {
    // 失败回滚：如果是新建的工作空间，删除避免留下空壳
    if (isNewWorkspace) {
      try { deleteWorkspace(targetWorkspace.id) } catch {}
    }
    throw e
  }

  // 完整性校验：写完后立刻读回，确认条数对得上
  const verify = getWorkspaceData(targetWorkspace.id)
  const expectedParts = importData.data.partsItems.length
  const expectedAsm = importData.data.assemblyItems.length
  if (verify.partsItems.length !== expectedParts || verify.assemblyItems.length !== expectedAsm) {
    throw new Error(`数据校验失败：写入 ${expectedParts} 零件 / ${expectedAsm} 装配，读回 ${verify.partsItems.length} / ${verify.assemblyItems.length}`)
  }

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
