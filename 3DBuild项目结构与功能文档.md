# 3D Build - Vue 3 + Three.js 项目详细文档

## 项目概述

3D Build 是一个基于 Vue 3 和 Three.js 构建的纯前端 3D 管道建模应用。该项目提供了完整的管道设计、装配和管理功能，支持多种管道类型的创建、编辑、装配和操作历史管理。

## 技术栈

- **Vue 3** - 渐进式 JavaScript 框架，使用 Composition API
- **Three.js** - 3D 图形库，用于 3D 场景渲染和交互
- **Vite** - 快速的前端构建工具
- **JavaScript ES6+** - 现代 JavaScript 语法

## 项目结构

```
3DBuild/
├── .git/                           # Git 版本控制
├── .gitignore                      # Git 忽略文件配置
├── .idea/                          # IDE 配置文件
├── .kiro/                          # Kiro AI 助手配置
│   └── specs/                      # 规格说明文档
│       ├── bug-fixes/              # Bug 修复规格
│       └── file-refactoring/       # 文件重构规格
├── .vscode/                        # VS Code 配置
├── dist/                           # 构建输出目录
├── node_modules/                   # 依赖包
├── src/                            # 源代码目录
│   ├── components/                 # Vue 组件
│   │   ├── interaction/            # 交互组件（空）
│   │   ├── layout/                 # 布局组件
│   │   ├── panels/                 # 面板组件
│   │   │   ├── AppPanels.vue       # 应用面板
│   │   │   ├── ArrayPanel.vue      # 阵列面板
│   │   │   ├── HistoryEditPanel.vue # 历史编辑面板
│   │   │   ├── JoinPanel.vue       # 拼接面板
│   │   │   ├── PipeParamsPanel.vue # 管道参数面板
│   │   │   ├── RotationPanel.vue   # 旋转面板
│   │   │   └── TransformPanel.vue  # 变换面板
│   │   ├── scene/                  # 3D 场景组件
│   │   │   ├── SceneControls.vue   # 场景控制
│   │   │   ├── SceneGrid.vue       # 场景网格
│   │   │   ├── SceneInteraction.vue # 场景交互
│   │   │   ├── SceneObjects.vue    # 场景对象
│   │   │   └── SceneRenderer.vue   # 场景渲染器
│   │   ├── sketch/                 # 草图组件（空）
│   │   ├── toolbars/               # 工具栏组件
│   │   │   └── AppToolbar.vue      # 应用工具栏
│   │   ├── Sketch2DCanvas.vue      # 2D 草图画布
│   │   ├── ThreeScene.vue          # Three.js 3D 场景主组件
│   │   ├── ThreeScene-refactored.vue # 重构版本
│   │   └── ViewCube.vue            # 视图立方体
│   ├── composables/                # 组合式函数
│   │   ├── core/                   # 核心组合函数（空）
│   │   ├── scene/                  # 场景组合函数（空）
│   │   ├── ui/                     # UI 组合函数（空）
│   │   ├── useAssemblyManager.js   # 装配体管理
│   │   ├── useHistoryManager.js    # 历史记录管理
│   │   ├── useJoinLogic.js         # 拼接逻辑
│   │   ├── usePartManager.js       # 零件管理
│   │   ├── useTransformLogic.js    # 变换逻辑
│   │   └── useUIState.js           # UI 状态管理
│   ├── styles/                     # 样式文件
│   │   └── app.css                 # 应用样式
│   ├── utils/                      # 工具函数
│   │   ├── common/                 # 通用工具（空）
│   │   ├── geometry/               # 几何工具（空）
│   │   ├── interaction/            # 交互工具（空）
│   │   ├── persistence/            # 持久化工具
│   │   │   └── localRecordsStore.js # 本地存储管理
│   │   ├── bendPipe.js             # 弯管创建工具
│   │   ├── pipeCommon.js           # 管道通用工具
│   │   ├── pipeFactory.js          # 管道工厂
│   │   ├── reducerPipe.js          # 变径管创建工具
│   │   ├── RotationGizmo.js        # 旋转手柄
│   │   ├── sketch2dPipe.js         # 2D 草图管道
│   │   └── straightPipe.js         # 直管创建工具
│   ├── App.vue                     # 主应用组件
│   ├── App-refactored.vue          # 重构版本
│   ├── main.js                     # 应用入口
│   └── style.css                   # 全局样式
├── index.html                      # HTML 入口文件
├── package.json                    # 项目配置和依赖
├── package-lock.json               # 依赖锁定文件
├── README.md                       # 项目说明
├── test-fixes.js                   # 测试修复脚本
├── vite.config.js                  # Vite 配置
└── 3DBuild.iml                     # IntelliJ 项目文件
```

## 核心功能模块

### 1. 主应用组件 (App.vue)

主应用组件是整个应用的核心，负责协调各个功能模块：

**主要功能：**
- 集成所有子组件和功能模块
- 管理应用的全局状态
- 处理用户交互事件
- 协调 3D 场景与 UI 界面的数据同步

**核心状态管理：**
- 使用多个 composables 进行状态分离
- 统一的事件系统进行组件间通信
- 本地存储持久化数据

### 2. 3D 场景组件 (ThreeScene.vue)

负责所有 3D 渲染和交互功能：

**主要功能：**
- Three.js 场景初始化和管理
- 相机控制（透视/正交切换）
- 管道对象的 3D 渲染
- 鼠标交互处理（拖拽、旋转、点击）
- 多种操作模式支持

**操作模式：**
- **移动模式**：拖拽管道改变位置
- **旋转模式**：使用旋转手柄调整管道角度
- **拼接模式**：选择端面进行管道连接
- **阵列模式**：批量复制管道

**3D 渲染特性：**
- 自定义网格系统（1mm 精度）
- 坐标轴标签显示
- 阴影映射支持
- 材质和光照系统

### 3. 2D 草图画布 (Sketch2DCanvas.vue)

提供 2D 草图绘制功能：

**绘制工具：**
- **直线工具**：绘制直线段，支持长度输入
- **圆弧工具**：绘制圆弧，支持半径、角度、方向设置
- **网格吸附**：1mm 精度的网格对齐
- **实时预览**：显示绘制过程和参数

**交互功能：**
- 鼠标绘制和参数输入
- 右键拖拽平移画布
- 滚轮缩放
- 键盘快捷键（ESC 取消，Ctrl+Z 撤销）

### 4. 组合式函数 (Composables)

采用 Vue 3 Composition API 进行功能模块化：

#### useUIState.js - UI 状态管理
- 相机模式切换
- 菜单折叠状态
- 对话框显示控制
- 子菜单展开状态

#### usePartManager.js - 零件管理
- 零件创建、编辑、删除
- 参数验证和更新
- 支持多种管道类型
- 实时预览更新

#### useAssemblyManager.js - 装配体管理
- 零件添加到装配体
- 装配体浏览模式
- 装配体数据管理

#### useHistoryManager.js - 历史记录管理
- 操作历史记录
- 撤销功能
- 历史记录编辑
- 操作详情显示

#### useTransformLogic.js - 变换逻辑
- 旋转操作管理
- 阵列操作处理
- 移动约束控制
- 变换参数面板

#### useJoinLogic.js - 拼接逻辑
- 端面选择管理
- 拼接参数设置
- 拼接操作执行

### 5. 管道创建工具 (Utils)

#### pipeFactory.js - 管道工厂
统一的管道对象创建入口，支持多种管道类型。

#### straightPipe.js - 直管创建
- 使用 LatheGeometry 创建圆柱体
- 端面几何体生成
- 碰撞检测区域设置

#### bendPipe.js - 弯管创建
- 自定义 ArcCurve 曲线类
- ExtrudeGeometry 沿路径拉伸
- 复杂端面计算和定位

#### reducerPipe.js - 变径管创建
- 多截面轮廓生成
- LatheGeometry 旋转成型
- 渐变直径处理

#### sketch2dPipe.js - 2D 草图管道
- Path2DCurve 复合路径类
- 直线和圆弧组合
- 沿复杂路径拉伸

#### pipeCommon.js - 通用工具
- 材质创建函数
- 端面几何体生成
- 碰撞检测辅助
- 用户数据设置

### 6. 本地存储 (localRecordsStore.js)

**功能特性：**
- 零件数据持久化
- 装配体状态保存
- 操作历史记录
- 数据验证和容错
- 存储容量管理

## 数据流架构

### 1. 状态管理流程

```
用户操作 → UI组件 → Composables → 数据更新 → 3D场景同步 → 本地存储
```

### 2. 事件通信系统

应用使用 window 事件进行组件间通信：

**主要事件：**
- `update-pipe-preview` - 更新管道预览
- `view-assembly` - 查看装配体
- `assembly-item-drag-ended` - 拖拽结束
- `assembly-item-rotation-ended` - 旋转结束
- `join-completed` - 拼接完成
- `sketch2d-path-updated` - 2D 路径更新

### 3. 数据持久化

**存储内容：**
- 零件列表 (partsItems)
- 装配体实例 (assemblyItems)
- 操作历史 (historyItems)

**存储策略：**
- 防抖写入（350ms 延迟）
- 页面卸载时强制保存
- 历史记录数量限制（500条）
- JSON 序列化存储

## 用户界面设计

### 1. 布局结构

- **左侧菜单**：零件管理、装配体、操作历史
- **顶部工具栏**：操作模式切换（移动、旋转、拼接、阵列）
- **右侧参数面板**：根据当前操作显示相应参数
- **中央 3D 视图**：主要的 3D 场景显示区域
- **右下角控制面板**：相机控制、模式说明

### 2. 交互设计

**鼠标操作：**
- 左键：旋转视角 / 选择对象
- 右键：平移视角
- 滚轮：缩放视角
- 拖拽：移动管道（移动模式）

**键盘快捷键：**
- ESC：取消当前操作
- Ctrl+Z：撤销操作（2D 草图）

### 3. 视觉设计

**配色方案：**
- 主背景：深色主题 (#1a1a1a)
- 管道颜色：蓝色 (#4a9eff)
- 端面颜色：橙色 (#ffaa00)
- UI 元素：半透明黑色背景 + 白色文字

**材质效果：**
- 金属质感材质
- 阴影映射
- 环境光 + 方向光照明

## 核心算法

### 1. 管道几何生成

**直管算法：**
- 使用 LatheGeometry 绕 Y 轴旋转生成
- 轮廓点定义：内圆 → 外圆 → 外圆 → 内圆
- 端面使用圆环几何体

**弯管算法：**
- 自定义 ArcCurve 类定义弯曲路径
- ExtrudeGeometry 沿路径拉伸圆环截面
- 端面位置和法向量通过三角函数计算

**变径管算法：**
- 多截面轮廓点生成
- LatheGeometry 旋转成型
- 支持任意数量的直径变化截面

### 2. 拼接算法

**端面对齐：**
1. 计算两个端面的世界坐标位置和法向量
2. 移动管道使端面中心重合
3. 旋转管道使法向量对齐（反向）
4. 应用额外的旋转角度（可选）

**数学原理：**
- 使用四元数进行旋转计算
- 向量运算进行位置对齐
- 矩阵变换应用到 3D 对象

### 3. 2D 草图算法

**路径生成：**
- 直线段：线性插值
- 圆弧段：三角函数计算
- 复合路径：分段计算 + 长度权重

**3D 拉伸：**
- Path2DCurve 类实现 Three.js Curve 接口
- ExtrudeGeometry 沿路径拉伸
- 端面计算基于路径切线

## 性能优化

### 1. 渲染优化

- 几何体复用和缓存
- 材质共享减少 Draw Call
- 阴影贴图尺寸优化
- 相机视锥体裁剪

### 2. 内存管理

- 几何体和材质的 dispose() 调用
- 事件监听器的正确清理
- 定时器的清理和重置

### 3. 交互优化

- 防抖处理减少频繁更新
- 射线检测优化
- 碰撞检测区域优化

## 扩展性设计

### 1. 插件化架构

- 管道类型通过工厂模式扩展
- 操作模式通过组合式函数扩展
- UI 面板组件化设计

### 2. 配置化支持

- 材质参数可配置
- 网格精度可调整
- 操作模式可定制

### 3. 数据格式

- JSON 格式便于扩展
- 版本化存储支持迁移
- 标准化的数据结构

## 开发和部署

### 1. 开发环境

```bash
# 安装依赖
npm install

# 启动开发服务器
npm run dev

# 构建生产版本
npm run build

# 预览构建结果
npm run preview
```

### 2. 项目配置

**Vite 配置：**
- Vue 插件支持
- 开发服务器端口：3000
- 自动打开浏览器

**依赖管理：**
- Vue 3.4.21
- Three.js 0.161.0
- Vite 5.1.4

### 3. 代码规范

- ES6+ 语法
- Vue 3 Composition API
- 模块化组织
- 事件驱动架构

## 总结

3D Build 项目是一个功能完整的 3D 管道建模应用，具有以下特点：

**技术特色：**
- 现代化的 Vue 3 + Three.js 技术栈
- 组合式函数的模块化架构
- 事件驱动的组件通信
- 完整的 3D 交互系统

**功能特色：**
- 多种管道类型支持
- 直观的 3D 操作界面
- 完整的操作历史管理
- 2D 草图到 3D 模型的转换

**设计特色：**
- 响应式设计适配不同屏幕
- 深色主题的专业界面
- 直观的交互反馈
- 完善的错误处理

该项目展示了现代前端技术在 3D 建模领域的应用，为类似的工程设计软件提供了很好的参考实现。