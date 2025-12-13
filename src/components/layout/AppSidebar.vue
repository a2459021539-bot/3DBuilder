<template>
  <!-- 菜单触发按钮（仅在菜单折叠时显示） -->
  <button 
    v-if="isCollapsed" 
    class="menu-trigger" 
    @click="$emit('toggle-collapse')"
    title="展开菜单"
  >
    ☰
  </button>
  
  <!-- 左侧菜单 -->
  <div class="side-menu" :class="{ collapsed: isCollapsed }">
    <div class="menu-header">
      <span class="menu-title" v-if="!isCollapsed">菜单</span>
      <button class="menu-toggle-btn" @click="$emit('toggle-collapse')">
        {{ isCollapsed ? '▶' : '◀' }}
      </button>
    </div>
    <div class="menu-content">
      <!-- 总装备体 -->
      <div class="submenu-group">
        <div class="submenu-header" @click="$emit('toggle-submenu', 'assembly')">
          <span class="submenu-icon">📦</span>
          <span class="submenu-title" v-if="!isCollapsed">总装备体</span>
          <span class="submenu-arrow" v-if="!isCollapsed">
            {{ expandedSubmenus.assembly ? '▼' : '▶' }}
          </span>
        </div>
        <div class="submenu-content" v-if="!isCollapsed && expandedSubmenus.assembly">
          <div class="submenu-action-bar">
            <button class="submenu-action-btn" @click.stop="$emit('view-assembly')">
              <span class="submenu-action-icon">👀</span>
              <span class="submenu-action-text">浏览</span>
            </button>
          </div>
          <div class="submenu-empty" v-if="!assemblyItems || assemblyItems.length === 0">
            <span class="submenu-empty-text">暂无数据</span>
          </div>
          <div 
            v-for="item in assemblyItems" 
            :key="item.id"
            class="submenu-item" 
            @click="$emit('submenu-click', 'assembly', item.id)"
          >
            <span class="submenu-item-text">{{ item.name }}</span>
          </div>
        </div>
      </div>
      
      <!-- 零件列表 -->
      <div class="submenu-group">
        <div class="submenu-header" @click="$emit('toggle-submenu', 'parts')">
          <span class="submenu-icon">🔩</span>
          <span class="submenu-title" v-if="!isCollapsed">零件列表</span>
          <span class="submenu-arrow" v-if="!isCollapsed">
            {{ expandedSubmenus.parts ? '▼' : '▶' }}
          </span>
        </div>
        <div class="submenu-content" v-if="!isCollapsed && expandedSubmenus.parts">
          <div class="submenu-action-bar">
            <button class="submenu-action-btn" @click.stop="$emit('create-new-part')">
              <span class="submenu-action-icon">➕</span>
              <span class="submenu-action-text">新建零件</span>
            </button>
          </div>
          <div class="submenu-empty" v-if="!partsItems || partsItems.length === 0">
            <span class="submenu-empty-text">暂无数据</span>
          </div>
          <div 
            v-for="item in partsItems" 
            :key="item.id"
            class="submenu-item" 
            @click="$emit('submenu-click', 'parts', item.id)"
          >
            <span class="submenu-item-text">{{ item.name }}</span>
            <div class="item-actions">
              <button 
                class="item-action-btn" 
                @click.stop="$emit('add-to-assembly', item)" 
                title="添加到总装配体"
              >
                🛠️
              </button>
              <button 
                class="item-action-btn item-action-btn-danger" 
                @click.stop="$emit('delete-part', item)" 
                title="删除零件"
              >
                🗑️
              </button>
            </div>
          </div>
        </div>
      </div>
      
      <!-- 操作历史 -->
      <div class="submenu-group">
        <div class="submenu-header" @click="$emit('toggle-submenu', 'history')">
          <span class="submenu-icon">📜</span>
          <span class="submenu-title" v-if="!isCollapsed">操作历史</span>
          <span class="submenu-arrow" v-if="!isCollapsed">
            {{ expandedSubmenus.history ? '▼' : '▶' }}
          </span>
        </div>
        <div class="submenu-content" v-if="!isCollapsed && expandedSubmenus.history">
          <div class="submenu-empty" v-if="!historyItems || historyItems.length === 0">
            <span class="submenu-empty-text">暂无数据</span>
          </div>
          <div 
            v-for="(item, index) in historyItems" 
            :key="item.id"
            class="submenu-item history-item" 
            @click="$emit('submenu-click', 'history', item.id)"
          >
            <div class="history-content">
              <span class="submenu-item-text">{{ item.name }}</span>
              <span class="history-details" v-if="getHistoryDetails && getHistoryDetails(item)">
                {{ getHistoryDetails(item) }}
              </span>
              <span class="history-time">{{ item.time }}</span>
            </div>
            <button 
              v-if="index === 0"
              class="item-action-btn undo-btn" 
              @click.stop="$emit('undo-last-action')" 
              title="撤回操作"
            >
              ↩️
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
// AppSidebar.vue - 侧边栏菜单组件
// 提供菜单导航和数据管理功能

defineProps({
  isCollapsed: {
    type: Boolean,
    default: false
  },
  expandedSubmenus: {
    type: Object,
    default: () => ({})
  },
  assemblyItems: {
    type: Array,
    default: () => []
  },
  partsItems: {
    type: Array,
    default: () => []
  },
  historyItems: {
    type: Array,
    default: () => []
  },
  getHistoryDetails: {
    type: Function,
    default: null
  }
})

defineEmits([
  'toggle-collapse',
  'toggle-submenu',
  'view-assembly',
  'create-new-part',
  'submenu-click',
  'add-to-assembly',
  'delete-part',
  'undo-last-action'
])
</script>

<style scoped>
.menu-trigger {
  position: fixed;
  top: 20px;
  left: 20px;
  z-index: 1001;
  width: 40px;
  height: 40px;
  background: rgba(42, 42, 42, 0.95);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  color: #ffffff;
  font-size: 16px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  backdrop-filter: blur(10px);
  transition: all 0.2s ease;
}

.menu-trigger:hover {
  background: rgba(64, 150, 255, 0.2);
  transform: scale(1.05);
}

.side-menu {
  position: fixed;
  left: 0;
  top: 0;
  width: 250px;
  height: 100vh;
  background: rgba(32, 32, 32, 0.95);
  backdrop-filter: blur(10px);
  border-right: 1px solid rgba(255, 255, 255, 0.1);
  z-index: 1000;
  transition: transform 0.3s ease;
  overflow-y: auto;
}

.side-menu.collapsed {
  transform: translateX(-210px);
  width: 40px;
}

.menu-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 15px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(42, 42, 42, 0.8);
}

.menu-title {
  font-weight: 600;
  font-size: 16px;
  color: #ffffff;
}

.menu-toggle-btn {
  background: transparent;
  border: none;
  color: #cccccc;
  font-size: 14px;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 4px;
  transition: all 0.2s ease;
}

.menu-toggle-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  color: #ffffff;
}

.menu-content {
  padding: 10px 0;
}

.submenu-group {
  margin-bottom: 8px;
}

.submenu-header {
  display: flex;
  align-items: center;
  padding: 12px 15px;
  cursor: pointer;
  transition: background-color 0.2s ease;
  gap: 10px;
}

.submenu-header:hover {
  background: rgba(255, 255, 255, 0.05);
}

.submenu-icon {
  font-size: 16px;
  width: 20px;
  text-align: center;
}

.submenu-title {
  flex: 1;
  font-weight: 500;
  color: #ffffff;
}

.submenu-arrow {
  font-size: 12px;
  color: #888888;
  transition: transform 0.2s ease;
}

.submenu-content {
  background: rgba(0, 0, 0, 0.2);
  border-top: 1px solid rgba(255, 255, 255, 0.05);
}

.submenu-action-bar {
  padding: 8px 15px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
}

.submenu-action-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  background: rgba(64, 150, 255, 0.1);
  border: 1px solid rgba(64, 150, 255, 0.3);
  border-radius: 6px;
  color: #4096ff;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.2s ease;
  width: 100%;
}

.submenu-action-btn:hover {
  background: rgba(64, 150, 255, 0.2);
  transform: translateY(-1px);
}

.submenu-action-icon {
  font-size: 14px;
}

.submenu-empty {
  padding: 20px 15px;
  text-align: center;
}

.submenu-empty-text {
  color: #666666;
  font-size: 12px;
  font-style: italic;
}

.submenu-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 15px;
  cursor: pointer;
  transition: background-color 0.2s ease;
  border-bottom: 1px solid rgba(255, 255, 255, 0.02);
}

.submenu-item:hover {
  background: rgba(255, 255, 255, 0.05);
}

.submenu-item-text {
  flex: 1;
  font-size: 13px;
  color: #cccccc;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.item-actions {
  display: flex;
  gap: 4px;
  opacity: 0;
  transition: opacity 0.2s ease;
}

.submenu-item:hover .item-actions {
  opacity: 1;
}

.item-action-btn {
  background: transparent;
  border: none;
  color: #888888;
  font-size: 12px;
  cursor: pointer;
  padding: 2px 4px;
  border-radius: 3px;
  transition: all 0.2s ease;
}

.item-action-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  color: #ffffff;
}

.item-action-btn-danger:hover {
  background: rgba(255, 77, 79, 0.2);
  color: #ff4d4f;
}

.history-item {
  flex-direction: column;
  align-items: stretch;
}

.history-content {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
}

.history-details {
  font-size: 11px;
  color: #888888;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.history-time {
  font-size: 10px;
  color: #666666;
}

.undo-btn {
  align-self: flex-end;
  margin-top: 4px;
}
</style>