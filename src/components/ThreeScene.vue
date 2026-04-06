<template>
  <div class="three-container-wrapper">
    <!-- 2D草图面板（分屏时显示） -->
    <div v-if="isSplitView" class="sketch-panel">
      <Sketch2DCanvas 
        :initial-path-data="initialSketchPathData" 
        :initial-scale="2"
        @path-updated="handlePathUpdated" 
      />
    </div>
    
    <!-- 3D场景 -->
    <div ref="containerRef" class="three-container" :class="{ 'split-view': isSplitView }"></div>
    <!-- 比例尺 -->
    <div ref="scaleBarRef" class="scale-bar">
      <div class="scale-bar-ruler" :style="{ width: scaleBarWidth + 'px' }">
        <div class="scale-bar-track"></div>
        <div v-for="(tick, i) in scaleBarTicks" :key="i" class="scale-bar-tick" :style="{ left: tick.pct + '%' }">
          <div class="scale-bar-tick-line"></div>
          <span v-if="tick.label" class="scale-bar-tick-label">{{ tick.label }}</span>
        </div>
      </div>
    </div>
    <!-- 3D草图工具栏 -->
    <div v-if="isSketch3DMode" class="sketch3d-toolbar">
      <div class="sketch3d-toolbar-group">
        <span class="sketch3d-label">模式</span>
        <button :class="['sketch3d-btn', { active: sketch3DDrawMode === 'line' }]" @click="sketch3DDrawMode = 'line'">直线</button>
        <button :class="['sketch3d-btn', { active: sketch3DDrawMode === 'arc' }]" @click="sketch3DDrawMode = 'arc'">圆弧</button>
      </div>
      <div class="sketch3d-toolbar-group">
        <span class="sketch3d-label">平面</span>
        <button :class="['sketch3d-btn', { active: sketch3DWorkingPlane === 'XZ' }]" @click="sketch3DWorkingPlane = 'XZ'; sketch3DUpdateGrid()">XZ</button>
        <button :class="['sketch3d-btn', { active: sketch3DWorkingPlane === 'XY' }]" @click="sketch3DWorkingPlane = 'XY'; sketch3DUpdateGrid()">XY</button>
        <button :class="['sketch3d-btn', { active: sketch3DWorkingPlane === 'YZ' }]" @click="sketch3DWorkingPlane = 'YZ'; sketch3DUpdateGrid()">YZ</button>
      </div>
      <div class="sketch3d-toolbar-group">
        <button class="sketch3d-btn" @click="sketch3DUndo()">撤销</button>
        <button class="sketch3d-btn" @click="sketch3DClear()">清除</button>
        <button class="sketch3d-btn sketch3d-btn-confirm" @click="sketch3DConfirm()">确认</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import * as THREE from 'three'
import { WebGPURenderer } from 'three/webgpu'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { TransformControls } from 'three/addons/controls/TransformControls.js'
import { createPipeObject } from '../utils/pipeFactory.js'
import { createSketch2DPipe } from '../utils/sketch2dPipe.js'
import { createSketch3DPipe } from '../utils/sketch3dPipe.js'
import Sketch2DCanvas from './Sketch2DCanvas.vue'
import { ExportManager } from '../utils/exportManager.js'
import Stats from 'stats.js'

const containerRef = ref(null)
let stats = null
let scene = null
let camera = null
let renderer = null
let controls = null
let transformControl = null
let isPerspective = true // 当前是否为透视相机
const isWebGPU = ref(false) // 当前是否使用WebGPU渲染
let previewPipe = null // 预览直管对象
let isAssemblyMode = false // 当前是否处于装配体模式
let isRotationMode = false // 当前是否处于旋转模式
let rotationAxis = 'z' // 当前选择的旋转轴 ('x', 'y', 'z')
let isJoinMode = false // 当前是否处于拼接模式
let firstSelectedEndFace = null // 第一个选中的端面信息
let secondSelectedEndFace = null // 第二个选中的端面信息
let highlightedEndFaces = new Map() // 存储高亮的端面对象和原始材质 { endFaceObject: originalMaterial }
let selectedPipeGroup = null // 当前选中的管道（用于旋转手柄）
let rotationStartSnapshot = null // 记录旋转开始的姿态
const rotationSnapStep = THREE.MathUtils.degToRad(5) // 旋转吸附步长（弧度）
const isSplitView = ref(false) // 是否分屏显示
const sketchPathData = ref(null) // 2D草图路径数据
const sketch2DPipeParams = ref(null) // 2D草图管道参数
const initialSketchPathData = ref(null) // 初始路径数据（用于编辑时加载已有路径）
let isArrayMode = false // 是否处于阵列模式
const selectionHighlightMap = new Map() // 存储多选高亮的原始材质（统一用于所有选择）

// 3D草图状态
const isSketch3DMode = ref(false)
const sketch3DDrawMode = ref('line')
const sketch3DWorkingPlane = ref('XZ')
let sketch3DSegments = []
let sketch3DLastPoint = null
let sketch3DPreviewGroup = null
let sketch3DGridHelper = null
let sketch3DPipeParams = null
let sketch3DArcState = 'start'
let sketch3DArcStartPoint = null
let sketch3DArcEndPoint = null
const sketch3DSnapSize = 5 // 吸附步长 mm

// 动态菜单宽度
let currentMenuWidth = 250

// 计算可用宽度（考虑参数框和菜单）
const getAvailableWidth = () => {
  const paramsPanelWidth = 300 // 参数框宽度
  let availableWidth = window.innerWidth
  
  // 检查菜单是否折叠（通过检查菜单元素）
  const menuElement = document.querySelector('.side-menu')
  const isMenuCollapsed = menuElement && menuElement.classList.contains('collapsed')
  
  // 检查参数框是否显示
  const paramsPanel = document.querySelector('.params-panel')
  const isParamsPanelVisible = paramsPanel && window.getComputedStyle(paramsPanel).display !== 'none'
  
  // 如果菜单未折叠，减去菜单宽度（使用动态宽度）
  if (!isMenuCollapsed) {
    availableWidth -= currentMenuWidth
  }
  
  // 如果参数框显示，减去参数框宽度
  if (isParamsPanelVisible) {
    availableWidth -= paramsPanelWidth
  }
  
  return availableWidth
}

// 创建文字纹理
const createTextTexture = (text, fontSize = 32, color = 'rgba(255, 255, 255, 0.9)') => {
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
  return texture
}

// 添加坐标轴标签
const addAxisLabels = (scene) => {
  const axisLength = 20
  const labelOffset = 2 // 标签距离轴末端的距离
  
  // X轴标签（红色）
  const xTexture = createTextTexture('X', 48, 'rgba(255, 0, 0, 1)')
  const xSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: xTexture }))
  xSprite.position.set(axisLength + labelOffset, 0, 0)
  xSprite.scale.set(3, 1.5, 1)
  scene.add(xSprite)
  
  // Y轴标签（绿色）
  const yTexture = createTextTexture('Y', 48, 'rgba(0, 255, 0, 1)')
  const ySprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: yTexture }))
  ySprite.position.set(0, axisLength + labelOffset, 0)
  ySprite.scale.set(3, 1.5, 1)
  scene.add(ySprite)
  
  // Z轴标签（蓝色）
  const zTexture = createTextTexture('Z', 48, 'rgba(0, 100, 255, 1)')
  const zSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: zTexture }))
  zSprite.position.set(0, 0, axisLength + labelOffset)
  zSprite.scale.set(3, 1.5, 1)
  scene.add(zSprite)
}

// 动态网格系统 - 根据相机距离自适应
let gridGroup = null
/** WebGPU 上一帧 queue.submit 可能仍引用网格 buffer，同帧 remove + dispose 会触发 “used in submit while destroyed” */
const pendingGridDisposals = []
const GRID_DISPOSE_DELAY_MS = 3000
const safeDisposeGridGroup = (group) => {
  if (!group) return
  try {
    group.traverse((c) => {
      if (c.geometry) { try { c.geometry.dispose() } catch (_) {} }
      if (c.material) {
        const mats = Array.isArray(c.material) ? c.material : [c.material]
        for (const m of mats) {
          if (m.map) { try { m.map.dispose() } catch (_) {} }
          try { m.dispose() } catch (_) {}
        }
      }
    })
  } catch (_) {}
}
const waitForRendererQueueIdle = async (targetRenderer = renderer) => {
  const queue = targetRenderer?.backend?.device?.queue
  if (!queue?.onSubmittedWorkDone) return
  try {
    await queue.onSubmittedWorkDone()
  } catch (_) {}
}
const scheduleGridGroupDisposal = (group) => {
  if (!group) return
  group.visible = false

  const isWebGPUBackend = renderer?.backend?.isWebGPUBackend === true
  if (isWebGPUBackend) {
    const entry = { group, cancelled: false }
    pendingGridDisposals.push(entry)
    waitForRendererQueueIdle(renderer).then(() => {
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
let lastGridStep = 0
let lastGridCenter = new THREE.Vector3()
let lastScaleBarWorld = 0
const scaleBarRef = ref(null)
const scaleBarText = ref('')
const scaleBarWidth = ref(100)
const scaleBarTicks = ref([])

// 计算合适的网格步长（1, 2, 5, 10, 20, 50, ...）
const niceStep = (rough) => {
  const pow = Math.pow(10, Math.floor(Math.log10(rough)))
  const frac = rough / pow
  if (frac <= 1) return pow
  if (frac <= 2) return 2 * pow
  if (frac <= 5) return 5 * pow
  return 10 * pow
}

const formatLength = (mm) => {
  if (mm >= 1000) return `${(mm / 1000).toFixed(mm % 1000 === 0 ? 0 : 1)}m`
  return `${mm}mm`
}

const updateDynamicGrid = () => {
  if (!scene || !camera) return

  const target = controls ? controls.target : new THREE.Vector3()
  const dist = camera.position.distanceTo(target)
  const step = niceStep(dist / 10)
  const cx = Math.round(target.x / step) * step
  const cz = Math.round(target.z / step) * step

  const isWebGPUBackend = renderer?.backend?.isWebGPUBackend === true
  // WebGPU：three.js 当前版本在「每帧/交互后 dispose + 重建」时仍易触发 buffer 在 submit 时已销毁。
  // 可靠规避：真 WebGPU 后端下地面网格只创建一次，之后只更新比例尺（功能取舍，换稳定性）。
  if (isWebGPUBackend && gridGroup) {
    updateScaleBar()
    return
  }

  // 只在步长或中心位置变化时重建网格（WebGL 或 WebGPU 首次建网格）
  if (!isWebGPUBackend && step === lastGridStep && Math.abs(cx - lastGridCenter.x) < step * 0.5 && Math.abs(cz - lastGridCenter.z) < step * 0.5) {
    updateScaleBar()
    return
  }
  lastGridStep = step
  lastGridCenter.set(cx, 0, cz)

  // WebGL：旧网格延后释放；WebGPU 首次建网格前不应有旧 gridGroup（若从 WebGL 切来则下面会处理）
  if (gridGroup) {
    scheduleGridGroupDisposal(gridGroup)
  }
  gridGroup = new THREE.Group()
  gridGroup.name = 'dynamicGrid'

  const gridExtent = step * 20

  // 细网格
  const fineGrid = new THREE.GridHelper(gridExtent, gridExtent / step, 0x444444, 0x333333)
  fineGrid.material.opacity = 0.25
  fineGrid.material.transparent = true
  fineGrid.position.set(cx, 0, cz)
  gridGroup.add(fineGrid)

  // 粗网格（5x step）
  const coarseStep = step * 5
  const coarseGrid = new THREE.GridHelper(gridExtent, gridExtent / coarseStep, 0x666666, 0x555555)
  coarseGrid.material.opacity = 0.5
  coarseGrid.material.transparent = true
  coarseGrid.position.set(cx, 0, cz)
  gridGroup.add(coarseGrid)

  // 地面刻度标注 — 沿粗网格线标注坐标值
  const half = gridExtent / 2
  const labelScale = step * 2
  for (let i = -half; i <= half; i += coarseStep) {
    const wx = cx + i
    const wz = cz + i
    if (Math.abs(wx) > 0.001 || Math.abs(i) < 0.001) {
      const tex = createTextTexture(formatLength(Math.abs(wx)))
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false }))
      s.position.set(wx, 0.1, cz - half - step)
      s.scale.set(labelScale, labelScale * 0.25, 1)
      gridGroup.add(s)
    }
    if (Math.abs(wz) > 0.001 || Math.abs(i) < 0.001) {
      const tex = createTextTexture(formatLength(Math.abs(wz)))
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false }))
      s.position.set(cx - half - step, 0.1, wz)
      s.scale.set(labelScale, labelScale * 0.25, 1)
      gridGroup.add(s)
    }
  }

  scene.add(gridGroup)
  updateScaleBar()
}

const updateScaleBar = () => {
  if (!camera || !renderer) return
  // 用屏幕中心两点反投影计算世界单位/像素，不依赖controls.target
  const h = renderer.domElement.clientHeight
  const w = renderer.domElement.clientWidth
  if (h === 0 || w === 0) return

  const p1 = new THREE.Vector3(0, 0, 0.5).unproject(camera)
  const p2 = new THREE.Vector3(1 / w, 0, 0.5).unproject(camera) // 偏移1像素
  const worldPerPixel = p1.distanceTo(p2)
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

const initThree = async () => {
  // 创建场景
  scene = new THREE.Scene()
  scene.background = new THREE.Color(0x1a1a1a)

  // 初始化性能监控 - 3个面板同时显示，可拖拽，可收纳
  const statsPanel = document.createElement('div')
  statsPanel.id = 'stats-panel'
  statsPanel.style.cssText = 'position:absolute;top:60px;right:0;z-index:100;user-select:none;background:rgba(0,0,0,0.85);border-radius:4px;overflow:hidden;'
  // 拖拽标题栏
  const titleBar = document.createElement('div')
  titleBar.style.cssText = 'height:16px;cursor:move;display:flex;align-items:center;justify-content:flex-end;padding:0 4px;background:rgba(255,255,255,0.1);'
  const collapseBtn = document.createElement('span')
  collapseBtn.style.cssText = 'cursor:pointer;color:#aaa;font-size:14px;line-height:16px;'
  collapseBtn.textContent = '−'
  titleBar.appendChild(collapseBtn)
  statsPanel.appendChild(titleBar)
  // 面板容器
  const panelsRow = document.createElement('div')
  panelsRow.style.cssText = 'display:flex;'
  const panels = [0, 1, 2] // FPS, MS, MB
  panels.forEach(i => {
    const s = new Stats()
    s.showPanel(i)
    const canvas = s.dom.children[i]
    if (canvas) { canvas.style.cssText = 'width:100px;height:60px;display:block;' }
    const wrapper = document.createElement('div')
    wrapper.style.cssText = 'width:100px;height:60px;overflow:hidden;pointer-events:none;'
    wrapper.appendChild(canvas)
    panelsRow.appendChild(wrapper)
    if (i === 0) stats = s
    else if (i === 1) stats._ms = s
    else stats._mb = s
  })
  statsPanel.appendChild(panelsRow)
  // 零件数/面数信息栏
  const statsInfo = document.createElement('div')
  statsInfo.style.cssText = 'color:#ccc;font-size:12px;font-family:monospace;padding:4px 8px;white-space:nowrap;'
  statsPanel.appendChild(statsInfo)
  stats._info = statsInfo
  // 收纳小圆球
  const statsBall = document.createElement('div')
  statsBall.id = 'stats-ball'
  statsBall.style.cssText = 'position:absolute;top:60px;right:0;width:24px;height:24px;background:rgba(0,180,0,0.8);border-radius:50%;cursor:pointer;z-index:100;display:none;user-select:none;'
  statsBall.title = '展开性能面板'
  // 收纳/展开
  collapseBtn.addEventListener('click', () => { const r = collapseBtn.getBoundingClientRect(); const pr = parentEl.getBoundingClientRect(); statsPanel.style.display = 'none'; statsBall.style.display = 'block'; statsBall.style.left = (r.left - pr.left) + 'px'; statsBall.style.top = (r.top - pr.top) + 'px'; statsBall.style.right = 'auto' })
  statsBall.addEventListener('click', () => { statsBall.style.display = 'none'; statsPanel.style.display = 'block' })
  // 拖拽面板
  let _pd = false, _px = 0, _py = 0
  titleBar.addEventListener('mousedown', e => { _pd = true; _px = e.clientX - statsPanel.offsetLeft; _py = e.clientY - statsPanel.offsetTop; e.preventDefault() })
  // 拖拽圆球
  let _bd = false, _bx = 0, _by = 0
  statsBall.addEventListener('mousedown', e => { if (e.detail > 0) { _bd = true; _bx = e.clientX - statsBall.offsetLeft; _by = e.clientY - statsBall.offsetTop; e.preventDefault() } })
  document.addEventListener('mousemove', e => {
    if (_pd) { statsPanel.style.left = (e.clientX - _px) + 'px'; statsPanel.style.top = (e.clientY - _py) + 'px'; statsPanel.style.right = 'auto' }
    if (_bd) { statsBall.style.left = (e.clientX - _bx) + 'px'; statsBall.style.top = (e.clientY - _by) + 'px'; statsBall.style.right = 'auto' }
  })
  document.addEventListener('mouseup', () => { _pd = false; _bd = false })
  const parentEl = containerRef.value.parentElement
  parentEl.appendChild(statsPanel)
  parentEl.appendChild(statsBall)

  // 创建相机
  camera = new THREE.PerspectiveCamera(
    75,
    window.innerWidth / window.innerHeight,
    0.1,
    10000
  )
  camera.position.set(5, 5, 5)

  // 创建渲染器（统一使用 WebGPURenderer，默认 WebGL 后端）
  renderer = new WebGPURenderer({ antialias: true, powerPreference: 'high-performance', forceWebGL: true })
  await renderer.init()
  renderer.setSize(window.innerWidth, window.innerHeight)
  renderer.setPixelRatio(window.devicePixelRatio)
  // 启用阴影映射
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFShadowMap
  containerRef.value.appendChild(renderer.domElement)

  // 添加环境光
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.5)
  scene.add(ambientLight)

  // 添加方向光（用于产生阴影）
  const directionalLight = new THREE.DirectionalLight(0xffffff, 1)
  directionalLight.position.set(5, 10, 5)
  directionalLight.castShadow = true
  // 配置阴影贴图参数
  directionalLight.shadow.mapSize.width = 2048
  directionalLight.shadow.mapSize.height = 2048
  directionalLight.shadow.camera.near = 0.5
  directionalLight.shadow.camera.far = 500
  directionalLight.shadow.camera.left = -100
  directionalLight.shadow.camera.right = 100
  directionalLight.shadow.camera.top = 100
  directionalLight.shadow.camera.bottom = -100
  directionalLight.shadow.bias = -0.0001
  scene.add(directionalLight)

  // 创建动态网格系统
  updateDynamicGrid()

  // 添加坐标轴辅助线（增大长度使其更明显）
  const axesHelper = new THREE.AxesHelper(20)
  scene.add(axesHelper)
  
  // 添加坐标轴标签
  addAxisLabels(scene)

  // 添加轨道控制器
  controls = new OrbitControls(camera, renderer.domElement)
  controls.enableDamping = true // 启用阻尼效果，使旋转更平滑
  controls.dampingFactor = 0.05

  // 初始化旋转操作手柄（使用 TransformControls 提供交互式旋转球）
  transformControl = new TransformControls(camera, renderer.domElement)
  transformControl.setMode('rotate')
  transformControl.setSpace('local')
  transformControl.setRotationSnap(rotationSnapStep)
  transformControl.size = 0.9
  transformControl.visible = false
  transformControl.enabled = false
  scene.add(transformControl.getHelper())

  // 旋转交互事件
  transformControl.addEventListener('dragging-changed', (event) => {
    // 拖拽时关闭轨道控制，避免冲突
    if (controls) {
      controls.enabled = !event.value
    }
  })

  transformControl.addEventListener('mouseDown', () => {
    // 记录旋转开始时的姿态
    if (transformControl.object) {
      rotationStartSnapshot = {
        x: transformControl.object.rotation.x,
        y: transformControl.object.rotation.y,
        z: transformControl.object.rotation.z
      }
    }
  })

  transformControl.addEventListener('objectChange', () => {
    const obj = transformControl.object
    if (obj && rotatedAssemblyItemId) {
      window.dispatchEvent(new CustomEvent('assembly-item-rotation-updated', {
        detail: {
          id: rotatedAssemblyItemId,
          rotation: {
            x: obj.rotation.x,
            y: obj.rotation.y,
            z: obj.rotation.z
          },
          isUserInput: false
        }
      }))
    }
  })

  transformControl.addEventListener('mouseUp', () => {
    const obj = transformControl.object
    if (obj && rotatedAssemblyItemId && rotationStartSnapshot) {
      window.dispatchEvent(new CustomEvent('assembly-item-rotation-ended', {
        detail: {
          id: rotatedAssemblyItemId,
          startRotation: { ...rotationStartSnapshot },
          endRotation: {
            x: obj.rotation.x,
            y: obj.rotation.y,
            z: obj.rotation.z
          },
          axis: rotationAxis
        }
      }))
    }
    rotationStartSnapshot = null
  })
  
  // 添加鼠标事件监听（用于拖拽）
  renderer.domElement.addEventListener('mousedown', onMouseDown)
  renderer.domElement.addEventListener('mousemove', onMouseMove)
  renderer.domElement.addEventListener('mouseup', onMouseUp)
  renderer.domElement.addEventListener('click', onMouseClick)
  
  // 配置鼠标按钮
  // 左键：旋转（默认）
  // 右键：平移
  controls.mouseButtons = {
    LEFT: THREE.MOUSE.ROTATE,    // 左键旋转
    MIDDLE: THREE.MOUSE.DOLLY,   // 中键缩放
    RIGHT: THREE.MOUSE.PAN        // 右键平移
  }

  // 设置平移速度
  controls.panSpeed = 0.8

  // 开始动画循环
  animate()
}

let _statsInfoTimer = 0
const animateLoop = () => {
  if (stats) { stats.begin(); if (stats._ms) stats._ms.begin(); if (stats._mb) stats._mb.begin() }

  if (controls) {
    controls.update()
  }

  updateDynamicGrid()

  renderer.render(scene, camera)
  // 必须在 render/submit 之后再 dispose 旧网格，避免 WebGPU 与 Three 内部缓存竞态（移动相机时高频重建网格）
  tickPendingGridDisposals()
  // FPS 自适应 LOD
  _fpsFrames++
  const now = performance.now()
  if (now - _fpsLastTime >= 1000) {
    _fpsValue = _fpsFrames
    _fpsFrames = 0
    _fpsLastTime = now
    if (_lodAutoMode && _fpsValue < 20 && previewPipe) degradeLod()
  }
  if (stats) {
    stats.end(); if (stats._ms) stats._ms.end(); if (stats._mb) stats._mb.end()
    if (stats._info && ++_statsInfoTimer % 30 === 0) {
      let meshes = 0, tris = 0
      scene.traverse(o => { if (o.isMesh && o.visible && o.userData.isOuterSurface) { meshes++; const g = o.geometry; if (g) tris += g.index ? g.index.count / 3 : (g.attributes.position ? g.attributes.position.count / 3 : 0) } })
      stats._info.textContent = `零件 ${meshes}  面 ${Math.round(tris)}`
    }
  }
}

const animate = () => {
  renderer.setAnimationLoop(animateLoop)
}

const handleResize = () => {
  if (!camera || !renderer) return

  // 计算实际渲染尺寸
  // 分屏时：考虑参数框宽度，2D草图和3D预览各占可用宽度的一半
  const availableWidth = getAvailableWidth()
  let width
  if (isSplitView.value) {
    width = availableWidth / 2
  } else {
    width = availableWidth
  }
  const height = window.innerHeight

  if (camera instanceof THREE.PerspectiveCamera) {
    camera.aspect = width / height
  } else if (camera instanceof THREE.OrthographicCamera) {
    const aspect = width / height
    const viewSize = 10
    camera.left = -viewSize * aspect
    camera.right = viewSize * aspect
    camera.top = viewSize
    camera.bottom = -viewSize
  }
  camera.updateProjectionMatrix()
  renderer.setSize(width, height)
  
  // 更新容器尺寸
  if (containerRef.value) {
    containerRef.value.style.width = width + 'px'
    containerRef.value.style.height = height + 'px'
  }
  
  // 更新wrapper和sketch-panel的宽度（分屏时）
  const wrapper = document.querySelector('.three-container-wrapper')
  const sketchPanel = document.querySelector('.sketch-panel')
  
  // 计算左侧偏移（菜单 + 参数框）
  const paramsPanelWidth = 300
  const menuElement = document.querySelector('.side-menu')
  const isMenuCollapsed = menuElement && menuElement.classList.contains('collapsed')
  const paramsPanel = document.querySelector('.params-panel')
  const isParamsPanelVisible = paramsPanel && window.getComputedStyle(paramsPanel).display !== 'none'
  
  let marginLeft = 0
  if (!isMenuCollapsed) {
    marginLeft += currentMenuWidth
  }
  if (isParamsPanelVisible) {
    marginLeft += paramsPanelWidth
  }
  
  if (isSplitView.value) {
    if (wrapper) {
      wrapper.style.width = availableWidth + 'px'
      wrapper.style.marginLeft = marginLeft + 'px'
    }
    if (sketchPanel) {
      sketchPanel.style.width = (availableWidth / 2) + 'px'
      sketchPanel.style.flex = 'none'
    }
    if (containerRef.value) {
      containerRef.value.style.width = (availableWidth / 2) + 'px'
      containerRef.value.style.flex = 'none'
    }
  } else {
    if (wrapper) {
      wrapper.style.width = availableWidth + 'px'
      wrapper.style.marginLeft = marginLeft + 'px'
    }
    if (sketchPanel) {
      sketchPanel.style.width = '0'
      sketchPanel.style.flex = ''
    }
    if (containerRef.value) {
      containerRef.value.style.width = availableWidth + 'px'
      containerRef.value.style.flex = ''
    }
  }
}

const switchCamera = () => {
  if (!camera || !controls || !renderer) return

  // 保存当前相机状态
  const position = camera.position.clone()
  const target = controls.target.clone()
  const zoom = camera.zoom || 1
  const quaternion = camera.quaternion.clone()

  // 创建新相机
  let newCamera
  if (isPerspective) {
    // 切换到正交相机
    const aspect = window.innerWidth / window.innerHeight
    const viewSize = 10
    newCamera = new THREE.OrthographicCamera(
      -viewSize * aspect,
      viewSize * aspect,
      viewSize,
      -viewSize,
      0.1,
      10000
    )
    newCamera.position.copy(position)
    newCamera.quaternion.copy(quaternion)
    newCamera.zoom = Math.max(zoom, 0.1) // 确保 zoom 有效
    newCamera.updateProjectionMatrix()
    isPerspective = false
  } else {
    // 切换到透视相机
    newCamera = new THREE.PerspectiveCamera(
      75,
      window.innerWidth / window.innerHeight,
      0.1,
      10000
    )
    newCamera.position.copy(position)
    newCamera.quaternion.copy(quaternion)
    newCamera.updateProjectionMatrix()
    isPerspective = true
  }

  // 更新控制器
  controls.object = newCamera
  controls.target.copy(target)
  camera = newCamera
  
  // 强制更新控制器
  controls.update()
}

const switchRenderer = async () => {
  if (!renderer || !camera || !controls || !containerRef.value) return

  // 先停动画并等待旧 GPU 队列清空，再清理待释放网格，避免跨 backend 的 buffer 竞态
  renderer.setAnimationLoop(null)
  if (renderer._animation) renderer._animation.stop()
  await waitForRendererQueueIdle(renderer)
  flushPendingGridDisposals()

  // 保存状态
  const pos = camera.position.clone()
  const target = controls.target.clone()
  const quat = camera.quaternion.clone()

  // 移除旧事件和DOM
  renderer.domElement.removeEventListener('mousedown', onMouseDown)
  renderer.domElement.removeEventListener('mousemove', onMouseMove)
  renderer.domElement.removeEventListener('mouseup', onMouseUp)
  renderer.domElement.removeEventListener('click', onMouseClick)
  containerRef.value.removeChild(renderer.domElement)

  // 清理旧 controls
  if (transformControl) {
    scene.remove(transformControl.getHelper())
    transformControl.dispose()
  }
  controls.dispose()

  // 保留旧渲染器引用
  const oldRenderer = renderer

  // 创建新 renderer（统一使用 WebGPURenderer，切换后端）
  const useGPU = !isWebGPU.value
  renderer = new WebGPURenderer({ antialias: true, powerPreference: 'high-performance', forceWebGL: !useGPU })
  await renderer.init()
  if (useGPU) {
    const adapter = renderer.backend?.adapter
    if (adapter) {
      const info = await adapter.requestAdapterInfo()
      console.log('WebGPU Adapter:', info.vendor, info.architecture, info.device, info.description)
    }
  }
  isWebGPU.value = useGPU

  // 切回 WebGL 时丢弃当前地面网格并强制下一帧按 WebGL 逻辑重建；切到 WebGPU 则保留现有网格并进入「只建一次」模式
  if (!useGPU) {
    if (gridGroup) {
      scheduleGridGroupDisposal(gridGroup)
      gridGroup = null
    }
    lastGridStep = 0
    lastGridCenter.set(0, 0, 0)
  }

  const rect = containerRef.value.getBoundingClientRect()
  renderer.setSize(rect.width, rect.height)
  renderer.setPixelRatio(window.devicePixelRatio)
  if (renderer.shadowMap) {
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFShadowMap
  }
  containerRef.value.appendChild(renderer.domElement)

  // 重建 controls
  controls = new OrbitControls(camera, renderer.domElement)
  controls.enableDamping = true
  controls.dampingFactor = 0.05
  controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN }
  controls.panSpeed = 0.8
  controls.target.copy(target)

  transformControl = new TransformControls(camera, renderer.domElement)
  transformControl.setMode('rotate')
  transformControl.setSpace('local')
  transformControl.setRotationSnap(rotationSnapStep)
  transformControl.size = 0.9
  transformControl.visible = false
  transformControl.enabled = false
  scene.add(transformControl.getHelper())

  // 恢复相机
  camera.position.copy(pos)
  camera.quaternion.copy(quat)
  controls.update()

  // 重新绑定事件
  renderer.domElement.addEventListener('mousedown', onMouseDown)
  renderer.domElement.addEventListener('mousemove', onMouseMove)
  renderer.domElement.addEventListener('mouseup', onMouseUp)
  renderer.domElement.addEventListener('click', onMouseClick)

  // 如果在3D草图模式，禁用左键旋转
  if (isSketch3DMode.value) controls.mouseButtons.LEFT = null

  // 重启动画
  animate()

  // 延后释放旧渲染器，避免与上一帧 WebGPU submit 竞态（默认每个 WebGPURenderer 独立 device）
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      try {
        oldRenderer.dispose()
      } catch (e) {
        console.warn('释放旧渲染器失败:', e)
      }
    })
  })

  // 通知App.vue更新按钮文字
  window.dispatchEvent(new CustomEvent('renderer-switched', { detail: { type: useGPU ? 'webgpu' : 'webgl' } }))
}

const handleResetCamera = () => {
  if (camera && controls) {
    camera.position.set(0, 0, 5)
    controls.target.set(0, 0, 0)
    controls.update()
  }
}

// 为管道对象启用阴影的辅助函数
const enableShadowsForObject = (object) => {
  if (!object) return
  
  object.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      child.castShadow = true
      child.receiveShadow = true
    }
  })
}

// 将旋转手柄附着到指定管道
const attachRotationGizmo = (pipeGroup, assemblyItemId) => {
  selectedPipeGroup = pipeGroup
  rotatedObject = pipeGroup
  rotatedAssemblyItemId = assemblyItemId
  if (transformControl && pipeGroup) {
    transformControl.attach(pipeGroup)
    transformControl.visible = true
    transformControl.enabled = true
    transformControl.setRotationSnap(rotationSnapStep)
  }
}

// 同步手柄姿态（在外部修改旋转后调用）
const syncRotationGizmoToSelection = () => {
  if (transformControl && selectedPipeGroup) {
    transformControl.attach(selectedPipeGroup)
  }
}

// 移除旋转手柄并清空选择
const detachRotationGizmo = () => {
  if (transformControl) {
    transformControl.detach()
    transformControl.visible = false
    transformControl.enabled = false
  }
  selectedPipeGroup = null
  rotatedObject = null
  rotatedAssemblyItemId = null
}

// 创建直管预览
const createPipePreview = (params) => {
  if (!scene) {
    console.warn('createPipePreview: scene is not initialized')
    return
  }

  // 移除旧的预览对象
  clearPipePreview()

  // 设置为非装配体模式
  isAssemblyMode = false

  // 确保 params 存在且有效
  if (!params || !params.type) {
    console.warn('createPipePreview: invalid params', params)
    return
  }

  const pipeGroup = createPipeObject(params)
  if (!pipeGroup) {
    console.warn('createPipePreview: createPipeObject returned null', params)
    return
  }

  // 为管道启用阴影
  enableShadowsForObject(pipeGroup)

  previewPipe = pipeGroup
  scene.add(previewPipe)

  // 自动调整相机以查看整个模型
  if (camera && controls) {
    const size = pipeGroup.userData.size || 100
    const cameraDistance = size * 1.5  // 减小倍数，让视角更近
    camera.position.set(cameraDistance, cameraDistance * 0.7, cameraDistance)
    controls.target.set(0, 0, 0)
    controls.update()
  }
}

// 射线检测相关
const raycaster = new THREE.Raycaster()
const pointer = new THREE.Vector2()

// 拖拽相关变量
let isMoveMode = false
let isDragging = false
let draggedObject = null
let draggedAssemblyItemId = null
let draggedAssemblyItemIds = [] // 批量移动时选中的装配项ID列表
let draggedObjects = [] // 批量移动时的管道对象列表
let dragStartPositions = [] // 批量移动时的起始位置列表
let dragPlane = null
let dragStartPoint = new THREE.Vector3()
let dragOffset = new THREE.Vector3()
let saveHistoryTimer = null
let hasMoved = false // 标记是否真的进行了移动（鼠标移动了）
let movePlane = 'free' // 移动平面约束：'free'（任意）、'xy'、'yz'、'zx'
const selectedAssemblyItemIds = new Set() // 当前选中的装配项ID集合

// 旋转相关变量
let isRotating = false
let rotatedObject = null
let rotatedAssemblyItemId = null
let rotationStartAngle = 0
let rotationStartMouseY = 0
let rotationSaveHistoryTimer = null
let hasRotated = false // 标记是否真的进行了旋转（鼠标移动了）

// 辅助函数：查找被点击的对象的装配体实例ID
const findAssemblyItemId = (object) => {
  let current = object
  while (current) {
    if (current.userData && current.userData.assemblyItemId) {
      return current.userData.assemblyItemId
    }
    // 检查父对象（Group）
    if (current.parent && current.parent.userData && current.parent.userData.assemblyItemId) {
      return current.parent.userData.assemblyItemId
    }
    current = current.parent
  }
  return null
}

// 创建高亮材质
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

// 高亮端面
const highlightEndFace = (endFaceObject, isFirst = true) => {
  if (!endFaceObject || !endFaceObject.material) return
  
  // 如果已经高亮了，先恢复
  if (highlightedEndFaces.has(endFaceObject)) {
    return
  }
  
  // 保存原始材质
  const originalMaterial = endFaceObject.material
  highlightedEndFaces.set(endFaceObject, originalMaterial)
  
  // 应用高亮材质
  const highlightMaterial = createHighlightMaterial(isFirst)
  endFaceObject.material = highlightMaterial
}

// 恢复端面原始材质
const restoreEndFace = (endFaceObject) => {
  if (!endFaceObject || !highlightedEndFaces.has(endFaceObject)) return
  
  const originalMaterial = highlightedEndFaces.get(endFaceObject)
  endFaceObject.material = originalMaterial
  highlightedEndFaces.delete(endFaceObject)
}

// 清除所有高亮
const clearAllHighlights = () => {
  highlightedEndFaces.forEach((originalMaterial, endFaceObject) => {
    if (endFaceObject && endFaceObject.material) {
      endFaceObject.material = originalMaterial
    }
  })
  highlightedEndFaces.clear()
}

// 根据装配体ID查找管道组
const findPipeGroupByAssemblyId = (assemblyId) => {
  if (!previewPipe || !assemblyId) return null
  let target = null
  previewPipe.children.forEach(child => {
    if (child.userData && child.userData.assemblyItemId === assemblyId) {
      target = child
    }
  })
  return target
}


// 多选模式高亮管道（统一高亮，用于所有选择场景）
const highlightPipeGroupForSelection = (pipeGroup) => {
  if (!pipeGroup) return
  pipeGroup.traverse((child) => {
    if (child instanceof THREE.Mesh && child.material) {
      const material = child.material
      
      if (!selectionHighlightMap.has(child)) {
        selectionHighlightMap.set(child, {
          color: material.color ? material.color.clone() : null,
          emissive: material.emissive ? material.emissive.clone() : null
        })
      }
      if (material.color) {
        // 增加亮度，偏向黄色
        material.color.offsetHSL(0.1, 0.2, 0.15)
      }
      if (material.emissive) {
        // 设置金色发光效果
        material.emissive.set(0xffaa00)
      }
    }
  })
}

// 恢复多选高亮
const restorePipeGroupForSelection = (pipeGroup) => {
  if (!pipeGroup) return
  pipeGroup.traverse((child) => {
    if (child instanceof THREE.Mesh && selectionHighlightMap.has(child)) {
      const original = selectionHighlightMap.get(child)
      if (original.color && child.material && child.material.color) {
        child.material.color.copy(original.color)
      }
      if (original.emissive && child.material && child.material.emissive) {
        child.material.emissive.copy(original.emissive)
      }
      selectionHighlightMap.delete(child)
    }
  })
}

// 更新多选高亮状态
const updateSelectionHighlight = (selectedIds) => {
  if (!previewPipe || !isAssemblyMode) return
  
  // 先清除所有现有的多选高亮
  selectionHighlightMap.forEach((original, child) => {
    if (child instanceof THREE.Mesh && child.material) {
      if (original.color && child.material.color) {
        child.material.color.copy(original.color)
      }
      if (original.emissive && child.material.emissive) {
        child.material.emissive.copy(original.emissive)
      }
    }
  })
  selectionHighlightMap.clear()
  
  // 更新选中的装配项ID集合
  selectedAssemblyItemIds.clear()
  if (selectedIds && selectedIds.length > 0) {
    selectedIds.forEach(id => {
      selectedAssemblyItemIds.add(id)
      const pipeGroup = findPipeGroupByAssemblyId(id)
      if (pipeGroup) {
        highlightPipeGroupForSelection(pipeGroup)
    }
  })
  }
}

// 清空阵列选择并同步App
const clearArraySelection = () => {
  // 使用 updateSelectionHighlight 清除所有高亮
  updateSelectionHighlight([])
  
  // 通知App清除选择
  window.dispatchEvent(new CustomEvent('array-selection-changed', {
    detail: { selectedIds: [] }
  }))
}

// 根据端面信息找到对应的端面对象（只返回可见的端面，不包括 hitbox）
const findEndFaceObjects = (endFaceInfo) => {
  if (!endFaceInfo || !endFaceInfo.pipeGroup || !previewPipe) return []
  
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

// 获取端面的世界坐标位置和法向量
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

// 处理端面点击
const handleEndFaceClick = (endFaceObject, clickPoint) => {
  const endFaceInfo = getEndFaceWorldTransform(endFaceObject)
  if (!endFaceInfo) return
  
  // 检查是否点击了已经选择的端面
  const isFirstEndFace = firstSelectedEndFace && 
    firstSelectedEndFace.assemblyItemId === endFaceInfo.assemblyItemId &&
    firstSelectedEndFace.endFaceType === endFaceInfo.endFaceType
  const isSecondEndFace = secondSelectedEndFace && 
    secondSelectedEndFace.assemblyItemId === endFaceInfo.assemblyItemId &&
    secondSelectedEndFace.endFaceType === endFaceInfo.endFaceType
  
  if (isFirstEndFace || isSecondEndFace) {
    // 如果点击了已选择的端面，取消选择（允许重新选择）
    if (isFirstEndFace) {
      const endFaceObjects = findEndFaceObjects(firstSelectedEndFace)
      endFaceObjects.forEach(obj => restoreEndFace(obj))
      const deselectedIndex = 1
      firstSelectedEndFace = null
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
      const endFaceObjects = findEndFaceObjects(secondSelectedEndFace)
      endFaceObjects.forEach(obj => restoreEndFace(obj))
      const deselectedIndex = 2
      secondSelectedEndFace = null
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
  
  if (!firstSelectedEndFace) {
    // 选择第一个端面
    firstSelectedEndFace = endFaceInfo
    
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
  } else if (!secondSelectedEndFace && firstSelectedEndFace.assemblyItemId !== endFaceInfo.assemblyItemId) {
    // 选择第二个端面（不能是同一个管道）
    secondSelectedEndFace = endFaceInfo
    
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
        firstEndFace: firstSelectedEndFace,
        secondEndFace: secondSelectedEndFace
      }
    }))
  }
}

// 拖拽开始时的原始位置
let dragStartPosition = null

// 鼠标按下事件
const onMouseDown = (event) => {
  // 3D草图模式：左键点击放置点
  if (isSketch3DMode.value && event.button === 0) {
    const point = sketch3DRaycastToPlane(event)
    if (!point) return
    if (sketch3DDrawMode.value === 'line') {
      sketch3DAddLineSegment(point)
    } else {
      sketch3DAddArcSegment(point)
    }
    sketch3DUpdatePreviewLines(null)
    return
  }

  // 只在装配体模式下启用拖拽/旋转
  if (!isAssemblyMode || !previewPipe || !camera || !renderer) {
    // 非装配体模式下的原有点击逻辑
    if (!isAssemblyMode && previewPipe) {
      onMouseClick(event)
    }
    return
  }

  // 计算鼠标在 canvas 上的位置
  const rect = renderer.domElement.getBoundingClientRect()
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1

  raycaster.setFromCamera(pointer, camera)

  // 检测是否点击到管道（只检测装配体中的管道）
  const intersects = raycaster.intersectObjects(previewPipe.children, true)

  if (intersects.length > 0) {
    let clickedObject = null
    
    // 拼接模式：优先检测端面点击
    if (isJoinMode) {
      // 遍历所有交点，查找最近的端面
      // 允许一定的误差范围，比如前几个交点中如果有端面，就认为是点击了端面
      for (let i = 0; i < Math.min(intersects.length, 3); i++) {
        const obj = intersects[i].object
        if (obj.userData && obj.userData.isEndFace) {
          clickedObject = obj
          handleEndFaceClick(clickedObject, intersects[i].point)
          event.preventDefault()
          return
        }
      }
      
      // 如果处于拼接模式，且没有点击到端面，直接返回，不触发移动或旋转
      return
    }
    
    // 如果没有点击到端面，或者是普通模式，使用第一个交点
    if (!clickedObject) {
      clickedObject = intersects[0].object
    }
    
    // 阵列模式：点击外表面切换选择（使用菜单中的选中状态）
    if (isArrayMode) {
      if (clickedObject && clickedObject.userData && clickedObject.userData.isOuterSurface) {
        const assemblyItemId = findAssemblyItemId(clickedObject)
        if (assemblyItemId) {
          // 通过事件通知App.vue切换选择状态
          window.dispatchEvent(new CustomEvent('toggle-assembly-item-selection', {
            detail: { id: assemblyItemId }
            }))
        }
      }
      event.preventDefault()
      return
    }

    // 检查是否是外表面
    if (clickedObject.userData && clickedObject.userData.isOuterSurface) {
      // 获取装配体实例ID
      const assemblyItemId = findAssemblyItemId(clickedObject)
      if (assemblyItemId) {
        // 找到对应的管道对象（Group）
        let pipeGroup = null
        previewPipe.children.forEach(child => {
          if (child.userData && child.userData.assemblyItemId === assemblyItemId) {
            pipeGroup = child
          }
        })

        if (pipeGroup) {
          if (isRotationMode) {
          // 旋转模式：选中管道并附着旋转手柄（TransformControls）
          window.dispatchEvent(new CustomEvent('assembly-item-selected', {
            detail: { id: assemblyItemId }
          }))

          attachRotationGizmo(pipeGroup, assemblyItemId)
          event.preventDefault()
          return
          } else if (isMoveMode) {
            // 检查是否有多个选中的项
            const isMultiSelect = selectedAssemblyItemIds.size > 1 && selectedAssemblyItemIds.has(assemblyItemId)
            
            if (isMultiSelect) {
              // 批量移动模式：移动所有选中的项
              draggedAssemblyItemIds = Array.from(selectedAssemblyItemIds)
              draggedObjects = []
              dragStartPositions = []
              
              // 收集所有选中项的信息
              draggedAssemblyItemIds.forEach(id => {
                const group = findPipeGroupByAssemblyId(id)
                if (group) {
                  draggedObjects.push(group)
                  dragStartPositions.push({
                    x: group.position.x,
                    y: group.position.y,
                    z: group.position.z
                  })
                }
              })
              
              // 使用第一个选中的项作为参考点（被点击的项）
              draggedObject = pipeGroup
              draggedAssemblyItemId = assemblyItemId
            } else {
              // 单个移动模式（原有逻辑）
              draggedAssemblyItemIds = [assemblyItemId]
              draggedObjects = [pipeGroup]
              dragStartPositions = [{
                x: pipeGroup.position.x,
                y: pipeGroup.position.y,
                z: pipeGroup.position.z
              }]
              draggedObject = pipeGroup
              draggedAssemblyItemId = assemblyItemId
            }
            
            // 保存拖拽开始时的位置（用于单个移动的兼容性）
            dragStartPosition = {
              x: pipeGroup.position.x,
              y: pipeGroup.position.y,
              z: pipeGroup.position.z
            }
            
            // 开始拖拽
            isDragging = true
            hasMoved = false // 重置移动标记
            
            // 触发显示移动参数面板（使用第一个项的信息）
            window.dispatchEvent(new CustomEvent('show-transform-panel', {
              detail: {
                type: 'move',
                id: assemblyItemId,
                position: {
                  x: pipeGroup.position.x,
                  y: pipeGroup.position.y,
                  z: pipeGroup.position.z
                }
              }
            }))
            
            // 禁用轨道控制器
            controls.enabled = false
            
            // 创建拖拽平面（相机视角平面）
            const cameraDirection = new THREE.Vector3()
            camera.getWorldDirection(cameraDirection)
            dragPlane = new THREE.Plane().setFromNormalAndCoplanarPoint(
              cameraDirection,
              pipeGroup.position
            )
            
            // 计算拖拽起始点
            const intersection = new THREE.Vector3()
            raycaster.ray.intersectPlane(dragPlane, intersection)
            dragStartPoint.copy(intersection)
            dragOffset.copy(pipeGroup.position).sub(intersection)
            
            // 设置鼠标样式
            renderer.domElement.style.cursor = 'grabbing'
            
            event.preventDefault()
          }
        }
      }
    }
  }
}

// 鼠标移动事件
const onMouseMove = (event) => {
  // 3D草图模式：橡皮筋预览
  if (isSketch3DMode.value && sketch3DLastPoint) {
    const point = sketch3DRaycastToPlane(event)
    if (point) sketch3DUpdatePreviewLines(point)
    return
  }

  if (isRotating && rotatedObject) {
    // 旋转模式
    const deltaY = event.clientY - rotationStartMouseY
    
    // 鼠标向下移动为正旋转，向上为负旋转
    // 旋转速度：每100像素 = 90度（Math.PI/2 弧度）
    const rotationSpeed = Math.PI / 200 // 每像素的弧度
    const deltaAngle = -deltaY * rotationSpeed
    
    // 计算新的角度
    const newAngle = rotationStartAngle + deltaAngle
    
    // 检查是否真的旋转了（角度变化超过阈值）
    const currentAngle = rotatedObject.rotation[rotationAxis] || 0
    const angleDelta = Math.abs(newAngle - currentAngle)
    if (angleDelta > 0.001) { // 如果角度变化超过0.001弧度（约0.057度），标记为已旋转
      hasRotated = true
    }
    
    // 更新管道旋转（根据选择的轴）
    if (rotationAxis === 'x') {
      rotatedObject.rotation.x = newAngle
    } else if (rotationAxis === 'y') {
      rotatedObject.rotation.y = newAngle
    } else if (rotationAxis === 'z') {
      rotatedObject.rotation.z = newAngle
    }
    
    // 强制更新对象矩阵，确保实时渲染
    rotatedObject.updateMatrix()
    rotatedObject.updateMatrixWorld(true)
    
    // 同步更新数据（通过事件通知 App.vue）
    window.dispatchEvent(new CustomEvent('assembly-item-rotation-updated', {
      detail: {
        id: rotatedAssemblyItemId,
        rotation: {
          x: rotatedObject.rotation.x,
          y: rotatedObject.rotation.y,
          z: rotatedObject.rotation.z
        },
        isUserInput: false // 这是拖动操作，不是输入框输入
      }
    }))
    return
  }
  
  if (!isDragging || !draggedObject || !camera || !renderer || !dragPlane) {
    return
  }

  // 移动模式（原有逻辑）
  // 计算鼠标在 canvas 上的位置
  const rect = renderer.domElement.getBoundingClientRect()
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1

  raycaster.setFromCamera(pointer, camera)

  // 计算新的交点
  const newIntersection = new THREE.Vector3()
  if (raycaster.ray.intersectPlane(dragPlane, newIntersection)) {
    // 计算位置偏移
    const delta = newIntersection.clone().sub(dragStartPoint)
    
    // 根据移动平面约束限制移动方向
    if (movePlane === 'xy') {
      // XY平面：只允许在XY平面移动（z坐标不变）
      delta.z = 0
    } else if (movePlane === 'yz') {
      // YZ平面：只允许在YZ平面移动（x坐标不变）
      delta.x = 0
    } else if (movePlane === 'zx') {
      // ZX平面：只允许在ZX平面移动（y坐标不变）
      delta.y = 0
    }
    // 'free' 模式不约束，保持原有逻辑
    
    // 检查是否真的移动了（超过阈值）
    if (delta.length() > 0.01) {
      hasMoved = true
    }
    
    // 计算新的位置（基于被点击的项）
    const newPosition = dragStartPoint.clone().add(delta).add(dragOffset)
    
    // 批量移动：同时移动所有选中的项
    if (draggedObjects.length > 1 && dragStartPositions.length > 0) {
      // 找到被点击项在数组中的索引
      const clickedIndex = draggedAssemblyItemIds.indexOf(draggedAssemblyItemId)
      if (clickedIndex >= 0 && dragStartPositions[clickedIndex]) {
        // 计算被点击项的位置偏移量
        const clickedStartPos = dragStartPositions[clickedIndex]
        const positionDelta = new THREE.Vector3(
          newPosition.x - clickedStartPos.x,
          newPosition.y - clickedStartPos.y,
          newPosition.z - clickedStartPos.z
        )
        
        // 更新所有选中项的位置（保持相对位置不变）
        draggedObjects.forEach((obj, index) => {
          if (obj && dragStartPositions[index]) {
            const newObjPosition = new THREE.Vector3(
              dragStartPositions[index].x + positionDelta.x,
              dragStartPositions[index].y + positionDelta.y,
              dragStartPositions[index].z + positionDelta.z
            )
            obj.position.copy(newObjPosition)
            
            // 为每个项发送位置更新事件
            window.dispatchEvent(new CustomEvent('assembly-item-position-updated', {
              detail: {
                id: draggedAssemblyItemIds[index],
                position: {
                  x: newObjPosition.x,
                  y: newObjPosition.y,
                  z: newObjPosition.z
                }
              }
            }))
          }
        })
      }
    } else {
      // 单个移动模式（原有逻辑）
    draggedObject.position.copy(newPosition)
    
    // 同步更新数据（通过事件通知 App.vue）
    window.dispatchEvent(new CustomEvent('assembly-item-position-updated', {
      detail: {
        id: draggedAssemblyItemId,
        position: {
          x: newPosition.x,
          y: newPosition.y,
          z: newPosition.z
        }
      }
    }))
    }
  }
}

// 鼠标释放事件
const onMouseUp = (event) => {
  if (isRotating) {
    // 结束旋转
    const wasRotating = hasRotated
    isRotating = false
    hasRotated = false
    
    // 重新启用轨道控制器
    controls.enabled = true
    
    // 恢复鼠标样式
    renderer.domElement.style.cursor = 'default'
    
    // 只有真正进行了旋转才保存记录
    if (wasRotating && rotatedObject && rotatedAssemblyItemId) {
      // 立即保存操作记录
      if (rotationSaveHistoryTimer) {
        clearTimeout(rotationSaveHistoryTimer)
        rotationSaveHistoryTimer = null
      }
      
      const finalRotation = {
        x: rotatedObject.rotation.x,
        y: rotatedObject.rotation.y,
        z: rotatedObject.rotation.z
      }
      
      const startRotation = {
        x: rotatedObject.rotation.x,
        y: rotatedObject.rotation.y,
        z: rotatedObject.rotation.z
      }
      // 从当前旋转减去增量，得到起始旋转
      startRotation[rotationAxis] = rotationStartAngle
      
      // 检查旋转是否真的改变了（避免记录无效的旋转）
      const angleChanged = Math.abs(finalRotation[rotationAxis] - startRotation[rotationAxis]) > 0.001
      
      if (angleChanged) {
        // 立即触发保存操作记录
        window.dispatchEvent(new CustomEvent('assembly-item-rotation-ended', {
          detail: {
            id: rotatedAssemblyItemId,
            startRotation: startRotation,
            endRotation: finalRotation,
            axis: rotationAxis
          }
        }))
      }
    }
    
    rotatedObject = null
    rotatedAssemblyItemId = null
    return
  }
  
  if (isDragging) {
    // 结束拖拽
    const wasMoved = hasMoved
    isDragging = false
    hasMoved = false
    
    // 重新启用轨道控制器
    controls.enabled = true
    
    // 恢复鼠标样式
    renderer.domElement.style.cursor = 'default'
    
    // 只有真正进行了移动才保存记录
    if (wasMoved) {
      // 立即保存操作记录
      if (saveHistoryTimer) {
        clearTimeout(saveHistoryTimer)
        saveHistoryTimer = null
      }
      
      // 批量移动：发送一条批量移动事件
      if (draggedObjects.length > 1 && dragStartPositions.length > 0) {
        const batchMoveItems = []
        draggedObjects.forEach((obj, index) => {
          if (obj && dragStartPositions[index] && draggedAssemblyItemIds[index]) {
            batchMoveItems.push({
              id: draggedAssemblyItemIds[index],
              startPosition: { ...dragStartPositions[index] },
              endPosition: {
                x: obj.position.x,
                y: obj.position.y,
                z: obj.position.z
              }
            })
          }
        })
        
        // 发送批量移动事件（一条记录）
        if (batchMoveItems.length > 0) {
          window.dispatchEvent(new CustomEvent('assembly-items-batch-drag-ended', {
            detail: {
              items: batchMoveItems
            }
          }))
        }
      } else if (dragStartPosition) {
        // 单个移动模式（原有逻辑）
      const finalPosition = {
        x: draggedObject.position.x,
        y: draggedObject.position.y,
        z: draggedObject.position.z
      }
      
      // 立即触发保存操作记录
      window.dispatchEvent(new CustomEvent('assembly-item-drag-ended', {
        detail: {
          id: draggedAssemblyItemId,
          startPosition: dragStartPosition,
          endPosition: finalPosition
        }
      }))
      }
    }
    
    dragStartPosition = null
    dragStartPositions = []
    draggedObject = null
    draggedObjects = []
    draggedAssemblyItemId = null
    draggedAssemblyItemIds = []
    dragPlane = null
  }
}

// 原有的点击事件（用于非装配体模式）
const onMouseClick = (event) => {
  if (!previewPipe || !camera || !renderer || isAssemblyMode) return

  // 计算鼠标在 canvas 上的位置
  const rect = renderer.domElement.getBoundingClientRect()
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1

  raycaster.setFromCamera(pointer, camera)

  // 检测是否点击到管道（包括其子对象）
  const intersects = raycaster.intersectObjects(previewPipe.children, true)

  if (intersects.length > 0) {
    // 点击到了管道
    console.log('点击到了管道')
    window.dispatchEvent(new CustomEvent('pipe-clicked'))
  }
}

// 更新直管预览
const updatePipePreview = (params) => {
  createPipePreview(params)
}

// 清除预览
const clearPipePreview = () => {
  if (previewPipe && scene) {
    scene.remove(previewPipe)
    detachRotationGizmo()
    clearArraySelection()
    // 清理资源
    if (previewPipe.children) {
      previewPipe.children.forEach(child => {
        if (child.geometry) child.geometry.dispose()
        if (child.material) child.material.dispose()
      })
    }
    previewPipe = null
    isAssemblyMode = false
  }
}

// 监听参数更新事件
const handlePipeParamsUpdate = (event) => {
  const params = event.detail
  // 如果类型不是sketch2d，且2D画板是打开的，应该关闭它
  if (params.type && params.type !== 'sketch2d' && isSplitView.value) {
    isSplitView.value = false
    sketchPathData.value = null
    sketch2DPipeParams.value = null
    initialSketchPathData.value = null
    setTimeout(() => {
      handleResize()
    }, 100)
  }
  // 退出3D草图模式
  if (isSketch3DMode.value) exitSketch3DMode()
  updatePipePreview(params)
}

// 监听查看零件事件
const handleViewPart = (event) => {
  const params = event.detail
  // 复用预览逻辑来显示零件
  createPipePreview(params)
}

// 监听清除预览事件
const handleClearPreview = () => {
  clearPipePreview()
  // 修复: 正确重置分屏状态
  isSplitView.value = false
  sketchPathData.value = null
  sketch2DPipeParams.value = null
  // 修复: 清除初始路径数据
  initialSketchPathData.value = null
  
  // 修复: 触发窗口resize以恢复全屏
  setTimeout(() => {
    handleResize()
  }, 100)
}

// 处理2D路径更新（从Sketch2DCanvas组件）
const handlePathUpdated = (pathData) => {
  sketchPathData.value = pathData
  // 修复: 立即更新3D预览，即使参数未变化
  if (sketch2DPipeParams.value) {
    updateSketch2DPreview()
  }
}

// 处理2D路径更新事件（从window事件）
const handleSketch2DPathUpdated = (event) => {
  const pathData = event.detail
  sketchPathData.value = pathData
  // 修复: 增强路径数据同步，立即更新3D预览
  if (sketch2DPipeParams.value) {
    updateSketch2DPreview()
  }
  
  // 修复: 同步pathData到pipeParams，确保保存时能获取到最新数据
  // 通过事件通知App.vue更新pipeParams
  window.dispatchEvent(new CustomEvent('sketch2d-pathdata-sync', {
    detail: pathData
  }))
}

// 更新2D草图预览
const updateSketch2DPreview = () => {
  if (!scene || !sketchPathData.value || !sketch2DPipeParams.value) return
  
  // 移除旧的预览
  clearPipePreview()
  
  // 设置为非装配体模式
  isAssemblyMode = false
  
  // 创建2D草图管道
  const params = {
    ...sketch2DPipeParams.value,
    pathData: sketchPathData.value,
    type: 'sketch2d'
  }
  
  const result = createSketch2DPipe(params)
  if (!result) return
  
  // 为管道启用阴影
  enableShadowsForObject(result.pipeGroup)
  
  previewPipe = result.pipeGroup
  scene.add(previewPipe)
  
  // 自动调整相机
  if (camera && controls) {
    const size = result.groupSize || 100
    const cameraDistance = size * 1.5  // 减小倍数，让视角更近
    camera.position.set(cameraDistance, cameraDistance * 0.7, cameraDistance)
    controls.target.set(0, 0, 0)
    controls.update()
  }
}

// 监听2D草图建管参数更新
const handleSketch2DParamsUpdate = (event) => {
  const params = event.detail
  // 只有当类型是sketch2d时才显示2D画板（如果没有type字段，也默认展开，因为只有sketch2d类型才会触发这个事件）
  if (!params.type || params.type === 'sketch2d') {
    sketch2DPipeParams.value = params
    isSplitView.value = true
    
    // 如果有路径数据，设置为初始路径数据（用于编辑时加载）
    if (params.pathData && params.pathData.segments && params.pathData.segments.length > 0) {
      initialSketchPathData.value = { segments: params.pathData.segments.map(s => ({ ...s })) }
      sketchPathData.value = { segments: params.pathData.segments.map(s => ({ ...s })) }
    } else {
      // 如果没有传入pathData，但已有路径数据，保持现有路径数据
      if (!sketchPathData.value || !sketchPathData.value.segments || sketchPathData.value.segments.length === 0) {
        initialSketchPathData.value = null
        sketchPathData.value = null
      }
    }
    
    // 触发窗口resize以更新渲染器尺寸
    setTimeout(() => {
      handleResize()
      // 修复: 如果已有路径数据，立即更新预览（即使参数变化）
      if (sketchPathData.value && sketchPathData.value.segments && sketchPathData.value.segments.length > 0) {
        updateSketch2DPreview()
      }
    }, 100)
  } else {
    // 如果类型不是sketch2d，关闭2D画板
    if (isSplitView.value) {
      isSplitView.value = false
      sketchPathData.value = null
      sketch2DPipeParams.value = null
      initialSketchPathData.value = null
      setTimeout(() => {
        handleResize()
      }, 100)
    }
  }
}

// ========== 3D草图建管 ==========

const sketch3DGetWorkingPlane = () => {
  const p = sketch3DWorkingPlane.value
  if (p === 'XY') return new THREE.Plane(new THREE.Vector3(0, 0, 1), 0)
  if (p === 'YZ') return new THREE.Plane(new THREE.Vector3(1, 0, 0), 0)
  return new THREE.Plane(new THREE.Vector3(0, 1, 0), 0) // XZ
}

const sketch3DSnap = (point) => {
  const s = sketch3DSnapSize
  return new THREE.Vector3(
    Math.round(point.x / s) * s,
    Math.round(point.y / s) * s,
    Math.round(point.z / s) * s
  )
}

const sketch3DRaycastToPlane = (event) => {
  if (!renderer || !camera) return null
  const rect = renderer.domElement.getBoundingClientRect()
  const pointer = new THREE.Vector2(
    ((event.clientX - rect.left) / rect.width) * 2 - 1,
    -((event.clientY - rect.top) / rect.height) * 2 + 1
  )
  const raycaster = new THREE.Raycaster()
  raycaster.setFromCamera(pointer, camera)
  const intersection = new THREE.Vector3()
  if (raycaster.ray.intersectPlane(sketch3DGetWorkingPlane(), intersection)) {
    return sketch3DSnap(intersection)
  }
  return null
}

const sketch3DUpdateGrid = () => {
  if (sketch3DGridHelper) {
    scene.remove(sketch3DGridHelper)
    sketch3DGridHelper.geometry?.dispose()
    sketch3DGridHelper.material?.dispose()
  }
  const size = 200
  const divisions = size / sketch3DSnapSize
  sketch3DGridHelper = new THREE.GridHelper(size, divisions, 0x2266aa, 0x1a4477)
  sketch3DGridHelper.material.opacity = 0.3
  sketch3DGridHelper.material.transparent = true
  const p = sketch3DWorkingPlane.value
  if (p === 'XY') sketch3DGridHelper.rotation.x = Math.PI / 2
  else if (p === 'YZ') sketch3DGridHelper.rotation.z = Math.PI / 2
  scene.add(sketch3DGridHelper)
}

const sketch3DUpdatePreviewLines = (mousePoint) => {
  if (!sketch3DPreviewGroup) {
    sketch3DPreviewGroup = new THREE.Group()
    sketch3DPreviewGroup.name = 'sketch3DPreview'
    scene.add(sketch3DPreviewGroup)
  }
  // 清除旧预览
  while (sketch3DPreviewGroup.children.length) {
    const c = sketch3DPreviewGroup.children[0]
    sketch3DPreviewGroup.remove(c)
    c.geometry?.dispose()
    c.material?.dispose()
  }

  const lineMat = new THREE.LineBasicMaterial({ color: 0x00ff00 })
  const dashMat = new THREE.LineDashedMaterial({ color: 0xffff00, dashSize: 2, gapSize: 1 })
  const pointMat = new THREE.MeshBasicMaterial({ color: 0x00ff00 })

  // 绘制已确认的线段
  sketch3DSegments.forEach(seg => {
    if (seg.type === 'line') {
      const geo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(seg.start.x, seg.start.y, seg.start.z),
        new THREE.Vector3(seg.end.x, seg.end.y, seg.end.z)
      ])
      sketch3DPreviewGroup.add(new THREE.Line(geo, lineMat))
    } else if (seg.type === 'arc') {
      const pts = []
      const steps = 32
      for (let i = 0; i <= steps; i++) {
        const angle = seg.startAngle + (seg.endAngle - seg.startAngle) * (i / steps)
        const c = seg.center, r = seg.radius
        const cos = Math.cos(angle), sin = Math.sin(angle)
        if (seg.plane === 'XY') pts.push(new THREE.Vector3(c.x + r * cos, c.y + r * sin, c.z))
        else if (seg.plane === 'YZ') pts.push(new THREE.Vector3(c.x, c.y + r * cos, c.z + r * sin))
        else pts.push(new THREE.Vector3(c.x + r * cos, c.y, c.z + r * sin))
      }
      sketch3DPreviewGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), lineMat))
    }
  })

  // 绘制节点球
  const allPoints = []
  if (sketch3DSegments.length > 0) {
    const first = sketch3DSegments[0]
    allPoints.push(first.type === 'line' ? first.start : first.start || { x: 0, y: 0, z: 0 })
  }
  sketch3DSegments.forEach(seg => {
    if (seg.type === 'line') allPoints.push(seg.end)
    else if (seg.type === 'arc') {
      // 圆弧终点
      const angle = seg.endAngle, c = seg.center, r = seg.radius
      const cos = Math.cos(angle), sin = Math.sin(angle)
      if (seg.plane === 'XY') allPoints.push({ x: c.x + r * cos, y: c.y + r * sin, z: c.z })
      else if (seg.plane === 'YZ') allPoints.push({ x: c.x, y: c.y + r * cos, z: c.z + r * sin })
      else allPoints.push({ x: c.x + r * cos, y: c.y, z: c.z + r * sin })
    }
  })
  allPoints.forEach(p => {
    const sphere = new THREE.Mesh(new THREE.SphereGeometry(0.8, 8, 8), pointMat)
    sphere.position.set(p.x, p.y, p.z)
    sketch3DPreviewGroup.add(sphere)
  })

  // 橡皮筋线（从最后一个点到鼠标位置）
  if (mousePoint && sketch3DLastPoint) {
    const geo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(sketch3DLastPoint.x, sketch3DLastPoint.y, sketch3DLastPoint.z),
      mousePoint
    ])
    const line = new THREE.Line(geo, dashMat)
    line.computeLineDistances()
    sketch3DPreviewGroup.add(line)
  }
}

const sketch3DUpdatePipePreview = () => {
  if (sketch3DSegments.length === 0 || !sketch3DPipeParams) return
  clearPipePreview()
  isAssemblyMode = false
  const params = {
    ...sketch3DPipeParams,
    pathData3d: { segments: sketch3DSegments },
    type: 'sketch3d'
  }
  const result = createSketch3DPipe(params)
  if (!result) return
  enableShadowsForObject(result.pipeGroup)
  previewPipe = result.pipeGroup
  scene.add(previewPipe)
}

const sketch3DAddLineSegment = (point) => {
  if (!sketch3DLastPoint) {
    sketch3DLastPoint = { x: point.x, y: point.y, z: point.z }
    return
  }
  const seg = {
    type: 'line',
    start: { ...sketch3DLastPoint },
    end: { x: point.x, y: point.y, z: point.z }
  }
  sketch3DSegments.push(seg)
  sketch3DLastPoint = { ...seg.end }
  sketch3DUpdatePipePreview()
  sketch3DSyncPathData()
}

const sketch3DAddArcSegment = (point) => {
  if (sketch3DArcState === 'start') {
    if (!sketch3DLastPoint) {
      sketch3DLastPoint = { x: point.x, y: point.y, z: point.z }
      return
    }
    sketch3DArcStartPoint = { ...sketch3DLastPoint }
    sketch3DArcEndPoint = { x: point.x, y: point.y, z: point.z }
    sketch3DArcState = 'center'
  } else if (sketch3DArcState === 'center') {
    // point 是圆弧经过的中间点，用三点定弧
    const p1 = sketch3DArcStartPoint
    const p2 = { x: point.x, y: point.y, z: point.z }
    const p3 = sketch3DArcEndPoint
    const plane = sketch3DWorkingPlane.value

    // 在工作平面上提取2D坐标
    const to2D = (pt) => {
      if (plane === 'XY') return { u: pt.x, v: pt.y }
      if (plane === 'YZ') return { u: pt.y, v: pt.z }
      return { u: pt.x, v: pt.z } // XZ
    }
    const a = to2D(p1), b = to2D(p2), c = to2D(p3)

    // 三点求圆心
    const D = 2 * (a.u * (b.v - c.v) + b.u * (c.v - a.v) + c.u * (a.v - b.v))
    if (Math.abs(D) < 1e-10) {
      // 三点共线，退化为直线
      sketch3DSegments.push({ type: 'line', start: { ...p1 }, end: { ...p3 } })
      sketch3DLastPoint = { ...p3 }
    } else {
      const ux = ((a.u * a.u + a.v * a.v) * (b.v - c.v) + (b.u * b.u + b.v * b.v) * (c.v - a.v) + (c.u * c.u + c.v * c.v) * (a.v - b.v)) / D
      const uy = ((a.u * a.u + a.v * a.v) * (c.u - b.u) + (b.u * b.u + b.v * b.v) * (a.u - c.u) + (c.u * c.u + c.v * c.v) * (b.u - a.u)) / D
      const radius = Math.sqrt((a.u - ux) * (a.u - ux) + (a.v - uy) * (a.v - uy))

      // 转回3D圆心
      let center
      if (plane === 'XY') center = { x: ux, y: uy, z: p1.z }
      else if (plane === 'YZ') center = { x: p1.x, y: ux, z: uy }
      else center = { x: ux, y: p1.y, z: uy }

      const startAngle = Math.atan2(a.v - uy, a.u - ux)
      const midAngle = Math.atan2(b.v - uy, b.u - ux)
      let endAngle = Math.atan2(c.v - uy, c.u - ux)

      // 确定方向：中间点应在起点到终点的弧上
      const normalizeAngle = (a) => ((a % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)
      const sa = normalizeAngle(startAngle)
      const ma = normalizeAngle(midAngle)
      let ea = normalizeAngle(endAngle)

      // 检查逆时针方向是否经过中间点
      const ccwContains = (s, m, e) => {
        if (s <= e) return s <= m && m <= e
        return m >= s || m <= e
      }
      if (!ccwContains(sa, ma, ea)) {
        // 需要走另一个方向
        endAngle = startAngle + (normalizeAngle(endAngle - startAngle) - 2 * Math.PI)
      } else {
        endAngle = startAngle + normalizeAngle(endAngle - startAngle)
      }

      sketch3DSegments.push({
        type: 'arc', center, radius, startAngle, endAngle, plane, clockwise: endAngle < startAngle
      })
      sketch3DLastPoint = { ...p3 }
    }

    sketch3DArcState = 'start'
    sketch3DArcStartPoint = null
    sketch3DArcEndPoint = null
    sketch3DUpdatePipePreview()
    sketch3DSyncPathData()
  }
}

const sketch3DSyncPathData = () => {
  window.dispatchEvent(new CustomEvent('sketch3d-pathdata-sync', {
    detail: { segments: sketch3DSegments.map(s => ({ ...s })) }
  }))
}

const sketch3DUndo = () => {
  if (sketch3DSegments.length > 0) {
    sketch3DSegments.pop()
    if (sketch3DSegments.length > 0) {
      const last = sketch3DSegments[sketch3DSegments.length - 1]
      if (last.type === 'line') sketch3DLastPoint = { ...last.end }
      else {
        const a = last.endAngle, c = last.center, r = last.radius
        const cos = Math.cos(a), sin = Math.sin(a)
        if (last.plane === 'XY') sketch3DLastPoint = { x: c.x + r * cos, y: c.y + r * sin, z: c.z }
        else if (last.plane === 'YZ') sketch3DLastPoint = { x: c.x, y: c.y + r * cos, z: c.z + r * sin }
        else sketch3DLastPoint = { x: c.x + r * cos, y: c.y, z: c.z + r * sin }
      }
    } else {
      sketch3DLastPoint = null
    }
    sketch3DUpdatePipePreview()
    sketch3DUpdatePreviewLines(null)
    sketch3DSyncPathData()
  }
}

const sketch3DConfirm = () => {
  if (sketch3DSegments.length > 0) {
    sketch3DSyncPathData()
  }
  exitSketch3DMode()
}

const sketch3DClear = () => {
  sketch3DSegments = []
  sketch3DLastPoint = null
  sketch3DArcState = 'start'
  sketch3DArcStartPoint = null
  sketch3DArcEndPoint = null
  clearPipePreview()
  sketch3DUpdatePreviewLines(null)
  sketch3DSyncPathData()
}

const enterSketch3DMode = (params) => {
  isSketch3DMode.value = true
  sketch3DPipeParams = { innerDiameter: params.innerDiameter, outerDiameter: params.outerDiameter, segments: params.segments }
  sketch3DSegments = []
  sketch3DLastPoint = null
  sketch3DArcState = 'start'

  // 如果有已有路径数据（编辑模式）
  if (params.pathData3d && params.pathData3d.segments && params.pathData3d.segments.length > 0) {
    sketch3DSegments = params.pathData3d.segments.map(s => ({ ...s }))
    const last = sketch3DSegments[sketch3DSegments.length - 1]
    if (last.type === 'line') sketch3DLastPoint = { ...last.end }
    else {
      const a = last.endAngle, c = last.center, r = last.radius
      const cos = Math.cos(a), sin = Math.sin(a)
      if (last.plane === 'XY') sketch3DLastPoint = { x: c.x + r * cos, y: c.y + r * sin, z: c.z }
      else if (last.plane === 'YZ') sketch3DLastPoint = { x: c.x, y: c.y + r * cos, z: c.z + r * sin }
      else sketch3DLastPoint = { x: c.x + r * cos, y: c.y, z: c.z + r * sin }
    }
    sketch3DUpdatePipePreview()
  }

  // 禁用左键旋转
  if (controls) controls.mouseButtons.LEFT = null
  sketch3DUpdateGrid()
  sketch3DUpdatePreviewLines(null)
}

const exitSketch3DMode = () => {
  isSketch3DMode.value = false
  sketch3DPipeParams = null
  sketch3DSegments = []
  sketch3DLastPoint = null
  sketch3DArcState = 'start'
  sketch3DArcStartPoint = null
  sketch3DArcEndPoint = null

  if (controls) controls.mouseButtons.LEFT = THREE.MOUSE.ROTATE
  if (sketch3DGridHelper) {
    scene.remove(sketch3DGridHelper)
    sketch3DGridHelper = null
  }
  if (sketch3DPreviewGroup) {
    sketch3DPreviewGroup.traverse(c => { c.geometry?.dispose(); c.material?.dispose() })
    scene.remove(sketch3DPreviewGroup)
    sketch3DPreviewGroup = null
  }
}

const handleSketch3DParamsUpdate = (event) => {
  const params = event.detail
  if (params.type === 'sketch3d') {
    // 关闭2D分屏
    if (isSplitView.value) {
      isSplitView.value = false
      sketchPathData.value = null
      sketch2DPipeParams.value = null
      initialSketchPathData.value = null
    }
    enterSketch3DMode(params)
  } else {
    if (isSketch3DMode.value) exitSketch3DMode()
  }
}

const handleSketch3DKeyDown = (event) => {
  if (!isSketch3DMode.value) return
  if (event.key === 'Tab') {
    event.preventDefault()
    const planes = ['XZ', 'XY', 'YZ']
    const idx = planes.indexOf(sketch3DWorkingPlane.value)
    sketch3DWorkingPlane.value = planes[(idx + 1) % 3]
    sketch3DUpdateGrid()
  } else if (event.key === 'z' && (event.ctrlKey || event.metaKey)) {
    event.preventDefault()
    sketch3DUndo()
  } else if (event.key === 'Enter') {
    event.preventDefault()
    sketch3DConfirm()
  } else if (event.key === 'Escape') {
    event.preventDefault()
    clearPipePreview()
    exitSketch3DMode()
    window.dispatchEvent(new CustomEvent('clear-pipe-preview'))
  }
}

// === 渐进细分 LOD ===
let _refineRAF = null
let _fpsFrames = 0, _fpsLastTime = performance.now(), _fpsValue = 60
let _lodAutoMode = true

const getNextLodSegments = (current, target) => {
  return Math.min(current + 1, target)
}

const getPrevLodSegments = (current) => {
  return Math.max(current - 1, 3)
}

const refinePipeObject = (pipeGroup) => {
  const ud = pipeGroup.userData
  if (!ud._originalParams || ud._lodSegments >= ud._targetSegments) return false
  const nextSeg = getNextLodSegments(ud._lodSegments, ud._targetSegments)
  const params = { ...ud._originalParams, segments: nextSeg }
  const newGroup = createPipeObject(params, ud.assemblyItemId)
  if (!newGroup) return false
  const pos = pipeGroup.position.clone()
  const rot = pipeGroup.rotation.clone()
  while (pipeGroup.children.length) {
    pipeGroup.remove(pipeGroup.children[0])
  }
  // 移入新子对象
  while (newGroup.children.length) {
    pipeGroup.add(newGroup.children[0])
  }
  pipeGroup.position.copy(pos)
  pipeGroup.rotation.copy(rot)
  ud._lodSegments = nextSeg
  return true
}

const degradeLod = () => {
  if (!previewPipe) return
  // 找当前细分最高的管道降级
  let target = null, maxSeg = 3
  for (const child of previewPipe.children) {
    const ud = child.userData
    if (ud._originalParams && ud._lodSegments > 3 && ud._lodSegments > maxSeg) {
      maxSeg = ud._lodSegments
      target = child
    }
  }
  if (!target) return
  const ud = target.userData
  const prevSeg = getPrevLodSegments(ud._lodSegments)
  const params = { ...ud._originalParams, segments: prevSeg }
  const newGroup = createPipeObject(params, ud.assemblyItemId)
  if (!newGroup) return
  const pos = target.position.clone()
  const rot = target.rotation.clone()
  while (target.children.length) {
    target.remove(target.children[0])
  }
  while (newGroup.children.length) {
    target.add(newGroup.children[0])
  }
  target.position.copy(pos)
  target.rotation.copy(rot)
  ud._lodSegments = prevSeg
}

const _frustum = new THREE.Frustum()
const _projScreenMatrix = new THREE.Matrix4()

const scheduleProgressiveRefine = () => {
  if (_refineRAF) cancelAnimationFrame(_refineRAF)
  if (!_lodAutoMode) return
  const step = () => {
    if (!previewPipe || !camera || !_lodAutoMode) return
    _projScreenMatrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse)
    _frustum.setFromProjectionMatrix(_projScreenMatrix)
    // 收集需要升级的管道，可见的优先
    let target = null
    let fallback = null
    for (const child of previewPipe.children) {
      const ud = child.userData
      if (!ud._originalParams || ud._lodSegments >= ud._targetSegments) continue
      if (child.geometry?.boundingSphere !== undefined && _frustum.intersectsObject(child)) { target = child; break }
      if (!fallback) fallback = child
    }
    const toRefine = target || fallback
    if (toRefine) {
      refinePipeObject(toRefine)
      _refineRAF = requestAnimationFrame(step)
    } else {
      _refineRAF = null
    }
  }
  _refineRAF = requestAnimationFrame(step)
}

// 浏览总装配体
const updateAssemblyView = (items, preserveCamera = false) => {
  if (!scene) return
  
  // 阵列模式下刷新装配体时清除已选
  if (isArrayMode) {
    // 清除选择（通过事件通知App.vue）
    clearArraySelection()
  }
  
  // 过滤掉文件夹类型的项，只处理实际的管道项
  const pipeItems = items.filter(item => item.type !== 'array-group')
  
  // 如果 preserveCamera 为 true，只更新现有对象的位置和旋转，不重新创建
  if (preserveCamera && previewPipe && isAssemblyMode) {
    // 确保 previewPipe 在场景中
    if (!scene.children.includes(previewPipe)) {
      scene.add(previewPipe)
    }
    
    // 更新现有对象的位置和旋转，并创建新对象
    pipeItems.forEach(item => {
      // 查找对应的管道对象
      let pipeObj = null
      previewPipe.children.forEach(child => {
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
        // 确保type参数被正确传入params
        const paramsWithType = { ...item.params, type: item.type }

        // 对于2D草图建管，确保pathData被正确传递
        if (item.type === 'sketch2d' && item.params && item.params.pathData) {
          paramsWithType.pathData = item.params.pathData
        }
        if (item.type === 'sketch3d' && item.params && item.params.pathData3d) {
          paramsWithType.pathData3d = item.params.pathData3d
        }

        // LOD: 低精度优先
        const targetSeg = Math.min(paramsWithType.segments || 8, 8)
        const lodParams = { ...paramsWithType, segments: 3 }
        const newPipeObj = createPipeObject(lodParams, item.id)
        if (newPipeObj) {
          newPipeObj.userData._lodSegments = 3
          newPipeObj.userData._targetSegments = targetSeg
          newPipeObj.userData._originalParams = paramsWithType
          // 为管道启用阴影
          enableShadowsForObject(newPipeObj)
          if (item.position) {
            newPipeObj.position.set(item.position.x, item.position.y, item.position.z)
          }
          if (item.rotation) {
            newPipeObj.rotation.set(item.rotation.x, item.rotation.y, item.rotation.z)
          }
          // 更新矩阵以确保正确显示
          newPipeObj.updateMatrix()
          newPipeObj.updateMatrixWorld(true)
          previewPipe.add(newPipeObj)
        } else {
          // 调试信息：如果创建失败，输出错误
          console.warn('创建管道对象失败:', { type: item.type, params: paramsWithType })
        }
      }
    })
    
    // 移除不再存在的对象
    previewPipe.children.forEach((child, index) => {
      const childId = child.userData && child.userData.assemblyItemId
      if (childId && !pipeItems.some(item => item.id === childId)) {
        // 清理资源
        if (child.geometry) child.geometry.dispose()
        if (child.material) child.material.dispose()
        previewPipe.remove(child)
      }
    })
    
    // 更新 previewPipe 的矩阵
    previewPipe.updateMatrix()
    previewPipe.updateMatrixWorld(true)

    scheduleProgressiveRefine()
    return
  }
  
  // 清除单个预览
  clearPipePreview()
  
  // 设置为装配体模式
  isAssemblyMode = true
  
  // 清除旧的装配体组（如果存在，这里可以复用 previewPipe 或者新建一个 group）
  // 为了简单，我们暂时复用 previewPipe 作为容器，或者我们可以创建一个新的 assemblyGroup
  // 考虑到 onMouseClick 检测的是 previewPipe.children，我们继续使用 previewPipe 变量来持有当前显示的对象
  
  const assemblyGroup = new THREE.Group()
  
  pipeItems.forEach(item => {
    // 复用 createPipeObject 创建每个零件，传入装配体实例ID
    // 确保type参数被正确传入params
    const paramsWithType = { ...item.params, type: item.type }

    // 对于2D草图建管，确保pathData被正确传递
    if (item.type === 'sketch2d' && item.params && item.params.pathData) {
      paramsWithType.pathData = item.params.pathData
    }
    if (item.type === 'sketch3d' && item.params && item.params.pathData3d) {
      paramsWithType.pathData3d = item.params.pathData3d
    }

    // LOD: 低精度优先
    const targetSeg = paramsWithType.segments || 12
    const lodParams = { ...paramsWithType, segments: 3 }
    const pipeObj = createPipeObject(lodParams, item.id)
    if (pipeObj) {
      pipeObj.userData._lodSegments = 3
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
      
      // 添加到装配体组
      assemblyGroup.add(pipeObj)
    } else {
      // 调试信息：如果创建失败，输出错误
      console.warn('创建管道对象失败:', { type: item.type, params: paramsWithType })
    }
  })
  
  previewPipe = assemblyGroup
  scene.add(previewPipe)
  
  // 只有在不保持相机时才自动调整相机
  if (!preserveCamera && camera && controls) {
    // 计算装配体的实际包围盒大小
    const box = new THREE.Box3()
    box.setFromObject(assemblyGroup)
    const size = box.getSize(new THREE.Vector3())
    const maxSize = Math.max(size.x, size.y, size.z)
    
    // 根据实际大小计算相机距离，使用更小的倍数（1.5）让视角更近
    const distance = maxSize > 0 ? maxSize * 1.5 : 150
    camera.position.set(distance, distance * 0.7, distance)
    controls.target.set(0, 0, 0)
    controls.update()
  }

  scheduleProgressiveRefine()
}

// 监听查看装配体事件
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
  // 装配体视图更新后，需要重新同步高亮状态
  // 这里会通过 App.vue 中的 notifySelectionChanged 来触发
}

// 处理工作空间切换事件
const handleWorkspaceChanged = (event) => {
  // 清空当前场景
  if (previewPipe) {
    scene.remove(previewPipe)
    previewPipe = null
  }
  
  // 清除所有状态
  clearAllHighlights()
  selectedPipeGroup = null
  firstSelectedEndFace = null
  secondSelectedEndFace = null
  selectedAssemblyItemIds.clear()
  
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

// 监听旋转模式切换事件
const handleRotationModeToggle = (event) => {
  isRotationMode = event.detail.enabled
  if (!isRotationMode) {
    detachRotationGizmo()
  } else if (selectedPipeGroup && rotatedAssemblyItemId) {
    attachRotationGizmo(selectedPipeGroup, rotatedAssemblyItemId)
  }
}

// 监听旋转轴选择事件
const handleRotationAxisChange = (event) => {
  rotationAxis = event.detail.axis
}

// 监听阵列模式切换
const handleMoveModeToggle = (event) => {
  isMoveMode = event.detail.enabled
}

const handleLodModeChange = (event) => {
  const { auto, segments } = event.detail
  _lodAutoMode = auto
  if (auto) {
    scheduleProgressiveRefine()
  } else if (previewPipe) {
    // 手动模式：所有管道设为指定细分数
    if (_refineRAF) { cancelAnimationFrame(_refineRAF); _refineRAF = null }
    for (const child of previewPipe.children) {
      const ud = child.userData
      if (!ud._originalParams) continue
      if (ud._lodSegments === segments) continue
      const params = { ...ud._originalParams, segments }
      const newGroup = createPipeObject(params, ud.assemblyItemId)
      if (!newGroup) continue
      const pos = child.position.clone()
      const rot = child.rotation.clone()
      while (child.children.length) { const c = child.children[0]; if (c.geometry) c.geometry.dispose(); child.remove(c) }
      while (newGroup.children.length) { child.add(newGroup.children[0]) }
      child.position.copy(pos)
      child.rotation.copy(rot)
      ud._lodSegments = segments
      ud._targetSegments = segments
    }
  }
}

const handleArrayModeToggle = (event) => {
  isArrayMode = event.detail.enabled
  if (!isArrayMode) {
    clearArraySelection()
  }
}


// 执行拼接操作（确认后保存数据）
const performJoin = (firstEndFace, secondEndFace, moveFirst, rotationAngle) => {
  if (!firstEndFace || !secondEndFace || !previewPipe) return
  
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
  if (!joinPreviewOriginalState || joinPreviewOriginalState.pipeId !== pipeToMove.userData.assemblyItemId) {
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
  }
  
  // 重置选择并清除高亮
  clearAllHighlights()
  firstSelectedEndFace = null
  secondSelectedEndFace = null
  
  // 清除预览状态
  joinPreviewOriginalState = null
  
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
}

// 保存原始位置和旋转（用于预览恢复）
let joinPreviewOriginalState = null

// 预览拼接（实时更新，不保存数据）
const previewJoin = (firstEndFace, secondEndFace, moveFirst, rotationAngle) => {
  if (!firstEndFace || !secondEndFace || !previewPipe) return
  
  // 查找第一个端面对象
  let firstEndFaceObject = null
  previewPipe.traverse((child) => {
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
  previewPipe.traverse((child) => {
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
  if (!joinPreviewOriginalState || joinPreviewOriginalState.pipeId !== pipeToMove.userData.assemblyItemId) {
    joinPreviewOriginalState = {
      pipeId: pipeToMove.userData.assemblyItemId,
      position: pipeToMove.position.clone(),
      quaternion: pipeToMove.quaternion.clone()
    }
  }
  
  // 恢复原始状态
  pipeToMove.position.copy(joinPreviewOriginalState.position)
  pipeToMove.quaternion.copy(joinPreviewOriginalState.quaternion)
  
  // 执行拼接计算（但不保存到数据）
  performJoinCalculation(pipeToMove, faceToMove, faceFixed, rotationAngle)
}

// 拼接计算逻辑（提取出来供预览和执行共用）
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

// 清除拼接预览（恢复原始状态）
const clearJoinPreview = () => {
  if (joinPreviewOriginalState && previewPipe) {
    // 查找对应的管道对象
    let pipeToRestore = null
    previewPipe.traverse((child) => {
      if (child.userData && child.userData.assemblyItemId === joinPreviewOriginalState.pipeId) {
        pipeToRestore = child
      }
    })
    
    if (pipeToRestore) {
      pipeToRestore.position.copy(joinPreviewOriginalState.position)
      pipeToRestore.quaternion.copy(joinPreviewOriginalState.quaternion)
    }
    
    joinPreviewOriginalState = null
  }
}

// 监听拼接定位事件（移动管道到拼接位置，角度为0）
const handlePositionJoin = (event) => {
  const { firstEndFace, secondEndFace, moveFirst, rotationAngle } = event.detail
  
  // 查找端面对象
  if (!firstEndFace || !secondEndFace || !previewPipe) return
  
  let firstEndFaceObject = null
  previewPipe.traverse((child) => {
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
  
  let secondEndFaceObject = null
  previewPipe.traverse((child) => {
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
  joinPreviewOriginalState = {
    pipeId: pipeToMove.userData.assemblyItemId,
    position: pipeToMove.position.clone(),
    quaternion: pipeToMove.quaternion.clone()
  }
}

// 监听拼接角度预览事件（只调整角度，管道已经移动到位置）
const handlePreviewJoinAngle = (event) => {
  const { firstEndFace, secondEndFace, moveFirst, rotationAngle } = event.detail
  
  if (!firstEndFace || !secondEndFace || !previewPipe || !joinPreviewOriginalState) return
  
  // 查找端面对象
  let firstEndFaceObject = null
  previewPipe.traverse((child) => {
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
  
  let secondEndFaceObject = null
  previewPipe.traverse((child) => {
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
  
  if (!firstEndFaceObject || !secondEndFaceObject) return
  
  const firstEndFaceInfo = getEndFaceWorldTransform(firstEndFaceObject)
  const secondEndFaceInfo = getEndFaceWorldTransform(secondEndFaceObject)
  
  if (!firstEndFaceInfo || !secondEndFaceInfo) return
  
  // 确定要移动的管道
  const pipeToMove = moveFirst ? firstEndFaceInfo.pipeGroup : secondEndFaceInfo.pipeGroup
  const faceToMove = moveFirst ? firstEndFaceInfo : secondEndFaceInfo
  const faceFixed = moveFirst ? secondEndFaceInfo : firstEndFaceInfo
  
  // 恢复原始位置（角度0的位置）
  pipeToMove.position.copy(joinPreviewOriginalState.position)
  pipeToMove.quaternion.copy(joinPreviewOriginalState.quaternion)
  
  // 执行拼接计算（应用新的角度）
  performJoinCalculation(pipeToMove, faceToMove, faceFixed, rotationAngle)
}

// 监听多选状态变化事件
const handleAssemblySelectionChanged = (event) => {
  const { selectedIds } = event.detail
  updateSelectionHighlight(selectedIds || [])
}

// 监听菜单宽度变化事件
const handleMenuWidthChanged = (event) => {
  currentMenuWidth = event.detail.width
  // 触发窗口resize以更新布局
  handleResize()
}

// 监听拼接预览事件（旧版本，保留兼容性）
const handlePreviewJoin = (event) => {
  // 这个函数不再使用，但保留以避免错误
}

// 监听拼接执行事件
const handlePerformJoin = (event) => {
  const { firstEndFace, secondEndFace, moveFirst, rotationAngle } = event.detail
  
  // firstEndFace 和 secondEndFace 只包含 assemblyItemId 和 endFaceType
  // 需要找到对应的端面对象并获取完整信息
  if (!firstEndFace || !secondEndFace || !previewPipe) {
    console.error('拼接失败：端面信息不完整')
    return
  }
  
  // 查找第一个端面对象
  let firstEndFaceObject = null
  previewPipe.traverse((child) => {
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
  previewPipe.traverse((child) => {
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
  joinPreviewOriginalState = null
}

// 监听拼接模式切换事件
const handleJoinModeToggle = (event) => {
  isJoinMode = event.detail.enabled
  // 重置选择并清除高亮
  if (!isJoinMode) {
    clearAllHighlights()
    clearJoinPreview()
    firstSelectedEndFace = null
    secondSelectedEndFace = null
  }
}

// 监听移动平面变更事件
const handleMovePlaneChange = (event) => {
  movePlane = event.detail.plane || 'free'
}

// 监听重置拼接选择事件
const handleResetJoinSelection = () => {
  clearAllHighlights()
  clearJoinPreview()
  firstSelectedEndFace = null
  secondSelectedEndFace = null
}

// 监听旋转更新事件（实时更新3D场景中的对象旋转）
const handleAssemblyItemRotationUpdate = (event) => {
  const { id, rotation } = event.detail
  
  if (!isAssemblyMode || !previewPipe) return
  
  // 找到对应的管道对象
  let pipeGroup = null
  previewPipe.children.forEach(child => {
    if (child.userData && child.userData.assemblyItemId === id) {
      pipeGroup = child
    }
  })
  
  if (pipeGroup) {
    // 更新旋转
    pipeGroup.rotation.set(rotation.x, rotation.y, rotation.z)
    
    // 强制更新对象矩阵，确保实时渲染
    pipeGroup.updateMatrix()
    pipeGroup.updateMatrixWorld(true)
  }
}

// 监听应用旋转角度事件（用于输入框输入）
const handleApplyRotation = (event) => {
  const { id, axis, angle } = event.detail // angle 是度数
  
  if (!isAssemblyMode || !previewPipe) return
  
  // 找到对应的管道对象
  let pipeGroup = null
  previewPipe.children.forEach(child => {
    if (child.userData && child.userData.assemblyItemId === id) {
      pipeGroup = child
    }
  })
  
  if (pipeGroup) {
    // 保存旋转前的角度
    const startRotation = {
      x: pipeGroup.rotation.x,
      y: pipeGroup.rotation.y,
      z: pipeGroup.rotation.z
    }
    
    // 将角度转换为弧度并应用
    const angleRad = (angle * Math.PI) / 180
    if (axis === 'x') {
      pipeGroup.rotation.x = angleRad
    } else if (axis === 'y') {
      pipeGroup.rotation.y = angleRad
    } else if (axis === 'z') {
      pipeGroup.rotation.z = angleRad
    }
    
    // 强制更新对象矩阵，确保实时渲染
    pipeGroup.updateMatrix()
    pipeGroup.updateMatrixWorld(true)
    
    // 同步更新数据
    window.dispatchEvent(new CustomEvent('assembly-item-rotation-updated', {
      detail: {
        id: id,
        rotation: {
          x: pipeGroup.rotation.x,
          y: pipeGroup.rotation.y,
          z: pipeGroup.rotation.z
        }
      }
    }))
    
    // 保存操作记录
    const endRotation = {
      x: pipeGroup.rotation.x,
      y: pipeGroup.rotation.y,
      z: pipeGroup.rotation.z
    }
    
    window.dispatchEvent(new CustomEvent('assembly-item-rotation-ended', {
      detail: {
        id: id,
        startRotation: startRotation,
        endRotation: endRotation,
        axis: axis
      }
    }))
  }
}

// 移除透明对象（hitbox）的辅助函数
const removeTransparentObjects = (object) => {
  // 从后往前遍历，避免删除时索引问题
  for (let i = object.children.length - 1; i >= 0; i--) {
    const child = object.children[i]
    
    // 递归处理子对象
    removeTransparentObjects(child)
    
    // 检查是否是透明对象（hitbox）
    if (child instanceof THREE.Mesh && child.material) {
      const material = child.material
      // 检查是否是完全透明的对象（用于点击检测的 hitbox）
      if (material.transparent && material.opacity === 0) {
        // 移除透明对象
        object.remove(child)
        // 清理资源
        if (child.geometry) child.geometry.dispose()
        if (child.material) child.material.dispose()
        continue
      }
    }
  }
}

// 监听导出事件
const handleExportAssembly = (event) => {
  const { format, subdivision } = event.detail
  if (!previewPipe) return
  
  // 克隆场景对象以避免修改原始对象
  const sceneToExport = previewPipe.clone()
  
  // 移除所有透明对象（hitbox）
  removeTransparentObjects(sceneToExport)
  
  if (subdivision && subdivision > 0) {
    console.log(`Exporting with subdivision level: ${subdivision}`)
    // TODO: 实现曲面细分逻辑 (需要引入 SubdivisionModifier)
  }
  
  // 移除所有辅助对象（如网格、坐标轴等，如果它们在previewPipe中）
  // previewPipe通常只包含装配体部件，但为了安全起见，可以过滤
  
  if (format === 'obj') {
    ExportManager.exportOBJ(sceneToExport, 'assembly.obj')
  } else if (format === 'fbx') {
    ExportManager.exportFBX(sceneToExport, 'assembly.fbx')
  }
}

onMounted(async () => {
  await initThree()
  window.addEventListener('resize', handleResize)
  window.addEventListener('reset-camera', handleResetCamera)
  window.addEventListener('switch-camera', switchCamera)
  window.addEventListener('switch-renderer', switchRenderer)
  window.addEventListener('update-pipe-preview', handlePipeParamsUpdate)
  window.addEventListener('view-part', handleViewPart)
  window.addEventListener('clear-pipe-preview', handleClearPreview)
  window.addEventListener('view-assembly', handleViewAssembly)
  window.addEventListener('assembly-item-rotation-updated', handleAssemblyItemRotationUpdate)
  window.addEventListener('rotation-mode-toggle', handleRotationModeToggle)
  window.addEventListener('rotation-axis-change', handleRotationAxisChange)
  window.addEventListener('apply-rotation', handleApplyRotation)
  window.addEventListener('join-mode-toggle', handleJoinModeToggle)
  window.addEventListener('perform-join', handlePerformJoin)
  window.addEventListener('position-join', handlePositionJoin)
  window.addEventListener('preview-join-angle', handlePreviewJoinAngle)
  window.addEventListener('clear-join-preview', clearJoinPreview)
  window.addEventListener('reset-join-selection', handleResetJoinSelection)
  window.addEventListener('sketch2d-params-update', handleSketch2DParamsUpdate)
  window.addEventListener('sketch2d-path-updated', handleSketch2DPathUpdated)
  window.addEventListener('sketch3d-params-update', handleSketch3DParamsUpdate)
  window.addEventListener('keydown', handleSketch3DKeyDown)
  window.addEventListener('move-plane-change', handleMovePlaneChange)
  window.addEventListener('move-mode-toggle', handleMoveModeToggle)
  window.addEventListener('lod-mode-change', handleLodModeChange)
  window.addEventListener('array-mode-toggle', handleArrayModeToggle)
  window.addEventListener('assembly-selection-changed', handleAssemblySelectionChanged)
  window.addEventListener('menu-width-changed', handleMenuWidthChanged)
  window.addEventListener('workspace-changed', handleWorkspaceChanged)
  window.addEventListener('export-assembly', handleExportAssembly)
  
  // 监听参数框和菜单的显示状态变化
  const observeLayoutChanges = () => {
    // 使用MutationObserver监听参数框和菜单的class变化
    const paramsPanel = document.querySelector('.params-panel')
    const menu = document.querySelector('.side-menu')
    
    if (paramsPanel) {
      const paramsObserver = new MutationObserver(() => {
        if (isSplitView.value) {
          setTimeout(() => handleResize(), 50)
        }
      })
      paramsObserver.observe(paramsPanel, {
        attributes: true,
        attributeFilter: ['class', 'style']
      })
    }
    
    if (menu) {
      const menuObserver = new MutationObserver(() => {
        if (isSplitView.value) {
          setTimeout(() => handleResize(), 50)
        }
      })
      menuObserver.observe(menu, {
        attributes: true,
        attributeFilter: ['class']
      })
    }
  }
  
  // 延迟执行，确保DOM已加载
  setTimeout(observeLayoutChanges, 500)
})

onUnmounted(() => {
  window.removeEventListener('resize', handleResize)
  window.removeEventListener('reset-camera', handleResetCamera)
  window.removeEventListener('switch-camera', switchCamera)
  window.removeEventListener('switch-renderer', switchRenderer)
  window.removeEventListener('update-pipe-preview', handlePipeParamsUpdate)
  window.removeEventListener('view-part', handleViewPart)
  window.removeEventListener('clear-pipe-preview', handleClearPreview)
  window.removeEventListener('view-assembly', handleViewAssembly)
  window.removeEventListener('assembly-item-rotation-updated', handleAssemblyItemRotationUpdate)
  window.removeEventListener('rotation-mode-toggle', handleRotationModeToggle)
  window.removeEventListener('rotation-axis-change', handleRotationAxisChange)
  window.removeEventListener('apply-rotation', handleApplyRotation)
  window.removeEventListener('join-mode-toggle', handleJoinModeToggle)
  window.removeEventListener('perform-join', handlePerformJoin)
  window.removeEventListener('position-join', handlePositionJoin)
  window.removeEventListener('preview-join-angle', handlePreviewJoinAngle)
  window.removeEventListener('clear-join-preview', clearJoinPreview)
  window.removeEventListener('reset-join-selection', handleResetJoinSelection)
  window.removeEventListener('sketch2d-params-update', handleSketch2DParamsUpdate)
  window.removeEventListener('sketch2d-path-updated', handleSketch2DPathUpdated)
  window.removeEventListener('sketch3d-params-update', handleSketch3DParamsUpdate)
  window.removeEventListener('keydown', handleSketch3DKeyDown)
  window.removeEventListener('move-plane-change', handleMovePlaneChange)
  window.removeEventListener('move-mode-toggle', handleMoveModeToggle)
  window.removeEventListener('lod-mode-change', handleLodModeChange)
  window.removeEventListener('array-mode-toggle', handleArrayModeToggle)
  window.removeEventListener('assembly-selection-changed', handleAssemblySelectionChanged)
  window.removeEventListener('menu-width-changed', handleMenuWidthChanged)
  window.removeEventListener('workspace-changed', handleWorkspaceChanged)
  window.removeEventListener('export-assembly', handleExportAssembly)
  
  // 清理预览对象
  clearPipePreview()

  // 清理stats
  const sp = document.getElementById('stats-panel')
  if (sp) sp.remove()
  const sb = document.getElementById('stats-ball')
  if (sb) sb.remove()

  // 清理3D草图
  if (isSketch3DMode.value) exitSketch3DMode()

  // 清理动态网格
  flushPendingGridDisposals()
  if (gridGroup && scene) {
    scene.remove(gridGroup)
    disposeGridGroupImmediate(gridGroup)
    gridGroup = null
  }

  if (renderer) {
    renderer.setAnimationLoop(null)
    if (renderer._animation) renderer._animation.stop()
  }
  
  if (controls) {
    controls.dispose()
  }
  
  if (renderer) {
    if (renderer.domElement) {
      renderer.domElement.removeEventListener('mousedown', onMouseDown)
      renderer.domElement.removeEventListener('mousemove', onMouseMove)
      renderer.domElement.removeEventListener('mouseup', onMouseUp)
      renderer.domElement.removeEventListener('click', onMouseClick)
    }
    renderer.dispose()
    if (containerRef.value && renderer.domElement) {
      containerRef.value.removeChild(renderer.domElement)
    }
  }
  
  // 清理防抖定时器
  if (saveHistoryTimer) {
    clearTimeout(saveHistoryTimer)
  }
  if (rotationSaveHistoryTimer) {
    clearTimeout(rotationSaveHistoryTimer)
  }
})
</script>

<style scoped>
.three-container-wrapper {
  height: 100%;
  display: flex;
  position: relative;
  margin-left: 0;
  transition: width 0.3s ease, margin-left 0.3s ease;
}

.sketch-panel {
  height: 100%;
  border-right: 1px solid rgba(255, 255, 255, 0.1);
  flex: 1 1 0;
  min-width: 0;
  transition: width 0.3s ease;
}

.three-container {
  width: 100%;
  height: 100%;
  overflow: hidden;
  transition: width 0.3s ease, flex 0.3s ease;
  flex: 1 1 auto;
  min-width: 0;
}

.three-container.split-view {
  flex: 1 1 0;
  width: auto;
}

.scale-bar {
  position: absolute;
  bottom: 24px;
  left: 24px;
  pointer-events: none;
  z-index: 10;
}

.scale-bar-ruler {
  position: relative;
  height: 24px;
  min-width: 40px;
  transition: width 0.15s ease;
}

.scale-bar-track {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 2px;
  background: rgba(255, 255, 255, 0.8);
}

.scale-bar-tick {
  position: absolute;
  bottom: 0;
  transform: translateX(-50%);
}

.scale-bar-tick-line {
  width: 2px;
  height: 8px;
  background: rgba(255, 255, 255, 0.8);
  margin: 0 auto;
}

.scale-bar-tick-label {
  display: block;
  color: rgba(255, 255, 255, 0.85);
  font-size: 11px;
  font-family: monospace;
  white-space: nowrap;
  text-align: center;
  margin-bottom: 2px;
}

.sketch3d-toolbar {
  position: absolute;
  top: 12px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  gap: 12px;
  background: rgba(0, 0, 0, 0.8);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 8px;
  padding: 8px 14px;
  z-index: 20;
}

.sketch3d-toolbar-group {
  display: flex;
  align-items: center;
  gap: 4px;
}

.sketch3d-label {
  color: rgba(255, 255, 255, 0.5);
  font-size: 11px;
  margin-right: 4px;
}

.sketch3d-btn {
  background: rgba(255, 255, 255, 0.1);
  color: #ccc;
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 4px;
  padding: 4px 10px;
  font-size: 12px;
  cursor: pointer;
}

.sketch3d-btn:hover {
  background: rgba(255, 255, 255, 0.2);
}

.sketch3d-btn.active {
  background: #4a9eff;
  color: #fff;
  border-color: #4a9eff;
}

.sketch3d-btn-confirm {
  background: rgba(40, 167, 69, 0.7);
  border-color: rgba(40, 167, 69, 0.8);
  color: #fff;
}

.sketch3d-btn-confirm:hover {
  background: rgba(40, 167, 69, 0.9);
}

</style>


