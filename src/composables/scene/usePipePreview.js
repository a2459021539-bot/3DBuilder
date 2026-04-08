import { ref } from 'vue'
import { createPipeObject } from '../../utils/pipeFactory.js'
import { createSketch2DPipe } from '../../utils/sketch2dPipe.js'
import { clearBatchedProxy } from '../../utils/batchedProxy.js'

/**
 * Pipe preview composable – manages single-pipe preview, 2D sketch preview,
 * and the split-view panel state.
 *
 * @param {object} ctx  – shared scene context (plain object, see useSceneContext)
 * @param {object} deps – sibling composable helpers:
 *   { enableShadowsForObject, freezePreviewPipeMatrices, requestShadowUpdate,
 *     detachRotationGizmo, clearArraySelection, handleResize,
 *     exitSketch3DMode, isSketch3DMode }
 */
export function usePipePreview(ctx, deps) {
  // ---- Vue refs (exposed) ----
  const isSplitView = ref(false)
  const sketchPathData = ref(null)
  const sketch2DPipeParams = ref(null)
  const initialSketchPathData = ref(null)

  // ---- Functions ----

  const clearPipePreview = () => {
    if (ctx.previewPipe && ctx.scene) {
      if (ctx._refineRAF) {
        cancelAnimationFrame(ctx._refineRAF)
        ctx._refineRAF = null
      }
      ctx.scene.remove(ctx.previewPipe)
      deps.detachRotationGizmo()
      deps.clearArraySelection()
      clearBatchedProxy(ctx.scene)
      // dispose geometries (skip shared geometry managed by geoCache)
      if (ctx.previewPipe.children) {
        ctx.previewPipe.children.forEach(child => {
          child.traverse(obj => {
            if (obj.isMesh && obj.geometry && !obj.userData._sharedGeometry) {
              obj.geometry.dispose()
            }
          })
        })
      }
      ctx.previewPipe = null
      ctx.isAssemblyMode = false
      deps.requestShadowUpdate()
      deps.markStatsDirty()
      deps.requestRender()
    }
  }

  const createPipePreview = (params) => {
    if (!ctx.scene) {
      console.warn('createPipePreview: scene is not initialized')
      return
    }

    // remove old preview
    clearPipePreview()

    // non-assembly mode
    ctx.isAssemblyMode = false

    if (!params || !params.type) {
      console.warn('createPipePreview: invalid params', params)
      return
    }

    const pipeGroup = createPipeObject(params)
    if (!pipeGroup) {
      console.warn('createPipePreview: createPipeObject returned null', params)
      return
    }

    deps.enableShadowsForObject(pipeGroup)

    ctx.previewPipe = pipeGroup
    ctx.scene.add(ctx.previewPipe)
    deps.freezePreviewPipeMatrices()
    deps.requestShadowUpdate()
    deps.markStatsDirty()
    deps.requestRender()

    // auto-adjust camera
    if (ctx.camera && ctx.controls) {
      const size = pipeGroup.userData.size || 100
      const cameraDistance = size * 1.5
      ctx.camera.position.set(cameraDistance, cameraDistance * 0.7, cameraDistance)
      ctx.controls.target.set(0, 0, 0)
      ctx.controls.update()
    }
  }

  const updatePipePreview = (params) => {
    createPipePreview(params)
  }

  const updateSketch2DPreview = () => {
    if (!ctx.scene || !sketchPathData.value || !sketch2DPipeParams.value) return

    // remove old preview
    clearPipePreview()

    ctx.isAssemblyMode = false

    const params = {
      ...sketch2DPipeParams.value,
      pathData: sketchPathData.value,
      type: 'sketch2d'
    }

    const result = createSketch2DPipe(params)
    if (!result) return

    deps.enableShadowsForObject(result.pipeGroup)

    ctx.previewPipe = result.pipeGroup
    ctx.scene.add(ctx.previewPipe)
    deps.markStatsDirty()
    deps.requestRender()

    // auto-adjust camera
    if (ctx.camera && ctx.controls) {
      const size = result.groupSize || 100
      const cameraDistance = size * 1.5
      ctx.camera.position.set(cameraDistance, cameraDistance * 0.7, cameraDistance)
      ctx.controls.target.set(0, 0, 0)
      ctx.controls.update()
    }
  }

  // ---- Event handlers ----

  const handlePipeParamsUpdate = (event) => {
    const params = event.detail
    // if type is not sketch2d and 2D panel is open, close it
    if (params.type && params.type !== 'sketch2d' && isSplitView.value) {
      isSplitView.value = false
      sketchPathData.value = null
      sketch2DPipeParams.value = null
      initialSketchPathData.value = null
      setTimeout(() => {
        deps.handleResize()
      }, 100)
    }
    // exit 3D sketch mode
    if (deps.isSketch3DMode.value) deps.exitSketch3DMode()
    updatePipePreview(params)
  }

  const handleViewPart = (event) => {
    const params = event.detail
    createPipePreview(params)
  }

  const handleClearPreview = () => {
    clearPipePreview()
    // reset split-view state
    isSplitView.value = false
    sketchPathData.value = null
    sketch2DPipeParams.value = null
    initialSketchPathData.value = null

    setTimeout(() => {
      deps.handleResize()
    }, 100)
  }

  const handlePathUpdated = (pathData) => {
    sketchPathData.value = pathData
    if (sketch2DPipeParams.value) {
      updateSketch2DPreview()
    }
  }

  const handleSketch2DPathUpdated = (event) => {
    const pathData = event.detail
    sketchPathData.value = pathData
    if (sketch2DPipeParams.value) {
      updateSketch2DPreview()
    }

    // sync pathData so App.vue can persist latest data
    window.dispatchEvent(new CustomEvent('sketch2d-pathdata-sync', {
      detail: pathData
    }))
  }

  const handleSketch2DParamsUpdate = (event) => {
    const params = event.detail
    if (!params.type || params.type === 'sketch2d') {
      sketch2DPipeParams.value = params
      isSplitView.value = true

      // load existing path data (edit mode)
      if (params.pathData && params.pathData.segments && params.pathData.segments.length > 0) {
        initialSketchPathData.value = { segments: params.pathData.segments.map(s => ({ ...s })) }
        sketchPathData.value = { segments: params.pathData.segments.map(s => ({ ...s })) }
      } else {
        if (!sketchPathData.value || !sketchPathData.value.segments || sketchPathData.value.segments.length === 0) {
          initialSketchPathData.value = null
          sketchPathData.value = null
        }
      }

      setTimeout(() => {
        deps.handleResize()
        // if path data exists, update preview immediately
        if (sketchPathData.value && sketchPathData.value.segments && sketchPathData.value.segments.length > 0) {
          updateSketch2DPreview()
        }
      }, 100)
    } else {
      // type is not sketch2d – close 2D panel
      if (isSplitView.value) {
        isSplitView.value = false
        sketchPathData.value = null
        sketch2DPipeParams.value = null
        initialSketchPathData.value = null
        setTimeout(() => {
          deps.handleResize()
        }, 100)
      }
    }
  }

  return {
    // refs
    isSplitView,
    sketchPathData,
    sketch2DPipeParams,
    initialSketchPathData,
    // functions
    createPipePreview,
    clearPipePreview,
    updatePipePreview,
    handlePipeParamsUpdate,
    handleViewPart,
    handleClearPreview,
    handlePathUpdated,
    handleSketch2DPathUpdated,
    updateSketch2DPreview,
    handleSketch2DParamsUpdate,
  }
}
