import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import chassisImage from './assets/mod-desk-chassis.png'
import './App.css'
import {
  DEFAULT_PARAMETERS,
  DEFAULT_PATCH_CONNECTIONS,
  ModDeskSynthEngine,
  type EngineMode,
  type ModDeskJackId,
  type PatchConnection,
  type SynthParameters,
} from './synthEngine'

type JackDirection = 'in' | 'out'
type ModuleId = 'osc' | 'filter' | 'env' | 'lfo' | 'dist' | 'delay' | 'reverb' | 'master'
type Point = { x: number; y: number }
type Rect = { left: number; top: number; width: number; height: number }

type JackDefinition = {
  id: ModDeskJackId
  module: ModuleId
  direction: JackDirection
}

type NumericParamKey = {
  [K in keyof SynthParameters]: SynthParameters[K] extends number ? K : never
}[keyof SynthParameters]

type KnobSpec = {
  id: string
  label: string
  rect: Rect
  param: NumericParamKey
  min: number
  max: number
  step: number
  readout: (parameters: SynthParameters) => string
}

type EngineButtonSpec = {
  engine: EngineMode
  label: string
  rect: Rect
}

type FilterTypeButtonSpec = {
  type: BiquadFilterType
  rect: Rect
}

type HotKnobProps = {
  rect: Rect
  label: string
  value: number
  min: number
  max: number
  step: number
  readout: string
  onChange: (value: number) => void
}

const IMAGE_WIDTH = 1536
const IMAGE_HEIGHT = 1024

const pxRect = (x: number, y: number, width: number, height: number): Rect => ({
  left: (x / IMAGE_WIDTH) * 100,
  top: (y / IMAGE_HEIGHT) * 100,
  width: (width / IMAGE_WIDTH) * 100,
  height: (height / IMAGE_HEIGHT) * 100,
})

const styleFromRect = (rect: Rect): CSSProperties => ({
  left: `${rect.left}%`,
  top: `${rect.top}%`,
  width: `${rect.width}%`,
  height: `${rect.height}%`,
})

const JACKS: JackDefinition[] = [
  { id: 'osc.out', module: 'osc', direction: 'out' },
  { id: 'osc.pitchCv', module: 'osc', direction: 'in' },
  { id: 'filter.in', module: 'filter', direction: 'in' },
  { id: 'filter.out', module: 'filter', direction: 'out' },
  { id: 'filter.cutoffCv', module: 'filter', direction: 'in' },
  { id: 'env.out', module: 'env', direction: 'out' },
  { id: 'lfo.out', module: 'lfo', direction: 'out' },
  { id: 'dist.in', module: 'dist', direction: 'in' },
  { id: 'dist.out', module: 'dist', direction: 'out' },
  { id: 'delay.in', module: 'delay', direction: 'in' },
  { id: 'delay.out', module: 'delay', direction: 'out' },
  { id: 'reverb.in', module: 'reverb', direction: 'in' },
  { id: 'reverb.out', module: 'reverb', direction: 'out' },
  { id: 'master.in', module: 'master', direction: 'in' },
]

const JACK_LOOKUP = Object.fromEntries(JACKS.map((jackDefinition) => [jackDefinition.id, jackDefinition])) as Record<
  ModDeskJackId,
  JackDefinition
>

const JACK_LAYOUT: Record<ModDeskJackId, Rect> = {
  'osc.out': pxRect(373, 276, 28, 28),
  'osc.pitchCv': pxRect(373, 663, 28, 28),
  'filter.in': pxRect(406, 276, 28, 28),
  'filter.out': pxRect(751, 276, 28, 28),
  'filter.cutoffCv': pxRect(750, 664, 28, 28),
  'env.out': pxRect(1101, 276, 28, 28),
  'lfo.out': pxRect(774, 276, 28, 28),
  'dist.in': pxRect(1163, 874, 22, 22),
  'dist.out': pxRect(1198, 874, 22, 22),
  'delay.in': pxRect(1128, 276, 28, 28),
  'delay.out': pxRect(1476, 276, 28, 28),
  'reverb.in': pxRect(1286, 874, 22, 22),
  'reverb.out': pxRect(1321, 874, 22, 22),
  'master.in': pxRect(1383, 112, 20, 20),
}

const LCD_TOP_RECT = pxRect(1061, 82, 219, 60)
const LCD_OSC_RECT = pxRect(82, 288, 228, 62)
const LCD_FILTER_RECT = pxRect(486, 288, 208, 62)
const LCD_ENV_RECT = pxRect(844, 288, 220, 62)
const LCD_DELAY_RECT = pxRect(1196, 288, 212, 62)
const KEYBED_RECT = pxRect(424, 840, 659, 144)

const ENV_SLIDERS: Array<{ key: NumericParamKey; label: string; rect: Rect; min: number; max: number; step: number }> = [
  { key: 'attack', label: 'A', rect: pxRect(836, 390, 26, 132), min: 0.003, max: 1.8, step: 0.001 },
  { key: 'decay', label: 'D', rect: pxRect(911, 390, 26, 132), min: 0.01, max: 2.8, step: 0.001 },
  { key: 'sustain', label: 'S', rect: pxRect(986, 390, 26, 132), min: 0, max: 1, step: 0.01 },
  { key: 'release', label: 'R', rect: pxRect(1061, 390, 26, 132), min: 0.02, max: 3.6, step: 0.001 },
]

const KNOBS: KnobSpec[] = [
  {
    id: 'master',
    label: 'MASTER',
    rect: pxRect(1344, 74, 72, 72),
    param: 'masterVolume',
    min: 0,
    max: 1,
    step: 0.01,
    readout: (parameters) => `${Math.round(parameters.masterVolume * 100)}%`,
  },
  {
    id: 'osc-detune',
    label: 'DETUNE',
    rect: pxRect(91, 375, 92, 92),
    param: 'detuneCents',
    min: -40,
    max: 40,
    step: 0.5,
    readout: (parameters) => `${parameters.detuneCents.toFixed(1)}c`,
  },
  {
    id: 'osc-mix',
    label: 'MIX',
    rect: pxRect(247, 417, 70, 70),
    param: 'mix',
    min: 0,
    max: 1,
    step: 0.01,
    readout: (parameters) => `${Math.round(parameters.mix * 100)}%`,
  },
  {
    id: 'osc-lfo-depth',
    label: 'LFO DEPTH',
    rect: pxRect(56, 554, 70, 70),
    param: 'lfoDepth',
    min: 0,
    max: 1,
    step: 0.01,
    readout: (parameters) => `${Math.round(parameters.lfoDepth * 100)}%`,
  },
  {
    id: 'osc-reverb-mix',
    label: 'REVERB MIX',
    rect: pxRect(169, 554, 70, 70),
    param: 'reverbMix',
    min: 0,
    max: 1,
    step: 0.01,
    readout: (parameters) => `${Math.round(parameters.reverbMix * 100)}%`,
  },
  {
    id: 'osc-dist-mix',
    label: 'DIST MIX',
    rect: pxRect(277, 554, 70, 70),
    param: 'distMix',
    min: 0,
    max: 1,
    step: 0.01,
    readout: (parameters) => `${Math.round(parameters.distMix * 100)}%`,
  },
  {
    id: 'filter-cutoff',
    label: 'CUTOFF',
    rect: pxRect(485, 374, 94, 94),
    param: 'filterCutoff',
    min: 80,
    max: 12000,
    step: 1,
    readout: (parameters) =>
      parameters.filterCutoff >= 1000
        ? `${(parameters.filterCutoff / 1000).toFixed(1)}kHz`
        : `${Math.round(parameters.filterCutoff)}Hz`,
  },
  {
    id: 'filter-res',
    label: 'RES',
    rect: pxRect(639, 417, 70, 70),
    param: 'resonance',
    min: 0.2,
    max: 20,
    step: 0.1,
    readout: (parameters) => parameters.resonance.toFixed(1),
  },
  {
    id: 'filter-drive',
    label: 'DRIVE',
    rect: pxRect(450, 554, 70, 70),
    param: 'distDrive',
    min: 1,
    max: 32,
    step: 0.1,
    readout: (parameters) => parameters.distDrive.toFixed(1),
  },
  {
    id: 'filter-delay-mix',
    label: 'DLY MIX',
    rect: pxRect(550, 554, 70, 70),
    param: 'delayMix',
    min: 0,
    max: 1,
    step: 0.01,
    readout: (parameters) => `${Math.round(parameters.delayMix * 100)}%`,
  },
  {
    id: 'filter-reverb-decay',
    label: 'REV DEC',
    rect: pxRect(650, 554, 70, 70),
    param: 'reverbDecay',
    min: 0.4,
    max: 6.5,
    step: 0.05,
    readout: (parameters) => `${parameters.reverbDecay.toFixed(1)}s`,
  },
  {
    id: 'delay-time',
    label: 'TIME',
    rect: pxRect(1188, 374, 96, 96),
    param: 'delayTime',
    min: 0.02,
    max: 0.9,
    step: 0.001,
    readout: (parameters) => `${Math.round(parameters.delayTime * 1000)}ms`,
  },
  {
    id: 'delay-feedback',
    label: 'FEEDBACK',
    rect: pxRect(1348, 374, 96, 96),
    param: 'delayFeedback',
    min: 0,
    max: 0.92,
    step: 0.01,
    readout: (parameters) => `${Math.round(parameters.delayFeedback * 100)}%`,
  },
  {
    id: 'delay-mix',
    label: 'MIX',
    rect: pxRect(1188, 554, 72, 72),
    param: 'delayMix',
    min: 0,
    max: 1,
    step: 0.01,
    readout: (parameters) => `${Math.round(parameters.delayMix * 100)}%`,
  },
  {
    id: 'delay-tone',
    label: 'REVERB',
    rect: pxRect(1319, 554, 72, 72),
    param: 'reverbDecay',
    min: 0.4,
    max: 6.5,
    step: 0.05,
    readout: (parameters) => `${parameters.reverbDecay.toFixed(1)}s`,
  },
  {
    id: 'delay-mod',
    label: 'LFO RATE',
    rect: pxRect(1423, 554, 72, 72),
    param: 'lfoRate',
    min: 0.05,
    max: 14,
    step: 0.01,
    readout: (parameters) => `${parameters.lfoRate.toFixed(1)}Hz`,
  },
  {
    id: 'macro-cutoff',
    label: 'MACRO CUTOFF',
    rect: pxRect(1140, 883, 72, 72),
    param: 'filterCutoff',
    min: 80,
    max: 12000,
    step: 1,
    readout: (parameters) => `${Math.round(parameters.filterCutoff)}Hz`,
  },
  {
    id: 'macro-delay',
    label: 'MACRO DELAY',
    rect: pxRect(1233, 883, 72, 72),
    param: 'delayMix',
    min: 0,
    max: 1,
    step: 0.01,
    readout: (parameters) => `${Math.round(parameters.delayMix * 100)}%`,
  },
  {
    id: 'macro-reverb',
    label: 'MACRO REV',
    rect: pxRect(1325, 883, 72, 72),
    param: 'reverbMix',
    min: 0,
    max: 1,
    step: 0.01,
    readout: (parameters) => `${Math.round(parameters.reverbMix * 100)}%`,
  },
  {
    id: 'macro-lfo',
    label: 'MACRO LFO',
    rect: pxRect(1418, 883, 72, 72),
    param: 'lfoDepth',
    min: 0,
    max: 1,
    step: 0.01,
    readout: (parameters) => `${Math.round(parameters.lfoDepth * 100)}%`,
  },
  {
    id: 'scale',
    label: 'SCALE',
    rect: pxRect(217, 860, 72, 72),
    param: 'mix',
    min: 0,
    max: 1,
    step: 0.01,
    readout: (parameters) => `${Math.round(parameters.mix * 100)}%`,
  },
  {
    id: 'glide',
    label: 'GLIDE',
    rect: pxRect(305, 860, 72, 72),
    param: 'release',
    min: 0.02,
    max: 3.6,
    step: 0.001,
    readout: (parameters) => `${Math.round(parameters.release * 1000)}ms`,
  },
]

const ENGINE_BUTTONS: EngineButtonSpec[] = [
  { engine: 'analog', label: 'ANLG', rect: pxRect(64, 663, 76, 52) },
  { engine: 'fmBell', label: 'FM', rect: pxRect(157, 663, 76, 52) },
  { engine: 'noise', label: 'NOISE', rect: pxRect(249, 663, 76, 52) },
  { engine: 'pluck', label: 'PLUCK', rect: pxRect(340, 663, 76, 52) },
  { engine: 'bass', label: 'BASS', rect: pxRect(470, 663, 76, 52) },
  { engine: 'pad', label: 'PAD', rect: pxRect(562, 663, 76, 52) },
  { engine: 'perc', label: 'PERC', rect: pxRect(654, 663, 76, 52) },
  { engine: 'choir', label: 'CHOIR', rect: pxRect(1009, 658, 64, 62) },
]

const FILTER_TYPE_BUTTONS: FilterTypeButtonSpec[] = [
  { type: 'lowpass', rect: pxRect(477, 323, 52, 20) },
  { type: 'bandpass', rect: pxRect(531, 323, 52, 20) },
  { type: 'highpass', rect: pxRect(585, 323, 52, 20) },
  { type: 'notch', rect: pxRect(639, 323, 52, 20) },
]

const TRANSPORT_BUTTONS = {
  power: pxRect(652, 95, 40, 40),
  panic: pxRect(746, 95, 40, 40),
  factoryPatch: pxRect(841, 95, 40, 40),
  clearPatch: pxRect(934, 95, 40, 40),
  hold: pxRect(1045, 864, 40, 38),
  arp: pxRect(1045, 926, 40, 38),
}

const ALLOWED_CONNECTIONS: Array<[ModDeskJackId, ModDeskJackId]> = [
  ['osc.out', 'filter.in'],
  ['osc.out', 'dist.in'],
  ['osc.out', 'delay.in'],
  ['osc.out', 'master.in'],
  ['filter.out', 'dist.in'],
  ['filter.out', 'delay.in'],
  ['filter.out', 'reverb.in'],
  ['filter.out', 'master.in'],
  ['dist.out', 'delay.in'],
  ['dist.out', 'reverb.in'],
  ['dist.out', 'master.in'],
  ['delay.out', 'reverb.in'],
  ['delay.out', 'master.in'],
  ['reverb.out', 'master.in'],
  ['env.out', 'filter.cutoffCv'],
  ['env.out', 'osc.pitchCv'],
  ['lfo.out', 'filter.cutoffCv'],
  ['lfo.out', 'osc.pitchCv'],
]

const MODULE_COLORS: Record<ModuleId, string> = {
  osc: '#ff8e36',
  filter: '#39bbb6',
  env: '#f5c93f',
  lfo: '#72ba67',
  dist: '#c79cff',
  delay: '#de5c4f',
  reverb: '#6f9bd8',
  master: '#d9d6cf',
}

const WHITE_NOTES = [48, 50, 52, 53, 55, 57, 59, 60, 62, 64, 65, 67, 69, 71]
const BLACK_OFFSETS = new Set([1, 3, 6, 8, 10])

const KEYBOARD_NOTE_MAP: Record<string, number> = {
  z: 48,
  s: 49,
  x: 50,
  d: 51,
  c: 52,
  v: 53,
  g: 54,
  b: 55,
  h: 56,
  n: 57,
  j: 58,
  m: 59,
  ',': 60,
  l: 61,
  '.': 62,
  ';': 63,
  '/': 64,
  q: 60,
  '2': 61,
  w: 62,
  '3': 63,
  e: 64,
  r: 65,
  '5': 66,
  t: 67,
  '6': 68,
  y: 69,
  '7': 70,
  u: 71,
}

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value))

const buildCablePath = (from: Point, to: Point): string => {
  const curve = Math.max(36, Math.abs(to.x - from.x) * 0.45)
  return `M ${from.x} ${from.y} C ${from.x + curve} ${from.y}, ${to.x - curve} ${to.y}, ${to.x} ${to.y}`
}

function HotKnob({ rect, label, value, min, max, step, readout, onChange }: HotKnobProps) {
  const dragState = useRef<{ startY: number; startValue: number; pointerId: number } | null>(null)
  const angle = -130 + ((value - min) / (max - min)) * 260

  const onPointerDown = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      dragState.current = {
        startY: event.clientY,
        startValue: value,
        pointerId: event.pointerId,
      }
      event.currentTarget.setPointerCapture(event.pointerId)
    },
    [value],
  )

  const onPointerMove = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      if (!dragState.current || dragState.current.pointerId !== event.pointerId) {
        return
      }
      const range = max - min
      const delta = ((dragState.current.startY - event.clientY) / 140) * range
      onChange(clamp(dragState.current.startValue + delta, min, max))
    },
    [max, min, onChange],
  )

  const clearDrag = useCallback((event: React.PointerEvent<HTMLButtonElement>) => {
    if (dragState.current && dragState.current.pointerId === event.pointerId) {
      dragState.current = null
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }, [])

  return (
    <button
      type="button"
      className="hot-knob"
      style={styleFromRect(rect)}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={clearDrag}
      onPointerCancel={clearDrag}
      onPointerLeave={clearDrag}
      aria-label={`${label} knob`}
      data-readout={readout}
      data-step={step}
    >
      <span className="hot-knob-ring" />
      <span className="hot-knob-needle" style={{ transform: `rotate(${angle}deg)` }} />
      <span className="hot-label">{label}</span>
      <span className="hot-value">{readout}</span>
    </button>
  )
}

function App() {
  const synthRef = useRef<ModDeskSynthEngine | null>(null)
  const chassisRef = useRef<HTMLDivElement | null>(null)
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const jackRefs = useRef<Partial<Record<ModDeskJackId, HTMLButtonElement | null>>>({})
  const activeComputerKeysRef = useRef(new Set<string>())
  const activeNotesRef = useRef(new Set<number>())

  const [isAudioReady, setIsAudioReady] = useState(false)
  const [holdEnabled, setHoldEnabled] = useState(false)
  const [arpEnabled, setArpEnabled] = useState(false)
  const [params, setParams] = useState<SynthParameters>({ ...DEFAULT_PARAMETERS })
  const [connections, setConnections] = useState<PatchConnection[]>([...DEFAULT_PATCH_CONNECTIONS])
  const [selectedOutputJack, setSelectedOutputJack] = useState<ModDeskJackId | null>(null)
  const [patchStatus, setPatchStatus] = useState('Tap a source jack, then a destination jack.')
  const [activeNotes, setActiveNotes] = useState<number[]>([])
  const [jackPoints, setJackPoints] = useState<Partial<Record<ModDeskJackId, Point>>>({})
  const [ghostPoint, setGhostPoint] = useState<Point | null>(null)

  const allowedConnections = useMemo(
    () => new Set(ALLOWED_CONNECTIONS.map(([from, to]) => `${from}>${to}`)),
    [],
  )

  useEffect(() => {
    const synth = new ModDeskSynthEngine()
    synthRef.current = synth
    synth.updateParameters(params)
    synth.setPatchConnections(connections)

    return () => {
      synth.dispose()
      synthRef.current = null
    }
  }, [])

  useEffect(() => {
    synthRef.current?.updateParameters(params)
  }, [params])

  useEffect(() => {
    synthRef.current?.setPatchConnections(connections)
  }, [connections])

  useEffect(() => {
    activeNotesRef.current = new Set(activeNotes)
  }, [activeNotes])

  const ensureAudioStarted = useCallback(async () => {
    const synth = synthRef.current
    if (!synth) {
      return
    }
    await synth.start()
    setIsAudioReady(synth.isReady())
  }, [])

  const updateParameter = useCallback(
    <K extends keyof SynthParameters>(key: K, value: SynthParameters[K]) => {
      setParams((previousParameters) => ({ ...previousParameters, [key]: value }))
    },
    [],
  )

  const setNumericParameter = useCallback(
    (key: NumericParamKey, value: number) => {
      setParams((previousParameters) => ({ ...previousParameters, [key]: value }))
    },
    [],
  )

  const playNote = useCallback(
    async (note: number) => {
      if (!isAudioReady) {
        await ensureAudioStarted()
      }
      synthRef.current?.noteOn(note)
      setActiveNotes((currentNotes) => (currentNotes.includes(note) ? currentNotes : [...currentNotes, note]))
    },
    [ensureAudioStarted, isAudioReady],
  )

  const releaseNote = useCallback((note: number) => {
    synthRef.current?.noteOff(note)
    setActiveNotes((currentNotes) => currentNotes.filter((activeNote) => activeNote !== note))
  }, [])

  const toggleHeldNote = useCallback(
    async (note: number) => {
      if (activeNotesRef.current.has(note)) {
        releaseNote(note)
        return
      }
      await playNote(note)
    },
    [playNote, releaseNote],
  )

  const handleNotePress = useCallback(
    (note: number) => {
      if (holdEnabled) {
        void toggleHeldNote(note)
      } else {
        void playNote(note)
      }
    },
    [holdEnabled, playNote, toggleHeldNote],
  )

  const handleNoteRelease = useCallback(
    (note: number) => {
      if (!holdEnabled) {
        releaseNote(note)
      }
    },
    [holdEnabled, releaseNote],
  )

  const panic = useCallback(() => {
    synthRef.current?.allNotesOff()
    activeComputerKeysRef.current.clear()
    setActiveNotes([])
  }, [])

  const registerJackRef = useCallback((jackId: ModDeskJackId, node: HTMLButtonElement | null) => {
    jackRefs.current[jackId] = node
  }, [])

  const measureJackPoints = useCallback(() => {
    if (!chassisRef.current) {
      return
    }
    const chassisRect = chassisRef.current.getBoundingClientRect()
    const nextPoints: Partial<Record<ModDeskJackId, Point>> = {}
    for (const jack of JACKS) {
      const node = jackRefs.current[jack.id]
      if (!node) {
        continue
      }
      const rect = node.getBoundingClientRect()
      nextPoints[jack.id] = {
        x: rect.left - chassisRect.left + rect.width * 0.5,
        y: rect.top - chassisRect.top + rect.height * 0.5,
      }
    }
    setJackPoints(nextPoints)
  }, [])

  useEffect(() => {
    const frame = window.requestAnimationFrame(measureJackPoints)
    const onResize = () => measureJackPoints()
    const onScroll = () => measureJackPoints()
    const resizeObserver = new ResizeObserver(() => measureJackPoints())

    if (chassisRef.current) {
      resizeObserver.observe(chassisRef.current)
    }

    window.addEventListener('resize', onResize)
    scrollRef.current?.addEventListener('scroll', onScroll, { passive: true })

    return () => {
      window.cancelAnimationFrame(frame)
      resizeObserver.disconnect()
      window.removeEventListener('resize', onResize)
      scrollRef.current?.removeEventListener('scroll', onScroll)
    }
  }, [measureJackPoints])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (
        target &&
        ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName.toUpperCase()) &&
        !target.classList.contains('env-slider')
      ) {
        return
      }

      const key = event.key.toLowerCase()
      const mappedNote = KEYBOARD_NOTE_MAP[key]
      if (mappedNote === undefined || activeComputerKeysRef.current.has(key)) {
        return
      }

      activeComputerKeysRef.current.add(key)
      event.preventDefault()
      if (holdEnabled) {
        void toggleHeldNote(mappedNote)
      } else {
        void playNote(mappedNote)
      }
    }

    const onKeyUp = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase()
      const mappedNote = KEYBOARD_NOTE_MAP[key]
      if (mappedNote === undefined) {
        return
      }
      activeComputerKeysRef.current.delete(key)
      if (!holdEnabled) {
        releaseNote(mappedNote)
      }
    }

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    }
  }, [holdEnabled, playNote, releaseNote, toggleHeldNote])

  const connectJacks = useCallback(
    (from: ModDeskJackId, to: ModDeskJackId) => {
      if (!allowedConnections.has(`${from}>${to}`)) {
        setPatchStatus(`Blocked: ${from} cannot connect to ${to}.`)
        return
      }
      setConnections((previousConnections) => {
        const alreadyPatched = previousConnections.some(
          (connection) => connection.from === from && connection.to === to,
        )
        if (alreadyPatched) {
          setPatchStatus(`Cable removed ${from} -> ${to}`)
          return previousConnections.filter(
            (connection) => !(connection.from === from && connection.to === to),
          )
        }
        const withoutDestination = previousConnections.filter((connection) => connection.to !== to)
        setPatchStatus(`Patched ${from} -> ${to}`)
        return [...withoutDestination, { from, to }]
      })
    },
    [allowedConnections],
  )

  const disconnectCable = useCallback((connectionToRemove: PatchConnection) => {
    setConnections((previousConnections) =>
      previousConnections.filter(
        (connection) =>
          !(connection.from === connectionToRemove.from && connection.to === connectionToRemove.to),
      ),
    )
    setPatchStatus(`Cable removed ${connectionToRemove.from} -> ${connectionToRemove.to}`)
  }, [])

  const connectedJacks = useMemo(() => {
    const connected = new Set<ModDeskJackId>()
    for (const connection of connections) {
      connected.add(connection.from)
      connected.add(connection.to)
    }
    return connected
  }, [connections])

  const cables = useMemo(
    () =>
      connections
        .map((connection) => {
          const fromPoint = jackPoints[connection.from]
          const toPoint = jackPoints[connection.to]
          if (!fromPoint || !toPoint) {
            return null
          }
          return {
            ...connection,
            path: buildCablePath(fromPoint, toPoint),
            color: MODULE_COLORS[JACK_LOOKUP[connection.from].module],
          }
        })
        .filter((cable): cable is PatchConnection & { path: string; color: string } => cable !== null),
    [connections, jackPoints],
  )

  const onJackClick = useCallback(
    (jack: JackDefinition) => {
      if (!selectedOutputJack) {
        if (jack.direction === 'out') {
          setSelectedOutputJack(jack.id)
          setPatchStatus(`Source selected: ${jack.id}`)
        } else {
          setPatchStatus('Select an OUT jack first.')
        }
        return
      }

      if (selectedOutputJack === jack.id) {
        setSelectedOutputJack(null)
        setGhostPoint(null)
        setPatchStatus('Patch selection cleared.')
        return
      }

      if (jack.direction === 'in') {
        connectJacks(selectedOutputJack, jack.id)
        setSelectedOutputJack(null)
        setGhostPoint(null)
        return
      }

      setSelectedOutputJack(jack.id)
      setPatchStatus(`Source selected: ${jack.id}`)
    },
    [connectJacks, selectedOutputJack],
  )

  const onChassisPointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!selectedOutputJack || !chassisRef.current) {
        return
      }
      const rect = chassisRef.current.getBoundingClientRect()
      setGhostPoint({
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
      })
    },
    [selectedOutputJack],
  )

  const ghostCablePath = useMemo(() => {
    if (!selectedOutputJack || !ghostPoint) {
      return null
    }
    const fromPoint = jackPoints[selectedOutputJack]
    if (!fromPoint) {
      return null
    }
    return buildCablePath(fromPoint, ghostPoint)
  }, [ghostPoint, jackPoints, selectedOutputJack])

  const keyboardLegend = useMemo(() => {
    const legend = new Map<number, string>()
    for (const [key, note] of Object.entries(KEYBOARD_NOTE_MAP)) {
      if (!legend.has(note)) {
        legend.set(note, key.toUpperCase())
      }
    }
    return legend
  }, [])

  const activeNoteSet = useMemo(() => new Set(activeNotes), [activeNotes])

  const blackKeys = useMemo(
    () =>
      WHITE_NOTES.map((note, index) => {
        const blackNote = note + 1
        if (!BLACK_OFFSETS.has(blackNote % 12)) {
          return null
        }
        return { note: blackNote, index }
      }).filter((item): item is { note: number; index: number } => item !== null),
    [],
  )

  const topDisplay = useMemo(() => {
    const holdText = holdEnabled ? ' HOLD' : ''
    const arpText = arpEnabled ? ' ARP' : ''
    return `${params.engine.toUpperCase()}${holdText}${arpText}`
  }, [arpEnabled, holdEnabled, params.engine])

  return (
    <main className="mod-desk-root">
      <div className="desk-scroll" ref={scrollRef}>
        <div className="desk-stage">
          <div
            className="chassis"
            ref={chassisRef}
            onPointerDownCapture={() => {
              if (!isAudioReady) {
                void ensureAudioStarted()
              }
            }}
            onPointerMove={onChassisPointerMove}
            onPointerLeave={() => setGhostPoint(null)}
          >
            <img src={chassisImage} className="chassis-image" alt="Mod Desk chassis" draggable={false} />

            <svg className="cable-overlay" aria-hidden="true">
              {cables.map((cable) => (
                <g key={`${cable.from}->${cable.to}`}>
                  <path className="cable-hit" d={cable.path} onClick={() => disconnectCable(cable)} />
                  <path className="cable cable-main" style={{ stroke: cable.color }} d={cable.path} />
                  <path className="cable cable-glow" style={{ stroke: cable.color }} d={cable.path} />
                </g>
              ))}
              {ghostCablePath ? <path className="cable cable-ghost" d={ghostCablePath} /> : null}
            </svg>

            <div className="lcd-readout top" style={styleFromRect(LCD_TOP_RECT)}>
              <span>{topDisplay}</span>
              <span>
                {isAudioReady ? 'AUDIO ON' : 'POWER OFF'} / {activeNotes.length} VOICES
              </span>
            </div>

            <div className="lcd-readout osc" style={styleFromRect(LCD_OSC_RECT)}>
              <span>ENGINE {params.engine.toUpperCase()}</span>
              <span>DETUNE {params.detuneCents.toFixed(1)} / MIX {Math.round(params.mix * 100)}%</span>
            </div>
            <div className="lcd-readout filter" style={styleFromRect(LCD_FILTER_RECT)}>
              <span>{params.filterType.toUpperCase()}</span>
              <span>
                CUTOFF {Math.round(params.filterCutoff)} / RES {params.resonance.toFixed(1)}
              </span>
            </div>
            <div className="lcd-readout env" style={styleFromRect(LCD_ENV_RECT)}>
              <span>ENV A D S R</span>
              <span>
                {Math.round(params.attack * 1000)} {Math.round(params.decay * 1000)} {Math.round(params.sustain * 100)}{' '}
                {Math.round(params.release * 1000)}
              </span>
            </div>
            <div className="lcd-readout delay" style={styleFromRect(LCD_DELAY_RECT)}>
              <span>TIME {Math.round(params.delayTime * 1000)} / FEEDBACK {Math.round(params.delayFeedback * 100)}</span>
              <span>MIX {Math.round(params.delayMix * 100)} / LFO {params.lfoRate.toFixed(1)}Hz</span>
            </div>

            {KNOBS.map((knob) => (
              <HotKnob
                key={knob.id}
                rect={knob.rect}
                label={knob.label}
                value={params[knob.param] as number}
                min={knob.min}
                max={knob.max}
                step={knob.step}
                readout={knob.readout(params)}
                onChange={(value) => setNumericParameter(knob.param, value)}
              />
            ))}

            {ENV_SLIDERS.map((slider) => (
              <label
                key={slider.key}
                className="env-slider-wrap"
                style={styleFromRect(slider.rect)}
                title={`${slider.label} envelope`}
              >
                <input
                  type="range"
                  className="env-slider"
                  min={slider.min}
                  max={slider.max}
                  step={slider.step}
                  value={params[slider.key] as number}
                  onChange={(event) => setNumericParameter(slider.key, Number(event.target.value))}
                />
              </label>
            ))}

            {ENGINE_BUTTONS.map((engineButton) => (
              <button
                key={engineButton.engine}
                type="button"
                className={`hot-button engine ${params.engine === engineButton.engine ? 'is-active' : ''}`}
                style={styleFromRect(engineButton.rect)}
                onClick={() => updateParameter('engine', engineButton.engine)}
                aria-label={`Select ${engineButton.label} engine`}
              >
                {engineButton.label}
              </button>
            ))}

            {FILTER_TYPE_BUTTONS.map((filterButton) => (
              <button
                key={filterButton.type}
                type="button"
                className={`hot-button tiny ${params.filterType === filterButton.type ? 'is-active' : ''}`}
                style={styleFromRect(filterButton.rect)}
                onClick={() => updateParameter('filterType', filterButton.type)}
                aria-label={`Set filter type ${filterButton.type}`}
              />
            ))}

            <button
              type="button"
              className={`hot-button transport ${isAudioReady ? 'is-active' : ''}`}
              style={styleFromRect(TRANSPORT_BUTTONS.power)}
              onClick={() => void ensureAudioStarted()}
              aria-label="Power on audio context"
            />
            <button
              type="button"
              className="hot-button transport"
              style={styleFromRect(TRANSPORT_BUTTONS.panic)}
              onClick={panic}
              aria-label="Panic all notes off"
            />
            <button
              type="button"
              className="hot-button transport"
              style={styleFromRect(TRANSPORT_BUTTONS.factoryPatch)}
              onClick={() => {
                setConnections([...DEFAULT_PATCH_CONNECTIONS])
                setSelectedOutputJack(null)
                setPatchStatus('Factory patch restored.')
              }}
              aria-label="Restore factory patch"
            />
            <button
              type="button"
              className="hot-button transport"
              style={styleFromRect(TRANSPORT_BUTTONS.clearPatch)}
              onClick={() => {
                setConnections([])
                setSelectedOutputJack(null)
                setPatchStatus('Patch cleared.')
              }}
              aria-label="Clear all cables"
            />
            <button
              type="button"
              className={`hot-button transport ${holdEnabled ? 'is-active' : ''}`}
              style={styleFromRect(TRANSPORT_BUTTONS.hold)}
              onClick={() => {
                setHoldEnabled((previousHold) => {
                  const nextHold = !previousHold
                  if (!nextHold) {
                    panic()
                  }
                  return nextHold
                })
              }}
              aria-label="Toggle hold"
            />
            <button
              type="button"
              className={`hot-button transport ${arpEnabled ? 'is-active' : ''}`}
              style={styleFromRect(TRANSPORT_BUTTONS.arp)}
              onClick={() => setArpEnabled((previousArp) => !previousArp)}
              aria-label="Toggle arp (visual mode)"
            />

            {JACKS.map((jack) => (
              <button
                key={jack.id}
                type="button"
                ref={(node) => registerJackRef(jack.id, node)}
                className={`jack-hotspot ${jack.direction} ${
                  selectedOutputJack === jack.id ? 'is-selected' : ''
                } ${connectedJacks.has(jack.id) ? 'is-connected' : ''}`}
                style={styleFromRect(JACK_LAYOUT[jack.id])}
                onClick={() => onJackClick(jack)}
                aria-label={`${jack.id} patch jack`}
              />
            ))}

            <div className="keybed-overlay" style={styleFromRect(KEYBED_RECT)}>
              {WHITE_NOTES.map((note, index) => (
                <button
                  key={`w-${note}`}
                  type="button"
                  className={`key white ${activeNoteSet.has(note) ? 'is-active' : ''}`}
                  style={{
                    left: `${(index / WHITE_NOTES.length) * 100}%`,
                    width: `${100 / WHITE_NOTES.length}%`,
                  }}
                  onPointerDown={() => handleNotePress(note)}
                  onPointerUp={() => handleNoteRelease(note)}
                  onPointerLeave={() => handleNoteRelease(note)}
                  aria-label={`White key ${note}`}
                >
                  {keyboardLegend.get(note) ?? ''}
                </button>
              ))}
              {blackKeys.map((blackKey) => (
                <button
                  key={`b-${blackKey.note}`}
                  type="button"
                  className={`key black ${activeNoteSet.has(blackKey.note) ? 'is-active' : ''}`}
                  style={{
                    left: `${((blackKey.index + 1) / WHITE_NOTES.length) * 100 - 1.95}%`,
                    width: '3.9%',
                  }}
                  onPointerDown={() => handleNotePress(blackKey.note)}
                  onPointerUp={() => handleNoteRelease(blackKey.note)}
                  onPointerLeave={() => handleNoteRelease(blackKey.note)}
                  aria-label={`Black key ${blackKey.note}`}
                >
                  {keyboardLegend.get(blackKey.note) ?? ''}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <footer className="status-strip">
        <span>{patchStatus}</span>
        <span>Keyboard: Z-M + Q-U</span>
      </footer>
    </main>
  )
}

export default App
