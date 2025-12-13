import * as THREE from 'three'
import { 
  createEndCapMaterial, 
  createEndCapGeometry, 
  createHitboxGeometry,
  setupEndFaceUserData 
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
  
  const shape = new THREE.Shape()
  shape.absarc(0, 0, outerRadius, 0, Math.PI * 2, false)
  
  const holePath = new THREE.Path()
  holePath.absarc(0, 0, innerRadius, 0, Math.PI * 2, true)
  shape.holes.push(holePath)
  
  // 角度转弧度
  const startAngleRad = 0
  const endAngleRad = (bendAngle * Math.PI) / 180
  
  const curve = new ArcCurve(bendRadius, startAngleRad, endAngleRad)
  
  const extrudeSettings = {
    steps: segments || 20, // 沿路径的细分数
    bevelEnabled: false,
    extrudePath: curve,
    curveSegments: segments || 12 
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
  
  // 调整位置
  mesh.position.x = -bendRadius
  
  const pipeGroup = new THREE.Group()
  pipeGroup.add(mesh)
  pipeGroup.rotation.x = Math.PI / 2
  
  // 为弯管创建端面（圆环）
  // 起始端：在局部坐标系中，起始端在 (0, 0, 0) 位置，切线沿 Y 轴正方向
  // 结束端：在局部坐标系中，根据弯曲角度计算
  const startEndPoint = new THREE.Vector3(0, 0, 0)
  const endEndPoint = new THREE.Vector3(
    bendRadius * (Math.cos(endAngleRad) - 1),
    bendRadius * Math.sin(endAngleRad),
    0
  )
  
  // 起始端法向量（指向管道外部，即切线方向的反方向）
  // 局部坐标系中，切线是 (0, 1, 0)，所以法向量是 (0, -1, 0)
  const startNormal = new THREE.Vector3(0, -1, 0)
  
  // 结束端法向量（指向管道外部，即切线方向）
  // 切线方向是 (-sin(theta), cos(theta), 0)
  const endNormal = new THREE.Vector3(
    -Math.sin(endAngleRad),
    Math.cos(endAngleRad),
    0
  )
  
  // 创建端面材质
  const endCapMaterial = createEndCapMaterial()

  // 创建起始端面（在局部坐标系中，不需要旋转，默认法向 (0, -1, 0)）
  const radialSegments = Math.max(segments || 8, 3) // 使用 segments 参数，默认8
  const startCapGeometry = createEndCapGeometry(innerRadius, outerRadius, 0, false, radialSegments)
  const startCap = new THREE.Mesh(startCapGeometry, endCapMaterial)
  startCap.position.copy(startEndPoint)
  
  // 标记起始端面
  setupEndFaceUserData(startCap, 'front', startEndPoint.clone(), startNormal.clone(), assemblyItemId)
  
  // 创建起始端面的 Hitbox
  // 注意：visible: false 的物体不能被射线检测到，所以必须 visible: true 但 opacity: 0
  const hitboxMaterial = new THREE.MeshBasicMaterial({ 
    color: 0xff0000,
    transparent: true,
    opacity: 0,
    side: THREE.DoubleSide
  })
  const startHitboxGeometry = createHitboxGeometry(outerRadius * 1.1, 0, false, radialSegments)
  const startHitbox = new THREE.Mesh(startHitboxGeometry, hitboxMaterial)
  // startHitboxGeometry 已经垂直于 Y 轴，不需要额外旋转（除非为了纹理对齐，这里不需要）
  startHitbox.position.copy(startEndPoint)
  setupEndFaceUserData(startHitbox, 'front', startEndPoint.clone(), startNormal.clone(), assemblyItemId)
  
  // 创建结束端面
  const endCapGeometry = createEndCapGeometry(innerRadius, outerRadius, 0, true, radialSegments)
  const endCap = new THREE.Mesh(endCapGeometry, endCapMaterial)
  // 旋转端面使其垂直于结束方向
  // 默认法向 (0, 1, 0)，绕 Z 轴旋转 endAngleRad 即可
  endCap.rotation.z = endAngleRad
  endCap.position.copy(endEndPoint)
  
  // 标记结束端面
  setupEndFaceUserData(endCap, 'back', endEndPoint.clone(), endNormal.clone(), assemblyItemId)
  
  // 创建结束端面的 Hitbox
  const endHitboxGeometry = createHitboxGeometry(outerRadius * 1.1, 0, true, radialSegments)
  const endHitbox = new THREE.Mesh(endHitboxGeometry, hitboxMaterial)
  endHitbox.rotation.z = endAngleRad
  endHitbox.position.copy(endEndPoint)
  setupEndFaceUserData(endHitbox, 'back', endEndPoint.clone(), endNormal.clone(), assemblyItemId)
  
  pipeGroup.add(startCap)
  pipeGroup.add(endCap)
  pipeGroup.add(startHitbox)
  pipeGroup.add(endHitbox)
  
  const groupSize = Math.max(outerDiameter, bendRadius * 2)
  
  return { pipeGroup, groupSize }
}

