<template>
  <div class="sketch-container">
    <!-- 工具栏 -->
    <div class="sketch-toolbar">
      <button 
        :class="['tool-btn', { active: drawMode === 'line' }]"
        @click="drawMode = 'line'"
        title="直线模式"
      >
        {{ getActionIcon('line') }} 直线
      </button>
      <button 
        :class="['tool-btn', { active: drawMode === 'arc' }]"
        @click="drawMode = 'arc'"
        title="圆弧模式"
      >
        {{ getActionIcon('arc') }} 圆弧
      </button>
      <button 
        class="tool-btn"
        @click="clearSketch"
        title="清除"
      >
        {{ getActionIcon('clear') }} 清除
      </button>
    </div>
    
    <!-- Canvas绘制区域 -->
    <div class="canvas-wrapper">
      <canvas 
        ref="canvasRef" 
        @mousedown="handleMouseDown"
        @mousemove="handleMouseMove"
        @mouseup="handleMouseUp"
        @mouseleave="handleMouseLeave"
        @click="handleClick"
        @wheel="handleWheel"
        @contextmenu.prevent
      ></canvas>
    </div>
    
    <!-- 直线长度和角度输入框 -->
    <div v-if="showLengthInput" class="input-overlay">
      <div class="param-row">
        <label>长度 (mm):</label>
        <input 
          type="number" 
          v-model.number="currentLength" 
          @input="updateLineFromLengthAndAngle"
          @keyup.enter="confirmLine"
          @wheel.prevent="handleLengthInputWheel"
          step="0.1"
          min="0"
          autofocus
        />
      </div>
      <div class="param-row">
        <label>角度 (°):</label>
        <input 
          type="number" 
          v-model.number="currentAngle" 
          @input="updateLineFromLengthAndAngle"
          @keyup.enter="confirmLine"
          @wheel.prevent="handleAngleInputWheel"
          step="0.1"
        />
      </div>
      <div class="param-row">
        <button class="confirm-btn" @click="confirmLine">确定</button>
      </div>
    </div>
    
    <!-- 圆弧参数输入框 -->
    <div v-if="showArcParams" class="input-overlay arc-params">
      <div class="param-row">
        <label>半径 (mm):</label>
        <input 
          type="number" 
          v-model.number="arcRadius" 
          @input="updateArcRadius"
          step="0.1"
          min="0"
        />
      </div>
      <div class="param-row">
        <label>方向:</label>
        <button 
          :class="['dir-btn', { active: arcClockwise }]"
          @click="arcClockwise = true; updateArcDirection()"
        >
          顺时针
        </button>
        <button 
          :class="['dir-btn', { active: !arcClockwise }]"
          @click="arcClockwise = false; updateArcDirection()"
        >
          逆时针
        </button>
      </div>
      <div class="param-row">
        <label>角度 (°):</label>
        <input 
          type="number" 
          v-model.number="arcAngle" 
          @input="updateArcAngle"
          @keyup.enter="confirmArc"
          @blur="hideArcParams"
          step="1"
          min="0"
          max="360"
        />
      </div>
      <div class="param-row">
        <button class="confirm-btn" @click="confirmArc">确定</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch, nextTick } from 'vue'
import { getActionIcon } from '../config/icons.js'

const props = defineProps({
  initialPathData: {
    type: Object,
    default: null
  },
  initialScale: {
    type: Number,
    default: 2 // 默认放大2倍
  }
})

const emit = defineEmits(['path-updated'])

const canvasRef = ref(null)
const drawMode = ref('line') // 'line' 或 'arc'
const scale = ref(1) // 缩放比例：1像素 = 1mm
const offsetX = ref(0) // 画布偏移X
const offsetY = ref(0) // 画布偏移Y

// 右键拖拽状态
const isDragging = ref(false)
const dragStartX = ref(0)
const dragStartY = ref(0)
const dragStartOffsetX = ref(0)
const dragStartOffsetY = ref(0)

// 路径数据
const pathSegments = ref([])

// 直线绘制状态
const lineStartPoint = ref(null)
const lineEndPoint = ref(null)
const showLengthInput = ref(false)
const currentLength = ref(0)
const currentAngle = ref(0) // 角度（度）
const tempLineEnd = ref(null)

// 圆弧绘制状态
const arcStartPoint = ref(null)
const arcCenter = ref(null)
const tempArcCenter = ref(null) // 临时圆心（鼠标移动时）
const arcRadius = ref(0)
const arcAngle = ref(90)
const arcClockwise = ref(false)
const showArcParams = ref(false)
const arcState = ref('start') // 'start', 'center', 'complete'

// 鼠标吸附位置
const snapPosition = ref(null) // { x, y } 世界坐标

let ctx = null
let canvas = null

// 初始化Canvas
const initCanvas = () => {
  canvas = canvasRef.value
  if (!canvas) return
  
  ctx = canvas.getContext('2d')
  
  // 设置Canvas尺寸
  const resizeCanvas = () => {
    const container = canvas.parentElement
    const dpr = window.devicePixelRatio || 1
    const rect = container.getBoundingClientRect()
    
    // 设置实际像素尺寸（考虑设备像素比）
    canvas.width = rect.width * dpr
    canvas.height = rect.height * dpr
    
    // 设置CSS显示尺寸
    canvas.style.width = rect.width + 'px'
    canvas.style.height = rect.height + 'px'
    
    // 缩放上下文以匹配设备像素比
    ctx.scale(dpr, dpr)
    
    // 设置画布中心为原点（使用CSS尺寸）
    offsetX.value = rect.width / 2
    offsetY.value = rect.height / 2
    
    redraw()
  }
  
  resizeCanvas()
  window.addEventListener('resize', resizeCanvas)
  
  return () => {
    window.removeEventListener('resize', resizeCanvas)
  }
}

// 网格吸附（1mm间距）
const snapToGrid = (worldX, worldY) => {
  const gridSize = 1 // 1mm
  const snappedX = Math.round(worldX / gridSize) * gridSize
  const snappedY = Math.round(worldY / gridSize) * gridSize
  return { x: snappedX, y: snappedY }
}

// Canvas坐标转世界坐标（mm）
const canvasToWorld = (canvasX, canvasY) => {
  const worldX = (canvasX - offsetX.value) / scale.value
  const worldY = -(canvasY - offsetY.value) / scale.value // Y轴翻转
  return { x: worldX, y: worldY }
}

// 世界坐标转Canvas坐标
const worldToCanvas = (worldX, worldY) => {
  const canvasX = worldX * scale.value + offsetX.value
  const canvasY = -worldY * scale.value + offsetY.value // Y轴翻转
  return { x: canvasX, y: canvasY }
}

// 绘制网格
const drawGrid = () => {
  if (!ctx || !canvas) return
  
  // 使用CSS尺寸而不是实际像素尺寸（因为已经scale了）
  const rect = canvas.getBoundingClientRect()
  const width = rect.width
  const height = rect.height
  
  // 计算可见范围（mm）
  // X轴：canvasX = worldX * scale + offsetX
  const minX = -offsetX.value / scale.value
  const maxX = (width - offsetX.value) / scale.value
  
  // Y轴翻转：canvasY = -worldY * scale + offsetY
  // 所以 worldY = -(canvasY - offsetY) / scale
  // 顶部（canvasY=0）对应 worldY = offsetY / scale（最大值）
  // 底部（canvasY=height）对应 worldY = -(height - offsetY) / scale（最小值）
  const maxY = offsetY.value / scale.value  // 顶部
  const minY = -(height - offsetY.value) / scale.value  // 底部
  
  ctx.strokeStyle = '#333333'
  ctx.lineWidth = 0.5
  
  // 1mm细网格
  ctx.strokeStyle = '#444444'
  ctx.lineWidth = 0.5
  for (let x = Math.floor(minX); x <= Math.ceil(maxX); x++) {
    const canvasX = worldToCanvas(x, 0).x
    ctx.beginPath()
    ctx.moveTo(canvasX, 0)
    ctx.lineTo(canvasX, height)
    ctx.stroke()
  }
  for (let y = Math.floor(minY); y <= Math.ceil(maxY); y++) {
    const canvasY = worldToCanvas(0, y).y
    ctx.beginPath()
    ctx.moveTo(0, canvasY)
    ctx.lineTo(width, canvasY)
    ctx.stroke()
  }
  
  // 5mm中等网格
  ctx.strokeStyle = '#666666'
  ctx.lineWidth = 1
  for (let x = Math.floor(minX / 5) * 5; x <= Math.ceil(maxX / 5) * 5; x += 5) {
    if (x % 10 !== 0) {
      const canvasX = worldToCanvas(x, 0).x
      ctx.beginPath()
      ctx.moveTo(canvasX, 0)
      ctx.lineTo(canvasX, height)
      ctx.stroke()
    }
  }
  for (let y = Math.floor(minY / 5) * 5; y <= Math.ceil(maxY / 5); y += 5) {
    if (y % 10 !== 0) {
      const canvasY = worldToCanvas(0, y).y
      ctx.beginPath()
      ctx.moveTo(0, canvasY)
      ctx.lineTo(width, canvasY)
      ctx.stroke()
    }
  }
  
  // 10mm粗网格和标注
  ctx.strokeStyle = '#888888'
  ctx.lineWidth = 1.5
  ctx.font = '10px Arial'
  ctx.fillStyle = '#aaaaaa'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  
  for (let x = Math.floor(minX / 10) * 10; x <= Math.ceil(maxX / 10) * 10; x += 10) {
    const canvasX = worldToCanvas(x, 0).x
    ctx.beginPath()
    ctx.moveTo(canvasX, 0)
    ctx.lineTo(canvasX, height)
    ctx.stroke()
    
    // 标注
    if (x !== 0) {
      const labelY = worldToCanvas(0, 0).y - 15
      ctx.fillText(`${x}mm`, canvasX, labelY)
    }
  }
  
  for (let y = Math.floor(minY / 10) * 10; y <= Math.ceil(maxY / 10) * 10; y += 10) {
    const canvasY = worldToCanvas(0, y).y
    ctx.beginPath()
    ctx.moveTo(0, canvasY)
    ctx.lineTo(width, canvasY)
    ctx.stroke()
    
    // 标注
    if (y !== 0) {
      const labelX = worldToCanvas(0, 0).x - 30
      ctx.fillText(`${y}mm`, labelX, canvasY)
    }
  }
  
  // 绘制坐标轴
  ctx.strokeStyle = '#ff0000'
  ctx.lineWidth = 2
  const origin = worldToCanvas(0, 0)
  ctx.beginPath()
  ctx.moveTo(origin.x, 0)
  ctx.lineTo(origin.x, height)
  ctx.stroke()
  
  ctx.strokeStyle = '#00ff00'
  ctx.beginPath()
  ctx.moveTo(0, origin.y)
  ctx.lineTo(width, origin.y)
  ctx.stroke()
}

// 绘制鼠标吸附位置
const drawSnapIndicator = () => {
  if (!ctx || !canvas || !snapPosition.value) return
  
  const snap = worldToCanvas(snapPosition.value.x, snapPosition.value.y)
  const rect = canvas.getBoundingClientRect()
  const width = rect.width
  const height = rect.height
  
  // 绘制十字线
  ctx.strokeStyle = '#ffff00'
  ctx.lineWidth = 1
  ctx.setLineDash([3, 3])
  
  // 水平线
  ctx.beginPath()
  ctx.moveTo(0, snap.y)
  ctx.lineTo(width, snap.y)
  ctx.stroke()
  
  // 垂直线
  ctx.beginPath()
  ctx.moveTo(snap.x, 0)
  ctx.lineTo(snap.x, height)
  ctx.stroke()
  
  ctx.setLineDash([])
  
  // 绘制吸附点
  ctx.fillStyle = '#ffff00'
  ctx.beginPath()
  ctx.arc(snap.x, snap.y, 4, 0, Math.PI * 2)
  ctx.fill()
  
  // 绘制坐标标签
  ctx.fillStyle = '#ffff00'
  ctx.font = '12px Arial'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'bottom'
  const label = `${snapPosition.value.x.toFixed(1)}mm, ${snapPosition.value.y.toFixed(1)}mm`
  ctx.fillText(label, snap.x + 8, snap.y - 8)
}

// 绘制路径
const drawPath = () => {
  if (!ctx) return
  
  ctx.strokeStyle = '#4a9eff'
  ctx.lineWidth = 2
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  
  pathSegments.value.forEach(segment => {
    if (segment.type === 'line') {
      const start = worldToCanvas(segment.start.x, segment.start.y)
      const end = worldToCanvas(segment.end.x, segment.end.y)
      ctx.beginPath()
      ctx.moveTo(start.x, start.y)
      ctx.lineTo(end.x, end.y)
      ctx.stroke()
    } else if (segment.type === 'arc') {
      const center = worldToCanvas(segment.center.x, segment.center.y)
      const startAngle = segment.startAngle
      const endAngle = segment.endAngle
      const radius = segment.radius * scale.value
      
      ctx.beginPath()
      // Canvas的arc函数：startAngle, endAngle, anticlockwise
      // anticlockwise=false表示顺时针，true表示逆时针
      // 但我们的clockwise表示顺时针，所以需要取反
      ctx.arc(center.x, center.y, radius, -startAngle, -endAngle, !segment.clockwise)
      ctx.stroke()
    }
  })
  
  // 绘制临时直线
  if (lineStartPoint.value && tempLineEnd.value) {
    const start = worldToCanvas(lineStartPoint.value.x, lineStartPoint.value.y)
    const end = worldToCanvas(tempLineEnd.value.x, tempLineEnd.value.y)
    ctx.strokeStyle = '#4a9eff'
    ctx.lineWidth = 2
    ctx.setLineDash([5, 5])
    ctx.beginPath()
    ctx.moveTo(start.x, start.y)
    ctx.lineTo(end.x, end.y)
    ctx.stroke()
    ctx.setLineDash([])
    
    // 显示长度
    const length = Math.sqrt(
      Math.pow(tempLineEnd.value.x - lineStartPoint.value.x, 2) +
      Math.pow(tempLineEnd.value.y - lineStartPoint.value.y, 2)
    )
    const midX = (start.x + end.x) / 2
    const midY = (start.y + end.y) / 2
    ctx.fillStyle = '#ffffff'
    ctx.font = '12px Arial'
    ctx.textAlign = 'center'
    ctx.fillText(`${length.toFixed(1)}mm`, midX, midY - 10)
  }
  
  // 绘制临时圆弧
  if (arcStartPoint.value && arcState.value === 'center') {
    let center = null
    let radius = 0
    
    if (arcCenter.value) {
      center = worldToCanvas(arcCenter.value.x, arcCenter.value.y)
      radius = arcRadius.value * scale.value
    } else if (tempArcCenter.value) {
      // 实时预览圆心位置
      center = worldToCanvas(tempArcCenter.value.x, tempArcCenter.value.y)
      const dx = arcStartPoint.value.x - tempArcCenter.value.x
      const dy = arcStartPoint.value.y - tempArcCenter.value.y
      radius = Math.sqrt(dx * dx + dy * dy) * scale.value
    }
    
    if (center && radius > 0) {
      const start = worldToCanvas(arcStartPoint.value.x, arcStartPoint.value.y)
      
      // 计算角度
      const centerWorld = arcCenter.value || tempArcCenter.value
      const dx = arcStartPoint.value.x - centerWorld.x
      const dy = arcStartPoint.value.y - centerWorld.y
      const startAngle = Math.atan2(dy, dx)
      
      // 角度始终为正值，方向只影响旋转方向
      const angleRad = arcAngle.value * Math.PI / 180
      const endAngle = arcClockwise.value 
        ? startAngle - angleRad  // 顺时针：角度减小
        : startAngle + angleRad  // 逆时针：角度增大
      
      ctx.strokeStyle = '#4a9eff'
      ctx.lineWidth = 2
      ctx.setLineDash([5, 5])
      ctx.beginPath()
      // Canvas的arc函数：startAngle, endAngle, anticlockwise
      // anticlockwise=false表示顺时针，true表示逆时针
      // 但我们的arcClockwise表示顺时针，所以需要取反
      ctx.arc(center.x, center.y, radius, -startAngle, -endAngle, !arcClockwise.value)
      ctx.stroke()
      ctx.setLineDash([])
      
      // 绘制起点和圆心标记
      ctx.fillStyle = '#00ff00'
      ctx.beginPath()
      ctx.arc(start.x, start.y, 4, 0, Math.PI * 2)
      ctx.fill()
      
      ctx.fillStyle = '#ff00ff'
      ctx.beginPath()
      ctx.arc(center.x, center.y, 4, 0, Math.PI * 2)
      ctx.fill()
    }
  }
}

// 重绘
const redraw = () => {
  if (!ctx || !canvas) return
  
  // 获取CSS尺寸用于清除（考虑设备像素比）
  const rect = canvas.getBoundingClientRect()
  ctx.clearRect(0, 0, rect.width, rect.height)
  drawGrid()
  drawPath()
  drawSnapIndicator()
}

// 鼠标点击处理
const handleClick = (event) => {
  const rect = canvas.getBoundingClientRect()
  const canvasX = event.clientX - rect.left
  const canvasY = event.clientY - rect.top
  const world = canvasToWorld(canvasX, canvasY)
  
  // 应用网格吸附
  const snapped = snapToGrid(world.x, world.y)
  
  if (drawMode.value === 'line') {
    // 如果正在输入长度，点击画布相当于确认当前长度并开始新直线
    if (showLengthInput.value && lineStartPoint.value && lineEndPoint.value) {
      // 先确认当前直线（这会触发emitPathUpdate并重置状态）
      confirmLine()
      // 等待状态重置后，新直线的起点应该是上一条线的终点（也就是刚才确认的那条直线的终点）
      // 由于confirmLine会重置lineStartPoint，我们需要从pathSegments获取最后一个段的终点
      const lastSegment = pathSegments.value[pathSegments.value.length - 1]
      if (lastSegment) {
        // 新直线的起点是上一条线的终点
        lineStartPoint.value = { ...lastSegment.end }
        // 当前点击位置是新直线的终点
        lineEndPoint.value = snapped
        const dx = snapped.x - lineStartPoint.value.x
        const dy = snapped.y - lineStartPoint.value.y
        const length = Math.sqrt(dx * dx + dy * dy)
        // 计算角度（弧度转角度）
        const angleRad = Math.atan2(dy, dx)
        currentAngle.value = (angleRad * 180) / Math.PI
        currentLength.value = length
        showLengthInput.value = true
        tempLineEnd.value = snapped
      }
      redraw()
      return
    }
    
    if (!lineStartPoint.value) {
      // 如果已有路径，起点应该是上一个段的终点
      if (pathSegments.value.length > 0) {
        const lastSegment = pathSegments.value[pathSegments.value.length - 1]
        if (lastSegment.type === 'line') {
          lineStartPoint.value = { ...lastSegment.end }
        } else if (lastSegment.type === 'arc') {
          lineStartPoint.value = { ...lastSegment.end }
        }
      } else {
        lineStartPoint.value = snapped
      }
      tempLineEnd.value = snapped
    } else {
      // 第二个点，确定方向
      lineEndPoint.value = snapped
      const dx = snapped.x - lineStartPoint.value.x
      const dy = snapped.y - lineStartPoint.value.y
      const length = Math.sqrt(dx * dx + dy * dy)
      // 计算角度（弧度转角度）
      const angleRad = Math.atan2(dy, dx)
      currentAngle.value = (angleRad * 180) / Math.PI
      currentLength.value = length
      showLengthInput.value = true
    }
  } else if (drawMode.value === 'arc') {
    if (arcState.value === 'start') {
      // 如果已有路径，起点应该是上一个段的终点
      if (pathSegments.value.length > 0) {
        const lastSegment = pathSegments.value[pathSegments.value.length - 1]
        if (lastSegment.type === 'line') {
          arcStartPoint.value = { ...lastSegment.end }
        } else if (lastSegment.type === 'arc') {
          arcStartPoint.value = { ...lastSegment.end }
        }
      } else {
        arcStartPoint.value = snapped
      }
      arcState.value = 'center'
      tempArcCenter.value = snapped
      // 计算初始半径
      const dx = arcStartPoint.value.x - snapped.x
      const dy = arcStartPoint.value.y - snapped.y
      arcRadius.value = Math.sqrt(dx * dx + dy * dy)
    } else if (arcState.value === 'center' && !arcCenter.value) {
      // 确认圆心
      arcCenter.value = snapped
      tempArcCenter.value = null
      showArcParams.value = true
    }
  }
  
  redraw()
}

// 鼠标移动处理
const handleMouseMove = (event) => {
  if (!canvas) return
  
  const rect = canvas.getBoundingClientRect()
  const canvasX = event.clientX - rect.left
  const canvasY = event.clientY - rect.top
  
  // 如果正在右键拖拽，更新偏移
  if (isDragging.value) {
    const deltaX = canvasX - dragStartX.value
    const deltaY = canvasY - dragStartY.value
    offsetX.value = dragStartOffsetX.value + deltaX
    offsetY.value = dragStartOffsetY.value + deltaY
    redraw()
    return
  }
  
  const world = canvasToWorld(canvasX, canvasY)
  
  // 应用网格吸附并更新吸附位置显示
  const snapped = snapToGrid(world.x, world.y)
  snapPosition.value = snapped
  
  if (drawMode.value === 'line' && lineStartPoint.value && !lineEndPoint.value) {
    tempLineEnd.value = snapped
    redraw()
  } else if (drawMode.value === 'arc' && arcStartPoint.value && arcState.value === 'center' && !arcCenter.value) {
    // 实时更新半径预览
    tempArcCenter.value = snapped
    const dx = arcStartPoint.value.x - snapped.x
    const dy = arcStartPoint.value.y - snapped.y
    arcRadius.value = Math.sqrt(dx * dx + dy * dy)
    redraw()
  } else {
    // 仅更新吸附位置显示
    redraw()
  }
}

// 鼠标按下处理
const handleMouseDown = (event) => {
  if (!canvas) return
  
  // 检测右键（button === 2 表示右键）
  if (event.button === 2) {
    const rect = canvas.getBoundingClientRect()
    dragStartX.value = event.clientX - rect.left
    dragStartY.value = event.clientY - rect.top
    dragStartOffsetX.value = offsetX.value
    dragStartOffsetY.value = offsetY.value
    isDragging.value = true
    canvas.style.cursor = 'grabbing'
    event.preventDefault()
  }
}

// 鼠标释放处理
const handleMouseUp = (event) => {
  if (isDragging.value && event.button === 2) {
    isDragging.value = false
    if (canvas) {
      canvas.style.cursor = 'crosshair'
    }
    event.preventDefault()
  }
}

// 鼠标离开画布处理
const handleMouseLeave = () => {
  if (isDragging.value) {
    isDragging.value = false
    if (canvas) {
      canvas.style.cursor = 'crosshair'
    }
  }
  // 清除吸附位置显示
  snapPosition.value = null
  redraw()
}

// 滚轮缩放处理
const handleWheel = (event) => {
  if (!canvas) return
  
  event.preventDefault()
  
  const rect = canvas.getBoundingClientRect()
  const mouseX = event.clientX - rect.left
  const mouseY = event.clientY - rect.top
  
  // 获取鼠标位置对应的世界坐标（缩放前）
  const worldBefore = canvasToWorld(mouseX, mouseY)
  
  // 计算缩放因子（滚轮向下缩小，向上放大）
  const zoomFactor = event.deltaY > 0 ? 0.9 : 1.1
  const newScale = scale.value * zoomFactor
  
  // 调整偏移，使鼠标位置对应的世界坐标保持不变（缩放中心在鼠标位置）
  // 缩放前：worldX = (mouseX - offsetX) / scale
  // 缩放后：worldX = (mouseX - newOffsetX) / newScale
  // 因此：newOffsetX = mouseX - (mouseX - offsetX) * newScale / scale
  const scaleRatio = newScale / scale.value
  offsetX.value = mouseX - (mouseX - offsetX.value) * scaleRatio
  offsetY.value = mouseY - (mouseY - offsetY.value) * scaleRatio
  
  scale.value = newScale
  
  redraw()
}

// 根据长度和角度更新直线终点
const updateLineFromLengthAndAngle = () => {
  if (!lineStartPoint.value || currentLength.value <= 0) return
  
  // 将角度转换为弧度（注意：Canvas坐标系Y轴向下，需要调整）
  const angleRad = (currentAngle.value * Math.PI) / 180
  
  // 计算终点坐标（相对于起点）
  const dx = currentLength.value * Math.cos(angleRad)
  const dy = currentLength.value * Math.sin(angleRad)
  
  lineEndPoint.value = {
    x: lineStartPoint.value.x + dx,
    y: lineStartPoint.value.y + dy
  }
  
  redraw()
}

// 更新直线长度（保持角度不变）
const updateLineLength = () => {
  updateLineFromLengthAndAngle()
}

// 处理长度输入框滚轮事件
const handleLengthInputWheel = (event) => {
  event.preventDefault()
  const delta = event.deltaY > 0 ? -0.1 : 0.1 // 向下滚动减少，向上滚动增加
  const newLength = Math.max(0, (currentLength.value || 0) + delta)
  currentLength.value = newLength
  updateLineFromLengthAndAngle()
}

// 处理角度输入框滚轮事件
const handleAngleInputWheel = (event) => {
  event.preventDefault()
  const delta = event.deltaY > 0 ? -1 : 1 // 向下滚动减少，向上滚动增加
  currentAngle.value = (currentAngle.value || 0) + delta
  updateLineFromLengthAndAngle()
}

// 确认直线（点击确定按钮或按Enter键）
const confirmLine = () => {
  if (lineStartPoint.value && lineEndPoint.value && currentLength.value > 0) {
    // 添加直线段
    pathSegments.value.push({
      type: 'line',
      start: { ...lineStartPoint.value },
      end: { ...lineEndPoint.value },
      length: currentLength.value
    })
    
    // 重置状态
    lineStartPoint.value = null
    lineEndPoint.value = null
    tempLineEnd.value = null
    showLengthInput.value = false
    currentLength.value = 0
    currentAngle.value = 0
    
    // 触发路径更新，渲染3D模型
    emitPathUpdate()
    redraw()
  }
}

// 隐藏长度输入框并确认直线（失去焦点时）
const hideLengthInput = () => {
  // 延迟执行，避免与确定按钮点击冲突
  setTimeout(() => {
    if (showLengthInput.value && lineStartPoint.value && lineEndPoint.value) {
      confirmLine()
    }
  }, 200)
}

// 更新圆弧半径
const updateArcRadius = () => {
  if (!arcStartPoint.value || !arcCenter.value || arcRadius.value <= 0) {
    redraw()
    return
  }
  
  // 固定起点，移动圆心，方向不变
  // 计算从起点到圆心的方向向量
  const dx = arcCenter.value.x - arcStartPoint.value.x
  const dy = arcCenter.value.y - arcStartPoint.value.y
  const currentDistance = Math.sqrt(dx * dx + dy * dy)
  
  if (currentDistance > 0) {
    // 保持方向不变，只改变距离
    const directionX = dx / currentDistance
    const directionY = dy / currentDistance
    
    // 根据新半径计算新圆心位置
    arcCenter.value = {
      x: arcStartPoint.value.x + directionX * arcRadius.value,
      y: arcStartPoint.value.y + directionY * arcRadius.value
    }
  }
  
  redraw()
}

// 更新圆弧角度
const updateArcAngle = () => {
  // 确保角度在有效范围内
  if (arcAngle.value < 0) arcAngle.value = 0
  if (arcAngle.value > 360) arcAngle.value = 360
  redraw()
}

// 更新圆弧方向
const updateArcDirection = () => {
  redraw()
}

// 确认圆弧（点击确定按钮或按Enter键）
const confirmArc = () => {
  if (arcStartPoint.value && arcCenter.value && arcRadius.value > 0 && arcAngle.value > 0) {
    // 计算角度
    const dx = arcStartPoint.value.x - arcCenter.value.x
    const dy = arcStartPoint.value.y - arcCenter.value.y
    const startAngle = Math.atan2(dy, dx)
    
    // 角度始终为正值，方向只影响旋转方向
    const angleRad = arcAngle.value * Math.PI / 180
    const endAngle = arcClockwise.value 
      ? startAngle - angleRad  // 顺时针：角度减小
      : startAngle + angleRad  // 逆时针：角度增大
    
    // 计算终点
    const endX = arcCenter.value.x + arcRadius.value * Math.cos(endAngle)
    const endY = arcCenter.value.y + arcRadius.value * Math.sin(endAngle)
    
    // 添加圆弧段
    pathSegments.value.push({
      type: 'arc',
      start: { ...arcStartPoint.value },
      center: { ...arcCenter.value },
      radius: arcRadius.value,
      startAngle: startAngle,
      endAngle: endAngle,
      clockwise: arcClockwise.value,
      end: { x: endX, y: endY }
    })
    
    // 重置状态（但保持起点为下一个段的起点）
    arcCenter.value = null
    tempArcCenter.value = null
    arcRadius.value = 0
    arcAngle.value = 90
    arcClockwise.value = false
    showArcParams.value = false
    arcState.value = 'start'
    // 不重置arcStartPoint，以便下一个段可以连续
    
    // 触发路径更新，渲染3D模型
    emitPathUpdate()
    redraw()
  }
}

// 隐藏圆弧参数输入框（失去焦点时）
const hideArcParams = () => {
  // 延迟执行，避免与确定按钮点击冲突
  setTimeout(() => {
    if (showArcParams.value && arcStartPoint.value && arcCenter.value && arcRadius.value > 0 && arcAngle.value > 0) {
      confirmArc()
    }
  }, 200)
}

// 取消当前绘制（ESC键）
const cancelCurrentDrawing = () => {
  if (drawMode.value === 'line') {
    // 取消直线绘制
    lineStartPoint.value = null
    lineEndPoint.value = null
    tempLineEnd.value = null
    showLengthInput.value = false
    currentLength.value = 0
    currentAngle.value = 0
  } else if (drawMode.value === 'arc') {
    // 取消圆弧绘制
    if (showArcParams.value) {
      // 如果正在输入参数，只关闭参数框，保持状态
      showArcParams.value = false
    } else {
      // 如果正在选择圆心，重置到起点状态
      if (arcState.value === 'center' && !arcCenter.value) {
        arcState.value = 'start'
        tempArcCenter.value = null
        arcRadius.value = 0
      } else if (arcState.value === 'start') {
        // 如果刚选择了起点，完全重置
        arcStartPoint.value = null
        arcState.value = 'start'
      }
    }
  }
  redraw()
}

// 撤回上一条线段（Ctrl+Z）
const undoLastSegment = () => {
  if (pathSegments.value.length > 0) {
    pathSegments.value.pop()
    emitPathUpdate()
    redraw()
  }
}

// 键盘事件处理
const handleKeyDown = (event) => {
  // ESC键：取消当前绘制
  if (event.key === 'Escape' || event.keyCode === 27) {
    // 如果输入框有焦点，先让它失去焦点
    const activeElement = document.activeElement
    if (activeElement && (activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA')) {
      activeElement.blur()
    }
    event.preventDefault()
    cancelCurrentDrawing()
  }
  
  // Ctrl+Z：撤回上一条线段
  if ((event.ctrlKey || event.metaKey) && (event.key === 'z' || event.key === 'Z')) {
    // 如果输入框有焦点，不处理（让浏览器默认行为处理）
    const activeElement = document.activeElement
    if (activeElement && (activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA')) {
      return
    }
    event.preventDefault()
    undoLastSegment()
  }
}

// 清除草图
const clearSketch = () => {
  pathSegments.value = []
  lineStartPoint.value = null
  lineEndPoint.value = null
  tempLineEnd.value = null
  showLengthInput.value = false
  currentLength.value = 0
  currentAngle.value = 0
  arcStartPoint.value = null
  arcCenter.value = null
  tempArcCenter.value = null
  arcState.value = 'start'
  showArcParams.value = false
  emitPathUpdate()
  redraw()
}

// 发送路径更新事件
const emitPathUpdate = () => {
  const pathData = {
    segments: pathSegments.value.map(s => ({ ...s }))
  }
  emit('path-updated', pathData)
  // 同时发送到window事件，供ThreeScene监听
  window.dispatchEvent(new CustomEvent('sketch2d-path-updated', {
    detail: pathData
  }))
}

// 监听路径变化
watch(pathSegments, () => {
  redraw()
}, { deep: true })

// 监听初始路径数据变化，加载已有路径
watch(() => props.initialPathData, (newPathData) => {
  if (newPathData && newPathData.segments && newPathData.segments.length > 0) {
    // 加载路径数据
    pathSegments.value = newPathData.segments.map(s => ({ ...s }))
    // 重置绘制状态
    lineStartPoint.value = null
    lineEndPoint.value = null
    tempLineEnd.value = null
    showLengthInput.value = false
    currentLength.value = 0
    currentAngle.value = 0
    arcStartPoint.value = null
    arcCenter.value = null
    tempArcCenter.value = null
    arcState.value = 'start'
    showArcParams.value = false
    // 重绘
    redraw()
    // 触发路径更新事件（但不发送到window，避免循环）
    emit('path-updated', { segments: pathSegments.value.map(s => ({ ...s })) })
  }
}, { immediate: true, deep: true })

onMounted(() => {
  // 设置初始缩放（如果提供了initialScale prop，在初始化画布之前设置）
  if (props.initialScale && props.initialScale !== 1) {
    scale.value = props.initialScale
  }
  
  const cleanup = initCanvas()
  
  // 如果有初始路径数据，加载它
  if (props.initialPathData && props.initialPathData.segments && props.initialPathData.segments.length > 0) {
    pathSegments.value = props.initialPathData.segments.map(s => ({ ...s }))
  }
  
  redraw()
  
  // 添加键盘事件监听
  window.addEventListener('keydown', handleKeyDown)
  
  return () => {
    cleanup?.()
    window.removeEventListener('keydown', handleKeyDown)
  }
})

onUnmounted(() => {
  // 清理工作
  window.removeEventListener('keydown', handleKeyDown)
})
</script>

<style scoped>
.sketch-container {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  background: #1a1a1a;
  position: relative;
}

.sketch-toolbar {
  display: flex;
  gap: 8px;
  padding: 10px;
  background: rgba(0, 0, 0, 0.7);
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.tool-btn {
  padding: 8px 16px;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 4px;
  color: #ccc;
  cursor: pointer;
  font-size: 14px;
  transition: all 0.3s;
}

.tool-btn:hover {
  background: rgba(255, 255, 255, 0.15);
  color: #fff;
}

.tool-btn.active {
  background: #4a9eff;
  color: white;
  border-color: #4a9eff;
}

.canvas-wrapper {
  flex: 1;
  position: relative;
  overflow: hidden;
}

canvas {
  display: block;
  width: 100%;
  height: 100%;
  cursor: crosshair;
}

.input-overlay {
  position: absolute;
  top: 60px;
  left: 10px;
  background: rgba(0, 0, 0, 0.8);
  padding: 12px;
  border-radius: 6px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  z-index: 100;
  min-width: 150px;
}

.input-overlay label {
  display: block;
  color: #ccc;
  font-size: 12px;
  margin-bottom: 6px;
}

.input-overlay input {
  width: 100%;
  box-sizing: border-box;
  padding: 6px 10px;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 4px;
  color: #fff;
  font-size: 14px;
}

.input-overlay input:focus {
  outline: none;
  border-color: #4a9eff;
  background: rgba(255, 255, 255, 0.15);
}

.confirm-btn {
  width: 100%;
  margin-top: 10px;
  padding: 8px 16px;
  background: #4a9eff;
  border: 1px solid #4a9eff;
  border-radius: 4px;
  color: white;
  cursor: pointer;
  font-size: 14px;
  font-weight: 500;
  transition: all 0.3s;
}

.confirm-btn:hover {
  background: #357abd;
  border-color: #357abd;
  transform: translateY(-1px);
}

.confirm-btn:active {
  transform: translateY(0);
}

.arc-params {
  min-width: 200px;
}

.param-row {
  margin-bottom: 10px;
}

.param-row:last-child {
  margin-bottom: 0;
  margin-top: 5px;
}

.param-row .confirm-btn {
  margin-top: 0;
}

.dir-btn {
  padding: 4px 12px;
  margin-left: 8px;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 4px;
  color: #ccc;
  cursor: pointer;
  font-size: 12px;
  transition: all 0.3s;
}

.dir-btn:hover {
  background: rgba(255, 255, 255, 0.15);
}

.dir-btn.active {
  background: #4a9eff;
  color: white;
  border-color: #4a9eff;
}
</style>

