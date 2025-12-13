<template>
  <!-- 右下角控制面板 -->
  <div class="ui-panel">
    <h1>3D Build</h1>
    <p>{{ currentModeTitle }}</p>
    <div class="instructions">
      <div 
        v-for="(instruction, index) in currentInstructions" 
        :key="index"
        class="instruction-item"
      >
        <span class="key">{{ instruction.key }}</span>
        <span class="desc">{{ instruction.desc }}</span>
      </div>
    </div>
    <div class="controls">
      <button @click="$emit('reset-camera')">重置相机</button>
      <button @click="$emit('switch-camera')">{{ cameraMode === 'perspective' ? '透视' : '正交' }}</button>
      <button @click="$emit('clear-all-data')" class="danger-btn">清除所有</button>
    </div>
  </div>
</template>

<script setup>
// AppControls.vue - 右下角控制面板组件
// 提供相机控制和操作指引

defineProps({
  currentModeTitle: {
    type: String,
    default: '浏览模式'
  },
  currentInstructions: {
    type: Array,
    default: () => []
  },
  cameraMode: {
    type: String,
    default: 'perspective',
    validator: (value) => ['perspective', 'orthographic'].includes(value)
  }
})

defineEmits([
  'reset-camera',
  'switch-camera', 
  'clear-all-data'
])
</script>

<style scoped>
.ui-panel {
  position: fixed;
  bottom: 20px;
  right: 20px;
  width: 280px;
  background: rgba(42, 42, 42, 0.95);
  backdrop-filter: blur(10px);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 12px;
  padding: 20px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
  z-index: 1000;
  transition: all 0.3s ease;
}

.ui-panel h1 {
  margin: 0 0 8px 0;
  font-size: 18px;
  font-weight: 700;
  color: #ffffff;
  text-align: center;
}

.ui-panel p {
  margin: 0 0 15px 0;
  font-size: 13px;
  color: #4096ff;
  text-align: center;
  font-weight: 500;
}

.instructions {
  margin-bottom: 15px;
  max-height: 200px;
  overflow-y: auto;
}

.instruction-item {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
  font-size: 11px;
  line-height: 1.4;
}

.key {
  background: rgba(64, 150, 255, 0.15);
  color: #4096ff;
  padding: 2px 6px;
  border-radius: 4px;
  font-weight: 500;
  min-width: 60px;
  text-align: center;
  font-size: 10px;
  border: 1px solid rgba(64, 150, 255, 0.3);
}

.desc {
  color: #cccccc;
  flex: 1;
}

.controls {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.controls button {
  padding: 8px 12px;
  background: rgba(64, 150, 255, 0.1);
  border: 1px solid rgba(64, 150, 255, 0.3);
  border-radius: 6px;
  color: #4096ff;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
}

.controls button:hover {
  background: rgba(64, 150, 255, 0.2);
  transform: translateY(-1px);
  box-shadow: 0 2px 8px rgba(64, 150, 255, 0.2);
}

.danger-btn {
  background: rgba(255, 77, 79, 0.1) !important;
  border-color: rgba(255, 77, 79, 0.3) !important;
  color: #ff4d4f !important;
}

.danger-btn:hover {
  background: rgba(255, 77, 79, 0.2) !important;
  box-shadow: 0 2px 8px rgba(255, 77, 79, 0.2) !important;
}

/* 滚动条样式 */
.instructions::-webkit-scrollbar {
  width: 4px;
}

.instructions::-webkit-scrollbar-track {
  background: rgba(255, 255, 255, 0.05);
  border-radius: 2px;
}

.instructions::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.2);
  border-radius: 2px;
}

.instructions::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.3);
}
</style>