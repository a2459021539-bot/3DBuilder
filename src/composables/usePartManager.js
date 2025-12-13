import { ref, watch } from 'vue'
import { icons, getPartTypeIcon } from '../config/icons.js'

export function usePartManager(assemblyItems, historyItems, uiState) {
  const partsItems = ref([])
  const pipeParams = ref({
    name: '直管 1',
    innerDiameter: 10,
    outerDiameter: 12,
    length: 100,
    segments: 8,
    bendRadius: 30,
    bendAngle: 90
  })
  
  const editingPartId = ref(null)
  const currentViewingPartId = ref(null)
  const currentPartType = ref('straight')
  const sectionCollapsed = ref(new Map())

  // Watch pipeParams for changes and dispatch update events
  // Watch pipeParams for changes and dispatch update events
  watch(pipeParams, (newParams) => {
    if (currentPartType.value === 'sketch2d') {
      // 修复: 确保2D草图模式下参数变化触发更新
      window.dispatchEvent(new CustomEvent('sketch2d-params-update', {
        detail: { ...newParams, type: 'sketch2d', forceUpdate: true }
      }))
    } else {
      window.dispatchEvent(new CustomEvent('update-pipe-preview', {
        detail: { ...newParams, type: currentPartType.value }
      }))
    }
  }, { deep: true, immediate: true })

  const partTypes = [
    { value: 'straight', label: '直管', icon: getPartTypeIcon('straight') },
    { value: 'bend', label: '弯管', icon: getPartTypeIcon('bend') },
    { value: 'reducer', label: '变径管', icon: getPartTypeIcon('reducer') },
    { value: 'sketch2d', label: '2D草图建管', icon: getPartTypeIcon('sketch2d') },
    { value: 'sketch3d', label: '3D草图建管', icon: getPartTypeIcon('sketch3d') }
  ]

  // 获取下一个可用的名称
  const getNextName = (baseName) => {
    let index = 1
    let name = `${baseName} ${index}`
    // 检查是否已存在
    while (partsItems.value.some(item => item.name === name)) {
      index++
      name = `${baseName} ${index}`
    }
    return name
  }

  const selectPartType = (type) => {
    console.log('选择的零件类型:', type)
    
    // UI updates should be handled by the caller or via callbacks, but for simplicity we modify state here if passed
    // However, strictly we should return data and let App.vue coordinate.
    // For now, we assume we update local state and allow App.vue to react.
    
    editingPartId.value = null
    currentViewingPartId.value = null
    currentPartType.value = type
    
    if (type === 'straight' || type === 'bend' || type === 'reducer') {
      const baseName = partTypes.find(t => t.value === type)?.label || '零件'
      
      if (type === 'reducer') {
        pipeParams.value = {
          name: getNextName(baseName),
          innerDiameter: 10,
          outerDiameter: 12,
          segments: 8,
          sections: [
            { distance: 50, innerDiameter: 8, outerDiameter: 10 }
          ]
        }
        sectionCollapsed.value = new Map()
        sectionCollapsed.value.set(0, false)
      } else {
        pipeParams.value = {
          name: getNextName(baseName),
          innerDiameter: 10,
          outerDiameter: 12,
          length: 100,
          segments: 8,
          bendRadius: 30,
          bendAngle: 90
        }
      }
    } else if (type === 'sketch2d') {
      const baseName = partTypes.find(t => t.value === type)?.label || '零件'
      pipeParams.value = {
        name: getNextName(baseName),
        innerDiameter: 10,
        outerDiameter: 12,
        segments: 8,
        pathData: { segments: [] }
      }
      
      window.dispatchEvent(new CustomEvent('sketch2d-params-update', {
        detail: { ...pipeParams.value, type: 'sketch2d' }
      }))
    } else {
      // 其他类型直接创建
      const baseName = partTypes.find(t => t.value === type)?.label || '零件'
      const name = getNextName(baseName)
      
      const newPart = {
        id: `part_${Date.now()}`,
        name: name,
        type: type,
        params: {},
        createTime: new Date().toLocaleString()
      }
      partsItems.value.push(newPart)
      
      // 修复: 移除新建零件时添加历史记录的代码
      // 新建操作不需要历史记录
    }
    
    // We return true to indicate params should be shown
    return true 
  }

  const editPart = (part) => {
    if (part && (part.type === 'straight' || part.type === 'bend' || part.type === 'reducer' || part.type === 'sketch2d')) {
      currentViewingPartId.value = part.id
      currentPartType.value = part.type
      editingPartId.value = part.id
      pipeParams.value = { ...part.params }
      
      // Backward compatibility
      if (part.type === 'bend') {
        if (pipeParams.value.bendRadius === undefined) pipeParams.value.bendRadius = 30
        if (pipeParams.value.bendAngle === undefined) pipeParams.value.bendAngle = 90
      }
      
      if (part.type === 'reducer') {
        if (!pipeParams.value.sections || pipeParams.value.sections.length === 0) {
          pipeParams.value.sections = [
            { distance: 50, innerDiameter: 8, outerDiameter: 10 }
          ]
        }
        sectionCollapsed.value = new Map()
        pipeParams.value.sections.forEach((_, index) => {
          sectionCollapsed.value.set(index, false)
        })
      }
      
      if (part.type === 'sketch2d') {
        if (!pipeParams.value.pathData) {
          pipeParams.value.pathData = { segments: [] }
        }
        window.dispatchEvent(new CustomEvent('sketch2d-params-update', {
          detail: { ...pipeParams.value, type: part.type }
        }))
      }
      
      if (part.type !== 'sketch2d') {
        window.dispatchEvent(new CustomEvent('view-part', {
          detail: { ...part.params, type: part.type }
        }))
      }
      
      return true // Signal to show params
    }
    return false
  }

  const savePipe = () => {
    // Check required fields
    if (currentPartType.value === 'reducer') {
      if (!pipeParams.value.sections || pipeParams.value.sections.length === 0) {
        alert('请至少添加一个截面')
        return
      }
    }
    
    const params = JSON.parse(JSON.stringify(pipeParams.value))
    
    // 对于2D草图建管，确保pathData被包含在保存的参数中
    if (currentPartType.value === 'sketch2d') {
      // pathData应该已经通过事件同步到pipeParams.value.pathData
      // 如果没有pathData，提示用户
      if (!params.pathData || !params.pathData.segments || params.pathData.segments.length === 0) {
        alert('请先绘制2D路径')
        return false
      }
    }
    
    if (editingPartId.value) {
      // Update existing
      const part = partsItems.value.find(p => p.id === editingPartId.value)
      if (part) {
        // 管道参数修改不记录历史（只记录装配操作）
        // 不再记录 update 类型的历史
        
        part.name = params.name
        part.params = params
        
        // Update instances in assembly
        if (assemblyItems) {
          assemblyItems.value.forEach(item => {
            if (item.originalPartId === part.id) {
              item.name = part.name
              item.params = { ...params }
            }
          })
          
           // Refresh assembly view if needed
           // We'll rely on App.vue to handle view refresh or trigger it here if we had access to the state
           window.dispatchEvent(new CustomEvent('refresh-assembly-view'))
        }
      }
    } else {
      // Create new
      const newPart = {
        id: `part_${Date.now()}`,
        name: params.name,
        type: currentPartType.value,
        params: params,
        createTime: new Date().toLocaleString()
      }
      partsItems.value.push(newPart)
      
      // 修复: 新建零件时不添加任何历史记录
      // 新建操作不需要历史记录
    }
    
    return true // Signal success
  }

  const deletePart = (part) => {
    if (!part) return false
    
    // Check if used in assembly
    const assemblyInstances = assemblyItems ? assemblyItems.value.filter(item => item.originalPartId === part.id) : []
    const hasAssemblyInstances = assemblyInstances.length > 0
    
    let confirmMessage = `确定要删除零件 "${part.name}" 吗？`
    if (hasAssemblyInstances) {
      confirmMessage += `\n\n该零件在装配体中有 ${assemblyInstances.length} 个实例，也将一并删除。`
    }
    confirmMessage += '\n\n此操作不可恢复。'
    
    if (!confirm(confirmMessage)) {
      return false
    }
    
    // Remove from assembly
    if (hasAssemblyInstances && assemblyItems) {
      assemblyInstances.forEach(instance => {
        const index = assemblyItems.value.findIndex(item => item.id === instance.id)
        if (index !== -1) {
          assemblyItems.value.splice(index, 1)
        }
      })
    }
    
    // Remove from parts
    const partIndex = partsItems.value.findIndex(item => item.id === part.id)
    if (partIndex !== -1) {
      partsItems.value.splice(partIndex, 1)
    }
    
    // Record history
    const historyItem = {
      id: `hist_${Date.now()}`,
      type: 'delete',
      targetId: part.id,
      name: `删除: ${part.name}`,
      time: new Date().toLocaleTimeString(),
      deletedPart: { ...part },
      deletedAssemblyInstances: hasAssemblyInstances ? assemblyInstances.map(i => ({ ...i })) : []
    }
    if (historyItems) historyItems.value.unshift(historyItem)
    
    if (currentViewingPartId.value === part.id) {
      window.dispatchEvent(new CustomEvent('clear-pipe-preview'))
    }
    
    return true
  }

  const addReducerSection = () => {
    if (!pipeParams.value.sections) pipeParams.value.sections = []
    pipeParams.value.sections.push({
      distance: 50, innerDiameter: 8, outerDiameter: 10
    })
    sectionCollapsed.value.set(pipeParams.value.sections.length - 1, false)
  }

  const removeReducerSection = (index) => {
    if (pipeParams.value.sections && pipeParams.value.sections.length > 1) {
      pipeParams.value.sections.splice(index, 1)
      // Rebuild map
      const newMap = new Map()
      pipeParams.value.sections.forEach((_, idx) => {
        newMap.set(idx, false)
      })
      sectionCollapsed.value = newMap
    } else {
      alert('至少保留一个截面')
    }
  }
  
  const toggleSectionCollapse = (index) => {
    const currentState = sectionCollapsed.value.get(index)
    sectionCollapsed.value.set(index, !currentState)
  }

  const handleLengthWheel = (e) => {
    if (e.deltaY < 0) {
      pipeParams.value.length += 10
    } else {
      pipeParams.value.length = Math.max(10, pipeParams.value.length - 10)
    }
  }

  return {
    partsItems,
    pipeParams,
    editingPartId,
    currentViewingPartId,
    currentPartType,
    sectionCollapsed,
    partTypes,
    getNextName,
    selectPartType,
    editPart,
    savePipe,
    deletePart,
    addReducerSection,
    removeReducerSection,
    toggleSectionCollapse,
    handleLengthWheel
  }
}
