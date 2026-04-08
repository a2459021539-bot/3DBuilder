import * as THREE from 'three'
import {
  highlightProxyItem,
  unhighlightProxyItem,
  unhighlightAllProxyItems,
  updateBatchedProxyMatrices
} from '../../utils/batchedProxy.js'

/**
 * Selection highlight via vertex colors in the merged proxy.
 *
 * Key optimization: highlighting does NOT pop items out of the proxy.
 * Instead it tints vertices in-place → 0 extra draw calls, 0 extra meshes.
 * Only drag/move/rotate pops items (via updateBatchedProxyMatrices).
 */
export function useSelectionHighlight(ctx) {
  // O(1) lookup cache
  const _pipeGroupCache = new Map()
  // Currently highlighted IDs (for incremental diff)
  const _highlightedIds = new Set()

  const findPipeGroupByAssemblyId = (assemblyId) => {
    if (!ctx.previewPipe || !assemblyId) return null
    const cached = _pipeGroupCache.get(assemblyId)
    if (cached && cached.parent === ctx.previewPipe) return cached
    const children = ctx.previewPipe.children
    for (let i = 0, len = children.length; i < len; i++) {
      const child = children[i]
      if (child.userData && child.userData.assemblyItemId === assemblyId) {
        _pipeGroupCache.set(assemblyId, child)
        return child
      }
    }
    return null
  }

  const invalidateCache = () => { _pipeGroupCache.clear() }

  // Legacy API — still used by join interaction for end-face highlight (individual mesh)
  const highlightPipeGroupForSelection = (pipeGroup) => {}
  const restorePipeGroupForSelection = (pipeGroup) => {}

  const updateSelectionHighlight = (selectedIds) => {
    if (!ctx.previewPipe || !ctx.isAssemblyMode) return

    const newSet = new Set(selectedIds || [])

    // Incremental diff: unhighlight removed, highlight added
    for (const id of _highlightedIds) {
      if (!newSet.has(id)) {
        unhighlightProxyItem(id)
      }
    }
    for (const id of newSet) {
      if (!_highlightedIds.has(id)) {
        highlightProxyItem(id)
      }
    }

    _highlightedIds.clear()
    newSet.forEach(id => _highlightedIds.add(id))

    ctx.selectedAssemblyItemIds.clear()
    newSet.forEach(id => ctx.selectedAssemblyItemIds.add(id))
  }

  const clearArraySelection = () => {
    updateSelectionHighlight([])
    window.dispatchEvent(new CustomEvent('array-selection-changed', {
      detail: { selectedIds: [] }
    }))
  }

  return {
    findPipeGroupByAssemblyId,
    invalidateCache,
    highlightPipeGroupForSelection,
    restorePipeGroupForSelection,
    updateSelectionHighlight,
    clearArraySelection
  }
}
