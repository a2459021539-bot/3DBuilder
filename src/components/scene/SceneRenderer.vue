<template>
  <div ref="containerRef" class="scene-renderer" :style="containerStyle"></div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, computed, watch } from 'vue'
import * as THREE from 'three'

// Props
const props = defineProps({
  width: {
    type: Number,
    default: window.innerWidth
  },
  height: {
    type: Number,
    default: window.innerHeight
  },
  backgroundColor: {
    type: Number,
    default: 0x1a1a1a
  },
  enableShadows: {
    type: Boolean,
    default: true
  },
  pixelRatio: {
    type: Number,
    default: window.devicePixelRatio
  }
})

// Emits
const emit = defineEmits([
  'scene-ready',
  'renderer-ready',
  'before-render',
  'after-render'
])

// Refs
const containerRef = ref(null)

// Scene objects
let scene = null
let camera = null
let renderer = null
let animationId = null

// Computed
const containerStyle = computed(() => ({
  width: `${props.width}px`,
  height: `${props.height}px`
}))

// Initialize Three.js scene
const initScene = () => {
  // Create scene
  scene = new THREE.Scene()
  scene.background = new THREE.Color(props.backgroundColor)

  // Create camera
  camera = new THREE.PerspectiveCamera(
    75,
    props.width / props.height,
    0.1,
    10000
  )
  camera.position.set(0, 0, 5)

  // Create renderer
  renderer = new THREE.WebGLRenderer({ antialias: true })
  renderer.setSize(props.width, props.height)
  renderer.setPixelRatio(props.pixelRatio)
  
  if (props.enableShadows) {
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
  }
  
  containerRef.value.appendChild(renderer.domElement)

  // Setup lighting
  setupLighting()

  // Emit ready events
  emit('scene-ready', { scene, camera })
  emit('renderer-ready', { renderer })

  // Start animation loop
  animate()
}

// Setup lighting
const setupLighting = () => {
  // Ambient light
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.5)
  scene.add(ambientLight)

  // Directional light with shadows
  const directionalLight = new THREE.DirectionalLight(0xffffff, 1)
  directionalLight.position.set(5, 10, 5)
  
  if (props.enableShadows) {
    directionalLight.castShadow = true
    directionalLight.shadow.mapSize.width = 2048
    directionalLight.shadow.mapSize.height = 2048
    directionalLight.shadow.camera.near = 0.5
    directionalLight.shadow.camera.far = 500
    directionalLight.shadow.camera.left = -100
    directionalLight.shadow.camera.right = 100
    directionalLight.shadow.camera.top = 100
    directionalLight.shadow.camera.bottom = -100
    directionalLight.shadow.bias = -0.0001
  }
  
  scene.add(directionalLight)
}

// Animation loop
const animate = () => {
  animationId = requestAnimationFrame(animate)

  emit('before-render', { scene, camera, renderer })
  
  if (renderer && scene && camera) {
    renderer.render(scene, camera)
  }
  
  emit('after-render', { scene, camera, renderer })
}

// Update camera aspect ratio
const updateCameraAspect = () => {
  if (camera instanceof THREE.PerspectiveCamera) {
    camera.aspect = props.width / props.height
    camera.updateProjectionMatrix()
  } else if (camera instanceof THREE.OrthographicCamera) {
    const aspect = props.width / props.height
    const viewSize = 10
    camera.left = -viewSize * aspect
    camera.right = viewSize * aspect
    camera.top = viewSize
    camera.bottom = -viewSize
    camera.updateProjectionMatrix()
  }
}

// Update renderer size
const updateRendererSize = () => {
  if (renderer) {
    renderer.setSize(props.width, props.height)
  }
}

// Watch for size changes
watch(() => [props.width, props.height], () => {
  updateCameraAspect()
  updateRendererSize()
})

// Watch for background color changes
watch(() => props.backgroundColor, (newColor) => {
  if (scene) {
    scene.background = new THREE.Color(newColor)
  }
})

// Lifecycle
onMounted(() => {
  initScene()
})

onUnmounted(() => {
  if (animationId) {
    cancelAnimationFrame(animationId)
  }
  
  if (renderer) {
    renderer.dispose()
  }
  
  if (scene) {
    scene.clear()
  }
})

// Expose methods for parent components
defineExpose({
  getScene: () => scene,
  getCamera: () => camera,
  getRenderer: () => renderer,
  updateSize: (width, height) => {
    updateCameraAspect()
    updateRendererSize()
  }
})
</script>

<style scoped>
.scene-renderer {
  position: relative;
  overflow: hidden;
}

.scene-renderer canvas {
  display: block;
}
</style>