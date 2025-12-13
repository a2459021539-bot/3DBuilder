import { getCurrentWorkspaceId, getWorkspaceData, saveWorkspaceData } from '../workspaceManager.js'

const MAX_HISTORY_ITEMS = 500

function isArray(value) {
  return Array.isArray(value)
}

function safeParseJSON(text) {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

function normalizeRecords(raw) {
  const partsItems = isArray(raw?.partsItems) ? raw.partsItems : []
  const assemblyItems = isArray(raw?.assemblyItems) ? raw.assemblyItems : []
  const historyItemsRaw = isArray(raw?.historyItems) ? raw.historyItems : []

  // 防止 localStorage 过大：只保留最近 N 条（约定 historyItems[0] 是最新）
  const historyItems =
    historyItemsRaw.length > MAX_HISTORY_ITEMS
      ? historyItemsRaw.slice(0, MAX_HISTORY_ITEMS)
      : historyItemsRaw

  return { partsItems, assemblyItems, historyItems }
}

export function loadRecords() {
  const workspaceId = getCurrentWorkspaceId()
  if (!workspaceId) {
    return { partsItems: [], assemblyItems: [], historyItems: [] }
  }
  
  return getWorkspaceData(workspaceId)
}

export function saveRecords({ partsItems, assemblyItems, historyItems }) {
  const workspaceId = getCurrentWorkspaceId()
  if (!workspaceId) return

  const payload = normalizeRecords({ partsItems, assemblyItems, historyItems })
  saveWorkspaceData(workspaceId, payload)
}

export function clearRecords() {
  const workspaceId = getCurrentWorkspaceId()
  if (!workspaceId) return
  
  saveWorkspaceData(workspaceId, {
    partsItems: [],
    assemblyItems: [],
    historyItems: []
  })
}


