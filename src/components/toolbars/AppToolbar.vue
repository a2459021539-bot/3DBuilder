<template>
  <!-- 顶部工具栏 -->
  <div class="top-toolbar" v-if="visible">
    <div class="toolbar-group">
      <button 
        :class="['toolbar-btn', { active: currentMode === 'move' }]"
        @click="$emit('mode-change', 'move')"
        title="移动模式"
      >
        <span class="toolbar-icon">✋</span>
        <span class="toolbar-text">移动</span>
      </button>
      <button 
        :class="['toolbar-btn', { active: currentMode === 'rotate' }]"
        @click="$emit('mode-change', 'rotate')"
        title="旋转模式"
      >
        <span class="toolbar-icon">🔄</span>
        <span class="toolbar-text">旋转</span>
      </button>
      <button 
        :class="['toolbar-btn', { active: currentMode === 'join' }]"
        @click="$emit('mode-change', 'join')"
        title="拼接模式"
      >
        <span class="toolbar-icon">🔗</span>
        <span class="toolbar-text">拼接</span>
      </button>
      <button 
        :class="['toolbar-btn', { active: currentMode === 'array' }]"
        @click="$emit('mode-change', 'array')"
        title="阵列模式"
      >
        <span class="toolbar-icon">📐</span>
        <span class="toolbar-text">阵列</span>
      </button>
      <div class="toolbar-divider"></div>
      <button 
        class="toolbar-btn"
        @click="$emit('export-obj')"
        title="导出 OBJ"
      >
        <span class="toolbar-icon">💾</span>
        <span class="toolbar-text">OBJ</span>
      </button>
      <button 
        class="toolbar-btn"
        @click="$emit('export-fbx')"
        title="导出 FBX"
      >
        <span class="toolbar-icon">📦</span>
        <span class="toolbar-text">FBX</span>
      </button>
    </div>
  </div>
</template>

<script setup>
// AppToolbar.vue - 顶部工具栏组件
// 提供操作模式切换功能

defineProps({
  visible: {
    type: Boolean,
    default: false
  },
  currentMode: {
    type: String,
    default: 'move',
    validator: (value) => ['move', 'rotate', 'join', 'array'].includes(value)
  }
})

defineEmits([
  'mode-change',
  'export-obj',
  'export-fbx'
])
</script>

<style scoped>
.top-toolbar {
  position: fixed;
  top: 20px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 1000;
  background: rgba(42, 42, 42, 0.95);
  backdrop-filter: blur(10px);
  border-radius: 12px;
  padding: 8px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
  border: 1px solid rgba(255, 255, 255, 0.1);
}

.toolbar-group {
  display: flex;
  gap: 4px;
}

.toolbar-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 12px 16px;
  background: transparent;
  border: none;
  border-radius: 8px;
  color: #cccccc;
  cursor: pointer;
  transition: all 0.2s ease;
  min-width: 60px;
}

.toolbar-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  color: #ffffff;
  transform: translateY(-1px);
}

.toolbar-btn.active {
  background: rgba(64, 150, 255, 0.2);
  color: #4096ff;
  box-shadow: 0 0 0 1px rgba(64, 150, 255, 0.3);
}

.toolbar-icon {
  font-size: 18px;
  line-height: 1;
}

.toolbar-text {
  font-size: 11px;
  font-weight: 500;
  line-height: 1;
}

.toolbar-divider {
  width: 1px;
  background-color: rgba(255, 255, 255, 0.1);
  margin: 4px 8px;
}
</style>