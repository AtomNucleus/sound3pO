import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import {
  chordMidiNotes,
  chordName,
  type ChordQuality,
} from './chords'
import type { ModDeskSynthEngine } from './synthEngine'

type ChordNode = {
  id: string
  x: number
  y: number
}

type PointerState = {
  pointerId: number
  nodeId: string
  startX: number
  startY: number
  dragging: boolean
}

type ChordFieldProps = {
  engine: ModDeskSynthEngine | null
  isAudioReady: boolean
  ensureAudioStarted: () => Promise<void>
  onPanic: () => void
}

type FieldMetrics = {
  width: number
  height: number
  innerLeft: number
  innerTop: number
  innerWidth: number
  innerHeight: number
}

const QUALITY_BANDS: ChordQuality[] = ['add9', 'maj7', 'maj', 'sus2', 'min', 'min7', 'dim']
const SCALE_PITCH_CLASSES = [0, 2, 4, 5, 7, 9, 11]

const QUALITY_COLORS: Record<ChordQuality, string> = {
  maj: '#ff8e36',
  min: '#18bdb4',
  maj7: '#f4cf45',
  min7: '#dd5f4c',
  dom7: '#d067bf',
  sus2: '#72bc6e',
  sus4: '#62a8e2',
  dim: '#7d87a1',
  add9: '#f3b66d',
  min9: '#4fb2a6',
}

const DEFAULT_NODES: ChordNode[] = [
  { id: 'node-1', x: 0.11, y: 0.18 },
  { id: 'node-2', x: 0.34, y: 0.46 },
  { id: 'node-3', x: 0.61, y: 0.33 },
  { id: 'node-4', x: 0.84, y: 0.58 },
]

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value))

const mapPositionToRootPc = (x: number, scaleSnap: boolean): number => {
  const xClamped = clamp(x, 0, 1)
  if (!scaleSnap) {
    return Math.round(xClamped * 11)
  }
  const scaleIndex = Math.round(xClamped * (SCALE_PITCH_CLASSES.length - 1))
  return SCALE_PITCH_CLASSES[scaleIndex]
}

const mapPositionToQuality = (y: number): ChordQuality => {
  const yClamped = clamp(y, 0, 1)
  const qualityIndex = Math.round(yClamped * (QUALITY_BANDS.length - 1))
  return QUALITY_BANDS[qualityIndex]
}

const nodeToPixel = (node: ChordNode, metrics: FieldMetrics): { x: number; y: number } => ({
  x: metrics.innerLeft + node.x * metrics.innerWidth,
  y: metrics.innerTop + node.y * metrics.innerHeight,
})

const pointToNormalized = (x: number, y: number, metrics: FieldMetrics): { x: number; y: number } => ({
  x: clamp((x - metrics.innerLeft) / metrics.innerWidth, 0, 1),
  y: clamp((y - metrics.innerTop) / metrics.innerHeight, 0, 1),
})

const getFieldMetrics = (width: number, height: number): FieldMetrics => {
  const padX = Math.max(28, width * 0.04)
  const padY = Math.max(24, height * 0.09)
  return {
    width,
    height,
    innerLeft: padX,
    innerTop: padY,
    innerWidth: Math.max(1, width - padX * 2),
    innerHeight: Math.max(1, height - padY * 2),
  }
}

const findNodeAtPoint = (
  nodes: ChordNode[],
  x: number,
  y: number,
  metrics: FieldMetrics,
  radius = 26,
): ChordNode | null => {
  for (let index = nodes.length - 1; index >= 0; index -= 1) {
    const node = nodes[index]
    const pixel = nodeToPixel(node, metrics)
    const distance = Math.hypot(pixel.x - x, pixel.y - y)
    if (distance <= radius) {
      return node
    }
  }
  return null
}

const moveNodeInArray = (nodes: ChordNode[], fromIndex: number, toIndex: number): ChordNode[] => {
  if (fromIndex < 0 || fromIndex >= nodes.length || toIndex < 0 || toIndex >= nodes.length) {
    return nodes
  }
  const nextNodes = [...nodes]
  const [moved] = nextNodes.splice(fromIndex, 1)
  nextNodes.splice(toIndex, 0, moved)
  return nextNodes
}

function ChordField({ engine, isAudioReady, ensureAudioStarted, onPanic }: ChordFieldProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const animationFrameRef = useRef<number>(0)
  const pointerStateRef = useRef<PointerState | null>(null)
  const nodesRef = useRef<ChordNode[]>(DEFAULT_NODES)
  const selectedNodeIdRef = useRef<string | null>(DEFAULT_NODES[0]?.id ?? null)
  const latchedNodeIdsRef = useRef(new Set<string>())
  const playingNodeNotesRef = useRef(new Map<string, number[]>())
  const sequenceNotesRef = useRef<number[]>([])
  const currentStepRef = useRef(-1)
  const isLoopPlayingRef = useRef(false)
  const analyserDataRef = useRef<Uint8Array<ArrayBuffer> | null>(null)
  const energyRef = useRef(0)
  const nextNodeIdRef = useRef(DEFAULT_NODES.length + 1)

  const [nodes, setNodes] = useState<ChordNode[]>(DEFAULT_NODES)
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(DEFAULT_NODES[0]?.id ?? null)
  const [tempo, setTempo] = useState(112)
  const [isLoopPlaying, setIsLoopPlaying] = useState(false)
  const [holdEnabled, setHoldEnabled] = useState(false)
  const [scaleSnap, setScaleSnap] = useState(false)
  const [currentStep, setCurrentStep] = useState(-1)
  const [latchedNodeIds, setLatchedNodeIds] = useState<string[]>([])

  useEffect(() => {
    nodesRef.current = nodes
  }, [nodes])

  useEffect(() => {
    selectedNodeIdRef.current = selectedNodeId
  }, [selectedNodeId])

  useEffect(() => {
    latchedNodeIdsRef.current = new Set(latchedNodeIds)
  }, [latchedNodeIds])

  useEffect(() => {
    currentStepRef.current = currentStep
  }, [currentStep])

  useEffect(() => {
    isLoopPlayingRef.current = isLoopPlaying
  }, [isLoopPlaying])

  const getNodeChord = useCallback(
    (node: ChordNode) => {
      const rootPc = mapPositionToRootPc(node.x, scaleSnap)
      const quality = mapPositionToQuality(node.y)
      return {
        rootPc,
        quality,
        name: chordName(rootPc, quality),
      }
    },
    [scaleSnap],
  )

  const releaseMidiNotes = useCallback(
    (notes: number[]) => {
      if (!engine) {
        return
      }
      for (const note of notes) {
        engine.noteOff(note)
      }
    },
    [engine],
  )

  const playChordForNode = useCallback(
    async (node: ChordNode, velocity = 0.9): Promise<number[]> => {
      if (!engine) {
        return []
      }
      await ensureAudioStarted()
      const chord = getNodeChord(node)
      const notes = chordMidiNotes(chord.rootPc, chord.quality, 4)
      for (const note of notes) {
        engine.noteOn(note, velocity)
      }
      return notes
    },
    [engine, ensureAudioStarted, getNodeChord],
  )

  const stopNodeNotes = useCallback(
    (nodeId: string) => {
      const existingNotes = playingNodeNotesRef.current.get(nodeId)
      if (existingNotes) {
        releaseMidiNotes(existingNotes)
        playingNodeNotesRef.current.delete(nodeId)
      }
    },
    [releaseMidiNotes],
  )

  const restartNodeNotes = useCallback(
    async (nodeId: string, node: ChordNode, velocity = 0.9) => {
      stopNodeNotes(nodeId)
      const notes = await playChordForNode(node, velocity)
      if (notes.length > 0) {
        playingNodeNotesRef.current.set(nodeId, notes)
      }
    },
    [playChordForNode, stopNodeNotes],
  )

  const stopSequencerChord = useCallback(() => {
    if (sequenceNotesRef.current.length > 0) {
      releaseMidiNotes(sequenceNotesRef.current)
      sequenceNotesRef.current = []
    }
  }, [releaseMidiNotes])

  const playSequencerStep = useCallback(
    async (stepIndex: number) => {
      const currentNodes = nodesRef.current
      if (!engine || currentNodes.length === 0) {
        return
      }
      const wrappedIndex = ((stepIndex % currentNodes.length) + currentNodes.length) % currentNodes.length
      const stepNode = currentNodes[wrappedIndex]
      stopSequencerChord()
      const notes = await playChordForNode(stepNode, 0.82)
      sequenceNotesRef.current = notes
      setCurrentStep(wrappedIndex)
    },
    [engine, playChordForNode, stopSequencerChord],
  )

  useEffect(() => {
    if (!isLoopPlaying || nodes.length === 0) {
      stopSequencerChord()
      setCurrentStep(-1)
      return
    }

    let step = currentStepRef.current
    const runStep = () => {
      step = (step + 1) % nodesRef.current.length
      void playSequencerStep(step)
    }

    runStep()
    const intervalMs = Math.max(60_000 / tempo, 120)
    const intervalId = window.setInterval(runStep, intervalMs)

    return () => {
      window.clearInterval(intervalId)
      stopSequencerChord()
    }
  }, [isLoopPlaying, nodes.length, playSequencerStep, stopSequencerChord, tempo])

  useEffect(() => {
    const draw = (now: number) => {
      const canvas = canvasRef.current
      if (!canvas) {
        animationFrameRef.current = window.requestAnimationFrame(draw)
        return
      }

      const rect = canvas.getBoundingClientRect()
      const dpr = window.devicePixelRatio || 1
      const targetWidth = Math.max(1, Math.floor(rect.width * dpr))
      const targetHeight = Math.max(1, Math.floor(rect.height * dpr))
      if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
        canvas.width = targetWidth
        canvas.height = targetHeight
      }

      const context = canvas.getContext('2d')
      if (!context) {
        animationFrameRef.current = window.requestAnimationFrame(draw)
        return
      }

      context.setTransform(dpr, 0, 0, dpr, 0, 0)
      const width = rect.width
      const height = rect.height
      const metrics = getFieldMetrics(width, height)

      context.clearRect(0, 0, width, height)
      const bgGradient = context.createLinearGradient(0, 0, 0, height)
      bgGradient.addColorStop(0, '#f7ecd6')
      bgGradient.addColorStop(1, '#ebddc4')
      context.fillStyle = bgGradient
      context.fillRect(0, 0, width, height)

      context.strokeStyle = 'rgba(66, 56, 45, 0.14)'
      context.lineWidth = 1
      for (let columnIndex = 0; columnIndex <= 12; columnIndex += 1) {
        const x = metrics.innerLeft + (columnIndex / 12) * metrics.innerWidth
        context.beginPath()
        context.moveTo(x, metrics.innerTop)
        context.lineTo(x, metrics.innerTop + metrics.innerHeight)
        context.stroke()
      }
      for (let rowIndex = 0; rowIndex <= 6; rowIndex += 1) {
        const y = metrics.innerTop + (rowIndex / 6) * metrics.innerHeight
        context.beginPath()
        context.moveTo(metrics.innerLeft, y)
        context.lineTo(metrics.innerLeft + metrics.innerWidth, y)
        context.stroke()
      }

      let energy = 0
      const analyser = engine?.getAnalyser() ?? null
      if (analyser) {
        if (!analyserDataRef.current || analyserDataRef.current.length !== analyser.fftSize) {
          analyserDataRef.current = new Uint8Array(analyser.fftSize) as Uint8Array<ArrayBuffer>
        }
        const waveform = analyserDataRef.current
        analyser.getByteTimeDomainData(waveform)
        let rmsAccum = 0
        for (let sampleIndex = 0; sampleIndex < waveform.length; sampleIndex += 1) {
          const normalized = waveform[sampleIndex] / 128 - 1
          rmsAccum += normalized * normalized
        }
        energy = Math.sqrt(rmsAccum / waveform.length)
        energyRef.current = energyRef.current * 0.85 + energy * 0.15

        context.beginPath()
        context.lineWidth = 2
        context.strokeStyle = 'rgba(51, 114, 96, 0.85)'
        for (let sampleIndex = 0; sampleIndex < waveform.length; sampleIndex += 1) {
          const x = metrics.innerLeft + (sampleIndex / (waveform.length - 1)) * metrics.innerWidth
          const y =
            metrics.innerTop +
            metrics.innerHeight * 0.5 +
            ((waveform[sampleIndex] / 128 - 1) * metrics.innerHeight * 0.22)
          if (sampleIndex === 0) {
            context.moveTo(x, y)
          } else {
            context.lineTo(x, y)
          }
        }
        context.stroke()
      } else {
        energyRef.current *= 0.92
      }

      const currentNodes = nodesRef.current
      if (currentNodes.length > 1) {
        context.beginPath()
        context.lineWidth = 2.5
        context.strokeStyle = 'rgba(67, 115, 137, 0.72)'
        context.setLineDash([9, 7])
        context.lineDashOffset = -((now / 32) % 16)
        currentNodes.forEach((node, nodeIndex) => {
          const pixel = nodeToPixel(node, metrics)
          if (nodeIndex === 0) {
            context.moveTo(pixel.x, pixel.y)
          } else {
            context.lineTo(pixel.x, pixel.y)
          }
        })
        context.stroke()
        context.setLineDash([])
      }

      const selectedNodeId = selectedNodeIdRef.current
      const latchedNodeIds = latchedNodeIdsRef.current
      currentNodes.forEach((node, nodeIndex) => {
        const chord = {
          rootPc: mapPositionToRootPc(node.x, scaleSnap),
          quality: mapPositionToQuality(node.y),
        }
        const pixel = nodeToPixel(node, metrics)
        const nodeColor = QUALITY_COLORS[chord.quality]
        const isSelected = node.id === selectedNodeId
        const isSequencerCurrent = nodeIndex === currentStepRef.current && isLoopPlayingRef.current
        const isLatched = latchedNodeIds.has(node.id)
        const isPlayingNode = playingNodeNotesRef.current.has(node.id)
        const radius =
          18 +
          energyRef.current * 14 +
          (isSelected ? 4 : 0) +
          (isSequencerCurrent || isPlayingNode || isLatched ? 5 : 0)

        context.beginPath()
        context.fillStyle = `${nodeColor}4a`
        context.arc(pixel.x, pixel.y, radius + 10, 0, Math.PI * 2)
        context.fill()

        context.beginPath()
        context.fillStyle = nodeColor
        context.arc(pixel.x, pixel.y, radius, 0, Math.PI * 2)
        context.fill()

        context.beginPath()
        context.lineWidth = isSequencerCurrent ? 3.5 : 2
        context.strokeStyle = isSelected || isSequencerCurrent ? '#f8ffe8' : 'rgba(245, 250, 255, 0.75)'
        context.arc(pixel.x, pixel.y, radius + 2, 0, Math.PI * 2)
        context.stroke()

        const label = chordName(chord.rootPc, chord.quality)
        context.fillStyle = '#1d2518'
        context.font = '600 13px "IBM Plex Mono", monospace'
        context.textAlign = 'center'
        context.textBaseline = 'middle'
        context.fillText(label, pixel.x, pixel.y)

        context.beginPath()
        context.fillStyle = 'rgba(17, 25, 22, 0.92)'
        context.arc(pixel.x + radius * 0.7, pixel.y - radius * 0.72, 10, 0, Math.PI * 2)
        context.fill()
        context.fillStyle = '#c2ffd6'
        context.font = '500 10px "IBM Plex Mono", monospace'
        context.fillText(String(nodeIndex + 1), pixel.x + radius * 0.7, pixel.y - radius * 0.72)
      })

      animationFrameRef.current = window.requestAnimationFrame(draw)
    }

    animationFrameRef.current = window.requestAnimationFrame(draw)
    return () => {
      if (animationFrameRef.current !== 0) {
        window.cancelAnimationFrame(animationFrameRef.current)
      }
    }
  }, [engine, scaleSnap])

  const setNodePosition = useCallback((nodeId: string, x: number, y: number) => {
    setNodes((previousNodes) =>
      previousNodes.map((node) =>
        node.id === nodeId ? { ...node, x: clamp(x, 0, 1), y: clamp(y, 0, 1) } : node,
      ),
    )
  }, [])

  const updateNodeVoicingIfPlaying = useCallback(
    (nodeId: string, x: number, y: number) => {
      const isNodePlaying = playingNodeNotesRef.current.has(nodeId)
      const isNodeSequencerCurrent =
        isLoopPlayingRef.current &&
        currentStepRef.current >= 0 &&
        nodesRef.current[currentStepRef.current]?.id === nodeId
      if (!isNodePlaying && !isNodeSequencerCurrent) {
        return
      }
      const node = nodesRef.current.find((candidate) => candidate.id === nodeId)
      const updatedNode: ChordNode = node ? { ...node, x, y } : { id: nodeId, x, y }
      if (isNodePlaying) {
        void restartNodeNotes(nodeId, updatedNode, 0.9)
      }
      if (isNodeSequencerCurrent) {
        void playSequencerStep(currentStepRef.current)
      }
    },
    [playSequencerStep, restartNodeNotes],
  )

  const stopPointerNodeIfNeeded = useCallback(
    (nodeId: string) => {
      if (latchedNodeIdsRef.current.has(nodeId)) {
        return
      }
      stopNodeNotes(nodeId)
    },
    [stopNodeNotes],
  )

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current
      if (!canvas) {
        return
      }
      const rect = canvas.getBoundingClientRect()
      const pointerX = event.clientX - rect.left
      const pointerY = event.clientY - rect.top
      const metrics = getFieldMetrics(rect.width, rect.height)
      const hitNode = findNodeAtPoint(nodesRef.current, pointerX, pointerY, metrics)
      if (!hitNode) {
        setSelectedNodeId(null)
        return
      }

      setSelectedNodeId(hitNode.id)
      pointerStateRef.current = {
        pointerId: event.pointerId,
        nodeId: hitNode.id,
        startX: pointerX,
        startY: pointerY,
        dragging: false,
      }
      event.currentTarget.setPointerCapture(event.pointerId)
      void restartNodeNotes(hitNode.id, hitNode, 0.9)
    },
    [restartNodeNotes],
  )

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => {
      const pointerState = pointerStateRef.current
      const canvas = canvasRef.current
      if (!pointerState || !canvas || pointerState.pointerId !== event.pointerId) {
        return
      }

      const rect = canvas.getBoundingClientRect()
      const pointerX = event.clientX - rect.left
      const pointerY = event.clientY - rect.top
      const movement = Math.hypot(pointerX - pointerState.startX, pointerY - pointerState.startY)
      if (movement > 5) {
        pointerState.dragging = true
      }
      if (!pointerState.dragging) {
        return
      }

      const metrics = getFieldMetrics(rect.width, rect.height)
      const normalized = pointToNormalized(pointerX, pointerY, metrics)
      setNodePosition(pointerState.nodeId, normalized.x, normalized.y)
      updateNodeVoicingIfPlaying(pointerState.nodeId, normalized.x, normalized.y)
    },
    [setNodePosition, updateNodeVoicingIfPlaying],
  )

  const handlePointerUpLike = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => {
      const pointerState = pointerStateRef.current
      if (!pointerState || pointerState.pointerId !== event.pointerId) {
        return
      }

      const nodeId = pointerState.nodeId
      if (holdEnabled && !pointerState.dragging) {
        if (latchedNodeIdsRef.current.has(nodeId)) {
          setLatchedNodeIds((previous) => previous.filter((id) => id !== nodeId))
          stopNodeNotes(nodeId)
        } else {
          setLatchedNodeIds((previous) => [...previous, nodeId])
        }
      } else {
        stopPointerNodeIfNeeded(nodeId)
      }

      pointerStateRef.current = null
      event.currentTarget.releasePointerCapture(event.pointerId)
    },
    [holdEnabled, stopNodeNotes, stopPointerNodeIfNeeded],
  )

  const addChordNode = useCallback((x = 0.5, y = 0.5) => {
    setNodes((previousNodes) => {
      const nextNode: ChordNode = {
        id: `node-${nextNodeIdRef.current}`,
        x: clamp(x, 0, 1),
        y: clamp(y, 0, 1),
      }
      nextNodeIdRef.current += 1
      return [...previousNodes, nextNode]
    })
  }, [])

  const handleDoubleClick = useCallback(
    (event: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current
      if (!canvas) {
        return
      }
      const rect = canvas.getBoundingClientRect()
      const pointerX = event.clientX - rect.left
      const pointerY = event.clientY - rect.top
      const metrics = getFieldMetrics(rect.width, rect.height)
      const hitNode = findNodeAtPoint(nodesRef.current, pointerX, pointerY, metrics)
      if (hitNode) {
        return
      }
      const normalized = pointToNormalized(pointerX, pointerY, metrics)
      addChordNode(normalized.x, normalized.y)
    },
    [addChordNode],
  )

  const selectedNode = useMemo(
    () => nodes.find((node) => node.id === selectedNodeId) ?? null,
    [nodes, selectedNodeId],
  )
  const selectedNodeChord = selectedNode ? getNodeChord(selectedNode) : null

  const moveSelectedNode = useCallback((direction: -1 | 1) => {
    setNodes((previousNodes) => {
      const selectedId = selectedNodeIdRef.current
      if (!selectedId) {
        return previousNodes
      }
      const fromIndex = previousNodes.findIndex((node) => node.id === selectedId)
      const toIndex = fromIndex + direction
      return moveNodeInArray(previousNodes, fromIndex, toIndex)
    })
  }, [])

  const clearAllNodes = useCallback(() => {
    setIsLoopPlaying(false)
    stopSequencerChord()
    setCurrentStep(-1)
    onPanic()
    playingNodeNotesRef.current.clear()
    sequenceNotesRef.current = []
    setLatchedNodeIds([])
    setNodes([])
    setSelectedNodeId(null)
  }, [onPanic, stopSequencerChord])

  const removeSelectedOrLast = useCallback(() => {
    setNodes((previousNodes) => {
      if (previousNodes.length === 0) {
        return previousNodes
      }
      const selectedId = selectedNodeIdRef.current
      const removeIndex =
        selectedId !== null
          ? previousNodes.findIndex((node) => node.id === selectedId)
          : previousNodes.length - 1
      const targetIndex = removeIndex >= 0 ? removeIndex : previousNodes.length - 1
      const removingNode = previousNodes[targetIndex]
      stopNodeNotes(removingNode.id)
      const nextNodes = previousNodes.filter((_, index) => index !== targetIndex)
      setSelectedNodeId(nextNodes.length > 0 ? nextNodes[Math.min(targetIndex, nextNodes.length - 1)].id : null)
      return nextNodes
    })
  }, [stopNodeNotes])

  useEffect(() => {
    if (holdEnabled) {
      return
    }
    for (const latchedNodeId of latchedNodeIdsRef.current) {
      stopNodeNotes(latchedNodeId)
    }
    setLatchedNodeIds([])
  }, [holdEnabled, stopNodeNotes])

  useEffect(
    () => () => {
      if (animationFrameRef.current !== 0) {
        window.cancelAnimationFrame(animationFrameRef.current)
      }
      stopSequencerChord()
      for (const notes of playingNodeNotesRef.current.values()) {
        releaseMidiNotes(notes)
      }
      playingNodeNotesRef.current.clear()
    },
    [releaseMidiNotes, stopSequencerChord],
  )

  const qualityGuide = useMemo(
    () =>
      QUALITY_BANDS.map((quality) => ({
        quality,
        color: QUALITY_COLORS[quality],
      })),
    [],
  )

  return (
    <section className="chord-field-panel">
      <header className="chord-field-header">
        <h3>CHORD FIELD</h3>
        <p>Drag to morph chords · tap to play · loop to sequence</p>
      </header>

      <div className="chord-field-controls">
        <button
          type="button"
          className={`cf-button ${isLoopPlaying ? 'is-active' : ''}`}
          onClick={() => setIsLoopPlaying((previous) => !previous)}
        >
          {isLoopPlaying ? 'STOP LOOP' : 'PLAY LOOP'}
        </button>
        <label className="cf-slider">
          <span>TEMPO {tempo} BPM</span>
          <input
            type="range"
            min={40}
            max={200}
            value={tempo}
            onChange={(event) => setTempo(Number(event.target.value))}
          />
        </label>
        <button type="button" className="cf-button" onClick={() => addChordNode()}>
          ADD CHORD
        </button>
        <button type="button" className="cf-button" onClick={removeSelectedOrLast}>
          REMOVE
        </button>
        <button type="button" className="cf-button" onClick={clearAllNodes}>
          CLEAR
        </button>
        <button
          type="button"
          className={`cf-button ${holdEnabled ? 'is-active' : ''}`}
          onClick={() => setHoldEnabled((previous) => !previous)}
        >
          HOLD
        </button>
        <button
          type="button"
          className={`cf-button ${scaleSnap ? 'is-active' : ''}`}
          onClick={() => setScaleSnap((previous) => !previous)}
        >
          SCALE SNAP
        </button>
        <button type="button" className="cf-button" onClick={() => moveSelectedNode(-1)} disabled={!selectedNode}>
          MOVE ◀
        </button>
        <button type="button" className="cf-button" onClick={() => moveSelectedNode(1)} disabled={!selectedNode}>
          MOVE ▶
        </button>
      </div>

      <div className="chord-field-canvas-wrap">
        <canvas
          ref={canvasRef}
          className="chord-field-canvas"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUpLike}
          onPointerCancel={handlePointerUpLike}
          onPointerLeave={handlePointerUpLike}
          onDoubleClick={handleDoubleClick}
        />
      </div>

      <footer className="chord-field-footer">
        <div className="chord-field-readout">
          <span>{isAudioReady ? 'AUDIO READY' : 'AUDIO SLEEPING'}</span>
          <span>
            {selectedNodeChord
              ? `SELECTED ${selectedNodeChord.name} [${selectedNode?.id ?? ''}]`
              : 'SELECT A NODE'}
          </span>
          <span>
            {nodes.length} CHORDS / ACTIVE {playingNodeNotesRef.current.size + (sequenceNotesRef.current.length > 0 ? 1 : 0)}
          </span>
        </div>
        <div className="chord-quality-guide">
          {qualityGuide.map((item) => (
            <span key={item.quality} style={{ '--chip': item.color } as CSSProperties}>
              {item.quality}
            </span>
          ))}
        </div>
      </footer>
    </section>
  )
}

export default ChordField
