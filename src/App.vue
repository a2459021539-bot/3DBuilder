<template>
  <div class="app">
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
          :class="['toolbar-btn', { active: !isRotationMode && !isJoinMode }]"
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
                <div class="folder-header" @click.stop="toggleArrayGroup(item.id)">
                  <span class="folder-icon">{{ getFolderIcon(arrayGroupExpanded.get(item.id)) }}</span>
                  <span class="submenu-item-text">{{ item.name }}</span>
                  <span class="folder-arrow">{{ getFolderArrowIcon(arrayGroupExpanded.get(item.id)) }}</span>
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
                    @click.stop="toggleAssemblyItemSelection(child.id)"
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
                @click="toggleAssemblyItemSelection(item.id)"
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
          <button class="param-btn param-btn-primary" @click="savePipe">{{ editingPartId ? '保存' : '创建' }}</button>
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
        <button @click="switchCamera">{{ cameraMode === 'perspective' ? '透视' : '正交' }}</button>
        <button @click="clearAllData" class="danger-btn">清除所有</button>
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
            @click="executeArray(arraySelection)"
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
import { loadRecords, saveRecords, clearRecords } from './utils/persistence/localRecordsStore.js'
import { 
  getCurrentWorkspaceId, 
  getWorkspaces, 
  shouldShowWorkspaceSelector,
  setCurrentWorkspaceId,
  getWorkspaceData
} from './utils/workspaceManager.js'
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

// 装配项多选状态
const selectedAssemblyItems = ref(new Set())

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
    
    // Clear selections
    selectedAssemblyItemId.value = null
    selectedAssemblyItems.value.clear()
    notifySelectionChanged()
    resetJoinSelection()
    
    // Set specific mode
    if (mode === 'rotate') {
        isRotationMode.value = true
    } else if (mode === 'array') {
        isArrayMode.value = true
    } else if (mode === 'join') {
        isJoinMode.value = true
    }
}

// Watchers to dispatch events to ThreeScene
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

// Handle Show Transform Panel Event (from 3D Scene)
const handleShowTransformPanel = (event) => {
  const { type, id, position, rotation } = event.detail
  
  // Set transform logic state
  transformType.value = type
  transformingItemId.value = id
  
  if (position) {
    transformPosition.value = { ...position }
  }
  
  if (rotation) {
    transformRotation.value = { ...rotation }
    // Convert to degrees if needed
    transformRotationDeg.value = {
        x: rotation.x * 180 / Math.PI,
        y: rotation.y * 180 / Math.PI,
        z: rotation.z * 180 / Math.PI
    }
  }
  
  // Show the panel
  showTransformPanel.value = true
  
  // Close other overlapping panels
  if (showPipeParams.value) closePipeParams()
  if (showHistoryEdit.value) closeHistoryEdit()
}

// Handle Assembly Item Selected (for Rotation Mode)
const handleAssemblyItemSelected = (event) => {
  const { id } = event.detail
  selectedAssemblyItemId.value = id
  updateRotationAxis()
}

// Handle Position Updates (Real-time sync)
const handleAssemblyItemPositionUpdated = (event) => {
  const { id, position, isUserInput } = event.detail
  
  // Sync internal data model
  const item = assemblyItems.value.find(i => i.id === id)
  if (item) {
    item.position = { ...position }
  }
  
  // Sync parameter panel if it's open and editing this item
  if (showTransformPanel.value && transformingItemId.value === id && transformType.value === 'move' && !isUserInput) {
    transformPosition.value = { ...position }
  }
}

// Handle Rotation Updates (Real-time sync)
const handleAssemblyItemRotationUpdated = (event) => {
  const { id, rotation, isUserInput } = event.detail
  
  // Sync internal data model
  const item = assemblyItems.value.find(i => i.id === id)
  if (item) {
    item.rotation = { ...rotation }
  }
  
  // Sync rotation mode UI if selected and update is not from the input itself (avoid loop/cursor jump)
  if (selectedAssemblyItemId.value === id && !isUserInput) {
      updateRotationAxis()
  }
  
  // Sync parameter panel if it's open and editing this item
  if (showTransformPanel.value && transformingItemId.value === id && transformType.value === 'rotate' && !isUserInput) {
    transformRotation.value = { ...rotation }
    transformRotationDeg.value = {
      x: rotation.x * 180 / Math.PI,
      y: rotation.y * 180 / Math.PI,
      z: rotation.z * 180 / Math.PI
    }
  }
}

// Handle End Face Selection (for Join Mode)
const handleEndFaceSelected = (event) => {
  if (!isJoinMode.value) return
  
  const { index, assemblyItemId, endFaceType } = event.detail
  
  // 处理取消选择的情况
  if (assemblyItemId === null || endFaceType === null) {
    if (index === 1) {
      firstSelectedEndFace.value = null
    } else if (index === 2) {
      secondSelectedEndFace.value = null
    }
    // 清除预览
    window.dispatchEvent(new CustomEvent('clear-join-preview'))
    return
  }
  
  // 查找对应的装配体项以获取名称
  const assemblyItem = assemblyItems.value.find(item => item.id === assemblyItemId)
  if (!assemblyItem) return
  
  // 构建端面信息对象
  const endFaceInfo = {
    assemblyItemId: assemblyItemId,
    endFaceType: endFaceType,
    pipeName: assemblyItem.name || `管道 ${assemblyItemId}`
  }
  
  // 根据index更新对应的选择
  if (index === 1) {
    firstSelectedEndFace.value = endFaceInfo
  } else if (index === 2) {
    secondSelectedEndFace.value = endFaceInfo
  }
  
  // 如果两个端面都选好了，但不自动预览（需要先点击确定拼接）
}

// 预览拼接旋转角度（只有在管道已经移动到位置后才能预览）
const previewJoinRotation = () => {
  if (!isJoinMode.value || !firstSelectedEndFace.value || !secondSelectedEndFace.value) return
  if (!isJoinPositioned.value) return // 只有在管道已经移动到位置后才能预览角度
  
  // 发送预览事件到 ThreeScene
  window.dispatchEvent(new CustomEvent('preview-join-angle', {
    detail: {
      firstEndFace: firstSelectedEndFace.value,
      secondEndFace: secondSelectedEndFace.value,
      moveFirst: moveFirstPipe.value,
      rotationAngle: joinRotationAngle.value
    }
  }))
}

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

// --- Records Persistence (localStorage) ---
let suppressPersist = false
let persistTimer = null
const PERSIST_DEBOUNCE_MS = 350

const hydrateRecordsFromStorage = (workspaceId = null) => {
  suppressPersist = true
  
  // 如果提供了工作空间ID，使用它；否则从localStorage获取
  const targetWorkspaceId = workspaceId || getCurrentWorkspaceId()
  if (!targetWorkspaceId) {
    // 如果没有工作空间ID，清空所有数据
    partsItems.value = []
    assemblyItems.value = []
    historyItems.value = []
    suppressPersist = false
    return
  }
  
  // 直接使用工作空间ID获取数据，确保获取到正确的数据
  const persisted = getWorkspaceData(targetWorkspaceId)
  
  // 确保使用新数组，触发响应式更新
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

// 初始化时自动加载工作空间
const initializeWorkspace = () => {
  const workspaces = getWorkspaces()
  const currentId = getCurrentWorkspaceId()
  
  // 如果有工作空间
  if (workspaces.length > 0) {
    // 如果当前工作空间ID存在且有效，直接加载
    if (currentId && workspaces.some(ws => ws.id === currentId)) {
      hydrateRecordsFromStorage(currentId)
      updateCurrentWorkspaceName()
    } else {
      // 否则自动选择第一个工作空间
      const firstWorkspace = workspaces[0]
      handleWorkspaceSelected(firstWorkspace.id)
    }
  } else {
    // 如果没有工作空间，显示选择对话框
    showWorkspaceSelector.value = true
  }
}

initializeWorkspace()

watch([partsItems, assemblyItems, historyItems], () => {
  schedulePersist()
}, { deep: true })

const handleBeforeUnload = () => {
  flushPersist()
}

// --- Event Handlers for 3D Interactions ---

const addOrMergeHistory = (newHistoryItem) => {
  if (historyItems.value.length > 0) {
    const lastItem = historyItems.value[0]
    
    // Check for mergeable 'move' operations
    if (newHistoryItem.type === 'move' && lastItem.type === 'move' && lastItem.targetId === newHistoryItem.targetId) {
      // Merge: Update the end position and time of the last item
      lastItem.endPosition = { ...newHistoryItem.endPosition }
      lastItem.time = newHistoryItem.time
      // Optionally update name if it contains dynamic info, but "移动: [Name]" is usually static per object
      return
    }
    
    // Check for mergeable 'rotate' operations
    if (newHistoryItem.type === 'rotate' && lastItem.type === 'rotate' && lastItem.targetId === newHistoryItem.targetId && lastItem.axis === newHistoryItem.axis) {
      // Merge: Update the end rotation and time
      lastItem.endRotation = { ...newHistoryItem.endRotation }
      lastItem.time = newHistoryItem.time
      return
    }
  }
  
  // If not merged, add as new item
  historyItems.value.unshift(newHistoryItem)
  
  // Limit history size (optional, e.g., keep last 50)
  if (historyItems.value.length > 50) {
    historyItems.value.pop()
  }
}

const handleDragEnded = (event) => {
  const { id, endPosition, startPosition } = event.detail
  const item = assemblyItems.value.find(i => i.id === id)
  if (item) {
    // 记录历史
    const historyItem = {
      id: `hist_${Date.now()}`,
      type: 'move',
      targetId: id,
      name: `移动: ${item.name}`,
      time: new Date().toLocaleTimeString(),
      startPosition: { ...startPosition },
      endPosition: { ...endPosition }
    }
    addOrMergeHistory(historyItem)

    // 更新数据
    item.position = { ...endPosition }
  }
}

// 处理批量移动结束事件
const handleBatchDragEnded = (event) => {
  const { items } = event.detail
  if (!items || items.length === 0) return
  
  // 更新所有移动项的数据
  items.forEach(({ id, endPosition }) => {
    const item = assemblyItems.value.find(i => i.id === id)
    if (item) {
      item.position = { ...endPosition }
    }
  })
  
  // 创建一条批量移动历史记录
  const itemNames = items.map(({ id }) => {
    const item = assemblyItems.value.find(i => i.id === id)
    return item ? item.name : `管道 ${id}`
  }).join('、')
  
  const historyItem = {
    id: `hist_${Date.now()}`,
    type: 'move',
    targetId: items[0].id, // 使用第一个项作为主要目标ID（用于兼容性）
    name: `批量移动: ${itemNames}`,
    time: new Date().toLocaleTimeString(),
    isBatch: true, // 标记为批量操作
    batchItems: items.map(({ id, startPosition, endPosition }) => ({
      id,
      startPosition: { ...startPosition },
      endPosition: { ...endPosition }
    }))
  }
  
  addOrMergeHistory(historyItem)
}

const handleRotationEnded = (event) => {
  const { id, endRotation, startRotation, axis } = event.detail
  const item = assemblyItems.value.find(i => i.id === id)
  if (item) {
    // 记录历史
    const historyItem = {
      id: `hist_${Date.now()}`,
      type: 'rotate',
      targetId: id,
      name: `旋转: ${item.name}`,
      time: new Date().toLocaleTimeString(),
      startRotation: { ...startRotation },
      endRotation: { ...endRotation },
      axis: axis
    }
    addOrMergeHistory(historyItem)

    // 更新数据
    item.rotation = { ...endRotation }
  }
}

const handleJoinCompleted = (event) => {
  const { movedItemId, position, rotation } = event.detail
  const item = assemblyItems.value.find(i => i.id === movedItemId)
  if (item) {
    // 记录历史
    const historyItem = {
      id: `hist_${Date.now()}`,
      type: 'join',
      targetId: movedItemId,
      name: `拼接: ${item.name}`,
      time: new Date().toLocaleTimeString(),
      oldPosition: { ...item.position },
      oldRotation: { ...item.rotation },
      newPosition: { ...position },
      newRotation: { ...rotation }
    }
    // Joining is usually a distinct operation, but if we wanted to merge, we could check type='join'
    // However, joining twice usually implies joining to different things or undoing/redoing.
    // For now, we just add it.
    historyItems.value.unshift(historyItem)

    // 更新数据
    item.position = { ...position }
    item.rotation = { ...rotation }
  }
}

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

// 处理2D草图路径数据同步
const handleSketch2DPathDataSync = (event) => {
  if (currentPartType.value === 'sketch2d' && event.detail) {
    // 同步pathData到pipeParams，确保保存时能获取到最新数据
    pipeParams.value.pathData = JSON.parse(JSON.stringify(event.detail))
  }
}

onMounted(() => {
  // 如果已经有工作空间，更新名称显示
  updateCurrentWorkspaceName()
  window.addEventListener('beforeunload', handleBeforeUnload)
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
  
  // 初始化时通知ThreeScene菜单宽度
  window.dispatchEvent(new CustomEvent('menu-width-changed', { detail: { width: menuWidth.value } }))
})

onBeforeUnmount(() => {
  window.removeEventListener('beforeunload', handleBeforeUnload)
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

// 切换装配项选中状态
const toggleAssemblyItemSelection = (itemId) => {
  if (selectedAssemblyItems.value.has(itemId)) {
    selectedAssemblyItems.value.delete(itemId)
  } else {
    selectedAssemblyItems.value.add(itemId)
  }
  // 通知3D场景更新高亮
  notifySelectionChanged()
}

// 通知3D场景选中状态变化
const notifySelectionChanged = () => {
  const selectedIds = Array.from(selectedAssemblyItems.value)
  window.dispatchEvent(new CustomEvent('assembly-selection-changed', {
    detail: { selectedIds }
  }))
}

// 全选/取消全选装配项
const toggleSelectAllAssemblyItems = () => {
  if (isAllAssemblyItemsSelected.value) {
    // 取消全选：清除所有选中项
    selectedAssemblyItems.value.clear()
  } else {
    // 全选：选中所有顶级项及其子项
    selectedAssemblyItems.value.clear()
    topLevelAssemblyItems.value.forEach(item => {
      if (item.type === 'array-group') {
        // 对于文件夹类型，选中所有子项
        const children = getArrayGroupChildren(item.id)
        children.forEach(child => {
          selectedAssemblyItems.value.add(child.id)
        })
      } else {
        // 对于普通项，直接选中
        selectedAssemblyItems.value.add(item.id)
      }
    })
  }
  // 通知3D场景更新高亮
  notifySelectionChanged()
}

// 计算是否所有装配项都已选中
const isAllAssemblyItemsSelected = computed(() => {
  if (topLevelAssemblyItems.value.length === 0) return false
  
  // 获取所有应该被选中的项（顶级项及其子项）
  const allSelectableItems = new Set()
  topLevelAssemblyItems.value.forEach(item => {
    if (item.type === 'array-group') {
      const children = getArrayGroupChildren(item.id)
      children.forEach(child => {
        allSelectableItems.add(child.id)
      })
    } else {
      allSelectableItems.add(item.id)
    }
  })
  
  // 检查是否所有可选项都已选中
  if (allSelectableItems.size === 0) return false
  return allSelectableItems.size === selectedAssemblyItems.value.size &&
         Array.from(allSelectableItems).every(id => selectedAssemblyItems.value.has(id))
})

// 初始化文件夹展开状态（从数据中读取）
watch(assemblyItems, (newItems) => {
  newItems.forEach(item => {
    if (item.type === 'array-group') {
      // 如果数据中有 expanded 属性，使用它；否则默认展开
      const shouldExpand = item.expanded !== undefined ? item.expanded : true
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
    else return '装配体浏览模式'
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

  // 装配体浏览模式 - 移动模式
  if (isViewingAssembly.value && !isRotationMode.value && !isJoinMode.value) {
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
}
const clearAllData = () => {
    if(confirm('确定要清除所有数据吗？')) {
        suppressPersist = true
        if (persistTimer) {
          window.clearTimeout(persistTimer)
          persistTimer = null
        }
        clearRecords()

        partsItems.value = []
        assemblyItems.value = []
        historyItems.value = []
        // Reset modes
        isViewingAssembly.value = false
        showPipeParams.value = false
        // Clear scene
        window.dispatchEvent(new CustomEvent('clear-pipe-preview'))
        window.dispatchEvent(new CustomEvent('view-assembly', { detail: [] }))

        // 允许后续新操作继续落盘
        window.setTimeout(() => {
          suppressPersist = false
        }, 0)
    }
}
</script>
