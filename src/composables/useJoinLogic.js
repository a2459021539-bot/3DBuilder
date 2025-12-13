import { ref } from 'vue'

export function useJoinLogic(assemblyItems, historyItems) {
  const isJoinMode = ref(false)
  const firstSelectedEndFace = ref(null)
  const secondSelectedEndFace = ref(null)
  const moveFirstPipe = ref(true)
  const joinRotationAngle = ref(0)
  const isJoinPositioned = ref(false) // 管道是否已经移动到拼接位置

  const resetJoinSelection = () => {
    firstSelectedEndFace.value = null
    secondSelectedEndFace.value = null
    isJoinPositioned.value = false
    joinRotationAngle.value = 0
    // Dispatch event to clear highlights in 3D scene
    window.dispatchEvent(new CustomEvent('clear-join-highlights'))
    window.dispatchEvent(new CustomEvent('clear-join-preview'))
  }

  const executeJoin = () => {
    if (!firstSelectedEndFace.value || !secondSelectedEndFace.value) return
    
    // 如果还没有移动到拼接位置，先移动管道（角度为0）
    if (!isJoinPositioned.value) {
      // 发送事件到 ThreeScene，移动管道到拼接位置（角度0）
      window.dispatchEvent(new CustomEvent('position-join', {
          detail: {
              firstEndFace: firstSelectedEndFace.value,
              secondEndFace: secondSelectedEndFace.value,
              moveFirst: moveFirstPipe.value,
              rotationAngle: 0
          }
      }))
      isJoinPositioned.value = true
    } else {
      // 已经移动到位置，现在应用最终的角度并保存
      window.dispatchEvent(new CustomEvent('perform-join', {
          detail: {
              firstEndFace: firstSelectedEndFace.value,
              secondEndFace: secondSelectedEndFace.value,
              moveFirst: moveFirstPipe.value,
              rotationAngle: joinRotationAngle.value
          }
      }))
      // 重置状态
      resetJoinSelection()
    }
  }

  return {
    isJoinMode,
    firstSelectedEndFace,
    secondSelectedEndFace,
    moveFirstPipe,
    joinRotationAngle,
    isJoinPositioned,
    resetJoinSelection,
    executeJoin
  }
}
