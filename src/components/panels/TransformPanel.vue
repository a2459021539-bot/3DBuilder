<template>
  <div class="params-panel" :class="{ 'menu-collapsed': isMenuCollapsed }">
    <div class="params-header">
      <span class="params-title">{{ transformType === 'move' ? '移动参数' : '旋转参数' }}</span>
      <button class="params-close-btn" @click="$emit('close')" title="关闭">×</button>
    </div>
    <div class="params-body">
      <!-- 变换参数内容 - 占位符 -->
      <p>变换参数面板 (待实现)</p>
    </div>
  </div>
</template>

<script setup>
defineProps({
  isMenuCollapsed: Boolean,
  transformType: String,
  movePlane: String,
  transformPosition: Object,
  transformAxis: String,
  transformRotationDeg: Object
})

defineEmits(['close', 'set-move-plane', 'update-transform-position', 'update-transform-rotation'])
</script>

<style scoped>
/* 复用相同的面板样式 */
.params-panel {
  position: fixed;
  right: 20px;
  top: 50%;
  transform: translateY(-50%);
  width: 300px;
  max-height: 80vh;
  background: rgba(42, 42, 42, 0.95);
  backdrop-filter: blur(10px);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 12px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
  z-index: 1000;
  overflow: hidden;
  transition: right 0.3s ease;
}

.params-panel.menu-collapsed {
  right: 20px;
}

.params-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 15px 20px;
  background: rgba(32, 32, 32, 0.8);
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.params-title {
  font-weight: 600;
  color: #ffffff;
  font-size: 14px;
}

.params-close-btn {
  background: transparent;
  border: none;
  color: #888888;
  font-size: 18px;
  cursor: pointer;
  padding: 0;
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  transition: all 0.2s ease;
}

.params-close-btn:hover {
  background: rgba(255, 77, 79, 0.2);
  color: #ff4d4f;
}

.params-body {
  padding: 20px;
  max-height: calc(80vh - 60px);
  overflow-y: auto;
}
</style>