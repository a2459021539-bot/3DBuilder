<template>
  <div class="three-container-wrapper">
    <!-- 2D草图面板（分屏时显示） -->
    <div v-if="isSplitView" class="sketch-panel">
      <Sketch2DCanvas 
        :initial-path-data="initialSketchPathData" 
        @path-updated="handlePathUpdated" 
      />
    </div>
    
    <!-- 3D场景容器 -->
    <div class="three-scene-container" :class="{ 'split-view': isSplitView }">
      <!-- 核心渲染器 -->
      <SceneRenderer
        ref="rendererRef"
        :width="sceneWidth"
        :height="sceneHeight"
        :background-color="0x1a1a1a"
        @scene-ready="handleSceneReady"
        @renderer-ready="handleRendererReady"
        @before-render="handleBeforeRender"
        @after-render="handleAfterRender"
      />
      
      <!-- 相机控制器 -->
      <SceneControls
        ref="controlsRef"
        :camera="camera"
        :renderer="renderer"
        :scene="scene"
        @controls-ready="handleControlsReady"
        @camera-change="handleCameraChange"
        @transform-start="handleTransformStart"
        @transform-end="handleTransformEnd"
        @object-attached="handleObjectAttached"
        @object-detached="handleObjectDetached"
      />
      
      <!-- 网格和坐标系 -->
      <SceneGrid
        ref="gridRef"
        :scene="scene"
        :grid-size="100"
        :divisions="100"
        :axis-length="20"
        :show-grid="true"
        :show-axes="true"
        :show-labels="true"
        @grid-created="handleGridCreated"
        @axes-created="handleAxesCreated"
        @labels-created="handleLabelsCreated"
      />
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import SceneRenderer from './scene/SceneRenderer.vue'
import SceneControls from './scene/SceneControls.vue'
import SceneGrid from './scene/SceneGrid.vue'
import Sketch2DCanvas from './Sketch2DCanvas.vue'
import { createPipeObject } from '../utils/pipeFactory.js'
import { createSketch2DPipe } from '../utils/sketch2dPipe.js'

// Refs
const rendererRef = ref(null)
const controlsRef = ref(null)
const gridRef = ref(null)

// Scene objects
const scene = ref(null)
const camera = ref(null)
const renderer = ref(null)
const controls = ref(null)

// State
const isSplitView = ref(false)
const initialSketchPathData = ref(null)
const sketchPathData = ref(null)
const sketch2DPipeParams = ref(null)

// Preview objects
let previewPipe = null
let isAssemblyMode = false

// Computed properties
const sceneWidth = computed(() => {
  const availableWidth = getAvailableWidth()
  return isSplitView.value ? availableWidth / 2 : availableWidth
})

const sceneHeight = computed(() => {
  return window.innerHeight
})

// Calculate available width (considering parameter panels and menu)
const getAvailableWidth = () => {
  const menuWidth = 250
  const paramsPanelWidth = 300
  let availableWidth = window.innerWidth
  
  const menuElement = document.querySelector('.side-menu')
  const isMenuCollapsed = menuElement && menuElement.classList.contains('collapsed')
  
  const paramsPanel = document.querySelector('.params-panel')
  const isParamsPanelVisible = paramsPanel && window.getComputedStyle(paramsPanel).display !== 'none'
  
  if (!isMenuCollapsed) {
    availableWidth -= menuWidth
  }
  
  if (isParamsPanelVisible) {
    availableWidth -= paramsPanelWidth
  }
  
  return availableWidth
}

// Event handlers
const handleSceneReady = ({ scene: newScene, camera: newCamera }) => {
  scene.value = newScene
  camera.value = newCamera
  console.log('Scene ready:', { scene: newScene, camera: newCamera })
}

const handleRendererReady = ({ renderer: newRenderer }) => {
  renderer.value = newRenderer
  console.log('Renderer ready:', newRenderer)
}

const handleControlsReady = ({ orbitControls, transformControls }) => {
  controls.value = { orbitControls, transformControls }
  console.log('Controls ready:', { orbitControls, transformControls })
}

const handleBeforeRender = ({ scene, camera, renderer }) => {
  // Update controls before rendering
  if (controlsRef.value) {
    controlsRef.value.updateControls()
  }
}

const handleAfterRender = ({ scene, camera, renderer }) => {
  // Post-render logic if needed
}

const handleCameraChange = (event) => {
  console.log('Camera changed:', event)
  
  // Handle camera type switch
  if (event.camera) {
    camera.value = event.camera
  }
}

const handleTransformStart = (event) => {
  console.log('Transform started:', event)
}

const handleTransformEnd = (event) => {
  console.log('Transform ended:', event)
}

const handleObjectAttached = (event) => {
  console.log('Object attached to transform controls:', event)
}

const handleObjectDetached = (event) => {
  console.log('Object detached from transform controls:', event)
}

const handleGridCreated = (event) => {
  console.log('Grid created:', event)
}

const handleAxesCreated = (event) => {
  console.log('Axes created:', event)
}

const handleLabelsCreated = (event) => {
  console.log('Labels created:', event)
}

// 2D Sketch handlers
const handlePathUpdated = (pathData) => {
  sketchPathData.value = pathData
  
  if (sketch2DPipeParams.value && pathData) {
    // Update 3D preview based on 2D path
    updateSketch2DPreview()
  }
}

const updateSketch2DPreview = () => {
  if (!scene.value || !sketchPathData.value || !sketch2DPipeParams.value) return
  
  // Clear existing preview
  clearPipePreview()
  
  // Create new 3D pipe from 2D path
  const params = {
    ...sketch2DPipeParams.value,
    pathData: sketchPathData.value,
    type: 'sketch2d'
  }
  
  const pipeGroup = createSketch2DPipe(params)
  if (pipeGroup) {
    enableShadowsForObject(pipeGroup)
    previewPipe = pipeGroup
    scene.value.add(previewPipe)
  }
}

// Pipe preview management
const createPipePreview = (params) => {
  if (!scene.value) return

  clearPipePreview()
  isAssemblyMode = false

  const pipeGroup = createPipeObject(params)
  if (!pipeGroup) return

  enableShadowsForObject(pipeGroup)
  previewPipe = pipeGroup
  scene.value.add(previewPipe)

  // Auto-adjust camera to view the entire model
  if (camera.value && controls.value?.orbitControls) {
    const size = pipeGroup.userData.size || 100
    const cameraDistance = size * 2.5
    camera.value.position.set(cameraDistance, cameraDistance * 0.7, cameraDistance)
    controls.value.orbitControls.target.set(0, 0, 0)
    controls.value.orbitControls.update()
  }
}

const clearPipePreview = () => {
  if (previewPipe && scene.value) {
    scene.value.remove(previewPipe)
    
    // Dispose of geometries and materials
    previewPipe.traverse((child) => {
      if (child.geometry) child.geometry.dispose()
      if (child.material) {
        if (Array.isArray(child.material)) {
          child.material.forEach(material => material.dispose())
        } else {
          child.material.dispose()
        }
      }
    })
    
    previewPipe = null
  }
}

// Enable shadows for objects
const enableShadowsForObject = (object) => {
  if (!object) return
  
  object.traverse((child) => {
    if (child.isMesh) {
      child.castShadow = true
      child.receiveShadow = true
    }
  })
}

// Window event listeners
const setupEventListeners = () => {
  // Pipe preview events
  window.addEventListener('update-pipe-preview', (event) => {
    createPipePreview(event.detail)
  })
  
  window.addEventListener('view-part', (event) => {
    createPipePreview(event.detail)
  })
  
  window.addEventListener('clear-pipe-preview', () => {
    clearPipePreview()
  })
  
  // Assembly events
  window.addEventListener('view-assembly', (event) => {
    isAssemblyMode = true
    // Handle assembly view logic
  })
  
  window.addEventListener('refresh-assembly-view', () => {
    if (isAssemblyMode) {
      // Refresh assembly display
    }
  })
  
  // Camera events
  window.addEventListener('reset-camera', () => {
    if (controlsRef.value) {
      controlsRef.value.resetCamera()
    }
  })
  
  window.addEventListener('switch-camera', () => {
    if (controlsRef.value) {
      const newCamera = controlsRef.value.switchCamera()
      if (newCamera) {
        camera.value = newCamera
      }
    }
  })
  
  // 2D Sketch events
  window.addEventListener('sketch2d-params-update', (event) => {
    sketch2DPipeParams.value = event.detail
    
    if (event.detail.type === 'sketch2d') {
      isSplitView.value = true
      
      if (event.detail.pathData) {
        initialSketchPathData.value = event.detail.pathData
      }
    } else {
      isSplitView.value = false
    }
    
    updateSketch2DPreview()
  })
  
  // Window resize
  window.addEventListener('resize', handleResize)
}

const removeEventListeners = () => {
  window.removeEventListener('update-pipe-preview', createPipePreview)
  window.removeEventListener('view-part', createPipePreview)
  window.removeEventListener('clear-pipe-preview', clearPipePreview)
  window.removeEventListener('view-assembly', () => {})
  window.removeEventListener('refresh-assembly-view', () => {})
  window.removeEventListener('reset-camera', () => {})
  window.removeEventListener('switch-camera', () => {})
  window.removeEventListener('sketch2d-params-update', () => {})
  window.removeEventListener('resize', handleResize)
}

const handleResize = () => {
  // The SceneRenderer component will handle size updates automatically
  // through its width/height props that are computed
}

// Lifecycle
onMounted(() => {
  setupEventListeners()
})

onUnmounted(() => {
  removeEventListeners()
  clearPipePreview()
})

// Expose methods for external access
defineExpose({
  getScene: () => scene.value,
  getCamera: () => camera.value,
  getRenderer: () => renderer.value,
  getControls: () => controls.value,
  createPipePreview,
  clearPipePreview,
  resetCamera: () => controlsRef.value?.resetCamera(),
  switchCamera: () => controlsRef.value?.switchCamera()
})
</script>

<style scoped>
.three-container-wrapper {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  display: flex;
  background: #1a1a1a;
  z-index: 1;
}

.sketch-panel {
  width: 50%;
  height: 100vh;
  border-right: 1px solid rgba(255, 255, 255, 0.1);
  background: #2a2a2a;
}

.three-scene-container {
  position: relative;
  width: 100%;
  height: 100vh;
  overflow: hidden;
}

.three-scene-container.split-view {
  width: 50%;
}

/* 确保子组件填满容器 */
.three-scene-container :deep(.scene-renderer) {
  width: 100% !important;
  height: 100% !important;
}
</style>