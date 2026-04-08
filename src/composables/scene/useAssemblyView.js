import * as THREE from 'three'
import { createPipeObject } from '../../utils/pipeFactory.js'
import { buildBatchedProxy, clearBatchedProxy, updateBatchedProxyMatrices } from '../../utils/batchedProxy.js'

/**
 * Generate a stable fingerprint for pipe params so identical geometry can be shared.
 * Array copies have identical params — this avoids N × createPipeObject for N copies.
 */
function paramsFingerprint(paramsWithType) {
  // Include all fields that affect geometry shape
  const { type, innerDiameter, outerDiameter, length, segments,
    bendRadius, bendAngle, sections, pathData, pathData3d } = paramsWithType
  // For sketch types, include path data hash
  const pathKey = pathData ? JSON.stringify(pathData) : ''
  const path3dKey = pathData3d ? JSON.stringify(pathData3d) : ''
  const sectionsKey = sections ? JSON.stringify(sections) : ''
  return `${type}|${innerDiameter}|${outerDiameter}|${length}|${segments}|${bendRadius}|${bendAngle}|${sectionsKey}|${pathKey}|${path3dKey}`
}

/**
 * Deep-clone a pipe Group, sharing geometry references (huge memory + creation time savings).
 * Updates assemblyItemId on all children.
 */
function clonePipeGroup(sourceGroup, newAssemblyItemId) {
  const cloned = sourceGroup.clone(true)
  // Update assemblyItemId on the group and all children
  cloned.userData = { ...sourceGroup.userData, assemblyItemId: newAssemblyItemId }
  cloned.traverse((child) => {
    if (child.userData && child.userData.assemblyItemId) {
      child.userData = { ...child.userData, assemblyItemId: newAssemblyItemId }
    }
    // Shared geometry — do NOT dispose on clone removal (managed by source)
    if (child.isMesh) {
      child.userData._sharedGeometry = true
    }
  })
  return cloned
}

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

  // --- Geometry cache: fingerprint -> { pipeGroup, refCount } ---
  // Survives across updateAssemblyView calls; cleared on full rebuild
  const _geoCache = new Map()

  const _clearGeoCache = () => {
    _geoCache.forEach(({ pipeGroup }) => {
      pipeGroup.traverse(obj => {
        if (obj.isMesh && obj.geometry) obj.geometry.dispose()
      })
    })
    _geoCache.clear()
  }

  /**
   * Create or reuse a pipe object. For identical params, the geometry is created only once.
   * Returns a Group with shared geometry references.
   */
  const _getOrCreatePipe = (paramsWithType, assemblyItemId) => {
    const fp = paramsFingerprint(paramsWithType)
    const cached = _geoCache.get(fp)

    if (cached) {
      // Clone structure, share geometry
      const cloned = clonePipeGroup(cached.pipeGroup, assemblyItemId)
      cached.refCount++
      return cloned
    }

    // First time for this fingerprint — create geometry
    const pipeObj = createPipeObject(paramsWithType, assemblyItemId)
    if (!pipeObj) return null

    // Cache it (keep the original as template)
    _geoCache.set(fp, { pipeGroup: pipeObj, refCount: 1 })

    // Return a clone so the cached original stays clean
    return clonePipeGroup(pipeObj, assemblyItemId)
  }

  const _preparePipeParams = (item) => {
    const paramsWithType = { ...item.params, type: item.type }
    if (item.type === 'sketch2d' && item.params && item.params.pathData) {
      paramsWithType.pathData = item.params.pathData
    }
    if (item.type === 'sketch3d' && item.params && item.params.pathData3d) {
      paramsWithType.pathData3d = item.params.pathData3d
    }
    return paramsWithType
  }

  const updateAssemblyView = (items, preserveCamera = false, forceRebuild = false) => {
    if (!ctx.scene) return

    // 阵列模式下刷新装配体时清除已选
    if (ctx.isArrayMode) {
      clearArraySelection()
    }

    // 过滤掉文件夹类型的项，只处理实际的管道项
    const pipeItems = items.filter(item => item.type !== 'array-group')

    // 如果 preserveCamera 为 true，只更新现有对象的位置和旋转，不重新创建
    if (preserveCamera && !forceRebuild && ctx.previewPipe && ctx.isAssemblyMode) {
      // 确保 previewPipe 在场景中
      if (!ctx.scene.children.includes(ctx.previewPipe)) {
        ctx.scene.add(ctx.previewPipe)
      }

      // Build a Map for O(1) child lookup by assemblyItemId
      const childMap = new Map()
      ctx.previewPipe.children.forEach(child => {
        if (child.userData && child.userData.assemblyItemId) {
          childMap.set(child.userData.assemblyItemId, child)
        }
      })

      // 更新现有对象的位置和旋转，并创建新对象
      pipeItems.forEach(item => {
        const pipeObj = childMap.get(item.id) || null

        if (pipeObj) {
          if (item.position) pipeObj.position.set(item.position.x, item.position.y, item.position.z)
          if (item.rotation) pipeObj.rotation.set(item.rotation.x, item.rotation.y, item.rotation.z)
          pipeObj.updateMatrix()
          pipeObj.updateMatrixWorld(true)
        } else {
          // 创建新的 — 使用几何缓存
          const paramsWithType = _preparePipeParams(item)
          const targetSeg = paramsWithType.segments || 12
          const newObj = _getOrCreatePipe(paramsWithType, item.id)
          if (newObj) {
            newObj.userData._lodSegments = targetSeg
            newObj.userData._targetSegments = targetSeg
            newObj.userData._originalParams = paramsWithType
            enableShadowsForObject(newObj)
            if (item.position) newObj.position.set(item.position.x, item.position.y, item.position.z)
            if (item.rotation) newObj.rotation.set(item.rotation.x, item.rotation.y, item.rotation.z)
            newObj.updateMatrix()
            newObj.updateMatrixWorld(true)
            ctx.previewPipe.add(newObj)
          } else {
            console.warn('创建管道对象失败:', { type: item.type, params: paramsWithType })
          }
        }
      })

      // 移除不再存在的对象 — O(n) via Set
      const pipeItemIds = new Set(pipeItems.map(item => item.id))
      for (let i = ctx.previewPipe.children.length - 1; i >= 0; i--) {
        const child = ctx.previewPipe.children[i]
        const childId = child.userData && child.userData.assemblyItemId
        if (childId && !pipeItemIds.has(childId)) {
          child.traverse(obj => {
            // Only dispose non-shared geometry
            if (obj.isMesh && obj.geometry && !obj.userData._sharedGeometry) {
              obj.geometry.dispose()
            }
          })
          ctx.previewPipe.remove(child)
        }
      }

      ctx.previewPipe.updateMatrix()
      ctx.previewPipe.updateMatrixWorld(true)

      freezePreviewPipeMatrices()
      requestShadowUpdate()
      buildBatchedProxy(ctx.previewPipe, ctx.scene, ctx.shadowsGloballyEnabled)
      if (deps.onStructuralChange) deps.onStructuralChange()
      scheduleProgressiveRefine()
      return
    }

    // --- Full rebuild ---
    clearPipePreview()
    _clearGeoCache() // Start fresh

    ctx.isAssemblyMode = true

    const assemblyGroup = new THREE.Group()

    pipeItems.forEach(item => {
      const paramsWithType = _preparePipeParams(item)
      const targetSeg = paramsWithType.segments || 12
      // Use geometry cache — identical params only generate geometry ONCE
      const pipeObj = _getOrCreatePipe(paramsWithType, item.id)
      if (pipeObj) {
        pipeObj.userData._lodSegments = targetSeg
        pipeObj.userData._targetSegments = targetSeg
        pipeObj.userData._originalParams = paramsWithType
        enableShadowsForObject(pipeObj)
        if (item.position) pipeObj.position.set(item.position.x, item.position.y, item.position.z)
        if (item.rotation) pipeObj.rotation.set(item.rotation.x, item.rotation.y, item.rotation.z)
        assemblyGroup.add(pipeObj)
      } else {
        console.warn('创建管道对象失败:', { type: item.type, params: paramsWithType })
      }
    })

    ctx.previewPipe = assemblyGroup
    ctx.scene.add(ctx.previewPipe)
    ctx.previewPipe.updateMatrixWorld(true)

    if (!preserveCamera && ctx.camera && ctx.controls) {
      const box = new THREE.Box3()
      box.setFromObject(assemblyGroup)
      const size = box.getSize(new THREE.Vector3())
      const maxSize = Math.max(size.x, size.y, size.z)
      const distance = maxSize > 0 ? maxSize * 1.5 : 150
      ctx.camera.position.set(distance, distance * 0.7, distance)
      ctx.controls.target.set(0, 0, 0)
      ctx.controls.update()
    }

    ctx._lodRefineCursor = 0
    freezePreviewPipeMatrices()
    requestShadowUpdate()
    buildBatchedProxy(ctx.previewPipe, ctx.scene, ctx.shadowsGloballyEnabled)
    if (deps.onStructuralChange) deps.onStructuralChange()
    scheduleProgressiveRefine()
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
    _clearGeoCache()

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

    if (event.detail && event.detail.assemblyItems && event.detail.assemblyItems.length > 0) {
      updateAssemblyView(event.detail.assemblyItems, true)
    }
  }

  return {
    updateAssemblyView,
    handleViewAssembly,
    handleWorkspaceChanged
  }
}
