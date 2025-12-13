/**
 * 工作空间管理工具
 * 管理多个工作空间的创建、删除、切换和数据存储
 */

const WORKSPACES_KEY = '3dbuild.workspaces.v1'
const CURRENT_WORKSPACE_KEY = '3dbuild.currentWorkspace.v1'
const WORKSPACE_DATA_PREFIX = '3dbuild.workspace.data.'

/**
 * 获取所有工作空间列表
 */
export function getWorkspaces() {
  if (typeof window === 'undefined' || !window.localStorage) {
    return []
  }

  try {
    const text = window.localStorage.getItem(WORKSPACES_KEY)
    if (!text) return []
    
    const workspaces = JSON.parse(text)
    return Array.isArray(workspaces) ? workspaces : []
  } catch {
    return []
  }
}

/**
 * 保存工作空间列表
 */
export function saveWorkspaces(workspaces) {
  if (typeof window === 'undefined' || !window.localStorage) return
  
  try {
    window.localStorage.setItem(WORKSPACES_KEY, JSON.stringify(workspaces))
  } catch {
    // 静默失败
  }
}

/**
 * 创建新工作空间
 */
export function createWorkspace(name) {
  const workspaces = getWorkspaces()
  const id = `workspace_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  const newWorkspace = {
    id,
    name: name || `工作空间 ${workspaces.length + 1}`,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }
  
  workspaces.push(newWorkspace)
  saveWorkspaces(workspaces)
  
  // 初始化工作空间数据
  saveWorkspaceData(id, {
    partsItems: [],
    assemblyItems: [],
    historyItems: []
  })
  
  return newWorkspace
}

/**
 * 删除工作空间
 */
export function deleteWorkspace(id) {
  const workspaces = getWorkspaces()
  const filtered = workspaces.filter(ws => ws.id !== id)
  saveWorkspaces(filtered)
  
  // 删除工作空间数据
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      window.localStorage.removeItem(WORKSPACE_DATA_PREFIX + id)
    } catch {
      // 静默失败
    }
  }
  
  return filtered
}

/**
 * 更新工作空间信息
 */
export function updateWorkspace(id, updates) {
  const workspaces = getWorkspaces()
  const index = workspaces.findIndex(ws => ws.id === id)
  if (index === -1) return null
  
  workspaces[index] = {
    ...workspaces[index],
    ...updates,
    updatedAt: new Date().toISOString()
  }
  saveWorkspaces(workspaces)
  
  return workspaces[index]
}

/**
 * 获取当前工作空间ID
 */
export function getCurrentWorkspaceId() {
  if (typeof window === 'undefined' || !window.localStorage) {
    return null
  }
  
  try {
    return window.localStorage.getItem(CURRENT_WORKSPACE_KEY)
  } catch {
    return null
  }
}

/**
 * 设置当前工作空间ID
 */
export function setCurrentWorkspaceId(id) {
  if (typeof window === 'undefined' || !window.localStorage) return
  
  try {
    if (id) {
      window.localStorage.setItem(CURRENT_WORKSPACE_KEY, id)
    } else {
      window.localStorage.removeItem(CURRENT_WORKSPACE_KEY)
    }
  } catch {
    // 静默失败
  }
}

/**
 * 获取工作空间数据
 */
export function getWorkspaceData(workspaceId) {
  if (typeof window === 'undefined' || !window.localStorage) {
    return { partsItems: [], assemblyItems: [], historyItems: [] }
  }
  
  try {
    const key = WORKSPACE_DATA_PREFIX + workspaceId
    const text = window.localStorage.getItem(key)
    if (!text) {
      return { partsItems: [], assemblyItems: [], historyItems: [] }
    }
    
    const data = JSON.parse(text)
    return {
      partsItems: Array.isArray(data.partsItems) ? data.partsItems : [],
      assemblyItems: Array.isArray(data.assemblyItems) ? data.assemblyItems : [],
      historyItems: Array.isArray(data.historyItems) ? data.historyItems : []
    }
  } catch {
    return { partsItems: [], assemblyItems: [], historyItems: [] }
  }
}

/**
 * 保存工作空间数据
 */
export function saveWorkspaceData(workspaceId, data) {
  if (typeof window === 'undefined' || !window.localStorage) return
  
  try {
    const key = WORKSPACE_DATA_PREFIX + workspaceId
    const payload = {
      partsItems: Array.isArray(data.partsItems) ? data.partsItems : [],
      assemblyItems: Array.isArray(data.assemblyItems) ? data.assemblyItems : [],
      historyItems: Array.isArray(data.historyItems) ? data.historyItems : []
    }
    window.localStorage.setItem(key, JSON.stringify(payload))
    
    // 更新工作空间的更新时间
    updateWorkspace(workspaceId, { updatedAt: new Date().toISOString() })
  } catch {
    // 静默失败
  }
}

/**
 * 检查是否需要显示工作空间选择对话框
 */
export function shouldShowWorkspaceSelector() {
  const currentId = getCurrentWorkspaceId()
  if (currentId) {
    // 检查工作空间是否还存在
    const workspaces = getWorkspaces()
    return workspaces.some(ws => ws.id === currentId)
  }
  return true // 没有当前工作空间，需要选择
}

/**
 * 导出工作空间数据
 * @param {string} workspaceId - 工作空间ID
 * @returns {Object} 包含工作空间信息和数据的对象
 */
export function exportWorkspace(workspaceId) {
  const workspaces = getWorkspaces()
  const workspace = workspaces.find(ws => ws.id === workspaceId)
  
  if (!workspace) {
    throw new Error('工作空间不存在')
  }
  
  const data = getWorkspaceData(workspaceId)
  
  return {
    version: '1.0',
    exportDate: new Date().toISOString(),
    workspace: {
      id: workspace.id,
      name: workspace.name,
      createdAt: workspace.createdAt,
      updatedAt: workspace.updatedAt
    },
    data: {
      partsItems: data.partsItems,
      assemblyItems: data.assemblyItems,
      historyItems: data.historyItems
    }
  }
}

/**
 * 导入工作空间数据
 * @param {Object} importData - 导入的数据对象
 * @param {Object} options - 导入选项 { overwrite: boolean, newName: string }
 * @returns {Object} 导入后的工作空间对象
 */
export function importWorkspace(importData, options = {}) {
  // 验证数据格式
  if (!importData || typeof importData !== 'object') {
    throw new Error('无效的导入数据格式')
  }
  
  if (!importData.workspace || !importData.data) {
    throw new Error('导入数据缺少必要字段')
  }
  
  if (!Array.isArray(importData.data.partsItems) || 
      !Array.isArray(importData.data.assemblyItems) || 
      !Array.isArray(importData.data.historyItems)) {
    throw new Error('导入数据格式不正确')
  }
  
  const workspaces = getWorkspaces()
  const existingWorkspace = workspaces.find(ws => ws.id === importData.workspace.id)
  
  let targetWorkspaceId
  let targetWorkspace
  
  if (existingWorkspace && options.overwrite) {
    // 覆盖现有工作空间
    targetWorkspaceId = existingWorkspace.id
    targetWorkspace = updateWorkspace(existingWorkspace.id, {
      name: options.newName || `${importData.workspace.name} (导入)`,
      updatedAt: new Date().toISOString()
    })
  } else {
    // 创建新工作空间
    const newName = options.newName || `${importData.workspace.name} (导入)`
    targetWorkspace = createWorkspace(newName)
    targetWorkspaceId = targetWorkspace.id
  }
  
  // 导入数据
  saveWorkspaceData(targetWorkspaceId, {
    partsItems: importData.data.partsItems,
    assemblyItems: importData.data.assemblyItems,
    historyItems: importData.data.historyItems
  })
  
  return targetWorkspace
}

/**
 * 下载工作空间为JSON文件
 * @param {string} workspaceId - 工作空间ID
 * @param {string} fileName - 文件名（可选）
 */
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
