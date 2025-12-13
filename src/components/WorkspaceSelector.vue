<template>
  <div class="workspace-selector-overlay" v-if="show" @click.self="handleOverlayClick">
    <div class="workspace-selector-dialog">
      <div class="workspace-selector-header">
        <h2 class="workspace-selector-title">选择工作空间</h2>
        <button class="workspace-selector-close" @click="handleClose" title="关闭">×</button>
      </div>
      
      <div class="workspace-selector-body">
        <div class="workspace-list" v-if="workspaces.length > 0">
          <div 
            v-for="workspace in workspaces" 
            :key="workspace.id"
            class="workspace-item"
            :class="{ active: workspace.id === currentWorkspaceId }"
            @click="selectWorkspace(workspace.id)"
          >
            <div class="workspace-item-info">
              <div class="workspace-item-name">{{ workspace.name }}</div>
              <div class="workspace-item-meta">
                创建于 {{ formatDate(workspace.createdAt) }}
              </div>
            </div>
            <div class="workspace-item-actions">
              <button 
                class="workspace-item-btn workspace-item-btn-export" 
                @click.stop="handleExport(workspace.id)"
                title="导出工作空间"
              >
                📤
              </button>
              <button 
                class="workspace-item-btn workspace-item-btn-delete" 
                @click.stop="handleDelete(workspace.id)"
                title="删除工作空间"
              >
                🗑️
              </button>
            </div>
          </div>
        </div>
        
        <div class="workspace-empty" v-else>
          <p>暂无工作空间，请创建一个新工作空间</p>
        </div>
      </div>
      
      <div class="workspace-selector-footer">
        <div class="workspace-actions">
          <input 
            type="file" 
            ref="fileInput"
            accept=".json"
            style="display: none"
            @change="handleFileImport"
          />
          <button 
            class="workspace-action-btn workspace-import-btn" 
            @click="triggerFileImport"
            title="导入工作空间"
          >
            📥 导入工作空间
          </button>
        </div>
        <div class="workspace-create">
          <input 
            type="text" 
            v-model="newWorkspaceName" 
            class="workspace-create-input"
            placeholder="输入新工作空间名称"
            @keyup.enter="createWorkspace"
            ref="newWorkspaceInput"
          />
          <button 
            class="workspace-create-btn" 
            @click="createWorkspace"
            :disabled="!newWorkspaceName.trim()"
          >
            创建新工作空间
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, nextTick } from 'vue'
import { 
  getWorkspaces, 
  createWorkspace as createWorkspaceAPI, 
  deleteWorkspace, 
  setCurrentWorkspaceId,
  getCurrentWorkspaceId,
  downloadWorkspace,
  importWorkspace
} from '../utils/workspaceManager.js'

const props = defineProps({
  show: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['update:show', 'workspace-selected'])

const workspaces = ref([])
const currentWorkspaceId = ref(null)
const newWorkspaceName = ref('')
const newWorkspaceInput = ref(null)
const fileInput = ref(null)

const loadWorkspaces = () => {
  workspaces.value = getWorkspaces()
  currentWorkspaceId.value = getCurrentWorkspaceId()
}

const formatDate = (dateString) => {
  if (!dateString) return ''
  const date = new Date(dateString)
  return date.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })
}

const selectWorkspace = (workspaceId) => {
  // 注意：这里先设置工作空间ID，然后发出事件
  // App.vue 中的 handleWorkspaceSelected 会再次设置（确保一致性）并加载数据
  setCurrentWorkspaceId(workspaceId)
  currentWorkspaceId.value = workspaceId
  emit('workspace-selected', workspaceId)
  handleClose()
}

const createWorkspace = () => {
  const name = newWorkspaceName.value.trim()
  if (!name) return
  
  const newWorkspace = createWorkspaceAPI(name)
  newWorkspaceName.value = ''
  loadWorkspaces()
  
  // 自动选择新创建的工作空间
  selectWorkspace(newWorkspace.id)
}

const handleDelete = (workspaceId) => {
  if (confirm('确定要删除这个工作空间吗？删除后数据将无法恢复。')) {
    deleteWorkspace(workspaceId)
    loadWorkspaces()
    
    // 如果删除的是当前工作空间，需要重新选择
    if (workspaceId === currentWorkspaceId.value) {
      if (workspaces.value.length > 0) {
        selectWorkspace(workspaces.value[0].id)
      } else {
        setCurrentWorkspaceId(null)
        currentWorkspaceId.value = null
      }
    }
  }
}

const handleClose = () => {
  emit('update:show', false)
}

const handleOverlayClick = () => {
  // 如果没有任何工作空间，不允许关闭
  if (workspaces.value.length === 0) {
    return
  }
  // 如果有工作空间但没有选中，也不允许关闭
  if (!currentWorkspaceId.value && workspaces.value.length > 0) {
    return
  }
  handleClose()
}

const handleExport = (workspaceId) => {
  try {
    downloadWorkspace(workspaceId)
  } catch (error) {
    alert(`导出失败: ${error.message}`)
  }
}

const triggerFileImport = () => {
  if (fileInput.value) {
    fileInput.value.click()
  }
}

const handleFileImport = async (event) => {
  const file = event.target.files[0]
  if (!file) return
  
  try {
    const text = await file.text()
    const importData = JSON.parse(text)
    
    // 验证数据格式
    if (!importData.workspace || !importData.data) {
      throw new Error('无效的导入文件格式')
    }
    
    // 检查是否已存在同名工作空间
    const existingWorkspace = workspaces.value.find(
      ws => ws.id === importData.workspace.id
    )
    
    let shouldOverwrite = false
    let newName = importData.workspace.name
    
    if (existingWorkspace) {
      const userChoice = confirm(
        `工作空间 "${importData.workspace.name}" 已存在。\n\n` +
        `点击"确定"覆盖现有工作空间，或点击"取消"创建新工作空间。`
      )
      shouldOverwrite = userChoice
      
      if (!shouldOverwrite) {
        newName = prompt('请输入新工作空间的名称:', `${importData.workspace.name} (导入)`)
        if (!newName || !newName.trim()) {
          // 用户取消或输入为空
          event.target.value = '' // 重置文件输入
          return
        }
      }
    } else {
      // 询问是否重命名
      const rename = confirm(
        `是否要重命名导入的工作空间？\n\n` +
        `当前名称: ${importData.workspace.name}\n\n` +
        `点击"确定"输入新名称，或点击"取消"使用原名称。`
      )
      
      if (rename) {
        newName = prompt('请输入工作空间名称:', importData.workspace.name)
        if (!newName || !newName.trim()) {
          // 用户取消或输入为空，使用原名称
          newName = importData.workspace.name
        }
      }
    }
    
    // 执行导入
    const importedWorkspace = importWorkspace(importData, {
      overwrite: shouldOverwrite,
      newName: newName.trim()
    })
    
    // 重新加载工作空间列表
    loadWorkspaces()
    
    // 自动选择导入的工作空间
    selectWorkspace(importedWorkspace.id)
    
    alert(`工作空间 "${importedWorkspace.name}" 导入成功！`)
  } catch (error) {
    alert(`导入失败: ${error.message}`)
    console.error('导入错误:', error)
  } finally {
    // 重置文件输入，允许重复导入同一文件
    if (event.target) {
      event.target.value = ''
    }
  }
}

watch(() => props.show, (newVal) => {
  if (newVal) {
    loadWorkspaces()
    nextTick(() => {
      if (newWorkspaceInput.value) {
        newWorkspaceInput.value.focus()
      }
    })
  }
})
</script>

<style scoped>
.workspace-selector-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10000;
  backdrop-filter: blur(4px);
}

.workspace-selector-dialog {
  background: #1e1e1e;
  border-radius: 12px;
  width: 90%;
  max-width: 600px;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
  border: 1px solid rgba(255, 255, 255, 0.1);
}

.workspace-selector-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 24px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.workspace-selector-title {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
  color: #fff;
}

.workspace-selector-close {
  background: none;
  border: none;
  color: #999;
  font-size: 28px;
  cursor: pointer;
  padding: 0;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  transition: all 0.2s;
}

.workspace-selector-close:hover {
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
}

.workspace-selector-body {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  min-height: 200px;
  max-height: 400px;
}

.workspace-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.workspace-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
  border: 2px solid transparent;
}

.workspace-item:hover {
  background: rgba(255, 255, 255, 0.1);
  border-color: rgba(74, 158, 255, 0.3);
}

.workspace-item.active {
  background: rgba(74, 158, 255, 0.15);
  border-color: #4a9eff;
}

.workspace-item-info {
  flex: 1;
}

.workspace-item-name {
  font-size: 16px;
  font-weight: 500;
  color: #fff;
  margin-bottom: 4px;
}

.workspace-item-meta {
  font-size: 12px;
  color: #999;
}

.workspace-item-actions {
  display: flex;
  gap: 8px;
}

.workspace-item-btn {
  background: rgba(255, 255, 255, 0.1);
  border: none;
  color: #fff;
  padding: 8px 12px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 14px;
  transition: all 0.2s;
}

.workspace-item-btn:hover {
  background: rgba(255, 255, 255, 0.2);
}

.workspace-item-btn-export:hover {
  background: rgba(74, 158, 255, 0.3);
}

.workspace-item-btn-delete:hover {
  background: rgba(255, 68, 68, 0.3);
}

.workspace-empty {
  text-align: center;
  padding: 40px 20px;
  color: #999;
}

.workspace-selector-footer {
  padding: 20px 24px;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.workspace-actions {
  display: flex;
  gap: 12px;
}

.workspace-action-btn {
  background: rgba(74, 158, 255, 0.2);
  border: 1px solid rgba(74, 158, 255, 0.3);
  color: #4a9eff;
  padding: 10px 20px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 500;
  transition: all 0.2s;
  white-space: nowrap;
}

.workspace-action-btn:hover {
  background: rgba(74, 158, 255, 0.3);
  border-color: #4a9eff;
}

.workspace-import-btn {
  flex: 1;
}

.workspace-create {
  display: flex;
  gap: 12px;
}

.workspace-create-input {
  flex: 1;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 6px;
  padding: 10px 12px;
  color: #fff;
  font-size: 14px;
  outline: none;
  transition: all 0.2s;
}

.workspace-create-input:focus {
  border-color: #4a9eff;
  background: rgba(255, 255, 255, 0.15);
}

.workspace-create-input::placeholder {
  color: #666;
}

.workspace-create-btn {
  background: #4a9eff;
  border: none;
  color: #fff;
  padding: 10px 20px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 500;
  transition: all 0.2s;
  white-space: nowrap;
}

.workspace-create-btn:hover:not(:disabled) {
  background: #3a8eef;
}

.workspace-create-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
