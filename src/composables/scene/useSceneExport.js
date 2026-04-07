import * as THREE from 'three'
import { ExportManager } from '../../utils/exportManager.js'

export function useSceneExport(ctx) {
  // 移除透明对象（hitbox）的辅助函数
  const removeTransparentObjects = (object) => {
    // 从后往前遍历，避免删除时索引问题
    for (let i = object.children.length - 1; i >= 0; i--) {
      const child = object.children[i]

      // 递归处理子对象
      removeTransparentObjects(child)

      // 检查是否是透明对象（hitbox）或者代理逻辑层（图层2）的隐藏物体
      if (child instanceof THREE.Mesh) {
        if (child.layers.test(2)) {
          // 恢复到可见图层以便正确导出
          child.layers.set(0)
        }

        const material = child.material
        if (material && material.transparent && material.opacity === 0) {
          object.remove(child)
          if (child.geometry) child.geometry.dispose()
          // shared material, do not dispose
          continue
        }
      }
    }
  }

  const handleExportAssembly = (event) => {
    const { format, subdivision } = event.detail
    if (!ctx.previewPipe) return

    // 克隆场景对象以避免修改原始对象
    const sceneToExport = ctx.previewPipe.clone()

    // 移除所有透明对象（hitbox）
    removeTransparentObjects(sceneToExport)

    if (subdivision && subdivision > 0) {
      console.log(`Exporting with subdivision level: ${subdivision}`)
      // TODO: 实现曲面细分逻辑 (需要引入 SubdivisionModifier)
    }

    if (format === 'obj') {
      ExportManager.exportOBJ(sceneToExport, 'assembly.obj')
    } else if (format === 'fbx') {
      ExportManager.exportFBX(sceneToExport, 'assembly.fbx')
    }
  }

  return {
    handleExportAssembly
  }
}
