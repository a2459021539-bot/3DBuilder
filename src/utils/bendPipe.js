import * as THREE from 'three'
import {
  createEndCapMaterial,
  createPipeSection,
  setupEndFaceUserData,
  createEndCapForExtrudeFrame,
  createHitboxForExtrudeFrame,
  getHitboxMaterial
} from './pipeCommon.js'

// ArcCurve 类（弯管曲线）
export class ArcCurve extends THREE.Curve {
  constructor(radius, startAngle, endAngle) {
    super()
    this.radius = radius
    this.startAngle = startAngle
    this.endAngle = endAngle
  }
  getPoint(t, optionalTarget = new THREE.Vector3()) {
    const angle = this.startAngle + (this.endAngle - this.startAngle) * t
    // 在 XOY 平面上画圆弧
    const x = this.radius * Math.cos(angle)
    const y = this.radius * Math.sin(angle)
    const z = 0
    return optionalTarget.set(x, y, z)
  }
}

// 创建弯管
export function createBendPipe(params, pipeMaterial, assemblyItemId) {
  const { innerDiameter, outerDiameter, segments, bendRadius, bendAngle } = params
  
  if (!bendRadius || bendRadius <= 0 || !bendAngle || bendAngle === 0) return null

  // 定义截面 Shape
  const outerRadius = outerDiameter / 2
  const innerRadius = innerDiameter / 2
  
  const curveSegs = Math.max(segments || 12, 3)

  const shape = createPipeSection(outerRadius, innerRadius, curveSegs)
  
  // 角度转弧度
  const startAngleRad = 0
  const endAngleRad = (bendAngle * Math.PI) / 180
  
  const curve = new ArcCurve(bendRadius, startAngleRad, endAngleRad)

  const spacedPoints = curve.getSpacedPoints(curveSegs)
  const frenetFrames = curve.computeFrenetFrames(curveSegs, false)
  
  const extrudeSettings = {
    steps: curveSegs, // 沿路径的细分数
    bevelEnabled: false,
    extrudePath: curve,
    curveSegments: curveSegs
  }
  
  // ExtrudeGeometry 生成
  const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings)
  
  // 创建 Mesh
  const mesh = new THREE.Mesh(geometry, pipeMaterial)
  
  // 标记外表面（弯管的主 mesh 是外表面）
  mesh.userData.isOuterSurface = true
  if (assemblyItemId) {
    mesh.userData.assemblyItemId = assemblyItemId
  }
  
  // 与拉伸几何一致：曲线在 XOY，首点在 (bendRadius,0,0)，平移后管端在组原点
  mesh.position.x = -bendRadius
  
  const pipeGroup = new THREE.Group()
  pipeGroup.add(mesh)
  pipeGroup.rotation.x = Math.PI / 2

  const meshOffset = new THREE.Vector3(-bendRadius, 0, 0)
  const capRadialSegs = curveSegs

  const startP = spacedPoints[0].clone().add(meshOffset)
  const startN = frenetFrames.normals[0].clone()
  const startB = frenetFrames.binormals[0].clone()
  const startTangent = frenetFrames.tangents[0].clone()
  const startNormal = startTangent.clone().multiplyScalar(-1)

  const endP = spacedPoints[curveSegs].clone().add(meshOffset)
  const endN = frenetFrames.normals[curveSegs].clone()
  const endB = frenetFrames.binormals[curveSegs].clone()
  const endTangent = frenetFrames.tangents[curveSegs].clone()
  const endNormal = endTangent.clone()
  
  const endCapMaterial = createEndCapMaterial()

  const startCapGeometry = createEndCapForExtrudeFrame(
    innerRadius, outerRadius, startP, startN, startB, startNormal, capRadialSegs
  )
  const startCap = new THREE.Mesh(startCapGeometry, endCapMaterial)
  setupEndFaceUserData(startCap, 'front', startP.clone(), startNormal.clone(), assemblyItemId)
  
  const hitboxMaterial = getHitboxMaterial()
  const startHitboxGeometry = createHitboxForExtrudeFrame(
    outerRadius * 1.1, startP, startN, startB, startNormal, capRadialSegs
  )
  const startHitbox = new THREE.Mesh(startHitboxGeometry, hitboxMaterial)
  setupEndFaceUserData(startHitbox, 'front', startP.clone(), startNormal.clone(), assemblyItemId)
  
  const endCapGeometry = createEndCapForExtrudeFrame(
    innerRadius, outerRadius, endP, endN, endB, endNormal, capRadialSegs
  )
  const endCap = new THREE.Mesh(endCapGeometry, endCapMaterial)
  setupEndFaceUserData(endCap, 'back', endP.clone(), endNormal.clone(), assemblyItemId)
  
  const endHitboxGeometry = createHitboxForExtrudeFrame(
    outerRadius * 1.1, endP, endN, endB, endNormal, capRadialSegs
  )
  const endHitbox = new THREE.Mesh(endHitboxGeometry, hitboxMaterial)
  setupEndFaceUserData(endHitbox, 'back', endP.clone(), endNormal.clone(), assemblyItemId)
  
  pipeGroup.add(startCap)
  pipeGroup.add(endCap)
  pipeGroup.add(startHitbox)
  pipeGroup.add(endHitbox)
  
  const groupSize = Math.max(outerDiameter, bendRadius * 2)
  
  return { pipeGroup, groupSize }
}

