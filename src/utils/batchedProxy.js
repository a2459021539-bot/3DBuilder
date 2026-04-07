import * as THREE from 'three'
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { createPipeMaterial, createEndCapMaterial } from './pipeCommon.js'

let mergedPipeMesh = null
let mergedCapMesh = null

// Tracks the vertex ranges for each assembly item so we can "hide" them from the proxy
const pipeRanges = new Map() // assemblyItemId -> { start, count, originalChild }[]
const capRanges = new Map()

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
      
      // Ensure index is generated if missing so mergeGeometries doesn't fail
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

      // Hide original mesh by moving it to logic layer 2
      child.layers.set(2)
    }
  })

  if (pipeGeoms.length > 0) {
    const mergedGeom = BufferGeometryUtils.mergeGeometries(pipeGeoms, false)
    mergedPipeMesh = new THREE.Mesh(mergedGeom, createPipeMaterial())
    mergedPipeMesh.castShadow = shadowsEnabled
    mergedPipeMesh.receiveShadow = shadowsEnabled
    scene.add(mergedPipeMesh)
  }

  if (capGeoms.length > 0) {
    const mergedGeom = BufferGeometryUtils.mergeGeometries(capGeoms, false)
    mergedCapMesh = new THREE.Mesh(mergedGeom, createEndCapMaterial())
    mergedCapMesh.castShadow = shadowsEnabled
    mergedCapMesh.receiveShadow = shadowsEnabled
    scene.add(mergedCapMesh)
  }

  pipeGeoms.forEach(g => g.dispose())
  capGeoms.forEach(g => g.dispose())

  console.log(`[3DBuild] MergedProxy built. Pipes: ${pipeGeoms.length}, Caps: ${capGeoms.length}`)
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
}

function hideRangesInMesh(mesh, ranges) {
  if (!mesh || !ranges) return
  const pos = mesh.geometry.attributes.position
  let updated = false
  ranges.forEach(r => {
    // Reveal the original child mesh
    if (r.originalChild) {
      r.originalChild.layers.set(0)
    }
    // Collapse the merged proxy vertices to NaN so they become invisible (discarded by GPU)
    for (let i = 0; i < r.count; i++) {
      const idx = r.start + i
      pos.setXYZ(idx, NaN, NaN, NaN)
    }
    updated = true
  })
  if (updated) {
    pos.needsUpdate = true
  }
}

export function updateBatchedProxyMatrices(assemblyItemId) {
  // When an item is moved/rotated, we "pop" it out of the merged proxy by collapsing its vertices
  // and restoring the original mesh to Layer 0. From then on, it renders as a standalone mesh.
  const pRanges = pipeRanges.get(assemblyItemId)
  if (pRanges) hideRangesInMesh(mergedPipeMesh, pRanges)

  const cRanges = capRanges.get(assemblyItemId)
  if (cRanges) hideRangesInMesh(mergedCapMesh, cRanges)
}

export function unhideAllOriginals(assemblyGroup) {
  if (!assemblyGroup) return
  assemblyGroup.traverse(child => {
    if (child.isMesh && child.layers.test(2)) {
      child.layers.set(0)
    }
  })
}

export function setBatchedProxyVisible(visible) {
  if (mergedPipeMesh) mergedPipeMesh.visible = visible
  if (mergedCapMesh) mergedCapMesh.visible = visible
}
