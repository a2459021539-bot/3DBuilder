import * as THREE from 'three'
import {
  createPipeMaterial,
  createEndCapMaterial,
  createPipeSection,
  setupEndFaceUserData,
  getHitboxMaterial
} from './pipeCommon.js'

// 3D路径曲线类
export class Path3DCurve extends THREE.Curve {
  constructor(segments) {
    super()
    this.segments = segments || []
  }

  _segmentLengths() {
    return this.segments.map(seg => {
      if (seg.type === 'line') {
        const dx = seg.end.x - seg.start.x
        const dy = seg.end.y - seg.start.y
        const dz = seg.end.z - seg.start.z
        return Math.sqrt(dx * dx + dy * dy + dz * dz)
      } else if (seg.type === 'arc') {
        return seg.radius * Math.abs(seg.endAngle - seg.startAngle)
      }
      return 0
    })
  }

  _arcPoint(seg, angle) {
    const c = seg.center
    const r = seg.radius
    const cos = Math.cos(angle)
    const sin = Math.sin(angle)
    switch (seg.plane) {
      case 'XY': return { x: c.x + r * cos, y: c.y + r * sin, z: c.z }
      case 'YZ': return { x: c.x, y: c.y + r * cos, z: c.z + r * sin }
      default:   return { x: c.x + r * cos, y: c.y, z: c.z + r * sin } // XZ
    }
  }

  _arcTangent(seg, angle) {
    const sin = Math.sin(angle)
    const cos = Math.cos(angle)
    const dir = seg.endAngle > seg.startAngle ? 1 : -1
    switch (seg.plane) {
      case 'XY': return { x: -sin * dir, y: cos * dir, z: 0 }
      case 'YZ': return { x: 0, y: -sin * dir, z: cos * dir }
      default:   return { x: -sin * dir, y: 0, z: cos * dir }
    }
  }

  _findSegment(t) {
    const lengths = this._segmentLengths()
    const total = lengths.reduce((a, b) => a + b, 0)
    if (total === 0) return null
    const target = t * total
    let acc = 0
    for (let i = 0; i < this.segments.length; i++) {
      if (acc + lengths[i] >= target || i === this.segments.length - 1) {
        const localT = lengths[i] > 0 ? Math.max(0, Math.min(1, (target - acc) / lengths[i])) : 0
        return { seg: this.segments[i], localT }
      }
      acc += lengths[i]
    }
    return null
  }

  getPoint(t, optionalTarget = new THREE.Vector3()) {
    const found = this._findSegment(t)
    if (!found) return optionalTarget.set(0, 0, 0)
    const { seg, localT } = found
    if (seg.type === 'line') {
      return optionalTarget.set(
        seg.start.x + (seg.end.x - seg.start.x) * localT,
        seg.start.y + (seg.end.y - seg.start.y) * localT,
        seg.start.z + (seg.end.z - seg.start.z) * localT
      )
    } else if (seg.type === 'arc') {
      const angle = seg.startAngle + (seg.endAngle - seg.startAngle) * localT
      const p = this._arcPoint(seg, angle)
      return optionalTarget.set(p.x, p.y, p.z)
    }
    return optionalTarget.set(0, 0, 0)
  }

  getTangent(t, optionalTarget = new THREE.Vector3()) {
    const found = this._findSegment(t)
    if (!found) return optionalTarget.set(1, 0, 0)
    const { seg, localT } = found
    if (seg.type === 'line') {
      const dx = seg.end.x - seg.start.x
      const dy = seg.end.y - seg.start.y
      const dz = seg.end.z - seg.start.z
      const len = Math.sqrt(dx * dx + dy * dy + dz * dz)
      return len > 0
        ? optionalTarget.set(dx / len, dy / len, dz / len)
        : optionalTarget.set(1, 0, 0)
    } else if (seg.type === 'arc') {
      const angle = seg.startAngle + (seg.endAngle - seg.startAngle) * localT
      const tan = this._arcTangent(seg, angle)
      return optionalTarget.set(tan.x, tan.y, tan.z).normalize()
    }
    return optionalTarget.set(1, 0, 0)
  }
}

// 端面几何体
function createEndCapForPath(innerRadius, outerRadius, position, normal, radialSegments) {
  const geometry = new THREE.BufferGeometry()
  const vertices = [], norms = [], indices = [], uvs = []
  const quaternion = new THREE.Quaternion()
  quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), normal.clone().normalize())

  for (let i = 0; i <= radialSegments; i++) {
    const theta = (i / radialSegments) * Math.PI * 2
    const cos = Math.cos(theta), sin = Math.sin(theta)
    const outer = new THREE.Vector3(outerRadius * cos, 0, outerRadius * sin).applyQuaternion(quaternion).add(position)
    vertices.push(outer.x, outer.y, outer.z)
    norms.push(normal.x, normal.y, normal.z)
    uvs.push(0.5 + 0.5 * cos, 0.5 + 0.5 * sin)
    const inner = new THREE.Vector3(innerRadius * cos, 0, innerRadius * sin).applyQuaternion(quaternion).add(position)
    vertices.push(inner.x, inner.y, inner.z)
    norms.push(normal.x, normal.y, normal.z)
    uvs.push(0.5 + 0.5 * (innerRadius / outerRadius) * cos, 0.5 + 0.5 * (innerRadius / outerRadius) * sin)
  }
  for (let i = 0; i < radialSegments; i++) {
    const o = i * 2, ic = i * 2 + 1, on = (i + 1) * 2, inn = (i + 1) * 2 + 1
    if (normal.y > 0) { indices.push(o, ic, on, ic, inn, on) }
    else { indices.push(on, ic, o, on, inn, ic) }
  }
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3))
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(norms, 3))
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  geometry.setIndex(indices)
  return geometry
}

function createHitboxForPath(radius, position, normal, radialSegments) {
  const geometry = new THREE.CircleGeometry(radius, radialSegments)
  const quaternion = new THREE.Quaternion()
  quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal.clone().normalize())
  geometry.applyQuaternion(quaternion)
  geometry.translate(position.x, position.y, position.z)
  return geometry
}

// 创建3D草图管道
export function createSketch3DPipe(params, assemblyItemId = null) {
  const { innerDiameter, outerDiameter, segments, pathData3d } = params
  if (!pathData3d || !pathData3d.segments || pathData3d.segments.length === 0) return null

  const outerRadius = outerDiameter / 2
  const innerRadius = innerDiameter / 2
  const radialSegments = Math.max(segments || 8, 3)

  const pathCurve = new Path3DCurve(pathData3d.segments)

  const shape = createPipeSection(outerRadius, innerRadius, radialSegments)

  // 计算路径总长度
  let totalLength = 0
  pathData3d.segments.forEach(seg => {
    if (seg.type === 'line') {
      const dx = seg.end.x - seg.start.x, dy = seg.end.y - seg.start.y, dz = seg.end.z - seg.start.z
      totalLength += Math.sqrt(dx * dx + dy * dy + dz * dz)
    } else if (seg.type === 'arc') {
      totalLength += seg.radius * Math.abs(seg.endAngle - seg.startAngle)
    }
  })

  const steps = pathData3d.segments.length * radialSegments
  const geometry = new THREE.ExtrudeGeometry(shape, {
    steps, bevelEnabled: false, extrudePath: pathCurve, curveSegments: radialSegments
  })

  const mesh = new THREE.Mesh(geometry, createPipeMaterial())
  mesh.userData.isOuterSurface = true
  if (assemblyItemId) mesh.userData.assemblyItemId = assemblyItemId

  const pipeGroup = new THREE.Group()
  pipeGroup.add(mesh)

  // 端面
  const endCapMaterial = createEndCapMaterial()
  const hitboxMaterial = getHitboxMaterial()

  const startPoint = new THREE.Vector3()
  pathCurve.getPoint(0, startPoint)
  const startTangent = new THREE.Vector3()
  pathCurve.getTangent(0, startTangent)
  const startNormal = startTangent.clone().multiplyScalar(-1)

  const startCap = new THREE.Mesh(createEndCapForPath(innerRadius, outerRadius, startPoint, startNormal, radialSegments), endCapMaterial)
  setupEndFaceUserData(startCap, 'front', startPoint.clone(), startNormal.clone(), assemblyItemId)
  const startHitbox = new THREE.Mesh(createHitboxForPath(outerRadius * 1.1, startPoint, startNormal, radialSegments), hitboxMaterial)
  setupEndFaceUserData(startHitbox, 'front', startPoint.clone(), startNormal.clone(), assemblyItemId)

  const endPoint = new THREE.Vector3()
  pathCurve.getPoint(1, endPoint)
  const endTangent = new THREE.Vector3()
  pathCurve.getTangent(1, endTangent)
  const endNormal = endTangent.clone()

  const endCap = new THREE.Mesh(createEndCapForPath(innerRadius, outerRadius, endPoint, endNormal, radialSegments), endCapMaterial)
  setupEndFaceUserData(endCap, 'back', endPoint.clone(), endNormal.clone(), assemblyItemId)
  const endHitbox = new THREE.Mesh(createHitboxForPath(outerRadius * 1.1, endPoint, endNormal, radialSegments), hitboxMaterial)
  setupEndFaceUserData(endHitbox, 'back', endPoint.clone(), endNormal.clone(), assemblyItemId)

  pipeGroup.add(startCap, endCap, startHitbox, endHitbox)

  const box = new THREE.Box3().setFromObject(pipeGroup)
  const size = box.getSize(new THREE.Vector3())
  const groupSize = Math.max(size.x, size.y, size.z)

  return { pipeGroup, groupSize }
}
