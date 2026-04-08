import { rotationSnapStep } from './useSceneContext.js'

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
    if (ctx.transformControl) {
      ctx.transformControl.detach()
      ctx.transformControl.visible = false
      ctx.transformControl.enabled = false
    }
    ctx.selectedPipeGroup = null
    ctx.rotatedObject = null
    ctx.rotatedAssemblyItemId = null
    if (ctx.isAssemblyMode && ctx.previewPipe) deps.freezePreviewPipeMatrices()
  }

  return {
    attachRotationGizmo,
    attachTranslateGizmo,
    syncRotationGizmoToSelection,
    detachRotationGizmo
  }
}
