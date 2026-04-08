<template>
  <div class="app">
    <!-- 保存提示 -->
    <div v-if="saveToast" class="save-toast">已保存</div>
    <!-- 工作空间切换器（右上角） -->
    <div class="workspace-switcher">
      <button 
        class="workspace-switcher-btn"
        @click="showWorkspaceSelector = true"
        :title="currentWorkspaceName || '选择工作空间'"
      >
        <span class="workspace-switcher-icon">📁</span>
        <span class="workspace-switcher-name" v-if="currentWorkspaceName">
          {{ currentWorkspaceName }}
        </span>
        <span class="workspace-switcher-name" v-else>
          选择工作空间
        </span>
      </button>
    </div>
    
    <ThreeScene />
    <!-- 顶部工具栏 -->
    <div class="top-toolbar" v-if="isViewingAssembly && assemblyItems && assemblyItems.length > 0">
      <div class="toolbar-group">
        <button
          :class="['toolbar-btn', { active: !isMoveMode && !isRotationMode && !isJoinMode && !isArrayMode }]"
          @click="switchMode('browse')"
          title="浏览模式"
        >
          <span class="toolbar-icon">{{ getToolbarIcon('view') }}</span>
          <span class="toolbar-text">浏览</span>
        </button>
        <button
          :class="['toolbar-btn', { active: isMoveMode }]"
          @click="switchMode('move')"
          title="移动模式"
        >
          <span class="toolbar-icon">{{ getToolbarIcon('move') }}</span>
          <span class="toolbar-text">移动</span>
        </button>
        <button 
          :class="['toolbar-btn', { active: isRotationMode }]"
          @click="switchMode('rotate')"
          title="旋转模式"
        >
          <span class="toolbar-icon">{{ getToolbarIcon('rotate') }}</span>
          <span class="toolbar-text">旋转</span>
        </button>
        <button 
          :class="['toolbar-btn', { active: isJoinMode }]"
          @click="switchMode('join')"
          title="拼接模式"
        >
          <span class="toolbar-icon">{{ getToolbarIcon('join') }}</span>
          <span class="toolbar-text">拼接</span>
        </button>
        <button 
          :class="['toolbar-btn', { active: isArrayMode }]"
          @click="switchMode('array')"
          title="阵列模式"
        >
          <span class="toolbar-icon">{{ getToolbarIcon('array') }}</span>
          <span class="toolbar-text">阵列</span>
        </button>
        <div class="toolbar-divider"></div>
        <button 
          class="toolbar-btn"
          @click="openExportDialog"
          title="导出模型"
        >
          <span class="toolbar-icon">📤</span>
          <span class="toolbar-text">导出</span>
        </button>
      </div>
    </div>
    <!-- 菜单触发按钮（仅在菜单折叠时显示） -->
    <button 
      v-if="isMenuCollapsed" 
      class="menu-trigger" 
      @click="toggleMenuCollapse"
      title="展开菜单"
    >
      {{ getMenuIcon('menu') }}
    </button>
    <!-- 左侧菜单 -->
    <div 
      class="side-menu" 
      :class="{ collapsed: isMenuCollapsed }"
      :style="{ width: menuWidth + 'px' }"
    >
      <div class="menu-header">
        <span class="menu-title" v-if="!isMenuCollapsed">菜单</span>
        <button class="menu-toggle-btn" @click="toggleMenuCollapse">
          {{ isMenuCollapsed ? icons.ui.menuExpand : icons.ui.menuCollapse }}
        </button>
      </div>
      <div class="menu-content">
        <!-- 可拖拽的菜单组 -->
        <div 
          v-for="(menuKey, index) in menuOrder" 
          :key="menuKey"
          class="submenu-group"
          :class="[`submenu-group-${menuKey}`, { 'dragging': draggedMenuIndex === index, 'drag-over': dragOverIndex === index }]"
          @dragover.prevent="handleDragOver(index, $event)"
          @drop.prevent="handleDrop(index, $event)"
        >
          <div 
            class="submenu-header" 
            :draggable="!isMenuCollapsed"
            @dragstart="handleDragStart(index, $event)"
            @dragend="handleDragEnd($event)"
            @click="!isDraggingMenu && toggleSubmenu(menuKey)"
          >
            <span 
              class="submenu-drag-handle" 
              v-if="!isMenuCollapsed" 
              title="拖拽调整顺序"
              @mousedown.stop
            >⋮⋮</span>
            <span class="submenu-icon">{{ getMenuIcon(menuKey) }}</span>
            <span class="submenu-title" v-if="!isMenuCollapsed">{{ getMenuTitle(menuKey) }}</span>
            <span class="submenu-arrow" v-if="!isMenuCollapsed">
              {{ getFolderArrowIcon(expandedSubmenus[menuKey]) }}
            </span>
          </div>
          
          <!-- 总装备体内容 -->
          <div v-if="menuKey === 'assembly'" class="submenu-content" v-show="!isMenuCollapsed && expandedSubmenus.assembly" @dragstart.stop @dragover.stop @drop.stop>
            <div class="submenu-action-bar">
              <button class="submenu-action-btn" @click.stop="viewAssembly">
                <span class="submenu-action-icon">{{ getActionIcon('view') }}</span>
                <span class="submenu-action-text">浏览</span>
              </button>
              <button 
                v-if="topLevelAssemblyItems.length > 0"
                class="submenu-action-btn" 
                @click.stop="toggleSelectAllAssemblyItems"
                :title="isAllAssemblyItemsSelected ? '取消全选' : '全选'"
              >
                <span class="submenu-action-icon">{{ getCheckboxIcon(isAllAssemblyItemsSelected) }}</span>
                <span class="submenu-action-text">{{ isAllAssemblyItemsSelected ? '取消全选' : '全选' }}</span>
              </button>
            </div>
            <div class="submenu-empty" v-if="!assemblyItems || assemblyItems.length === 0">
              <span class="submenu-empty-text">暂无数据</span>
            </div>
            <div class="submenu-empty" v-else-if="topLevelAssemblyItems.length === 0">
              <span class="submenu-empty-text">暂无顶级项</span>
            </div>
            <template v-else v-for="item in topLevelAssemblyItems" :key="item.id">
              <!-- 文件夹类型的项 -->
              <div 
                v-if="item.type === 'array-group'"
                class="submenu-item submenu-folder"
              >
                <div class="folder-header" @click.stop="selectFolderChildren(item.id)">
                  <span class="folder-icon">{{ getFolderIcon(arrayGroupExpanded.get(item.id)) }}</span>
                  <span class="submenu-item-text">{{ item.name }}</span>
                  <span class="folder-arrow" @click.stop="toggleArrayGroup(item.id)">{{ getFolderArrowIcon(arrayGroupExpanded.get(item.id)) }}</span>
                </div>
                <div 
                  v-if="arrayGroupExpanded.get(item.id)" 
                  class="folder-children"
                >
                  <div 
                    v-for="child in getArrayGroupChildren(item.id)" 
                    :key="child.id"
                    class="submenu-item submenu-item-child"
                    :class="{ 'selected': selectedAssemblyItems.has(child.id) }"
                    @click.stop="handleAssemblyItemClick($event, child.id)"
                  >
                    <span class="submenu-item-icon">{{ getPartIcon(child.type) }}</span>
                    <span class="submenu-item-text">{{ child.name || `管道 ${child.id}` }}</span>
                  </div>
                  <div v-if="getArrayGroupChildren(item.id).length === 0" class="submenu-item submenu-item-child" style="color: #888; font-style: italic; padding: 8px 20px;">
                    <span class="submenu-item-text">暂无子项</span>
                  </div>
                </div>
              </div>
              <!-- 普通项 -->
              <div 
                v-else
                class="submenu-item"
                :class="{ 'selected': selectedAssemblyItems.has(item.id) }"
                @click="handleAssemblyItemClick($event, item.id)"
              >
                <span class="submenu-item-icon">{{ getPartIcon(item.type) }}</span>
                <span class="submenu-item-text">{{ item.name }}</span>
              </div>
            </template>
          </div>
          
          <!-- 零件列表内容 -->
          <div v-if="menuKey === 'parts'" class="submenu-content" v-show="!isMenuCollapsed && expandedSubmenus.parts" @dragstart.stop @dragover.stop @drop.stop>
            <div class="submenu-action-bar">
              <button class="submenu-action-btn" @click.stop="createNewPart">
                <span class="submenu-action-icon">{{ getActionIcon('add') }}</span>
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
              @click="handleSubmenuClick('parts', item.id)"
            >
              <span class="submenu-item-icon">{{ getPartIcon(item.type) }}</span>
              <span class="submenu-item-text">{{ item.name }}</span>
              <div class="item-actions">
                <button 
                  class="item-action-btn" 
                  @click.stop="addToAssembly(item)" 
                  title="添加到总装配体"
                >
                  {{ getActionIcon('edit') }}
                </button>
                <button 
                  class="item-action-btn item-action-btn-danger" 
                  @click.stop="deletePart(item)" 
                  title="删除零件"
                >
                  {{ getActionIcon('delete') }}
                </button>
              </div>
            </div>
          </div>
          
          <!-- 装配历史内容 -->
          <div v-if="menuKey === 'history'" class="submenu-content" v-show="!isMenuCollapsed && expandedSubmenus.history" @dragstart.stop @dragover.stop @drop.stop>
            <div class="submenu-empty" v-if="!assemblyHistoryItems || assemblyHistoryItems.length === 0">
              <span class="submenu-empty-text">暂无数据</span>
            </div>
            <div 
              v-for="(item, index) in assemblyHistoryItems" 
              :key="item.id"
              class="submenu-item history-item" 
              @click="handleSubmenuClick('history', item.id)"
            >
              <span class="submenu-item-icon">{{ getHistoryTypeIcon(item.type) }}</span>
              <div class="history-content">
                <span class="submenu-item-text">{{ item.name }}</span>
                <span class="history-details" v-if="getHistoryDetails(item)">
                  {{ getHistoryDetails(item) }}
                </span>
                <span class="history-time">{{ item.time }}</span>
              </div>
              <button 
                v-if="index === 0"
                class="item-action-btn undo-btn" 
                @click.stop="undoLastAction" 
                title="撤回操作"
              >
                {{ getActionIcon('undo') }}
              </button>
            </div>
          </div>
        </div>
      </div>
      <!-- 菜单宽度调整条 -->
      <div 
        v-if="!isMenuCollapsed"
        class="menu-resizer"
        @mousedown="startResize"
        title="拖拽调整菜单宽度"
      ></div>

      <!-- 菜单底部操作区 -->
      <div class="menu-footer" v-if="!isMenuCollapsed">
        <div class="footer-actions">
          <button class="footer-btn" @click="handleExportExcel" title="导出 Excel">
            <span class="footer-btn-icon">📥</span>
            <span class="footer-btn-text">Excel 导出</span>
          </button>
          <button class="footer-btn" @click="triggerImportExcel" title="导入 Excel">
            <span class="footer-btn-icon">📤</span>
            <span class="footer-btn-text">Excel 导入</span>
          </button>
          <input 
            type="file" 
            ref="excelInput" 
            style="display: none" 
            accept=".xlsx, .xls"
            @change="handleImportExcel"
          />
        </div>
      </div>
    </div>
    <!-- 装配历史编辑面板 -->
    <div 
      class="params-panel" 
      v-if="showHistoryEdit" 
      :class="{ 'menu-collapsed': isMenuCollapsed }"
      :style="{ left: isMenuCollapsed ? '0px' : menuWidth + 'px' }"
    >
      <div class="params-header">
        <span class="params-title">编辑装配记录</span>
        <button class="params-close-btn" @click="closeHistoryEdit" title="关闭">×</button>
      </div>
      <div class="params-body">
        <!-- 移动操作编辑 -->
        <div v-if="editingHistoryItem && editingHistoryItem.type === 'move'">
          <div class="param-item">
            <label class="param-label">起始位置 (mm)</label>
            <div class="vector-input-group">
              <input 
                type="number" 
                v-model.number="editingHistoryItem.startPosition.x" 
                class="param-input vector-input"
                step="0.1"
                placeholder="X"
                @input="updateEditingMoveDetails"
              />
              <input 
                type="number" 
                v-model.number="editingHistoryItem.startPosition.y" 
                class="param-input vector-input"
                step="0.1"
                placeholder="Y"
                @input="updateEditingMoveDetails"
              />
              <input 
                type="number" 
                v-model.number="editingHistoryItem.startPosition.z" 
                class="param-input vector-input"
                step="0.1"
                placeholder="Z"
                @input="updateEditingMoveDetails"
              />
            </div>
          </div>
          <div class="param-item">
            <label class="param-label">结束位置 (mm)</label>
            <div class="vector-input-group">
              <input 
                type="number" 
                v-model.number="editingHistoryItem.endPosition.x" 
                class="param-input vector-input"
                step="0.1"
                placeholder="X"
                @input="updateEditingMoveDetails"
              />
              <input 
                type="number" 
                v-model.number="editingHistoryItem.endPosition.y" 
                class="param-input vector-input"
                step="0.1"
                placeholder="Y"
                @input="updateEditingMoveDetails"
              />
              <input 
                type="number" 
                v-model.number="editingHistoryItem.endPosition.z" 
                class="param-input vector-input"
                step="0.1"
                placeholder="Z"
                @input="updateEditingMoveDetails"
              />
            </div>
          </div>
          <div class="param-item">
            <div class="param-hint">
              <span class="hint-label">移动详情：</span>
              <span class="hint-value">{{ getHistoryDetails(editingHistoryItem) }}</span>
            </div>
          </div>
        </div>
        
        <!-- 旋转操作编辑 -->
        <div v-if="editingHistoryItem && editingHistoryItem.type === 'rotate'">
          <div class="param-item">
            <label class="param-label">旋转轴</label>
            <div class="axis-buttons">
              <button 
                :class="['axis-btn', 'axis-btn-x', { active: editingHistoryItem.axis === 'x' }]"
                @click="editingHistoryItem.axis = 'x'; updateEditingRotationDetails()"
              >
                X
              </button>
              <button 
                :class="['axis-btn', 'axis-btn-y', { active: editingHistoryItem.axis === 'y' }]"
                @click="editingHistoryItem.axis = 'y'; updateEditingRotationDetails()"
              >
                Y
              </button>
              <button 
                :class="['axis-btn', 'axis-btn-z', { active: editingHistoryItem.axis === 'z' }]"
                @click="editingHistoryItem.axis = 'z'; updateEditingRotationDetails()"
              >
                Z
              </button>
            </div>
          </div>
          <div class="param-item">
            <label class="param-label">起始角度 (°)</label>
            <input 
              type="number" 
              v-model.number="editingStartAngleDeg" 
              class="param-input"
              step="0.1"
              @input="updateEditingRotationFromDegrees"
            />
          </div>
          <div class="param-item">
            <label class="param-label">结束角度 (°)</label>
            <input 
              type="number" 
              v-model.number="editingEndAngleDeg" 
              class="param-input"
              step="0.1"
              @input="updateEditingRotationFromDegrees"
            />
          </div>
          <div class="param-item">
            <div class="param-hint">
              <span class="hint-label">旋转详情：</span>
              <span class="hint-value">{{ getHistoryDetails(editingHistoryItem) }}</span>
            </div>
          </div>
        </div>
        
        <div class="param-actions">
          <button class="param-btn param-btn-primary" @click="saveHistoryEdit">保存</button>
          <button class="param-btn param-btn-secondary" @click="closeHistoryEdit">取消</button>
        </div>
      </div>
    </div>
    <!-- 移动/旋转参数面板 -->
    <div 
      class="params-panel" 
      v-if="showTransformPanel" 
      :class="{ 'menu-collapsed': isMenuCollapsed }"
      :style="{ left: isMenuCollapsed ? '0px' : menuWidth + 'px' }"
    >
      <div class="params-header">
        <span class="params-title">{{ transformType === 'move' ? '移动参数' : '旋转参数' }}</span>
        <button class="params-close-btn" @click="closeTransformPanel" title="关闭">×</button>
      </div>
      <div class="params-body">
        <!-- 移动操作参数 -->
        <div v-if="transformType === 'move'">
          <div class="param-item">
            <label class="param-label">移动平面</label>
            <div class="axis-buttons">
              <button 
                :class="['axis-btn', 'plane-btn-free', { active: movePlane === 'free' }]"
                @click="setMovePlane('free')"
              >
                任意
              </button>
              <button 
                :class="['axis-btn', 'plane-btn-xy', { active: movePlane === 'xy' }]"
                @click="setMovePlane('xy')"
              >
                XY
              </button>
              <button 
                :class="['axis-btn', 'plane-btn-yz', { active: movePlane === 'yz' }]"
                @click="setMovePlane('yz')"
              >
                YZ
              </button>
              <button 
                :class="['axis-btn', 'plane-btn-zx', { active: movePlane === 'zx' }]"
                @click="setMovePlane('zx')"
              >
                ZX
              </button>
            </div>
          </div>
          <div class="param-item">
            <label class="param-label">位置 (mm)</label>
            <div class="vector-input-group">
              <input 
                type="number" 
                v-model.number="transformPosition.x" 
                class="param-input vector-input"
                step="0.1"
                placeholder="X"
                @input="updateTransformPosition"
              />
              <input 
                type="number" 
                v-model.number="transformPosition.y" 
                class="param-input vector-input"
                step="0.1"
                placeholder="Y"
                @input="updateTransformPosition"
              />
              <input 
                type="number" 
                v-model.number="transformPosition.z" 
                class="param-input vector-input"
                step="0.1"
                placeholder="Z"
                @input="updateTransformPosition"
              />
            </div>
          </div>
        </div>
        
        <!-- 旋转操作参数 -->
        <div v-if="transformType === 'rotate'">
          <div class="param-item">
            <label class="param-label">旋转轴</label>
            <div class="axis-buttons">
              <button 
                :class="['axis-btn', 'axis-btn-x', { active: transformAxis === 'x' }]"
                @click="transformAxis = 'x'"
              >
                X
              </button>
              <button 
                :class="['axis-btn', 'axis-btn-y', { active: transformAxis === 'y' }]"
                @click="transformAxis = 'y'"
              >
                Y
              </button>
              <button 
                :class="['axis-btn', 'axis-btn-z', { active: transformAxis === 'z' }]"
                @click="transformAxis = 'z'"
              >
                Z
              </button>
            </div>
          </div>
          <div class="param-item">
            <label class="param-label">旋转角度 (°)</label>
            <div class="vector-input-group">
              <input 
                type="number" 
                v-model.number="transformRotationDeg.x" 
                class="param-input vector-input"
                step="0.1"
                placeholder="X"
                @input="updateTransformRotationFromDegrees"
              />
              <input 
                type="number" 
                v-model.number="transformRotationDeg.y" 
                class="param-input vector-input"
                step="0.1"
                placeholder="Y"
                @input="updateTransformRotationFromDegrees"
              />
              <input 
                type="number" 
                v-model.number="transformRotationDeg.z" 
                class="param-input vector-input"
                step="0.1"
                placeholder="Z"
                @input="updateTransformRotationFromDegrees"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
    <!-- 建管参数框（独立面板，位于菜单右侧） -->
    <div 
      class="params-panel" 
      v-if="showPipeParams" 
      :class="{ 'menu-collapsed': isMenuCollapsed }"
      :style="{ left: isMenuCollapsed ? '0px' : menuWidth + 'px' }"
    >
      <div class="params-header">
        <span class="params-title">{{ editingPartId ? '编辑参数' : '建管参数' }}</span>
        <button class="params-close-btn" @click="closePipeParams" title="关闭">×</button>
      </div>
      <div class="params-body">
        <div class="param-item">
          <label class="param-label">名称</label>
          <input 
            type="text" 
            v-model.trim="pipeParams.name" 
            class="param-input"
            placeholder="请输入名称"
          />
        </div>
        <div class="param-item">
          <label class="param-label">内径 (mm)</label>
          <input 
            type="number" 
            v-model.number="pipeParams.innerDiameter" 
            class="param-input"
            min="0"
            step="0.1"
          />
        </div>
        <div class="param-item">
          <label class="param-label">外径 (mm)</label>
          <input 
            type="number" 
            v-model.number="pipeParams.outerDiameter" 
            class="param-input"
            min="0"
            step="0.1"
          />
        </div>
        <div class="param-item" v-if="currentPartType === 'straight'">
          <label class="param-label">长度 (mm)</label>
          <input 
            type="number" 
            v-model.number="pipeParams.length" 
            class="param-input"
            min="0"
            step="0.1"
            @wheel.prevent="handleLengthWheel"
          />
        </div>
        <div class="param-item" v-if="currentPartType === 'bend'">
          <label class="param-label">旋转半径 (mm)</label>
          <input 
            type="number" 
            v-model.number="pipeParams.bendRadius" 
            class="param-input"
            min="0"
            step="0.1"
          />
        </div>
        <div class="param-item" v-if="currentPartType === 'bend'">
          <label class="param-label">旋转角度 (°)</label>
          <input 
            type="number" 
            v-model.number="pipeParams.bendAngle" 
            class="param-input"
            min="0"
            max="360"
            step="1"
          />
        </div>
        <div class="param-item">
          <label class="param-label">圆周曲面细分数</label>
          <div class="param-range-wrapper">
            <input 
              type="range" 
              v-model.number="pipeParams.segments" 
              class="param-range"
              min="3"
              max="32"
              step="1"
            />
            <span class="param-value">{{ pipeParams.segments }}</span>
          </div>
        </div>
        <!-- 2D草图建管提示 -->
        <div v-if="currentPartType === 'sketch2d'" class="param-item">
          <div class="param-hint">
            <span class="hint-text">请在左侧2D面板中绘制路径（直线和圆弧），右侧将实时预览3D管道</span>
          </div>
        </div>
        <!-- 3D草图建管提示 -->
        <div v-if="currentPartType === 'sketch3d'" class="param-item">
          <div class="param-hint">
            <span class="hint-text">在3D场景中左键点击放置路径点，Tab切换工作平面，Ctrl+Z撤销，Enter确认</span>
          </div>
        </div>
        <!-- 变径管截面参数 -->
        <div v-if="currentPartType === 'reducer'" class="param-item">
          <div class="param-header-row">
            <label class="param-label">截面列表</label>
            <button 
              class="param-btn-small" 
              @click="addReducerSection"
              type="button"
            >
              + 添加截面
            </button>
          </div>
          <div class="sections-list" v-if="pipeParams.sections && pipeParams.sections.length > 0">
            <div 
              v-for="(section, index) in pipeParams.sections" 
              :key="index"
              class="section-item"
            >
              <div class="section-header">
                <div class="section-header-left">
                  <button 
                    class="section-toggle-btn" 
                    @click="toggleSectionCollapse(index)"
                    type="button"
                    :title="sectionCollapsed.get(index) ? '展开' : '折叠'"
                  >
                    {{ sectionCollapsed.get(index) ? icons.ui.sectionCollapsed : icons.ui.sectionExpanded }}
                  </button>
                  <span class="section-title">截面 {{ index + 1 }}</span>
                </div>
                <button 
                  class="param-btn-small param-btn-danger" 
                  @click="removeReducerSection(index)"
                  type="button"
                >
                  删除
                </button>
              </div>
              <div class="section-inputs" v-show="!sectionCollapsed.get(index)">
                <div class="section-input-group">
                  <label class="section-label">距离 (mm)</label>
                  <input 
                    type="number" 
                    v-model.number="section.distance" 
                    class="param-input"
                    min="0"
                    step="0.1"
                  />
                </div>
                <div class="section-input-group">
                  <label class="section-label">内径 (mm)</label>
                  <input 
                    type="number" 
                    v-model.number="section.innerDiameter" 
                    class="param-input"
                    min="0"
                    step="0.1"
                  />
                </div>
                <div class="section-input-group">
                  <label class="section-label">外径 (mm)</label>
                  <input 
                    type="number" 
                    v-model.number="section.outerDiameter" 
                    class="param-input"
                    min="0"
                    step="0.1"
                  />
                </div>
              </div>
            </div>
          </div>
          <div v-else class="param-hint">
            <span class="hint-text">请至少添加一个截面</span>
          </div>
        </div>
        <div class="param-actions">
          <button class="param-btn param-btn-primary" @click="savePipe(); flushPersist()">{{ editingPartId ? '保存' : '创建' }}</button>
          <button class="param-btn param-btn-secondary" @click="closePipeParams">取消</button>
        </div>
      </div>
    </div>
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
        <button @click="resetCamera">重置相机</button>
        <button @click="clearAllData" class="danger-btn">清除所有</button>
        <button @click="showSettings = !showSettings">设置</button>
      </div>
      <div class="controls" v-if="showSettings" style="margin-top:4px;">
        <button @click="switchCamera">{{ cameraMode === 'perspective' ? '透视' : '正交' }}</button>
        <button @click="switchRendererType">{{ rendererType === 'webgl' ? 'WebGL' : 'WebGPU' }}</button>
        <button type="button" @click="toggleShadows">{{ shadowsEnabled ? '阴影：开' : '阴影：关' }}</button>
        <button type="button" @click="toggleEndCaps">{{ endCapsVisible ? '端面：开' : '端面：关' }}</button>
        <button type="button" @click="toggleFlatShading">{{ flatShading ? '着色：平面' : '着色：平滑' }}</button>
        <button @click="lodAutoMode = !lodAutoMode">{{ lodAutoMode ? '自动优化' : '手动优化' }}</button>
        <template v-if="!lodAutoMode">
          <input type="number" v-model.number="lodManualSegments" min="3" max="16" style="width:50px;" @change="applyManualLod" />
        </template>
      </div>
    </div>
    <!-- 旋转参数面板 -->
    <div 
      class="params-panel" 
      v-if="isRotationMode && assemblyItems && assemblyItems.length > 0" 
      :class="{ 'menu-collapsed': isMenuCollapsed }"
      :style="{ left: isMenuCollapsed ? '0px' : menuWidth + 'px' }"
    >
      <div class="params-header">
        <span class="params-title">旋转参数</span>
        <button class="params-close-btn" @click="switchMode('move')" title="关闭">×</button>
      </div>
      <div class="params-body">
        <div class="param-item">
          <label class="param-label">旋转轴</label>
          <div class="axis-buttons">
            <button 
              :class="['axis-btn', 'axis-btn-x', { active: rotationAxis === 'x' }]"
              @click="rotationAxis = 'x'; updateRotationAxis()"
            >
              X
            </button>
            <button 
              :class="['axis-btn', 'axis-btn-y', { active: rotationAxis === 'y' }]"
              @click="rotationAxis = 'y'; updateRotationAxis()"
            >
              Y
            </button>
            <button 
              :class="['axis-btn', 'axis-btn-z', { active: rotationAxis === 'z' }]"
              @click="rotationAxis = 'z'; updateRotationAxis()"
            >
              Z
            </button>
          </div>
        </div>
        <div class="param-item">
          <label class="param-label">旋转角度 (°)</label>
          <div class="angle-input-group">
            <input 
              type="number" 
              v-model.number="rotationAngle"
              class="param-input"
              placeholder="角度（度）"
              step="1"
              @input="previewRotationAngle"
            />
            <button 
              class="param-btn param-btn-primary"
              @click="applyRotationAngle"
              :disabled="!selectedAssemblyItemId"
            >
              应用
            </button>
          </div>
          <div class="param-hint" v-if="!selectedAssemblyItemId">
            <span class="hint-text">提示：在3D场景中点击管道以选择</span>
          </div>
        </div>
      </div>
    </div>
    <!-- 阵列参数面板 -->
    <div 
      class="params-panel" 
      v-if="isArrayMode && assemblyItems && assemblyItems.length > 0" 
      :class="{ 'menu-collapsed': isMenuCollapsed }"
      :style="{ left: isMenuCollapsed ? '0px' : menuWidth + 'px' }"
    >
      <div class="params-header">
        <span class="params-title">阵列</span>
        <button class="params-close-btn" @click="switchMode('move')" title="关闭">×</button>
      </div>
      <div class="params-body">
        <div class="param-item">
          <div class="param-hint">
            <span class="hint-label">已选择管道：</span>
            <span class="hint-value">{{ arraySelection.length }} 个</span>
          </div>
          <div v-if="arraySelection.length > 0" class="param-hint" style="margin-top: 8px;">
            <div v-for="id in arraySelection" :key="id" style="margin: 4px 0;">
              <span class="hint-text">
                {{ assemblyItems.find(item => item.id === id)?.name || `管道 ${id}` }}
              </span>
            </div>
          </div>
          <div class="param-actions" style="margin-top:10px;padding-top:0;border-top:none">
            <button class="param-btn param-btn-secondary" @click="resetArraySelection">清空选择</button>
          </div>
          <div class="param-hint" v-if="arraySelection.length === 0">
            <span class="hint-text">提示：在3D场景中点击管道以选择/取消</span>
          </div>
        </div>
        <div class="param-item">
          <label class="param-label">阵列方向轴</label>
          <div class="axis-buttons">
            <button 
              :class="['axis-btn', 'axis-btn-x', { active: arrayDirection === 'x' }]"
              @click="arrayDirection = 'x'"
            >X</button>
            <button 
              :class="['axis-btn', 'axis-btn-y', { active: arrayDirection === 'y' }]"
              @click="arrayDirection = 'y'"
            >Y</button>
            <button 
              :class="['axis-btn', 'axis-btn-z', { active: arrayDirection === 'z' }]"
              @click="arrayDirection = 'z'"
            >Z</button>
          </div>
        </div>
        <div class="param-item">
          <label class="param-label">方向</label>
          <div class="axis-buttons">
            <button 
              :class="['axis-btn', { active: arraySign === 1 }]"
              @click="arraySign = 1"
            >正向</button>
            <button 
              :class="['axis-btn', { active: arraySign === -1 }]"
              @click="arraySign = -1"
            >反向</button>
          </div>
        </div>
        <div class="param-item">
          <label class="param-label">间距 (mm)</label>
          <input 
            type="number"
            v-model.number="arraySpacing"
            class="param-input"
            step="0.1"
            min="0"
          />
        </div>
        <div class="param-item">
          <label class="param-label">数量（新增副本个数）</label>
          <input 
            type="number"
            v-model.number="arrayCount"
            class="param-input"
            step="1"
            min="1"
          />
        </div>
        <div class="param-actions">
          <button 
            class="param-btn param-btn-primary" 
            :disabled="arraySelection.length === 0 || arraySpacing <= 0 || arrayCount < 1"
            @click="executeArrayWithLoading"
          >
            执行阵列
          </button>
          <button class="param-btn param-btn-secondary" @click="switchMode('move')">取消</button>
        </div>
        <div class="param-hint">
          <span class="hint-text">阵列将按所选轴每次偏移间距，复制指定数量的副本。</span>
        </div>
      </div>
    </div>
    <!-- 拼接参数面板 -->
    <div 
      class="params-panel" 
      v-if="isJoinMode && assemblyItems && assemblyItems.length > 0" 
      :class="{ 'menu-collapsed': isMenuCollapsed }"
      :style="{ left: isMenuCollapsed ? '0px' : menuWidth + 'px' }"
    >
      <div class="params-header">
        <span class="params-title">面面拼接</span>
        <button class="params-close-btn" @click="switchMode('move')" title="关闭">×</button>
      </div>
      <div class="params-body">
        <div class="param-item">
          <div class="join-status">
            <div v-if="!firstSelectedEndFace" class="status-text">
              请点击第一个管道的端面
            </div>
            <div v-else-if="!secondSelectedEndFace" class="status-text">
              已选择第一个端面，请点击第二个管道的端面
            </div>
            <div v-else class="status-text success">
              已选择两个端面，可以执行拼接
            </div>
          </div>
          <div v-if="firstSelectedEndFace" class="param-hint" style="margin-top: 8px;">
            <span class="hint-label">第一个端面：</span>
            <span class="hint-value">{{ firstSelectedEndFace.pipeName }} - {{ firstSelectedEndFace.endFaceType === 'front' ? '前端面' : '后端面' }}</span>
          </div>
          <div v-if="secondSelectedEndFace" class="param-hint" style="margin-top: 8px;">
            <span class="hint-label">第二个端面：</span>
            <span class="hint-value">{{ secondSelectedEndFace.pipeName }} - {{ secondSelectedEndFace.endFaceType === 'front' ? '前端面' : '后端面' }}</span>
          </div>
        </div>
        <div class="param-item" v-if="isJoinMode && firstSelectedEndFace && secondSelectedEndFace">
          <label class="param-label">移动管道</label>
          <div class="radio-group">
            <label class="radio-label">
              <input 
                type="radio" 
                v-model="moveFirstPipe"
                :value="true"
                :disabled="isJoinPositioned"
              />
              <span>移动第一个管道</span>
            </label>
            <label class="radio-label">
              <input 
                type="radio" 
                v-model="moveFirstPipe"
                :value="false"
                :disabled="isJoinPositioned"
              />
              <span>移动第二个管道</span>
            </label>
          </div>
        </div>
        <div class="param-item" v-if="isJoinMode && firstSelectedEndFace && secondSelectedEndFace && isJoinPositioned">
          <label class="param-label">旋转角度 (°)</label>
          <input 
            type="number" 
            v-model.number="joinRotationAngle"
            class="param-input"
            placeholder="0"
            step="1"
            @input="previewJoinRotation"
            :disabled="!isJoinPositioned"
          />
          <div class="param-hint">
            <span class="hint-text">绕端面中心点旋转（旋转轴为端面法向量）</span>
          </div>
        </div>
        <div class="param-actions" v-if="isJoinMode && firstSelectedEndFace && secondSelectedEndFace">
          <button 
            class="param-btn param-btn-primary"
            @click="executeJoin"
          >
            {{ isJoinPositioned ? '应用拼接' : '确定拼接' }}
          </button>
          <button 
            class="param-btn param-btn-secondary"
            @click="resetJoinSelection"
          >
            取消/重置
          </button>
        </div>
      </div>
    </div>
    <!-- 导出选项对话框 -->
    <div v-if="showExportDialog" class="dialog-overlay" @click="closeExportDialog">
      <div class="dialog-content" @click.stop>
        <div class="dialog-header">
          <h3>导出模型</h3>
          <button class="dialog-close-btn" @click="closeExportDialog">×</button>
        </div>
        <div class="dialog-body">
          <div class="param-item">
            <label class="param-label">导出格式</label>
            <div class="radio-group">
              <label class="radio-label">
                <input type="radio" v-model="exportFormat" value="obj">
                <span>OBJ</span>
              </label>
              <label class="radio-label">
                <input type="radio" v-model="exportFormat" value="fbx">
                <span>FBX</span>
              </label>
            </div>
          </div>
          <div class="param-item">
            <label class="param-label">曲面细分级别</label>
            <input 
              type="number" 
              v-model.number="exportSubdivision" 
              class="param-input"
              min="0"
              max="5"
              step="1"
            />
            <div class="param-hint">
              <span class="hint-text">0 为原始精度，数值越大模型越平滑（文件越大）</span>
            </div>
          </div>
          <div class="param-actions">
            <button class="param-btn param-btn-primary" @click="confirmExport">确认导出</button>
            <button class="param-btn param-btn-secondary" @click="closeExportDialog">取消</button>
          </div>
        </div>
      </div>
    </div>
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
    
    <!-- 工作空间选择对话框 -->
    <WorkspaceSelector 
      v-model:show="showWorkspaceSelector"
      @workspace-selected="handleWorkspaceSelected"
    />
    <!-- 阵列执行遮罩 -->
    <div v-if="arrayLoading" class="dialog-overlay" style="z-index:9999;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.5);">
      <div style="color:#fff;font-size:16px;text-align:center;">
        <div style="margin-bottom:8px;">{{ arrayLoadingText }}</div>
        <div style="width:200px;height:4px;background:rgba(255,255,255,0.2);border-radius:2px;overflow:hidden;">
          <div style="height:100%;background:#4fc3f7;border-radius:2px;transition:width 0.2s;" :style="{ width: arrayLoadingProgress + '%' }"></div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import ThreeScene from './components/ThreeScene.vue'
import WorkspaceSelector from './components/WorkspaceSelector.vue'
import { useUIState } from './composables/useUIState.js'
import { usePartManager } from './composables/usePartManager.js'
import { useAssemblyManager } from './composables/useAssemblyManager.js'
import { useHistoryManager } from './composables/useHistoryManager.js'
import { useTransformLogic } from './composables/useTransformLogic.js'
import { useJoinLogic } from './composables/useJoinLogic.js'
import { usePersistence } from './composables/app/usePersistence.js'
import { useEventBridge } from './composables/app/useEventBridge.js'
import { useSelectionState } from './composables/app/useSelectionState.js'
import { exportToExcel, importFromExcel } from './utils/excelManager.js'
import {
  getCurrentWorkspaceId,
  getWorkspaces,
  setCurrentWorkspaceId,
  getWorkspaceData
} from './utils/workspaceManager.js'
import { initDB, flushDB } from './utils/sqliteStore.js'
import {
  getPartTypeIcon,
  getHistoryTypeIcon,
  getToolbarIcon,
  getMenuIcon,
  getActionIcon,
  getFolderIcon,
  getFolderArrowIcon,
  getCheckboxIcon,
  icons
} from './config/icons.js'

// --- State Initialization ---
const historyItems = ref([]) // Shared history ref

// 导出相关状态
const showExportDialog = ref(false)
const exportFormat = ref('obj')
const exportSubdivision = ref(0)

// 阵列文件夹展开状态
const arrayGroupExpanded = ref(new Map())

// 阵列执行遮罩
const arrayLoading = ref(false)
const arrayLoadingText = ref('正在执行阵列...')
const arrayLoadingProgress = ref(0)

// LOD 自动/手动切换
const showSettings = ref(false)
const lodAutoMode = ref(true)
const lodManualSegments = ref(8)
const applyManualLod = () => {
  const v = Math.max(3, Math.min(16, lodManualSegments.value))
  lodManualSegments.value = v
  window.dispatchEvent(new CustomEvent('lod-mode-change', { detail: { auto: false, segments: v } }))
}
watch(lodAutoMode, (val) => {
  if (val) {
    window.dispatchEvent(new CustomEvent('lod-mode-change', { detail: { auto: true } }))
  } else {
    applyManualLod()
  }
})

// 移动模式（默认为浏览模式，isMoveMode=false）
const isMoveMode = ref(false)

// 装配项多选状态 (will be initialized after topLevelAssemblyItems is defined)
let selectedAssemblyItems = ref(new Set())

// 菜单宽度（可调整）
const getInitialMenuWidth = () => {
  const saved = localStorage.getItem('menuWidth')
  return saved ? parseInt(saved, 10) : 250
}
const menuWidth = ref(getInitialMenuWidth())

// 菜单顺序（可拖拽调整）
const getInitialMenuOrder = () => {
  const saved = localStorage.getItem('menuOrder')
  return saved ? JSON.parse(saved) : ['assembly', 'parts', 'history']
}
const menuOrder = ref(getInitialMenuOrder())
const draggedMenuIndex = ref(null)
const dragOverIndex = ref(null)

// 菜单宽度调整相关
let isResizing = false
let resizeStartX = 0
let resizeStartWidth = 0

const startResize = (e) => {
  isResizing = true
  resizeStartX = e.clientX
  resizeStartWidth = menuWidth.value
  document.addEventListener('mousemove', handleResize)
  document.addEventListener('mouseup', stopResize)
  e.preventDefault()
}

const handleResize = (e) => {
  if (!isResizing) return
  const deltaX = e.clientX - resizeStartX
  const newWidth = Math.max(200, Math.min(600, resizeStartWidth + deltaX))
  menuWidth.value = newWidth
  localStorage.setItem('menuWidth', newWidth.toString())
  // 通知ThreeScene更新布局
  window.dispatchEvent(new CustomEvent('menu-width-changed', { detail: { width: newWidth } }))
}

const stopResize = () => {
  isResizing = false
  document.removeEventListener('mousemove', handleResize)
  document.removeEventListener('mouseup', stopResize)
}

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
  updateEditingMoveDetails, updateEditingRotationDetails, updateEditingRotationFromDegrees, undoLastAction: undoLastActionOriginal
} = historyMgr

// 包装撤回方法，在撤回后调用浏览方法
const undoLastAction = () => {
  undoLastActionOriginal()
  // 撤回后调用浏览方法，刷新视图
  if (assemblyItems.value && assemblyItems.value.length > 0) {
    viewAssembly()
    // 同步高亮状态
    notifySelectionChanged()
  }
}

// 5. Transform Logic
const transformLogic = useTransformLogic(assemblyItems, historyItems)
const {
  isRotationMode, isArrayMode, 
  rotationAxis, rotationAngle, selectedAssemblyItemId,
  arrayDirection, arraySign, arraySpacing, arrayCount,
  transformType, transformingItemId, transformPosition, transformRotation, transformRotationDeg, transformAxis, movePlane,
  setMode, updateRotationAxis, previewRotationAngle, applyRotationAngle, resetArraySelection, executeArray, 
  setMovePlane, updateTransformPosition, updateTransformRotationFromDegrees
} = transformLogic

// 6. Join Logic
const joinLogic = useJoinLogic(assemblyItems, historyItems)
const {
  isJoinMode, firstSelectedEndFace, secondSelectedEndFace, moveFirstPipe, joinRotationAngle, isJoinPositioned,
  resetJoinSelection, executeJoin
} = joinLogic

// Unified Mode Switching Logic
const switchMode = (mode) => {
    // Reset all modes locally
    isRotationMode.value = false
    isArrayMode.value = false
    isJoinMode.value = false
    isMoveMode.value = false

    // 切换模式时保留已选中的管道，不清空选择
    selectedAssemblyItemId.value = null
    resetJoinSelection()

    // Set specific mode
    if (mode === 'move') {
        isMoveMode.value = true
    } else if (mode === 'rotate') {
        isRotationMode.value = true
    } else if (mode === 'array') {
        isArrayMode.value = true
    } else if (mode === 'join') {
        isJoinMode.value = true
    }
    // mode === 'browse' 时所有都是 false，即浏览模式
}

// Watchers to dispatch events to ThreeScene
watch(isMoveMode, (val) => {
    window.dispatchEvent(new CustomEvent('move-mode-toggle', { detail: { enabled: val } }))
})
watch(isRotationMode, (val) => {
    window.dispatchEvent(new CustomEvent('rotation-mode-toggle', { detail: { enabled: val } }))
})
watch(isArrayMode, (val) => {
    window.dispatchEvent(new CustomEvent('array-mode-toggle', { detail: { enabled: val } }))
})
watch(isJoinMode, (val) => {
    window.dispatchEvent(new CustomEvent('join-mode-toggle', { detail: { enabled: val } }))
})
// 当装配体视图更新时，同步高亮状态
watch(isViewingAssembly, (val) => {
  if (val) {
    // 延迟一下，确保3D场景已经更新
    setTimeout(() => {
      notifySelectionChanged()
    }, 100)
  }
})

// (Event handlers extracted to useEventBridge composable above)

// --- Workspace Management ---
const showWorkspaceSelector = ref(false)
const currentWorkspaceName = ref('')

const updateCurrentWorkspaceName = () => {
  const workspaceId = getCurrentWorkspaceId()
  if (workspaceId) {
    const workspaces = getWorkspaces()
    const workspace = workspaces.find(ws => ws.id === workspaceId)
    currentWorkspaceName.value = workspace ? workspace.name : ''
  } else {
    currentWorkspaceName.value = ''
  }
}

const handleWorkspaceSelected = (workspaceId) => {
  // 切换工作空间时，先保存当前工作空间的数据（如果有的话）
  const previousWorkspaceId = getCurrentWorkspaceId()
  if (previousWorkspaceId && previousWorkspaceId !== workspaceId) {
    flushPersist()
  }
  
  // 设置新工作空间（必须在加载数据之前设置）
  setCurrentWorkspaceId(workspaceId)
  
  // 加载新工作空间的数据（直接传入workspaceId，确保获取到正确的数据）
  hydrateRecordsFromStorage(workspaceId)
  
  // 更新工作空间名称显示
  updateCurrentWorkspaceName()
  
  // 清除所有UI状态，确保不同工作空间的状态不会互相影响
  selectedAssemblyItems.value.clear()
  isViewingAssembly.value = false
  arrayGroupExpanded.value.clear()
  
  // 关闭所有可能打开的编辑面板
  if (showPipeParams.value) closePipeParams()
  if (showHistoryEdit.value) closeHistoryEdit()
  
  // 使用 nextTick 确保数据已经更新到响应式系统
  nextTick(() => {
    // 通知 ThreeScene 重新加载场景（清空当前场景并重新渲染）
    window.dispatchEvent(new CustomEvent('workspace-changed', {
      detail: {
        partsItems: partsItems.value,
        assemblyItems: assemblyItems.value
      }
    }))
    
    // 如果有装配体数据，自动切换到装配体视图
    if (assemblyItems.value && assemblyItems.value.length > 0) {
      viewAssembly()
    }
  })
}

// --- Records Persistence (extracted to composable) ---
const persistence = usePersistence(partsItems, assemblyItems, historyItems)
const { hydrateRecordsFromStorage, flushPersist, saveToast } = persistence

// 初始化时自动加载工作空间
const initializeWorkspace = () => {
  const workspaces = getWorkspaces()
  const currentId = getCurrentWorkspaceId()
  if (workspaces.length > 0) {
    if (currentId && workspaces.some(ws => ws.id === currentId)) {
      hydrateRecordsFromStorage(currentId)
      updateCurrentWorkspaceName()
    } else {
      const firstWorkspace = workspaces[0]
      handleWorkspaceSelected(firstWorkspace.id)
    }
  } else {
    showWorkspaceSelector.value = true
  }
}

// --- Event Bridge (extracted to composable) ---
const eventBridge = useEventBridge(assemblyItems, historyItems, {
  transformType, transformingItemId, transformPosition, transformRotation, transformRotationDeg,
  showTransformPanel, closePipeParams, closeHistoryEdit, showPipeParams, showHistoryEdit
}, joinLogic, {
  selectedAssemblyItemId, updateRotationAxis, currentPartType, pipeParams
})
const { rendererType, previewJoinRotation,
  handleDragEnded, handleBatchDragEnded, handleRotationEnded, handleJoinCompleted,
  handleShowTransformPanel, handleAssemblyItemSelected, handleAssemblyItemPositionUpdated,
  handleAssemblyItemRotationUpdated, handleEndFaceSelected,
  handleSketch2DPathDataSync, handleSketch3DPathDataSync, handleRendererSwitched
} = eventBridge

// 处理切换装配项选择事件（用于阵列模式）
const handleToggleAssemblyItemSelection = (event) => {
  const { id } = event.detail
  toggleAssemblyItemSelection(id)
}

// 计算阵列选择（从菜单选中状态获取）
const arraySelection = computed(() => {
  if (!isArrayMode.value) return []
  return Array.from(selectedAssemblyItems.value)
})

const executeArrayWithLoading = async () => {
  const sel = arraySelection.value
  if (sel.length === 0) return
  arrayLoading.value = true
  arrayLoadingText.value = '正在执行阵列...'
  arrayLoadingProgress.value = 0
  await new Promise(r => requestAnimationFrame(r))
  try {
    executeArray(sel, (progress) => {
      arrayLoadingProgress.value = progress
    })
    arrayLoadingProgress.value = 100
    arrayLoadingText.value = '阵列完成'
    await new Promise(r => setTimeout(r, 300))
  } finally {
    arrayLoading.value = false
  }
}

// (Sketch path data sync handlers extracted to useEventBridge)

const dbReady = ref(false)

onMounted(async () => {
  // 初始化 SQLite 数据库
  await initDB()
  dbReady.value = true
  initializeWorkspace()

  // 如果已经有工作空间，更新名称显示
  updateCurrentWorkspaceName()
  window.addEventListener('beforeunload', persistence.handleBeforeUnload)
  window.addEventListener('keydown', persistence.handleKeyboardSave)
  window.addEventListener('storage', persistence.handleStorageChange)
  window.addEventListener('renderer-switched', handleRendererSwitched)
  window.addEventListener('assembly-item-drag-ended', handleDragEnded)
  window.addEventListener('assembly-items-batch-drag-ended', handleBatchDragEnded)
  window.addEventListener('assembly-item-rotation-ended', handleRotationEnded)
  window.addEventListener('join-completed', handleJoinCompleted)
  window.addEventListener('show-transform-panel', handleShowTransformPanel)
  window.addEventListener('assembly-item-selected', handleAssemblyItemSelected)
  window.addEventListener('assembly-item-position-updated', handleAssemblyItemPositionUpdated)
  window.addEventListener('assembly-item-rotation-updated', handleAssemblyItemRotationUpdated)
  window.addEventListener('end-face-selected', handleEndFaceSelected)
  window.addEventListener('toggle-assembly-item-selection', handleToggleAssemblyItemSelection)
  window.addEventListener('sketch2d-pathdata-sync', handleSketch2DPathDataSync)
  window.addEventListener('sketch3d-pathdata-sync', handleSketch3DPathDataSync)
  
  // 初始化时通知ThreeScene菜单宽度
  window.dispatchEvent(new CustomEvent('menu-width-changed', { detail: { width: menuWidth.value } }))
})

onBeforeUnmount(() => {
  window.removeEventListener('beforeunload', persistence.handleBeforeUnload)
  window.removeEventListener('keydown', persistence.handleKeyboardSave)
  window.removeEventListener('storage', persistence.handleStorageChange)
  window.removeEventListener('renderer-switched', handleRendererSwitched)
  window.removeEventListener('assembly-item-drag-ended', handleDragEnded)
  window.removeEventListener('assembly-items-batch-drag-ended', handleBatchDragEnded)
  window.removeEventListener('assembly-item-rotation-ended', handleRotationEnded)
  window.removeEventListener('join-completed', handleJoinCompleted)
  window.removeEventListener('show-transform-panel', handleShowTransformPanel)
  window.removeEventListener('assembly-item-selected', handleAssemblyItemSelected)
  window.removeEventListener('assembly-item-position-updated', handleAssemblyItemPositionUpdated)
  window.removeEventListener('assembly-item-rotation-updated', handleAssemblyItemRotationUpdated)
  window.removeEventListener('end-face-selected', handleEndFaceSelected)
  window.removeEventListener('toggle-assembly-item-selection', handleToggleAssemblyItemSelection)
  window.removeEventListener('sketch2d-pathdata-sync', handleSketch2DPathDataSync)
  window.removeEventListener('sketch3d-pathdata-sync', handleSketch3DPathDataSync)
})

// --- App-Specific Logic (Computed & Methods) ---

// 获取装配历史记录（只显示装配相关操作，不显示 create 和 update）
const assemblyHistoryItems = computed(() => {
  return historyItems.value.filter(item => {
    // 只显示装配相关的操作：assembly, move, rotate, join, array, delete（如果涉及装配体）
    const assemblyTypes = ['assembly', 'move', 'rotate', 'join', 'array']
    return assemblyTypes.includes(item.type) || 
           (item.type === 'delete' && item.deletedAssemblyInstances && item.deletedAssemblyInstances.length > 0)
  })
})

// 获取顶级装配体项（不包括子项）
const topLevelAssemblyItems = computed(() => {
  const items = assemblyItems.value.filter(item => {
    if (!item) return false
    // 如果是文件夹类型，直接显示（确保没有 parentGroupId）
    if (item.type === 'array-group') {
      return !item.parentGroupId
    }
    // 普通项：没有 parentGroupId 的项
    return !item.parentGroupId
  })
  return items
})

// 获取文件夹的子项
const getArrayGroupChildren = (groupId) => {
  if (!groupId) return []
  const children = assemblyItems.value.filter(item => {
    // 确保 item 存在且有 parentGroupId，且匹配 groupId，且不是文件夹本身
    return item && 
           item.parentGroupId === groupId && 
           item.type !== 'array-group' &&
           item.id !== groupId
  })
  // 按创建顺序排序（可以根据 id 中的索引排序）
  return children.sort((a, b) => {
    // 如果 id 中包含 copy_ 数字，按数字排序
    const aMatch = a.id.match(/copy_(\d+)/)
    const bMatch = b.id.match(/copy_(\d+)/)
    if (aMatch && bMatch) {
      return parseInt(aMatch[1]) - parseInt(bMatch[1])
    }
    return 0
  })
}

// 切换文件夹展开/折叠
const toggleArrayGroup = (groupId) => {
  const current = arrayGroupExpanded.value.get(groupId) || false
  arrayGroupExpanded.value.set(groupId, !current)
}

// --- Selection State (extracted to composable) ---
const selectionState = useSelectionState(assemblyItems, topLevelAssemblyItems, getArrayGroupChildren, arrayGroupExpanded)
// Override the earlier placeholder
selectedAssemblyItems = selectionState.selectedAssemblyItems
const { handleAssemblyItemClick, toggleAssemblyItemSelection, selectFolderChildren,
  notifySelectionChanged, toggleSelectAllAssemblyItems, isAllAssemblyItemsSelected,
  getFlatSelectableIds } = selectionState

// 初始化文件夹展开状态（从数据中读取）
watch(assemblyItems, (newItems) => {
  newItems.forEach(item => {
    if (item.type === 'array-group') {
      // 如果数据中有 expanded 属性，使用它；否则默认折叠
      const shouldExpand = item.expanded !== undefined ? item.expanded : false
      if (!arrayGroupExpanded.value.has(item.id)) {
        arrayGroupExpanded.value.set(item.id, shouldExpand)
      }
    }
  })
}, { deep: true, immediate: true })

const createNewPart = () => {
    // Logic from original App.vue
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

// 获取零件图标（使用配置文件）
const getPartIcon = (type) => {
  return getPartTypeIcon(type)
}

// 获取菜单标题
const getMenuTitle = (menuKey) => {
  const titles = {
    'assembly': '总装备体',
    'parts': '零件列表',
    'history': '装配历史'
  }
  return titles[menuKey] || menuKey
}

// 拖拽排序相关函数
let isDraggingMenu = false

const handleDragStart = (index, event) => {
  isDraggingMenu = true
  draggedMenuIndex.value = index
  event.dataTransfer.effectAllowed = 'move'
  event.dataTransfer.setData('text/plain', index.toString())
  // 设置拖拽图像为当前元素
  const target = event.currentTarget
  if (target) {
    event.dataTransfer.setDragImage(target, 0, 0)
  }
  // 阻止点击事件
  event.stopPropagation()
}

const handleDragOver = (index, event) => {
  event.preventDefault()
  event.stopPropagation()
  event.dataTransfer.dropEffect = 'move'
  if (draggedMenuIndex.value !== null && draggedMenuIndex.value !== index) {
    dragOverIndex.value = index
  }
}

const handleDrop = (index, event) => {
  event.preventDefault()
  event.stopPropagation()
  
  if (draggedMenuIndex.value === null || draggedMenuIndex.value === index) {
    dragOverIndex.value = null
    isDraggingMenu = false
    return
  }
  
  // 重新排序
  const newOrder = [...menuOrder.value]
  const draggedItem = newOrder[draggedMenuIndex.value]
  newOrder.splice(draggedMenuIndex.value, 1)
  newOrder.splice(index, 0, draggedItem)
  menuOrder.value = newOrder
  
  // 保存到localStorage
  localStorage.setItem('menuOrder', JSON.stringify(newOrder))
  
  dragOverIndex.value = null
  isDraggingMenu = false
}

const handleDragEnd = (event) => {
  // 延迟重置，确保drop事件先执行
  setTimeout(() => {
    draggedMenuIndex.value = null
    dragOverIndex.value = null
    isDraggingMenu = false
  }, 100)
}

const handleSubmenuClick = (submenuKey, itemKey) => {
  console.log('子菜单项点击:', submenuKey, itemKey)
  
  if (submenuKey === 'parts') {
    const part = partsItems.value.find(item => item.id === itemKey)
    if (part) {
      if (editingPartId.value === part.id && showPipeParams.value) {
        // 关闭参数面板（保留预览）
        closePipeParams()
      } else {
        // We need to coordinate closing other panels
        expandedSubmenus.value.assembly = false
        expandedSubmenus.value.history = false
        // expandedSubmenus.value.parts = true // Already open
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
    const historyItem = assemblyHistoryItems.value.find(item => item.id === itemKey)
    if (historyItem && (historyItem.type === 'move' || historyItem.type === 'rotate')) {
      openHistoryEdit(historyItem)
    }
  } else if (submenuKey === 'assembly') {
       const item = assemblyItems.value.find(i => i.id === itemKey)
       if (item) {
           if (isRotationMode.value) selectedAssemblyItemId.value = item.id
           if (isArrayMode.value) {
               // 使用菜单中的选中状态
               toggleAssemblyItemSelection(item.id)
           }
           if (!isRotationMode.value && !isArrayMode.value && !isJoinMode.value) {
               transformingItemId.value = item.id
           }
       }
  }
}

// Computed for Title and Instructions (Re-implemented)
const currentModeTitle = computed(() => {
  if (isViewingAssembly.value) {
    if (isJoinMode.value) return '拼接模式'
    else if (isRotationMode.value) return '旋转模式'
    else if (isArrayMode.value) return '阵列模式'
    else if (isMoveMode.value) return '移动模式'
    else return '浏览模式'
  } else if (showPipeParams.value) {
    if (currentPartType.value === 'sketch2d') return '2D草图建管模式'
    else if (currentPartType.value === 'straight') return '直管编辑模式'
    else if (currentPartType.value === 'bend') return '弯管编辑模式'
    else if (currentPartType.value === 'reducer') return '变径管编辑模式'
    else return '零件编辑模式'
  } else {
    return 'Vue 3 + Three.js 项目'
  }
})

const currentInstructions = computed(() => {
  if (isViewingAssembly.value && isJoinMode.value) {
    return [
      { key: '🖱️ 左键拖动', desc: '旋转视角' },
      { key: '🖱️ 右键拖动', desc: '平移视角' },
      { key: '🖱️ 滚轮', desc: '缩放视角' },
      { key: '🖱️ 点击端面', desc: '选择第一个端面（绿色）' },
      { key: '🖱️ 点击端面', desc: '选择第二个端面（蓝色）' },
      { key: '⚙️ 调整参数', desc: '设置旋转角度后确认拼接' }
    ]
  }
  
  // 装配体浏览模式 - 旋转模式
  if (isViewingAssembly.value && isRotationMode.value) {
    return [
      { key: '🖱️ 左键拖动', desc: '旋转视角' },
      { key: '🖱️ 右键拖动', desc: '平移视角' },
      { key: '🖱️ 滚轮', desc: '缩放视角' },
      { key: '🖱️ 点击管道', desc: '选择要旋转的管道' },
      { key: '🖱️ 拖动管道', desc: '沿选定轴旋转管道' },
      { key: '⌨️ 输入角度', desc: '在参数面板输入精确角度' }
    ]
  }
  
  // 装配体浏览模式 - 阵列模式
  if (isViewingAssembly.value && isArrayMode.value) {
    return [
      { key: '🖱️ 左键点击', desc: '选择/取消选择管道加入阵列' },
      { key: '🖱️ 右键拖动', desc: '平移视角' },
      { key: '🖱️ 滚轮', desc: '缩放视角' },
      { key: '🧭 方向', desc: '选择 X / Y / Z 轴及正反向' },
      { key: '📏 间距', desc: '输入阵列间距（mm）' },
      { key: '🔢 数量', desc: '输入要新增的副本数量' }
    ]
  }

  // 装配体浏览模式
  if (isViewingAssembly.value && !isMoveMode.value && !isRotationMode.value && !isJoinMode.value && !isArrayMode.value) {
    return [
      { key: '🖱️ 左键拖动', desc: '旋转视角' },
      { key: '🖱️ 右键拖动', desc: '平移视角' },
      { key: '🖱️ 滚轮', desc: '缩放视角' }
    ]
  }

  // 装配体移动模式
  if (isViewingAssembly.value && isMoveMode.value) {
    return [
      { key: '🖱️ 左键拖动', desc: '旋转视角' },
      { key: '🖱️ 右键拖动', desc: '平移视角' },
      { key: '🖱️ 滚轮', desc: '缩放视角' },
      { key: '🖱️ 点击管道', desc: '选择要移动的管道' },
      { key: '🖱️ 拖动管道', desc: '在相机视角平面移动管道' }
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

// 处理导出
const openExportDialog = () => {
  showExportDialog.value = true
}

const closeExportDialog = () => {
  showExportDialog.value = false
}

const confirmExport = () => {
  window.dispatchEvent(new CustomEvent('export-assembly', { 
    detail: { 
      format: exportFormat.value,
      subdivision: exportSubdivision.value
    } 
  }))
  closeExportDialog()
}

// Camera controls
const resetCamera = () => {
    window.dispatchEvent(new CustomEvent('reset-camera'))
}
const switchCamera = () => {
    cameraMode.value = cameraMode.value === 'perspective' ? 'orthographic' : 'perspective'
    window.dispatchEvent(new CustomEvent('switch-camera'))
}

const switchRendererType = () => {
    window.dispatchEvent(new CustomEvent('switch-renderer'))
}

const readShadowsEnabled = () => {
  try {
    return localStorage.getItem('3dbuild.shadowsEnabled') !== '0'
  } catch {
    return true
  }
}
const shadowsEnabled = ref(readShadowsEnabled())
const toggleShadows = () => {
  shadowsEnabled.value = !shadowsEnabled.value
  try {
    localStorage.setItem('3dbuild.shadowsEnabled', shadowsEnabled.value ? '1' : '0')
  } catch { /* noop */ }
  window.dispatchEvent(new CustomEvent('shadows-setting', { detail: { enabled: shadowsEnabled.value } }))
}

// 端面显示开关
const readEndCapsVisible = () => {
  try { return localStorage.getItem('3dbuild.endCapsVisible') !== '0' } catch { return true }
}
const endCapsVisible = ref(readEndCapsVisible())
const toggleEndCaps = () => {
  endCapsVisible.value = !endCapsVisible.value
  try { localStorage.setItem('3dbuild.endCapsVisible', endCapsVisible.value ? '1' : '0') } catch {}
  window.dispatchEvent(new CustomEvent('endcaps-setting', { detail: { visible: endCapsVisible.value } }))
}

// 着色方式开关
const readFlatShading = () => {
  try { return localStorage.getItem('3dbuild.flatShading') === '1' } catch { return false }
}
const flatShading = ref(readFlatShading())
const toggleFlatShading = () => {
  flatShading.value = !flatShading.value
  try { localStorage.setItem('3dbuild.flatShading', flatShading.value ? '1' : '0') } catch {}
  window.dispatchEvent(new CustomEvent('flatshading-setting', { detail: { enabled: flatShading.value } }))
}

// Excel 导入导出
const excelInput = ref(null)

const handleExportExcel = () => {
  try {
    exportToExcel(partsItems.value, assemblyItems.value)
  } catch (error) {
    console.error('导出 Excel 失败:', error)
    alert('导出 Excel 失败，请检查控制台')
  }
}

const triggerImportExcel = () => {
  if (excelInput.value) {
    excelInput.value.click()
  }
}

const handleImportExcel = async (event) => {
  const file = event.target.files[0]
  if (!file) return

  if (!confirm('导入 Excel 将会合并当前工作空间的数据，是否继续？')) {
    event.target.value = ''
    return
  }

  try {
    const { partsItems: newParts, assemblyItems: newAssembly } = await importFromExcel(file)
    
    // 合并数据（简单的去重或直接追加）
    // 这里采用追加并使用 Set 去重 ID 的策略，或者用户可能期望覆盖
    // 根据需求提示，通常批量导入可能是为了同步或替换
    // 为了安全，我们先合并零件，再合并装配体
    
    const partsMap = new Map(partsItems.value.map(p => [p.id, p]))
    newParts.forEach(p => partsMap.set(p.id, p))
    partsItems.value = Array.from(partsMap.values())

    const assemblyMap = new Map(assemblyItems.value.map(a => [a.id, a]))
    newAssembly.forEach(a => assemblyMap.set(a.id, a))
    assemblyItems.value = Array.from(assemblyMap.values())

    alert('导入成功！')
    
    // 刷新视图
    flushPersist()
    if (assemblyItems.value.length > 0) {
      viewAssembly()
    }
  } catch (error) {
    console.error('导入 Excel 失败:', error)
    alert('导入失败，请确保文件格式正确')
  } finally {
    event.target.value = ''
  }
}

const clearAllData = () => {
    persistence.clearAllData(isViewingAssembly, showPipeParams)
}
</script>
