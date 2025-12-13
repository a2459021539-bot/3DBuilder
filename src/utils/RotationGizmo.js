import * as THREE from 'three'

/**
 * 旋转操作手柄（Gizmo）
 * 用于在3D场景中可视化旋转操作
 */
export class RotationGizmo extends THREE.Group {
  constructor(camera) {
    super()
    this.camera = camera
    this.attachedObject = null
    this.snapStep = THREE.MathUtils.degToRad(5) // 默认5度吸附
    this.onChange = null // 旋转变化回调
    this.onEnd = null // 旋转结束回调
    
    // 创建旋转手柄的可视化元素
    this.createGizmoVisuals()
  }
  
  /**
   * 创建手柄的可视化元素
   */
  createGizmoVisuals() {
    // X轴旋转环（红色）
    const xRing = this.createRotationRing('x', 0xff0000)
    this.add(xRing)
    
    // Y轴旋转环（绿色）
    const yRing = this.createRotationRing('y', 0x00ff00)
    this.add(yRing)
    
    // Z轴旋转环（蓝色）
    const zRing = this.createRotationRing('z', 0x0000ff)
    this.add(zRing)
  }
  
  /**
   * 创建旋转环
   */
  createRotationRing(axis, color) {
    const radius = 2
    const segments = 64
    const geometry = new THREE.TorusGeometry(radius, 0.05, 8, segments)
    const material = new THREE.MeshBasicMaterial({ 
      color: color,
      transparent: true,
      opacity: 0.6
    })
    const ring = new THREE.Mesh(geometry, material)
    
    // 根据轴设置旋转
    if (axis === 'x') {
      ring.rotation.z = Math.PI / 2
    } else if (axis === 'y') {
      ring.rotation.x = Math.PI / 2
    }
    // z轴不需要旋转
    
    ring.userData.axis = axis
    ring.userData.isGizmoRing = true
    
    return ring
  }
  
  /**
   * 将手柄附着到指定对象
   */
  attach(object) {
    if (!object) return
    
    this.attachedObject = object
    
    // 更新手柄位置到对象位置
    if (object.position) {
      this.position.copy(object.position)
    }
    
    // 更新手柄旋转到对象旋转
    if (object.rotation) {
      this.rotation.copy(object.rotation)
    }
  }
  
  /**
   * 分离手柄
   */
  detach() {
    this.attachedObject = null
  }
  
  /**
   * 更新手柄（每帧调用）
   */
  update(camera) {
    if (!camera) return
    
    this.camera = camera
    
    // 如果附着到对象，同步位置和旋转
    if (this.attachedObject) {
      if (this.attachedObject.position) {
        this.position.copy(this.attachedObject.position)
      }
      if (this.attachedObject.rotation) {
        this.rotation.copy(this.attachedObject.rotation)
      }
    }
    
    // 根据相机距离调整手柄大小，使其在屏幕上保持恒定大小
    if (camera && this.attachedObject) {
      const distance = camera.position.distanceTo(this.position)
      const scale = Math.max(0.5, Math.min(2, distance * 0.1))
      this.scale.set(scale, scale, scale)
    }
  }
}
