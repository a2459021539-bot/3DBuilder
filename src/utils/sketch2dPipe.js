import * as THREE from 'three'
import {
  createPipeMaterial,
  createEndCapMaterial,
  createPipeSection,
  setupEndFaceUserData,
  createEndCapForExtrudeFrame,
  createHitboxForExtrudeFrame,
  getHitboxMaterial
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
  
  const shape = createPipeSection(outerRadius, innerRadius, radialSegments)
  
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
  
  // 每个路径段分配 radialSegments 步，弧线段 segments=3 时只有3段
  const steps = pathData.segments.length * radialSegments

  // 与 ExtrudeGeometry 内部一致：等弧长采样点 + Frenet 标架（截面在 N×B 平面，x→N、y→B）
  const spacedPoints = pathCurve.getSpacedPoints(steps)
  const frenetFrames = pathCurve.computeFrenetFrames(steps, false)
  
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
  
  // 起始端面（与拉伸体首圈同一标架：P + x*N + y*B）
  const startPoint = spacedPoints[0].clone()
  const startN = frenetFrames.normals[0].clone()
  const startB = frenetFrames.binormals[0].clone()
  const startTangent = frenetFrames.tangents[0].clone()
  const startNormal = startTangent.clone().multiplyScalar(-1) // 端面外法向（装配/拾取用）
  
  const startCapGeometry = createEndCapForExtrudeFrame(
    innerRadius, outerRadius, startPoint, startN, startB, startNormal, radialSegments
  )
  const startCap = new THREE.Mesh(startCapGeometry, endCapMaterial)
  
  setupEndFaceUserData(startCap, 'front', startPoint.clone(), startNormal.clone(), assemblyItemId)
  
  const startHitboxGeometry = createHitboxForExtrudeFrame(
    outerRadius * 1.1, startPoint, startN, startB, startNormal, radialSegments
  )
  const startHitboxMaterial = getHitboxMaterial()
  const startHitbox = new THREE.Mesh(startHitboxGeometry, startHitboxMaterial)
  setupEndFaceUserData(startHitbox, 'front', startPoint.clone(), startNormal.clone(), assemblyItemId)
  
  // 结束端面
  const endPoint = spacedPoints[steps].clone()
  const endN = frenetFrames.normals[steps].clone()
  const endB = frenetFrames.binormals[steps].clone()
  const endTangent = frenetFrames.tangents[steps].clone()
  const endNormal = endTangent.clone()
  
  const endCapGeometry = createEndCapForExtrudeFrame(
    innerRadius, outerRadius, endPoint, endN, endB, endNormal, radialSegments
  )
  const endCap = new THREE.Mesh(endCapGeometry, endCapMaterial)
  
  setupEndFaceUserData(endCap, 'back', endPoint.clone(), endNormal.clone(), assemblyItemId)
  
  const endHitboxGeometry = createHitboxForExtrudeFrame(
    outerRadius * 1.1, endPoint, endN, endB, endNormal, radialSegments
  )
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
