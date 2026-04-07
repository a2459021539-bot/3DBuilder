import { ref, computed } from 'vue'

/**
 * Manages multi-select state for assembly items.
 * Supports Ctrl+click (toggle), Shift+click (range), and folder selection.
 *
 * @param {import('vue').Ref<Array>} assemblyItems - reactive assembly items list
 * @param {import('vue').ComputedRef<Array>} topLevelAssemblyItems - computed top-level items
 * @param {Function} getArrayGroupChildren - (groupId) => child items array
 * @param {import('vue').Ref<Map>} arrayGroupExpanded - Map tracking folder expand state
 */
export function useSelectionState(assemblyItems, topLevelAssemblyItems, getArrayGroupChildren, arrayGroupExpanded) {
  const selectedAssemblyItems = ref(new Set())
  let lastClickedItemId = null

  // Get flat ordered list of all selectable item IDs (respecting folder expand state)
  const getFlatSelectableIds = () => {
    const ids = []
    topLevelAssemblyItems.value.forEach(item => {
      if (item.type === 'array-group') {
        if (arrayGroupExpanded.value.get(item.id)) {
          getArrayGroupChildren(item.id).forEach(child => ids.push(child.id))
        }
      } else {
        ids.push(item.id)
      }
    })
    return ids
  }

  const handleAssemblyItemClick = (event, itemId) => {
    if (event.ctrlKey || event.metaKey) {
      // Ctrl+click: toggle individual item
      toggleAssemblyItemSelection(itemId)
    } else if (event.shiftKey && lastClickedItemId) {
      // Shift+click: range selection
      const flat = getFlatSelectableIds()
      const from = flat.indexOf(lastClickedItemId)
      const to = flat.indexOf(itemId)
      if (from !== -1 && to !== -1) {
        const start = Math.min(from, to)
        const end = Math.max(from, to)
        for (let i = start; i <= end; i++) {
          selectedAssemblyItems.value.add(flat[i])
        }
        notifySelectionChanged()
      }
      return // Don't update lastClickedItemId
    } else {
      // Normal click: toggle single selection
      if (selectedAssemblyItems.value.size === 1 && selectedAssemblyItems.value.has(itemId)) {
        selectedAssemblyItems.value.clear()
      } else {
        selectedAssemblyItems.value.clear()
        selectedAssemblyItems.value.add(itemId)
      }
      notifySelectionChanged()
    }
    lastClickedItemId = itemId
  }

  const toggleAssemblyItemSelection = (itemId) => {
    if (selectedAssemblyItems.value.has(itemId)) {
      selectedAssemblyItems.value.delete(itemId)
    } else {
      selectedAssemblyItems.value.add(itemId)
    }
    notifySelectionChanged()
  }

  const selectFolderChildren = (groupId) => {
    const children = getArrayGroupChildren(groupId)
    const allSelected = children.length > 0 && children.every(c => selectedAssemblyItems.value.has(c.id))
    selectedAssemblyItems.value.clear()
    if (!allSelected) {
      children.forEach(child => selectedAssemblyItems.value.add(child.id))
    }
    notifySelectionChanged()
  }

  const notifySelectionChanged = () => {
    const selectedIds = Array.from(selectedAssemblyItems.value)
    window.dispatchEvent(new CustomEvent('assembly-selection-changed', {
      detail: { selectedIds }
    }))
  }

  const toggleSelectAllAssemblyItems = () => {
    if (isAllAssemblyItemsSelected.value) {
      selectedAssemblyItems.value.clear()
    } else {
      selectedAssemblyItems.value.clear()
      topLevelAssemblyItems.value.forEach(item => {
        if (item.type === 'array-group') {
          const children = getArrayGroupChildren(item.id)
          children.forEach(child => {
            selectedAssemblyItems.value.add(child.id)
          })
        } else {
          selectedAssemblyItems.value.add(item.id)
        }
      })
    }
    notifySelectionChanged()
  }

  const isAllAssemblyItemsSelected = computed(() => {
    if (topLevelAssemblyItems.value.length === 0) return false

    const allSelectableItems = new Set()
    topLevelAssemblyItems.value.forEach(item => {
      if (item.type === 'array-group') {
        const children = getArrayGroupChildren(item.id)
        children.forEach(child => {
          allSelectableItems.add(child.id)
        })
      } else {
        allSelectableItems.add(item.id)
      }
    })

    if (allSelectableItems.size === 0) return false
    return allSelectableItems.size === selectedAssemblyItems.value.size &&
           Array.from(allSelectableItems).every(id => selectedAssemblyItems.value.has(id))
  })

  return {
    selectedAssemblyItems,
    handleAssemblyItemClick,
    toggleAssemblyItemSelection,
    selectFolderChildren,
    notifySelectionChanged,
    toggleSelectAllAssemblyItems,
    isAllAssemblyItemsSelected,
    getFlatSelectableIds
  }
}
