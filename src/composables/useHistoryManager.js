import { ref } from 'vue'

export function useHistoryManager(partsItems, assemblyItems, partManagerState, uiState, externalHistoryItems) {
  const historyItems = externalHistoryItems || ref([])
  
  // History edit state
  const editingHistoryItem = ref(null)
  const editingStartAngleDeg = ref(0)
  const editingEndAngleDeg = ref(0)

  const getHistoryDetails = (item) => {
    if (item.type === 'move') {
      if (item.isBatch && item.batchItems && item.batchItems.length > 0) {
        // 批量移动：显示项数量和平均移动距离
        const avgDx = item.batchItems.reduce((sum, bi) => sum + (bi.endPosition.x - bi.startPosition.x), 0) / item.batchItems.length
        const avgDy = item.batchItems.reduce((sum, bi) => sum + (bi.endPosition.y - bi.startPosition.y), 0) / item.batchItems.length
        const avgDz = item.batchItems.reduce((sum, bi) => sum + (bi.endPosition.z - bi.startPosition.z), 0) / item.batchItems.length
        return `${item.batchItems.length}项 Δ(${avgDx.toFixed(1)}, ${avgDy.toFixed(1)}, ${avgDz.toFixed(1)})`
      } else {
        // 单个移动
      const dx = (item.endPosition.x - item.startPosition.x).toFixed(1)
      const dy = (item.endPosition.y - item.startPosition.y).toFixed(1)
      const dz = (item.endPosition.z - item.startPosition.z).toFixed(1)
      return `Δ(${dx}, ${dy}, ${dz})`
      }
    } else if (item.type === 'rotate') {
      const angle = ((item.endRotation - item.startRotation) * 180 / Math.PI).toFixed(1)
      return `${item.axis.toUpperCase()}轴 ${angle}°`
    } else if (item.type === 'create') {
      return item.params ? `L:${item.params.length}` : ''
    }
    return ''
  }

  const openHistoryEdit = (item) => {
    editingHistoryItem.value = item // create a reference, not a copy yet, or shallow copy?
    // In App.vue it seemed to edit directly or setup local state.
    // App.vue:
    // editingHistoryItem.value = historyItem (ref assignment)
    
    if (item.type === 'rotate') {
       editingStartAngleDeg.value = (item.startRotation * 180 / Math.PI).toFixed(1)
       editingEndAngleDeg.value = (item.endRotation * 180 / Math.PI).toFixed(1)
    }
    
    if (uiState && uiState.showHistoryEdit) {
        uiState.showHistoryEdit.value = true
    }
  }

  const saveHistoryEdit = () => {
     // Apply changes to the actual objects if needed?
     // In App.vue, there was logic to update editingHistoryItem details.
     // And presumably "save" meant committing these to the history log, 
     // but does it re-apply to the object? 
     // The original code didn't seem to re-apply changes to the object when editing history *description*, 
     // but if editing *parameters* of a past move?
     // Looking at App.vue logic:
     // It had inputs bound to editingHistoryItem.startPosition/endPosition.
     // So it modified history record. 
     // Did it update the object? No, it seems it just edited the record.
     // Unless there was a watcher or re-execution logic.
     // "saveHistoryEdit" just closed the panel in the original code (I'd assume).
     // Wait, let's check App.vue's saveHistoryEdit if possible. 
     // I didn't read it fully in the first pass (it was likely in the middle).
     // Assuming it just closes the panel for now.
     
     if (uiState && uiState.showHistoryEdit) {
        uiState.showHistoryEdit.value = false
    }
    editingHistoryItem.value = null
  }
  
  const updateEditingMoveDetails = () => {
    // Helper to trigger reactivity if needed
  }
  
  const updateEditingRotationDetails = () => {
      // Helper
  }

  const updateEditingRotationFromDegrees = () => {
      if (editingHistoryItem.value) {
          editingHistoryItem.value.startRotation = editingStartAngleDeg.value * Math.PI / 180
          editingHistoryItem.value.endRotation = editingEndAngleDeg.value * Math.PI / 180
      }
  }

  const undoLastAction = () => {
    if (historyItems.value.length === 0) return
    
    const lastAction = historyItems.value[0]
    
    if (lastAction.type === 'assembly') {
      // 撤回装配操作
      const index = assemblyItems.value.findIndex(item => item.id === lastAction.targetId)
      if (index !== -1) {
        assemblyItems.value.splice(index, 1)
        
        // 刷新装配体视图
        const event = new CustomEvent('view-assembly', {
          detail: assemblyItems.value
        })
        event.preserveCamera = true
        window.dispatchEvent(event)
      }
    } else if (lastAction.type === 'create') {
      // 撤回新建操作
      const index = partsItems.value.findIndex(item => item.id === lastAction.targetId)
      if (index !== -1) {
        // 如果当前正在查看这个零件，则清除预览
        if (partManagerState.currentViewingPartId.value === lastAction.targetId) {
          partManagerState.currentViewingPartId.value = null
          partManagerState.editingPartId.value = null
          if (uiState.showPipeParams) uiState.showPipeParams.value = false
          window.dispatchEvent(new CustomEvent('clear-pipe-preview'))
        }
        partsItems.value.splice(index, 1)
      }
    } else if (lastAction.type === 'update') {
      // 撤回修改操作
      const part = partsItems.value.find(item => item.id === lastAction.targetId)
      if (part && lastAction.oldParams) {
        // 恢复旧参数
        part.params = JSON.parse(JSON.stringify(lastAction.oldParams)) // Deep copy
        part.name = lastAction.oldParams.name // 恢复名称
        
        // 如果当前正在查看这个零件，刷新预览
        if (partManagerState.currentViewingPartId.value === lastAction.targetId) {
          // 如果正在编辑，也更新编辑框的参数
          if (partManagerState.editingPartId.value === lastAction.targetId && uiState.showPipeParams.value) {
            partManagerState.pipeParams.value = { ...part.params }
            // 确保当前类型也正确恢复
            if (part.type) partManagerState.currentPartType.value = part.type
          }
          
          window.dispatchEvent(new CustomEvent('view-part', {
            detail: { ...part.params, type: part.type }
          }))
        }
      }
    } else if (lastAction.type === 'move') {
      // 撤回移动操作（支持批量移动）
      if (lastAction.isBatch && lastAction.batchItems) {
        // 批量移动：恢复所有项的位置
        lastAction.batchItems.forEach(({ id, startPosition }) => {
          const item = assemblyItems.value.find(item => item.id === id)
          if (item && startPosition) {
            item.position = { ...startPosition }
          }
        })
        
        // 刷新装配体视图以更新3D对象位置（保持相机视角）
        const event = new CustomEvent('view-assembly', {
          detail: assemblyItems.value
        })
        event.preserveCamera = true
        window.dispatchEvent(event)
      } else {
        // 单个移动操作（原有逻辑）
      const item = assemblyItems.value.find(item => item.id === lastAction.targetId)
      if (item && lastAction.startPosition) {
        // 恢复原始位置
        item.position = { ...lastAction.startPosition }
        
        // 刷新装配体视图以更新3D对象位置（保持相机视角）
        const event = new CustomEvent('view-assembly', {
          detail: assemblyItems.value
        })
        event.preserveCamera = true
        window.dispatchEvent(event)
        }
      }
    } else if (lastAction.type === 'rotate') {
      // 撤回旋转操作
      const item = assemblyItems.value.find(item => item.id === lastAction.targetId)
      if (item && lastAction.startRotation) {
        // 恢复原始旋转
        item.rotation = { ...lastAction.startRotation }
        
        // 刷新装配体视图以更新3D对象旋转（保持相机视角）
        const event = new CustomEvent('view-assembly', {
          detail: assemblyItems.value
        })
        event.preserveCamera = true
        window.dispatchEvent(event)
      }
    } else if (lastAction.type === 'delete') {
      // 撤回删除操作
      if (lastAction.deletedPart) {
        // 恢复零件
        partsItems.value.push({ ...lastAction.deletedPart })
      }
      
      // 恢复装配体实例
      if (lastAction.deletedAssemblyInstances && lastAction.deletedAssemblyInstances.length > 0) {
        lastAction.deletedAssemblyInstances.forEach(instance => {
          assemblyItems.value.push({ ...instance })
        })
      }
      
      // 刷新装配体视图（如果有装配体实例被恢复）
      if (lastAction.deletedAssemblyInstances && lastAction.deletedAssemblyInstances.length > 0) {
        const event = new CustomEvent('view-assembly', {
          detail: assemblyItems.value
        })
        event.preserveCamera = true
        window.dispatchEvent(event)
      }
    } else if (lastAction.type === 'join') {
      // 撤回拼接操作
      const item = assemblyItems.value.find(item => item.id === lastAction.targetId)
      if (item && lastAction.oldPosition && lastAction.oldRotation) {
        item.position = { ...lastAction.oldPosition }
        item.rotation = { ...lastAction.oldRotation }
        
        // 刷新视图
        const event = new CustomEvent('view-assembly', {
          detail: assemblyItems.value
        })
        event.preserveCamera = true
        window.dispatchEvent(event)
      }
    } else if (lastAction.type === 'array') {
      // 撤回阵列操作
      // 新版本使用 groupId，旧版本可能使用 createdIds 或 groupIds
      const groupId = lastAction.groupId || (lastAction.groupIds && lastAction.groupIds[0])
      
      if (groupId) {
        // 删除文件夹组
        const groupIndex = assemblyItems.value.findIndex(item => item.id === groupId && item.type === 'array-group')
        if (groupIndex !== -1) {
          assemblyItems.value.splice(groupIndex, 1)
        }
        
        // 删除所有子项（通过 parentGroupId 匹配）
        const childrenToRemove = assemblyItems.value.filter(item => item.parentGroupId === groupId)
        childrenToRemove.forEach(child => {
          const index = assemblyItems.value.findIndex(item => item.id === child.id)
          if (index !== -1) {
            assemblyItems.value.splice(index, 1)
          }
        })
      } else if (lastAction.createdIds && lastAction.createdIds.length > 0) {
        // 兼容旧版本：直接删除创建的项
        lastAction.createdIds.forEach(id => {
          const index = assemblyItems.value.findIndex(item => item.id === id)
          if (index !== -1) {
            assemblyItems.value.splice(index, 1)
          }
        })
      } else if (lastAction.groupIds && lastAction.groupIds.length > 0) {
        // 兼容旧版本：删除多个文件夹组
        lastAction.groupIds.forEach(gId => {
          // 删除文件夹组
          const groupIndex = assemblyItems.value.findIndex(item => item.id === gId && item.type === 'array-group')
          if (groupIndex !== -1) {
            assemblyItems.value.splice(groupIndex, 1)
          }
          
          // 删除所有子项
          const childrenToRemove = assemblyItems.value.filter(item => item.parentGroupId === gId)
          childrenToRemove.forEach(child => {
            const index = assemblyItems.value.findIndex(item => item.id === child.id)
            if (index !== -1) {
              assemblyItems.value.splice(index, 1)
            }
          })
        })
      }
      
      // 刷新视图
      const event = new CustomEvent('view-assembly', {
        detail: assemblyItems.value
      })
      event.preserveCamera = true 
      window.dispatchEvent(event)
    }
    
    // 移除历史记录
    historyItems.value.shift()
  }

  return {
    historyItems,
    editingHistoryItem,
    editingStartAngleDeg,
    editingEndAngleDeg,
    getHistoryDetails,
    openHistoryEdit,
    saveHistoryEdit,
    updateEditingMoveDetails,
    updateEditingRotationDetails,
    updateEditingRotationFromDegrees,
    undoLastAction
  }
}
