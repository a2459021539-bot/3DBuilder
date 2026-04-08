import { getPerfDebugEnabled } from './useSceneContext.js'

/**
 * Animation loop with on-demand rendering.
 *
 * Key optimization: When the camera hasn't moved and nothing is dirty,
 * we skip the expensive renderer.render() call entirely.
 * OrbitControls damping is handled by continuing to render for a short
 * window after user interaction stops.
 *
 * @param {object} ctx  - shared scene context (plain object)
 * @param {object} deps - external callbacks:
 *   { updateDynamicGrid, tickPendingGridDisposals, degradeLod }
 */
export function useAnimationLoop(ctx, deps) {
  // ---- Cached stats ----
  let _cachedMeshes = 0
  let _cachedTris = 0
  let _statsInfoDirty = true

  const markStatsDirty = () => { _statsInfoDirty = true }

  const _recomputeStats = () => {
    let meshes = 0; let tris = 0
    ctx.scene.traverse((o) => {
      if (o.isMesh && o.visible && o.userData.isOuterSurface) {
        meshes++
        const g = o.geometry
        if (g) tris += g.index ? g.index.count / 3 : (g.attributes.position ? g.attributes.position.count / 3 : 0)
      }
    })
    _cachedMeshes = meshes
    _cachedTris = tris
    _statsInfoDirty = false
  }

  // ---- On-demand rendering state ----
  let _renderNeeded = true        // initial render
  let _dampingFramesLeft = 0      // frames to keep rendering after interaction
  const DAMPING_FRAMES = 30       // ~0.5s at 60fps for damping to settle

  // Camera state tracking — detect if controls.update() actually changed anything
  let _lastCamPosX = NaN
  let _lastCamPosY = NaN
  let _lastCamPosZ = NaN
  let _lastCamQuatX = NaN
  let _lastCamQuatY = NaN
  let _lastCamQuatZ = NaN
  let _lastCamQuatW = NaN

  /** Mark that a render is needed (call from outside when state changes) */
  const requestRender = () => {
    _renderNeeded = true
  }

  /** Mark that interaction happened — extend damping window */
  const notifyInteraction = () => {
    _dampingFramesLeft = DAMPING_FRAMES
    _renderNeeded = true
  }

  const _cameraChanged = () => {
    const p = ctx.camera.position
    const q = ctx.camera.quaternion
    if (p.x !== _lastCamPosX || p.y !== _lastCamPosY || p.z !== _lastCamPosZ ||
        q.x !== _lastCamQuatX || q.y !== _lastCamQuatY || q.z !== _lastCamQuatZ || q.w !== _lastCamQuatW) {
      _lastCamPosX = p.x; _lastCamPosY = p.y; _lastCamPosZ = p.z
      _lastCamQuatX = q.x; _lastCamQuatY = q.y; _lastCamQuatZ = q.z; _lastCamQuatW = q.w
      return true
    }
    return false
  }

  const animateLoop = () => {
    if (ctx.stats) {
      ctx.stats.begin()
      if (ctx.stats._ms) ctx.stats._ms.begin()
      if (ctx.stats._mb) ctx.stats._mb.begin()
    }

    if (++ctx._perfDebugFrame % 120 === 0) ctx._perfDebugEnabled = getPerfDebugEnabled()
    const dbg = ctx._perfDebugEnabled
    let t0 = 0, t1 = 0, t2 = 0, t3 = 0, t4 = 0
    if (dbg) t0 = performance.now()

    // Update controls (handles damping inertia)
    if (ctx.controls) {
      ctx.controls.update()
    }
    if (dbg) t1 = performance.now()

    // Check if camera actually moved
    const camMoved = _cameraChanged()
    if (camMoved) _renderNeeded = true

    // Damping countdown
    if (_dampingFramesLeft > 0) {
      _dampingFramesLeft--
      _renderNeeded = true
    }

    // Shadow update
    if (ctx._shadowUpdateRequested) {
      _renderNeeded = true
    }

    // ---- SKIP RENDER if nothing changed ----
    // Stats info — update immediately when dirty regardless of render
    if (ctx.stats && ctx.stats._info && _statsInfoDirty) {
      _recomputeStats()
      ctx.stats._info.textContent = `零件 ${_cachedMeshes}  面 ${Math.round(_cachedTris)}`
    }

    if (!_renderNeeded) {
      deps.tickPendingGridDisposals()
      if (ctx.stats) {
        ctx.stats.end()
        if (ctx.stats._ms) ctx.stats._ms.end()
        if (ctx.stats._mb) ctx.stats._mb.end()
      }
      return
    }

    _renderNeeded = false

    // Grid update (only when rendering)
    deps.updateDynamicGrid()
    if (dbg) t2 = performance.now()

    // Shadow
    if (ctx._shadowUpdateRequested && ctx.renderer.shadowMap && ctx.renderer.shadowMap.enabled) {
      ctx.renderer.shadowMap.needsUpdate = true
      ctx._shadowUpdateRequested = false
    }

    // RENDER
    ctx.renderer.render(ctx.scene, ctx.camera)
    if (dbg) t3 = performance.now()

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

    // Stats end
    if (ctx.stats) {
      ctx.stats.end()
      if (ctx.stats._ms) ctx.stats._ms.end()
      if (ctx.stats._mb) ctx.stats._mb.end()
    }

    // Debug log
    if (dbg && ctx._perfDebugFrame % ctx._perfLogEvery === 0) {
      if (_statsInfoDirty) _recomputeStats()
      const r = ctx.renderer
      const info = r?.info
      console.log('[3DBuild perf]', {
        lodAuto: ctx._lodAutoMode,
        backend: r?.backend?.isWebGPUBackend ? 'webgpu' : 'webgl',
        ms: {
          controls: +(t1 - t0).toFixed(2),
          grid: +(t2 - t1).toFixed(2),
          render: +(t3 - t2).toFixed(2),
          gridDispose: +(t4 - t3).toFixed(2),
          frame: +(t4 - t0).toFixed(2)
        },
        meshes: _cachedMeshes,
        tris: Math.round(_cachedTris),
        rendererInfo: info?.render || '(无)'
      })
    }
  }

  const animate = () => {
    ctx.renderer.setAnimationLoop(animateLoop)
  }

  return {
    animate,
    animateLoop,
    markStatsDirty,
    requestRender,
    notifyInteraction
  }
}
