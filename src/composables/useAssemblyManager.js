import { ref } from 'vue'

export function useAssemblyManager(historyItems) {
  const assemblyItems = ref([])
  const isViewingAssembly = ref(false)

  const addToAssembly = (part) => {
    // 添加到总装配体
    const assemblyItem = {
      ...JSON.parse(JSON.stringify(part)), // 深拷贝，防止引用污染
      id: `asm_${Date.now()}_${Math.floor(Math.random() * 1000)}`, // 生成唯一的实例ID
      originalPartId: part.id,
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      assemblyTime: new Date().toLocaleString()
    }
    assemblyItems.value.push(assemblyItem)
    
    // 记录操作历史
    const historyItem = {
      id: `hist_${Date.now()}`,
      type: 'assembly',
      targetId: assemblyItem.id,
      name: `装配: ${part.name}`,
      time: new Date().toLocaleTimeString() // 只显示时间，避免太长
    }
    if (historyItems) historyItems.value.unshift(historyItem)
  }

  const viewAssembly = () => {
    // 设置浏览总装配体状态
    isViewingAssembly.value = true
    
    // 触发浏览总装配体事件
    window.dispatchEvent(new CustomEvent('view-assembly', {
      detail: assemblyItems.value
    }))
  }

  return {
    assemblyItems,
    isViewingAssembly,
    addToAssembly,
    viewAssembly
  }
}
