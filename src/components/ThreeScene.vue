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
import Sketch2DCanvas from './Sketch2DCanvas.vue'
import Stats from 'stats.js'

// Scene composables
import { createSceneContext, rotationSnapStep } from '../composables/scene/useSceneContext.js'
import { useSceneGrid, addAxisLabels } from '../composables/scene/useSceneGrid.js'
import { useAnimationLoop } from '../composables/scene/useAnimationLoop.js'
import {
  useCameraRenderer,
  requestShadowUpdate,
  freezePreviewPipeMatrices,
  unfreezeObjectSubtree,
  freezeObjectSubtree,
  enableShadowsForObject
} from '../composables/scene/useCameraRenderer.js'
import { useSelectionHighlight } from '../composables/scene/useSelectionHighlight.js'
import { useRotationGizmo } from '../composables/scene/useRotationGizmo.js'
import { useJoinInteraction } from '../composables/scene/useJoinInteraction.js'
import { usePipePreview } from '../composables/scene/usePipePreview.js'
import { useSketch3D } from '../composables/scene/useSketch3D.js'
import { useMouseInteraction } from '../composables/scene/useMouseInteraction.js'
import { useAssemblyView } from '../composables/scene/useAssemblyView.js'
import { useLodSystem } from '../composables/scene/useLodSystem.js'
import { useSceneExport } from '../composables/scene/useSceneExport.js'
import { setFlatShading } from '../utils/pipeCommon.js'
import * as InstancedManager from '../utils/instancedAssemblyManager.js'

// Template refs
const containerRef = ref(null)
const scaleBarRef = ref(null)
const isWebGPU = ref(false)

// Create shared context
const ctx = createSceneContext()

// ── Initialize composables ──

const grid = useSceneGrid(ctx)
const { scaleBarWidth, scaleBarTicks } = grid

const selection = useSelectionHighlight(ctx)

const rotationGizmo = useRotationGizmo(ctx, {
  unfreezeObjectSubtree,
  freezePreviewPipeMatrices: () => freezePreviewPipeMatrices(ctx)
})

const join = useJoinInteraction(ctx, {
  freezePreviewPipeMatrices: () => freezePreviewPipeMatrices(ctx),
  requestShadowUpdate: () => requestShadowUpdate(ctx),
  requestRender: () => animLoop.requestRender(),
  findPipeGroupByAssemblyId: selection.findPipeGroupByAssemblyId
})

// Use a mutable deps object so circular deps can be wired after creation
const pipePreviewDeps = {
  enableShadowsForObject: (obj) => enableShadowsForObject(ctx, obj),
  freezePreviewPipeMatrices: () => freezePreviewPipeMatrices(ctx),
  requestShadowUpdate: () => { requestShadowUpdate(ctx); animLoop.requestRender() },
  detachRotationGizmo: rotationGizmo.detachRotationGizmo,
  clearArraySelection: selection.clearArraySelection,
  handleResize: () => handleResize(),
  markStatsDirty: () => animLoop.markStatsDirty(),
  requestRender: () => animLoop.requestRender(),
  exitSketch3DMode: null, // set after sketch3D is created
  isSketch3DMode: null    // set after sketch3D is created
}
const pipePreview = usePipePreview(ctx, pipePreviewDeps)

const { isSplitView, initialSketchPathData, handlePathUpdated } = pipePreview

const sketch3D = useSketch3D(ctx, {
  clearPipePreview: pipePreview.clearPipePreview,
  enableShadowsForObject: (obj) => enableShadowsForObject(ctx, obj),
  handleResize: () => handleResize(),
  isSplitView: pipePreview.isSplitView,
  sketchPathData: pipePreview.sketchPathData,
  sketch2DPipeParams: pipePreview.sketch2DPipeParams,
  initialSketchPathData: pipePreview.initialSketchPathData
})

// Wire circular dependencies via mutable deps objects
pipePreviewDeps.exitSketch3DMode = sketch3D.exitSketch3DMode
pipePreviewDeps.isSketch3DMode = sketch3D.isSketch3DMode

const { isSketch3DMode, sketch3DDrawMode, sketch3DWorkingPlane,
  sketch3DUpdateGrid, sketch3DUndo, sketch3DClear, sketch3DConfirm } = sketch3D

const mouse = useMouseInteraction(ctx, {
  attachRotationGizmo: rotationGizmo.attachRotationGizmo,
  attachTranslateGizmo: rotationGizmo.attachTranslateGizmo,
  detachRotationGizmo: rotationGizmo.detachRotationGizmo,
  handleEndFaceClick: join.handleEndFaceClick,
  unfreezeObjectSubtree,
  freezePreviewPipeMatrices: () => freezePreviewPipeMatrices(ctx),
  findPipeGroupByAssemblyId: selection.findPipeGroupByAssemblyId,
  requestShadowUpdate: () => { requestShadowUpdate(ctx); animLoop.requestRender() },
  sketch3DRaycastToPlane: sketch3D.sketch3DRaycastToPlane,
  sketch3DAddLineSegment: sketch3D.sketch3DAddLineSegment,
  sketch3DAddArcSegment: sketch3D.sketch3DAddArcSegment,
  sketch3DUpdatePreviewLines: sketch3D.sketch3DUpdatePreviewLines,
  isSketch3DMode: sketch3D.isSketch3DMode,
  sketch3DDrawMode: sketch3D.sketch3DDrawMode
})

const lodDeps = {
  enableShadowsForObject: (obj) => enableShadowsForObject(ctx, obj),
  freezeObjectSubtree,
  requestShadowUpdate: () => requestShadowUpdate(ctx),
  updateAssemblyView: null // set after assemblyView is created
}
const lod = useLodSystem(ctx, lodDeps)

const assemblyView = useAssemblyView(ctx, {
  clearPipePreview: pipePreview.clearPipePreview,
  enableShadowsForObject: (obj) => enableShadowsForObject(ctx, obj),
  freezePreviewPipeMatrices: () => freezePreviewPipeMatrices(ctx),
  requestShadowUpdate: () => requestShadowUpdate(ctx),
  clearArraySelection: selection.clearArraySelection,
  scheduleProgressiveRefine: lod.scheduleProgressiveRefine,
  clearAllHighlights: join.clearAllHighlights,
  exitSketch3DMode: sketch3D.exitSketch3DMode,
  isSketch3DMode: sketch3D.isSketch3DMode,
  isSplitView: pipePreview.isSplitView,
  sketchPathData: pipePreview.sketchPathData,
  sketch2DPipeParams: pipePreview.sketch2DPipeParams,
  initialSketchPathData: pipePreview.initialSketchPathData,
  handleResize: () => handleResize(),
  // Notify caches on structural changes + trigger render
  onStructuralChange: () => {
    selection.invalidateCache()
    if (animLoop) {
      animLoop.markStatsDirty()
      animLoop.requestRender()
    }
  }
})

// Wire circular dependency for LOD
lodDeps.updateAssemblyView = assemblyView.updateAssemblyView

const animLoop = useAnimationLoop(ctx, {
  updateDynamicGrid: grid.updateDynamicGrid,
  tickPendingGridDisposals: grid.tickPendingGridDisposals,
  degradeLod: lod.degradeLod
})

const sceneExport = useSceneExport(ctx)

// ── Camera / Renderer composable ──

const setupTransformControlEvents = () => {
  ctx.transformControl.addEventListener('dragging-changed', (event) => {
    if (ctx.controls) ctx.controls.enabled = !event.value
    const obj = ctx.transformControl.object
    if (obj) {
      if (event.value) {
        unfreezeObjectSubtree(obj)
      } else {
        obj.traverse((o) => { o.matrixAutoUpdate = false })
        obj.updateMatrixWorld(true)
        if (ctx.isAssemblyMode && ctx.previewPipe) freezePreviewPipeMatrices(ctx)
      }
    }
  })

  // ---- Batch translate state ----
  // When gizmo translates, ALL selected items move together.
  // The gizmo is attached to the "anchor" pipe; others follow by delta.
  let _batchMoveItems = []   // { id, group, startPos: {x,y,z} }
  let _anchorStartPos = null // anchor pipe's start position

  ctx.transformControl.addEventListener('mouseDown', () => {
    const obj = ctx.transformControl.object
    if (!obj) return
    const mode = ctx.transformControl.mode
    if (mode === 'rotate') {
      ctx.rotationStartSnapshot = {
        x: obj.rotation.x, y: obj.rotation.y, z: obj.rotation.z
      }
    } else if (mode === 'translate') {
      // Record start positions of ALL selected items
      _anchorStartPos = { x: obj.position.x, y: obj.position.y, z: obj.position.z }
      _batchMoveItems = []
      for (const id of ctx.selectedAssemblyItemIds) {
        if (id === ctx.rotatedAssemblyItemId) continue // anchor handled by gizmo
        // 弹出其他选中的零件，使其可被移动
        let group = InstancedManager.getPoppedGroup(id)
        if (!group) group = InstancedManager.popOutItem(id)
        if (group) {
          unfreezeObjectSubtree(group)
          _batchMoveItems.push({
            id,
            group,
            startPos: { x: group.position.x, y: group.position.y, z: group.position.z }
          })
        }
      }
      // Also store the anchor itself for history
      ctx._translateStartPosition = { ..._anchorStartPos }
    }
  })

  ctx.transformControl.addEventListener('objectChange', () => {
    const obj = ctx.transformControl.object
    if (!obj || !ctx.rotatedAssemblyItemId) return
    const mode = ctx.transformControl.mode
    animLoop.requestRender()

    if (mode === 'rotate') {
      window.dispatchEvent(new CustomEvent('assembly-item-rotation-updated', {
        detail: {
          id: ctx.rotatedAssemblyItemId,
          rotation: { x: obj.rotation.x, y: obj.rotation.y, z: obj.rotation.z },
          isUserInput: false
        }
      }))
    } else if (mode === 'translate') {
      // Compute delta from anchor's start position
      const dx = obj.position.x - _anchorStartPos.x
      const dy = obj.position.y - _anchorStartPos.y
      const dz = obj.position.z - _anchorStartPos.z

      // Move all other selected items by the same delta
      for (const item of _batchMoveItems) {
        item.group.position.set(
          item.startPos.x + dx,
          item.startPos.y + dy,
          item.startPos.z + dz
        )
        item.group.updateMatrix()
        item.group.updateMatrixWorld(true)
        // Sync data
        window.dispatchEvent(new CustomEvent('assembly-item-position-updated', {
          detail: {
            id: item.id,
            position: { x: item.group.position.x, y: item.group.position.y, z: item.group.position.z }
          }
        }))
        // InstancedMesh: 弹出的零件直接作为独立 mesh 更新，无需 proxy 同步
      }

      // Sync anchor
      window.dispatchEvent(new CustomEvent('assembly-item-position-updated', {
        detail: {
          id: ctx.rotatedAssemblyItemId,
          position: { x: obj.position.x, y: obj.position.y, z: obj.position.z }
        }
      }))
      // InstancedMesh: 同上
    }
  })

  ctx.transformControl.addEventListener('mouseUp', () => {
    const obj = ctx.transformControl.object
    if (!obj || !ctx.rotatedAssemblyItemId) return
    const mode = ctx.transformControl.mode

    if (mode === 'rotate' && ctx.rotationStartSnapshot) {
      const endRot = { x: obj.rotation.x, y: obj.rotation.y, z: obj.rotation.z }
      const startRot = ctx.rotationStartSnapshot
      // 检测实际变化最大的轴，而非面板选择的轴
      const dx = Math.abs(endRot.x - startRot.x)
      const dy = Math.abs(endRot.y - startRot.y)
      const dz = Math.abs(endRot.z - startRot.z)
      let detectedAxis = 'z'
      if (dx >= dy && dx >= dz) detectedAxis = 'x'
      else if (dy >= dx && dy >= dz) detectedAxis = 'y'
      window.dispatchEvent(new CustomEvent('assembly-item-rotation-ended', {
        detail: {
          id: ctx.rotatedAssemblyItemId,
          startRotation: { ...startRot },
          endRotation: endRot,
          axis: detectedAxis
        }
      }))
      ctx.rotationStartSnapshot = null
      // 不在此处 pushBack — 保持零件弹出状态，用户可继续旋转
      // pushBack 在 detachRotationGizmo 或切换零件时执行
    } else if (mode === 'translate' && ctx._translateStartPosition) {
      if (_batchMoveItems.length > 0) {
        // Batch move: emit one batch event
        const items = [{
          id: ctx.rotatedAssemblyItemId,
          startPosition: { ...ctx._translateStartPosition },
          endPosition: { x: obj.position.x, y: obj.position.y, z: obj.position.z }
        }]
        for (const item of _batchMoveItems) {
          items.push({
            id: item.id,
            startPosition: { ...item.startPos },
            endPosition: { x: item.group.position.x, y: item.group.position.y, z: item.group.position.z }
          })
        }
        window.dispatchEvent(new CustomEvent('assembly-items-batch-drag-ended', {
          detail: { items }
        }))
      } else {
        // Single move
        window.dispatchEvent(new CustomEvent('assembly-item-drag-ended', {
          detail: {
            id: ctx.rotatedAssemblyItemId,
            startPosition: { ...ctx._translateStartPosition },
            endPosition: { x: obj.position.x, y: obj.position.y, z: obj.position.z }
          }
        }))
      }
      // 归还批量移动的其他零件（锚点零件在 detach 时归还）
      for (const item of _batchMoveItems) {
        InstancedManager.pushBackItem(item.id)
      }
      ctx._translateStartPosition = null
      _batchMoveItems = []
      _anchorStartPos = null
    }
    animLoop.requestRender()
  })
}

const cam = useCameraRenderer(ctx, {
  onMouseDown: mouse.onMouseDown,
  onMouseMove: mouse.onMouseMove,
  onMouseUp: mouse.onMouseUp,
  onMouseClick: mouse.onMouseClick,
  isWebGPU,
  isSplitView: pipePreview.isSplitView,
  isSketch3DMode: sketch3D.isSketch3DMode,
  containerRef,
  handleResize: () => handleResize(),
  animate: animLoop.animate,
  flushPendingGridDisposals: grid.flushPendingGridDisposals,
  waitForRendererQueueIdle: grid.waitForRendererQueueIdle,
  scheduleGridGroupDisposal: grid.scheduleGridGroupDisposal,
  setupTransformControlEvents,
  getGridGroup: grid.getGridGroup,
  setGridGroup: grid.setGridGroup,
  getLastGridStep: grid.getLastGridStep,
  setLastGridStep: grid.setLastGridStep,
  getLastGridCenter: grid.getLastGridCenter,
  requestRender: () => animLoop.requestRender()
})

// ── Layout ──

const getAvailableWidth = () => {
  const paramsPanelWidth = 300
  let availableWidth = window.innerWidth
  const menuElement = document.querySelector('.side-menu')
  const isMenuCollapsed = menuElement && menuElement.classList.contains('collapsed')
  const paramsPanel = document.querySelector('.params-panel')
  const isParamsPanelVisible = paramsPanel && window.getComputedStyle(paramsPanel).display !== 'none'
  if (!isMenuCollapsed) availableWidth -= ctx.currentMenuWidth
  if (isParamsPanelVisible) availableWidth -= paramsPanelWidth
  return availableWidth
}

const handleResize = () => {
  if (!ctx.camera || !ctx.renderer) return
  animLoop.requestRender()
  const availableWidth = getAvailableWidth()
  let width = pipePreview.isSplitView.value ? availableWidth / 2 : availableWidth
  const height = window.innerHeight

  if (ctx.camera instanceof THREE.PerspectiveCamera) {
    ctx.camera.aspect = width / height
  } else if (ctx.camera instanceof THREE.OrthographicCamera) {
    const aspect = width / height
    const viewSize = 10
    ctx.camera.left = -viewSize * aspect
    ctx.camera.right = viewSize * aspect
    ctx.camera.top = viewSize
    ctx.camera.bottom = -viewSize
  }
  ctx.camera.updateProjectionMatrix()
  ctx.renderer.setSize(width, height)

  if (containerRef.value) {
    containerRef.value.style.width = width + 'px'
    containerRef.value.style.height = height + 'px'
  }

  const wrapper = document.querySelector('.three-container-wrapper')
  const sketchPanel = document.querySelector('.sketch-panel')
  const paramsPanelWidth = 300
  const menuElement = document.querySelector('.side-menu')
  const isMenuCollapsed = menuElement && menuElement.classList.contains('collapsed')
  const paramsPanel = document.querySelector('.params-panel')
  const isParamsPanelVisible = paramsPanel && window.getComputedStyle(paramsPanel).display !== 'none'
  let marginLeft = 0
  if (!isMenuCollapsed) marginLeft += ctx.currentMenuWidth
  if (isParamsPanelVisible) marginLeft += paramsPanelWidth

  if (pipePreview.isSplitView.value) {
    if (wrapper) { wrapper.style.width = availableWidth + 'px'; wrapper.style.marginLeft = marginLeft + 'px' }
    if (sketchPanel) { sketchPanel.style.width = (availableWidth / 2) + 'px'; sketchPanel.style.flex = 'none' }
    if (containerRef.value) { containerRef.value.style.width = (availableWidth / 2) + 'px'; containerRef.value.style.flex = 'none' }
  } else {
    if (wrapper) { wrapper.style.width = availableWidth + 'px'; wrapper.style.marginLeft = marginLeft + 'px' }
    if (sketchPanel) { sketchPanel.style.width = '0'; sketchPanel.style.flex = '' }
    if (containerRef.value) { containerRef.value.style.width = availableWidth + 'px'; containerRef.value.style.flex = '' }
  }
}

// ── Event handlers ──

const handleEndCapsSetting = (event) => {
  const visible = event.detail?.visible !== false
  // Toggle end cap visibility on individual meshes
  if (ctx.previewPipe) {
    ctx.previewPipe.traverse((child) => {
      if (child.isMesh && child.userData && child.userData.isEndFace) {
        child.visible = visible
      }
    })
  }
  // Toggle instanced cap meshes
  InstancedManager.setEndCapsVisible(visible)
  animLoop.requestRender()
}

const handleFlatShadingSetting = (event) => {
  const enabled = event.detail?.enabled === true
  setFlatShading(enabled)
  InstancedManager.setInstancedFlatShading(enabled)
  animLoop.requestRender()
}

const handleRotationModeToggle = (event) => {
  ctx.isRotationMode = event.detail.enabled
  if (!ctx.isRotationMode) rotationGizmo.detachRotationGizmo()
  else if (ctx.selectedPipeGroup && ctx.rotatedAssemblyItemId)
    rotationGizmo.attachRotationGizmo(ctx.selectedPipeGroup, ctx.rotatedAssemblyItemId)
  animLoop.requestRender()
}
const handleRotationAxisChange = (event) => { ctx.rotationAxis = event.detail.axis }
const handleMoveModeToggle = (event) => {
  ctx.isMoveMode = event.detail.enabled
  // Detach gizmo when leaving move mode
  if (!ctx.isMoveMode) rotationGizmo.detachRotationGizmo()
}
const handleArrayModeToggle = (event) => {
  ctx.isArrayMode = event.detail.enabled
  if (!ctx.isArrayMode) selection.clearArraySelection()
  animLoop.requestRender()
}
const handleAssemblySelectionChanged = (event) => {
  selection.updateSelectionHighlight(event.detail.selectedIds || [])
  animLoop.requestRender()
}
const handleMenuWidthChanged = (event) => {
  ctx.currentMenuWidth = event.detail.width
  handleResize()
}
const handleMovePlaneChange = (event) => { ctx.movePlane = event.detail.plane || 'free' }

const handleAssemblyItemRotationUpdate = (event) => {
  const { id, rotation } = event.detail
  if (!ctx.isAssemblyMode || !ctx.previewPipe) return
  const pipeGroup = selection.findPipeGroupByAssemblyId(id)
  if (pipeGroup) {
    pipeGroup.rotation.set(rotation.x, rotation.y, rotation.z)
    pipeGroup.updateMatrix()
    pipeGroup.updateMatrixWorld(true)
    freezeObjectSubtree(pipeGroup)
    requestShadowUpdate(ctx)
    animLoop.requestRender()
  }
}

const handleApplyRotation = (event) => {
  const { id, axis, angle } = event.detail
  if (!ctx.isAssemblyMode || !ctx.previewPipe) return
  const pipeGroup = selection.findPipeGroupByAssemblyId(id)
  if (pipeGroup) {
    const startRotation = { x: pipeGroup.rotation.x, y: pipeGroup.rotation.y, z: pipeGroup.rotation.z }
    const angleRad = (angle * Math.PI) / 180
    pipeGroup.rotation[axis] = angleRad
    pipeGroup.updateMatrix()
    pipeGroup.updateMatrixWorld(true)
    freezeObjectSubtree(pipeGroup)
    requestShadowUpdate(ctx)
    window.dispatchEvent(new CustomEvent('assembly-item-rotation-updated', {
      detail: { id, rotation: { x: pipeGroup.rotation.x, y: pipeGroup.rotation.y, z: pipeGroup.rotation.z } }
    }))
    // 直接更新 InstancedMesh 实例变换
    InstancedManager.updateItemTransform(id,
      { x: pipeGroup.position.x, y: pipeGroup.position.y, z: pipeGroup.position.z },
      { x: pipeGroup.rotation.x, y: pipeGroup.rotation.y, z: pipeGroup.rotation.z }
    )
    window.dispatchEvent(new CustomEvent('assembly-item-rotation-ended', {
      detail: { id, startRotation, endRotation: { x: pipeGroup.rotation.x, y: pipeGroup.rotation.y, z: pipeGroup.rotation.z }, axis }
    }))
    animLoop.requestRender()
  }
}

// ── initThree ──

const initThree = async () => {
  ctx.scene = new THREE.Scene()
  ctx.scene.background = new THREE.Color(0x1a1a1a)

  // Stats panel
  const statsPanel = document.createElement('div')
  statsPanel.id = 'stats-panel'
  statsPanel.style.cssText = 'position:absolute;top:60px;right:0;z-index:100;user-select:none;background:rgba(0,0,0,0.85);border-radius:4px;overflow:hidden;'
  const titleBar = document.createElement('div')
  titleBar.style.cssText = 'height:16px;cursor:move;display:flex;align-items:center;justify-content:flex-end;padding:0 4px;background:rgba(255,255,255,0.1);'
  const collapseBtn = document.createElement('span')
  collapseBtn.style.cssText = 'cursor:pointer;color:#aaa;font-size:14px;line-height:16px;'
  collapseBtn.textContent = '−'
  titleBar.appendChild(collapseBtn)
  statsPanel.appendChild(titleBar)
  const panelsRow = document.createElement('div')
  panelsRow.style.cssText = 'display:flex;'
  const panels = [0, 1, 2]
  panels.forEach(i => {
    const s = new Stats()
    s.showPanel(i)
    const canvas = s.dom.children[i]
    if (canvas) canvas.style.cssText = 'width:100px;height:60px;display:block;'
    const wrapper = document.createElement('div')
    wrapper.style.cssText = 'width:100px;height:60px;overflow:hidden;pointer-events:none;'
    wrapper.appendChild(canvas)
    panelsRow.appendChild(wrapper)
    if (i === 0) ctx.stats = s
    else if (i === 1) ctx.stats._ms = s
    else ctx.stats._mb = s
  })
  statsPanel.appendChild(panelsRow)
  const statsInfo = document.createElement('div')
  statsInfo.style.cssText = 'color:#ccc;font-size:12px;font-family:monospace;padding:4px 8px;white-space:nowrap;'
  statsPanel.appendChild(statsInfo)
  ctx.stats._info = statsInfo
  const statsBall = document.createElement('div')
  statsBall.id = 'stats-ball'
  statsBall.style.cssText = 'position:absolute;top:60px;right:0;width:24px;height:24px;background:rgba(0,180,0,0.8);border-radius:50%;cursor:pointer;z-index:100;display:none;user-select:none;'
  statsBall.title = '展开性能面板'
  const parentEl = containerRef.value.parentElement
  collapseBtn.addEventListener('click', () => { statsPanel.style.display = 'none'; statsBall.style.display = 'block' })
  statsBall.addEventListener('click', () => { statsBall.style.display = 'none'; statsPanel.style.display = 'block' })
  let _pd = false, _px = 0, _py = 0
  titleBar.addEventListener('mousedown', e => { _pd = true; _px = e.clientX - statsPanel.offsetLeft; _py = e.clientY - statsPanel.offsetTop; e.preventDefault() })
  let _bd = false, _bx = 0, _by = 0
  statsBall.addEventListener('mousedown', e => { if (e.detail > 0) { _bd = true; _bx = e.clientX - statsBall.offsetLeft; _by = e.clientY - statsBall.offsetTop; e.preventDefault() } })
  document.addEventListener('mousemove', e => {
    if (_pd) { statsPanel.style.left = (e.clientX - _px) + 'px'; statsPanel.style.top = (e.clientY - _py) + 'px'; statsPanel.style.right = 'auto' }
    if (_bd) { statsBall.style.left = (e.clientX - _bx) + 'px'; statsBall.style.top = (e.clientY - _by) + 'px'; statsBall.style.right = 'auto' }
  })
  document.addEventListener('mouseup', () => { _pd = false; _bd = false })
  parentEl.appendChild(statsPanel)
  parentEl.appendChild(statsBall)

  // Camera
  ctx.camera = new THREE.PerspectiveCamera(
    75,
    window.innerWidth / window.innerHeight,
    0.1,
    10000
  )
  ctx.camera.position.set(5, 5, 5)

  try { ctx.shadowsGloballyEnabled = localStorage.getItem('3dbuild.shadowsEnabled') !== '0' } catch { ctx.shadowsGloballyEnabled = true }

  // Renderer
  ctx.renderer = new WebGPURenderer({ antialias: true, powerPreference: 'high-performance', forceWebGL: true })
  await ctx.renderer.init()
  ctx.renderer.setSize(window.innerWidth, window.innerHeight)
  ctx.renderer.setPixelRatio(window.devicePixelRatio)
  if (ctx.renderer.shadowMap) {
    ctx.renderer.shadowMap.enabled = ctx.shadowsGloballyEnabled
    ctx.renderer.shadowMap.type = THREE.PCFShadowMap
    ctx.renderer.shadowMap.autoUpdate = false
  }
  containerRef.value.appendChild(ctx.renderer.domElement)

  // Initialize drag vectors now that THREE is available
  ctx.dragStartPoint = new THREE.Vector3()
  ctx.dragOffset = new THREE.Vector3()

  // Lights
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.5)
  ctx.scene.add(ambientLight)
  ctx.mainDirectionalLight = new THREE.DirectionalLight(0xffffff, 1)
  ctx.mainDirectionalLight.position.set(5, 10, 5)
  ctx.mainDirectionalLight.castShadow = ctx.shadowsGloballyEnabled
  ctx.mainDirectionalLight.shadow.mapSize.width = 2048
  ctx.mainDirectionalLight.shadow.mapSize.height = 2048
  ctx.mainDirectionalLight.shadow.camera.near = 0.5
  ctx.mainDirectionalLight.shadow.camera.far = 500
  ctx.mainDirectionalLight.shadow.camera.left = -100
  ctx.mainDirectionalLight.shadow.camera.right = 100
  ctx.mainDirectionalLight.shadow.camera.top = 100
  ctx.mainDirectionalLight.shadow.camera.bottom = -100
  ctx.mainDirectionalLight.shadow.bias = -0.0001
  ctx.scene.add(ctx.mainDirectionalLight)

  // Grid & axes
  grid.updateDynamicGrid()
  const axesHelper = new THREE.AxesHelper(20)
  ctx.scene.add(axesHelper)
  addAxisLabels(ctx.scene)

  // Controls
  ctx.controls = new OrbitControls(ctx.camera, ctx.renderer.domElement)
  ctx.controls.enableDamping = true
  ctx.controls.dampingFactor = 0.05
  ctx.controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN }
  ctx.controls.panSpeed = 0.8

  // On-demand rendering: notify interaction when user operates controls
  ctx.controls.addEventListener('start', () => animLoop.notifyInteraction())
  ctx.controls.addEventListener('change', () => animLoop.requestRender())

  // TransformControls
  ctx.transformControl = new TransformControls(ctx.camera, ctx.renderer.domElement)
  ctx.transformControl.setMode('rotate')
  ctx.transformControl.setSpace('local')
  ctx.transformControl.setRotationSnap(rotationSnapStep)
  ctx.transformControl.size = 0.9
  ctx.transformControl.visible = false
  ctx.transformControl.enabled = false
  ctx.scene.add(ctx.transformControl.getHelper())
  setupTransformControlEvents()

  // Mouse events
  ctx.renderer.domElement.addEventListener('mousedown', mouse.onMouseDown)
  ctx.renderer.domElement.addEventListener('mousemove', mouse.onMouseMove)
  ctx.renderer.domElement.addEventListener('mouseup', mouse.onMouseUp)
  ctx.renderer.domElement.addEventListener('click', mouse.onMouseClick)

  // Start animation
  animLoop.animate()
}

// ── Lifecycle ──

onMounted(async () => {
  await initThree()
  window.addEventListener('resize', handleResize)
  window.addEventListener('reset-camera', cam.handleResetCamera)
  window.addEventListener('switch-camera', cam.switchCamera)
  window.addEventListener('switch-renderer', cam.switchRenderer)
  window.addEventListener('shadows-setting', cam.handleShadowsSetting)
  window.addEventListener('endcaps-setting', handleEndCapsSetting)
  window.addEventListener('flatshading-setting', handleFlatShadingSetting)
  window.addEventListener('update-pipe-preview', pipePreview.handlePipeParamsUpdate)
  window.addEventListener('view-part', pipePreview.handleViewPart)
  window.addEventListener('clear-pipe-preview', pipePreview.handleClearPreview)
  window.addEventListener('view-assembly', assemblyView.handleViewAssembly)
  window.addEventListener('assembly-item-rotation-updated', handleAssemblyItemRotationUpdate)
  window.addEventListener('rotation-mode-toggle', handleRotationModeToggle)
  window.addEventListener('rotation-axis-change', handleRotationAxisChange)
  window.addEventListener('apply-rotation', handleApplyRotation)
  window.addEventListener('join-mode-toggle', join.handleJoinModeToggle)
  window.addEventListener('perform-join', join.handlePerformJoin)
  window.addEventListener('position-join', join.handlePositionJoin)
  window.addEventListener('preview-join-angle', join.handlePreviewJoinAngle)
  window.addEventListener('clear-join-preview', join.clearJoinPreview)
  window.addEventListener('reset-join-selection', join.handleResetJoinSelection)
  window.addEventListener('sketch2d-params-update', pipePreview.handleSketch2DParamsUpdate)
  window.addEventListener('sketch2d-path-updated', pipePreview.handleSketch2DPathUpdated)
  window.addEventListener('sketch3d-params-update', sketch3D.handleSketch3DParamsUpdate)
  window.addEventListener('keydown', sketch3D.handleSketch3DKeyDown)
  window.addEventListener('move-plane-change', handleMovePlaneChange)
  window.addEventListener('move-mode-toggle', handleMoveModeToggle)
  window.addEventListener('lod-mode-change', lod.handleLodModeChange)
  window.addEventListener('array-mode-toggle', handleArrayModeToggle)
  window.addEventListener('assembly-selection-changed', handleAssemblySelectionChanged)
  window.addEventListener('menu-width-changed', handleMenuWidthChanged)
  window.addEventListener('workspace-changed', assemblyView.handleWorkspaceChanged)
  window.addEventListener('export-assembly', sceneExport.handleExportAssembly)

  // Layout observers
  const observeLayoutChanges = () => {
    const paramsPanel = document.querySelector('.params-panel')
    const menu = document.querySelector('.side-menu')
    if (paramsPanel) {
      const obs = new MutationObserver(() => { if (pipePreview.isSplitView.value) setTimeout(handleResize, 50) })
      obs.observe(paramsPanel, { attributes: true, attributeFilter: ['class', 'style'] })
    }
    if (menu) {
      const obs = new MutationObserver(() => { if (pipePreview.isSplitView.value) setTimeout(handleResize, 50) })
      obs.observe(menu, { attributes: true, attributeFilter: ['class'] })
    }
  }
  setTimeout(observeLayoutChanges, 500)
})

onUnmounted(() => {
  window.removeEventListener('resize', handleResize)
  window.removeEventListener('reset-camera', cam.handleResetCamera)
  window.removeEventListener('switch-camera', cam.switchCamera)
  window.removeEventListener('switch-renderer', cam.switchRenderer)
  window.removeEventListener('shadows-setting', cam.handleShadowsSetting)
  window.removeEventListener('endcaps-setting', handleEndCapsSetting)
  window.removeEventListener('flatshading-setting', handleFlatShadingSetting)
  window.removeEventListener('update-pipe-preview', pipePreview.handlePipeParamsUpdate)
  window.removeEventListener('view-part', pipePreview.handleViewPart)
  window.removeEventListener('clear-pipe-preview', pipePreview.handleClearPreview)
  window.removeEventListener('view-assembly', assemblyView.handleViewAssembly)
  window.removeEventListener('assembly-item-rotation-updated', handleAssemblyItemRotationUpdate)
  window.removeEventListener('rotation-mode-toggle', handleRotationModeToggle)
  window.removeEventListener('rotation-axis-change', handleRotationAxisChange)
  window.removeEventListener('apply-rotation', handleApplyRotation)
  window.removeEventListener('join-mode-toggle', join.handleJoinModeToggle)
  window.removeEventListener('perform-join', join.handlePerformJoin)
  window.removeEventListener('position-join', join.handlePositionJoin)
  window.removeEventListener('preview-join-angle', join.handlePreviewJoinAngle)
  window.removeEventListener('clear-join-preview', join.clearJoinPreview)
  window.removeEventListener('reset-join-selection', join.handleResetJoinSelection)
  window.removeEventListener('sketch2d-params-update', pipePreview.handleSketch2DParamsUpdate)
  window.removeEventListener('sketch2d-path-updated', pipePreview.handleSketch2DPathUpdated)
  window.removeEventListener('sketch3d-params-update', sketch3D.handleSketch3DParamsUpdate)
  window.removeEventListener('keydown', sketch3D.handleSketch3DKeyDown)
  window.removeEventListener('move-plane-change', handleMovePlaneChange)
  window.removeEventListener('move-mode-toggle', handleMoveModeToggle)
  window.removeEventListener('lod-mode-change', lod.handleLodModeChange)
  window.removeEventListener('array-mode-toggle', handleArrayModeToggle)
  window.removeEventListener('assembly-selection-changed', handleAssemblySelectionChanged)
  window.removeEventListener('menu-width-changed', handleMenuWidthChanged)
  window.removeEventListener('workspace-changed', assemblyView.handleWorkspaceChanged)
  window.removeEventListener('export-assembly', sceneExport.handleExportAssembly)

  pipePreview.clearPipePreview()
  const sp = document.getElementById('stats-panel')
  if (sp) sp.remove()
  const sb = document.getElementById('stats-ball')
  if (sb) sb.remove()
  if (isSketch3DMode.value) sketch3D.exitSketch3DMode()

  grid.flushPendingGridDisposals()
  const gg = grid.getGridGroup()
  if (gg && ctx.scene) {
    ctx.scene.remove(gg)
    grid.disposeGridGroupImmediate(gg)
    grid.setGridGroup(null)
  }

  if (ctx.renderer) {
    ctx.renderer.setAnimationLoop(null)
    if (ctx.renderer._animation) ctx.renderer._animation.stop()
  }
  if (ctx.controls) ctx.controls.dispose()
  if (ctx.renderer) {
    if (ctx.renderer.domElement) {
      ctx.renderer.domElement.removeEventListener('mousedown', mouse.onMouseDown)
      ctx.renderer.domElement.removeEventListener('mousemove', mouse.onMouseMove)
      ctx.renderer.domElement.removeEventListener('mouseup', mouse.onMouseUp)
      ctx.renderer.domElement.removeEventListener('click', mouse.onMouseClick)
    }
    ctx.renderer.dispose()
    if (containerRef.value && ctx.renderer.domElement) containerRef.value.removeChild(ctx.renderer.domElement)
  }
  if (ctx.saveHistoryTimer) clearTimeout(ctx.saveHistoryTimer)
  if (ctx.rotationSaveHistoryTimer) clearTimeout(ctx.rotationSaveHistoryTimer)
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
