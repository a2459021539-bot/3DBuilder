<template>
  <div class="scene-grid">
    <!-- 网格组件不需要可见的模板，主要处理网格和坐标系的创建 -->
  </div>
</template>

<script setup>
import { onMounted, watch } from 'vue'
import * as THREE from 'three'

// Props
const props = defineProps({
  scene: {
    type: Object,
    required: true
  },
  gridSize: {
    type: Number,
    default: 100
  },
  divisions: {
    type: Number,
    default: 100
  },
  axisLength: {
    type: Number,
    default: 20
  },
  showGrid: {
    type: Boolean,
    default: true
  },
  showAxes: {
    type: Boolean,
    default: true
  },
  showLabels: {
    type: Boolean,
    default: true
  }
})

// Emits
const emit = defineEmits([
  'grid-created',
  'axes-created',
  'labels-created'
])

// Grid objects
let gridObjects = []
let axesHelper = null
let labelObjects = []

// Create text texture for labels
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

// Create custom grid system
const createCustomGrid = () => {
  if (!props.scene || !props.showGrid) return

  // Clear existing grids
  clearGrids()

  const { gridSize, divisions } = props
  
  // 1mm fine grid lines (light gray, thin lines)
  const grid1mm = new THREE.GridHelper(gridSize, divisions, 0x444444, 0x333333)
  grid1mm.material.opacity = 0.3
  grid1mm.material.transparent = true
  props.scene.add(grid1mm)
  gridObjects.push(grid1mm)
  
  // 5mm medium grid lines (medium gray, slightly thicker)
  const grid5mm = new THREE.GridHelper(gridSize, divisions / 5, 0x666666, 0x555555)
  grid5mm.material.opacity = 0.5
  grid5mm.material.transparent = true
  props.scene.add(grid5mm)
  gridObjects.push(grid5mm)
  
  // 10mm thick grid lines (bright gray, thick lines)
  const grid10mm = new THREE.GridHelper(gridSize, divisions / 10, 0x888888, 0x777777)
  grid10mm.material.opacity = 0.7
  grid10mm.material.transparent = true
  props.scene.add(grid10mm)
  gridObjects.push(grid10mm)

  // Add 10mm annotation text (on X and Z axes)
  createGridLabels()

  // Add 5mm special markers (short line markers, more obvious)
  createGridMarkers()

  emit('grid-created', { gridObjects })
}

// Create grid labels
const createGridLabels = () => {
  if (!props.showLabels) return

  const { gridSize } = props
  const step = 10 // 10mm per annotation

  // X-axis positive direction annotations
  for (let i = step; i <= gridSize / 2; i += step) {
    if (i % 10 === 0) {
      const texture = createTextTexture(`${i}mm`)
      const spriteMaterial = new THREE.SpriteMaterial({ map: texture })
      const sprite = new THREE.Sprite(spriteMaterial)
      sprite.position.set(i, 0.1, 0)
      sprite.scale.set(4, 1, 1)
      props.scene.add(sprite)
      labelObjects.push(sprite)
    }
  }
  
  // X-axis negative direction annotations
  for (let i = -step; i >= -gridSize / 2; i -= step) {
    if (i % 10 === 0) {
      const texture = createTextTexture(`${Math.abs(i)}mm`)
      const spriteMaterial = new THREE.SpriteMaterial({ map: texture })
      const sprite = new THREE.Sprite(spriteMaterial)
      sprite.position.set(i, 0.1, 0)
      sprite.scale.set(4, 1, 1)
      props.scene.add(sprite)
      labelObjects.push(sprite)
    }
  }
  
  // Z-axis positive direction annotations
  for (let i = step; i <= gridSize / 2; i += step) {
    if (i % 10 === 0) {
      const texture = createTextTexture(`${i}mm`)
      const spriteMaterial = new THREE.SpriteMaterial({ map: texture })
      const sprite = new THREE.Sprite(spriteMaterial)
      sprite.position.set(0, 0.1, i)
      sprite.scale.set(4, 1, 1)
      sprite.rotation.y = Math.PI / 2
      props.scene.add(sprite)
      labelObjects.push(sprite)
    }
  }
  
  // Z-axis negative direction annotations
  for (let i = -step; i >= -gridSize / 2; i -= step) {
    if (i % 10 === 0) {
      const texture = createTextTexture(`${Math.abs(i)}mm`)
      const spriteMaterial = new THREE.SpriteMaterial({ map: texture })
      const sprite = new THREE.Sprite(spriteMaterial)
      sprite.position.set(0, 0.1, i)
      sprite.scale.set(4, 1, 1)
      sprite.rotation.y = Math.PI / 2
      props.scene.add(sprite)
      labelObjects.push(sprite)
    }
  }
}

// Create grid markers
const createGridMarkers = () => {
  const { gridSize } = props

  // Add 5mm special markers (short line markers, more obvious)
  for (let i = -gridSize / 2; i <= gridSize / 2; i += 5) {
    if (i % 10 !== 0 && i !== 0) {
      // Add 5mm markers on X-axis (lines perpendicular to X-axis)
      const markerXGeometry = new THREE.BoxGeometry(0.15, 0.02, 1)
      const markerX = new THREE.Mesh(
        markerXGeometry,
        new THREE.MeshBasicMaterial({ color: 0xaaaaaa })
      )
      markerX.position.set(i, 0.05, 0)
      props.scene.add(markerX)
      gridObjects.push(markerX)
      
      // Add 5mm markers on Z-axis (lines perpendicular to Z-axis)
      const markerZGeometry = new THREE.BoxGeometry(1, 0.02, 0.15)
      const markerZ = new THREE.Mesh(
        markerZGeometry,
        new THREE.MeshBasicMaterial({ color: 0xaaaaaa })
      )
      markerZ.position.set(0, 0.05, i)
      props.scene.add(markerZ)
      gridObjects.push(markerZ)
    }
  }
}

// Add coordinate axes
const addAxes = () => {
  if (!props.scene || !props.showAxes) return

  // Clear existing axes
  clearAxes()

  // Add axes helper (enlarged length to make it more obvious)
  axesHelper = new THREE.AxesHelper(props.axisLength)
  props.scene.add(axesHelper)
  
  // Add axis labels
  addAxisLabels()

  emit('axes-created', { axesHelper })
}

// Add axis labels
const addAxisLabels = () => {
  if (!props.showLabels) return

  const { axisLength } = props
  const labelOffset = 2 // Distance from axis end to label
  
  // X-axis label (red)
  const xTexture = createTextTexture('X', 48, 'rgba(255, 0, 0, 1)')
  const xSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: xTexture }))
  xSprite.position.set(axisLength + labelOffset, 0, 0)
  xSprite.scale.set(3, 1.5, 1)
  props.scene.add(xSprite)
  labelObjects.push(xSprite)
  
  // Y-axis label (green)
  const yTexture = createTextTexture('Y', 48, 'rgba(0, 255, 0, 1)')
  const ySprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: yTexture }))
  ySprite.position.set(0, axisLength + labelOffset, 0)
  ySprite.scale.set(3, 1.5, 1)
  props.scene.add(ySprite)
  labelObjects.push(ySprite)
  
  // Z-axis label (blue)
  const zTexture = createTextTexture('Z', 48, 'rgba(0, 100, 255, 1)')
  const zSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: zTexture }))
  zSprite.position.set(0, 0, axisLength + labelOffset)
  zSprite.scale.set(3, 1.5, 1)
  props.scene.add(zSprite)
  labelObjects.push(zSprite)

  emit('labels-created', { labelObjects })
}

// Clear grids
const clearGrids = () => {
  gridObjects.forEach(obj => {
    if (props.scene) {
      props.scene.remove(obj)
    }
    if (obj.geometry) obj.geometry.dispose()
    if (obj.material) obj.material.dispose()
  })
  gridObjects = []
}

// Clear axes
const clearAxes = () => {
  if (axesHelper && props.scene) {
    props.scene.remove(axesHelper)
    axesHelper.dispose()
    axesHelper = null
  }
}

// Clear labels
const clearLabels = () => {
  labelObjects.forEach(obj => {
    if (props.scene) {
      props.scene.remove(obj)
    }
    if (obj.material && obj.material.map) {
      obj.material.map.dispose()
    }
    if (obj.material) obj.material.dispose()
  })
  labelObjects = []
}

// Initialize grid and axes
const initGridAndAxes = () => {
  if (props.showGrid) {
    createCustomGrid()
  }
  if (props.showAxes) {
    addAxes()
  }
}

// Watch for prop changes
watch(() => props.showGrid, (newValue) => {
  if (newValue) {
    createCustomGrid()
  } else {
    clearGrids()
  }
})

watch(() => props.showAxes, (newValue) => {
  if (newValue) {
    addAxes()
  } else {
    clearAxes()
  }
})

watch(() => props.showLabels, () => {
  clearLabels()
  if (props.showLabels) {
    if (props.showGrid) {
      createGridLabels()
    }
    if (props.showAxes) {
      addAxisLabels()
    }
  }
})

watch(() => [props.gridSize, props.divisions], () => {
  if (props.showGrid) {
    createCustomGrid()
  }
})

watch(() => props.axisLength, () => {
  if (props.showAxes) {
    addAxes()
  }
})

// Lifecycle
onMounted(() => {
  if (props.scene) {
    initGridAndAxes()
  }
})

// Expose methods
defineExpose({
  createCustomGrid,
  addAxes,
  clearGrids,
  clearAxes,
  clearLabels,
  getGridObjects: () => gridObjects,
  getAxesHelper: () => axesHelper,
  getLabelObjects: () => labelObjects
})
</script>

<style scoped>
.scene-grid {
  display: none; /* 这个组件主要处理逻辑，不需要可见元素 */
}
</style>