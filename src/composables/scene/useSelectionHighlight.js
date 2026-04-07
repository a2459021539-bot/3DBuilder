import * as THREE from 'three'
import { updateBatchedProxyMatrices } from '../../utils/batchedProxy.js'

export function useSelectionHighlight(ctx) {
  const findPipeGroupByAssemblyId = (assemblyId) => {
    if (!ctx.previewPipe || !assemblyId) return null
    let target = null
    ctx.previewPipe.children.forEach(child => {
      if (child.userData && child.userData.assemblyItemId === assemblyId) {
        target = child
      }
    })
    return target
  }

  const highlightPipeGroupForSelection = (pipeGroup) => {
    if (!pipeGroup) return
    pipeGroup.traverse((child) => {
      if (child instanceof THREE.Mesh && child.material) {
        if (!ctx.selectionHighlightMap.has(child)) {
          ctx.selectionHighlightMap.set(child, child.material)
        }
        const mat = child.material.clone()
        if (mat.emissive) {
          mat.emissive.set(0xffaa00)
          mat.emissiveIntensity = 0.6
        }
        child.material = mat
      }
    })
  }

  const restorePipeGroupForSelection = (pipeGroup) => {
    if (!pipeGroup) return
    pipeGroup.traverse((child) => {
      if (child instanceof THREE.Mesh && ctx.selectionHighlightMap.has(child)) {
        child.material = ctx.selectionHighlightMap.get(child)
        ctx.selectionHighlightMap.delete(child)
      }
    })
  }

  const updateSelectionHighlight = (selectedIds) => {
    if (!ctx.previewPipe || !ctx.isAssemblyMode) return
    // Clear all existing highlights
    ctx.selectionHighlightMap.forEach((originalMaterial, child) => {
      if (child instanceof THREE.Mesh) {
        child.material = originalMaterial
      }
    })
    ctx.selectionHighlightMap.clear()
    ctx.selectedAssemblyItemIds.clear()
    if (selectedIds && selectedIds.length > 0) {
      selectedIds.forEach(id => {
        ctx.selectedAssemblyItemIds.add(id)
        updateBatchedProxyMatrices(id)
        const pipeGroup = findPipeGroupByAssemblyId(id)
        if (pipeGroup) {
          highlightPipeGroupForSelection(pipeGroup)
        }
      })
    }
  }

  const clearArraySelection = () => {
    updateSelectionHighlight([])
    window.dispatchEvent(new CustomEvent('array-selection-changed', {
      detail: { selectedIds: [] }
    }))
  }

  return {
    findPipeGroupByAssemblyId,
    highlightPipeGroupForSelection,
    restorePipeGroupForSelection,
    updateSelectionHighlight,
    clearArraySelection
  }
}
