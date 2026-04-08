import * as InstancedManager from '../../utils/instancedAssemblyManager.js'

/**
 * Selection highlight via InstancedMesh instanceColor.
 *
 * 0 extra draw calls — just tint the instance color in-place.
 */
export function useSelectionHighlight(ctx) {
  const _highlightedIds = new Set()

  const findPipeGroupByAssemblyId = (assemblyId) => {
    // 优先返回弹出中的临时 Group（正在拖拽/旋转）
    return InstancedManager.getPoppedGroup(assemblyId) || null
  }

  const invalidateCache = () => {} // 不再需要缓存

  const highlightPipeGroupForSelection = () => {}
  const restorePipeGroupForSelection = () => {}

  const updateSelectionHighlight = (selectedIds) => {
    if (!ctx.isAssemblyMode) return

    const newSet = new Set(selectedIds || [])

    for (const id of _highlightedIds) {
      if (!newSet.has(id)) InstancedManager.unhighlightItem(id)
    }
    for (const id of newSet) {
      if (!_highlightedIds.has(id)) InstancedManager.highlightItem(id)
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

  const clearAllHighlights = () => {
    InstancedManager.unhighlightAll()
    _highlightedIds.clear()
  }

  return {
    findPipeGroupByAssemblyId,
    invalidateCache,
    highlightPipeGroupForSelection,
    restorePipeGroupForSelection,
    updateSelectionHighlight,
    clearArraySelection,
    clearAllHighlights
  }
}
