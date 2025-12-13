<template>
  <div class="scene-interaction">
    <!-- 交互组件不需要可见的模板，主要处理鼠标和键盘交互 -->
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import * as THREE from 'three'

// Props
const props = defineProps({
  camera: Object,
  renderer: Object,
  scene: Object,
  controls: Object
})

// Emits
const emit = defineEmits([
  'object-selected',
  'object-deselected', 
  'drag-start',
  'drag-move',
  'drag-end',
  'click',
  'double-click'
])

// Interaction state
const raycaster = new THREE.Raycaster()
const pointer = new THREE.Vector2()
let isDragging = false
let draggedObject = null
let dragStartPoint = new THREE.Vector3()

// Mouse event handlers
const onMouseDown = (event) => {
  if (!props.camera || !props.renderer) return

  updatePointer(event)
  raycaster.setFromCamera(pointer, props.camera)

  const intersects = raycaster.intersectObjects(props.scene?.children || [], true)
  
  if (intersects.length > 0) {
    const clickedObject = intersects[0].object
    
    emit('object-selected', {
      object: clickedObject,
      point: intersects[0].point,
      face: intersects[0].face,
      distance: intersects[0].distance
    })

    // Start dragging if object is draggable
    if (clickedObject.userData?.draggable) {
      isDragging = true
      draggedObject = clickedObject
      dragStartPoint.copy(intersects[0].point)
      
      emit('drag-start', {
        object: clickedObject,
        startPoint: dragStartPoint.clone()
      })
    }
  }
}

const onMouseMove = (event) => {
  updatePointer(event)

  if (isDragging && draggedObject && props.camera) {
    raycaster.setFromCamera(pointer, props.camera)
    
    // Create a plane for dragging
    const plane = new THREE.Plane()
    const cameraDirection = new THREE.Vector3()
    props.camera.getWorldDirection(cameraDirection)
    plane.setFromNormalAndCoplanarPoint(cameraDirection, dragStartPoint)
    
    const intersection = new THREE.Vector3()
    raycaster.ray.intersectPlane(plane, intersection)
    
    if (intersection) {
      emit('drag-move', {
        object: draggedObject,
        currentPoint: intersection.clone(),
        startPoint: dragStartPoint.clone(),
        delta: intersection.clone().sub(dragStartPoint)
      })
    }
  }
}

const onMouseUp = (event) => {
  if (isDragging && draggedObject) {
    emit('drag-end', {
      object: draggedObject,
      endPoint: dragStartPoint.clone()
    })
  }

  isDragging = false
  draggedObject = null
}

const onClick = (event) => {
  updatePointer(event)
  
  emit('click', {
    pointer: { x: pointer.x, y: pointer.y },
    clientX: event.clientX,
    clientY: event.clientY
  })
}

const onDoubleClick = (event) => {
  updatePointer(event)
  
  emit('double-click', {
    pointer: { x: pointer.x, y: pointer.y },
    clientX: event.clientX,
    clientY: event.clientY
  })
}

// Update pointer coordinates
const updatePointer = (event) => {
  if (!props.renderer) return

  const rect = props.renderer.domElement.getBoundingClientRect()
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1
}

// Setup event listeners
const setupEventListeners = () => {
  if (!props.renderer?.domElement) return

  const canvas = props.renderer.domElement
  canvas.addEventListener('mousedown', onMouseDown)
  canvas.addEventListener('mousemove', onMouseMove)
  canvas.addEventListener('mouseup', onMouseUp)
  canvas.addEventListener('click', onClick)
  canvas.addEventListener('dblclick', onDoubleClick)
}

// Remove event listeners
const removeEventListeners = () => {
  if (!props.renderer?.domElement) return

  const canvas = props.renderer.domElement
  canvas.removeEventListener('mousedown', onMouseDown)
  canvas.removeEventListener('mousemove', onMouseMove)
  canvas.removeEventListener('mouseup', onMouseUp)
  canvas.removeEventListener('click', onClick)
  canvas.removeEventListener('dblclick', onDoubleClick)
}

// Public methods
const getIntersectedObjects = (recursive = true) => {
  if (!props.camera || !props.scene) return []
  
  raycaster.setFromCamera(pointer, props.camera)
  return raycaster.intersectObjects(props.scene.children, recursive)
}

const selectObject = (object) => {
  emit('object-selected', { object })
}

const deselectObject = (object) => {
  emit('object-deselected', { object })
}

// Lifecycle
onMounted(() => {
  setupEventListeners()
})

onUnmounted(() => {
  removeEventListeners()
})

// Expose methods
defineExpose({
  getIntersectedObjects,
  selectObject,
  deselectObject,
  updatePointer
})
</script>

<style scoped>
.scene-interaction {
  display: none; /* 这个组件主要处理逻辑，不需要可见元素 */
}
</style>