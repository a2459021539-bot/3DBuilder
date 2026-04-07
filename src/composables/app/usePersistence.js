import { ref, watch, nextTick } from 'vue'
import { loadRecords, saveRecords, clearRecords } from '../../utils/persistence/localRecordsStore.js'
import { getCurrentWorkspaceId, getWorkspaces, getWorkspaceData, setCurrentWorkspaceId } from '../../utils/workspaceManager.js'
import { flushDB } from '../../utils/sqliteStore.js'

export function usePersistence(partsItems, assemblyItems, historyItems) {
  let suppressPersist = false
  let persistTimer = null
  const PERSIST_DEBOUNCE_MS = 350
  const saveToast = ref(false)
  let saveToastTimer = null

  const hydrateRecordsFromStorage = (workspaceId = null) => {
    suppressPersist = true
    const targetWorkspaceId = workspaceId || getCurrentWorkspaceId()
    if (!targetWorkspaceId) {
      partsItems.value = []
      assemblyItems.value = []
      historyItems.value = []
      suppressPersist = false
      return
    }
    const persisted = getWorkspaceData(targetWorkspaceId)
    partsItems.value = Array.isArray(persisted.partsItems) ? [...persisted.partsItems] : []
    assemblyItems.value = Array.isArray(persisted.assemblyItems) ? [...persisted.assemblyItems] : []
    historyItems.value = Array.isArray(persisted.historyItems) ? [...persisted.historyItems] : []
    suppressPersist = false
  }

  const persistNow = () => {
    if (suppressPersist) return
    saveRecords({
      partsItems: partsItems.value,
      assemblyItems: assemblyItems.value,
      historyItems: historyItems.value
    })
  }

  const schedulePersist = () => {
    if (suppressPersist) return
    if (persistTimer) window.clearTimeout(persistTimer)
    persistTimer = window.setTimeout(() => {
      persistTimer = null
      persistNow()
    }, PERSIST_DEBOUNCE_MS)
  }

  const flushPersist = () => {
    if (suppressPersist) return
    if (persistTimer) {
      window.clearTimeout(persistTimer)
      persistTimer = null
    }
    persistNow()
  }

  const handleBeforeUnload = () => {
    flushPersist()
    flushDB()
  }

  const handleKeyboardSave = (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault()
      flushPersist()
      flushDB()
      saveToast.value = true
      if (saveToastTimer) clearTimeout(saveToastTimer)
      saveToastTimer = setTimeout(() => { saveToast.value = false }, 1500)
    }
  }

  const handleStorageChange = (e) => {
    if (!e.key) return
    const currentId = getCurrentWorkspaceId()
    if (!currentId) return
    const dataKey = '3dbuild.workspace.data.' + currentId
    if (e.key === dataKey) {
      hydrateRecordsFromStorage(currentId)
    }
  }

  const clearAllData = (isViewingAssembly, showPipeParams) => {
    if (confirm('确定要清除所有数据吗？')) {
      suppressPersist = true
      if (persistTimer) {
        window.clearTimeout(persistTimer)
        persistTimer = null
      }
      clearRecords()
      partsItems.value = []
      assemblyItems.value = []
      historyItems.value = []
      isViewingAssembly.value = false
      showPipeParams.value = false
      window.dispatchEvent(new CustomEvent('clear-pipe-preview'))
      window.dispatchEvent(new CustomEvent('view-assembly', { detail: [] }))
      window.setTimeout(() => { suppressPersist = false }, 0)
    }
  }

  // Auto-persist on data change
  watch([partsItems, assemblyItems, historyItems], () => {
    schedulePersist()
  }, { deep: true })

  return {
    hydrateRecordsFromStorage,
    persistNow,
    schedulePersist,
    flushPersist,
    handleBeforeUnload,
    handleKeyboardSave,
    handleStorageChange,
    clearAllData,
    saveToast
  }
}
