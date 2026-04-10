import { ref } from 'vue'
import * as InstancedManager from '../utils/instancedAssemblyManager.js'

export function useTransformLogic(assemblyItems, historyItems) {
  // 旋转模式相关状态
  const isRotationMode = ref(false)
  const rotationAxis = ref('z')
  const rotationAngle = ref(0)
  const selectedAssemblyItemId = ref(null)

  // 阵列模式相关状态
  const isArrayMode = ref(false)
  const arraySelection = ref([])
  const arrayDirection = ref('x')
  const arraySign = ref(1)
  const arraySpacing = ref(50)
  const arrayCount = ref(3)

  // 移动/旋转参数面板相关状态
  const transformType = ref('move') // 'move' 或 'rotate'
  const transformingItemId = ref(null)
  const transformPosition = ref({ x: 0, y: 0, z: 0 })
  const transformRotation = ref({ x: 0, y: 0, z: 0 })
  const transformRotationDeg = ref({ x: 0, y: 0, z: 0 })
  const transformAxis = ref('z')
  const movePlane = ref('free') // 'free', 'xy', 'yz', 'zx'

  // 批量移动状态：transformPosition 表示相对锚点起点的 delta，而不是绝对位置
  const isBatchMove = ref(false)
  // id → {x,y,z}：每个被批量选中零件在面板打开时的初始位置
  const batchSnapshotPositions = ref(new Map())

  const setBatchMoveMode = (items, anchorId) => {
    isBatchMove.value = true
    batchSnapshotPositions.value = new Map()
    items.forEach(({ id, position }) => {
      batchSnapshotPositions.value.set(id, { x: position.x, y: position.y, z: position.z })
    })
    transformingItemId.value = anchorId
    transformPosition.value = { x: 0, y: 0, z: 0 }
  }

  const clearBatchMoveMode = () => {
    isBatchMove.value = false
    batchSnapshotPositions.value = new Map()
  }

  const setMode = (mode) => {
    // Reset all modes first
    isRotationMode.value = false
    isArrayMode.value = false
    // Note: isJoinMode is handled in useJoinLogic, caller (App.vue) should handle mutual exclusion
    
    if (mode === 'rotate') {
      isRotationMode.value = true
    } else if (mode === 'array') {
      isArrayMode.value = true
    }
  }

  const startRotationSnapshot = ref(null)

  const updateRotationAxis = () => {
    if (selectedAssemblyItemId.value && assemblyItems.value) {
      const item = assemblyItems.value.find(i => i.id === selectedAssemblyItemId.value)
      if (item && item.rotation) {
        const axis = rotationAxis.value
        // Convert rad to deg
        rotationAngle.value = parseFloat((item.rotation[axis] * 180 / Math.PI).toFixed(1))
        // Snapshot the rotation for history recording (before user edits via input)
        startRotationSnapshot.value = { ...item.rotation }
      }
    }
  }

  const previewRotationAngle = () => {
    if (selectedAssemblyItemId.value && assemblyItems.value) {
      const item = assemblyItems.value.find(i => i.id === selectedAssemblyItemId.value)
      if (item && item.rotation) {
        const axis = rotationAxis.value
        const newAngleRad = rotationAngle.value * Math.PI / 180
        
        // Construct new rotation object
        const newRotation = { ...item.rotation }
        newRotation[axis] = newAngleRad
        
        // Update item local state immediately for responsiveness
        item.rotation = newRotation

        window.dispatchEvent(new CustomEvent('assembly-item-rotation-updated', {
            detail: {
                id: selectedAssemblyItemId.value,
                rotation: newRotation,
                isUserInput: true
            }
        }))
      }
    }
  }

  const applyRotationAngle = () => {
    if (!selectedAssemblyItemId.value || !assemblyItems) return
    
    const item = assemblyItems.value.find(i => i.id === selectedAssemblyItemId.value)
    if (item) {
      // Apply rotation logic here
      // For now, we assume the 3D scene handles the actual rotation via events or binding, 
      // but if we need to update data:
      // item.rotation[rotationAxis.value] += rotationAngle.value * Math.PI / 180
      
      // Dispatch event to scene to apply
      window.dispatchEvent(new CustomEvent('apply-rotation', {
        detail: {
            id: selectedAssemblyItemId.value,
            axis: rotationAxis.value,
            angle: rotationAngle.value,
            startRotation: startRotationSnapshot.value
        }
      }))
      
      // Record history
      if (historyItems) {
          // Complex history recording might need start/end states
      }
    }
  }

  const resetArraySelection = () => {
    // 不再直接操作 arraySelection，而是通过事件通知清除选择
    window.dispatchEvent(new CustomEvent('assembly-selection-changed', {
      detail: { selectedIds: [] }
    }))
  }

  const executeArray = (selectedIds, onProgress) => {
    if (!assemblyItems || !selectedIds || selectedIds.length === 0) return

    const sourceItems = assemblyItems.value.filter(item => selectedIds.includes(item.id))

    // 创建一个文件夹组，包含所有阵列产生的新管道
    const timestamp = Date.now()
    const groupId = `array_group_${timestamp}_${Math.floor(Math.random() * 10000)}`
    const groupChildren = []
    const sourceItemNames = sourceItems.map(item => item.name).join('、')
    const total = sourceItems.length * arrayCount.value
    let done = 0

    // 为每个源项创建阵列副本
    sourceItems.forEach((source, sourceIdx) => {
      for (let i = 1; i <= arrayCount.value; i++) {
        const newItem = JSON.parse(JSON.stringify(source))
        newItem.id = `${groupId}_${sourceIdx}_copy_${i}`
        newItem.parentGroupId = groupId
        // 确保子项没有 type 属性（或者明确设置为非 array-group）
        if (newItem.type === 'array-group') {
          delete newItem.type
        }

        newItem.name = `${source.name} (副本${i})`

        // Calculate offset
        const offset = i * arraySpacing.value * arraySign.value
        newItem.position[arrayDirection.value] += offset

        newItem.assemblyTime = new Date().toLocaleString()
        groupChildren.push(newItem)
        done++
        if (onProgress) onProgress(Math.round(done / total * 80))
      }
    })
    
    // 创建文件夹组
    const totalCount = sourceItems.length * arrayCount.value
    const groupItem = {
      id: groupId,
      type: 'array-group',
      name: `阵列【生成${totalCount}个】`,
      children: groupChildren,
      expanded: false, // 默认折叠
      arrayConfig: {
        direction: arrayDirection.value,
        sign: arraySign.value,
        spacing: arraySpacing.value,
        count: arrayCount.value,
        sourceIds: sourceItems.map(item => item.id)
      },
      assemblyTime: new Date().toLocaleString()
      // 确保文件夹本身没有 parentGroupId，这样它才会显示在顶级列表中
    }
    // 明确确保没有 parentGroupId
    if (groupItem.parentGroupId) {
      delete groupItem.parentGroupId
    }
    
    // 添加文件夹组到装配体（先添加文件夹，再添加子项）
    assemblyItems.value.push(groupItem)
    
    // 将所有子项也添加到装配体（扁平化，但标记了 parentGroupId）
    groupChildren.forEach(child => {
      assemblyItems.value.push(child)
    })
    if (onProgress) onProgress(90)
    
    // Record history
    const historyItem = {
      id: `hist_${Date.now()}`,
      type: 'array',
      count: totalCount,
      name: `阵列: ${sourceItems.length}个源项，共${totalCount}个副本`,
      time: new Date().toLocaleTimeString(),
      groupId: groupId
    }
    if (historyItems) historyItems.value.unshift(historyItem)
    
    // Refresh view (保持相机视角)
    const viewEvent = new CustomEvent('view-assembly', {
      detail: assemblyItems.value
    })
    viewEvent.preserveCamera = true
    window.dispatchEvent(viewEvent)
    
    // Reset selection
    resetArraySelection()
  }

  const setMovePlane = (plane) => {
    movePlane.value = plane
  }

  const updateTransformPosition = () => {
    if (!assemblyItems) return

    if (isBatchMove.value && batchSnapshotPositions.value.size > 0) {
      // 批量模式：transformPosition.value 是相对各自快照的 delta
      const delta = transformPosition.value
      for (const [id, snapshot] of batchSnapshotPositions.value) {
        const item = assemblyItems.value.find(i => i.id === id)
        if (!item) continue
        const newPos = {
          x: snapshot.x + (delta.x || 0),
          y: snapshot.y + (delta.y || 0),
          z: snapshot.z + (delta.z || 0)
        }
        item.position = newPos

        // 同步 3D 场景：弹出的临时 Group 直接改 position；
        // 未弹出的零件通过 InstancedMesh 实例矩阵更新
        const popped = InstancedManager.getPoppedGroup(id)
        if (popped) {
          popped.position.set(newPos.x, newPos.y, newPos.z)
          popped.updateMatrix()
          popped.updateMatrixWorld(true)
        } else {
          const t = InstancedManager.getItemTransform(id)
          InstancedManager.updateItemTransform(id, newPos, t?.rotation || item.rotation || { x: 0, y: 0, z: 0 })
        }
      }
      window.dispatchEvent(new CustomEvent('request-render'))
      return
    }

    if (transformingItemId.value) {
      const item = assemblyItems.value.find(i => i.id === transformingItemId.value)
      if (item) {
        item.position = { ...transformPosition.value }
        // 同步 3D 场景
        const popped = InstancedManager.getPoppedGroup(item.id)
        if (popped) {
          popped.position.set(item.position.x, item.position.y, item.position.z)
          popped.updateMatrix()
          popped.updateMatrixWorld(true)
        } else {
          const t = InstancedManager.getItemTransform(item.id)
          InstancedManager.updateItemTransform(item.id, item.position, t?.rotation || item.rotation || { x: 0, y: 0, z: 0 })
        }
        window.dispatchEvent(new CustomEvent('request-render'))
      }
    }
  }
  
  const updateTransformRotationFromDegrees = () => {
      if (transformingItemId.value && assemblyItems) {
        const item = assemblyItems.value.find(i => i.id === transformingItemId.value)
        if (item) {
            item.rotation = {
                x: transformRotationDeg.value.x * Math.PI / 180,
                y: transformRotationDeg.value.y * Math.PI / 180,
                z: transformRotationDeg.value.z * Math.PI / 180
            }
            window.dispatchEvent(new CustomEvent('update-part-transform', {
               detail: { id: item.id, rotation: item.rotation, isUserInput: true }
           }))
        }
      }
  }

  return {
    isRotationMode,
    rotationAxis,
    rotationAngle,
    selectedAssemblyItemId,
    isArrayMode,
    arrayDirection,
    arraySign,
    arraySpacing,
    arrayCount,
    transformType,
    transformingItemId,
    transformPosition,
    transformRotation,
    transformRotationDeg,
    transformAxis,
    movePlane,
    setMode,
    updateRotationAxis,
    previewRotationAngle,
    applyRotationAngle,
    resetArraySelection,
    executeArray,
    setMovePlane,
    updateTransformPosition,
    updateTransformRotationFromDegrees,
    isBatchMove,
    batchSnapshotPositions,
    setBatchMoveMode,
    clearBatchMoveMode
  }
}
