import * as THREE from 'three'
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { createPipeMaterial, createEndCapMaterial } from './pipeCommon.js'

let mergedPipeMesh = null
let mergedCapMesh = null

// Proxy-specific materials with vertexColors enabled (separate from shared materials)
let _proxyPipeMat = null
let _proxyCapMat = null

function getProxyPipeMaterial() {
  if (!_proxyPipeMat) {
    const base = createPipeMaterial()
    _proxyPipeMat = base.clone()
    _proxyPipeMat.vertexColors = true
  }
  return _proxyPipeMat
}

function getProxyCapMaterial() {
  if (!_proxyCapMat) {
    const base = createEndCapMaterial()
    _proxyCapMat = base.clone()
    _proxyCapMat.vertexColors = true
    _proxyCapMat.side = THREE.DoubleSide
  }
  return _proxyCapMat
}

// Vertex ranges per assembly item
const pipeRanges = new Map()
const capRanges = new Map()

// Default color (white = no tint, material color shows through)
const DEFAULT_R = 1, DEFAULT_G = 1, DEFAULT_B = 1
// Highlight color — vivid bright green
const HL_R = 0.5, HL_G = 2.5, HL_B = 0.5

// Track highlighted items
const _highlightedItems = new Set()

export function buildBatchedProxy(assemblyGroup, scene, shadowsEnabled) {
  clearBatchedProxy(scene)
  if (!assemblyGroup) return

  assemblyGroup.updateMatrixWorld(true)

  const pipeGeoms = []
  const capGeoms = []

  let pipeVertexOffset = 0
  let capVertexOffset = 0

  assemblyGroup.traverse(child => {
    if (child.isMesh && child.geometry && child.visible) {
      if (child.layers.test(1) && !child.layers.test(0)) return

      const isPipe = child.userData.isOuterSurface
      const geom = child.geometry.clone()

      if (!geom.index && geom.attributes.position) {
        const vCount = geom.attributes.position.count
        const indices = new Uint32Array(vCount)
        for (let i = 0; i < vCount; i++) indices[i] = i
        geom.setIndex(new THREE.BufferAttribute(indices, 1))
      }

      geom.applyMatrix4(child.matrixWorld)
      const vCount = geom.attributes.position.count

      const asmId = child.userData.assemblyItemId
      if (asmId) {
        if (isPipe) {
          if (!pipeRanges.has(asmId)) pipeRanges.set(asmId, [])
          pipeRanges.get(asmId).push({ start: pipeVertexOffset, count: vCount, originalChild: child })
          pipeVertexOffset += vCount
          pipeGeoms.push(geom)
        } else {
          if (!capRanges.has(asmId)) capRanges.set(asmId, [])
          capRanges.get(asmId).push({ start: capVertexOffset, count: vCount, originalChild: child })
          capVertexOffset += vCount
          capGeoms.push(geom)
        }
      }

      // Hide original mesh
      child.layers.set(2)
    }
  })

  if (pipeGeoms.length > 0) {
    const mergedGeom = BufferGeometryUtils.mergeGeometries(pipeGeoms, false)
    // Add vertex color attribute (initialized to white = no tint)
    _addVertexColors(mergedGeom)
    mergedPipeMesh = new THREE.Mesh(mergedGeom, getProxyPipeMaterial())
    mergedPipeMesh.castShadow = shadowsEnabled
    mergedPipeMesh.receiveShadow = shadowsEnabled
    mergedPipeMesh.matrixAutoUpdate = false
    mergedPipeMesh.frustumCulled = false
    scene.add(mergedPipeMesh)
  }

  if (capGeoms.length > 0) {
    const mergedGeom = BufferGeometryUtils.mergeGeometries(capGeoms, false)
    _addVertexColors(mergedGeom)
    mergedCapMesh = new THREE.Mesh(mergedGeom, getProxyCapMaterial())
    mergedCapMesh.castShadow = shadowsEnabled
    mergedCapMesh.receiveShadow = shadowsEnabled
    mergedCapMesh.matrixAutoUpdate = false
    mergedCapMesh.frustumCulled = false
    scene.add(mergedCapMesh)
  }

  pipeGeoms.forEach(g => g.dispose())
  capGeoms.forEach(g => g.dispose())
  _highlightedItems.clear()
}

function _addVertexColors(geom) {
  const count = geom.attributes.position.count
  const colors = new Float32Array(count * 3)
  for (let i = 0; i < count; i++) {
    colors[i * 3] = DEFAULT_R
    colors[i * 3 + 1] = DEFAULT_G
    colors[i * 3 + 2] = DEFAULT_B
  }
  geom.setAttribute('color', new THREE.BufferAttribute(colors, 3))
}

function _tintRanges(mesh, ranges, r, g, b) {
  if (!mesh || !ranges) return
  const colors = mesh.geometry.attributes.color
  if (!colors) return
  for (const range of ranges) {
    for (let i = 0; i < range.count; i++) {
      const idx = range.start + i
      colors.array[idx * 3] = r
      colors.array[idx * 3 + 1] = g
      colors.array[idx * 3 + 2] = b
    }
  }
  colors.needsUpdate = true
}

export function clearBatchedProxy(scene) {
  if (mergedPipeMesh) {
    scene.remove(mergedPipeMesh)
    mergedPipeMesh.geometry.dispose()
    mergedPipeMesh = null
  }
  if (mergedCapMesh) {
    scene.remove(mergedCapMesh)
    mergedCapMesh.geometry.dispose()
    mergedCapMesh = null
  }
  pipeRanges.clear()
  capRanges.clear()
  _highlightedItems.clear()
}

/**
 * Highlight an item in the merged proxy via vertex colors.
 * NO popping, NO extra draw calls, NO NaN.
 */
export function highlightProxyItem(assemblyItemId) {
  if (_highlightedItems.has(assemblyItemId)) return
  _highlightedItems.add(assemblyItemId)

  const pR = pipeRanges.get(assemblyItemId)
  if (pR) _tintRanges(mergedPipeMesh, pR, HL_R, HL_G, HL_B)

  const cR = capRanges.get(assemblyItemId)
  if (cR) _tintRanges(mergedCapMesh, cR, HL_R, HL_G, HL_B)
}

/**
 * Remove highlight — reset vertex colors to default.
 */
export function unhighlightProxyItem(assemblyItemId) {
  if (!_highlightedItems.has(assemblyItemId)) return
  _highlightedItems.delete(assemblyItemId)

  const pR = pipeRanges.get(assemblyItemId)
  if (pR) _tintRanges(mergedPipeMesh, pR, DEFAULT_R, DEFAULT_G, DEFAULT_B)

  const cR = capRanges.get(assemblyItemId)
  if (cR) _tintRanges(mergedCapMesh, cR, DEFAULT_R, DEFAULT_G, DEFAULT_B)
}

/**
 * Remove all highlights.
 */
export function unhighlightAllProxyItems() {
  for (const id of _highlightedItems) {
    const pR = pipeRanges.get(id)
    if (pR) _tintRanges(mergedPipeMesh, pR, DEFAULT_R, DEFAULT_G, DEFAULT_B)
    const cR = capRanges.get(id)
    if (cR) _tintRanges(mergedCapMesh, cR, DEFAULT_R, DEFAULT_G, DEFAULT_B)
  }
  _highlightedItems.clear()
}

/**
 * Pop an item out of the proxy (for drag/move/rotate — needs individual mesh).
 * Shows original mesh on layer 0, hides in proxy via NaN.
 */
export function updateBatchedProxyMatrices(assemblyItemId) {
  // Unhighlight first if highlighted
  unhighlightProxyItem(assemblyItemId)

  const pRanges = pipeRanges.get(assemblyItemId)
  if (pRanges) _hideRanges(mergedPipeMesh, pRanges)

  const cRanges = capRanges.get(assemblyItemId)
  if (cRanges) _hideRanges(mergedCapMesh, cRanges)
}

function _hideRanges(mesh, ranges) {
  if (!mesh || !ranges) return
  const pos = mesh.geometry.attributes.position
  ranges.forEach(r => {
    if (r.originalChild) r.originalChild.layers.set(0)
    for (let i = 0; i < r.count; i++) {
      pos.setXYZ(r.start + i, NaN, NaN, NaN)
    }
  })
  pos.needsUpdate = true
}

export function unhideAllOriginals(assemblyGroup) {
  if (!assemblyGroup) return
  assemblyGroup.traverse(child => {
    if (child.isMesh && child.layers.test(2)) {
      child.layers.set(0)
    }
  })
}

export function setProxyFlatShading(enabled) {
  if (_proxyPipeMat) { _proxyPipeMat.flatShading = enabled; _proxyPipeMat.needsUpdate = true }
  if (_proxyCapMat) { _proxyCapMat.flatShading = enabled; _proxyCapMat.needsUpdate = true }
}

export function setBatchedProxyVisible(visible) {
  if (mergedPipeMesh) mergedPipeMesh.visible = visible
  if (mergedCapMesh) mergedCapMesh.visible = visible
}

export function setCapProxyVisible(visible) {
  if (mergedCapMesh) mergedCapMesh.visible = visible
}
