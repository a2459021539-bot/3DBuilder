import * as THREE from 'three'
import { 
  createEndCapMaterial, 
  createEndCapGeometry, 
  createHitboxGeometry,
  setupEndFaceUserData,
  getHitboxMaterial
} from './pipeCommon.js'

// 创建变径管
export function createReducerPipe(params, pipeMaterial, assemblyItemId) {
  const { innerDiameter, outerDiameter, segments, sections } = params
  
  // 验证参数
  if (!sections || sections.length === 0) {
    return null
  }
  
  // 确保第一个截面存在（使用初始参数）
  // 将相对距离转换为绝对距离
  let currentY = 0
  const allSections = [
    { distance: 0, innerDiameter, outerDiameter }
  ]
  
  // 处理所有输入截面
  for (const section of sections) {
    // 距离不能为负（增量）
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
  
  // allSections 现在包含了所有截面，且 distance 是绝对坐标，按顺序排列
  
  const radialSegments = Math.max(segments || 8, 3)
  
  // 生成轮廓点（用于 LatheGeometry）
  // 按照直管的方式：从内圆底部 -> 外圆底部 -> 外圆顶部 -> 内圆顶部 -> 内圆底部（闭合）
  const points = []
  
  const firstSection = allSections[0]
  const lastSection = allSections[allSections.length - 1]
  
  // 从第一个截面的内圆底部开始
  points.push(new THREE.Vector2(firstSection.innerDiameter / 2, firstSection.distance))
  
  // 添加第一个截面的外圆底部
  points.push(new THREE.Vector2(firstSection.outerDiameter / 2, firstSection.distance))
  
  // 添加所有截面的外圆点（从第二个截面开始，从下到上）
  for (let i = 1; i < allSections.length; i++) {
    const section = allSections[i]
    points.push(new THREE.Vector2(section.outerDiameter / 2, section.distance))
  }
  
  // 添加最后一个截面的内圆顶部
  points.push(new THREE.Vector2(lastSection.innerDiameter / 2, lastSection.distance))
  
  // 添加所有截面的内圆点（从倒数第二个截面开始，从上到下，反向）
  for (let i = allSections.length - 2; i >= 0; i--) {
    const section = allSections[i]
    points.push(new THREE.Vector2(section.innerDiameter / 2, section.distance))
  }
  
  // 使用 LatheGeometry 创建管道几何体
  const pipeGeometry = new THREE.LatheGeometry(
    points,
    radialSegments,
    0,
    Math.PI * 2
  )
  
  // 创建上下端面的连接面（圆环面）
  // 需要为每个截面之间的连接创建圆环面
  const endCapMaterial = createEndCapMaterial()
  
  const pipeGroup = new THREE.Group()
  const pipeMesh = new THREE.Mesh(pipeGeometry, pipeMaterial)
  
  // 标记外表面
  pipeMesh.userData.isOuterSurface = true
  if (assemblyItemId) {
    pipeMesh.userData.assemblyItemId = assemblyItemId
  }
  
  pipeGroup.add(pipeMesh)
  
  // 创建起始端面（第一个截面）
  const firstInnerRadius = firstSection.innerDiameter / 2
  const firstOuterRadius = firstSection.outerDiameter / 2
  const firstY = firstSection.distance
  
  const frontCapGeometry = createEndCapGeometry(firstInnerRadius, firstOuterRadius, firstY, false, radialSegments)
  const frontCap = new THREE.Mesh(frontCapGeometry, endCapMaterial)
  setupEndFaceUserData(frontCap, 'front', new THREE.Vector3(0, firstY, 0), new THREE.Vector3(0, -1, 0), assemblyItemId)
  
  const frontHitboxGeometry = createHitboxGeometry(firstOuterRadius * 1.1, firstY, false, radialSegments)
  const hitboxMaterial = getHitboxMaterial()
  const frontHitbox = new THREE.Mesh(frontHitboxGeometry, hitboxMaterial)
  setupEndFaceUserData(frontHitbox, 'front', new THREE.Vector3(0, firstY, 0), new THREE.Vector3(0, -1, 0), assemblyItemId)
  
  pipeGroup.add(frontCap)
  pipeGroup.add(frontHitbox)
  
  // 创建结束端面（最后一个截面）
  const lastInnerRadius = lastSection.innerDiameter / 2
  const lastOuterRadius = lastSection.outerDiameter / 2
  const lastY = lastSection.distance
  
  const backCapGeometry = createEndCapGeometry(lastInnerRadius, lastOuterRadius, lastY, true, radialSegments)
  const backCap = new THREE.Mesh(backCapGeometry, endCapMaterial)
  setupEndFaceUserData(backCap, 'back', new THREE.Vector3(0, lastY, 0), new THREE.Vector3(0, 1, 0), assemblyItemId)
  
  const backHitboxGeometry = createHitboxGeometry(lastOuterRadius * 1.1, lastY, true, radialSegments)
  const backHitbox = new THREE.Mesh(backHitboxGeometry, hitboxMaterial)
  setupEndFaceUserData(backHitbox, 'back', new THREE.Vector3(0, lastY, 0), new THREE.Vector3(0, 1, 0), assemblyItemId)
  
  pipeGroup.add(backCap)
  pipeGroup.add(backHitbox)
  
  // 旋转到正确的方向（与直管保持一致）
  pipeGroup.rotation.x = Math.PI / 2
  
  // 计算组的大小
  const maxDiameter = Math.max(...allSections.map(s => s.outerDiameter))
  const totalLength = lastY - firstY
  const groupSize = Math.max(maxDiameter, totalLength)
  
  return { pipeGroup, groupSize }
}

