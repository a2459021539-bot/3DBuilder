import { ref } from 'vue'

/**
 * Bridges CustomEvent handlers from ThreeScene to App.vue state.
 *
 * @param {import('vue').Ref<Array>} assemblyItems - reactive assembly items list
 * @param {import('vue').Ref<Array>} historyItems  - reactive history items list
 * @param {Object} transformLogic - refs/methods for the transform panel:
 *   { transformType, transformingItemId, transformPosition, transformRotation,
 *     transformRotationDeg, showTransformPanel, closePipeParams, closeHistoryEdit,
 *     showPipeParams, showHistoryEdit }
 * @param {Object} joinLogic - refs/methods for join mode:
 *   { isJoinMode, firstSelectedEndFace, secondSelectedEndFace, isJoinPositioned,
 *     moveFirstPipe, joinRotationAngle }
 * @param {Object} uiState - misc UI refs:
 *   { selectedAssemblyItemId, updateRotationAxis, currentPartType, pipeParams }
 */
export function useEventBridge(assemblyItems, historyItems, transformLogic, joinLogic, uiState) {
  const rendererType = ref('webgl')

  // ---- History helpers ----

  const addOrMergeHistory = (newHistoryItem) => {
    if (historyItems.value.length > 0) {
      const lastItem = historyItems.value[0]

      // Check for mergeable 'move' operations
      if (newHistoryItem.type === 'move' && lastItem.type === 'move' && lastItem.targetId === newHistoryItem.targetId) {
        lastItem.endPosition = { ...newHistoryItem.endPosition }
        lastItem.time = newHistoryItem.time
        return
      }

      // Check for mergeable 'rotate' operations
      if (newHistoryItem.type === 'rotate' && lastItem.type === 'rotate' && lastItem.targetId === newHistoryItem.targetId && lastItem.axis === newHistoryItem.axis) {
        lastItem.endRotation = { ...newHistoryItem.endRotation }
        lastItem.time = newHistoryItem.time
        return
      }
    }

    // If not merged, add as new item
    historyItems.value.unshift(newHistoryItem)

    // Limit history size (keep last 50)
    if (historyItems.value.length > 50) {
      historyItems.value.pop()
    }
  }

  // ---- Drag / Move ----

  const handleDragEnded = (event) => {
    const { id, endPosition, startPosition } = event.detail
    const item = assemblyItems.value.find(i => i.id === id)
    if (item) {
      const historyItem = {
        id: `hist_${Date.now()}`,
        type: 'move',
        targetId: id,
        name: `移动: ${item.name}`,
        time: new Date().toLocaleTimeString(),
        startPosition: { ...startPosition },
        endPosition: { ...endPosition }
      }
      addOrMergeHistory(historyItem)
      item.position = { ...endPosition }
    }
  }

  const handleBatchDragEnded = (event) => {
    const { items } = event.detail
    if (!items || items.length === 0) return

    // Update all moved items' data
    items.forEach(({ id, endPosition }) => {
      const item = assemblyItems.value.find(i => i.id === id)
      if (item) {
        item.position = { ...endPosition }
      }
    })

    // Create a single batch-move history record
    const itemNames = items.map(({ id }) => {
      const item = assemblyItems.value.find(i => i.id === id)
      return item ? item.name : `管道 ${id}`
    }).join('、')

    const historyItem = {
      id: `hist_${Date.now()}`,
      type: 'move',
      targetId: items[0].id,
      name: `批量移动: ${itemNames}`,
      time: new Date().toLocaleTimeString(),
      isBatch: true,
      batchItems: items.map(({ id, startPosition, endPosition }) => ({
        id,
        startPosition: { ...startPosition },
        endPosition: { ...endPosition }
      }))
    }

    addOrMergeHistory(historyItem)
  }

  // ---- Rotation ----

  const handleRotationEnded = (event) => {
    const { id, endRotation, startRotation, axis } = event.detail
    const item = assemblyItems.value.find(i => i.id === id)
    if (item) {
      const historyItem = {
        id: `hist_${Date.now()}`,
        type: 'rotate',
        targetId: id,
        name: `旋转: ${item.name}`,
        time: new Date().toLocaleTimeString(),
        startRotation: { ...startRotation },
        endRotation: { ...endRotation },
        axis: axis
      }
      addOrMergeHistory(historyItem)
      item.rotation = { ...endRotation }
    }
  }

  // ---- Join ----

  const handleJoinCompleted = (event) => {
    const { movedItemId, position, rotation } = event.detail
    const item = assemblyItems.value.find(i => i.id === movedItemId)
    if (item) {
      const historyItem = {
        id: `hist_${Date.now()}`,
        type: 'join',
        targetId: movedItemId,
        name: `拼接: ${item.name}`,
        time: new Date().toLocaleTimeString(),
        oldPosition: { ...item.position },
        oldRotation: { ...item.rotation },
        newPosition: { ...position },
        newRotation: { ...rotation }
      }
      historyItems.value.unshift(historyItem)
      item.position = { ...position }
      item.rotation = { ...rotation }
    }
  }

  // ---- Transform Panel ----

  const handleShowTransformPanel = (event) => {
    const { type, id, position, rotation } = event.detail

    transformLogic.transformType.value = type
    transformLogic.transformingItemId.value = id

    if (position) {
      transformLogic.transformPosition.value = { ...position }
    }

    if (rotation) {
      transformLogic.transformRotation.value = { ...rotation }
      transformLogic.transformRotationDeg.value = {
        x: rotation.x * 180 / Math.PI,
        y: rotation.y * 180 / Math.PI,
        z: rotation.z * 180 / Math.PI
      }
    }

    transformLogic.showTransformPanel.value = true

    if (transformLogic.showPipeParams.value) transformLogic.closePipeParams()
    if (transformLogic.showHistoryEdit.value) transformLogic.closeHistoryEdit()
  }

  // ---- Assembly Item Selection (for Rotation Mode) ----

  const handleAssemblyItemSelected = (event) => {
    const { id } = event.detail
    uiState.selectedAssemblyItemId.value = id
    uiState.updateRotationAxis()
  }

  // ---- Position / Rotation real-time sync ----

  const handleAssemblyItemPositionUpdated = (event) => {
    const { id, position, isUserInput } = event.detail

    const item = assemblyItems.value.find(i => i.id === id)
    if (item) {
      item.position = { ...position }
    }

    if (transformLogic.showTransformPanel.value && transformLogic.transformingItemId.value === id && transformLogic.transformType.value === 'move' && !isUserInput) {
      transformLogic.transformPosition.value = { ...position }
    }
  }

  const handleAssemblyItemRotationUpdated = (event) => {
    const { id, rotation, isUserInput } = event.detail

    const item = assemblyItems.value.find(i => i.id === id)
    if (item) {
      item.rotation = { ...rotation }
    }

    if (uiState.selectedAssemblyItemId.value === id && !isUserInput) {
      uiState.updateRotationAxis()
    }

    if (transformLogic.showTransformPanel.value && transformLogic.transformingItemId.value === id && transformLogic.transformType.value === 'rotate' && !isUserInput) {
      transformLogic.transformRotation.value = { ...rotation }
      transformLogic.transformRotationDeg.value = {
        x: rotation.x * 180 / Math.PI,
        y: rotation.y * 180 / Math.PI,
        z: rotation.z * 180 / Math.PI
      }
    }
  }

  // ---- End Face Selection (Join Mode) ----

  const handleEndFaceSelected = (event) => {
    if (!joinLogic.isJoinMode.value) return

    const { index, assemblyItemId, endFaceType } = event.detail

    // Handle deselection
    if (assemblyItemId === null || endFaceType === null) {
      if (index === 1) {
        joinLogic.firstSelectedEndFace.value = null
      } else if (index === 2) {
        joinLogic.secondSelectedEndFace.value = null
      }
      window.dispatchEvent(new CustomEvent('clear-join-preview'))
      return
    }

    const assemblyItem = assemblyItems.value.find(item => item.id === assemblyItemId)
    if (!assemblyItem) return

    const endFaceInfo = {
      assemblyItemId: assemblyItemId,
      endFaceType: endFaceType,
      pipeName: assemblyItem.name || `管道 ${assemblyItemId}`
    }

    if (index === 1) {
      joinLogic.firstSelectedEndFace.value = endFaceInfo
    } else if (index === 2) {
      joinLogic.secondSelectedEndFace.value = endFaceInfo
    }
  }

  // ---- Sketch Path Data Sync ----

  const handleSketch2DPathDataSync = (event) => {
    if (uiState.currentPartType.value === 'sketch2d' && event.detail) {
      uiState.pipeParams.value.pathData = JSON.parse(JSON.stringify(event.detail))
    }
  }

  const handleSketch3DPathDataSync = (event) => {
    if (uiState.currentPartType.value === 'sketch3d' && event.detail) {
      uiState.pipeParams.value.pathData3d = JSON.parse(JSON.stringify(event.detail))
    }
  }

  // ---- Renderer ----

  const handleRendererSwitched = (event) => {
    rendererType.value = event.detail.type
  }

  // ---- Join preview ----

  const previewJoinRotation = () => {
    if (!joinLogic.isJoinMode.value || !joinLogic.firstSelectedEndFace.value || !joinLogic.secondSelectedEndFace.value) return
    if (!joinLogic.isJoinPositioned.value) return

    window.dispatchEvent(new CustomEvent('preview-join-angle', {
      detail: {
        firstEndFace: joinLogic.firstSelectedEndFace.value,
        secondEndFace: joinLogic.secondSelectedEndFace.value,
        moveFirst: joinLogic.moveFirstPipe.value,
        rotationAngle: joinLogic.joinRotationAngle.value
      }
    }))
  }

  return {
    addOrMergeHistory,
    handleDragEnded,
    handleBatchDragEnded,
    handleRotationEnded,
    handleJoinCompleted,
    handleShowTransformPanel,
    handleAssemblyItemSelected,
    handleAssemblyItemPositionUpdated,
    handleAssemblyItemRotationUpdated,
    handleEndFaceSelected,
    handleSketch2DPathDataSync,
    handleSketch3DPathDataSync,
    handleRendererSwitched,
    previewJoinRotation,
    rendererType
  }
}
