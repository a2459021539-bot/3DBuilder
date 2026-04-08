import * as THREE from 'three'
import { createPipeObject } from './pipeFactory.js'
import { createPipeMaterial, createEndCapMaterial } from './pipeCommon.js'

/**
 * InstancedMesh 装配体管理器
 *
 * 核心思路：按 paramsFingerprint 分组，每组 1 个 InstancedMesh（管体/前端面/后端面）。
 * N 个零件只需 ~3F 个场景节点（F = 唯一指纹数，通常 1-20），而非 5N 个。
 *
 * 对外 API：
 *   init / clear / rebuildAll
 *   addItem / removeItem / updateItemTransform
 *   highlightItem / unhighlightItem / unhighlightAll
 *   popOutItem / pushBackItem          (拖拽/旋转时临时弹出)
 *   getAllInstancedMeshes               (供 raycaster 使用)
 *   getItemFromHit                     (raycast hit → assemblyItemId)
 *   getEndFaceInfo                     (assemblyItemId → 世界坐标端面位置/法线)
 */

// ── 常量 ──────────────────────────────────────────────────────
const DEFAULT_COLOR = new THREE.Color(1, 1, 1)
const HIGHLIGHT_COLOR = new THREE.Color(0.5, 2.5, 0.5)
const INITIAL_CAPACITY = 64

const _tmpMatrix = new THREE.Matrix4()
const _tmpPosition = new THREE.Vector3()
const _tmpQuaternion = new THREE.Quaternion()
const _tmpScale = new THREE.Vector3(1, 1, 1)
const _tmpEuler = new THREE.Euler()

// ── 桶结构 ────────────────────────────────────────────────────
class FingerprintBucket {
  constructor(fingerprint, templateGroup, scene, shadowsEnabled) {
    this.fingerprint = fingerprint
    this.scene = scene

    // 从模板 Group 提取几何体和端面信息
    this.pipeGeometry = null
    this.frontCapGeometry = null
    this.backCapGeometry = null
    this.frontEndFace = null   // { localPos, localNormal }
    this.backEndFace = null
    this.templateGroupQuaternion = new THREE.Quaternion()

    // 提取模板组的旋转（直管 rotation.x=π/2 等）
    this.templateGroupQuaternion.setFromEuler(templateGroup.rotation)

    templateGroup.traverse(child => {
      if (!child.isMesh) return

      // 跳过碰撞体
      if (child.material && child.material.transparent && child.material.opacity === 0) return

      if (child.userData.isOuterSurface) {
        this.pipeGeometry = child.geometry
        // 烘焙 mesh 的局部变换（如弯管的 position.x = -bendRadius）
        if (child.position.x !== 0 || child.position.y !== 0 || child.position.z !== 0 ||
            child.rotation.x !== 0 || child.rotation.y !== 0 || child.rotation.z !== 0) {
          this.pipeGeometry = child.geometry.clone()
          child.updateMatrix()
          this.pipeGeometry.applyMatrix4(child.matrix)
        }
      } else if (child.userData.isEndFace) {
        const type = child.userData.endFaceType
        if (type === 'front') {
          this.frontCapGeometry = child.geometry
          this.frontEndFace = {
            localPos: child.userData.endFacePosition.clone(),
            localNormal: child.userData.endFaceNormal.clone()
          }
        } else if (type === 'back') {
          this.backCapGeometry = child.geometry
          this.backEndFace = {
            localPos: child.userData.endFacePosition.clone(),
            localNormal: child.userData.endFaceNormal.clone()
          }
        }
      }
    })

    // 实例数据
    this.itemToIndex = new Map()   // assemblyItemId → instance index
    this.indexToItem = []          // instance index → assemblyItemId
    this.count = 0
    this.capacity = 0

    // InstancedMesh
    this.pipeMesh = null
    this.frontCapMesh = null
    this.backCapMesh = null

    this.shadowsEnabled = shadowsEnabled
  }

  /** 确保容量足够 */
  _ensureCapacity(needed) {
    if (needed <= this.capacity) return

    const newCap = Math.max(needed, this.capacity * 2, INITIAL_CAPACITY)

    // 管体
    if (this.pipeGeometry) {
      const oldMesh = this.pipeMesh
      this.pipeMesh = this._createInstancedMesh(this.pipeGeometry, _getPipeMaterial(), newCap)
      this.pipeMesh.userData._role = 'pipe'
      this.pipeMesh.userData._bucket = this
      if (oldMesh) { this._copyInstances(oldMesh, this.pipeMesh); this.scene.remove(oldMesh); oldMesh.dispose() }
      this.scene.add(this.pipeMesh)
    }

    // 前端面
    if (this.frontCapGeometry) {
      const oldMesh = this.frontCapMesh
      this.frontCapMesh = this._createInstancedMesh(this.frontCapGeometry, _getCapMaterial(), newCap)
      this.frontCapMesh.userData._role = 'frontCap'
      this.frontCapMesh.userData._bucket = this
      if (oldMesh) { this._copyInstances(oldMesh, this.frontCapMesh); this.scene.remove(oldMesh); oldMesh.dispose() }
      this.scene.add(this.frontCapMesh)
    }

    // 后端面
    if (this.backCapGeometry) {
      const oldMesh = this.backCapMesh
      this.backCapMesh = this._createInstancedMesh(this.backCapGeometry, _getCapMaterial(), newCap)
      this.backCapMesh.userData._role = 'backCap'
      this.backCapMesh.userData._bucket = this
      if (oldMesh) { this._copyInstances(oldMesh, this.backCapMesh); this.scene.remove(oldMesh); oldMesh.dispose() }
      this.scene.add(this.backCapMesh)
    }

    this.capacity = newCap
  }

  _createInstancedMesh(geometry, material, capacity) {
    const mesh = new THREE.InstancedMesh(geometry, material, capacity)
    mesh.count = this.count
    mesh.castShadow = this.shadowsEnabled
    mesh.receiveShadow = this.shadowsEnabled
    mesh.frustumCulled = false
    // 初始化 instanceColor
    mesh.instanceColor = new THREE.InstancedBufferAttribute(
      new Float32Array(capacity * 3).fill(1), 3
    )
    return mesh
  }

  _copyInstances(oldMesh, newMesh) {
    const n = this.count
    // 拷贝矩阵
    for (let i = 0; i < n; i++) {
      oldMesh.getMatrixAt(i, _tmpMatrix)
      newMesh.setMatrixAt(i, _tmpMatrix)
    }
    // 拷贝颜色
    if (oldMesh.instanceColor && newMesh.instanceColor) {
      const src = oldMesh.instanceColor.array
      const dst = newMesh.instanceColor.array
      for (let i = 0; i < n * 3; i++) dst[i] = src[i]
    }
    newMesh.count = n
    newMesh.instanceMatrix.needsUpdate = true
    if (newMesh.instanceColor) newMesh.instanceColor.needsUpdate = true
  }

  /** 计算实例矩阵：itemPosition + itemRotation + templateGroupQuaternion */
  _composeMatrix(position, rotation) {
    // 先应用模板组的旋转（如直管的 rotation.x=π/2），再应用零件自身旋转
    _tmpEuler.set(rotation.x || 0, rotation.y || 0, rotation.z || 0)
    _tmpQuaternion.setFromEuler(_tmpEuler)
    _tmpQuaternion.multiply(this.templateGroupQuaternion)

    _tmpPosition.set(position.x || 0, position.y || 0, position.z || 0)
    _tmpScale.set(1, 1, 1)
    _tmpMatrix.compose(_tmpPosition, _tmpQuaternion, _tmpScale)
    return _tmpMatrix
  }

  /** 添加实例 */
  addInstance(assemblyItemId, position, rotation) {
    this._ensureCapacity(this.count + 1)

    const idx = this.count
    this.itemToIndex.set(assemblyItemId, idx)
    this.indexToItem[idx] = assemblyItemId
    this.count++

    this._composeMatrix(position, rotation)
    this._setAllMeshMatrix(idx, _tmpMatrix)
    this._setAllMeshColor(idx, DEFAULT_COLOR)
    this._updateCounts()
  }

  /** 移除实例（与末尾交换） */
  removeInstance(assemblyItemId) {
    const idx = this.itemToIndex.get(assemblyItemId)
    if (idx === undefined) return
    const lastIdx = this.count - 1

    if (idx !== lastIdx) {
      // 将末尾移到被删除的位置
      const lastId = this.indexToItem[lastIdx]
      // 拷贝矩阵和颜色
      this._swapInstances(idx, lastIdx)
      this.itemToIndex.set(lastId, idx)
      this.indexToItem[idx] = lastId
    }

    this.itemToIndex.delete(assemblyItemId)
    this.indexToItem.length = lastIdx
    this.count--
    this._updateCounts()
  }

  /** 更新实例变换 */
  updateTransform(assemblyItemId, position, rotation) {
    const idx = this.itemToIndex.get(assemblyItemId)
    if (idx === undefined) return
    this._composeMatrix(position, rotation)
    this._setAllMeshMatrix(idx, _tmpMatrix)
  }

  /** 高亮 */
  highlight(assemblyItemId) {
    const idx = this.itemToIndex.get(assemblyItemId)
    if (idx === undefined) return
    this._setAllMeshColor(idx, HIGHLIGHT_COLOR)
  }

  /** 取消高亮 */
  unhighlight(assemblyItemId) {
    const idx = this.itemToIndex.get(assemblyItemId)
    if (idx === undefined) return
    this._setAllMeshColor(idx, DEFAULT_COLOR)
  }

  /** 隐藏实例（弹出时用缩放为 0 的矩阵） */
  hideInstance(assemblyItemId) {
    const idx = this.itemToIndex.get(assemblyItemId)
    if (idx === undefined) return
    _tmpMatrix.makeScale(0, 0, 0)
    this._setAllMeshMatrix(idx, _tmpMatrix)
  }

  /** 恢复实例可见 */
  showInstance(assemblyItemId, position, rotation) {
    this.updateTransform(assemblyItemId, position, rotation)
  }

  /** 获取端面世界信息 */
  getEndFaceWorld(assemblyItemId, endFaceType) {
    const idx = this.itemToIndex.get(assemblyItemId)
    if (idx === undefined) return null

    const ef = endFaceType === 'front' ? this.frontEndFace : this.backEndFace
    if (!ef) return null

    // 读取实例矩阵
    if (this.pipeMesh) this.pipeMesh.getMatrixAt(idx, _tmpMatrix)
    else return null

    const pos = ef.localPos.clone().applyMatrix4(_tmpMatrix)
    const normalMatrix = new THREE.Matrix3().getNormalMatrix(_tmpMatrix)
    const normal = ef.localNormal.clone().applyMatrix3(normalMatrix).normalize()

    return { position: pos, normal }
  }

  /** 获取所有 InstancedMesh 对象 */
  getMeshes() {
    const result = []
    if (this.pipeMesh) result.push(this.pipeMesh)
    if (this.frontCapMesh) result.push(this.frontCapMesh)
    if (this.backCapMesh) result.push(this.backCapMesh)
    return result
  }

  /** 清理 */
  dispose() {
    if (this.pipeMesh) { this.scene.remove(this.pipeMesh); this.pipeMesh.dispose() }
    if (this.frontCapMesh) { this.scene.remove(this.frontCapMesh); this.frontCapMesh.dispose() }
    if (this.backCapMesh) { this.scene.remove(this.backCapMesh); this.backCapMesh.dispose() }
    // 不 dispose 几何体 —— 可能被缓存复用
    this.itemToIndex.clear()
    this.indexToItem.length = 0
    this.count = 0
    this.capacity = 0
  }

  // ── 内部工具 ──

  _setAllMeshMatrix(idx, matrix) {
    if (this.pipeMesh) { this.pipeMesh.setMatrixAt(idx, matrix); this.pipeMesh.instanceMatrix.needsUpdate = true }
    if (this.frontCapMesh) { this.frontCapMesh.setMatrixAt(idx, matrix); this.frontCapMesh.instanceMatrix.needsUpdate = true }
    if (this.backCapMesh) { this.backCapMesh.setMatrixAt(idx, matrix); this.backCapMesh.instanceMatrix.needsUpdate = true }
  }

  _setAllMeshColor(idx, color) {
    if (this.pipeMesh) { this.pipeMesh.setColorAt(idx, color); this.pipeMesh.instanceColor.needsUpdate = true }
    if (this.frontCapMesh) { this.frontCapMesh.setColorAt(idx, color); this.frontCapMesh.instanceColor.needsUpdate = true }
    if (this.backCapMesh) { this.backCapMesh.setColorAt(idx, color); this.backCapMesh.instanceColor.needsUpdate = true }
  }

  _swapInstances(idxA, idxB) {
    const meshes = [this.pipeMesh, this.frontCapMesh, this.backCapMesh]
    const matA = new THREE.Matrix4()
    const matB = new THREE.Matrix4()
    const colA = new THREE.Color()
    const colB = new THREE.Color()

    for (const mesh of meshes) {
      if (!mesh) continue
      mesh.getMatrixAt(idxA, matA)
      mesh.getMatrixAt(idxB, matB)
      mesh.setMatrixAt(idxA, matB)
      mesh.setMatrixAt(idxB, matA)
      mesh.instanceMatrix.needsUpdate = true

      if (mesh.instanceColor) {
        mesh.getColorAt(idxA, colA)
        mesh.getColorAt(idxB, colB)
        mesh.setColorAt(idxA, colB)
        mesh.setColorAt(idxB, colA)
        mesh.instanceColor.needsUpdate = true
      }
    }
  }

  _updateCounts() {
    if (this.pipeMesh) this.pipeMesh.count = this.count
    if (this.frontCapMesh) this.frontCapMesh.count = this.count
    if (this.backCapMesh) this.backCapMesh.count = this.count
  }
}

// ── 共享材质（带 vertexColors 的克隆） ─────────────────────────
let _pipeMat = null
let _capMat = null

function _getPipeMaterial() {
  if (!_pipeMat) {
    _pipeMat = createPipeMaterial().clone()
    _pipeMat.vertexColors = true
  }
  return _pipeMat
}

function _getCapMaterial() {
  if (!_capMat) {
    _capMat = createEndCapMaterial().clone()
    _capMat.vertexColors = true
    _capMat.side = THREE.DoubleSide
  }
  return _capMat
}

// ── 管理器（单例） ────────────────────────────────────────────
let _scene = null
let _shadowsEnabled = false

/** fingerprint → FingerprintBucket */
const _buckets = new Map()

/** assemblyItemId → { bucket, fingerprint } */
const _itemRegistry = new Map()

/** assemblyItemId → { position, rotation } */
const _itemTransforms = new Map()

/** 弹出中的零件 → 临时 Group */
const _poppedItems = new Map()

/** 几何模板缓存：fingerprint → templateGroup（避免重复 createPipeObject） */
const _templateCache = new Map()

// ── 对外 API ──────────────────────────────────────────────────

export function init(scene, shadowsEnabled) {
  _scene = scene
  _shadowsEnabled = shadowsEnabled
}

export function clear() {
  _buckets.forEach(b => b.dispose())
  _buckets.clear()
  _itemRegistry.clear()
  _itemTransforms.clear()
  // 清理弹出的临时 Group
  _poppedItems.forEach((group) => {
    if (_scene) _scene.remove(group)
  })
  _poppedItems.clear()
  // 不清除 _templateCache —— 跨重建复用
}

export function clearTemplateCache() {
  _templateCache.forEach(({ group }) => {
    group.traverse(obj => {
      if (obj.isMesh && obj.geometry) obj.geometry.dispose()
    })
  })
  _templateCache.clear()
}

/**
 * 添加零件
 * @param {string} assemblyItemId
 * @param {string} fingerprint    - paramsFingerprint 结果
 * @param {object} paramsWithType - 完整管道参数（含 type）
 * @param {object} position       - { x, y, z }
 * @param {object} rotation       - { x, y, z }
 */
export function addItem(assemblyItemId, fingerprint, paramsWithType, position, rotation) {
  if (_itemRegistry.has(assemblyItemId)) return // 防重复

  let bucket = _buckets.get(fingerprint)
  if (!bucket) {
    // 首次见到此指纹 —— 创建模板
    let template = _templateCache.get(fingerprint)
    if (!template) {
      const group = createPipeObject(paramsWithType, '__template__')
      if (!group) return
      template = { group }
      _templateCache.set(fingerprint, template)
    }
    bucket = new FingerprintBucket(fingerprint, template.group, _scene, _shadowsEnabled)
    _buckets.set(fingerprint, bucket)
  }

  bucket.addInstance(assemblyItemId, position || { x: 0, y: 0, z: 0 }, rotation || { x: 0, y: 0, z: 0 })
  _itemRegistry.set(assemblyItemId, { bucket, fingerprint })
  _itemTransforms.set(assemblyItemId, {
    position: { x: position?.x || 0, y: position?.y || 0, z: position?.z || 0 },
    rotation: { x: rotation?.x || 0, y: rotation?.y || 0, z: rotation?.z || 0 }
  })
}

export function removeItem(assemblyItemId) {
  const reg = _itemRegistry.get(assemblyItemId)
  if (!reg) return
  reg.bucket.removeInstance(assemblyItemId)
  _itemRegistry.delete(assemblyItemId)
  _itemTransforms.delete(assemblyItemId)

  // 如果桶空了，清理
  if (reg.bucket.count === 0) {
    reg.bucket.dispose()
    _buckets.delete(reg.fingerprint)
  }
}

export function updateItemTransform(assemblyItemId, position, rotation) {
  const reg = _itemRegistry.get(assemblyItemId)
  if (!reg) return
  reg.bucket.updateTransform(assemblyItemId, position, rotation)
  const t = _itemTransforms.get(assemblyItemId)
  if (t) {
    t.position = { x: position.x || 0, y: position.y || 0, z: position.z || 0 }
    t.rotation = { x: rotation.x || 0, y: rotation.y || 0, z: rotation.z || 0 }
  }
}

export function highlightItem(assemblyItemId) {
  const reg = _itemRegistry.get(assemblyItemId)
  if (reg) reg.bucket.highlight(assemblyItemId)
}

export function unhighlightItem(assemblyItemId) {
  const reg = _itemRegistry.get(assemblyItemId)
  if (reg) reg.bucket.unhighlight(assemblyItemId)
}

export function unhighlightAll() {
  _itemRegistry.forEach((reg, id) => reg.bucket.unhighlight(id))
}

/**
 * 弹出零件（拖拽/旋转时用）
 * 在 InstancedMesh 中隐藏，返回临时独立 Group
 */
export function popOutItem(assemblyItemId) {
  if (_poppedItems.has(assemblyItemId)) return _poppedItems.get(assemblyItemId)

  const reg = _itemRegistry.get(assemblyItemId)
  if (!reg) return null

  const t = _itemTransforms.get(assemblyItemId)
  if (!t) return null

  // 隐藏实例
  reg.bucket.hideInstance(assemblyItemId)

  // 创建临时 Group
  const template = _templateCache.get(reg.fingerprint)
  if (!template) return null

  const tmpGroup = template.group.clone(true)
  tmpGroup.userData.assemblyItemId = assemblyItemId
  tmpGroup.traverse(child => {
    if (child.userData) child.userData.assemblyItemId = assemblyItemId
    // 恢复 layer 0（模板可能在 layer 2）
    if (child.isMesh) child.layers.set(0)
  })
  tmpGroup.position.set(t.position.x, t.position.y, t.position.z)
  tmpGroup.rotation.set(t.rotation.x, t.rotation.y, t.rotation.z)
  tmpGroup.updateMatrixWorld(true)

  if (_scene) _scene.add(tmpGroup)
  _poppedItems.set(assemblyItemId, tmpGroup)
  return tmpGroup
}

/**
 * 归还零件（拖拽结束）
 * 读取临时 Group 的变换写回 InstancedMesh
 */
export function pushBackItem(assemblyItemId) {
  const tmpGroup = _poppedItems.get(assemblyItemId)
  if (!tmpGroup) return

  const pos = tmpGroup.position
  const rot = tmpGroup.rotation
  const position = { x: pos.x, y: pos.y, z: pos.z }
  const rotation = { x: rot.x, y: rot.y, z: rot.z }

  // 恢复实例可见
  const reg = _itemRegistry.get(assemblyItemId)
  if (reg) reg.bucket.showInstance(assemblyItemId, position, rotation)

  // 更新存储
  const t = _itemTransforms.get(assemblyItemId)
  if (t) { t.position = position; t.rotation = rotation }

  // 移除临时 Group
  if (_scene) _scene.remove(tmpGroup)
  _poppedItems.delete(assemblyItemId)
}

/**
 * 获取所有 InstancedMesh（供 raycaster 使用）
 */
export function getAllInstancedMeshes() {
  const result = []
  _buckets.forEach(bucket => {
    result.push(...bucket.getMeshes())
  })
  return result
}

/**
 * 从 raycast hit 解析出 assemblyItemId 和角色信息
 * @param {Object} hit - raycaster intersection 结果
 * @returns {{ assemblyItemId: string, role: string } | null}
 */
export function getItemFromHit(hit) {
  if (!hit || !hit.object || !hit.object.isInstancedMesh) return null
  const mesh = hit.object
  const bucket = mesh.userData._bucket
  const role = mesh.userData._role
  if (!bucket || hit.instanceId === undefined) return null

  const assemblyItemId = bucket.indexToItem[hit.instanceId]
  if (!assemblyItemId) return null

  return { assemblyItemId, role }
}

/**
 * 获取端面世界坐标信息
 */
export function getEndFaceInfo(assemblyItemId, endFaceType) {
  const reg = _itemRegistry.get(assemblyItemId)
  if (!reg) return null
  return reg.bucket.getEndFaceWorld(assemblyItemId, endFaceType)
}

/**
 * 获取弹出中的临时 Group
 */
export function getPoppedGroup(assemblyItemId) {
  return _poppedItems.get(assemblyItemId) || null
}

/**
 * 获取零件变换数据
 */
export function getItemTransform(assemblyItemId) {
  return _itemTransforms.get(assemblyItemId) || null
}

/**
 * 检查管理器中是否有任何零件
 */
export function hasItems() {
  return _itemRegistry.size > 0
}

/**
 * 获取零件总数
 */
export function getItemCount() {
  return _itemRegistry.size
}

/** 获取所有零件 ID */
export function getAllItemIds() {
  return new Set(_itemRegistry.keys())
}

/**
 * 全量重建
 */
export function rebuildAll(items, scene, shadowsEnabled) {
  init(scene, shadowsEnabled)
  clear()

  for (const item of items) {
    const paramsWithType = { ...item.params, type: item.type }
    if (item.type === 'sketch2d' && item.params?.pathData) paramsWithType.pathData = item.params.pathData
    if (item.type === 'sketch3d' && item.params?.pathData3d) paramsWithType.pathData3d = item.params.pathData3d

    const fp = paramsFingerprint(paramsWithType)
    addItem(item.id, fp, paramsWithType, item.position, item.rotation)
  }
}

/**
 * 更新阴影设置
 */
export function updateShadows(enabled) {
  _shadowsEnabled = enabled
  _buckets.forEach(bucket => {
    for (const mesh of bucket.getMeshes()) {
      mesh.castShadow = enabled
      mesh.receiveShadow = enabled
    }
  })
}

/**
 * 更新 flatShading
 */
export function setInstancedFlatShading(enabled) {
  if (_pipeMat) { _pipeMat.flatShading = enabled; _pipeMat.needsUpdate = true }
  if (_capMat) { _capMat.flatShading = enabled; _capMat.needsUpdate = true }
}

/**
 * 端面显隐
 */
export function setEndCapsVisible(visible) {
  _buckets.forEach(bucket => {
    if (bucket.frontCapMesh) bucket.frontCapMesh.visible = visible
    if (bucket.backCapMesh) bucket.backCapMesh.visible = visible
  })
}

// ── 指纹计算（从 useAssemblyView 移入） ──────────────────────
export function paramsFingerprint(paramsWithType) {
  const { type, innerDiameter, outerDiameter, length, segments,
    bendRadius, bendAngle, sections, pathData, pathData3d } = paramsWithType
  const pathKey = pathData ? JSON.stringify(pathData) : ''
  const path3dKey = pathData3d ? JSON.stringify(pathData3d) : ''
  const sectionsKey = sections ? JSON.stringify(sections) : ''
  return `${type}|${innerDiameter}|${outerDiameter}|${length}|${segments}|${bendRadius}|${bendAngle}|${sectionsKey}|${pathKey}|${path3dKey}`
}
