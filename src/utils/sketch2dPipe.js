import * as THREE from 'three'
import {
  createPipeMaterial,
  createEndCapMaterial,
  createPipeSection,
  setupEndFaceUserData,
  createEndCapForExtrudeFrame,
  createHitboxForExtrudeFrame,
  getHitboxMaterial,
  stripExtrudeCaps
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
          // 切线方向必须和 getPoint() 的真实采样方向一致，否则 Frenet 标架会翻转，
          // 进而导致沿路径拉伸的侧面绕序/法线方向错误。
          const angleDirection = seg.endAngle >= seg.startAngle ? 1 : -1
          const tangentX = -Math.sin(angle) * angleDirection
          const tangentY = Math.cos(angle) * angleDirection
          return optionalTarget.set(tangentX, tangentY, 0).normalize()
        }
      }
      
      accumulatedLength += segLen
    }
    
    return optionalTarget.set(1, 0, 0)
  }
}

function ensureSketch2DSideOrientation(geometry, pathCurve, steps, innerRadius, outerRadius) {
  const position = geometry.attributes.position
  const normal = geometry.attributes.normal
  const index = geometry.index
  if (!position || !normal || !index) return

  const midpointRadius = (innerRadius + outerRadius) / 2
  const a = new THREE.Vector3()
  const b = new THREE.Vector3()
  const c = new THREE.Vector3()
  const center = new THREE.Vector3()
  const centerlinePoint = new THREE.Vector3()
  const radial = new THREE.Vector3()
  const edge1 = new THREE.Vector3()
  const edge2 = new THREE.Vector3()
  const faceNormal = new THREE.Vector3()

  let outerDotSum = 0
  let outerFaceCount = 0

  for (let i = 0; i < index.count; i += 3) {
    a.fromBufferAttribute(position, index.getX(i))
    b.fromBufferAttribute(position, index.getX(i + 1))
    c.fromBufferAttribute(position, index.getX(i + 2))
    center.copy(a).add(b).add(c).multiplyScalar(1 / 3)

    let bestDistanceSq = Infinity
    for (let j = 0; j <= steps; j++) {
      pathCurve.getPoint(j / steps, centerlinePoint)
      const distanceSq = center.distanceToSquared(centerlinePoint)
      if (distanceSq < bestDistanceSq) bestDistanceSq = distanceSq
    }

    const radiusFromCenterline = Math.sqrt(bestDistanceSq)
    if (radiusFromCenterline <= midpointRadius) continue

    edge1.copy(b).sub(a)
    edge2.copy(c).sub(a)
    faceNormal.crossVectors(edge1, edge2)
    if (faceNormal.lengthSq() < 1e-8) continue
    faceNormal.normalize()

    let bestDistanceSqForRadial = Infinity
    for (let j = 0; j <= steps; j++) {
      pathCurve.getPoint(j / steps, centerlinePoint)
      const distanceSq = center.distanceToSquared(centerlinePoint)
      if (distanceSq < bestDistanceSqForRadial) {
        bestDistanceSqForRadial = distanceSq
        radial.copy(center).sub(centerlinePoint)
      }
    }
    if (radial.lengthSq() < 1e-8) continue
    radial.normalize()

    outerDotSum += faceNormal.dot(radial)
    outerFaceCount++
  }

  if (outerFaceCount === 0 || outerDotSum >= 0) return

  for (let i = 0; i < index.count; i += 3) {
    const ib = index.getX(i + 1)
    const ic = index.getX(i + 2)
    index.setX(i + 1, ic)
    index.setX(i + 2, ib)
  }
  index.needsUpdate = true

  for (let i = 0; i < normal.count; i++) {
    normal.setXYZ(i, -normal.getX(i), -normal.getY(i), -normal.getZ(i))
  }
  normal.needsUpdate = true
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
  stripExtrudeCaps(geometry)
  ensureSketch2DSideOrientation(geometry, pathCurve, steps, innerRadius, outerRadius)

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
