# 图标配置说明

## 概述

`icons.js` 文件统一管理项目中所有图标的定义，便于集中修改和维护。

## 使用方法

### 导入图标配置

```javascript
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
```

### 使用图标函数

#### 获取零件类型图标
```javascript
const icon = getPartTypeIcon('straight') // 返回 '📏'
```

#### 获取历史操作类型图标
```javascript
const icon = getHistoryTypeIcon('move') // 返回 '✋'
```

#### 获取工具栏图标
```javascript
const icon = getToolbarIcon('move') // 返回 '✋'
```

#### 获取菜单图标
```javascript
const icon = getMenuIcon('assembly') // 返回 '📦'
```

#### 获取操作按钮图标
```javascript
const icon = getActionIcon('delete') // 返回 '🗑️'
```

#### 获取文件夹图标
```javascript
const icon = getFolderIcon(true) // 返回 '📂' (展开)
const icon = getFolderIcon(false) // 返回 '📁' (折叠)
```

#### 获取复选框图标
```javascript
const icon = getCheckboxIcon(true) // 返回 '☑' (已选中)
const icon = getCheckboxIcon(false) // 返回 '☐' (未选中)
```

### 直接访问图标对象

如果需要直接访问图标对象：

```javascript
import { icons } from './config/icons.js'

// 访问零件类型图标
const straightIcon = icons.partTypes.straight // '📏'

// 访问历史操作类型图标
const moveIcon = icons.historyTypes.move // '✋'
```

## 图标分类

### 零件类型图标 (partTypes)
- `straight`: 直管 📏
- `bend`: 弯管 🔄
- `reducer`: 变径管 📐
- `sketch2d`: 2D草图建管 📝
- `sketch3d`: 3D草图建管 ✏️
- `default`: 默认零件图标 🔧

### 历史操作类型图标 (historyTypes)
- `move`: 移动 ✋
- `rotate`: 旋转 🔄
- `join`: 拼接 🔗
- `array`: 阵列 📐
- `assembly`: 装配 📦
- `delete`: 删除 🗑️
- `default`: 默认历史图标 📝

### 工具栏图标 (toolbar)
- `move`: 移动模式 ✋
- `rotate`: 旋转模式 🔄
- `join`: 拼接模式 🔗
- `array`: 阵列模式 📐

### 菜单图标 (menu)
- `assembly`: 总装备体 😊😊
- `parts`: 零件列表 🔩
- `history`: 装配历史 📜
- `menu`: 菜单按钮 ☰

### 操作按钮图标 (actions)
- `add`: 添加 ➕
- `delete`: 删除 🗑️
- `edit`: 编辑/工具 🛠️
- `view`: 查看/浏览 👀
- `undo`: 撤回 ↩️
- `clear`: 清除 🗑️
- `line`: 直线工具 📏
- `arc`: 圆弧工具 🌀
- `close`: 关闭 ×

### 文件夹图标 (folder)
- `expanded`: 展开的文件夹 📂
- `collapsed`: 折叠的文件夹 📁
- `arrowExpanded`: 展开箭头 ▼
- `arrowCollapsed`: 折叠箭头 ▶

### 复选框图标 (checkbox)
- `checked`: 已选中 ☑
- `unchecked`: 未选中 ☐

### 其他UI图标 (ui)
- `sectionExpanded`: 展开 ▼
- `sectionCollapsed`: 折叠 ▶
- `menuCollapse`: 菜单折叠 ◀
- `menuExpand`: 菜单展开 ▶

## 修改图标

要修改项目中的图标，只需编辑 `src/config/icons.js` 文件，修改对应的图标值即可。所有使用该配置文件的地方都会自动更新。

## 添加新图标

1. 在 `icons.js` 的相应分类中添加新图标
2. 如需添加新的分类，在 `icons` 对象中添加新的分类对象
3. 如需添加新的辅助函数，在文件末尾添加相应的导出函数
