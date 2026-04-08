import * as THREE from 'three'
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

/**
 * 剔除 ExtrudeGeometry 内建的端面三角形。
 * ExtrudeGeometry.buildLidFaces() 始终生成前后端面（group 0），
 * 与手动创建的 endCap mesh 重叠导致 z-fighting。
 * 调用后只保留侧面（group 1）。
 */
export function stripExtrudeCaps(geometry) {
  const groups = geometry.groups
  if (groups.length < 2) return

  // group[0] = caps (buildLidFaces), group[1] = sides (buildSideFaces)
  const sideGroup = groups[1]
  const sideStart = sideGroup.start
  const sideCount = sideGroup.count

  if (geometry.index) {
    // 索引几何体：截取侧面部分的索引
    const arr = geometry.index.array
    const newIndices = arr.slice(sideStart, sideStart + sideCount)
    geometry.setIndex(new THREE.BufferAttribute(newIndices, 1))
  } else {
    // 非索引几何体（ExtrudeGeometry 默认）：截取侧面部分的属性数据
    const pos = geometry.attributes.position
    const norm = geometry.attributes.normal
    const uv = geometry.attributes.uv

    geometry.setAttribute('position',
      new THREE.BufferAttribute(pos.array.slice(sideStart * 3, (sideStart + sideCount) * 3), 3))
    if (norm) {
      geometry.setAttribute('normal',
        new THREE.BufferAttribute(norm.array.slice(sideStart * 3, (sideStart + sideCount) * 3), 3))
    }
    if (uv) {
      geometry.setAttribute('uv',
        new THREE.BufferAttribute(uv.array.slice(sideStart * 2, (sideStart + sideCount) * 2), 2))
    }
  }
  geometry.clearGroups()

  // 用 ExtrudeGeometry 原始法线方向做平滑（不用 computeVertexNormals，它会因绕序差异翻转法线）
  // 1. 按位置分组，平均原始法线 → 保持正确方向的平滑法线
  // 2. mergeVertices 合并重复顶点 → 索引几何体
  const pos = geometry.attributes.position
  const norm = geometry.attributes.normal
  if (pos && norm) {
    const tolerance = 1e-4
    const invT = 1 / tolerance
    const groups = new Map()
    for (let i = 0; i < pos.count; i++) {
      const key = `${Math.round(pos.getX(i) * invT)},${Math.round(pos.getY(i) * invT)},${Math.round(pos.getZ(i) * invT)}`
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key).push(i)
    }
    for (const indices of groups.values()) {
      let nx = 0, ny = 0, nz = 0
      for (const i of indices) {
        nx += norm.getX(i); ny += norm.getY(i); nz += norm.getZ(i)
      }
      const len = Math.sqrt(nx * nx + ny * ny + nz * nz)
      if (len > 0) { nx /= len; ny /= len; nz /= len }
      for (const i of indices) norm.setXYZ(i, nx, ny, nz)
    }
    norm.needsUpdate = true
  }

  const merged = mergeVertices(geometry)
  geometry.index = merged.index
  geometry.attributes.position = merged.attributes.position
  geometry.attributes.normal = merged.attributes.normal
  if (merged.attributes.uv) geometry.attributes.uv = merged.attributes.uv
}

/**
 * 剔除 LatheGeometry 中外壁→内壁的连接面行。
 * 开放轮廓 [外壁..., 内壁...] 在外壁末端和内壁起始之间会产生一行
 * 连接三角面，与手动 endCap mesh 重叠导致 z-fighting。
 *
 * @param {BufferGeometry} geometry - LatheGeometry 实例
 * @param {number} profileLen - 轮廓点数 (points.length)
 * @param {number} connectJ  - 连接面所在的行索引
 * @param {number} segments  - LatheGeometry 的圆周分段数
 */
export function stripLatheConnectingFace(geometry, profileLen, connectJ, segments) {
  const idx = geometry.index
  if (!idx) return
  const arr = idx.array
  const rowsPerSeg = profileLen - 1
  const newIndices = []
  for (let i = 0; i < segments; i++) {
    for (let j = 0; j < rowsPerSeg; j++) {
      if (j === connectJ) continue
      const offset = (i * rowsPerSeg + j) * 6
      for (let k = 0; k < 6; k++) {
        newIndices.push(arr[offset + k])
      }
    }
  }
  geometry.setIndex(newIndices)
}

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

// 缓存的通用材质
let _sharedPipeMaterial = null
let _sharedEndCapMaterial = null
let _sharedHitboxMaterial = null

function _readFlatShading() {
  try { return localStorage.getItem('3dbuild.flatShading') === '1' } catch { return false }
}

// 创建管道材质
export function createPipeMaterial() {
  if (!_sharedPipeMaterial) {
    _sharedPipeMaterial = new THREE.MeshStandardMaterial({
      color: 0x4a9eff,
      metalness: 0.3,
      roughness: 0.7,
      flatShading: _readFlatShading()
    })
  }
  return _sharedPipeMaterial
}

// 创建端面材质（使用不同颜色以便区分）
export function createEndCapMaterial() {
  if (!_sharedEndCapMaterial) {
    _sharedEndCapMaterial = new THREE.MeshStandardMaterial({
      color: 0xffaa00, // 橙色，便于识别
      metalness: 0.3,
      roughness: 0.7,
      side: THREE.DoubleSide,
      flatShading: _readFlatShading()
    })
  }
  return _sharedEndCapMaterial
}

/** 运行时切换所有管道材质的着色方式 */
export function setFlatShading(enabled) {
  if (_sharedPipeMaterial) {
    _sharedPipeMaterial.flatShading = enabled
    _sharedPipeMaterial.needsUpdate = true
  }
  if (_sharedEndCapMaterial) {
    _sharedEndCapMaterial.flatShading = enabled
    _sharedEndCapMaterial.needsUpdate = true
  }
}

// 获取统一的碰撞体材质
export function getHitboxMaterial() {
  if (!_sharedHitboxMaterial) {
    _sharedHitboxMaterial = new THREE.MeshBasicMaterial({
      color: 0xff0000,
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide
    })
  }
  return _sharedHitboxMaterial
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

