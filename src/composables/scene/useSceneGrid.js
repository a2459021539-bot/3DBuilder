import * as THREE from 'three'
import { ref } from 'vue'

const GRID_DISPOSE_DELAY_MS = 3000

const niceStep = (rough) => {
  const pow = Math.pow(10, Math.floor(Math.log10(rough)))
  const frac = rough / pow
  if (frac <= 1) return pow
  if (frac <= 2) return 2 * pow
  if (frac <= 5) return 5 * pow
  return 10 * pow
}

export const formatLength = (mm) => {
  if (mm >= 1000) return `${(mm / 1000).toFixed(mm % 1000 === 0 ? 0 : 1)}m`
  return `${mm}mm`
}

// 文字纹理缓存 — 网格标签字符串重复率极高（"100mm"、"1m" 等只有有限几种）。
// 注意：缓存中的 texture 会被多个场景对象（不同时期的 grid sprite）共享，
// 所以绝不能在驱逐时 dispose——会导致仍在场景中的 sprite 变成空白。
// 标签的唯一字符串数量天然有界（约几十个），这里用 Map 直接存全量，
// 不做容量限制 / 驱逐。
const _textureCache = new Map()

const createTextTexture = (text, fontSize = 32, color = 'rgba(255, 255, 255, 0.9)') => {
  const key = `${text}|${fontSize}|${color}`
  const cached = _textureCache.get(key)
  if (cached) return cached

  const canvas = document.createElement('canvas')
  const context = canvas.getContext('2d')
  canvas.width = 256
  canvas.height = 64
  context.fillStyle = color
  context.font = `bold ${fontSize}px Arial`
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  context.fillText(text, canvas.width / 2, canvas.height / 2)
  const texture = new THREE.CanvasTexture(canvas)
  texture.needsUpdate = true

  _textureCache.set(key, texture)
  return texture
}

// 添加坐标轴标签
export const addAxisLabels = (scene) => {
  const axisLength = 20
  const labelOffset = 2
  const xTexture = createTextTexture('X', 48, 'rgba(255, 0, 0, 1)')
  const xSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: xTexture }))
  xSprite.position.set(axisLength + labelOffset, 0, 0)
  xSprite.scale.set(3, 1.5, 1)
  scene.add(xSprite)
  const yTexture = createTextTexture('Y', 48, 'rgba(0, 255, 0, 1)')
  const ySprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: yTexture }))
  ySprite.position.set(0, axisLength + labelOffset, 0)
  ySprite.scale.set(3, 1.5, 1)
  scene.add(ySprite)
  const zTexture = createTextTexture('Z', 48, 'rgba(0, 100, 255, 1)')
  const zSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: zTexture }))
  zSprite.position.set(0, 0, axisLength + labelOffset)
  zSprite.scale.set(3, 1.5, 1)
  scene.add(zSprite)
}

export function useSceneGrid(ctx) {
  // --- Closure-local state ---
  let gridGroup = null
  const pendingGridDisposals = []
  let lastGridStep = 0
  let lastGridCenter = new THREE.Vector3()
  let lastScaleBarWorld = 0

  const scaleBarWidth = ref(100)
  const scaleBarTicks = ref([])

  // --- Accessor functions (for switchRenderer) ---
  const getGridGroup = () => gridGroup
  const setGridGroup = (g) => { gridGroup = g }
  const getLastGridStep = () => lastGridStep
  const setLastGridStep = (v) => { lastGridStep = v }
  const getLastGridCenter = () => lastGridCenter

  // --- Disposal helpers ---
  // 关键：Sprite 共享一个全局静态 BufferGeometry（three.js 内部 _geometry 单例），
  // 所以 dispose sprite.geometry 会把所有 sprite 的 geometry 一起干掉，
  // 之后整个程序的 sprite（包括坐标轴 XYZ、网格标签）全部不显示。
  // 同样 SpriteMaterial 的 map 来自模块级 _textureCache，多个 sprite 共享，也不能 dispose。
  // 结论：sprite 子节点不做任何 dispose，仅由 GC 回收 JS 对象。
  const safeDisposeGridGroup = (group) => {
    if (!group) return
    try {
      group.traverse((c) => {
        if (c.isSprite) return // 共享 geometry / 共享 texture，不可 dispose
        if (c.geometry) { try { c.geometry.dispose() } catch (_) {} }
        if (c.material) {
          const mats = Array.isArray(c.material) ? c.material : [c.material]
          for (const m of mats) {
            if (m.isSpriteMaterial) continue // 双保险
            if (m.map) { try { m.map.dispose() } catch (_) {} }
            try { m.dispose() } catch (_) {}
          }
        }
      })
    } catch (_) {}
  }

  const waitForRendererQueueIdle = async (targetRenderer = ctx.renderer) => {
    const queue = targetRenderer?.backend?.device?.queue
    if (!queue?.onSubmittedWorkDone) return
    try { await queue.onSubmittedWorkDone() } catch (_) {}
  }

  const scheduleGridGroupDisposal = (group) => {
    if (!group) return
    group.visible = false
    const isWebGPUBackend = ctx.renderer?.backend?.isWebGPUBackend === true
    if (isWebGPUBackend) {
      const entry = { group, cancelled: false }
      pendingGridDisposals.push(entry)
      waitForRendererQueueIdle(ctx.renderer).then(() => {
        if (entry.cancelled) return
        const idx = pendingGridDisposals.indexOf(entry)
        if (idx !== -1) pendingGridDisposals.splice(idx, 1)
        if (group.parent) group.parent.remove(group)
        safeDisposeGridGroup(group)
      })
      return
    }
    pendingGridDisposals.push({ group, time: performance.now(), cancelled: false })
  }

  const tickPendingGridDisposals = () => {
    if (pendingGridDisposals.length === 0) return
    const now = performance.now()
    for (let i = pendingGridDisposals.length - 1; i >= 0; i--) {
      const e = pendingGridDisposals[i]
      if (!e || !e.group) { pendingGridDisposals.splice(i, 1); continue }
      if (e.cancelled) { pendingGridDisposals.splice(i, 1); continue }
      if (!('time' in e)) continue
      if (now - e.time >= GRID_DISPOSE_DELAY_MS) {
        if (e.group.parent) e.group.parent.remove(e.group)
        safeDisposeGridGroup(e.group)
        pendingGridDisposals.splice(i, 1)
      }
    }
  }

  const flushPendingGridDisposals = () => {
    for (const e of pendingGridDisposals) {
      if (!e?.group) continue
      e.cancelled = true
      if (e.group.parent) e.group.parent.remove(e.group)
      safeDisposeGridGroup(e.group)
    }
    pendingGridDisposals.length = 0
  }

  const disposeGridGroupImmediate = (group) => { safeDisposeGridGroup(group) }

  // --- Dynamic grid ---
  const updateDynamicGrid = () => {
    if (!ctx.scene || !ctx.camera) return
    const target = ctx.controls ? ctx.controls.target : new THREE.Vector3()
    const dist = ctx.camera.position.distanceTo(target)
    const step = niceStep(dist / 10)
    const fineCx = Math.round(target.x / step) * step
    const fineCz = Math.round(target.z / step) * step
    const coarseStep = step * 5
    const coarseCx = Math.round(target.x / coarseStep) * coarseStep
    const coarseCz = Math.round(target.z / coarseStep) * coarseStep

    // 只有在 step 和中心点都没有明显变化时才跳过重建（WebGL/WebGPU 都适用）
    // 之前 WebGPU 路径直接 return 永不重建，导致标签停留在初始位置，
    // 用户移动相机后标签一直在世界的旧位置，看起来"后面就不显示了"。
    if (step === lastGridStep && Math.abs(fineCx - lastGridCenter.x) < step * 0.5 && Math.abs(fineCz - lastGridCenter.z) < step * 0.5) {
      updateScaleBar()
      return
    }
    lastGridStep = step
    lastGridCenter.set(fineCx, 0, fineCz)

    if (gridGroup) {
      scheduleGridGroupDisposal(gridGroup)
    }
    gridGroup = new THREE.Group()
    gridGroup.name = 'dynamicGrid'

    const gridExtent = step * 20
    const fineGrid = new THREE.GridHelper(gridExtent, gridExtent / step, 0x444444, 0x333333)
    fineGrid.material.opacity = 0.25
    fineGrid.material.transparent = true
    fineGrid.position.set(fineCx, 0, fineCz)
    gridGroup.add(fineGrid)

    const coarseGrid = new THREE.GridHelper(gridExtent, gridExtent / coarseStep, 0x666666, 0x555555)
    coarseGrid.material.opacity = 0.5
    coarseGrid.material.transparent = true
    // 粗网格主刻度线需要始终锚定世界原点，否则白线会和真实刻度错位。
    coarseGrid.position.set(coarseCx, 0, coarseCz)
    gridGroup.add(coarseGrid)

    const half = gridExtent / 2
    const labelScale = step * 2
    for (let i = -half; i <= half; i += coarseStep) {
      const wx = coarseCx + i
      const wz = coarseCz + i
      if (Math.abs(wx) > 0.001 || Math.abs(i) < 0.001) {
        const tex = createTextTexture(formatLength(Math.abs(wx)))
        const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false }))
        s.position.set(wx, 0.1, coarseCz - half - step)
        s.scale.set(labelScale, labelScale * 0.25, 1)
        gridGroup.add(s)
      }
      if (Math.abs(wz) > 0.001 || Math.abs(i) < 0.001) {
        const tex = createTextTexture(formatLength(Math.abs(wz)))
        const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false }))
        s.position.set(coarseCx - half - step, 0.1, wz)
        s.scale.set(labelScale, labelScale * 0.25, 1)
        gridGroup.add(s)
      }
    }

    ctx.scene.add(gridGroup)
    updateScaleBar()
  }

  // --- Scale bar (cached — avoid per-frame unproject) ---
  const _sbP1 = new THREE.Vector3()
  const _sbP2 = new THREE.Vector3()
  let _lastCamMatrixSig = ''

  const updateScaleBar = () => {
    if (!ctx.camera || !ctx.renderer) return
    const h = ctx.renderer.domElement.clientHeight
    const w = ctx.renderer.domElement.clientWidth
    if (h === 0 || w === 0) return

    // Quick check: skip if camera projectionMatrix hasn't changed
    const m = ctx.camera.projectionMatrix.elements
    const sig = `${m[0].toFixed(4)}|${m[5].toFixed(4)}|${m[10].toFixed(4)}|${m[14].toFixed(4)}|${w}|${h}`
    if (sig === _lastCamMatrixSig) return
    _lastCamMatrixSig = sig

    _sbP1.set(0, 0, 0.5).unproject(ctx.camera)
    _sbP2.set(1 / w, 0, 0.5).unproject(ctx.camera)
    const worldPerPixel = _sbP1.distanceTo(_sbP2)
    if (worldPerPixel === 0) return

    const barWorld = niceStep(worldPerPixel * 150)
    if (barWorld === lastScaleBarWorld) return
    lastScaleBarWorld = barWorld

    scaleBarWidth.value = Math.round(barWorld / worldPerPixel)

    const divisions = 5
    const ticks = []
    for (let i = 0; i <= divisions; i++) {
      const pct = (i / divisions) * 100
      const val = barWorld * i / divisions
      const label = (i === 0 || i === divisions) ? formatLength(val) : null
      ticks.push({ pct, label })
    }
    scaleBarTicks.value = ticks
  }

  return {
    updateDynamicGrid,
    updateScaleBar,
    tickPendingGridDisposals,
    flushPendingGridDisposals,
    disposeGridGroupImmediate,
    scheduleGridGroupDisposal,
    waitForRendererQueueIdle,
    scaleBarWidth,
    scaleBarTicks,
    // Accessor functions for switchRenderer
    getGridGroup,
    setGridGroup,
    getLastGridStep,
    setLastGridStep,
    getLastGridCenter
  }
}
