import * as THREE from 'three'

export const rotationSnapStep = THREE.MathUtils.degToRad(5)

export function getPerfDebugEnabled() {
  if (typeof window === 'undefined') return false
  try {
    if (localStorage.getItem('3dbuild.perfDebug') === '1') return true
    return new URLSearchParams(window.location.search).get('perfDebug') === '1'
  } catch {
    return false
  }
}

export function createSceneContext() {
  return {
    // Core Three.js objects
    scene: null,
    camera: null,
    renderer: null,
    controls: null,
    transformControl: null,

    // Lighting
    mainDirectionalLight: null,
    shadowsGloballyEnabled: true,

    // Camera
    isPerspective: true,

    // Pipe preview
    previewPipe: null,

    // Mode flags
    isAssemblyMode: false,
    isRotationMode: false,
    rotationAxis: 'z',
    isJoinMode: false,
    isMoveMode: false,
    isArrayMode: false,

    // Join / end-face selection
    firstSelectedEndFace: null,
    secondSelectedEndFace: null,
    highlightedEndFaces: new Map(),

    // Selection
    selectedPipeGroup: null,
    rotationStartSnapshot: null,
    currentMenuWidth: 250,
    selectionHighlightMap: new Map(),
    selectedAssemblyItemIds: new Set(),
    joinPreviewOriginalState: null,

    // Animation / perf
    stats: null,
    _shadowUpdateRequested: false,
    _statsInfoTimer: 0,

    // LOD state
    _refineRAF: null,
    _lodRefineCursor: 0,
    _fpsFrames: 0,
    _fpsLastTime: performance.now(),
    _fpsValue: 60,
    _lodAutoMode: false,

    // Perf debug
    _perfDebugEnabled: false,
    _perfDebugFrame: 0,
    _perfLogEvery: 90,

    // Drag state
    isDragging: false,
    draggedObject: null,
    draggedAssemblyItemId: null,
    draggedAssemblyItemIds: [],
    draggedObjects: [],
    dragStartPositions: [],
    dragPlane: null,
    dragStartPoint: null,
    dragOffset: null,
    saveHistoryTimer: null,
    hasMoved: false,
    movePlane: 'free',
    dragStartPosition: null,

    // Rotation drag state
    isRotating: false,
    rotatedObject: null,
    rotatedAssemblyItemId: null,
    rotationStartAngle: 0,
    rotationStartMouseY: 0,
    rotationSaveHistoryTimer: null,
    hasRotated: false,
  }
}
