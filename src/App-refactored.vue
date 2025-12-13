<template>
  <AppLayout 
    :is-menu-collapsed="isMenuCollapsed"
    :show-panels="showAnyPanel"
    @toggle-menu="toggleMenuCollapse"
    @panel-change="handlePanelChange"
  >
    <!-- 3D场景 -->
    <template #scene>
      <ThreeScene />
    </template>

    <!-- 顶部工具栏 -->
    <template #toolbar>
      <AppToolbar
        :visible="isViewingAssembly && assemblyItems && assemblyItems.length > 0"
        :current-mode="currentMode"
        @mode-change="setMode"
      />
    </template>

    <!-- 菜单触发按钮 -->
    <template #menu-trigger>
      <!-- 由AppSidebar内部处理 -->
    </template>

    <!-- 侧边栏菜单 -->
    <template #sidebar>
      <AppSidebar
        :is-collapsed="isMenuCollapsed"
        :expanded-submenus="expandedSubmenus"
        :assembly-items="assemblyItems"
        :parts-items="partsItems"
        :history-items="historyItems"
        :get-history-details="getHistoryDetails"
        @toggle-collapse="toggleMenuCollapse"
        @toggle-submenu="toggleSubmenu"
        @view-assembly="viewAssembly"
        @create-new-part="createNewPart"
        @submenu-click="handleSubmenuClick"
        @add-to-assembly="addToAssembly"
        @delete-part="deletePart"
        @undo-last-action="undoLastAction"
      />
    </template>

    <!-- 参数面板 -->
    <template #panels>
      <AppPanels
        :show-history-edit="showHistoryEdit"
        :show-transform-panel="showTransformPanel"
        :show-pipe-params="showPipeParams"
        :is-rotation-mode="isRotationMode"
        :is-array-mode="isArrayMode"
        :is-join-mode="isJoinMode"
        :is-menu-collapsed="isMenuCollapsed"
        :assembly-items="assemblyItems"
        :editing-history-item="editingHistoryItem"
        :editing-start-angle-deg="editingStartAngleDeg"
        :editing-end-angle-deg="editingEndAngleDeg"
        :editing-part-id="editingPartId"
        :current-part-type="currentPartType"
        :pipe-params="pipeParams"
        :section-collapsed="sectionCollapsed"
        :transform-type="transformType"
        :move-plane="movePlane"
        :transform-position="transformPosition"
        :transform-axis="transformAxis"
        :transform-rotation-deg="transformRotationDeg"
        :rotation-axis="rotationAxis"
        :rotation-angle="rotationAngle"
        :selected-assembly-item-id="selectedAssemblyItemId"
        :array-selection="arraySelection"
        :array-direction="arrayDirection"
        :array-sign="arraySign"
        :array-spacing="arraySpacing"
        :array-count="arrayCount"
        :first-selected-end-face="firstSelectedEndFace"
        :second-selected-end-face="secondSelectedEndFace"
        :move-first-pipe="moveFirstPipe"
        :join-rotation-angle="joinRotationAngle"
        :get-history-details="getHistoryDetails"
        @close-history-edit="closeHistoryEdit"
        @close-transform-panel="closeTransformPanel"
        @close-pipe-params="closePipeParams"
        @set-mode="setMode"
        @save-history-edit="saveHistoryEdit"
        @update-editing-move-details="updateEditingMoveDetails"
        @update-editing-rotation-details="updateEditingRotationDetails"
        @update-editing-rotation-from-degrees="updateEditingRotationFromDegrees"
        @set-move-plane="setMovePlane"
        @update-transform-position="updateTransformPosition"
        @update-transform-rotation-from-degrees="updateTransformRotationFromDegrees"
        @save-pipe="savePipe"
        @add-reducer-section="addReducerSection"
        @remove-reducer-section="removeReducerSection"
        @toggle-section-collapse="toggleSectionCollapse"
        @handle-length-wheel="handleLengthWheel"
        @update-rotation-axis="updateRotationAxis"
        @preview-rotation-angle="previewRotationAngle"
        @apply-rotation-angle="applyRotationAngle"
        @reset-array-selection="resetArraySelection"
        @execute-array="executeArray"
        @update-array-direction="(value) => arrayDirection = value"
        @update-array-sign="(value) => arraySign = value"
        @update-array-spacing="(value) => arraySpacing = value"
        @update-array-count="(value) => arrayCount = value"
        @execute-join="executeJoin"
        @reset-join-selection="resetJoinSelection"
        @update-move-first-pipe="(value) => moveFirstPipe = value"
        @update-join-rotation-angle="(value) => joinRotationAngle = value"
      />
    </template>

    <!-- 右下角控制面板 -->
    <template #controls>
      <AppControls
        :current-mode-title="currentModeTitle"
        :current-instructions="currentInstructions"
        :camera-mode="cameraMode"
        @reset-camera="resetCamera"
        @switch-camera="switchCamera"
        @clear-all-data="clearAllData"
      />
    </template>

    <!-- 对话框 -->
    <template #dialogs>
      <!-- 新建零件选项对话框 -->
      <div v-if="showPartTypeDialog" class="dialog-overlay" @click="closePartTypeDialog">
        <div class="dialog-content" @click.stop>
          <div class="dialog-header">
            <h3>选择零件类型</h3>
            <button class="dialog-close-btn" @click="closePartTypeDialog">×</button>
          </div>
          <div class="dialog-body">
            <div 
              v-for="type in partTypes" 
              :key="type.value"
              class="dialog-option" 
              @click="selectPartTypeWrapper(type.value)"
            >
              <span class="dialog-option-icon">{{ type.icon }}</span>
              <span class="dialog-option-text">{{ type.label }}</span>
            </div>
          </div>
        </div>
      </div>
    </template>
  </AppLayout>
</template>

<script setup>
import { ref, computed } from 'vue'
import ThreeScene from './components/ThreeScene.vue'
import AppLayout from './components/layout/AppLayout.vue'
import AppToolbar from './components/toolbars/AppToolbar.vue'
import AppSidebar from './components/layout/AppSidebar.vue'
import AppPanels from './components/panels/AppPanels.vue'
import AppControls from './components/layout/AppControls.vue'

// Composables (保持原有的导入)
import { useUIState } from './composables/useUIState.js'
import { usePartManager } from './composables/usePartManager.js'
import { useAssemblyManager } from './composables/useAssemblyManager.js'
import { useHistoryManager } from './composables/useHistoryManager.js'
import { useTransformLogic } from './composables/useTransformLogic.js'
import { useJoinLogic } from './composables/useJoinLogic.js'

// --- State Initialization (保持原有逻辑) ---
const historyItems = ref([])

// 1. UI State
const uiState = useUIState()
const {
  cameraMode, isMenuCollapsed, expandedSubmenus,
  showPartTypeDialog, showPipeParams, showHistoryEdit, showTransformPanel,
  toggleMenuCollapse, toggleSubmenu, closePartTypeDialog, closePipeParams, closeHistoryEdit, closeTransformPanel
} = uiState

// 2. Assembly Manager
const assemblyMgr = useAssemblyManager(historyItems)
const { assemblyItems, isViewingAssembly, addToAssembly, viewAssembly } = assemblyMgr

// 3. Part Manager
const partMgr = usePartManager(assemblyItems, historyItems, uiState)
const {
  partsItems, pipeParams, editingPartId, currentViewingPartId, currentPartType, sectionCollapsed, partTypes,
  getNextName, selectPartType, editPart, savePipe, deletePart, addReducerSection, removeReducerSection, 
  toggleSectionCollapse, handleLengthWheel
} = partMgr

// 4. History Manager
const historyMgr = useHistoryManager(partsItems, assemblyItems, partMgr, uiState, historyItems)
const {
  editingHistoryItem, editingStartAngleDeg, editingEndAngleDeg,
  getHistoryDetails, openHistoryEdit, saveHistoryEdit, 
  updateEditingMoveDetails, updateEditingRotationDetails, updateEditingRotationFromDegrees, undoLastAction
} = historyMgr

// 5. Transform Logic
const transformLogic = useTransformLogic(assemblyItems, historyItems)
const {
  isRotationMode, isArrayMode, 
  rotationAxis, rotationAngle, selectedAssemblyItemId,
  arraySelection, arrayDirection, arraySign, arraySpacing, arrayCount,
  transformType, transformingItemId, transformPosition, transformRotation, transformRotationDeg, transformAxis, movePlane,
  setMode, updateRotationAxis, previewRotationAngle, applyRotationAngle, resetArraySelection, executeArray, 
  setMovePlane, updateTransformPosition, updateTransformRotationFromDegrees
} = transformLogic

// 6. Join Logic
const joinLogic = useJoinLogic(assemblyItems, historyItems)
const {
  isJoinMode, firstSelectedEndFace, secondSelectedEndFace, moveFirstPipe, joinRotationAngle,
  resetJoinSelection, executeJoin
} = joinLogic

// --- Computed Properties ---
const currentMode = computed(() => {
  if (isJoinMode.value) return 'join'
  if (isRotationMode.value) return 'rotate'
  if (isArrayMode.value) return 'array'
  return 'move'
})

const showAnyPanel = computed(() => {
  return showHistoryEdit.value || showTransformPanel.value || showPipeParams.value ||
         (isRotationMode.value && assemblyItems.value && assemblyItems.value.length > 0) ||
         (isArrayMode.value && assemblyItems.value && assemblyItems.value.length > 0) ||
         (isJoinMode.value && assemblyItems.value && assemblyItems.value.length > 0)
})

const currentModeTitle = computed(() => {
  if (isViewingAssembly.value) {
    if (isJoinMode.value) return '拼接模式'
    else if (isRotationMode.value) return '旋转模式'
    else if (isArrayMode.value) return '阵列模式'
    else return '装配体浏览模式'
  } else if (showPipeParams.value) {
    if (currentPartType.value === 'straight') return '直管建模模式'
    else if (currentPartType.value === 'bend') return '弯管建模模式'
    else if (currentPartType.value === 'reducer') return '变径管建模模式'
    else if (currentPartType.value === 'sketch2d') return '2D草图建管模式'
    else return '零件建模模式'
  }
  return '浏览模式'
})

const currentInstructions = computed(() => {
  // 拼接模式
  if (isViewingAssembly.value && isJoinMode.value) {
    return [
      { key: '🖱️ 左键拖动', desc: '旋转视角' },
      { key: '🖱️ 右键拖动', desc: '平移视角' },
      { key: '🖱️ 滚轮', desc: '缩放视角' },
      { key: '🖱️ 点击端面', desc: '选择要拼接的管道端面' },
      { key: '⚙️ 调整参数', desc: '在右侧面板设置拼接参数' },
      { key: '✅ 确认拼接', desc: '点击确认按钮执行拼接' }
    ]
  }
  
  // 旋转模式
  if (isViewingAssembly.value && isRotationMode.value) {
    return [
      { key: '🖱️ 左键拖动', desc: '旋转视角' },
      { key: '🖱️ 右键拖动', desc: '平移视角' },
      { key: '🖱️ 滚轮', desc: '缩放视角' },
      { key: '🖱️ 点击管道', desc: '选择要旋转的管道' },
      { key: '🎛️ 旋转手柄', desc: '拖动3D手柄进行旋转' },
      { key: '⌨️ 输入角度', desc: '在参数面板输入精确角度' }
    ]
  }
  
  // 阵列模式
  if (isViewingAssembly.value && isArrayMode.value) {
    return [
      { key: '🖱️ 左键拖动', desc: '旋转视角' },
      { key: '🖱️ 右键拖动', desc: '平移视角' },
      { key: '🖱️ 滚轮', desc: '缩放视角' },
      { key: '🖱️ 点击管道', desc: '选择/取消选择管道' },
      { key: '⚙️ 设置参数', desc: '在右侧面板设置阵列参数' },
      { key: '📐 执行阵列', desc: '点击执行按钮创建阵列' }
    ]
  }
  
  // 装配体移动模式
  if (isViewingAssembly.value && !isRotationMode.value && !isJoinMode.value && !isArrayMode.value) {
    return [
      { key: '🖱️ 左键拖动', desc: '旋转视角' },
      { key: '🖱️ 右键拖动', desc: '平移视角' },
      { key: '🖱️ 滚轮', desc: '缩放视角' },
      { key: '🖱️ 点击管道', desc: '选择要移动的管道' },
      { key: '🖱️ 拖动管道', desc: '在相机视角平面移动管道' },
      { key: '⌨️ 输入坐标', desc: '在参数面板输入精确位置' }
    ]
  }
  
  // 2D草图建管模式
  if (showPipeParams.value && currentPartType.value === 'sketch2d') {
    return [
      { key: '📏 直线工具', desc: '在左侧2D面板绘制直线路径' },
      { key: '🌀 圆弧工具', desc: '在左侧2D面板绘制圆弧路径' },
      { key: '🖱️ 右键拖动（2D）', desc: '平移2D画布' },
      { key: '🖱️ 滚轮（2D）', desc: '缩放2D画布' },
      { key: '🖱️ 左键拖动（3D）', desc: '旋转3D预览视角' },
      { key: '🖱️ 右键拖动（3D）', desc: '平移3D预览视角' },
      { key: '🖱️ 滚轮（3D）', desc: '缩放3D预览视角' },
      { key: '⌨️ ESC', desc: '取消当前绘制' },
      { key: '⌨️ Ctrl+Z', desc: '撤回上一条线段' }
    ]
  }
  
  // 零件编辑模式（直管、弯管、变径管）
  if (showPipeParams.value && currentPartType.value !== 'sketch2d') {
    return [
      { key: '🖱️ 左键拖动', desc: '旋转视角' },
      { key: '🖱️ 右键拖动', desc: '平移视角' },
      { key: '🖱️ 滚轮', desc: '缩放视角' },
      { key: '⌨️ 修改参数', desc: '在左侧参数面板调整参数' },
      { key: '👁️ 实时预览', desc: '右侧3D场景实时显示预览' },
      { key: '💾 保存', desc: '点击创建/保存按钮保存零件' }
    ]
  }
  
  // 默认模式（浏览模式）
  return [
    { key: '🖱️ 左键拖动', desc: '旋转视角' },
    { key: '🖱️ 右键拖动', desc: '平移视角' },
    { key: '🖱️ 滚轮', desc: '缩放视角' },
    { key: '📦 新建零件', desc: '在左侧菜单创建新零件' },
    { key: '👀 浏览装配体', desc: '在总装备体中查看所有零件' }
  ]
})

// --- Methods (保持原有逻辑) ---
const createNewPart = () => {
  expandedSubmenus.value.assembly = false
  expandedSubmenus.value.history = false
  if (showHistoryEdit.value) closeHistoryEdit()
  if (showTransformPanel.value) closeTransformPanel()
  
  isViewingAssembly.value = false
  isRotationMode.value = false
  isJoinMode.value = false
  
  showPartTypeDialog.value = true
}

const selectPartTypeWrapper = (type) => {
  const showParams = selectPartType(type)
  closePartTypeDialog()
  
  expandedSubmenus.value.assembly = false
  expandedSubmenus.value.history = false
  expandedSubmenus.value.parts = true
  if (showHistoryEdit.value) closeHistoryEdit()
  if (showTransformPanel.value) closeTransformPanel()
  
  editingPartId.value = null
  currentViewingPartId.value = null
  
  if (showParams) {
    showPipeParams.value = true
  }
}

const handleSubmenuClick = (submenuKey, itemKey) => {
  console.log('子菜单项点击:', submenuKey, itemKey)
  
  if (submenuKey === 'parts') {
    const part = partsItems.value.find(item => item.id === itemKey)
    if (part) {
      if (editingPartId.value === part.id && showPipeParams.value) {
        closePipeParams()
      } else {
        expandedSubmenus.value.assembly = false
        expandedSubmenus.value.history = false
        if (showHistoryEdit.value) closeHistoryEdit()
        if (showTransformPanel.value) closeTransformPanel()
        isViewingAssembly.value = false
        isRotationMode.value = false
        isJoinMode.value = false
        
        editPart(part)
        showPipeParams.value = true
      }
    }
  } else if (submenuKey === 'history') {
    const historyItem = historyItems.value.find(item => item.id === itemKey)
    if (historyItem && (historyItem.type === 'move' || historyItem.type === 'rotate')) {
      openHistoryEdit(historyItem)
    }
  } else if (submenuKey === 'assembly') {
    const item = assemblyItems.value.find(i => i.id === itemKey)
    if (item) {
      if (isRotationMode.value) selectedAssemblyItemId.value = item.id
      if (isArrayMode.value) {
        const idx = arraySelection.value.indexOf(item.id)
        if (idx > -1) arraySelection.value.splice(idx, 1)
        else arraySelection.value.push(item.id)
      }
      if (!isRotationMode.value && !isArrayMode.value && !isJoinMode.value) {
        transformingItemId.value = item.id
      }
    }
  }
}

// Camera controls
const resetCamera = () => {
  window.dispatchEvent(new CustomEvent('reset-camera'))
}

const switchCamera = () => {
  window.dispatchEvent(new CustomEvent('switch-camera'))
}

const clearAllData = () => {
  if (confirm('确定要清除所有数据吗？此操作不可恢复。')) {
    // 清除所有数据的逻辑
    partsItems.value = []
    assemblyItems.value = []
    historyItems.value = []
    
    // 重置UI状态
    isViewingAssembly.value = false
    showPipeParams.value = false
    showHistoryEdit.value = false
    showTransformPanel.value = false
    
    // 清除场景
    window.dispatchEvent(new CustomEvent('clear-pipe-preview'))
  }
}

// Layout event handlers
const handlePanelChange = (event) => {
  console.log('Panel change:', event)
}
</script>

<style scoped>
/* 对话框样式 */
.dialog-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(4px);
  z-index: 2000;
  display: flex;
  align-items: center;
  justify-content: center;
}

.dialog-content {
  background: rgba(42, 42, 42, 0.95);
  backdrop-filter: blur(10px);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 12px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
  overflow: hidden;
  min-width: 300px;
  max-width: 400px;
}

.dialog-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px;
  background: rgba(32, 32, 32, 0.8);
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.dialog-header h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: #ffffff;
}

.dialog-close-btn {
  background: transparent;
  border: none;
  color: #888888;
  font-size: 20px;
  cursor: pointer;
  padding: 0;
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  transition: all 0.2s ease;
}

.dialog-close-btn:hover {
  background: rgba(255, 77, 79, 0.2);
  color: #ff4d4f;
}

.dialog-body {
  padding: 20px;
}

.dialog-option {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s ease;
  margin-bottom: 8px;
  border: 1px solid rgba(255, 255, 255, 0.05);
}

.dialog-option:hover {
  background: rgba(64, 150, 255, 0.1);
  border-color: rgba(64, 150, 255, 0.3);
  transform: translateY(-1px);
}

.dialog-option:last-child {
  margin-bottom: 0;
}

.dialog-option-icon {
  font-size: 20px;
  width: 24px;
  text-align: center;
}

.dialog-option-text {
  font-size: 14px;
  font-weight: 500;
  color: #ffffff;
}
</style>