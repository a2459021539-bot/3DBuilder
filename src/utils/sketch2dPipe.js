import * as THREE from 'three'
import { 
  createPipeMaterial, 
  createEndCapMaterial,
  setupEndFaceUserData 
} from './pipeCommon.js'

// 2D路径曲线类（组合直线和圆弧）
export class Path2DCurve extends THREE.Curve {
  constructor(segments) {
    super()
    this.segments = segments || []
  }
  
  getPoint(t, optionalTarget = new THREE.Vector3()) {
    if (this.segments.length === 0) {
      return optionalTarget.set(0, 0, 0)
    }
    
    // 计算总长度
    let totalLength = 0
    const segmentLengths = []
    this.segments.forEach(seg => {
      let len = 0
      if (seg.type === 'line') {
        const dx = seg.end.x - seg.start.x
        const dy = seg.end.y - seg.start.y
        len = Math.sqrt(dx * dx + dy * dy)
      } else if (seg.type === 'arc') {
        // 确保角度是弧度
        const startAngle = typeof seg.startAngle === 'number' ? seg.startAngle : 0
        const endAngle = typeof seg.endAngle === 'number' ? seg.endAngle : 0
        len = seg.radius * Math.abs(endAngle - startAngle)
      }
      segmentLengths.push(len)
      totalLength += len
    })
    
    if (totalLength === 0) {
      return optionalTarget.set(0, 0, 0)
    }
    
    // 根据t找到对应的段
    const targetLength = t * totalLength
    let accumulatedLength = 0
    
    for (let i = 0; i < this.segments.length; i++) {
      const seg = this.segments[i]
      const segLen = segmentLengths[i]
      
      if (accumulatedLength + segLen >= targetLength || i === this.segments.length - 1) {
        // 在这个段内
        const segT = segLen > 0 
          ? (targetLength - accumulatedLength) / segLen 
          : 0
        const clampedT = Math.max(0, Math.min(1, segT))
        
        if (seg.type === 'line') {
          const x = seg.start.x + (seg.end.x - seg.start.x) * clampedT
          const y = seg.start.y + (seg.end.y - seg.start.y) * clampedT
          return optionalTarget.set(x, y, 0)
        } else if (seg.type === 'arc') {
          const angle = seg.startAngle + (seg.endAngle - seg.startAngle) * clampedT
          const x = seg.center.x + seg.radius * Math.cos(angle)
          const y = seg.center.y + seg.radius * Math.sin(angle)
          return optionalTarget.set(x, y, 0)
        }
      }
      
      accumulatedLength += segLen
    }
    
    return optionalTarget.set(0, 0, 0)
  }
  
  getTangent(t, optionalTarget = new THREE.Vector3()) {
    if (this.segments.length === 0) {
      return optionalTarget.set(1, 0, 0)
    }
    
    // 计算总长度
    let totalLength = 0
    const segmentLengths = []
    this.segments.forEach(seg => {
      let len = 0
      if (seg.type === 'line') {
        const dx = seg.end.x - seg.start.x
        const dy = seg.end.y - seg.start.y
        len = Math.sqrt(dx * dx + dy * dy)
      } else if (seg.type === 'arc') {
        const startAngle = typeof seg.startAngle === 'number' ? seg.startAngle : 0
        const endAngle = typeof seg.endAngle === 'number' ? seg.endAngle : 0
        len = seg.radius * Math.abs(endAngle - startAngle)
      }
      segmentLengths.push(len)
      totalLength += len
    })
    
    if (totalLength === 0) {
      return optionalTarget.set(1, 0, 0)
    }
    
    // 根据t找到对应的段
    const targetLength = t * totalLength
    let accumulatedLength = 0
    
    for (let i = 0; i < this.segments.length; i++) {
      const seg = this.segments[i]
      const segLen = segmentLengths[i]
      
      if (accumulatedLength + segLen >= targetLength || i === this.segments.length - 1) {
        // 在这个段内
        const segT = segLen > 0 
          ? (targetLength - accumulatedLength) / segLen 
          : 0
        const clampedT = Math.max(0, Math.min(1, segT))
        
        if (seg.type === 'line') {
          const dx = seg.end.x - seg.start.x
          const dy = seg.end.y - seg.start.y
          const len = Math.sqrt(dx * dx + dy * dy)
          if (len > 0) {
            return optionalTarget.set(dx / len, dy / len, 0).normalize()
          }
        } else if (seg.type === 'arc') {
          const angle = seg.startAngle + (seg.endAngle - seg.startAngle) * clampedT
          // 圆弧的切线方向
          const tangentX = -Math.sin(angle) * (seg.clockwise ? -1 : 1)
          const tangentY = Math.cos(angle) * (seg.clockwise ? -1 : 1)
          return optionalTarget.set(tangentX, tangentY, 0).normalize()
        }
      }
      
      accumulatedLength += segLen
    }
    
    return optionalTarget.set(1, 0, 0)
  }
}

// 创建2D草图管道
export function createSketch2DPipe(params, assemblyItemId = null) {
  const { innerDiameter, outerDiameter, segments, pathData } = params
  
  if (!pathData || !pathData.segments || pathData.segments.length === 0) {
    return null
  }
  
  const outerRadius = outerDiameter / 2
  const innerRadius = innerDiameter / 2
  const radialSegments = Math.max(segments || 8, 3)
  
  // 创建路径曲线
  const pathCurve = new Path2DCurve(pathData.segments)
  
  // 创建圆形截面（圆环）
  const shape = new THREE.Shape()
  shape.absarc(0, 0, outerRadius, 0, Math.PI * 2, false)
  
  const holePath = new THREE.Path()
  holePath.absarc(0, 0, innerRadius, 0, Math.PI * 2, true)
  shape.holes.push(holePath)
  
  // 计算路径总长度以确定步数
  let totalLength = 0
  pathData.segments.forEach(seg => {
    if (seg.type === 'line') {
      const dx = seg.end.x - seg.start.x
      const dy = seg.end.y - seg.start.y
      totalLength += Math.sqrt(dx * dx + dy * dy)
    } else if (seg.type === 'arc') {
      totalLength += seg.radius * Math.abs(seg.endAngle - seg.startAngle)
    }
  })
  
  // 根据长度计算步数（每mm至少1步）
  const steps = Math.max(Math.ceil(totalLength), 20)
  
  // 创建拉伸设置
  const extrudeSettings = {
    steps: steps,
    bevelEnabled: false,
    extrudePath: pathCurve,
    curveSegments: radialSegments
  }
  
  // 创建几何体
  const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings)
  
  // 创建材质
  const pipeMaterial = createPipeMaterial()
  
  // 创建Mesh
  const mesh = new THREE.Mesh(geometry, pipeMaterial)
  
  // 标记外表面
  mesh.userData.isOuterSurface = true
  if (assemblyItemId) {
    mesh.userData.assemblyItemId = assemblyItemId
  }
  
  // 创建管道组
  const pipeGroup = new THREE.Group()
  pipeGroup.add(mesh)
  
  // 旋转到正确的方向（路径在XOY平面，需要绕X轴旋转90度使其沿Y轴）
  pipeGroup.rotation.x = Math.PI / 2
  
  // 创建端面
  const endCapMaterial = createEndCapMaterial()
  
  // 起始端面
  const startPoint = new THREE.Vector3()
  pathCurve.getPoint(0, startPoint)
  const startTangent = new THREE.Vector3()
  pathCurve.getTangent(0, startTangent)
  const startNormal = startTangent.clone().multiplyScalar(-1) // 法向量指向外部
  
  // 创建起始端面几何体（在局部坐标系中）
  const startCapGeometry = createEndCapForPath(innerRadius, outerRadius, startPoint, startNormal, radialSegments)
  const startCap = new THREE.Mesh(startCapGeometry, endCapMaterial)
  
  // 设置起始端面用户数据
  setupEndFaceUserData(startCap, 'front', startPoint.clone(), startNormal.clone(), assemblyItemId)
  
  // 创建起始端面Hitbox
  const startHitboxGeometry = createHitboxForPath(outerRadius * 1.1, startPoint, startNormal, radialSegments)
  const startHitboxMaterial = new THREE.MeshBasicMaterial({ 
    color: 0xff0000,
    transparent: true,
    opacity: 0,
    side: THREE.DoubleSide
  })
  const startHitbox = new THREE.Mesh(startHitboxGeometry, startHitboxMaterial)
  setupEndFaceUserData(startHitbox, 'front', startPoint.clone(), startNormal.clone(), assemblyItemId)
  
  // 结束端面
  const endPoint = new THREE.Vector3()
  pathCurve.getPoint(1, endPoint)
  const endTangent = new THREE.Vector3()
  pathCurve.getTangent(1, endTangent)
  const endNormal = endTangent.clone() // 法向量指向外部
  
  // 创建结束端面几何体
  const endCapGeometry = createEndCapForPath(innerRadius, outerRadius, endPoint, endNormal, radialSegments)
  const endCap = new THREE.Mesh(endCapGeometry, endCapMaterial)
  
  // 设置结束端面用户数据
  setupEndFaceUserData(endCap, 'back', endPoint.clone(), endNormal.clone(), assemblyItemId)
  
  // 创建结束端面Hitbox
  const endHitboxGeometry = createHitboxForPath(outerRadius * 1.1, endPoint, endNormal, radialSegments)
  const endHitbox = new THREE.Mesh(endHitboxGeometry, startHitboxMaterial)
  setupEndFaceUserData(endHitbox, 'back', endPoint.clone(), endNormal.clone(), assemblyItemId)
  
  pipeGroup.add(startCap)
  pipeGroup.add(endCap)
  pipeGroup.add(startHitbox)
  pipeGroup.add(endHitbox)
  
  // 计算包围盒大小
  const box = new THREE.Box3().setFromObject(pipeGroup)
  const size = box.getSize(new THREE.Vector3())
  const groupSize = Math.max(size.x, size.y, size.z)
  
  return { pipeGroup, groupSize }
}

// 为路径端面创建几何体
function createEndCapForPath(innerRadius, outerRadius, position, normal, radialSegments) {
  const geometry = new THREE.BufferGeometry()
  const vertices = []
  const normals = []
  const indices = []
  const uvs = []
  
  // 计算旋转矩阵（使法向量对齐到Y轴）
  const up = new THREE.Vector3(0, 1, 0)
  const quaternion = new THREE.Quaternion()
  quaternion.setFromUnitVectors(up, normal.clone().normalize())
  
  for (let i = 0; i <= radialSegments; i++) {
    const theta = (i / radialSegments) * Math.PI * 2
    const sin = Math.sin(theta)
    const cos = Math.cos(theta)
    
    // 外圆点
    const outerPoint = new THREE.Vector3(outerRadius * sin, 0, outerRadius * cos)
    outerPoint.applyQuaternion(quaternion)
    outerPoint.add(position)
    vertices.push(outerPoint.x, outerPoint.y, outerPoint.z)
    normals.push(normal.x, normal.y, normal.z)
    uvs.push(0.5 + 0.5 * sin, 0.5 + 0.5 * cos)
    
    // 内圆点
    const innerPoint = new THREE.Vector3(innerRadius * sin, 0, innerRadius * cos)
    innerPoint.applyQuaternion(quaternion)
    innerPoint.add(position)
    vertices.push(innerPoint.x, innerPoint.y, innerPoint.z)
    normals.push(normal.x, normal.y, normal.z)
    uvs.push(0.5 + 0.5 * (innerRadius/outerRadius) * sin, 0.5 + 0.5 * (innerRadius/outerRadius) * cos)
  }
  
  // 生成索引
  for (let i = 0; i < radialSegments; i++) {
    const outerCurrent = i * 2
    const innerCurrent = i * 2 + 1
    const outerNext = (i + 1) * 2
    const innerNext = (i + 1) * 2 + 1
    
    // 根据法向量方向决定顶点顺序
    if (normal.y > 0) {
      indices.push(outerCurrent, innerCurrent, outerNext)
      indices.push(innerCurrent, innerNext, outerNext)
    } else {
      indices.push(outerNext, innerCurrent, outerCurrent)
      indices.push(outerNext, innerNext, innerCurrent)
    }
  }
  
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3))
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3))
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  geometry.setIndex(indices)
  
  return geometry
}

// 为路径端面创建Hitbox几何体
function createHitboxForPath(radius, position, normal, radialSegments) {
  // 创建圆形几何体
  const geometry = new THREE.CircleGeometry(radius, radialSegments)
  
  // 计算旋转矩阵
  const up = new THREE.Vector3(0, 0, 1) // CircleGeometry默认在XOY平面
  const quaternion = new THREE.Quaternion()
  quaternion.setFromUnitVectors(up, normal.clone().normalize())
  
  // 应用旋转
  geometry.applyQuaternion(quaternion)
  
  // 应用位置
  geometry.translate(position.x, position.y, position.z)
  
  return geometry
}
