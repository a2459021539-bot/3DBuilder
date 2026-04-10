import * as THREE from 'three'
import { createPipeObject } from '../../utils/pipeFactory.js'
import { createPipeMaterial } from '../../utils/pipeCommon.js'
// InstancedMesh 模式下不需要 proxy 更新

export function useLodSystem(ctx, deps) {
  // Note: do NOT destructure updateAssemblyView — it may be null at init time
  // due to circular dependencies. Always read it from deps at call time.
  const {
    enableShadowsForObject,
    freezeObjectSubtree,
    requestShadowUpdate
  } = deps

  // --- Internal helpers (not exported) ---

  const getNextLodSegments = (current, target) => {
    return Math.min(current + 1, target)
  }

  const getPrevLodSegments = (current) => {
    return Math.max(current - 1, 3)
  }

  const refinePipeObject = (pipeGroup) => {
    const ud = pipeGroup.userData
    if (!ud._originalParams || ud._lodSegments >= ud._targetSegments) return false
    // 立方体 LOD（segments=0）恢复时从 3 开始
    const nextSeg = ud._lodSegments < 3 ? 3 : getNextLodSegments(ud._lodSegments, ud._targetSegments)
    ud._isBoxLod = false
    const params = { ...ud._originalParams, segments: nextSeg }
    const newGroup = createPipeObject(params, ud.assemblyItemId)
    if (!newGroup) return false
    while (pipeGroup.children.length) pipeGroup.remove(pipeGroup.children[0])
    while (newGroup.children.length) pipeGroup.add(newGroup.children[0])
    ud._lodSegments = nextSeg
    enableShadowsForObject(pipeGroup)
    freezeObjectSubtree(pipeGroup)
    requestShadowUpdate()
    return true
  }

  // --- Exported functions ---

  const scheduleProgressiveRefine = () => {
    if (ctx._refineRAF) cancelAnimationFrame(ctx._refineRAF)
    if (!ctx._lodAutoMode) return
    const step = () => {
      if (!ctx.previewPipe || !ctx.camera || !ctx._lodAutoMode) return
      const n = ctx.previewPipe.children.length
      if (!n) {
        ctx._refineRAF = null
        return
      }
      let toRefine = null
      let scanned = 0
      while (scanned < n) {
        const child = ctx.previewPipe.children[ctx._lodRefineCursor % n]
        ctx._lodRefineCursor = (ctx._lodRefineCursor + 1) % n
        scanned++
        const ud = child.userData
        if (ud._originalParams && ud._lodSegments < ud._targetSegments) {
          toRefine = child
          break
        }
      }
      if (toRefine) {
        refinePipeObject(toRefine)
        // 更新代理网格
        // InstancedMesh 模式下无需 proxy 更新
        ctx._refineRAF = requestAnimationFrame(step)
      } else {
        ctx._refineRAF = null
      }
    }
    ctx._refineRAF = requestAnimationFrame(step)
  }

  /** 将直管替换为立方体（最低级 LOD） */
  const _replaceWithBox = (pipeGroup) => {
    const ud = pipeGroup.userData
    const p = ud._originalParams
    if (!p || p.type !== 'straight') return false

    const w = p.outerDiameter || 12
    const h = w
    const d = p.length || 50
    const geo = new THREE.BoxGeometry(w, d, w)
    const mat = createPipeMaterial()
    const box = new THREE.Mesh(geo, mat)
    box.userData.isOuterSurface = true
    if (ud.assemblyItemId) box.userData.assemblyItemId = ud.assemblyItemId

    while (pipeGroup.children.length) pipeGroup.remove(pipeGroup.children[0])
    pipeGroup.add(box)
    // 保持与原直管相同的朝向：原直管 group 有 rotation.x = π/2
    pipeGroup.rotation.set(Math.PI / 2, 0, 0)
    ud._lodSegments = 0 // 标记为立方体级别
    ud._isBoxLod = true
    enableShadowsForObject(pipeGroup)
    freezeObjectSubtree(pipeGroup)
    requestShadowUpdate()
    return true
  }

  const degradeLod = () => {
    if (!ctx.previewPipe) return
    // 优先降低分段数
    let target = null, maxSeg = 3
    for (const child of ctx.previewPipe.children) {
      const ud = child.userData
      if (ud._originalParams && ud._lodSegments > 3 && ud._lodSegments > maxSeg) {
        maxSeg = ud._lodSegments
        target = child
      }
    }
    if (target) {
      const ud = target.userData
      const prevSeg = getPrevLodSegments(ud._lodSegments)
      const params = { ...ud._originalParams, segments: prevSeg }
      const newGroup = createPipeObject(params, ud.assemblyItemId)
      if (!newGroup) return
      while (target.children.length) target.remove(target.children[0])
      while (newGroup.children.length) target.add(newGroup.children[0])
      ud._lodSegments = prevSeg
      enableShadowsForObject(target)
      freezeObjectSubtree(target)
      requestShadowUpdate()
      return
    }

    // 分段已最低（3），直管替换为立方体
    for (const child of ctx.previewPipe.children) {
      const ud = child.userData
      if (ud._originalParams && ud._originalParams.type === 'straight' &&
          ud._lodSegments === 3 && !ud._isBoxLod) {
        if (_replaceWithBox(child)) return
      }
    }
  }

  const handleLodModeChange = (event) => {
    const { auto, segments, items } = event.detail
    ctx._lodAutoMode = auto
    if (ctx._refineRAF) { cancelAnimationFrame(ctx._refineRAF); ctx._refineRAF = null }

    // 切到手动 / 切回自动 都需要拿真实的 assemblyItems 重建。
    // InstancedMesh 重构之后 ctx.previewPipe 只是空标记 Group，children 永远拿不到，
    // 所以必须依赖事件 detail 里 App.vue 传过来的 items（来自 assemblyItems.value）。
    if (items && items.length > 0) {
      deps.updateAssemblyView(items, true, true)
    }

    if (auto) {
      // 自动模式：开启 FPS 自适应渐进 refine
      scheduleProgressiveRefine()
    }
  }

  return {
    scheduleProgressiveRefine,
    degradeLod,
    handleLodModeChange
  }
}
