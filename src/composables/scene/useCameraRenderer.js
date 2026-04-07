import * as THREE from 'three'
import { WebGPURenderer } from 'three/webgpu'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { TransformControls } from 'three/addons/controls/TransformControls.js'
import { rotationSnapStep } from './useSceneContext.js'

// ── Standalone helpers (no ctx needed) ──────────────────────────

export function unfreezeObjectSubtree(obj) {
  if (!obj) return
  obj.traverse((o) => { o.matrixAutoUpdate = true })
}

export function freezeObjectSubtree(obj) {
  if (!obj) return
  obj.traverse((o) => { o.matrixAutoUpdate = false })
  obj.updateMatrixWorld(true)
}

// ── Helpers that operate on ctx ─────────────────────────────────

export function requestShadowUpdate(ctx) {
  ctx._shadowUpdateRequested = true
}

export function freezePreviewPipeMatrices(ctx) {
  if (!ctx.previewPipe) return
  ctx.previewPipe.traverse((o) => { o.matrixAutoUpdate = false })
  ctx.previewPipe.updateMatrixWorld(true)
}

export function enableShadowsForObject(ctx, object) {
  if (!object) return
  const on = ctx.shadowsGloballyEnabled
  object.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      if (child.layers.test(1) && !child.layers.test(0)) {
        child.castShadow = false
        child.receiveShadow = false
      } else {
        child.castShadow = on
        child.receiveShadow = on
      }
    }
  })
}

// ── Main composable ─────────────────────────────────────────────

/**
 * Camera & renderer management extracted from ThreeScene.vue.
 *
 * @param {object} ctx  - shared scene context (plain object)
 * @param {object} deps - external callbacks & refs:
 *   { onMouseDown, onMouseMove, onMouseUp, onMouseClick,
 *     isWebGPU, isSplitView, isSketch3DMode, containerRef,
 *     handleResize, animate,
 *     flushPendingGridDisposals, waitForRendererQueueIdle,
 *     scheduleGridGroupDisposal, setupTransformControlEvents,
 *     getGridGroup, setGridGroup, getLastGridStep, setLastGridStep,
 *     getLastGridCenter }
 */
export function useCameraRenderer(ctx, deps) {

  // ── switchCamera ────────────────────────────────────────────
  const switchCamera = () => {
    if (!ctx.camera || !ctx.controls || !ctx.renderer) return

    const position = ctx.camera.position.clone()
    const target = ctx.controls.target.clone()
    const zoom = ctx.camera.zoom || 1
    const quaternion = ctx.camera.quaternion.clone()

    let newCamera
    if (ctx.isPerspective) {
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
      newCamera.zoom = Math.max(zoom, 0.1)
      newCamera.updateProjectionMatrix()
      ctx.isPerspective = false
    } else {
      newCamera = new THREE.PerspectiveCamera(
        75,
        window.innerWidth / window.innerHeight,
        0.1,
        10000
      )
      newCamera.position.copy(position)
      newCamera.quaternion.copy(quaternion)
      newCamera.updateProjectionMatrix()
      ctx.isPerspective = true
    }

    ctx.controls.object = newCamera
    ctx.controls.target.copy(target)
    ctx.camera = newCamera
    ctx.controls.update()
  }

  // ── switchRenderer ──────────────────────────────────────────
  const switchRenderer = async () => {
    if (!ctx.renderer || !ctx.camera || !ctx.controls || !deps.containerRef.value) return

    // Stop animation and wait for GPU queue to flush
    ctx.renderer.setAnimationLoop(null)
    if (ctx.renderer._animation) ctx.renderer._animation.stop()
    await deps.waitForRendererQueueIdle(ctx.renderer)
    deps.flushPendingGridDisposals()

    // Save camera state
    const pos = ctx.camera.position.clone()
    const target = ctx.controls.target.clone()
    const quat = ctx.camera.quaternion.clone()

    // Remove old event listeners & DOM
    ctx.renderer.domElement.removeEventListener('mousedown', deps.onMouseDown)
    ctx.renderer.domElement.removeEventListener('mousemove', deps.onMouseMove)
    ctx.renderer.domElement.removeEventListener('mouseup', deps.onMouseUp)
    ctx.renderer.domElement.removeEventListener('click', deps.onMouseClick)
    deps.containerRef.value.removeChild(ctx.renderer.domElement)

    // Clean up old controls
    if (ctx.transformControl) {
      ctx.scene.remove(ctx.transformControl.getHelper())
      ctx.transformControl.dispose()
    }
    ctx.controls.dispose()

    // Keep old renderer reference for deferred disposal
    const oldRenderer = ctx.renderer

    // Create new renderer (unified WebGPURenderer, toggle backend)
    const useGPU = !deps.isWebGPU.value
    ctx.renderer = new WebGPURenderer({
      antialias: true,
      powerPreference: 'high-performance',
      forceWebGL: !useGPU
    })
    await ctx.renderer.init()

    if (useGPU) {
      const adapter = ctx.renderer.backend?.adapter
      if (adapter) {
        const info = await adapter.requestAdapterInfo()
        console.log('WebGPU Adapter:', info.vendor, info.architecture, info.device, info.description)
      }
    }
    deps.isWebGPU.value = useGPU

    // When switching back to WebGL, discard current grid and force rebuild next frame;
    // when switching to WebGPU, keep existing grid in "build once" mode
    if (!useGPU) {
      const gridGroup = deps.getGridGroup()
      if (gridGroup) {
        deps.scheduleGridGroupDisposal(gridGroup)
        deps.setGridGroup(null)
      }
      deps.setLastGridStep(0)
      deps.getLastGridCenter().set(0, 0, 0)
    }

    const rect = deps.containerRef.value.getBoundingClientRect()
    ctx.renderer.setSize(rect.width, rect.height)
    ctx.renderer.setPixelRatio(window.devicePixelRatio)
    if (ctx.renderer.shadowMap) {
      ctx.renderer.shadowMap.enabled = ctx.shadowsGloballyEnabled
      ctx.renderer.shadowMap.type = THREE.PCFShadowMap
      ctx.renderer.shadowMap.autoUpdate = false
      ctx.renderer.shadowMap.needsUpdate = true
    }
    deps.containerRef.value.appendChild(ctx.renderer.domElement)

    // Rebuild OrbitControls
    ctx.controls = new OrbitControls(ctx.camera, ctx.renderer.domElement)
    ctx.controls.enableDamping = true
    ctx.controls.dampingFactor = 0.05
    ctx.controls.mouseButtons = {
      LEFT: THREE.MOUSE.ROTATE,
      MIDDLE: THREE.MOUSE.DOLLY,
      RIGHT: THREE.MOUSE.PAN
    }
    ctx.controls.panSpeed = 0.8
    ctx.controls.target.copy(target)

    // Rebuild TransformControls
    ctx.transformControl = new TransformControls(ctx.camera, ctx.renderer.domElement)
    ctx.transformControl.setMode('rotate')
    ctx.transformControl.setSpace('local')
    ctx.transformControl.setRotationSnap(rotationSnapStep)
    ctx.transformControl.size = 0.9
    ctx.transformControl.visible = false
    ctx.transformControl.enabled = false
    ctx.scene.add(ctx.transformControl.getHelper())

    // Set up TransformControls event listeners (same as initThree)
    deps.setupTransformControlEvents()

    // Restore camera
    ctx.camera.position.copy(pos)
    ctx.camera.quaternion.copy(quat)
    ctx.controls.update()

    // Rebind mouse events
    ctx.renderer.domElement.addEventListener('mousedown', deps.onMouseDown)
    ctx.renderer.domElement.addEventListener('mousemove', deps.onMouseMove)
    ctx.renderer.domElement.addEventListener('mouseup', deps.onMouseUp)
    ctx.renderer.domElement.addEventListener('click', deps.onMouseClick)

    // If in sketch-3D mode, disable left-button rotation
    if (deps.isSketch3DMode.value) ctx.controls.mouseButtons.LEFT = null

    // Restart animation
    deps.animate()

    // Defer old renderer disposal to avoid GPU submit race
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        try {
          oldRenderer.dispose()
        } catch (e) {
          console.warn('释放旧渲染器失败:', e)
        }
      })
    })

    // Notify App.vue to update button label
    window.dispatchEvent(
      new CustomEvent('renderer-switched', { detail: { type: useGPU ? 'webgpu' : 'webgl' } })
    )
    applyShadowSettings(ctx.shadowsGloballyEnabled)
  }

  // ── handleResetCamera ───────────────────────────────────────
  const handleResetCamera = () => {
    if (ctx.camera && ctx.controls) {
      ctx.camera.position.set(0, 0, 5)
      ctx.controls.target.set(0, 0, 0)
      ctx.controls.update()
    }
  }

  // ── applyShadowSettings ─────────────────────────────────────
  const applyShadowSettings = (enabled) => {
    ctx.shadowsGloballyEnabled = !!enabled
    if (ctx.renderer && ctx.renderer.shadowMap) {
      ctx.renderer.shadowMap.enabled = ctx.shadowsGloballyEnabled
    }
    if (ctx.mainDirectionalLight) {
      ctx.mainDirectionalLight.castShadow = ctx.shadowsGloballyEnabled
    }
    if (ctx.scene) {
      ctx.scene.traverse((o) => {
        if (o.isMesh) {
          o.castShadow = ctx.shadowsGloballyEnabled
          o.receiveShadow = ctx.shadowsGloballyEnabled
        }
      })
    }
    requestShadowUpdate(ctx)
  }

  // ── handleShadowsSetting ────────────────────────────────────
  const handleShadowsSetting = (event) => {
    const enabled = event.detail?.enabled !== false
    applyShadowSettings(enabled)
  }

  return {
    switchCamera,
    switchRenderer,
    handleResetCamera,
    applyShadowSettings,
    handleShadowsSetting
  }
}
