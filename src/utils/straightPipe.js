import * as THREE from 'three'
import { 
  createEndCapMaterial, 
  createEndCapGeometry, 
  createHitboxGeometry,
  setupEndFaceUserData 
} from './pipeCommon.js'

// 创建直管
export function createStraightPipe(params, pipeMaterial, assemblyItemId) {
  const { innerDiameter, outerDiameter, length, segments } = params
  
  if (length <= 0) return null

  const outerRadius = outerDiameter / 2
  const innerRadius = innerDiameter / 2
  const radialSegments = Math.max(segments, 3)
  const halfLength = length / 2
  
  const points = [
    new THREE.Vector2(innerRadius, -halfLength),
    new THREE.Vector2(outerRadius, -halfLength),
    new THREE.Vector2(outerRadius, halfLength),
    new THREE.Vector2(innerRadius, halfLength),
    new THREE.Vector2(innerRadius, -halfLength)
  ]
  
  const pipeGeometry = new THREE.LatheGeometry(
    points,
    radialSegments,
    0,
    Math.PI * 2
  )
  
  const pipeMesh = new THREE.Mesh(pipeGeometry, pipeMaterial)
  
  // 标记外表面（直管的主圆柱体是外表面）
  pipeMesh.userData.isOuterSurface = true
  if (assemblyItemId) {
    pipeMesh.userData.assemblyItemId = assemblyItemId
  }
  
  // 创建端面材质
  const endCapMaterial = createEndCapMaterial()

  // 创建端面（圆环）
  const frontCapGeometry = createEndCapGeometry(innerRadius, outerRadius, -halfLength, false, radialSegments)
  const backCapGeometry = createEndCapGeometry(innerRadius, outerRadius, halfLength, true, radialSegments)
  
  const frontCap = new THREE.Mesh(frontCapGeometry, endCapMaterial)
  const backCap = new THREE.Mesh(backCapGeometry, endCapMaterial)
  
  // 创建不可见的辅助点击区域（实心圆盘，覆盖整个端面，包括中间的孔）
  // 稍微大一点点 (1.1倍) 以便更容易点击
  // 注意：visible: false 的物体不能被射线检测到，所以必须 visible: true 但 opacity: 0
  const hitboxMaterial = new THREE.MeshBasicMaterial({ 
    color: 0xff0000,
    transparent: true,
    opacity: 0,
    side: THREE.DoubleSide
  })
  
  const frontHitboxGeometry = createHitboxGeometry(outerRadius * 1.1, -halfLength, false, radialSegments)
  const backHitboxGeometry = createHitboxGeometry(outerRadius * 1.1, halfLength, true, radialSegments)
  
  const frontHitbox = new THREE.Mesh(frontHitboxGeometry, hitboxMaterial)
  const backHitbox = new THREE.Mesh(backHitboxGeometry, hitboxMaterial)

  // 标记端面
  const frontPos = new THREE.Vector3(0, -halfLength, 0)
  const frontNormal = new THREE.Vector3(0, -1, 0)
  setupEndFaceUserData(frontCap, 'front', frontPos, frontNormal, assemblyItemId)
  setupEndFaceUserData(frontHitbox, 'front', frontPos, frontNormal, assemblyItemId)
  
  const backPos = new THREE.Vector3(0, halfLength, 0)
  const backNormal = new THREE.Vector3(0, 1, 0)
  setupEndFaceUserData(backCap, 'back', backPos, backNormal, assemblyItemId)
  setupEndFaceUserData(backHitbox, 'back', backPos, backNormal, assemblyItemId)
  
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

