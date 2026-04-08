import * as THREE from 'three'
import { updateBatchedProxyMatrices } from '../../utils/batchedProxy.js'

/**
 * Mouse interaction composable for the 3D scene.
 *
 * @param {object} ctx  - shared scene context (from createSceneContext)
 * @param {object} deps - external helpers injected by the caller:
 *   attachRotationGizmo, detachRotationGizmo, handleEndFaceClick,
 *   unfreezeObjectSubtree, freezePreviewPipeMatrices,
 *   findPipeGroupByAssemblyId, requestShadowUpdate,
 *   sketch3DRaycastToPlane, sketch3DAddLineSegment,
 *   sketch3DAddArcSegment, sketch3DUpdatePreviewLines
 */
export function useMouseInteraction(ctx, deps) {
  // ---- local raycaster / pointer ----
  const raycaster = new THREE.Raycaster()
  raycaster.layers.enable(1)
  raycaster.layers.enable(2)
  const pointer = new THREE.Vector2()

  // ---- Pre-allocated temp vectors (avoid per-frame GC pressure) ----
  const _tmpCamDir = new THREE.Vector3()
  const _tmpIntersection = new THREE.Vector3()
  const _tmpNewIntersection = new THREE.Vector3()
  const _tmpDelta = new THREE.Vector3()
  const _tmpNewPos = new THREE.Vector3()
  const _tmpPosDelta = new THREE.Vector3()
  const _tmpObjPos = new THREE.Vector3()

  // Helper: walk up the scene graph to find an assemblyItemId
  const findAssemblyItemId = (object) => {
    let current = object
    while (current) {
      if (current.userData && current.userData.assemblyItemId) {
        return current.userData.assemblyItemId
      }
      if (current.parent && current.parent.userData && current.parent.userData.assemblyItemId) {
        return current.parent.userData.assemblyItemId
      }
      current = current.parent
    }
    return null
  }

  // ------------------------------------------------------------------
  // onMouseDown
  // ------------------------------------------------------------------
  const onMouseDown = (event) => {
    // 3D sketch mode: left-click places a point
    if (ctx.isSketch3DMode && event.button === 0) {
      const point = deps.sketch3DRaycastToPlane(event)
      if (!point) return
      if (ctx.sketch3DDrawMode === 'line') {
        deps.sketch3DAddLineSegment(point)
      } else {
        deps.sketch3DAddArcSegment(point)
      }
      deps.sketch3DUpdatePreviewLines(null)
      return
    }

    // Only enable drag / rotation in assembly mode
    if (!ctx.isAssemblyMode || !ctx.previewPipe || !ctx.camera || !ctx.renderer) {
      // Non-assembly mode: fall through to click handler
      if (!ctx.isAssemblyMode && ctx.previewPipe) {
        onMouseClick(event)
      }
      return
    }

    // Compute normalised pointer position
    const rect = ctx.renderer.domElement.getBoundingClientRect()
    pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
    pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1

    raycaster.setFromCamera(pointer, ctx.camera)

    // Intersect against pipe children
    const intersects = raycaster.intersectObjects(ctx.previewPipe.children, true)

    if (intersects.length > 0) {
      let clickedObject = null

      // ---- Join mode: prioritise end-face clicks ----
      if (ctx.isJoinMode) {
        for (let i = 0; i < Math.min(intersects.length, 3); i++) {
          const obj = intersects[i].object
          if (obj.userData && obj.userData.isEndFace) {
            clickedObject = obj
            deps.handleEndFaceClick(clickedObject, intersects[i].point)
            event.preventDefault()
            return
          }
        }
        // Join mode but no end-face hit – do nothing
        return
      }

      // Use first intersect if no end-face was found
      if (!clickedObject) {
        clickedObject = intersects[0].object
      }

      // ---- Array mode: toggle selection ----
      if (ctx.isArrayMode) {
        if (clickedObject && clickedObject.userData && clickedObject.userData.isOuterSurface) {
          const assemblyItemId = findAssemblyItemId(clickedObject)
          if (assemblyItemId) {
            window.dispatchEvent(new CustomEvent('toggle-assembly-item-selection', {
              detail: { id: assemblyItemId }
            }))
          }
        }
        event.preventDefault()
        return
      }

      // ---- Outer surface interaction (rotation / move) ----
      if (clickedObject.userData && clickedObject.userData.isOuterSurface) {
        const assemblyItemId = findAssemblyItemId(clickedObject)
        if (assemblyItemId) {
          // Locate the pipe Group – delegate to deps for O(1) lookup
          const pipeGroup = deps.findPipeGroupByAssemblyId(assemblyItemId)

          if (pipeGroup) {
            if (ctx.isRotationMode) {
              // Rotation mode: select pipe and attach gizmo
              window.dispatchEvent(new CustomEvent('assembly-item-selected', {
                detail: { id: assemblyItemId }
              }))
              deps.attachRotationGizmo(pipeGroup, assemblyItemId)
              event.preventDefault()
              return
            } else if (ctx.isMoveMode) {
              // Move mode: attach translate gizmo (XYZ arrows)
              window.dispatchEvent(new CustomEvent('assembly-item-selected', {
                detail: { id: assemblyItemId }
              }))
              deps.attachTranslateGizmo(pipeGroup, assemblyItemId)

              // Show transform panel
              window.dispatchEvent(new CustomEvent('show-transform-panel', {
                detail: {
                  type: 'move',
                  id: assemblyItemId,
                  position: {
                    x: pipeGroup.position.x,
                    y: pipeGroup.position.y,
                    z: pipeGroup.position.z
                  }
                }
              }))
              event.preventDefault()
              return
            }
          }
        }
      }
    }
  }

  // ------------------------------------------------------------------
  // onMouseMove
  // ------------------------------------------------------------------
  const onMouseMove = (event) => {
    // 3D sketch mode: rubber-band preview
    if (ctx.isSketch3DMode && ctx.sketch3DLastPoint) {
      const point = deps.sketch3DRaycastToPlane(event)
      if (point) deps.sketch3DUpdatePreviewLines(point)
      return
    }

    // ---- Rotation dragging ----
    if (ctx.isRotating && ctx.rotatedObject) {
      const deltaY = event.clientY - ctx.rotationStartMouseY
      const rotationSpeed = Math.PI / 200 // radians per pixel
      const deltaAngle = -deltaY * rotationSpeed
      const newAngle = ctx.rotationStartAngle + deltaAngle

      // Check if rotation actually changed
      const currentAngle = ctx.rotatedObject.rotation[ctx.rotationAxis] || 0
      const angleDelta = Math.abs(newAngle - currentAngle)
      if (angleDelta > 0.001) {
        ctx.hasRotated = true
      }

      // Apply rotation on selected axis
      if (ctx.rotationAxis === 'x') {
        ctx.rotatedObject.rotation.x = newAngle
      } else if (ctx.rotationAxis === 'y') {
        ctx.rotatedObject.rotation.y = newAngle
      } else if (ctx.rotationAxis === 'z') {
        ctx.rotatedObject.rotation.z = newAngle
      }

      ctx.rotatedObject.updateMatrix()
      ctx.rotatedObject.updateMatrixWorld(true)
      deps.requestShadowUpdate()

      // Notify App.vue of rotation change
      window.dispatchEvent(new CustomEvent('assembly-item-rotation-updated', {
        detail: {
          id: ctx.rotatedAssemblyItemId,
          rotation: {
            x: ctx.rotatedObject.rotation.x,
            y: ctx.rotatedObject.rotation.y,
            z: ctx.rotatedObject.rotation.z
          },
          isUserInput: false
        }
      }))

      updateBatchedProxyMatrices(ctx.rotatedAssemblyItemId)
      return
    }

    // ---- Move dragging ----
    if (!ctx.isDragging || !ctx.draggedObject || !ctx.camera || !ctx.renderer || !ctx.dragPlane) {
      return
    }

    const rect = ctx.renderer.domElement.getBoundingClientRect()
    pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
    pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1

    raycaster.setFromCamera(pointer, ctx.camera)

    if (raycaster.ray.intersectPlane(ctx.dragPlane, _tmpNewIntersection)) {
      // Reuse pre-allocated vectors instead of clone()
      _tmpDelta.copy(_tmpNewIntersection).sub(ctx.dragStartPoint)

      // Apply plane constraint
      if (ctx.movePlane === 'xy') {
        _tmpDelta.z = 0
      } else if (ctx.movePlane === 'yz') {
        _tmpDelta.x = 0
      } else if (ctx.movePlane === 'zx') {
        _tmpDelta.y = 0
      }

      // Threshold check
      if (_tmpDelta.length() > 0.01) {
        ctx.hasMoved = true
      }

      _tmpNewPos.copy(ctx.dragStartPoint).add(_tmpDelta).add(ctx.dragOffset)

      // Batch move
      if (ctx.draggedObjects.length > 1 && ctx.dragStartPositions.length > 0) {
        const clickedIndex = ctx.draggedAssemblyItemIds.indexOf(ctx.draggedAssemblyItemId)
        if (clickedIndex >= 0 && ctx.dragStartPositions[clickedIndex]) {
          const clickedStartPos = ctx.dragStartPositions[clickedIndex]
          _tmpPosDelta.set(
            _tmpNewPos.x - clickedStartPos.x,
            _tmpNewPos.y - clickedStartPos.y,
            _tmpNewPos.z - clickedStartPos.z
          )

          ctx.draggedObjects.forEach((obj, index) => {
            if (obj && ctx.dragStartPositions[index] && ctx.draggedAssemblyItemIds[index]) {
              _tmpObjPos.set(
                ctx.dragStartPositions[index].x + _tmpPosDelta.x,
                ctx.dragStartPositions[index].y + _tmpPosDelta.y,
                ctx.dragStartPositions[index].z + _tmpPosDelta.z
              )
              obj.position.copy(_tmpObjPos)

              window.dispatchEvent(new CustomEvent('assembly-item-position-updated', {
                detail: {
                  id: ctx.draggedAssemblyItemIds[index],
                  position: {
                    x: _tmpObjPos.x,
                    y: _tmpObjPos.y,
                    z: _tmpObjPos.z
                  }
                }
              }))
            }
          })
        }
      } else {
        // Single move
        if (ctx.draggedObject) {
          ctx.draggedObject.position.copy(_tmpNewPos)
          deps.requestShadowUpdate()
        }

        window.dispatchEvent(new CustomEvent('assembly-item-position-updated', {
          detail: {
            id: ctx.draggedAssemblyItemId,
            position: {
              x: _tmpNewPos.x,
              y: _tmpNewPos.y,
              z: _tmpNewPos.z
            }
          }
        }))

        updateBatchedProxyMatrices(ctx.draggedAssemblyItemId)
      }
    }
  }

  // ------------------------------------------------------------------
  // onMouseUp
  // ------------------------------------------------------------------
  const onMouseUp = (event) => {
    // ---- End rotation ----
    if (ctx.isRotating) {
      const wasRotating = ctx.hasRotated
      ctx.isRotating = false
      ctx.hasRotated = false

      ctx.controls.enabled = true
      ctx.renderer.domElement.style.cursor = 'default'

      if (wasRotating && ctx.rotatedObject && ctx.rotatedAssemblyItemId) {
        if (ctx.rotationSaveHistoryTimer) {
          clearTimeout(ctx.rotationSaveHistoryTimer)
          ctx.rotationSaveHistoryTimer = null
        }

        const finalRotation = {
          x: ctx.rotatedObject.rotation.x,
          y: ctx.rotatedObject.rotation.y,
          z: ctx.rotatedObject.rotation.z
        }

        const startRotation = {
          x: ctx.rotatedObject.rotation.x,
          y: ctx.rotatedObject.rotation.y,
          z: ctx.rotatedObject.rotation.z
        }
        startRotation[ctx.rotationAxis] = ctx.rotationStartAngle

        const angleChanged = Math.abs(finalRotation[ctx.rotationAxis] - startRotation[ctx.rotationAxis]) > 0.001

        if (angleChanged) {
          window.dispatchEvent(new CustomEvent('assembly-item-rotation-ended', {
            detail: {
              id: ctx.rotatedAssemblyItemId,
              startRotation: startRotation,
              endRotation: finalRotation,
              axis: ctx.rotationAxis
            }
          }))
        }
      }

      ctx.rotatedObject = null
      ctx.rotatedAssemblyItemId = null
      return
    }

    // ---- End drag ----
    if (ctx.isDragging) {
      const wasMoved = ctx.hasMoved
      ctx.isDragging = false
      ctx.hasMoved = false

      ctx.controls.enabled = true
      ctx.renderer.domElement.style.cursor = 'default'

      if (wasMoved) {
        if (ctx.saveHistoryTimer) {
          clearTimeout(ctx.saveHistoryTimer)
          ctx.saveHistoryTimer = null
        }

        // Batch move event
        if (ctx.draggedObjects.length > 1 && ctx.dragStartPositions.length > 0) {
          const batchMoveItems = []
          ctx.draggedObjects.forEach((obj, index) => {
            if (obj && ctx.dragStartPositions[index] && ctx.draggedAssemblyItemIds[index]) {
              batchMoveItems.push({
                id: ctx.draggedAssemblyItemIds[index],
                startPosition: { ...ctx.dragStartPositions[index] },
                endPosition: {
                  x: obj.position.x,
                  y: obj.position.y,
                  z: obj.position.z
                }
              })
            }
          })

          if (batchMoveItems.length > 0) {
            window.dispatchEvent(new CustomEvent('assembly-items-batch-drag-ended', {
              detail: { items: batchMoveItems }
            }))
          }
        } else if (ctx.dragStartPosition) {
          // Single move event
          const finalPosition = {
            x: ctx.draggedObject.position.x,
            y: ctx.draggedObject.position.y,
            z: ctx.draggedObject.position.z
          }

          window.dispatchEvent(new CustomEvent('assembly-item-drag-ended', {
            detail: {
              id: ctx.draggedAssemblyItemId,
              startPosition: ctx.dragStartPosition,
              endPosition: finalPosition
            }
          }))
        }
      }

      ctx.dragStartPosition = null
      ctx.dragStartPositions = []
      ctx.draggedObject = null
      ctx.draggedObjects = []
      ctx.draggedAssemblyItemId = null
      ctx.draggedAssemblyItemIds = []
      ctx.dragPlane = null

      if (ctx.isAssemblyMode && ctx.previewPipe) deps.freezePreviewPipeMatrices()
    }
  }

  // ------------------------------------------------------------------
  // onMouseClick  (non-assembly mode)
  // ------------------------------------------------------------------
  const onMouseClick = (event) => {
    if (!ctx.previewPipe || !ctx.camera || !ctx.renderer || ctx.isAssemblyMode) return

    const rect = ctx.renderer.domElement.getBoundingClientRect()
    pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
    pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1

    raycaster.setFromCamera(pointer, ctx.camera)

    const intersects = raycaster.intersectObjects(ctx.previewPipe.children, true)

    if (intersects.length > 0) {
      console.log('点击到了管道')
      window.dispatchEvent(new CustomEvent('pipe-clicked'))
    }
  }

  return {
    onMouseDown,
    onMouseMove,
    onMouseUp,
    onMouseClick
  }
}
