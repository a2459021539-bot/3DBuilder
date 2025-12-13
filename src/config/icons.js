/**
 * 图标配置文件
 * 统一管理项目中所有图标的定义
 */

export const icons = {
  // 零件类型图标
  partTypes: {
    straight: '➖',    // 直管
    bend: '➰',         // 弯管
    reducer: '♦️',     // 变径管
    sketch2d: '📝',    // 2D草图建管
    sketch3d: '✏️',    // 3D草图建管
    default: ' '       // 默认零件图标
  },

  // 历史操作类型图标
  historyTypes: {
    move: '➡️',         // 移动
    rotate: '🔄',      // 旋转
    join: '',         // 拼接
    array: '⛓️',       // 阵列
    assembly: '🔩',    // 装配
    delete: '🗑️',      // 删除
    default: '📝'       // 默认历史图标
  },

  // 工具栏图标
  toolbar: {
    move: '✋',         // 移动模式
    rotate: '🔄',      // 旋转模式
    join: '🔗',        // 拼接模式
    array: '📐'        // 阵列模式
  },

  // 菜单图标
  menu: {
    assembly: '📦',    // 总装备体
    parts: '🔩',       // 零件列表
    history: '📜',      // 装配历史
    menu: '☰'          // 菜单按钮
  },

  // 操作按钮图标
  actions: {
    add: '➕',          // 添加
    delete: '🗑️',      // 删除
    edit: '🛠️',        // 编辑/工具
    view: '👀',        // 查看/浏览
    undo: '↩️',        // 撤回
    clear: '🗑️',       // 清除
    line: '➖',        // 直线工具
    arc: '➰',          // 圆弧工具
    close: '×'          // 关闭
  },

  // 文件夹图标
  folder: {
    expanded: '📂',    // 展开的文件夹
    collapsed: '📁',   // 折叠的文件夹
    arrowExpanded: '▼', // 展开箭头
    arrowCollapsed: '▶' // 折叠箭头
  },

  // 复选框图标
  checkbox: {
    checked: '☑',     // 已选中
    unchecked: '☐'    // 未选中
  },

  // 其他UI图标
  ui: {
    sectionExpanded: '▼',   // 展开
    sectionCollapsed: '▶',  // 折叠
    menuCollapse: '◀',      // 菜单折叠
    menuExpand: '▶'         // 菜单展开
  }
}

/**
 * 获取零件类型图标
 * @param {string} type - 零件类型
 * @returns {string} 图标
 */
export function getPartTypeIcon(type) {
  return icons.partTypes[type] || icons.partTypes.default
}

/**
 * 获取历史操作类型图标
 * @param {string} type - 历史操作类型
 * @returns {string} 图标
 */
export function getHistoryTypeIcon(type) {
  return icons.historyTypes[type] || icons.historyTypes.default
}

/**
 * 获取工具栏图标
 * @param {string} mode - 工具栏模式
 * @returns {string} 图标
 */
export function getToolbarIcon(mode) {
  return icons.toolbar[mode] || ''
}

/**
 * 获取菜单图标
 * @param {string} menu - 菜单名称
 * @returns {string} 图标
 */
export function getMenuIcon(menu) {
  return icons.menu[menu] || ''
}

/**
 * 获取操作按钮图标
 * @param {string} action - 操作名称
 * @returns {string} 图标
 */
export function getActionIcon(action) {
  return icons.actions[action] || ''
}

/**
 * 获取文件夹图标
 * @param {boolean} expanded - 是否展开
 * @returns {string} 图标
 */
export function getFolderIcon(expanded) {
  return expanded ? icons.folder.expanded : icons.folder.collapsed
}

/**
 * 获取文件夹箭头图标
 * @param {boolean} expanded - 是否展开
 * @returns {string} 图标
 */
export function getFolderArrowIcon(expanded) {
  return expanded ? icons.folder.arrowExpanded : icons.folder.arrowCollapsed
}

/**
 * 获取复选框图标
 * @param {boolean} checked - 是否选中
 * @returns {string} 图标
 */
export function getCheckboxIcon(checked) {
  return checked ? icons.checkbox.checked : icons.checkbox.unchecked
}
