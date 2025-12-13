<template>
  <div class="scene-objects">
    <!-- 对象管理组件不需要可见的模板，主要处理3D对象的管理 -->
  </div>
</template>

<script setup>
import { ref, watch } from 'vue'
import * as THREE from 'three'
import { createPipeObject } from '../../utils/pipeFactory.js'

// Props
const props = defineProps({
  scene: Object,
  objects: {
    type: Array,
    default: () => []
  }
})

// Emits
const emit = defineEmits([
  'object-added',
  'object-removed',
  'object-updated',
  'objects-cleared'
])

// Object management
const sceneObjects = ref(new Map()) // Map<id, THREE.Object3D>

// Add object to scene
const addObject = (objectData) => {
  if (!props.scene) return null

  let object3D = null

  // Create object based on type
  if (objectData.type === 'pipe') {
    object3D = createPipeObject(objectData.params, objectData.id)
  } else if (objectData.type === 'group') {
    object3D = new THREE.Group()
  } else if (objectData.type === 'mesh') {
    // Create mesh from geometry and material data
    const geometry = createGeometry(objectData.geometry)
    const material = createMaterial(objectData.material)
    object3D = new THREE.Mesh(geometry, material)
  }

  if (!object3D) return null

  // Set object properties
  if (objectData.position) {
    object3D.position.set(objectData.position.x, objectData.position.y, objectData.position.z)
  }
  if (objectData.rotation) {
    object3D.rotation.set(objectData.rotation.x, objectData.rotation.y, objectData.rotation.z)
  }
  if (objectData.scale) {
    object3D.scale.set(objectData.scale.x, objectData.scale.y, objectData.scale.z)
  }

  // Set user data
  object3D.userData = { ...objectData.userData, id: objectData.id }

  // Enable shadows if needed
  if (objectData.castShadow || objectData.receiveShadow) {
    enableShadows(object3D, objectData.castShadow, objectData.receiveShadow)
  }

  // Add to scene and track
  props.scene.add(object3D)
  sceneObjects.value.set(objectData.id, object3D)

  emit('object-added', { id: objectData.id, object: object3D, data: objectData })
  
  return object3D
}

// Remove object from scene
const removeObject = (id) => {
  const object = sceneObjects.value.get(id)
  if (!object || !props.scene) return false

  // Remove from scene
  props.scene.remove(object)

  // Dispose of resources
  disposeObject(object)

  // Remove from tracking
  sceneObjects.value.delete(id)

  emit('object-removed', { id, object })
  
  return true
}

// Update object properties
const updateObject = (id, updates) => {
  const object = sceneObjects.value.get(id)
  if (!object) return false

  // Update position
  if (updates.position) {
    object.position.set(updates.position.x, updates.position.y, updates.position.z)
  }

  // Update rotation
  if (updates.rotation) {
    object.rotation.set(updates.rotation.x, updates.rotation.y, updates.rotation.z)
  }

  // Update scale
  if (updates.scale) {
    object.scale.set(updates.scale.x, updates.scale.y, updates.scale.z)
  }

  // Update user data
  if (updates.userData) {
    object.userData = { ...object.userData, ...updates.userData }
  }

  emit('object-updated', { id, object, updates })
  
  return true
}

// Get object by id
const getObject = (id) => {
  return sceneObjects.value.get(id)
}

// Get all objects
const getAllObjects = () => {
  return Array.from(sceneObjects.value.values())
}

// Clear all objects
const clearAllObjects = () => {
  sceneObjects.value.forEach((object, id) => {
    if (props.scene) {
      props.scene.remove(object)
    }
    disposeObject(object)
  })
  
  sceneObjects.value.clear()
  emit('objects-cleared')
}

// Enable shadows for object
const enableShadows = (object, castShadow = true, receiveShadow = true) => {
  object.traverse((child) => {
    if (child.isMesh) {
      child.castShadow = castShadow
      child.receiveShadow = receiveShadow
    }
  })
}

// Dispose of object resources
const disposeObject = (object) => {
  object.traverse((child) => {
    if (child.geometry) {
      child.geometry.dispose()
    }
    if (child.material) {
      if (Array.isArray(child.material)) {
        child.material.forEach(material => material.dispose())
      } else {
        child.material.dispose()
      }
    }
  })
}

// Create geometry from data
const createGeometry = (geometryData) => {
  switch (geometryData.type) {
    case 'box':
      return new THREE.BoxGeometry(
        geometryData.width || 1,
        geometryData.height || 1,
        geometryData.depth || 1
      )
    case 'sphere':
      return new THREE.SphereGeometry(
        geometryData.radius || 1,
        geometryData.widthSegments || 32,
        geometryData.heightSegments || 16
      )
    case 'cylinder':
      return new THREE.CylinderGeometry(
        geometryData.radiusTop || 1,
        geometryData.radiusBottom || 1,
        geometryData.height || 1,
        geometryData.radialSegments || 32
      )
    default:
      return new THREE.BoxGeometry(1, 1, 1)
  }
}

// Create material from data
const createMaterial = (materialData) => {
  const params = {
    color: materialData.color || 0xffffff,
    transparent: materialData.transparent || false,
    opacity: materialData.opacity || 1
  }

  switch (materialData.type) {
    case 'basic':
      return new THREE.MeshBasicMaterial(params)
    case 'standard':
      return new THREE.MeshStandardMaterial({
        ...params,
        metalness: materialData.metalness || 0,
        roughness: materialData.roughness || 1
      })
    case 'phong':
      return new THREE.MeshPhongMaterial(params)
    default:
      return new THREE.MeshStandardMaterial(params)
  }
}

// Watch for objects prop changes
watch(() => props.objects, (newObjects, oldObjects) => {
  // Handle objects array changes
  if (!newObjects) return

  // Get current object IDs
  const currentIds = new Set(sceneObjects.value.keys())
  const newIds = new Set(newObjects.map(obj => obj.id))

  // Remove objects that are no longer in the array
  currentIds.forEach(id => {
    if (!newIds.has(id)) {
      removeObject(id)
    }
  })

  // Add or update objects
  newObjects.forEach(objectData => {
    if (sceneObjects.value.has(objectData.id)) {
      // Update existing object
      updateObject(objectData.id, objectData)
    } else {
      // Add new object
      addObject(objectData)
    }
  })
}, { deep: true })

// Expose methods
defineExpose({
  addObject,
  removeObject,
  updateObject,
  getObject,
  getAllObjects,
  clearAllObjects,
  enableShadows,
  getSceneObjects: () => sceneObjects.value
})
</script>

<style scoped>
.scene-objects {
  display: none; /* 这个组件主要处理逻辑，不需要可见元素 */
}
</style>