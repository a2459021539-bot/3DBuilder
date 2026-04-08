import * as THREE from 'three'
import {
  createEndCapMaterial,
  createEndCapForExtrudeFrame,
  createHitboxForExtrudeFrame,
  setupEndFaceUserData,
  getHitboxMaterial,
  stripLatheConnectingFace
} from './pipeCommon.js'

// 直管端面的 Frenet 标架（LatheGeometry 绕 Y 轴旋转，截面在 XZ 平面）
// N = Z轴, B = X轴 → cos(θ)*N + sin(θ)*B = (sin(θ), 0, cos(θ)) 与 LatheGeometry 一致
const LATHE_N = new THREE.Vector3(0, 0, 1)
const LATHE_B = new THREE.Vector3(1, 0, 0)

// 创建直管
export function createStraightPipe(params, pipeMaterial, assemblyItemId) {
  const { innerDiameter, outerDiameter, length, segments } = params

  if (length <= 0) return null

  const outerRadius = outerDiameter / 2
  const innerRadius = innerDiameter / 2
  const radialSegments = Math.max(segments, 3)
  const halfLength = length / 2

  const points = [
    new THREE.Vector2(outerRadius, -halfLength),
    new THREE.Vector2(outerRadius, halfLength),
    new THREE.Vector2(innerRadius, halfLength),
    new THREE.Vector2(innerRadius, -halfLength)
  ]

  const pipeGeometry = new THREE.LatheGeometry(points, radialSegments, 0, Math.PI * 2)
  // 剔除外壁→内壁连接面（j=1），避免与 backCap 的 z-fighting
  stripLatheConnectingFace(pipeGeometry, points.length, 1, radialSegments)

  const pipeMesh = new THREE.Mesh(pipeGeometry, pipeMaterial)

  pipeMesh.userData.isOuterSurface = true
  if (assemblyItemId) {
    pipeMesh.userData.assemblyItemId = assemblyItemId
  }

  const endCapMaterial = createEndCapMaterial()
  const hitboxMaterial = getHitboxMaterial()

  // 前端面
  const frontP = new THREE.Vector3(0, -halfLength, 0)
  const frontNormal = new THREE.Vector3(0, -1, 0)

  const frontCapGeometry = createEndCapForExtrudeFrame(
    innerRadius, outerRadius, frontP, LATHE_N, LATHE_B, frontNormal, radialSegments
  )
  const frontCap = new THREE.Mesh(frontCapGeometry, endCapMaterial)
  setupEndFaceUserData(frontCap, 'front', frontP.clone(), frontNormal.clone(), assemblyItemId)

  const frontHitboxGeometry = createHitboxForExtrudeFrame(
    outerRadius * 1.1, frontP, LATHE_N, LATHE_B, frontNormal, radialSegments
  )
  const frontHitbox = new THREE.Mesh(frontHitboxGeometry, hitboxMaterial)
  setupEndFaceUserData(frontHitbox, 'front', frontP.clone(), frontNormal.clone(), assemblyItemId)

  // 后端面
  const backP = new THREE.Vector3(0, halfLength, 0)
  const backNormal = new THREE.Vector3(0, 1, 0)

  const backCapGeometry = createEndCapForExtrudeFrame(
    innerRadius, outerRadius, backP, LATHE_N, LATHE_B, backNormal, radialSegments
  )
  const backCap = new THREE.Mesh(backCapGeometry, endCapMaterial)
  setupEndFaceUserData(backCap, 'back', backP.clone(), backNormal.clone(), assemblyItemId)

  const backHitboxGeometry = createHitboxForExtrudeFrame(
    outerRadius * 1.1, backP, LATHE_N, LATHE_B, backNormal, radialSegments
  )
  const backHitbox = new THREE.Mesh(backHitboxGeometry, hitboxMaterial)
  setupEndFaceUserData(backHitbox, 'back', backP.clone(), backNormal.clone(), assemblyItemId)

  const pipeGroup = new THREE.Group()
  pipeGroup.add(pipeMesh)
  pipeGroup.add(frontCap)
  pipeGroup.add(backCap)
  pipeGroup.add(frontHitbox)
  pipeGroup.add(backHitbox)

  pipeGroup.rotation.x = Math.PI / 2
  pipeGroup.position.set(0, 0, 0)

  const groupSize = Math.max(outerDiameter, length)

  return { pipeGroup, groupSize }
}
