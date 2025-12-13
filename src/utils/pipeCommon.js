import * as THREE from 'three'

// 创建管道材质
export function createPipeMaterial() {
  return new THREE.MeshStandardMaterial({
    color: 0x4a9eff,
    metalness: 0.3,
    roughness: 0.7,
    side: THREE.DoubleSide
  })
}

// 创建端面材质（使用不同颜色以便区分）
export function createEndCapMaterial() {
  return new THREE.MeshStandardMaterial({
    color: 0xffaa00, // 橙色，便于识别
    metalness: 0.3,
    roughness: 0.7,
    side: THREE.DoubleSide
  })
}

// 创建直管端面几何体
export function createEndCapGeometry(innerRadius, outerRadius, y, isTop, radialSegments) {
  const geometry = new THREE.BufferGeometry()
  const vertices = []
  const normals = []
  const indices = []
  const uvs = []
  const normalY = isTop ? 1 : -1
  
  for (let i = 0; i <= radialSegments; i++) {
    const theta = (i / radialSegments) * Math.PI * 2
    const sin = Math.sin(theta)
    const cos = Math.cos(theta)
    
    vertices.push(outerRadius * sin, y, outerRadius * cos)
    normals.push(0, normalY, 0)
    uvs.push(0.5 + 0.5 * sin, 0.5 + 0.5 * cos)
    
    vertices.push(innerRadius * sin, y, innerRadius * cos)
    normals.push(0, normalY, 0)
    uvs.push(0.5 + 0.5 * (innerRadius/outerRadius) * sin, 0.5 + 0.5 * (innerRadius/outerRadius) * cos)
  }
  
  for (let i = 0; i < radialSegments; i++) {
    const outerCurrent = i * 2
    const innerCurrent = i * 2 + 1
    const outerNext = (i + 1) * 2
    const innerNext = (i + 1) * 2 + 1
    
    if (isTop) {
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

// 创建端面辅助点击区域几何体（实心圆盘）
export function createHitboxGeometry(radius, y, isTop, radialSegments) {
  const geometry = new THREE.CircleGeometry(radius, radialSegments)
  // CircleGeometry 默认在 XOY 平面，我们需要旋转到 XOZ 平面（因为 LatheGeometry 是绕 Y 轴）
  geometry.rotateX(Math.PI / 2)
  // 调整位置
  geometry.translate(0, y, 0)
  
  // 如果是底部端面，法向量默认向下，如果是顶部，法向量默认向上
  // CircleGeometry 默认法向量是 (0, 0, 1)（在 XOY 平面），旋转后变成 (0, -1, 0)
  // isTop 为 true 时需要反转法向量，或者旋转 180 度
  if (isTop) {
    geometry.rotateX(Math.PI) // 翻转
  }
  
  return geometry
}

// 设置端面用户数据的辅助函数
export function setupEndFaceUserData(mesh, type, position, normal, assemblyItemId = null) {
  mesh.userData.isEndFace = true
  mesh.userData.endFaceType = type
  mesh.userData.endFacePosition = position
  mesh.userData.endFaceNormal = normal
  if (assemblyItemId) {
    mesh.userData.assemblyItemId = assemblyItemId
  }
}

