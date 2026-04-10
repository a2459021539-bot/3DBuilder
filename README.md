# 3D Build - 3D 管道设计与装配平台

这是一个基于 **Vue 3** 和 **Three.js** 开发的高级 3D 管道设计与装配工具。它运行在浏览器中，提供了一套完整的 CAD 风格的建模、装配和导出功能，专注于工业管道系统的设计。

## 🚀 功能特性

### 1. 核心建模能力
- **参数化建模**：支持创建多种类型的管道零件：
  - **直管 (Straight Pipe)**：自定义长度、内外径。
  - **弯管 (Bend Pipe)**：自定义弯曲半径、角度、内外径。
  - **变径管 (Reducer Pipe)**：支持多截面定义的变径设计。
- **2D 草图生成 3D**：内置 2D 绘图板，支持绘制直线和圆弧路径，实时生成复杂的 3D 管道模型。

### 2. 交互式装配系统
- **智能拼接 (Join Mode)**：通过点击两个管道的端面，自动计算位置和旋转，实现精确对接。
- **自由变换**：
  - **移动**：支持沿 XY/YZ/ZX 平面或自由拖拽移动。
  - **旋转**：支持沿 X/Y/Z 轴旋转，提供精确的角度控制。
  - **批量操作**：支持多选管道进行批量移动。
- **阵列工具**：支持沿指定轴向快速创建管道阵列副本。

### 3. 工作流与管理
- **多工作空间**：支持创建和切换多个独立的工作空间，自动保存项目状态。
- **操作历史**：完整的撤销/重做 (Undo/Redo) 系统，记录移动、旋转、装配等操作。
- **零件库管理**：侧边栏管理所有创建的零件和装配体结构。
- **数据持久化**：自动保存当前进度到本地存储。

### 4. 导出与兼容性
- **格式导出**：支持将装配体导出为标准 3D 格式：
  - **OBJ** (.obj)
  - **FBX** (.fbx)

## ⚡ 性能优化对比

为了支持百万级零件的渲染场景，项目经历了多轮架构层面的重写。下面是关键改造前后的对比：

### 渲染管线

| 维度 | 优化前 | 优化后 |
|---|---|---|
| 场景节点结构 | 每根管道 1 Group + 5 Mesh 子节点（管体、前/后端面、前/后碰撞盒），N 根管道 ≈ **5 N 个节点** | 按 `paramsFingerprint` 分桶，每个桶共享 3 个 `InstancedMesh`（管体 + 前后端面），节点数 ≈ **3 × F**，F 为唯一参数组合数 |
| 渲染 draw call | 与零件数线性相关 | 与唯一几何指纹相关，相同参数的零件合并为一次 instanced draw |
| 高亮实现 | 在合并后的 proxy 几何体上做顶点色 tinting，每次选中触发整段顶点重写 | `InstancedMesh.instanceColor` per-instance HDR 乘色，O(1) 更新；橙色波浪闪烁通过 `updateHighlightAnimation` 单次写矩阵颜色完成 |
| 单实例交互 | 直接拿现成的 Mesh 拖拽 | `popOutItem` / `pushBackItem`：临时把一个实例从 InstancedMesh 弹出为独立 Group 供 TransformControls / 拼接使用，结束后写回矩阵 |
| 视锥裁剪与合批 | 节点过多时遍历开销主导帧时间 | `boundingSphere` 在每次 `setMatrixAt` 后失效重算；FPS < 20 时直管自动降级为 BoxGeometry LOD |
| 增量更新 | 任意改动都触发整体重建 | `updateAssemblyView` 走增量分支：只对新增/移动/删除的零件做 add/update/remove，不重建桶 |

**直接收益**：装配项数量从原本的几百根扩展到目标的 **百万零件** 量级，FPS 不再随实例数线性下降，而是随**唯一参数组合数**变化。

### 持久化与数据库

| 维度 | 优化前 | 优化后 |
|---|---|---|
| 数据结构 | 单条 `workspace_data` 记录里塞一个 JSON blob，包含 parts/assemblyItems/history 全部内容 | 拆分为 `parts` / `assembly_items` / `history` 三张关系表，按列存储位置、旋转、参数指纹等字段 |
| 写入事务 | 每条 INSERT 都是独立事务，`saveWorkspaceData` 触发 N 次 fsync | 整次保存包在一对 `BEGIN TRANSACTION / COMMIT` 中，N 次 INSERT 共一次事务 |
| 自动持久化频率 | 防抖 350 ms（高频拖拽时几乎每秒触发 3 次写入） | 防抖 1500 ms |
| 失败处理 | INSERT 失败 `console.warn` 后默默 return，导入提示成功但数据库为空 | ROLLBACK 后抛错，`importWorkspace` 写完立即读回校验条数，校验失败回滚已创建的工作空间 |
| 阵列父子关系 | 拆表后丢失了 `parentGroupId` / `arrayConfig` 等字段，重启后阵列折叠层级显示"暂无子项" | `params_json` 列封装 `{ __params, __extras }`，自动收集 schema 列以外的全部字段往返 |

**直接收益**：开启大规模装配后的自动保存延迟从**显著卡顿**降到**几乎无感**；导入失败不再静默成功；阵列文件夹的层级跨会话稳定保留。

### 网格 / 标签 / 渲染稳定性

| 问题 | 旧实现 | 修复 |
|---|---|---|
| 地面刻度标签时有时无 | `safeDisposeGridGroup` 无差别 dispose 所有 child geometry —— Three.js Sprite 共享一个全局静态 BufferGeometry，第一次旧 grid 延迟回收（3 秒后）就会把全局 sprite geometry 干掉，之后所有 sprite（含坐标轴 X/Y/Z）全部不显示 | traverse 时 `if (c.isSprite) return` 跳过 sprite 节点，彻底不动其 geometry / material |
| 文字纹理偶发变白 | 标签纹理 LRU 缓存达上限后驱逐时调用 `oldTex.dispose()`，但被驱逐的纹理可能仍被现存 sprite 引用，GPU 端已死 | 移除容量限制和驱逐 dispose（标签字符串集天然有界，最多几十张 256×64 纹理） |
| WebGPU 后端下网格只建一次 | `updateDynamicGrid` 在 WebGPU 路径直接 `return`，永不重建 | 删除 WebGPU 早返回，统一走 step / center 变化重建判定 |
| 动态裁剪面破坏深度精度 | near/far 比值高达 1,000,000，地面网格被剔除 | 钳制到 ~2000 比值内，保证地面始终可见 |

### 几何参数稳定性

| 问题 | 修复 |
|---|---|
| 用户清空 / 输入非法值时 `pipeParams.segments` 变成 NaN / undefined / "", 导致 `LatheGeometry(points, NaN, ...)` 退化、整个模型消失 | `usePartManager` 的 `sanitizePipeParams` 强制清洗所有数值字段；`straightPipe / bendPipe / reducerPipe` 三层兜底，无效 segments 一律回退 16 |
| `savePipe` 把脏值写进 `part.params`，下次 InstancedManager 用它创建模板时几何退化 | `savePipe` 改为走 `sanitizePipeParams` 后再保存 |
| LOD 切到手动模式后场景被清空 | InstancedMesh 重构后 `ctx.previewPipe` 是空标记 Group，旧的 `handleLodModeChange` 从它的 children 拿数据永远是空数组。改为由 `App.vue` 把 `assemblyItems.value` 通过事件 detail 传过去，走 `forceRebuild` 全量重建 |

## 🛠️ 技术栈

- **前端框架**：[Vue 3](https://vuejs.org/) (Composition API)
- **3D 引擎**：[Three.js](https://threejs.org/)
- **构建工具**：[Vite](https://vitejs.dev/)
- **状态管理**：Vue Reactivity System (Refs/Composables)

## 📦 安装与运行

确保你的环境中已安装 [Node.js](https://nodejs.org/) (推荐 v16+)。

1. **克隆项目**
   ```bash
   git clone [repository-url]
   cd 3DBuild
   ```

2. **安装依赖**
   ```bash
   npm install
   ```

3. **启动开发服务器**
   ```bash
   npm run dev
   ```
   访问终端中显示的地址（通常是 `http://localhost:5173`）。

4. **构建生产版本**
   ```bash
   npm run build
   ```

## 📖 使用指南

### 界面概览
- **左侧菜单**：
  - **总装配体**：查看场景中的所有对象层级。
  - **零件列表**：管理已创建的零件库。
  - **装配历史**：查看和撤销操作记录。
- **顶部工具栏**：切换移动、旋转、拼接、阵列等模式。
- **右侧/浮动面板**：根据当前模式显示详细参数（如管道尺寸、变换坐标）。
- **3D 视口**：主要交互区域。

### 快捷操作
- **鼠标左键**：旋转视角 / 选择对象。
- **鼠标右键**：平移视角。
- **鼠标滚轮**：缩放视角。
- **拼接模式下**：依次点击两个管道的端面即可自动拼接。

## 📂 项目结构

```
src/
├── components/          # Vue 组件
│   ├── layout/          # 布局组件 (侧边栏, 菜单等)
│   ├── panels/          # 功能面板 (参数编辑, 变换, 历史等)
│   ├── scene/           # 3D 场景相关组件
│   ├── sketch/          # 2D 草图绘制组件
│   └── ThreeScene.vue   # 核心 3D 场景入口
├── composables/         # 组合式 API (核心逻辑)
│   ├── useAssemblyManager.js  # 装配体管理
│   ├── usePartManager.js      # 零件管理
│   ├── useTransformLogic.js   # 变换逻辑 (移动/旋转)
│   └── useJoinLogic.js        # 拼接逻辑
├── utils/               # 工具类
│   ├── pipeFactory.js   # 3D 管道生成工厂
│   ├── geometry/        # 几何计算
│   └── persistence/     # 本地存储逻辑
├── App.vue              # 应用根组件
└── main.js              # 入口文件
```

## 📄 许可证

MIT License
