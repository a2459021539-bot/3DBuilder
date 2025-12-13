import { ref, computed } from 'vue'

export function useUIState() {
  const cameraMode = ref('perspective') // 'perspective' or 'orthographic'
  const isMenuCollapsed = ref(false)
  const expandedSubmenus = ref({
    assembly: false,
    parts: false,
    history: false
  })

  // Dialog visibility states
  const showPartTypeDialog = ref(false)
  const showPipeParams = ref(false)
  const showHistoryEdit = ref(false)
  const showTransformPanel = ref(false)

  const toggleMenuCollapse = () => {
    isMenuCollapsed.value = !isMenuCollapsed.value
  }

  const toggleSubmenu = (submenuKey) => {
    if (!isMenuCollapsed.value) {
      expandedSubmenus.value[submenuKey] = !expandedSubmenus.value[submenuKey]
    }
  }

  const closePartTypeDialog = () => {
    showPartTypeDialog.value = false
  }

  const closePipeParams = () => {
    showPipeParams.value = false
  }

  const closeHistoryEdit = () => {
    showHistoryEdit.value = false
  }

  const closeTransformPanel = () => {
    showTransformPanel.value = false
  }

  // Helper to determine the current mode title
  // Note: These computed properties depend on states from other modules (like isViewingAssembly, isJoinMode, etc.)
  // Since we are decoupling, we will accept these states as arguments or refactor this logic in App.vue 
  // For now, we will return the basic state and helper functions.
  // The complex computed properties for title and instructions are better kept in App.vue or a higher-level coordinator 
  // because they depend on cross-module state. 
  // However, we can export a helper if we pass all dependencies.
  
  // To keep it simple, we'll export the state and basic toggles here. 
  // The computed properties `currentModeTitle` and `currentInstructions` heavily depend on `isViewingAssembly`, `isJoinMode`, `currentPartType` etc.
  // It's cleaner to keep them in App.vue or create a dedicated `useAppStatus` composable that aggregates other states.
  // We'll stick to UI state here.

  return {
    cameraMode,
    isMenuCollapsed,
    expandedSubmenus,
    showPartTypeDialog,
    showPipeParams,
    showHistoryEdit,
    showTransformPanel,
    toggleMenuCollapse,
    toggleSubmenu,
    closePartTypeDialog,
    closePipeParams,
    closeHistoryEdit,
    closeTransformPanel
  }
}
