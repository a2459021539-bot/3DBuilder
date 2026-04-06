import * as THREE from 'three'
import { createPipeMaterial } from './pipeCommon.js'
import { createStraightPipe } from './straightPipe.js'
import { createBendPipe } from './bendPipe.js'
import { createReducerPipe } from './reducerPipe.js'
import { createSketch2DPipe } from './sketch2dPipe.js'
import { createSketch3DPipe } from './sketch3dPipe.js'

// 主函数：创建管道对象
export function createPipeObject(params, assemblyItemId = null) {
  const { innerDiameter, outerDiameter, segments, type } = params

  // 创建管道材质
  const pipeMaterial = createPipeMaterial()

  let result = null

  if (type === 'bend') {
    // === 弯管逻辑 ===
    result = createBendPipe(params, pipeMaterial, assemblyItemId)
  } else if (type === 'reducer') {
    // === 变径管逻辑 ===
    result = createReducerPipe(params, pipeMaterial, assemblyItemId)
  } else if (type === 'sketch2d') {
    // === 2D草图建管逻辑 ===
    result = createSketch2DPipe(params, assemblyItemId)
  } else if (type === 'sketch3d') {
    // === 3D草图建管逻辑 ===
    result = createSketch3DPipe(params, assemblyItemId)
  } else {
    // === 直管逻辑 ===
    // 验证参数（仅对直管进行此验证）
    if (outerDiameter <= innerDiameter || segments < 0) {
      return null
    }
    result = createStraightPipe(params, pipeMaterial, assemblyItemId)
  }
  
  if (!result) {
    return null
  }
  
  const { pipeGroup, groupSize } = result
  
  // 附加尺寸信息供相机调整使用
  pipeGroup.userData = { size: groupSize }
  // 修复: 确保装配体ID正确设置
  if (assemblyItemId) {
    pipeGroup.userData.assemblyItemId = assemblyItemId
    
    // 修复: 为所有子对象设置装配体ID和阴影属性
    pipeGroup.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.userData.assemblyItemId = assemblyItemId
        // 修复: 确保阴影设置正确
        child.castShadow = true
        child.receiveShadow = true
      }
    })
  }
  
  return pipeGroup
}

