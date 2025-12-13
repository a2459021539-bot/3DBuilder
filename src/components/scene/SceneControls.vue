<template>
  <div class="scene-controls">
    <!-- 控制器组件不需要可见的模板，主要处理相机控制逻辑 -->
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch } from 'vue'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { TransformControls } from 'three/addons/controls/TransformControls.js'

// Props
const props = defineProps({
  camera: {
    type: Object,
    required: true
  },
  renderer: {
    type: Object,
    required: true
  },
  scene: {
    type: Object,
    required: true
  },
  enableDamping: {
    type: Boolean,
    default: true
  },
  dampingFactor: {
    type: Number,
    default: 0.05
  },
  panSpeed: {
    type: Number,
    default: 0.8
  },
  rotationSnapStep: {
    type: Number,
    default: THREE.MathUtils.degToRad(5)
  }
})

// Emits
const emit = defineEmits([
  'controls-ready',
  'camera-change',
  'transform-start',
  'transform-end',
  'object-attached',
  'object-detached'
])

// Controls
let orbitControls = null
let transformControls = null
let isPerspective = ref(true)

// Initialize controls
const initControls = () => {
  if (!props.camera || !props.renderer) return

  // Initialize orbit controls
  orbitControls = new OrbitControls(props.camera, props.renderer.domElement)
  orbitControls.enableDamping = props.enableDamping
  orbitControls.dampingFactor = props.dampingFactor
  orbitControls.panSpeed = props.panSpeed

  // Configure mouse buttons
  orbitControls.mouseButtons = {
    LEFT: THREE.MOUSE.ROTATE,    // 左键旋转
    MIDDLE: THREE.MOUSE.DOLLY,   // 中键缩放
    RIGHT: THREE.MOUSE.PAN       // 右键平移
  }

  // Initialize transform controls
  transformControls = new TransformControls(props.camera, props.renderer.domElement)
  transformControls.setMode('rotate')
  transformControls.setSpace('local')
  transformControls.setRotationSnap(props.rotationSnapStep)
  transformControls.size = 0.9
  transformControls.visible = false
  transformControls.enabled = false
  
  if (props.scene) {
    props.scene.add(transformControls)
  }

  // Setup transform control events
  setupTransformEvents()

  // Emit ready event
  emit('controls-ready', { orbitControls, transformControls })
}

// Setup transform control events
const setupTransformEvents = () => {
  if (!transformControls) return

  // Handle dragging state changes
  transformControls.addEventListener('dragging-changed', (event) => {
    if (orbitControls) {
      orbitControls.enabled = !event.value
    }
  })

  // Handle transform start
  transformControls.addEventListener('mouseDown', () => {
    emit('transform-start', {
      object: transformControls.object,
      mode: transformControls.getMode()
    })
  })

  // Handle transform end
  transformControls.addEventListener('mouseUp', () => {
    emit('transform-end', {
      object: transformControls.object,
      mode: transformControls.getMode()
    })
  })

  // Handle object changes during transform
  transformControls.addEventListener('objectChange', () => {
    emit('camera-change', {
      object: transformControls.object,
      mode: transformControls.getMode()
    })
  })
}

// Update controls in animation loop
const updateControls = () => {
  if (orbitControls && orbitControls.enableDamping) {
    orbitControls.update()
  }
}

// Switch camera type
const switchCamera = () => {
  if (!props.camera || !orbitControls || !props.renderer) return

  // Save current camera state
  const position = props.camera.position.clone()
  const target = orbitControls.target.clone()
  const zoom = props.camera.zoom || 1
  const quaternion = props.camera.quaternion.clone()

  // Create new camera
  let newCamera
  if (isPerspective.value) {
    // Switch to orthographic camera
    const aspect = props.renderer.domElement.width / props.renderer.domElement.height
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
    isPerspective.value = false
  } else {
    // Switch to perspective camera
    newCamera = new THREE.PerspectiveCamera(
      75,
      props.renderer.domElement.width / props.renderer.domElement.height,
      0.1,
      10000
    )
    newCamera.position.copy(position)
    newCamera.quaternion.copy(quaternion)
    newCamera.updateProjectionMatrix()
    isPerspective.value = true
  }

  // Update controls
  orbitControls.object = newCamera
  orbitControls.target.copy(target)
  transformControls.camera = newCamera
  
  // Force update
  orbitControls.update()

  emit('camera-change', { 
    camera: newCamera, 
    type: isPerspective.value ? 'perspective' : 'orthographic' 
  })

  return newCamera
}

// Reset camera position
const resetCamera = () => {
  if (!props.camera || !orbitControls) return

  props.camera.position.set(0, 0, 5)
  orbitControls.target.set(0, 0, 0)
  orbitControls.update()

  emit('camera-change', { camera: props.camera, action: 'reset' })
}

// Attach object to transform controls
const attachObject = (object) => {
  if (!transformControls || !object) return

  transformControls.attach(object)
  transformControls.visible = true
  transformControls.enabled = true

  emit('object-attached', { object })
}

// Detach object from transform controls
const detachObject = () => {
  if (!transformControls) return

  const object = transformControls.object
  transformControls.detach()
  transformControls.visible = false
  transformControls.enabled = false

  emit('object-detached', { object })
}

// Set transform mode
const setTransformMode = (mode) => {
  if (!transformControls) return
  
  transformControls.setMode(mode)
}

// Set transform space
const setTransformSpace = (space) => {
  if (!transformControls) return
  
  transformControls.setSpace(space)
}

// Watch for camera changes
watch(() => props.camera, (newCamera) => {
  if (orbitControls && newCamera) {
    orbitControls.object = newCamera
  }
  if (transformControls && newCamera) {
    transformControls.camera = newCamera
  }
})

// Lifecycle
onMounted(() => {
  initControls()
})

onUnmounted(() => {
  if (orbitControls) {
    orbitControls.dispose()
  }
  
  if (transformControls && props.scene) {
    props.scene.remove(transformControls)
    transformControls.dispose()
  }
})

// Expose methods
defineExpose({
  updateControls,
  switchCamera,
  resetCamera,
  attachObject,
  detachObject,
  setTransformMode,
  setTransformSpace,
  getOrbitControls: () => orbitControls,
  getTransformControls: () => transformControls,
  isPerspective: () => isPerspective.value
})
</script>

<style scoped>
.scene-controls {
  display: none; /* 这个组件主要处理逻辑，不需要可见元素 */
}
</style>