import * as THREE from 'three'
import {
  createEndCapMaterial,
  createEndCapForExtrudeFrame,
  createHitboxForExtrudeFrame,
  setupEndFaceUserData,
  getHitboxMaterial,
  stripLatheConnectingFace
} from './pipeCommon.js'

// 与直管相同的标架（LatheGeometry 截面在 XZ 平面）
const LATHE_N = new THREE.Vector3(0, 0, 1)
const LATHE_B = new THREE.Vector3(1, 0, 0)

// 创建变径管
export function createReducerPipe(params, pipeMaterial, assemblyItemId) {
  const { innerDiameter, outerDiameter, segments, sections } = params

  // 验证参数
  if (!sections || sections.length === 0) {
    return null
  }

  // 将相对距离转换为绝对距离
  let currentY = 0
  const allSections = [
    { distance: 0, innerDiameter, outerDiameter }
  ]

  for (const section of sections) {
    if (section.distance < 0) return null
    currentY += section.distance
    allSections.push({
      distance: currentY,
      innerDiameter: section.innerDiameter,
      outerDiameter: section.outerDiameter
    })
  }

  // 验证所有截面的直径
  for (const section of allSections) {
    if (section.outerDiameter <= section.innerDiameter) {
      return null
    }
  }

  const radialSegments = Math.max(segments || 8, 3)

  const firstSection = allSections[0]
  const lastSection = allSections[allSections.length - 1]

  const points = []

  // 外壁：从第一截面到最后截面（从下到上）
  for (let i = 0; i < allSections.length; i++) {
    const section = allSections[i]
    points.push(new THREE.Vector2(section.outerDiameter / 2, section.distance))
  }
  // 内壁：从最后截面到第一截面（从上到下）
  for (let i = allSections.length - 1; i >= 0; i--) {
    const section = allSections[i]
    points.push(new THREE.Vector2(section.innerDiameter / 2, section.distance))
  }

  const pipeGeometry = new THREE.LatheGeometry(points, radialSegments, 0, Math.PI * 2)
  // 剔除外壁→内壁连接面，避免与 backCap 的 z-fighting
  stripLatheConnectingFace(pipeGeometry, points.length, allSections.length - 1, radialSegments)

  const endCapMaterial = createEndCapMaterial()
  const hitboxMaterial = getHitboxMaterial()

  const pipeGroup = new THREE.Group()
  const pipeMesh = new THREE.Mesh(pipeGeometry, pipeMaterial)

  pipeMesh.userData.isOuterSurface = true
  if (assemblyItemId) {
    pipeMesh.userData.assemblyItemId = assemblyItemId
  }

  pipeGroup.add(pipeMesh)

  // 起始端面（统一使用 createEndCapForExtrudeFrame）
  const firstInnerRadius = firstSection.innerDiameter / 2
  const firstOuterRadius = firstSection.outerDiameter / 2
  const firstY = firstSection.distance

  const frontP = new THREE.Vector3(0, firstY, 0)
  const frontNormal = new THREE.Vector3(0, -1, 0)

  const frontCapGeometry = createEndCapForExtrudeFrame(
    firstInnerRadius, firstOuterRadius, frontP, LATHE_N, LATHE_B, frontNormal, radialSegments
  )
  const frontCap = new THREE.Mesh(frontCapGeometry, endCapMaterial)
  setupEndFaceUserData(frontCap, 'front', frontP.clone(), frontNormal.clone(), assemblyItemId)

  const frontHitboxGeometry = createHitboxForExtrudeFrame(
    firstOuterRadius * 1.1, frontP, LATHE_N, LATHE_B, frontNormal, radialSegments
  )
  const frontHitbox = new THREE.Mesh(frontHitboxGeometry, hitboxMaterial)
  setupEndFaceUserData(frontHitbox, 'front', frontP.clone(), frontNormal.clone(), assemblyItemId)

  pipeGroup.add(frontCap)
  pipeGroup.add(frontHitbox)

  // 结束端面
  const lastInnerRadius = lastSection.innerDiameter / 2
  const lastOuterRadius = lastSection.outerDiameter / 2
  const lastY = lastSection.distance

  const backP = new THREE.Vector3(0, lastY, 0)
  const backNormal = new THREE.Vector3(0, 1, 0)

  const backCapGeometry = createEndCapForExtrudeFrame(
    lastInnerRadius, lastOuterRadius, backP, LATHE_N, LATHE_B, backNormal, radialSegments
  )
  const backCap = new THREE.Mesh(backCapGeometry, endCapMaterial)
  setupEndFaceUserData(backCap, 'back', backP.clone(), backNormal.clone(), assemblyItemId)

  const backHitboxGeometry = createHitboxForExtrudeFrame(
    lastOuterRadius * 1.1, backP, LATHE_N, LATHE_B, backNormal, radialSegments
  )
  const backHitbox = new THREE.Mesh(backHitboxGeometry, hitboxMaterial)
  setupEndFaceUserData(backHitbox, 'back', backP.clone(), backNormal.clone(), assemblyItemId)

  pipeGroup.add(backCap)
  pipeGroup.add(backHitbox)

  pipeGroup.rotation.x = Math.PI / 2

  const maxDiameter = Math.max(...allSections.map(s => s.outerDiameter))
  const totalLength = lastY - firstY
  const groupSize = Math.max(maxDiameter, totalLength)

  return { pipeGroup, groupSize }
}
