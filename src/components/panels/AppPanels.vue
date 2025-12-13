<template>
  <div class="panels-container">
    <!-- 历史记录编辑面板 -->
    <HistoryEditPanel
      v-if="showHistoryEdit"
      :is-menu-collapsed="isMenuCollapsed"
      :editing-history-item="editingHistoryItem"
      :editing-start-angle-deg="editingStartAngleDeg"
      :editing-end-angle-deg="editingEndAngleDeg"
      :get-history-details="getHistoryDetails"
      @close="$emit('close-history-edit')"
      @save="$emit('save-history-edit')"
      @update-move-details="$emit('update-editing-move-details')"
      @update-rotation-details="$emit('update-editing-rotation-details')"
      @update-rotation-from-degrees="$emit('update-editing-rotation-from-degrees')"
    />

    <!-- 移动/旋转参数面板 -->
    <TransformPanel
      v-if="showTransformPanel"
      :is-menu-collapsed="isMenuCollapsed"
      :transform-type="transformType"
      :move-plane="movePlane"
      :transform-position="transformPosition"
      :transform-axis="transformAxis"
      :transform-rotation-deg="transformRotationDeg"
      @close="$emit('close-transform-panel')"
      @set-move-plane="$emit('set-move-plane', $event)"
      @update-transform-position="$emit('update-transform-position')"
      @update-transform-rotation="$emit('update-transform-rotation-from-degrees')"
    />

    <!-- 建管参数面板 -->
    <PipeParamsPanel
      v-if="showPipeParams"
      :is-menu-collapsed="isMenuCollapsed"
      :editing-part-id="editingPartId"
      :current-part-type="currentPartType"
      :pipe-params="pipeParams"
      :section-collapsed="sectionCollapsed"
      @close="$emit('close-pipe-params')"
      @save="$emit('save-pipe')"
      @add-reducer-section="$emit('add-reducer-section')"
      @remove-reducer-section="$emit('remove-reducer-section', $event)"
      @toggle-section-collapse="$emit('toggle-section-collapse', $event)"
      @handle-length-wheel="$emit('handle-length-wheel', $event)"
    />

    <!-- 旋转参数面板 -->
    <RotationPanel
      v-if="isRotationMode && assemblyItems && assemblyItems.length > 0"
      :is-menu-collapsed="isMenuCollapsed"
      :rotation-axis="rotationAxis"
      :rotation-angle="rotationAngle"
      :selected-assembly-item-id="selectedAssemblyItemId"
      @close="$emit('set-mode', 'move')"
      @update-rotation-axis="$emit('update-rotation-axis')"
      @preview-rotation-angle="$emit('preview-rotation-angle')"
      @apply-rotation-angle="$emit('apply-rotation-angle')"
    />

    <!-- 阵列参数面板 -->
    <ArrayPanel
      v-if="isArrayMode && assemblyItems && assemblyItems.length > 0"
      :is-menu-collapsed="isMenuCollapsed"
      :array-selection="arraySelection"
      :array-direction="arrayDirection"
      :array-sign="arraySign"
      :array-spacing="arraySpacing"
      :array-count="arrayCount"
      @close="$emit('set-mode', 'move')"
      @reset-array-selection="$emit('reset-array-selection')"
      @execute-array="$emit('execute-array')"
      @update-array-direction="$emit('update-array-direction', $event)"
      @update-array-sign="$emit('update-array-sign', $event)"
      @update-array-spacing="$emit('update-array-spacing', $event)"
      @update-array-count="$emit('update-array-count', $event)"
    />

    <!-- 拼接参数面板 -->
    <JoinPanel
      v-if="isJoinMode && assemblyItems && assemblyItems.length > 0"
      :is-menu-collapsed="isMenuCollapsed"
      :first-selected-end-face="firstSelectedEndFace"
      :second-selected-end-face="secondSelectedEndFace"
      :move-first-pipe="moveFirstPipe"
      :join-rotation-angle="joinRotationAngle"
      @close="$emit('set-mode', 'move')"
      @execute-join="$emit('execute-join')"
      @reset-join-selection="$emit('reset-join-selection')"
      @update-move-first-pipe="$emit('update-move-first-pipe', $event)"
      @update-join-rotation-angle="$emit('update-join-rotation-angle', $event)"
    />
  </div>
</template>

<script setup>
// AppPanels.vue - 参数面板容器组件
// 管理所有参数面板的显示和隐藏

// 导入子面板组件（这些组件将在后续任务中创建）
import HistoryEditPanel from './HistoryEditPanel.vue'
import TransformPanel from './TransformPanel.vue'
import PipeParamsPanel from './PipeParamsPanel.vue'
import RotationPanel from './RotationPanel.vue'
import ArrayPanel from './ArrayPanel.vue'
import JoinPanel from './JoinPanel.vue'

defineProps({
  // 面板显示状态
  showHistoryEdit: Boolean,
  showTransformPanel: Boolean,
  showPipeParams: Boolean,
  isRotationMode: Boolean,
  isArrayMode: Boolean,
  isJoinMode: Boolean,
  
  // 布局状态
  isMenuCollapsed: Boolean,
  
  // 数据
  assemblyItems: Array,
  editingHistoryItem: Object,
  editingStartAngleDeg: Number,
  editingEndAngleDeg: Number,
  editingPartId: String,
  currentPartType: String,
  pipeParams: Object,
  sectionCollapsed: Map,
  transformType: String,
  movePlane: String,
  transformPosition: Object,
  transformAxis: String,
  transformRotationDeg: Object,
  rotationAxis: String,
  rotationAngle: Number,
  selectedAssemblyItemId: String,
  arraySelection: Array,
  arrayDirection: String,
  arraySign: Number,
  arraySpacing: Number,
  arrayCount: Number,
  firstSelectedEndFace: Object,
  secondSelectedEndFace: Object,
  moveFirstPipe: Boolean,
  joinRotationAngle: Number,
  
  // 函数
  getHistoryDetails: Function
})

defineEmits([
  // 面板控制
  'close-history-edit',
  'close-transform-panel', 
  'close-pipe-params',
  'set-mode',
  
  // 历史编辑
  'save-history-edit',
  'update-editing-move-details',
  'update-editing-rotation-details',
  'update-editing-rotation-from-degrees',
  
  // 变换操作
  'set-move-plane',
  'update-transform-position',
  'update-transform-rotation-from-degrees',
  
  // 管道参数
  'save-pipe',
  'add-reducer-section',
  'remove-reducer-section',
  'toggle-section-collapse',
  'handle-length-wheel',
  
  // 旋转操作
  'update-rotation-axis',
  'preview-rotation-angle',
  'apply-rotation-angle',
  
  // 阵列操作
  'reset-array-selection',
  'execute-array',
  'update-array-direction',
  'update-array-sign',
  'update-array-spacing',
  'update-array-count',
  
  // 拼接操作
  'execute-join',
  'reset-join-selection',
  'update-move-first-pipe',
  'update-join-rotation-angle'
])
</script>

<style scoped>
.panels-container {
  position: relative;
  z-index: 900;
}
</style>