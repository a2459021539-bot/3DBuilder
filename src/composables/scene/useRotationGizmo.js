import { rotationSnapStep } from './useSceneContext.js'

export function useRotationGizmo(ctx, deps) {
  const attachRotationGizmo = (pipeGroup, assemblyItemId) => {
    ctx.selectedPipeGroup = pipeGroup
    ctx.rotatedObject = pipeGroup
    ctx.rotatedAssemblyItemId = assemblyItemId
    if (ctx.transformControl && pipeGroup) {
      deps.unfreezeObjectSubtree(pipeGroup)
      ctx.transformControl.attach(pipeGroup)
      ctx.transformControl.visible = true
      ctx.transformControl.enabled = true
      ctx.transformControl.setRotationSnap(rotationSnapStep)
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

  return { attachRotationGizmo, syncRotationGizmoToSelection, detachRotationGizmo }
}
