import * as THREE from 'three'
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js'

let proxyGroup = null

export function updateVisualProxy(assemblyGroup, scene, pipeMaterial, endCapMaterial) {
  if (proxyGroup) {
    scene.remove(proxyGroup)
    proxyGroup.traverse(child => {
      if (child.geometry) child.geometry.dispose()
      // material is shared, no need to dispose
    })
    proxyGroup = null
  }

  if (!assemblyGroup) return

  const pipeGeometries = []
  const capGeometries = []

  // Ensure all matrices are up to date
  assemblyGroup.updateMatrixWorld(true)

  assemblyGroup.traverse(child => {
    if (child.isMesh && child.visible && child.material && child.geometry) {
      // Skip hitboxes (layer 1)
      if (child.layers.test(1) && !child.layers.test(0)) return
      
      // Hide the original mesh from camera 0, put it in layer 2 (logic layer)
      child.layers.set(2)

      const geom = child.geometry.clone()
      geom.applyMatrix4(child.matrixWorld)

      // Identify material type by checking userData or looking at the original
      if (child.userData.isOuterSurface) {
        pipeGeometries.push(geom)
      } else if (child.userData.isEndFace) {
        capGeometries.push(geom)
      } else {
        // Fallback
        if (child.material === endCapMaterial) capGeometries.push(geom)
        else pipeGeometries.push(geom)
      }
    }
  })

  proxyGroup = new THREE.Group()

  if (pipeGeometries.length > 0) {
    const mergedPipe = BufferGeometryUtils.mergeGeometries(pipeGeometries, false)
    const pipeMesh = new THREE.Mesh(mergedPipe, pipeMaterial)
    pipeMesh.castShadow = true
    pipeMesh.receiveShadow = true
    proxyGroup.add(pipeMesh)
  }

  if (capGeometries.length > 0) {
    const mergedCap = BufferGeometryUtils.mergeGeometries(capGeometries, false)
    const capMesh = new THREE.Mesh(mergedCap, endCapMaterial)
    capMesh.castShadow = true
    capMesh.receiveShadow = true
    proxyGroup.add(capMesh)
  }

  scene.add(proxyGroup)
  
  pipeGeometries.forEach(g => g.dispose())
  capGeometries.forEach(g => g.dispose())

  return proxyGroup
}

export function removeVisualProxy(scene) {
  if (proxyGroup) {
    scene.remove(proxyGroup)
    proxyGroup.traverse(child => {
      if (child.geometry) child.geometry.dispose()
    })
    proxyGroup = null
  }
}

export function unhideAssemblyGroup(assemblyGroup) {
  if (!assemblyGroup) return
  assemblyGroup.traverse(child => {
    if (child.isMesh && child.layers.test(2)) {
      child.layers.set(0)
    }
  })
}
