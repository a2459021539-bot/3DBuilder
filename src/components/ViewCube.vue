<template>
  <div ref="containerRef" class="view-cube-container"></div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import * as THREE from 'three'

const containerRef = ref(null)
let scene = null
let camera = null
let renderer = null
let cube = null
let animationId = null

// 视角配置（使用合适的距离）
const viewDistance = 10
const viewConfigs = {
  front: { position: [0, 0, viewDistance], target: [0, 0, 0], label: '前' },
  back: { position: [0, 0, -viewDistance], target: [0, 0, 0], label: '后' },
  left: { position: [-viewDistance, 0, 0], target: [0, 0, 0], label: '左' },
  right: { position: [viewDistance, 0, 0], target: [0, 0, 0], label: '右' },
  top: { position: [0, viewDistance, 0], target: [0, 0, 0], label: '上' },
  bottom: { position: [0, -viewDistance, 0], target: [0, 0, 0], label: '下' }
}

const initViewCube = () => {
  const size = 150 // 容器大小
  const cubeSize = 2 // 立方体大小

  // 创建场景
  scene = new THREE.Scene()
  scene.background = new THREE.Color(0x1a1a1a)

  // 创建正交相机（用于小立方体）
  camera = new THREE.OrthographicCamera(-cubeSize, cubeSize, cubeSize, -cubeSize, 0.1, 10)
  camera.position.set(3, 3, 3)
  camera.lookAt(0, 0, 0)

  // 创建渲染器
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
  renderer.setSize(size, size)
  renderer.setPixelRatio(window.devicePixelRatio)
  containerRef.value.appendChild(renderer.domElement)

  // 创建立方体几何体
  const geometry = new THREE.BoxGeometry(cubeSize, cubeSize, cubeSize)

  // 创建材质（每个面不同颜色和文字）
  const materials = [
    createFaceMaterial('右', 0xff6b6b), // 右（X+）
    createFaceMaterial('左', 0x4ecdc4), // 左（X-）
    createFaceMaterial('上', 0x95e1d3), // 上（Y+）
    createFaceMaterial('下', 0xf38181), // 下（Y-）
    createFaceMaterial('前', 0xa8e6cf), // 前（Z+）
    createFaceMaterial('后', 0xffd3a5)   // 后（Z-）
  ]

  // 创建立方体
  cube = new THREE.Mesh(geometry, materials)
  scene.add(cube)

  // 添加边框
  const edges = new THREE.EdgesGeometry(geometry)
  const line = new THREE.LineSegments(
    edges,
    new THREE.LineBasicMaterial({ color: 0xffffff, linewidth: 2 })
  )
  cube.add(line)

  // 添加灯光
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.6)
  scene.add(ambientLight)
  const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8)
  directionalLight.position.set(5, 5, 5)
  scene.add(directionalLight)

  // 添加鼠标交互
  const raycaster = new THREE.Raycaster()
  const mouse = new THREE.Vector2()
  let hoveredFace = null

  const updateMousePosition = (event) => {
    const rect = renderer.domElement.getBoundingClientRect()
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1
  }

  const onMouseMove = (event) => {
    event.stopPropagation() // 阻止事件冒泡
    updateMousePosition(event)

    raycaster.setFromCamera(mouse, camera)
    const intersects = raycaster.intersectObject(cube)

    if (intersects.length > 0) {
      renderer.domElement.style.cursor = 'pointer'
      hoveredFace = intersects[0].face.materialIndex
      // 添加高亮效果
      if (cube.scale.x === 1) {
        cube.scale.set(1.05, 1.05, 1.05)
      }
    } else {
      renderer.domElement.style.cursor = 'default'
      hoveredFace = null
      cube.scale.set(1, 1, 1)
    }
  }

  const onMouseClick = (event) => {
    event.stopPropagation() // 阻止事件冒泡
    event.preventDefault() // 阻止默认行为
    updateMousePosition(event)

    raycaster.setFromCamera(mouse, camera)
    const intersects = raycaster.intersectObject(cube)

    console.log('点击检测:', {
      mouse: { x: mouse.x, y: mouse.y },
      intersects: intersects.length,
      faceIndex: intersects.length > 0 ? intersects[0].face.materialIndex : null
    })

    if (intersects.length > 0) {
      const faceIndex = intersects[0].face.materialIndex
      
      // 添加点击反馈动画
      const originalScale = cube.scale.clone()
      cube.scale.set(0.9, 0.9, 0.9)
      setTimeout(() => {
        cube.scale.copy(originalScale)
      }, 150)
      
      console.log('切换视角，面索引:', faceIndex)
      switchView(faceIndex)
    } else {
      console.log('未检测到点击')
    }
  }

  const onMouseLeave = () => {
    renderer.domElement.style.cursor = 'default'
    hoveredFace = null
    cube.scale.set(1, 1, 1)
  }

  // 直接在 canvas 上绑定事件，确保能正确捕获
  renderer.domElement.addEventListener('mousemove', onMouseMove)
  renderer.domElement.addEventListener('click', onMouseClick)
  renderer.domElement.addEventListener('mouseleave', onMouseLeave)
  
  // 确保 canvas 可以接收鼠标事件
  renderer.domElement.style.pointerEvents = 'auto'
  renderer.domElement.style.cursor = 'default'
  
  // 保存事件处理函数引用，用于清理
  const eventHandlers = {
    onMouseMove,
    onMouseClick,
    onMouseLeave
  }

  // 监听主场景相机变化，更新小立方体旋转
  const handleCameraUpdate = (event) => {
    if (cube) {
      const mainPosition = new THREE.Vector3(...event.detail.position)
      const mainTarget = new THREE.Vector3(...event.detail.target)
      
      // 计算主相机的方向向量（从目标指向相机）
      const direction = new THREE.Vector3()
        .subVectors(mainPosition, mainTarget)
        .normalize()
      
      // 让小立方体朝向主相机方向
      // 创建一个临时对象来设置lookAt的目标点
      const lookAtTarget = new THREE.Vector3(0, 0, 0).add(direction)
      cube.lookAt(lookAtTarget)
    }
  }

  window.addEventListener('camera-rotation-update', handleCameraUpdate)

  // 动画循环
  animate()

  // 清理函数
  return () => {
    if (renderer && renderer.domElement) {
      renderer.domElement.removeEventListener('mousemove', eventHandlers.onMouseMove)
      renderer.domElement.removeEventListener('click', eventHandlers.onMouseClick)
      renderer.domElement.removeEventListener('mouseleave', eventHandlers.onMouseLeave)
    }
    window.removeEventListener('camera-rotation-update', handleCameraUpdate)
  }
}

// 创建带文字的材质
const createFaceMaterial = (text, color) => {
  const canvas = document.createElement('canvas')
  const context = canvas.getContext('2d')
  canvas.width = 256
  canvas.height = 256

  // 绘制背景
  context.fillStyle = `rgba(${(color >> 16) & 0xff}, ${(color >> 8) & 0xff}, ${color & 0xff}, 0.8)`
  context.fillRect(0, 0, canvas.width, canvas.height)

  // 绘制边框
  context.strokeStyle = 'rgba(255, 255, 255, 0.5)'
  context.lineWidth = 4
  context.strokeRect(0, 0, canvas.width, canvas.height)

  // 绘制文字
  context.fillStyle = 'white'
  context.font = 'bold 80px Arial'
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  context.fillText(text, canvas.width / 2, canvas.height / 2)

  const texture = new THREE.CanvasTexture(canvas)
  texture.needsUpdate = true
  return new THREE.MeshBasicMaterial({ map: texture })
}

// 切换视角
const switchView = (faceIndex) => {
  // Three.js BoxGeometry 面的顺序：右(0), 左(1), 上(2), 下(3), 前(4), 后(5)
  const views = ['right', 'left', 'top', 'bottom', 'front', 'back']
  
  console.log('switchView 调用:', { faceIndex, views })
  
  if (faceIndex >= 0 && faceIndex < views.length) {
    const viewName = views[faceIndex]
    const config = viewConfigs[viewName]

    console.log('视角配置:', { viewName, config })

    if (config) {
      // 发送视角切换事件
      const event = new CustomEvent('switch-view', {
        detail: {
          position: config.position,
          target: config.target
        }
      })
      console.log('发送事件:', event)
      window.dispatchEvent(event)
    } else {
      console.error('未找到视角配置:', viewName)
    }
  } else {
    console.error('无效的面索引:', faceIndex)
  }
}

const animate = () => {
  animationId = requestAnimationFrame(animate)
  if (renderer && scene && camera) {
    renderer.render(scene, camera)
  }
}

let cleanup = null

onMounted(() => {
  cleanup = initViewCube()
})

onUnmounted(() => {
  if (cleanup) {
    cleanup()
  }
  if (animationId) {
    cancelAnimationFrame(animationId)
  }
  if (renderer) {
    renderer.dispose()
    if (containerRef.value && renderer.domElement) {
      containerRef.value.removeChild(renderer.domElement)
    }
  }
})
</script>

<style scoped>
.view-cube-container {
  position: absolute;
  top: 80px;
  right: 20px;
  width: 150px;
  height: 150px;
  background: rgba(0, 0, 0, 0.6);
  border-radius: 8px;
  border: 2px solid rgba(255, 255, 255, 0.2);
  overflow: visible; /* 改为 visible，确保可以点击 */
  cursor: pointer;
  z-index: 1000; /* 提高 z-index，确保在最上层 */
  backdrop-filter: blur(10px);
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.3);
  pointer-events: auto; /* 确保可以接收鼠标事件 */
  user-select: none; /* 防止文本选择 */
}

.view-cube-container canvas {
  display: block;
  width: 100%;
  height: 100%;
  pointer-events: auto; /* 确保 canvas 可以接收鼠标事件 */
}

.view-cube-container:hover {
  border-color: rgba(74, 158, 255, 0.6);
  box-shadow: 0 0 10px rgba(74, 158, 255, 0.3);
}
</style>

