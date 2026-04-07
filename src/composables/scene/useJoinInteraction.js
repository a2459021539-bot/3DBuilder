import * as THREE from 'three'
import { buildBatchedProxy, updateBatchedProxyMatrices } from '../../utils/batchedProxy.js'

export function useJoinInteraction(ctx, deps) {
  // --- Highlight materials ---

  const createHighlightMaterial = (isFirst = true) => {
    // 第一个端面用绿色，第二个端面用蓝色
    const color = isFirst ? 0x00ff00 : 0x0099ff
    return new THREE.MeshStandardMaterial({
      color: color,
      emissive: color,
      emissiveIntensity: 0.5,
      metalness: 0.3,
      roughness: 0.7,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.8
    })
  }

  const highlightEndFace = (endFaceObject, isFirst = true) => {
    if (!endFaceObject || !endFaceObject.material) return

    // 如果已经高亮了，先恢复
    if (ctx.highlightedEndFaces.has(endFaceObject)) {
      return
    }

    // 保存原始材质
    const originalMaterial = endFaceObject.material
    ctx.highlightedEndFaces.set(endFaceObject, originalMaterial)

    // 应用高亮材质
    const highlightMaterial = createHighlightMaterial(isFirst)
    endFaceObject.material = highlightMaterial
  }

  const restoreEndFace = (endFaceObject) => {
    if (!endFaceObject || !ctx.highlightedEndFaces.has(endFaceObject)) return

    const originalMaterial = ctx.highlightedEndFaces.get(endFaceObject)
    endFaceObject.material = originalMaterial
    ctx.highlightedEndFaces.delete(endFaceObject)
  }

  const clearAllHighlights = () => {
    ctx.highlightedEndFaces.forEach((originalMaterial, endFaceObject) => {
      if (endFaceObject && endFaceObject.material) {
        endFaceObject.material = originalMaterial
      }
    })
    ctx.highlightedEndFaces.clear()
  }

  // --- End face finding & transforms ---

  const findEndFaceObjects = (endFaceInfo) => {
    if (!endFaceInfo || !endFaceInfo.pipeGroup || !ctx.previewPipe) return []

    const pipeGroup = endFaceInfo.pipeGroup
    const endFaceType = endFaceInfo.endFaceType
    const objects = []

    // 遍历管道组的所有子对象，找到匹配的端面
    pipeGroup.traverse((child) => {
      if (child.userData &&
          child.userData.isEndFace &&
          child.userData.endFaceType === endFaceType &&
          child.material && // 确保有材质
          child.visible) { // 只处理可见的对象（排除 hitbox）
        // 检查材质是否透明（hitbox 通常是完全透明的）
        const material = child.material
        if (material.opacity !== 0 && material.opacity !== undefined) {
          objects.push(child)
        }
      }
    })

    return objects
  }

  const getEndFaceWorldTransform = (endFaceObject) => {
    const pipeGroup = endFaceObject.parent
    if (!pipeGroup) return null

    // 端面应该有 userData 中的位置和法向量（直管和弯管都有）
    if (endFaceObject.userData.endFacePosition && endFaceObject.userData.endFaceNormal) {
      const localPosition = endFaceObject.userData.endFacePosition.clone()
      const localNormal = endFaceObject.userData.endFaceNormal.clone()

      // 转换到世界坐标系
      const worldPosition = localPosition.applyMatrix4(pipeGroup.matrixWorld)
      const worldNormal = localNormal.transformDirection(pipeGroup.matrixWorld).normalize()

      return {
        position: worldPosition,
        normal: worldNormal,
        pipeGroup: pipeGroup,
        assemblyItemId: pipeGroup.userData.assemblyItemId,
        endFaceType: endFaceObject.userData.endFaceType
      }
    }

    return null
  }

  // --- End face click handling ---

  const handleEndFaceClick = (endFaceObject, clickPoint) => {
    const endFaceInfo = getEndFaceWorldTransform(endFaceObject)
    if (!endFaceInfo) return

    // 检查是否点击了已经选择的端面
    const isFirstEndFace = ctx.firstSelectedEndFace &&
      ctx.firstSelectedEndFace.assemblyItemId === endFaceInfo.assemblyItemId &&
      ctx.firstSelectedEndFace.endFaceType === endFaceInfo.endFaceType
    const isSecondEndFace = ctx.secondSelectedEndFace &&
      ctx.secondSelectedEndFace.assemblyItemId === endFaceInfo.assemblyItemId &&
      ctx.secondSelectedEndFace.endFaceType === endFaceInfo.endFaceType

    if (isFirstEndFace || isSecondEndFace) {
      // 如果点击了已选择的端面，取消选择（允许重新选择）
      if (isFirstEndFace) {
        const endFaceObjects = findEndFaceObjects(ctx.firstSelectedEndFace)
        endFaceObjects.forEach(obj => restoreEndFace(obj))
        const deselectedIndex = 1
        ctx.firstSelectedEndFace = null
        // 发送取消选择事件
        window.dispatchEvent(new CustomEvent('end-face-selected', {
          detail: {
            index: deselectedIndex,
            assemblyItemId: null,
            endFaceType: null
          }
        }))
      }
      if (isSecondEndFace) {
        const endFaceObjects = findEndFaceObjects(ctx.secondSelectedEndFace)
        endFaceObjects.forEach(obj => restoreEndFace(obj))
        const deselectedIndex = 2
        ctx.secondSelectedEndFace = null
        // 发送取消选择事件
        window.dispatchEvent(new CustomEvent('end-face-selected', {
          detail: {
            index: deselectedIndex,
            assemblyItemId: null,
            endFaceType: null
          }
        }))
      }
      return
    }

    if (!ctx.firstSelectedEndFace) {
      // 选择第一个端面
      ctx.firstSelectedEndFace = endFaceInfo

      // 高亮第一个端面
      const endFaceObjects = findEndFaceObjects(endFaceInfo)
      endFaceObjects.forEach(obj => highlightEndFace(obj, true))

      window.dispatchEvent(new CustomEvent('end-face-selected', {
        detail: {
          index: 1,
          assemblyItemId: endFaceInfo.assemblyItemId,
          endFaceType: endFaceInfo.endFaceType
        }
      }))
    } else if (!ctx.secondSelectedEndFace && ctx.firstSelectedEndFace.assemblyItemId !== endFaceInfo.assemblyItemId) {
      // 选择第二个端面（不能是同一个管道）
      ctx.secondSelectedEndFace = endFaceInfo

      // 高亮第二个端面
      const endFaceObjects = findEndFaceObjects(endFaceInfo)
      endFaceObjects.forEach(obj => highlightEndFace(obj, false))

      window.dispatchEvent(new CustomEvent('end-face-selected', {
        detail: {
          index: 2,
          assemblyItemId: endFaceInfo.assemblyItemId,
          endFaceType: endFaceInfo.endFaceType
        }
      }))

      // 两个端面都选好了，准备拼接
      window.dispatchEvent(new CustomEvent('ready-to-join', {
        detail: {
          firstEndFace: ctx.firstSelectedEndFace,
          secondEndFace: ctx.secondSelectedEndFace
        }
      }))
    }
  }

  // --- Join calculation core ---

  const performJoinCalculation = (pipeToMove, faceToMove, faceFixed, rotationAngle) => {
    // 获取端面的世界坐标位置和法向量
    const movePos = faceToMove.position.clone()
    const moveNormal = faceToMove.normal.clone()
    const fixedPos = faceFixed.position.clone()
    const fixedNormal = faceFixed.normal.clone()

    // 步骤1：移动管道，使移动端面的中心点与固定端面的中心点重合
    const offset = fixedPos.clone().sub(movePos)
    pipeToMove.position.add(offset)

    // 步骤2：计算旋转，使两个端面的法向量对齐（方向相反）
    const targetNormal = fixedNormal.clone().multiplyScalar(-1)
    const alignQuaternion = new THREE.Quaternion()
    alignQuaternion.setFromUnitVectors(moveNormal.normalize(), targetNormal.normalize())

    // 应用对齐旋转
    pipeToMove.quaternion.multiplyQuaternions(alignQuaternion, pipeToMove.quaternion)

    // 步骤3：重新计算端面位置（因为旋转后位置变了）
    let endFaceLocalPos = new THREE.Vector3()
    pipeToMove.children.forEach(child => {
      if (child.userData && child.userData.isEndFace &&
          child.userData.endFaceType === faceToMove.endFaceType) {
        endFaceLocalPos = child.userData.endFacePosition.clone()
      }
    })

    // 计算旋转后端面的新世界位置
    const newEndFaceLocalPos = endFaceLocalPos.clone().applyQuaternion(alignQuaternion)
    const newEndFaceWorldPos = newEndFaceLocalPos.add(pipeToMove.position)

    // 调整位置使端面中心点仍然重合
    const positionAdjustment = fixedPos.clone().sub(newEndFaceWorldPos)
    pipeToMove.position.add(positionAdjustment)

    // 步骤4：应用额外的旋转角度（绕端面法向量旋转）
    if (rotationAngle !== undefined && rotationAngle !== 0) {
      const rotationAxis = targetNormal.normalize()
      const additionalRotation = new THREE.Quaternion()
      additionalRotation.setFromAxisAngle(rotationAxis, (rotationAngle * Math.PI) / 180)

      // 绕端面中心点旋转
      const endFaceCenter = fixedPos.clone()
      const relativePos = pipeToMove.position.clone().sub(endFaceCenter)
      const rotatedRelativePos = relativePos.applyQuaternion(additionalRotation)
      pipeToMove.position.copy(endFaceCenter.clone().add(rotatedRelativePos))

      // 应用旋转到管道
      pipeToMove.quaternion.multiplyQuaternions(additionalRotation, pipeToMove.quaternion)
    }
  }

  // --- Join execution ---

  const performJoin = (firstEndFace, secondEndFace, moveFirst, rotationAngle) => {
    if (!firstEndFace || !secondEndFace || !ctx.previewPipe) return

    const firstPipeGroup = firstEndFace.pipeGroup
    const secondPipeGroup = secondEndFace.pipeGroup

    if (!firstPipeGroup || !secondPipeGroup) return

    // 确定要移动的管道
    const pipeToMove = moveFirst ? firstPipeGroup : secondPipeGroup
    const fixedPipe = moveFirst ? secondPipeGroup : firstPipeGroup

    const faceToMove = moveFirst ? firstEndFace : secondEndFace
    const faceFixed = moveFirst ? secondEndFace : firstEndFace

    // 如果已经有预览状态，说明位置已经计算好了，直接使用当前状态
    // 否则重新计算
    if (!ctx.joinPreviewOriginalState || ctx.joinPreviewOriginalState.pipeId !== pipeToMove.userData.assemblyItemId) {
      // 保存管道当前的位置和旋转
      const originalPosition = pipeToMove.position.clone()
      const originalQuaternion = pipeToMove.quaternion.clone()

      // 执行拼接计算
      performJoinCalculation(pipeToMove, faceToMove, faceFixed, rotationAngle)
    }
    // 否则使用预览时已经计算好的位置（预览已经更新了管道位置）

    // 更新装配体数据
    const assemblyItemId = pipeToMove.userData.assemblyItemId
    const euler = new THREE.Euler()
    euler.setFromQuaternion(pipeToMove.quaternion)

    if (assemblyItemId) {
      window.dispatchEvent(new CustomEvent('assembly-item-position-updated', {
        detail: {
          id: assemblyItemId,
          position: {
            x: pipeToMove.position.x,
            y: pipeToMove.position.y,
            z: pipeToMove.position.z
          }
        }
      }))

      window.dispatchEvent(new CustomEvent('assembly-item-rotation-updated', {
        detail: {
          id: assemblyItemId,
          rotation: {
            x: euler.x,
            y: euler.y,
            z: euler.z
          }
        }
      }))

      updateBatchedProxyMatrices(assemblyItemId)
    }

    // 重置选择并清除高亮
    clearAllHighlights()
    ctx.firstSelectedEndFace = null
    ctx.secondSelectedEndFace = null

    // 清除预览状态
    ctx.joinPreviewOriginalState = null

    // 通知拼接完成
    window.dispatchEvent(new CustomEvent('join-completed', {
      detail: {
        movedItemId: assemblyItemId,
        position: {
          x: pipeToMove.position.x,
          y: pipeToMove.position.y,
          z: pipeToMove.position.z
        },
        rotation: {
          x: euler.x,
          y: euler.y,
          z: euler.z
        }
      }
    }))

    pipeToMove.updateMatrixWorld(true)
    if (ctx.isAssemblyMode && ctx.previewPipe) {
      deps.freezePreviewPipeMatrices()
      buildBatchedProxy(ctx.previewPipe, ctx.scene, ctx.shadowsGloballyEnabled)
    }
  }

  // --- Join preview ---

  const previewJoin = (firstEndFace, secondEndFace, moveFirst, rotationAngle) => {
    if (!firstEndFace || !secondEndFace || !ctx.previewPipe) return

    // 查找第一个端面对象
    let firstEndFaceObject = null
    ctx.previewPipe.traverse((child) => {
      if (child.userData &&
          child.userData.isEndFace &&
          child.userData.assemblyItemId === firstEndFace.assemblyItemId &&
          child.userData.endFaceType === firstEndFace.endFaceType &&
          child.material &&
          child.visible) {
        const material = child.material
        if (material.opacity !== 0 && material.opacity !== undefined) {
          firstEndFaceObject = child
        }
      }
    })

    // 查找第二个端面对象
    let secondEndFaceObject = null
    ctx.previewPipe.traverse((child) => {
      if (child.userData &&
          child.userData.isEndFace &&
          child.userData.assemblyItemId === secondEndFace.assemblyItemId &&
          child.userData.endFaceType === secondEndFace.endFaceType &&
          child.material &&
          child.visible) {
        const material = child.material
        if (material.opacity !== 0 && material.opacity !== undefined) {
          secondEndFaceObject = child
        }
      }
    })

    if (!firstEndFaceObject || !secondEndFaceObject) {
      return
    }

    // 获取完整的端面信息
    const firstEndFaceInfo = getEndFaceWorldTransform(firstEndFaceObject)
    const secondEndFaceInfo = getEndFaceWorldTransform(secondEndFaceObject)

    if (!firstEndFaceInfo || !secondEndFaceInfo) {
      return
    }

    // 确定要移动的管道
    const pipeToMove = moveFirst ? firstEndFaceInfo.pipeGroup : secondEndFaceInfo.pipeGroup
    const fixedPipe = moveFirst ? secondEndFaceInfo.pipeGroup : firstEndFaceInfo.pipeGroup

    const faceToMove = moveFirst ? firstEndFaceInfo : secondEndFaceInfo
    const faceFixed = moveFirst ? secondEndFaceInfo : firstEndFaceInfo

    // 如果是第一次预览，保存原始状态
    if (!ctx.joinPreviewOriginalState || ctx.joinPreviewOriginalState.pipeId !== pipeToMove.userData.assemblyItemId) {
      ctx.joinPreviewOriginalState = {
        pipeId: pipeToMove.userData.assemblyItemId,
        position: pipeToMove.position.clone(),
        quaternion: pipeToMove.quaternion.clone()
      }
    }

    // 恢复原始状态
    pipeToMove.position.copy(ctx.joinPreviewOriginalState.position)
    pipeToMove.quaternion.copy(ctx.joinPreviewOriginalState.quaternion)

    // 执行拼接计算（但不保存到数据）
    performJoinCalculation(pipeToMove, faceToMove, faceFixed, rotationAngle)
  }

  const clearJoinPreview = () => {
    if (ctx.joinPreviewOriginalState && ctx.previewPipe) {
      // 查找对应的管道对象
      let pipeToRestore = null
      ctx.previewPipe.traverse((child) => {
        if (child.userData && child.userData.assemblyItemId === ctx.joinPreviewOriginalState.pipeId) {
          pipeToRestore = child
        }
      })

      if (pipeToRestore) {
        pipeToRestore.position.copy(ctx.joinPreviewOriginalState.position)
        pipeToRestore.quaternion.copy(ctx.joinPreviewOriginalState.quaternion)
      }

      ctx.joinPreviewOriginalState = null
    }
  }

  // --- Helper: find end face object from previewPipe by assemblyItemId + endFaceType ---

  const _findEndFaceInPreview = (endFace) => {
    let found = null
    ctx.previewPipe.traverse((child) => {
      if (child.userData &&
          child.userData.isEndFace &&
          child.userData.assemblyItemId === endFace.assemblyItemId &&
          child.userData.endFaceType === endFace.endFaceType &&
          child.material &&
          child.visible) {
        const material = child.material
        if (material.opacity !== 0 && material.opacity !== undefined) {
          found = child
        }
      }
    })
    return found
  }

  // --- Event handlers ---

  const handlePositionJoin = (event) => {
    const { firstEndFace, secondEndFace, moveFirst, rotationAngle } = event.detail

    // 查找端面对象
    if (!firstEndFace || !secondEndFace || !ctx.previewPipe) return

    const firstEndFaceObject = _findEndFaceInPreview(firstEndFace)
    const secondEndFaceObject = _findEndFaceInPreview(secondEndFace)

    if (!firstEndFaceObject || !secondEndFaceObject) return

    const firstEndFaceInfo = getEndFaceWorldTransform(firstEndFaceObject)
    const secondEndFaceInfo = getEndFaceWorldTransform(secondEndFaceObject)

    if (!firstEndFaceInfo || !secondEndFaceInfo) return

    // 确定要移动的管道
    const pipeToMove = moveFirst ? firstEndFaceInfo.pipeGroup : secondEndFaceInfo.pipeGroup
    const faceToMove = moveFirst ? firstEndFaceInfo : secondEndFaceInfo
    const faceFixed = moveFirst ? secondEndFaceInfo : firstEndFaceInfo

    // 执行拼接计算（角度为0）
    performJoinCalculation(pipeToMove, faceToMove, faceFixed, 0)

    // 保存拼接后的初始状态（角度为0的状态，用于角度预览）
    ctx.joinPreviewOriginalState = {
      pipeId: pipeToMove.userData.assemblyItemId,
      position: pipeToMove.position.clone(),
      quaternion: pipeToMove.quaternion.clone()
    }
  }

  const handlePreviewJoinAngle = (event) => {
    const { firstEndFace, secondEndFace, moveFirst, rotationAngle } = event.detail

    if (!firstEndFace || !secondEndFace || !ctx.previewPipe || !ctx.joinPreviewOriginalState) return

    // 查找端面对象
    const firstEndFaceObject = _findEndFaceInPreview(firstEndFace)
    const secondEndFaceObject = _findEndFaceInPreview(secondEndFace)

    if (!firstEndFaceObject || !secondEndFaceObject) return

    const firstEndFaceInfo = getEndFaceWorldTransform(firstEndFaceObject)
    const secondEndFaceInfo = getEndFaceWorldTransform(secondEndFaceObject)

    if (!firstEndFaceInfo || !secondEndFaceInfo) return

    // 确定要移动的管道
    const pipeToMove = moveFirst ? firstEndFaceInfo.pipeGroup : secondEndFaceInfo.pipeGroup
    const faceToMove = moveFirst ? firstEndFaceInfo : secondEndFaceInfo
    const faceFixed = moveFirst ? secondEndFaceInfo : firstEndFaceInfo

    // 恢复原始位置（角度0的位置）
    pipeToMove.position.copy(ctx.joinPreviewOriginalState.position)
    pipeToMove.quaternion.copy(ctx.joinPreviewOriginalState.quaternion)

    // 执行拼接计算（应用新的角度）
    performJoinCalculation(pipeToMove, faceToMove, faceFixed, rotationAngle)
  }

  const handlePerformJoin = (event) => {
    const { firstEndFace, secondEndFace, moveFirst, rotationAngle } = event.detail

    // firstEndFace 和 secondEndFace 只包含 assemblyItemId 和 endFaceType
    // 需要找到对应的端面对象并获取完整信息
    if (!firstEndFace || !secondEndFace || !ctx.previewPipe) {
      console.error('拼接失败：端面信息不完整')
      return
    }

    // 查找第一个端面对象
    const firstEndFaceObject = _findEndFaceInPreview(firstEndFace)
    const secondEndFaceObject = _findEndFaceInPreview(secondEndFace)

    if (!firstEndFaceObject || !secondEndFaceObject) {
      console.error('拼接失败：找不到端面对象', { firstEndFaceObject, secondEndFaceObject })
      return
    }

    // 获取完整的端面信息
    const firstEndFaceInfo = getEndFaceWorldTransform(firstEndFaceObject)
    const secondEndFaceInfo = getEndFaceWorldTransform(secondEndFaceObject)

    if (!firstEndFaceInfo || !secondEndFaceInfo) {
      console.error('拼接失败：无法获取端面世界坐标信息')
      return
    }

    // 执行拼接（使用预览后的状态，因为预览已经计算好了位置）
    performJoin(firstEndFaceInfo, secondEndFaceInfo, moveFirst, rotationAngle)

    // 清除预览状态
    ctx.joinPreviewOriginalState = null
  }

  const handleJoinModeToggle = (event) => {
    ctx.isJoinMode = event.detail.enabled
    // 重置选择并清除高亮
    if (!ctx.isJoinMode) {
      clearAllHighlights()
      clearJoinPreview()
      ctx.firstSelectedEndFace = null
      ctx.secondSelectedEndFace = null
    }
  }

  const handleResetJoinSelection = () => {
    clearAllHighlights()
    clearJoinPreview()
    ctx.firstSelectedEndFace = null
    ctx.secondSelectedEndFace = null
  }

  return {
    createHighlightMaterial,
    highlightEndFace,
    restoreEndFace,
    clearAllHighlights,
    findEndFaceObjects,
    getEndFaceWorldTransform,
    handleEndFaceClick,
    performJoinCalculation,
    performJoin,
    previewJoin,
    clearJoinPreview,
    handlePositionJoin,
    handlePreviewJoinAngle,
    handlePerformJoin,
    handleJoinModeToggle,
    handleResetJoinSelection
  }
}
