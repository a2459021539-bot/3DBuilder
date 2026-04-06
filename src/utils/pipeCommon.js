import * as THREE from 'three'

// 创建正多边形环形截面 Shape（segments=3 → 三角形，segments=4 → 正方形...）
export function createPipeSection(outerRadius, innerRadius, segments) {
  const shape = new THREE.Shape()
  for (let i = 0; i <= segments; i++) {
    const theta = (i / segments) * Math.PI * 2
    const x = outerRadius * Math.cos(theta), y = outerRadius * Math.sin(theta)
    i === 0 ? shape.moveTo(x, y) : shape.lineTo(x, y)
  }
  const hole = new THREE.Path()
  for (let i = 0; i <= segments; i++) {
    const theta = (i / segments) * Math.PI * 2
    const x = innerRadius * Math.cos(theta), y = innerRadius * Math.sin(theta)
    i === 0 ? hole.moveTo(x, y) : hole.lineTo(x, y)
  }
  shape.holes.push(hole)
  return shape
}

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

/**
 * 与 ExtrudeGeometry 沿路径拉伸一致：环上点 = P + cosθ·R·N + sinθ·R·B（shape.x→N，shape.y→B）
 * capNormal 为端面外法向（用于顶点法线与绕序）
 */
export function createEndCapForExtrudeFrame(
  innerRadius, outerRadius, P, N, B, capNormal, radialSegments
) {
  const geometry = new THREE.BufferGeometry()
  const vertices = []
  const normals = []
  const indices = []
  const uvs = []
  const n = capNormal.clone().normalize()

  for (let i = 0; i <= radialSegments; i++) {
    const theta = (i / radialSegments) * Math.PI * 2
    const cos = Math.cos(theta)
    const sin = Math.sin(theta)

    const ox = P.x + outerRadius * cos * N.x + outerRadius * sin * B.x
    const oy = P.y + outerRadius * cos * N.y + outerRadius * sin * B.y
    const oz = P.z + outerRadius * cos * N.z + outerRadius * sin * B.z
    vertices.push(ox, oy, oz)
    normals.push(n.x, n.y, n.z)
    uvs.push(0.5 + 0.5 * cos, 0.5 + 0.5 * sin)

    const ix = P.x + innerRadius * cos * N.x + innerRadius * sin * B.x
    const iy = P.y + innerRadius * cos * N.y + innerRadius * sin * B.y
    const iz = P.z + innerRadius * cos * N.z + innerRadius * sin * B.z
    vertices.push(ix, iy, iz)
    normals.push(n.x, n.y, n.z)
    uvs.push(0.5 + 0.5 * (innerRadius / outerRadius) * cos, 0.5 + 0.5 * (innerRadius / outerRadius) * sin)
  }

  const e1 = new THREE.Vector3()
  const e2 = new THREE.Vector3()
  const triN = new THREE.Vector3()
  const pushTri = (a, b, c) => {
    e1.set(
      vertices[b * 3] - vertices[a * 3],
      vertices[b * 3 + 1] - vertices[a * 3 + 1],
      vertices[b * 3 + 2] - vertices[a * 3 + 2]
    )
    e2.set(
      vertices[c * 3] - vertices[a * 3],
      vertices[c * 3 + 1] - vertices[a * 3 + 1],
      vertices[c * 3 + 2] - vertices[a * 3 + 2]
    )
    triN.crossVectors(e1, e2)
    if (triN.dot(n) >= 0) {
      indices.push(a, b, c)
    } else {
      indices.push(a, c, b)
    }
  }

  for (let i = 0; i < radialSegments; i++) {
    const o0 = i * 2
    const i0 = i * 2 + 1
    const o1 = (i + 1) * 2
    const i1 = (i + 1) * 2 + 1
    pushTri(o0, i0, o1)
    pushTri(i0, i1, o1)
  }

  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3))
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3))
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  geometry.setIndex(indices)

  return geometry
}

/** 实心圆盘 Hitbox：在 N-B 平面，法向 capNormal */
export function createHitboxForExtrudeFrame(radius, P, N, B, capNormal, radialSegments) {
  const geom = new THREE.CircleGeometry(radius, radialSegments)
  const zAxis = capNormal.clone().normalize()
  const mat = new THREE.Matrix4().makeBasis(N.clone(), B.clone(), zAxis)
  geom.applyMatrix4(mat)
  geom.translate(P.x, P.y, P.z)
  return geom
}

