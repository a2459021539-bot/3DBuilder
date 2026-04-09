import { rotationSnapStep } from './useSceneContext.js'
import * as InstancedManager from '../../utils/instancedAssemblyManager.js'

/**
 * Unified TransformControls gizmo — supports both 'rotate' and 'translate' modes.
 * In rotation mode: shows rotation rings.
 * In move mode: shows XYZ translation arrows.
 */
export function useRotationGizmo(ctx, deps) {

  const attachRotationGizmo = (pipeGroup, assemblyItemId) => {
    ctx.selectedPipeGroup = pipeGroup
    ctx.rotatedObject = pipeGroup
    ctx.rotatedAssemblyItemId = assemblyItemId
    if (ctx.transformControl && pipeGroup) {
      deps.unfreezeObjectSubtree(pipeGroup)
      ctx.transformControl.setMode('rotate')
      ctx.transformControl.setRotationSnap(rotationSnapStep)
      ctx.transformControl.attach(pipeGroup)
      ctx.transformControl.visible = true
      ctx.transformControl.enabled = true
    }
  }

  /**
   * Attach translate gizmo (XYZ arrows) for move mode.
   */
  const attachTranslateGizmo = (pipeGroup, assemblyItemId) => {
    ctx.selectedPipeGroup = pipeGroup
    ctx.rotatedObject = pipeGroup          // reuse same slot
    ctx.rotatedAssemblyItemId = assemblyItemId
    if (ctx.transformControl && pipeGroup) {
      deps.unfreezeObjectSubtree(pipeGroup)
      ctx.transformControl.setMode('translate')
      ctx.transformControl.setTranslationSnap(null) // free movement
      ctx.transformControl.attach(pipeGroup)
      ctx.transformControl.visible = true
      ctx.transformControl.enabled = true
    }
  }

  const syncRotationGizmoToSelection = () => {
    if (ctx.transformControl && ctx.selectedPipeGroup) {
      ctx.transformControl.attach(ctx.selectedPipeGroup)
    }
  }

  const detachRotationGizmo = () => {
    const itemId = ctx.rotatedAssemblyItemId

    // 归还弹出的零件前，同步变换到 InstancedMesh 并记录历史
    if (ctx.isAssemblyMode && itemId) {
      const poppedGroup = InstancedManager.getPoppedGroup(itemId)
      if (poppedGroup) {
        const currentRot = {
          x: poppedGroup.rotation.x,
          y: poppedGroup.rotation.y,
          z: poppedGroup.rotation.z
        }
        const stored = InstancedManager.getItemTransform(itemId)
        const storedRot = stored?.rotation || { x: 0, y: 0, z: 0 }

        // 如果旋转确实变化了且 mouseUp 没记录（rotationStartSnapshot 已被消费或未设置），补发历史事件
        const changed = Math.abs(currentRot.x - storedRot.x) > 0.001 ||
                        Math.abs(currentRot.y - storedRot.y) > 0.001 ||
                        Math.abs(currentRot.z - storedRot.z) > 0.001
        if (changed) {
          // 更新 InstancedMesh 变换
          InstancedManager.updateItemTransform(itemId,
            { x: poppedGroup.position.x, y: poppedGroup.position.y, z: poppedGroup.position.z },
            currentRot
          )
          // 检测实际变化最大的轴
          const adx = Math.abs(currentRot.x - storedRot.x)
          const ady = Math.abs(currentRot.y - storedRot.y)
          const adz = Math.abs(currentRot.z - storedRot.z)
          let detectedAxis = 'z'
          if (adx >= ady && adx >= adz) detectedAxis = 'x'
          else if (ady >= adx && ady >= adz) detectedAxis = 'y'
          // 保底：如果 mouseUp 没发过历史事件（rotationStartSnapshot 为 null），补发
          window.dispatchEvent(new CustomEvent('assembly-item-rotation-ended', {
            detail: {
              id: itemId,
              startRotation: { ...storedRot },
              endRotation: { ...currentRot },
              axis: detectedAxis
            }
          }))
          // 同步位置
          window.dispatchEvent(new CustomEvent('assembly-item-position-updated', {
            detail: {
              id: itemId,
              position: { x: poppedGroup.position.x, y: poppedGroup.position.y, z: poppedGroup.position.z }
            }
          }))
        }
      }
      InstancedManager.pushBackItem(itemId)
    }
    if (ctx.transformControl) {
      ctx.transformControl.detach()
      ctx.transformControl.visible = false
      ctx.transformControl.enabled = false
    }
    ctx.selectedPipeGroup = null
    ctx.rotatedObject = null
    ctx.rotatedAssemblyItemId = null
  }

  return {
    attachRotationGizmo,
    attachTranslateGizmo,
    syncRotationGizmoToSelection,
    detachRotationGizmo
  }
}
