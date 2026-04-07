import * as THREE from 'three'
import { createPipeObject } from '../../utils/pipeFactory.js'
import { buildBatchedProxy, clearBatchedProxy, updateBatchedProxyMatrices } from '../../utils/batchedProxy.js'

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

      // 更新现有对象的位置和旋转，并创建新对象
      pipeItems.forEach(item => {
        // 查找对应的管道对象
        let pipeObj = null
        ctx.previewPipe.children.forEach(child => {
          if (child.userData && child.userData.assemblyItemId === item.id) {
            pipeObj = child
          }
        })

        if (pipeObj) {
          // 更新位置
          if (item.position) {
            pipeObj.position.set(item.position.x, item.position.y, item.position.z)
          }
          // 更新旋转
          if (item.rotation) {
            pipeObj.rotation.set(item.rotation.x, item.rotation.y, item.rotation.z)
          }
          // 更新矩阵
          pipeObj.updateMatrix()
          pipeObj.updateMatrixWorld(true)
        } else {
          // 如果对象不存在，需要创建新的
          const paramsWithType = { ...item.params, type: item.type }

          // 对于2D草图建管，确保pathData被正确传递
          if (item.type === 'sketch2d' && item.params && item.params.pathData) {
            paramsWithType.pathData = item.params.pathData
          }
          if (item.type === 'sketch3d' && item.params && item.params.pathData3d) {
            paramsWithType.pathData3d = item.params.pathData3d
          }

          // 构建管件（若使用 BatchedMesh，直接按目标精度生成）
          const targetSeg = paramsWithType.segments || 12
          const pipeObj = createPipeObject(paramsWithType, item.id)
          if (pipeObj) {
            pipeObj.userData._lodSegments = targetSeg
            pipeObj.userData._targetSegments = targetSeg
            pipeObj.userData._originalParams = paramsWithType
            enableShadowsForObject(pipeObj)
            if (item.position) {
              pipeObj.position.set(item.position.x, item.position.y, item.position.z)
            }
            if (item.rotation) {
              pipeObj.rotation.set(item.rotation.x, item.rotation.y, item.rotation.z)
            }
            pipeObj.updateMatrix()
            pipeObj.updateMatrixWorld(true)
            ctx.previewPipe.add(pipeObj)
          } else {
            console.warn('创建管道对象失败:', { type: item.type, params: paramsWithType })
          }
        }
      })

      // 移除不再存在的对象
      ctx.previewPipe.children.forEach((child, index) => {
        const childId = child.userData && child.userData.assemblyItemId
        if (childId && !pipeItems.some(item => item.id === childId)) {
          // 清理资源
          child.traverse(obj => {
            if (obj.isMesh && obj.geometry) {
              obj.geometry.dispose()
            }
          })
          ctx.previewPipe.remove(child)
        }
      })

      // 更新 previewPipe 的矩阵
      ctx.previewPipe.updateMatrix()
      ctx.previewPipe.updateMatrixWorld(true)

      freezePreviewPipeMatrices()
      requestShadowUpdate()
      buildBatchedProxy(ctx.previewPipe, ctx.scene, ctx.shadowsGloballyEnabled)
      scheduleProgressiveRefine()
      return
    }

    // 清除单个预览
    clearPipePreview()

    // 设置为装配体模式
    ctx.isAssemblyMode = true

    const assemblyGroup = new THREE.Group()

    pipeItems.forEach(item => {
      const paramsWithType = { ...item.params, type: item.type }

      // 对于2D草图建管，确保pathData被正确传递
      if (item.type === 'sketch2d' && item.params && item.params.pathData) {
        paramsWithType.pathData = item.params.pathData
      }
      if (item.type === 'sketch3d' && item.params && item.params.pathData3d) {
        paramsWithType.pathData3d = item.params.pathData3d
      }

      // 构建管件（若使用 BatchedMesh，直接按目标精度生成）
      const targetSeg = paramsWithType.segments || 12
      const pipeObj = createPipeObject(paramsWithType, item.id)
      if (pipeObj) {
        pipeObj.userData._lodSegments = targetSeg
        pipeObj.userData._targetSegments = targetSeg
        pipeObj.userData._originalParams = paramsWithType
        // 为管道启用阴影
        enableShadowsForObject(pipeObj)
        // 应用位置和旋转信息
        if (item.position) {
          pipeObj.position.set(item.position.x, item.position.y, item.position.z)
        }
        if (item.rotation) {
          pipeObj.rotation.set(item.rotation.x, item.rotation.y, item.rotation.z)
        }

        assemblyGroup.add(pipeObj)
      } else {
        console.warn('创建管道对象失败:', { type: item.type, params: paramsWithType })
      }
    })

    ctx.previewPipe = assemblyGroup
    ctx.scene.add(ctx.previewPipe)
    ctx.previewPipe.updateMatrixWorld(true)

    // 只有在不保持相机时才自动调整相机
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
    scheduleProgressiveRefine()
  }

  const handleViewAssembly = (event) => {
    const items = event.detail
    const preserveCamera = event.preserveCamera || false
    // 退出3D草图模式
    if (isSketch3DMode.value) exitSketch3DMode()
    // 浏览装配体时，如果2D画板是打开的，应该关闭它
    if (isSplitView.value) {
      isSplitView.value = false
      sketchPathData.value = null
      sketch2DPipeParams.value = null
      initialSketchPathData.value = null
      setTimeout(() => {
        handleResize()
      }, 100)
    }
    updateAssemblyView(items, preserveCamera)
  }

  const handleWorkspaceChanged = (event) => {
    // 清空当前场景
    if (ctx.previewPipe) {
      ctx.scene.remove(ctx.previewPipe)
      ctx.previewPipe = null
    }

    // 清除所有状态
    clearAllHighlights()
    ctx.selectedPipeGroup = null
    ctx.firstSelectedEndFace = null
    ctx.secondSelectedEndFace = null
    ctx.selectedAssemblyItemIds.clear()

    // 关闭2D画板（如果打开）
    if (isSplitView.value) {
      isSplitView.value = false
      sketchPathData.value = null
      sketch2DPipeParams.value = null
      initialSketchPathData.value = null
      setTimeout(() => {
        handleResize()
      }, 100)
    }

    // 如果有新的装配体数据，重新渲染
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
