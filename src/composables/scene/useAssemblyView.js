import * as THREE from 'three'
import * as InstancedManager from '../../utils/instancedAssemblyManager.js'

export function useAssemblyView(ctx, deps) {
  const {
    clearPipePreview,
    enableShadowsForObject,
    freezePreviewPipeMatrices,
    requestShadowUpdate,
    clearArraySelection,
    scheduleProgressiveRefine,
    clearAllHighlights,
    exitSketch3DMode,
    isSketch3DMode,
    isSplitView,
    sketchPathData,
    sketch2DPipeParams,
    initialSketchPathData,
    handleResize
  } = deps

  const updateAssemblyView = (items, preserveCamera = false, forceRebuild = false) => {
    if (!ctx.scene) return

    if (ctx.isArrayMode) clearArraySelection()

    // 过滤掉文件夹类型
    const pipeItems = items.filter(item => item.type !== 'array-group')

    // ── 增量更新（preserveCamera 且已有数据） ──
    if (preserveCamera && !forceRebuild && ctx.isAssemblyMode && InstancedManager.hasItems()) {
      // 找出需要新增/更新/删除的零件
      const currentIds = InstancedManager.getAllItemIds()
      const newIds = new Set(pipeItems.map(item => item.id))

      // 删除不再存在的
      for (const id of currentIds) {
        if (!newIds.has(id)) InstancedManager.removeItem(id)
      }

      // 新增或更新
      for (const item of pipeItems) {
        const paramsWithType = _preparePipeParams(item)
        const fp = InstancedManager.paramsFingerprint(paramsWithType)

        if (currentIds.has(item.id)) {
          // 更新变换
          if (item.position || item.rotation) {
            InstancedManager.updateItemTransform(
              item.id,
              item.position || { x: 0, y: 0, z: 0 },
              item.rotation || { x: 0, y: 0, z: 0 }
            )
          }
        } else {
          // 新增
          InstancedManager.addItem(item.id, fp, paramsWithType,
            item.position || { x: 0, y: 0, z: 0 },
            item.rotation || { x: 0, y: 0, z: 0 }
          )
        }
      }

      requestShadowUpdate()
      if (deps.onStructuralChange) deps.onStructuralChange()
      return
    }

    // ── 全量重建 ──
    clearPipePreview()

    ctx.isAssemblyMode = true

    // 用空 Group 作为标记（兼容 if (ctx.previewPipe) 检查）
    ctx.previewPipe = new THREE.Group()
    ctx.previewPipe.name = 'assemblyMarker'
    ctx.scene.add(ctx.previewPipe)

    // 通过 InstancedManager 重建
    InstancedManager.rebuildAll(pipeItems, ctx.scene, ctx.shadowsGloballyEnabled)

    // 相机调整
    if (!preserveCamera && ctx.camera && ctx.controls && pipeItems.length > 0) {
      // 用所有 InstancedMesh 计算包围盒
      const box = new THREE.Box3()
      const meshes = InstancedManager.getAllInstancedMeshes()
      for (const mesh of meshes) {
        mesh.computeBoundingBox()
        if (mesh.boundingBox) box.union(mesh.boundingBox)
      }
      if (!box.isEmpty()) {
        const size = box.getSize(new THREE.Vector3())
        const maxSize = Math.max(size.x, size.y, size.z)
        const distance = maxSize > 0 ? maxSize * 1.5 : 150
        ctx.camera.position.set(distance, distance * 0.7, distance)
        ctx.controls.target.set(0, 0, 0)
        ctx.controls.update()
      }
    }

    requestShadowUpdate()
    if (deps.onStructuralChange) deps.onStructuralChange()
  }

  const _preparePipeParams = (item) => {
    const paramsWithType = { ...item.params, type: item.type }
    if (item.type === 'sketch2d' && item.params?.pathData) paramsWithType.pathData = item.params.pathData
    if (item.type === 'sketch3d' && item.params?.pathData3d) paramsWithType.pathData3d = item.params.pathData3d
    return paramsWithType
  }

  const handleViewAssembly = (event) => {
    const items = event.detail
    const preserveCamera = event.preserveCamera || false
    if (isSketch3DMode.value) exitSketch3DMode()
    if (isSplitView.value) {
      isSplitView.value = false
      sketchPathData.value = null
      sketch2DPipeParams.value = null
      initialSketchPathData.value = null
      setTimeout(() => { handleResize() }, 100)
    }
    updateAssemblyView(items, preserveCamera)
  }

  const handleWorkspaceChanged = (event) => {
    if (ctx.previewPipe) {
      ctx.scene.remove(ctx.previewPipe)
      ctx.previewPipe = null
    }
    InstancedManager.clear()
    InstancedManager.clearTemplateCache()

    clearAllHighlights()
    ctx.selectedPipeGroup = null
    ctx.firstSelectedEndFace = null
    ctx.secondSelectedEndFace = null
    ctx.selectedAssemblyItemIds.clear()

    if (isSplitView.value) {
      isSplitView.value = false
      sketchPathData.value = null
      sketch2DPipeParams.value = null
      initialSketchPathData.value = null
      setTimeout(() => { handleResize() }, 100)
    }

    if (event.detail?.assemblyItems?.length > 0) {
      updateAssemblyView(event.detail.assemblyItems, true)
    }
  }

  return {
    updateAssemblyView,
    handleViewAssembly,
    handleWorkspaceChanged
  }
}
