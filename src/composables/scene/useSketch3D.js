import { ref } from 'vue'
import * as THREE from 'three'
import { createSketch3DPipe } from '../../utils/sketch3dPipe.js'

/**
 * 3D sketch drawing composable.
 *
 * @param {object} ctx  – shared scene context (plain object, see useSceneContext)
 * @param {object} deps – sibling composable helpers:
 *   { clearPipePreview, enableShadowsForObject, handleResize,
 *     isSplitView, sketchPathData, sketch2DPipeParams, initialSketchPathData }
 */
export function useSketch3D(ctx, deps) {
  // ---- Vue refs (exposed) ----
  const isSketch3DMode = ref(false)
  const sketch3DDrawMode = ref('line')
  const sketch3DWorkingPlane = ref('XZ')

  // ---- Internal closure state (not on ctx) ----
  let sketch3DSegments = []
  let sketch3DLastPoint = null
  let sketch3DPreviewGroup = null
  let sketch3DGridHelper = null
  let sketch3DPipeParams = null
  let sketch3DArcState = 'start'
  let sketch3DArcStartPoint = null
  let sketch3DArcEndPoint = null
  const sketch3DSnapSize = 5

  // ---- Functions ----

  const sketch3DGetWorkingPlane = () => {
    const p = sketch3DWorkingPlane.value
    if (p === 'XY') return new THREE.Plane(new THREE.Vector3(0, 0, 1), 0)
    if (p === 'YZ') return new THREE.Plane(new THREE.Vector3(1, 0, 0), 0)
    return new THREE.Plane(new THREE.Vector3(0, 1, 0), 0) // XZ
  }

  const sketch3DSnap = (point) => {
    const s = sketch3DSnapSize
    return new THREE.Vector3(
      Math.round(point.x / s) * s,
      Math.round(point.y / s) * s,
      Math.round(point.z / s) * s
    )
  }

  const sketch3DRaycastToPlane = (event) => {
    if (!ctx.renderer || !ctx.camera) return null
    const rect = ctx.renderer.domElement.getBoundingClientRect()
    const pointer = new THREE.Vector2(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1
    )
    const raycaster = new THREE.Raycaster()
    raycaster.layers.enable(1)
    raycaster.layers.enable(2)
    raycaster.setFromCamera(pointer, ctx.camera)
    const intersection = new THREE.Vector3()
    if (raycaster.ray.intersectPlane(sketch3DGetWorkingPlane(), intersection)) {
      return sketch3DSnap(intersection)
    }
    return null
  }

  const sketch3DUpdateGrid = () => {
    if (sketch3DGridHelper) {
      ctx.scene.remove(sketch3DGridHelper)
      sketch3DGridHelper.geometry?.dispose()
      sketch3DGridHelper.material?.dispose()
    }
    const size = 200
    const divisions = size / sketch3DSnapSize
    sketch3DGridHelper = new THREE.GridHelper(size, divisions, 0x2266aa, 0x1a4477)
    sketch3DGridHelper.material.opacity = 0.3
    sketch3DGridHelper.material.transparent = true
    const p = sketch3DWorkingPlane.value
    if (p === 'XY') sketch3DGridHelper.rotation.x = Math.PI / 2
    else if (p === 'YZ') sketch3DGridHelper.rotation.z = Math.PI / 2
    ctx.scene.add(sketch3DGridHelper)
  }

  const sketch3DUpdatePreviewLines = (mousePoint) => {
    if (!sketch3DPreviewGroup) {
      sketch3DPreviewGroup = new THREE.Group()
      sketch3DPreviewGroup.name = 'sketch3DPreview'
      ctx.scene.add(sketch3DPreviewGroup)
    }
    // clear old preview
    while (sketch3DPreviewGroup.children.length) {
      const c = sketch3DPreviewGroup.children[0]
      sketch3DPreviewGroup.remove(c)
      c.geometry?.dispose()
      c.material?.dispose()
    }

    const lineMat = new THREE.LineBasicMaterial({ color: 0x00ff00 })
    const dashMat = new THREE.LineDashedMaterial({ color: 0xffff00, dashSize: 2, gapSize: 1 })
    const pointMat = new THREE.MeshBasicMaterial({ color: 0x00ff00 })

    // draw confirmed segments
    sketch3DSegments.forEach(seg => {
      if (seg.type === 'line') {
        const geo = new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(seg.start.x, seg.start.y, seg.start.z),
          new THREE.Vector3(seg.end.x, seg.end.y, seg.end.z)
        ])
        sketch3DPreviewGroup.add(new THREE.Line(geo, lineMat))
      } else if (seg.type === 'arc') {
        const pts = []
        const steps = 32
        for (let i = 0; i <= steps; i++) {
          const angle = seg.startAngle + (seg.endAngle - seg.startAngle) * (i / steps)
          const c = seg.center, r = seg.radius
          const cos = Math.cos(angle), sin = Math.sin(angle)
          if (seg.plane === 'XY') pts.push(new THREE.Vector3(c.x + r * cos, c.y + r * sin, c.z))
          else if (seg.plane === 'YZ') pts.push(new THREE.Vector3(c.x, c.y + r * cos, c.z + r * sin))
          else pts.push(new THREE.Vector3(c.x + r * cos, c.y, c.z + r * sin))
        }
        sketch3DPreviewGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), lineMat))
      }
    })

    // draw node spheres
    const allPoints = []
    if (sketch3DSegments.length > 0) {
      const first = sketch3DSegments[0]
      allPoints.push(first.type === 'line' ? first.start : first.start || { x: 0, y: 0, z: 0 })
    }
    sketch3DSegments.forEach(seg => {
      if (seg.type === 'line') allPoints.push(seg.end)
      else if (seg.type === 'arc') {
        const angle = seg.endAngle, c = seg.center, r = seg.radius
        const cos = Math.cos(angle), sin = Math.sin(angle)
        if (seg.plane === 'XY') allPoints.push({ x: c.x + r * cos, y: c.y + r * sin, z: c.z })
        else if (seg.plane === 'YZ') allPoints.push({ x: c.x, y: c.y + r * cos, z: c.z + r * sin })
        else allPoints.push({ x: c.x + r * cos, y: c.y, z: c.z + r * sin })
      }
    })
    allPoints.forEach(p => {
      const sphere = new THREE.Mesh(new THREE.SphereGeometry(0.8, 8, 8), pointMat)
      sphere.position.set(p.x, p.y, p.z)
      sketch3DPreviewGroup.add(sphere)
    })

    // rubber-band line
    if (mousePoint && sketch3DLastPoint) {
      const geo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(sketch3DLastPoint.x, sketch3DLastPoint.y, sketch3DLastPoint.z),
        mousePoint
      ])
      const line = new THREE.Line(geo, dashMat)
      line.computeLineDistances()
      sketch3DPreviewGroup.add(line)
    }
  }

  const sketch3DUpdatePipePreview = () => {
    if (sketch3DSegments.length === 0 || !sketch3DPipeParams) return
    deps.clearPipePreview()
    ctx.isAssemblyMode = false
    const params = {
      ...sketch3DPipeParams,
      pathData3d: { segments: sketch3DSegments },
      type: 'sketch3d'
    }
    const result = createSketch3DPipe(params)
    if (!result) return
    deps.enableShadowsForObject(result.pipeGroup)
    ctx.previewPipe = result.pipeGroup
    ctx.scene.add(ctx.previewPipe)
  }

  const sketch3DAddLineSegment = (point) => {
    if (!sketch3DLastPoint) {
      sketch3DLastPoint = { x: point.x, y: point.y, z: point.z }
      return
    }
    const seg = {
      type: 'line',
      start: { ...sketch3DLastPoint },
      end: { x: point.x, y: point.y, z: point.z }
    }
    sketch3DSegments.push(seg)
    sketch3DLastPoint = { ...seg.end }
    sketch3DUpdatePipePreview()
    sketch3DSyncPathData()
  }

  const sketch3DAddArcSegment = (point) => {
    if (sketch3DArcState === 'start') {
      if (!sketch3DLastPoint) {
        sketch3DLastPoint = { x: point.x, y: point.y, z: point.z }
        return
      }
      sketch3DArcStartPoint = { ...sketch3DLastPoint }
      sketch3DArcEndPoint = { x: point.x, y: point.y, z: point.z }
      sketch3DArcState = 'center'
    } else if (sketch3DArcState === 'center') {
      const p1 = sketch3DArcStartPoint
      const p2 = { x: point.x, y: point.y, z: point.z }
      const p3 = sketch3DArcEndPoint
      const plane = sketch3DWorkingPlane.value

      const to2D = (pt) => {
        if (plane === 'XY') return { u: pt.x, v: pt.y }
        if (plane === 'YZ') return { u: pt.y, v: pt.z }
        return { u: pt.x, v: pt.z } // XZ
      }
      const a = to2D(p1), b = to2D(p2), c = to2D(p3)

      const D = 2 * (a.u * (b.v - c.v) + b.u * (c.v - a.v) + c.u * (a.v - b.v))
      if (Math.abs(D) < 1e-10) {
        // collinear – degenerate to line
        sketch3DSegments.push({ type: 'line', start: { ...p1 }, end: { ...p3 } })
        sketch3DLastPoint = { ...p3 }
      } else {
        const ux = ((a.u * a.u + a.v * a.v) * (b.v - c.v) + (b.u * b.u + b.v * b.v) * (c.v - a.v) + (c.u * c.u + c.v * c.v) * (a.v - b.v)) / D
        const uy = ((a.u * a.u + a.v * a.v) * (c.u - b.u) + (b.u * b.u + b.v * b.v) * (a.u - c.u) + (c.u * c.u + c.v * c.v) * (b.u - a.u)) / D
        const radius = Math.sqrt((a.u - ux) * (a.u - ux) + (a.v - uy) * (a.v - uy))

        let center
        if (plane === 'XY') center = { x: ux, y: uy, z: p1.z }
        else if (plane === 'YZ') center = { x: p1.x, y: ux, z: uy }
        else center = { x: ux, y: p1.y, z: uy }

        const startAngle = Math.atan2(a.v - uy, a.u - ux)
        const midAngle = Math.atan2(b.v - uy, b.u - ux)
        let endAngle = Math.atan2(c.v - uy, c.u - ux)

        const normalizeAngle = (ang) => ((ang % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)
        const sa = normalizeAngle(startAngle)
        const ma = normalizeAngle(midAngle)
        const ea = normalizeAngle(endAngle)

        const ccwContains = (s, m, e) => {
          if (s <= e) return s <= m && m <= e
          return m >= s || m <= e
        }
        if (!ccwContains(sa, ma, ea)) {
          endAngle = startAngle + (normalizeAngle(endAngle - startAngle) - 2 * Math.PI)
        } else {
          endAngle = startAngle + normalizeAngle(endAngle - startAngle)
        }

        sketch3DSegments.push({
          type: 'arc', center, radius, startAngle, endAngle, plane, clockwise: endAngle < startAngle
        })
        sketch3DLastPoint = { ...p3 }
      }

      sketch3DArcState = 'start'
      sketch3DArcStartPoint = null
      sketch3DArcEndPoint = null
      sketch3DUpdatePipePreview()
      sketch3DSyncPathData()
    }
  }

  const sketch3DSyncPathData = () => {
    window.dispatchEvent(new CustomEvent('sketch3d-pathdata-sync', {
      detail: { segments: sketch3DSegments.map(s => ({ ...s })) }
    }))
  }

  const sketch3DUndo = () => {
    if (sketch3DSegments.length > 0) {
      sketch3DSegments.pop()
      if (sketch3DSegments.length > 0) {
        const last = sketch3DSegments[sketch3DSegments.length - 1]
        if (last.type === 'line') sketch3DLastPoint = { ...last.end }
        else {
          const a = last.endAngle, c = last.center, r = last.radius
          const cos = Math.cos(a), sin = Math.sin(a)
          if (last.plane === 'XY') sketch3DLastPoint = { x: c.x + r * cos, y: c.y + r * sin, z: c.z }
          else if (last.plane === 'YZ') sketch3DLastPoint = { x: c.x, y: c.y + r * cos, z: c.z + r * sin }
          else sketch3DLastPoint = { x: c.x + r * cos, y: c.y, z: c.z + r * sin }
        }
      } else {
        sketch3DLastPoint = null
      }
      sketch3DUpdatePipePreview()
      sketch3DUpdatePreviewLines(null)
      sketch3DSyncPathData()
    }
  }

  const sketch3DConfirm = () => {
    if (sketch3DSegments.length > 0) {
      sketch3DSyncPathData()
    }
    exitSketch3DMode()
  }

  const sketch3DClear = () => {
    sketch3DSegments = []
    sketch3DLastPoint = null
    sketch3DArcState = 'start'
    sketch3DArcStartPoint = null
    sketch3DArcEndPoint = null
    deps.clearPipePreview()
    sketch3DUpdatePreviewLines(null)
    sketch3DSyncPathData()
  }

  const enterSketch3DMode = (params) => {
    isSketch3DMode.value = true
    sketch3DPipeParams = { innerDiameter: params.innerDiameter, outerDiameter: params.outerDiameter, segments: params.segments }
    sketch3DSegments = []
    sketch3DLastPoint = null
    sketch3DArcState = 'start'

    // load existing path data (edit mode)
    if (params.pathData3d && params.pathData3d.segments && params.pathData3d.segments.length > 0) {
      sketch3DSegments = params.pathData3d.segments.map(s => ({ ...s }))
      const last = sketch3DSegments[sketch3DSegments.length - 1]
      if (last.type === 'line') sketch3DLastPoint = { ...last.end }
      else {
        const a = last.endAngle, c = last.center, r = last.radius
        const cos = Math.cos(a), sin = Math.sin(a)
        if (last.plane === 'XY') sketch3DLastPoint = { x: c.x + r * cos, y: c.y + r * sin, z: c.z }
        else if (last.plane === 'YZ') sketch3DLastPoint = { x: c.x, y: c.y + r * cos, z: c.z + r * sin }
        else sketch3DLastPoint = { x: c.x + r * cos, y: c.y, z: c.z + r * sin }
      }
      sketch3DUpdatePipePreview()
    }

    // disable left-button orbit
    if (ctx.controls) ctx.controls.mouseButtons.LEFT = null
    sketch3DUpdateGrid()
    sketch3DUpdatePreviewLines(null)
  }

  const exitSketch3DMode = () => {
    isSketch3DMode.value = false
    sketch3DPipeParams = null
    sketch3DSegments = []
    sketch3DLastPoint = null
    sketch3DArcState = 'start'
    sketch3DArcStartPoint = null
    sketch3DArcEndPoint = null

    if (ctx.controls) ctx.controls.mouseButtons.LEFT = THREE.MOUSE.ROTATE
    if (sketch3DGridHelper) {
      ctx.scene.remove(sketch3DGridHelper)
      sketch3DGridHelper = null
    }
    if (sketch3DPreviewGroup) {
      sketch3DPreviewGroup.traverse(c => { c.geometry?.dispose(); c.material?.dispose() })
      ctx.scene.remove(sketch3DPreviewGroup)
      sketch3DPreviewGroup = null
    }
  }

  const handleSketch3DParamsUpdate = (event) => {
    const params = event.detail
    if (params.type === 'sketch3d') {
      // close 2D split view
      if (deps.isSplitView.value) {
        deps.isSplitView.value = false
        deps.sketchPathData.value = null
        deps.sketch2DPipeParams.value = null
        deps.initialSketchPathData.value = null
      }
      enterSketch3DMode(params)
    } else {
      if (isSketch3DMode.value) exitSketch3DMode()
    }
  }

  const handleSketch3DKeyDown = (event) => {
    if (!isSketch3DMode.value) return
    if (event.key === 'Tab') {
      event.preventDefault()
      const planes = ['XZ', 'XY', 'YZ']
      const idx = planes.indexOf(sketch3DWorkingPlane.value)
      sketch3DWorkingPlane.value = planes[(idx + 1) % 3]
      sketch3DUpdateGrid()
    } else if (event.key === 'z' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault()
      sketch3DUndo()
    } else if (event.key === 'Enter') {
      event.preventDefault()
      sketch3DConfirm()
    } else if (event.key === 'Escape') {
      event.preventDefault()
      deps.clearPipePreview()
      exitSketch3DMode()
      window.dispatchEvent(new CustomEvent('clear-pipe-preview'))
    }
  }

  return {
    // refs
    isSketch3DMode,
    sketch3DDrawMode,
    sketch3DWorkingPlane,
    // functions
    sketch3DGetWorkingPlane,
    sketch3DSnap,
    sketch3DRaycastToPlane,
    sketch3DUpdateGrid,
    sketch3DUpdatePreviewLines,
    sketch3DUpdatePipePreview,
    sketch3DAddLineSegment,
    sketch3DAddArcSegment,
    sketch3DSyncPathData,
    sketch3DUndo,
    sketch3DConfirm,
    sketch3DClear,
    enterSketch3DMode,
    exitSketch3DMode,
    handleSketch3DParamsUpdate,
    handleSketch3DKeyDown,
  }
}
