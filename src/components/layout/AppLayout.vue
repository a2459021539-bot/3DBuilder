<template>
  <div class="app">
    <slot name="scene" />
    <slot name="toolbar" />
    <slot name="menu-trigger" />
    <slot name="sidebar" />
    <slot name="panels" />
    <slot name="controls" />
    <slot name="dialogs" />
  </div>
</template>

<script setup>
// AppLayout.vue - 主布局容器组件
// 提供应用的基础布局结构，通过插槽组织各个功能区域

defineProps({
  isMenuCollapsed: {
    type: Boolean,
    default: false
  },
  showPanels: {
    type: Boolean,
    default: false
  }
})

defineEmits([
  'toggle-menu',
  'panel-change'
])
</script>

<style scoped>
.app {
  position: relative;
  width: 100vw;
  height: 100vh;
  overflow: hidden;
  font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
  background: #1a1a1a;
  color: #ffffff;
}
</style>