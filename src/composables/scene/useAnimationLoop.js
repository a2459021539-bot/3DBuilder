import { getPerfDebugEnabled } from './useSceneContext.js'

/**
 * Animation loop extracted from ThreeScene.vue.
 *
 * @param {object} ctx  - shared scene context (plain object)
 * @param {object} deps - external callbacks:
 *   { updateDynamicGrid, tickPendingGridDisposals, degradeLod }
 */
export function useAnimationLoop(ctx, deps) {

  const animateLoop = () => {
    if (ctx.stats) {
      ctx.stats.begin()
      if (ctx.stats._ms) ctx.stats._ms.begin()
      if (ctx.stats._mb) ctx.stats._mb.begin()
    }

    if (++ctx._perfDebugFrame % 120 === 0) ctx._perfDebugEnabled = getPerfDebugEnabled()
    const dbg = ctx._perfDebugEnabled
    let t0 = 0; let t1 = 0; let t2 = 0; let t3 = 0; let t4 = 0
    if (dbg) t0 = performance.now()

    if (ctx.controls) {
      ctx.controls.update()
    }
    if (dbg) t1 = performance.now()

    deps.updateDynamicGrid()
    if (dbg) t2 = performance.now()

    // Shadow update request
    if (ctx._shadowUpdateRequested && ctx.renderer.shadowMap && ctx.renderer.shadowMap.enabled) {
      ctx.renderer.shadowMap.needsUpdate = true
      ctx._shadowUpdateRequested = false
    }

    ctx.renderer.render(ctx.scene, ctx.camera)
    if (dbg) t3 = performance.now()

    // Must dispose old grid meshes after render/submit to avoid WebGPU internal cache race
    deps.tickPendingGridDisposals()
    if (dbg) t4 = performance.now()

    // FPS-adaptive LOD
    ctx._fpsFrames++
    const now = performance.now()
    if (now - ctx._fpsLastTime >= 1000) {
      ctx._fpsValue = ctx._fpsFrames
      ctx._fpsFrames = 0
      ctx._fpsLastTime = now
      if (ctx._lodAutoMode && ctx._fpsValue < 20 && ctx.previewPipe) deps.degradeLod()
    }

    // Stats info panel
    if (ctx.stats) {
      ctx.stats.end()
      if (ctx.stats._ms) ctx.stats._ms.end()
      if (ctx.stats._mb) ctx.stats._mb.end()
      if (ctx.stats._info && ++ctx._statsInfoTimer % 120 === 0) {
        let meshes = 0; let tris = 0
        ctx.scene.traverse((o) => {
          if (o.isMesh && o.visible && o.userData.isOuterSurface) {
            meshes++
            const g = o.geometry
            if (g) tris += g.index ? g.index.count / 3 : (g.attributes.position ? g.attributes.position.count / 3 : 0)
          }
        })
        ctx.stats._info.textContent = `零件 ${meshes}  面 ${Math.round(tris)}`
      }
    }

    // Perf debug logging
    if (dbg && ctx._perfDebugFrame % ctx._perfLogEvery === 0) {
      let meshAll = 0; let meshVisible = 0; let outer = 0; let castShadow = 0
      ctx.scene.traverse((o) => {
        if (!o.isMesh) return
        meshAll++
        if (o.visible) meshVisible++
        if (o.userData?.isOuterSurface) outer++
        if (o.castShadow) castShadow++
      })
      const r = ctx.renderer
      const backend = r?.backend?.isWebGPUBackend ? 'webgpu' : 'webgl'
      const info = r?.info
      const drawCallsFrame = info?.render?.drawCalls
      const triFrame = info?.render?.triangles
      const framePasses = info?.render?.frameCalls
      const callsLifetime = info?.render?.calls
      console.log('[3DBuild perf]', {
        lodAuto: ctx._lodAutoMode,
        refineScheduled: !!ctx._refineRAF,
        backend,
        ms: {
          controls: +(t1 - t0).toFixed(2),
          grid: +(t2 - t1).toFixed(2),
          render: +(t3 - t2).toFixed(2),
          gridDispose: +(t4 - t3).toFixed(2),
          frame: +(t4 - t0).toFixed(2)
        },
        meshes: { total: meshAll, visible: meshVisible, outerSurface: outer, castShadow },
        rendererInfo: info?.render
          ? {
              drawCallsThisFrame: drawCallsFrame,
              trianglesThisFrame: triFrame,
              renderPassesThisFrame: framePasses,
              renderCallsLifetime: callsLifetime
            }
          : '(无 info.render)'
      })
    }
  }

  const animate = () => {
    ctx.renderer.setAnimationLoop(animateLoop)
  }

  return {
    animate,
    animateLoop
  }
}
