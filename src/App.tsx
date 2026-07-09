import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import chassisImage from './assets/mod-desk-chassis.png'
import './App.css'
import ChordField from './ChordField'
import {
  DEFAULT_PARAMETERS,
  DEFAULT_PATCH_CONNECTIONS,
  ModDeskSynthEngine,
  type EngineMode,
  type SynthParameters,
} from './synthEngine'

type Rect = { left: number; top: number; width: number; height: number }

type HotKnobConfig = {
  id: string
  label: string
  rect: Rect
  value: number
  min: number
  max: number
  step: number
  readout: string
  onChange: (value: number) => void
}

type HotKnobProps = HotKnobConfig & { defaultValue: number }

const IMAGE_WIDTH = 1536
const IMAGE_HEIGHT = 1024
const WHITE_KEY_START_X = 417
const WHITE_KEY_WIDTH = 590
const BLACK_KEY_WIDTH = 26
const KNOB_SWEEP_START = -135
const KNOB_SWEEP_END = 135
const KNOB_SWEEP_SPAN = KNOB_SWEEP_END - KNOB_SWEEP_START

const ENGINE_ORDER: EngineMode[] = ['analog', 'fmBell', 'noise', 'pluck', 'bass', 'pad', 'perc', 'choir']
const FILTER_TYPES: BiquadFilterType[] = ['lowpass', 'bandpass', 'highpass', 'notch']

const WHITE_KEY_NOTES = [53, 55, 57, 59, 60, 62, 64, 65, 67, 69, 71, 72, 74, 76]
const BLACK_KEYS = [
  { note: 54, centerX: 470 },
  { note: 56, centerX: 514 },
  { note: 58, centerX: 559 },
  { note: 61, centerX: 627 },
  { note: 63, centerX: 671 },
  { note: 66, centerX: 742 },
  { note: 68, centerX: 784 },
  { note: 70, centerX: 828 },
  { note: 73, centerX: 898 },
  { note: 75, centerX: 940 },
]

const KEYBOARD_NOTE_MAP: Record<string, number> = {
  z: 53,
  s: 54,
  x: 55,
  d: 56,
  c: 57,
  f: 58,
  v: 59,
  b: 60,
  h: 61,
  n: 62,
  j: 63,
  m: 64,
  ',': 65,
  l: 66,
  '.': 67,
  ';': 68,
  '/': 69,
  q: 65,
  '2': 66,
  w: 67,
  '3': 68,
  e: 69,
  r: 70,
  '5': 71,
  t: 72,
  '6': 73,
  y: 74,
  '7': 75,
  u: 76,
}

const pxRect = (x: number, y: number, width: number, height: number): Rect => ({
  left: (x / IMAGE_WIDTH) * 100,
  top: (y / IMAGE_HEIGHT) * 100,
  width: (width / IMAGE_WIDTH) * 100,
  height: (height / IMAGE_HEIGHT) * 100,
})

const centerRect = (centerX: number, centerY: number, size: number): Rect =>
  pxRect(centerX - size / 2, centerY - size / 2, size, size)

const styleFromRect = (rect: Rect): CSSProperties => ({
  left: `${rect.left}%`,
  top: `${rect.top}%`,
  width: `${rect.width}%`,
  height: `${rect.height}%`,
})

const RECTS = {
  topLcd: pxRect(1049, 93, 223, 72),
  oscLcd: pxRect(95, 286, 229, 71),
  filterLcd: pxRect(475, 285, 218, 72),
  envLcd: pxRect(837, 285, 213, 75),
  delayLcd: pxRect(1185, 284, 228, 86),
  keybed: pxRect(417, 800, 590, 175),
  transportPlay: centerRect(670, 125, 44),
  transportStop: centerRect(764, 125, 44),
  transportRandom: centerRect(860, 125, 44),
  transportSave: centerRect(954, 125, 44),
  hold: pxRect(1038, 842, 30, 29),
  arp: pxRect(1038, 921, 30, 28),
  oscFrequency: pxRect(105, 395, 96, 106),
  oscFine: pxRect(268, 427, 54, 63),
  oscPulseWidth: pxRect(83, 556, 52, 60),
  oscSub: pxRect(195, 556, 51, 60),
  oscLevel: pxRect(299, 556, 52, 60),
  oscWaveButton: pxRect(81, 649, 55, 48),
  oscSyncButton: pxRect(159, 648, 53, 49),
  oscOctDownButton: pxRect(231, 649, 53, 48),
  oscOctUpButton: pxRect(302, 649, 52, 48),
  filterCutoff: pxRect(477, 395, 96, 114),
  filterResonance: pxRect(642, 426, 55, 71),
  filterDrive: pxRect(464, 556, 51, 64),
  filterEnvAmt: pxRect(561, 556, 51, 64),
  filterEnvTrack: pxRect(660, 556, 51, 65),
  filterTypeButton: pxRect(463, 648, 59, 49),
  filterSlopeButton: pxRect(553, 648, 61, 49),
  filterCurveButton: pxRect(645, 648, 60, 49),
  envAttackSlider: pxRect(813, 392, 36, 140),
  envDecaySlider: pxRect(887, 392, 36, 140),
  envSustainSlider: pxRect(961, 392, 36, 140),
  envReleaseSlider: pxRect(1034, 392, 36, 140),
  envVelocity: pxRect(832, 591, 49, 53),
  envLoopButton: pxRect(717, 667, 82, 41),
  delayTime: pxRect(1186, 410, 82, 97),
  delayFeedback: pxRect(1341, 410, 80, 94),
  delayMix: pxRect(1169, 556, 51, 63),
  delayTone: pxRect(1273, 556, 52, 64),
  delayMod: pxRect(1379, 556, 51, 64),
  delaySyncButton: pxRect(1174, 648, 60, 49),
  delayPingPongButton: pxRect(1268, 649, 63, 48),
  delayDuckButton: pxRect(1365, 649, 61, 48),
  scaleKnob: pxRect(241, 857, 47, 50),
  glideKnob: pxRect(329, 857, 47, 49),
  macro1: pxRect(1142, 875, 49, 53),
  macro2: pxRect(1234, 875, 50, 53),
  macro3: pxRect(1327, 876, 49, 52),
  macro4: pxRect(1419, 876, 49, 52),
  masterKnob: pxRect(1322, 99, 63, 63),
}

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value))

const quantize = (value: number, min: number, step: number): number =>
  Math.round((value - min) / step) * step + min

const randomBetween = (min: number, max: number): number => min + Math.random() * (max - min)

const formatMilliseconds = (seconds: number): string => `${Math.round(seconds * 1000)}ms`

const formatPercent = (value: number): string => `${Math.round(value * 100)}%`

const formatCutoff = (value: number): string =>
  value >= 1000 ? `${(value / 1000).toFixed(2)}kHz` : `${Math.round(value)}Hz`

const KNOB_DEFAULT_VALUES: Record<string, number> = {
  master: DEFAULT_PARAMETERS.masterVolume,
  'osc-freq': DEFAULT_PARAMETERS.detuneCents,
  'osc-fine': DEFAULT_PARAMETERS.mix,
  'osc-pw': DEFAULT_PARAMETERS.lfoDepth,
  'osc-sub': DEFAULT_PARAMETERS.distMix,
  'osc-level': DEFAULT_PARAMETERS.reverbMix,
  'filter-cutoff': DEFAULT_PARAMETERS.filterCutoff,
  'filter-res': DEFAULT_PARAMETERS.resonance,
  'filter-drive': DEFAULT_PARAMETERS.distDrive,
  'filter-env': DEFAULT_PARAMETERS.delayMix,
  'filter-track': DEFAULT_PARAMETERS.lfoRate,
  'env-velocity': 0.9,
  'delay-time': DEFAULT_PARAMETERS.delayTime,
  'delay-feedback': DEFAULT_PARAMETERS.delayFeedback,
  'delay-mix': DEFAULT_PARAMETERS.delayMix,
  'delay-tone': DEFAULT_PARAMETERS.reverbDecay,
  'delay-mod': DEFAULT_PARAMETERS.lfoDepth,
  scale: DEFAULT_PARAMETERS.mix,
  glide: DEFAULT_PARAMETERS.release,
  'macro-1': DEFAULT_PARAMETERS.filterCutoff,
  'macro-2': DEFAULT_PARAMETERS.delayMix,
  'macro-3': DEFAULT_PARAMETERS.reverbMix,
  'macro-4': DEFAULT_PARAMETERS.lfoRate,
}

const valueToKnobAngle = (value: number, min: number, max: number): number => {
  const t = clamp((value - min) / (max - min), 0, 1)
  return KNOB_SWEEP_START + t * KNOB_SWEEP_SPAN
}

const pointerToKnobAngle = (pointerX: number, pointerY: number, centerX: number, centerY: number): number => {
  let angle = (Math.atan2(pointerY - centerY, pointerX - centerX) * 180) / Math.PI + 90
  if (angle > 180) {
    angle -= 360
  }
  return clamp(angle, KNOB_SWEEP_START, KNOB_SWEEP_END)
}

function HotKnob({ rect, label, value, min, max, step, readout, onChange, defaultValue }: HotKnobProps) {
  const [isDragging, setIsDragging] = useState(false)
  const dragState = useRef<{
    startY: number
    startValue: number
    centerX: number
    centerY: number
    pointerId: number
  } | null>(null)

  const displayAngle = valueToKnobAngle(value, min, max)

  const onPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      const rectBounds = event.currentTarget.getBoundingClientRect()
      dragState.current = {
        startY: event.clientY,
        startValue: value,
        centerX: rectBounds.left + rectBounds.width * 0.5,
        centerY: rectBounds.top + rectBounds.height * 0.5,
        pointerId: event.pointerId,
      }
      setIsDragging(true)
      event.currentTarget.setPointerCapture(event.pointerId)
    },
    [value],
  )

  const onPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      if (!dragState.current || dragState.current.pointerId !== event.pointerId) {
        return
      }

      const angle = pointerToKnobAngle(
        event.clientX,
        event.clientY,
        dragState.current.centerX,
        dragState.current.centerY,
      )
      const angularT = (angle - KNOB_SWEEP_START) / KNOB_SWEEP_SPAN
      const angularValue = min + angularT * (max - min)
      const range = max - min
      const verticalDelta = ((dragState.current.startY - event.clientY) / 220) * range * 0.18
      const nextValue = clamp(quantize(angularValue + verticalDelta, min, step), min, max)
      onChange(nextValue)
    },
    [max, min, onChange, step],
  )

  const endDrag = useCallback((event: ReactPointerEvent<HTMLButtonElement>) => {
    if (dragState.current && dragState.current.pointerId === event.pointerId) {
      dragState.current = null
      setIsDragging(false)
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }, [])

  return (
    <button
      type="button"
      className={`hot-knob ${isDragging ? 'is-dragging' : ''}`}
      style={styleFromRect(rect)}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onPointerLeave={endDrag}
      onDoubleClick={() => onChange(clamp(defaultValue, min, max))}
      aria-label={`${label} knob`}
    >
      <span className="hot-knob-face" style={{ transform: `rotate(${displayAngle}deg)` }}>
        <span className="hot-knob-tick" />
      </span>
      <span className="hot-knob-ring" />
      <span className="hot-knob-tooltip">
        {label} {readout}
      </span>
    </button>
  )
}

function App() {
  const synthRef = useRef<ModDeskSynthEngine | null>(null)
  const activeComputerKeysRef = useRef(new Set<string>())
  const noteBindingRef = useRef(new Map<number, number>())
  const activeNotesRef = useRef(new Set<number>())

  const [params, setParams] = useState<SynthParameters>({ ...DEFAULT_PARAMETERS })
  const [engineInstance, setEngineInstance] = useState<ModDeskSynthEngine | null>(null)
  const [isAudioReady, setIsAudioReady] = useState(false)
  const [statusText, setStatusText] = useState('Click PLAY to start audio.')
  const [holdEnabled, setHoldEnabled] = useState(false)
  const [arpEnabled, setArpEnabled] = useState(false)
  const [syncEnabled, setSyncEnabled] = useState(false)
  const [loopEnabled, setLoopEnabled] = useState(false)
  const [delaySyncEnabled, setDelaySyncEnabled] = useState(false)
  const [delayPingPongEnabled, setDelayPingPongEnabled] = useState(false)
  const [delayDuckEnabled, setDelayDuckEnabled] = useState(false)
  const [slope24Enabled, setSlope24Enabled] = useState(true)
  const [curveEnabled, setCurveEnabled] = useState(false)
  const [octaveShift, setOctaveShift] = useState(0)
  const [velocityAmount, setVelocityAmount] = useState(0.9)
  const [activeNotes, setActiveNotes] = useState<number[]>([])

  useEffect(() => {
    activeNotesRef.current = new Set(activeNotes)
  }, [activeNotes])

  useEffect(() => {
    const synth = new ModDeskSynthEngine()
    synthRef.current = synth
    setEngineInstance(synth)
    synth.updateParameters(params)
    synth.setPatchConnections(DEFAULT_PATCH_CONNECTIONS)
    return () => {
      synth.dispose()
      synthRef.current = null
      setEngineInstance(null)
    }
  }, [])

  useEffect(() => {
    synthRef.current?.updateParameters(params)
  }, [params])

  const ensureAudioStarted = useCallback(async () => {
    const synth = synthRef.current
    if (!synth) {
      return
    }
    await synth.start()
    setIsAudioReady(synth.isReady())
  }, [])

  const setParameter = useCallback(
    <K extends keyof SynthParameters>(key: K, value: SynthParameters[K]) => {
      setParams((previous) => ({ ...previous, [key]: value }))
    },
    [],
  )

  const playSynthNote = useCallback(
    async (note: number) => {
      if (!isAudioReady) {
        await ensureAudioStarted()
      }
      synthRef.current?.noteOn(note, velocityAmount)
      setActiveNotes((previous) => (previous.includes(note) ? previous : [...previous, note]))
    },
    [ensureAudioStarted, isAudioReady, velocityAmount],
  )

  const releaseSynthNote = useCallback((note: number) => {
    synthRef.current?.noteOff(note)
    setActiveNotes((previous) => previous.filter((activeNote) => activeNote !== note))
  }, [])

  const mapToPlayedNote = useCallback((baseNote: number) => baseNote + octaveShift * 12, [octaveShift])

  const playBaseNote = useCallback(
    async (baseNote: number) => {
      const playedNote = mapToPlayedNote(baseNote)
      noteBindingRef.current.set(baseNote, playedNote)
      await playSynthNote(playedNote)
    },
    [mapToPlayedNote, playSynthNote],
  )

  const releaseBaseNote = useCallback(
    (baseNote: number) => {
      const playedNote = noteBindingRef.current.get(baseNote) ?? mapToPlayedNote(baseNote)
      noteBindingRef.current.delete(baseNote)
      releaseSynthNote(playedNote)
    },
    [mapToPlayedNote, releaseSynthNote],
  )

  const toggleHeldBaseNote = useCallback(
    async (baseNote: number) => {
      const existing = noteBindingRef.current.get(baseNote)
      if (existing !== undefined && activeNotesRef.current.has(existing)) {
        noteBindingRef.current.delete(baseNote)
        releaseSynthNote(existing)
        return
      }

      const playedNote = mapToPlayedNote(baseNote)
      noteBindingRef.current.set(baseNote, playedNote)
      await playSynthNote(playedNote)
    },
    [mapToPlayedNote, playSynthNote, releaseSynthNote],
  )

  const panic = useCallback(() => {
    synthRef.current?.allNotesOff()
    setActiveNotes([])
    activeComputerKeysRef.current.clear()
    noteBindingRef.current.clear()
    setStatusText('All notes off.')
  }, [])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName.toUpperCase())) {
        return
      }
      const key = event.key.toLowerCase()
      const baseNote = KEYBOARD_NOTE_MAP[key]
      if (baseNote === undefined || activeComputerKeysRef.current.has(key)) {
        return
      }
      activeComputerKeysRef.current.add(key)
      event.preventDefault()
      if (holdEnabled) {
        void toggleHeldBaseNote(baseNote)
      } else {
        void playBaseNote(baseNote)
      }
    }

    const onKeyUp = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase()
      const baseNote = KEYBOARD_NOTE_MAP[key]
      if (baseNote === undefined) {
        return
      }
      activeComputerKeysRef.current.delete(key)
      if (!holdEnabled) {
        releaseBaseNote(baseNote)
      }
    }

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    }
  }, [holdEnabled, playBaseNote, releaseBaseNote, toggleHeldBaseNote])

  const cycleEngine = useCallback(() => {
    setParams((previous) => {
      const currentIndex = ENGINE_ORDER.indexOf(previous.engine)
      const nextEngine = ENGINE_ORDER[(currentIndex + 1) % ENGINE_ORDER.length]
      return { ...previous, engine: nextEngine }
    })
    setStatusText('Engine cycled.')
  }, [])

  const randomizeTone = useCallback(() => {
    const randomEngine = ENGINE_ORDER[Math.floor(Math.random() * ENGINE_ORDER.length)]
    const randomFilterType = FILTER_TYPES[Math.floor(Math.random() * FILTER_TYPES.length)]
    const randomized: SynthParameters = {
      ...DEFAULT_PARAMETERS,
      engine: randomEngine,
      filterType: randomFilterType,
      masterVolume: randomBetween(0.5, 0.95),
      detuneCents: randomBetween(-180, 180),
      mix: randomBetween(0.1, 0.95),
      filterCutoff: randomBetween(220, 6400),
      resonance: randomBetween(1, 14),
      attack: randomBetween(0.005, 0.4),
      decay: randomBetween(0.08, 1.2),
      sustain: randomBetween(0.25, 0.95),
      release: randomBetween(0.08, 2.2),
      delayTime: randomBetween(0.06, 0.66),
      delayFeedback: randomBetween(0.05, 0.8),
      delayMix: randomBetween(0.1, 0.8),
      lfoRate: randomBetween(0.2, 9),
      lfoDepth: randomBetween(0.05, 0.8),
      reverbMix: randomBetween(0.05, 0.8),
      reverbDecay: randomBetween(0.8, 5.2),
      distDrive: randomBetween(2, 18),
      distMix: randomBetween(0.02, 0.5),
    }
    setParams(randomized)
    synthRef.current?.setPatchConnections(DEFAULT_PATCH_CONNECTIONS)
    setStatusText('Randomized tone on factory routing.')
  }, [])

  const resetTone = useCallback(() => {
    setParams({ ...DEFAULT_PARAMETERS })
    setOctaveShift(0)
    setSyncEnabled(false)
    setLoopEnabled(false)
    setSlope24Enabled(true)
    setCurveEnabled(false)
    setDelaySyncEnabled(false)
    setDelayPingPongEnabled(false)
    setDelayDuckEnabled(false)
    setVelocityAmount(0.9)
    synthRef.current?.setPatchConnections(DEFAULT_PATCH_CONNECTIONS)
    setStatusText('Parameters reset to factory defaults.')
  }, [])

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

  const knobs = useMemo<HotKnobConfig[]>(
    () => [
      {
        id: 'master',
        label: 'VOL',
        rect: RECTS.masterKnob,
        value: params.masterVolume,
        min: 0,
        max: 1,
        step: 0.01,
        readout: formatPercent(params.masterVolume),
        onChange: (value) => setParameter('masterVolume', value),
      },
      {
        id: 'osc-freq',
        label: 'FREQ',
        rect: RECTS.oscFrequency,
        value: params.detuneCents,
        min: -600,
        max: 600,
        step: 1,
        readout: `${Math.round(params.detuneCents)}c`,
        onChange: (value) => setParameter('detuneCents', value),
      },
      {
        id: 'osc-fine',
        label: 'FINE',
        rect: RECTS.oscFine,
        value: params.mix,
        min: 0,
        max: 1,
        step: 0.01,
        readout: formatPercent(params.mix),
        onChange: (value) => setParameter('mix', value),
      },
      {
        id: 'osc-pw',
        label: 'PW',
        rect: RECTS.oscPulseWidth,
        value: params.lfoDepth,
        min: 0,
        max: 1,
        step: 0.01,
        readout: formatPercent(params.lfoDepth),
        onChange: (value) => setParameter('lfoDepth', value),
      },
      {
        id: 'osc-sub',
        label: 'SUB',
        rect: RECTS.oscSub,
        value: params.distMix,
        min: 0,
        max: 1,
        step: 0.01,
        readout: formatPercent(params.distMix),
        onChange: (value) => setParameter('distMix', value),
      },
      {
        id: 'osc-level',
        label: 'LEVEL',
        rect: RECTS.oscLevel,
        value: params.reverbMix,
        min: 0,
        max: 1,
        step: 0.01,
        readout: formatPercent(params.reverbMix),
        onChange: (value) => setParameter('reverbMix', value),
      },
      {
        id: 'filter-cutoff',
        label: 'CUTOFF',
        rect: RECTS.filterCutoff,
        value: params.filterCutoff,
        min: 80,
        max: 12000,
        step: 1,
        readout: formatCutoff(params.filterCutoff),
        onChange: (value) => setParameter('filterCutoff', value),
      },
      {
        id: 'filter-res',
        label: 'RES',
        rect: RECTS.filterResonance,
        value: params.resonance,
        min: 0.2,
        max: 20,
        step: 0.1,
        readout: params.resonance.toFixed(1),
        onChange: (value) => setParameter('resonance', value),
      },
      {
        id: 'filter-drive',
        label: 'DRIVE',
        rect: RECTS.filterDrive,
        value: params.distDrive,
        min: 1,
        max: 32,
        step: 0.1,
        readout: params.distDrive.toFixed(1),
        onChange: (value) => setParameter('distDrive', value),
      },
      {
        id: 'filter-env',
        label: 'ENV',
        rect: RECTS.filterEnvAmt,
        value: params.delayMix,
        min: 0,
        max: 1,
        step: 0.01,
        readout: formatPercent(params.delayMix),
        onChange: (value) => setParameter('delayMix', value),
      },
      {
        id: 'filter-track',
        label: 'TRACK',
        rect: RECTS.filterEnvTrack,
        value: params.lfoRate,
        min: 0.05,
        max: 14,
        step: 0.01,
        readout: `${params.lfoRate.toFixed(1)}Hz`,
        onChange: (value) => setParameter('lfoRate', value),
      },
      {
        id: 'env-velocity',
        label: 'VEL',
        rect: RECTS.envVelocity,
        value: velocityAmount,
        min: 0.1,
        max: 1,
        step: 0.01,
        readout: formatPercent(velocityAmount),
        onChange: (value) => setVelocityAmount(value),
      },
      {
        id: 'delay-time',
        label: 'TIME',
        rect: RECTS.delayTime,
        value: params.delayTime,
        min: 0.02,
        max: 0.9,
        step: 0.001,
        readout: formatMilliseconds(params.delayTime),
        onChange: (value) => setParameter('delayTime', value),
      },
      {
        id: 'delay-feedback',
        label: 'FDBK',
        rect: RECTS.delayFeedback,
        value: params.delayFeedback,
        min: 0,
        max: 0.92,
        step: 0.01,
        readout: formatPercent(params.delayFeedback),
        onChange: (value) => setParameter('delayFeedback', value),
      },
      {
        id: 'delay-mix',
        label: 'MIX',
        rect: RECTS.delayMix,
        value: params.delayMix,
        min: 0,
        max: 1,
        step: 0.01,
        readout: formatPercent(params.delayMix),
        onChange: (value) => setParameter('delayMix', value),
      },
      {
        id: 'delay-tone',
        label: 'TONE',
        rect: RECTS.delayTone,
        value: params.reverbDecay,
        min: 0.4,
        max: 6.5,
        step: 0.05,
        readout: `${params.reverbDecay.toFixed(1)}s`,
        onChange: (value) => setParameter('reverbDecay', value),
      },
      {
        id: 'delay-mod',
        label: 'MOD',
        rect: RECTS.delayMod,
        value: params.lfoDepth,
        min: 0,
        max: 1,
        step: 0.01,
        readout: formatPercent(params.lfoDepth),
        onChange: (value) => setParameter('lfoDepth', value),
      },
      {
        id: 'scale',
        label: 'SCALE',
        rect: RECTS.scaleKnob,
        value: params.mix,
        min: 0,
        max: 1,
        step: 0.01,
        readout: formatPercent(params.mix),
        onChange: (value) => setParameter('mix', value),
      },
      {
        id: 'glide',
        label: 'GLIDE',
        rect: RECTS.glideKnob,
        value: params.release,
        min: 0.02,
        max: 3.6,
        step: 0.001,
        readout: formatMilliseconds(params.release),
        onChange: (value) => setParameter('release', value),
      },
      {
        id: 'macro-1',
        label: 'M1',
        rect: RECTS.macro1,
        value: params.filterCutoff,
        min: 80,
        max: 12000,
        step: 1,
        readout: formatCutoff(params.filterCutoff),
        onChange: (value) => setParameter('filterCutoff', value),
      },
      {
        id: 'macro-2',
        label: 'M2',
        rect: RECTS.macro2,
        value: params.delayMix,
        min: 0,
        max: 1,
        step: 0.01,
        readout: formatPercent(params.delayMix),
        onChange: (value) => setParameter('delayMix', value),
      },
      {
        id: 'macro-3',
        label: 'M3',
        rect: RECTS.macro3,
        value: params.reverbMix,
        min: 0,
        max: 1,
        step: 0.01,
        readout: formatPercent(params.reverbMix),
        onChange: (value) => setParameter('reverbMix', value),
      },
      {
        id: 'macro-4',
        label: 'M4',
        rect: RECTS.macro4,
        value: params.lfoRate,
        min: 0.05,
        max: 14,
        step: 0.01,
        readout: `${params.lfoRate.toFixed(1)}Hz`,
        onChange: (value) => setParameter('lfoRate', value),
      },
    ],
    [params, setParameter, velocityAmount],
  )

  const faderHandleTop = useCallback((value: number, min: number, max: number): string => {
    const t = clamp((value - min) / (max - min), 0, 1)
    return `${t * 82}%`
  }, [])

  const topDisplayLineOne = `${params.engine.toUpperCase()} ${syncEnabled ? 'SYNC' : 'FREE'} ${
    delaySyncEnabled ? 'D-SYNC' : ''
  }`
  const topDisplayLineTwo = `${isAudioReady ? 'AUDIO ON' : 'POWER OFF'} / OCT ${octaveShift >= 0 ? '+' : ''}${octaveShift}`

  return (
    <main className="mod-desk-root">
      <div className="desk-scroll">
        <div className="desk-stage">
          <div
            className="chassis"
            onPointerDownCapture={() => {
              if (!isAudioReady) {
                void ensureAudioStarted()
              }
            }}
          >
            <img src={chassisImage} className="chassis-image" alt="Mod Desk chassis" draggable={false} />

            <div className="lcd-readout top" style={styleFromRect(RECTS.topLcd)}>
              <span>{topDisplayLineOne}</span>
              <span>{topDisplayLineTwo}</span>
            </div>
            <div className="lcd-readout osc" style={styleFromRect(RECTS.oscLcd)}>
              <span>ENGINE {params.engine.toUpperCase()}</span>
              <span>
                OCT {octaveShift >= 0 ? '+' : ''}
                {octaveShift} / DETUNE {Math.round(params.detuneCents)}c
              </span>
            </div>
            <div className="lcd-readout filter" style={styleFromRect(RECTS.filterLcd)}>
              <span>{params.filterType.toUpperCase()} / {slope24Enabled ? '24dB' : '12dB'}</span>
              <span>CUTOFF {formatCutoff(params.filterCutoff)} RES {params.resonance.toFixed(1)}</span>
            </div>
            <div className="lcd-readout env" style={styleFromRect(RECTS.envLcd)}>
              <span>
                A {formatMilliseconds(params.attack)} D {formatMilliseconds(params.decay)}
              </span>
              <span>
                S {formatPercent(params.sustain)} R {formatMilliseconds(params.release)} {loopEnabled ? 'LOOP' : ''}
              </span>
            </div>
            <div className="lcd-readout delay" style={styleFromRect(RECTS.delayLcd)}>
              <span>
                TIME {formatMilliseconds(params.delayTime)} FB {formatPercent(params.delayFeedback)}
              </span>
              <span>
                MIX {formatPercent(params.delayMix)} {delayPingPongEnabled ? 'PING' : ''} {delayDuckEnabled ? 'DUCK' : ''}
              </span>
            </div>

            {knobs.map((knob) => (
              <HotKnob key={knob.id} {...knob} defaultValue={KNOB_DEFAULT_VALUES[knob.id] ?? knob.value} />
            ))}

            <label className="env-slider-wrap" style={styleFromRect(RECTS.envAttackSlider)}>
              <input
                className="env-slider"
                type="range"
                min={0.003}
                max={1.8}
                step={0.001}
                value={params.attack}
                onChange={(event) => setParameter('attack', Number(event.target.value))}
                aria-label="Attack fader"
              />
              <span
                className="env-fader-handle"
                style={{ top: faderHandleTop(params.attack, 0.003, 1.8) }}
                aria-hidden
              />
            </label>
            <label className="env-slider-wrap" style={styleFromRect(RECTS.envDecaySlider)}>
              <input
                className="env-slider"
                type="range"
                min={0.01}
                max={2.8}
                step={0.001}
                value={params.decay}
                onChange={(event) => setParameter('decay', Number(event.target.value))}
                aria-label="Decay fader"
              />
              <span
                className="env-fader-handle"
                style={{ top: faderHandleTop(params.decay, 0.01, 2.8) }}
                aria-hidden
              />
            </label>
            <label className="env-slider-wrap" style={styleFromRect(RECTS.envSustainSlider)}>
              <input
                className="env-slider"
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={params.sustain}
                onChange={(event) => setParameter('sustain', Number(event.target.value))}
                aria-label="Sustain fader"
              />
              <span
                className="env-fader-handle"
                style={{ top: faderHandleTop(params.sustain, 0, 1) }}
                aria-hidden
              />
            </label>
            <label className="env-slider-wrap" style={styleFromRect(RECTS.envReleaseSlider)}>
              <input
                className="env-slider"
                type="range"
                min={0.02}
                max={3.6}
                step={0.001}
                value={params.release}
                onChange={(event) => setParameter('release', Number(event.target.value))}
                aria-label="Release fader"
              />
              <span
                className="env-fader-handle"
                style={{ top: faderHandleTop(params.release, 0.02, 3.6) }}
                aria-hidden
              />
            </label>

            <button
              type="button"
              className={`hot-button transport ${isAudioReady ? 'is-active' : ''}`}
              style={styleFromRect(RECTS.transportPlay)}
              onClick={() => {
                void ensureAudioStarted()
                setStatusText('Audio resumed.')
              }}
              aria-label="Play / power"
            />
            <button
              type="button"
              className="hot-button transport"
              style={styleFromRect(RECTS.transportStop)}
              onClick={panic}
              aria-label="Stop / panic"
            />
            <button
              type="button"
              className="hot-button transport"
              style={styleFromRect(RECTS.transportRandom)}
              onClick={randomizeTone}
              aria-label="Randomize tone on factory route"
            />
            <button
              type="button"
              className="hot-button transport"
              style={styleFromRect(RECTS.transportSave)}
              onClick={resetTone}
              aria-label="Reset tone settings"
            />

            <button
              type="button"
              className="hot-button module-button"
              style={styleFromRect(RECTS.oscWaveButton)}
              onClick={cycleEngine}
              aria-label="Cycle oscillator engine"
            />
            <button
              type="button"
              className={`hot-button module-button ${syncEnabled ? 'is-active' : ''}`}
              style={styleFromRect(RECTS.oscSyncButton)}
              onClick={() => setSyncEnabled((previous) => !previous)}
              aria-label="Oscillator sync toggle"
            />
            <button
              type="button"
              className="hot-button module-button"
              style={styleFromRect(RECTS.oscOctDownButton)}
              onClick={() => {
                setOctaveShift((previous) => clamp(previous - 1, -2, 2))
                setStatusText('Octave shifted down.')
              }}
              aria-label="Octave down"
            />
            <button
              type="button"
              className="hot-button module-button"
              style={styleFromRect(RECTS.oscOctUpButton)}
              onClick={() => {
                setOctaveShift((previous) => clamp(previous + 1, -2, 2))
                setStatusText('Octave shifted up.')
              }}
              aria-label="Octave up"
            />

            <button
              type="button"
              className="hot-button module-button"
              style={styleFromRect(RECTS.filterTypeButton)}
              onClick={() =>
                setParameter(
                  'filterType',
                  FILTER_TYPES[(FILTER_TYPES.indexOf(params.filterType) + 1) % FILTER_TYPES.length],
                )
              }
              aria-label="Cycle filter type"
            />
            <button
              type="button"
              className={`hot-button module-button ${slope24Enabled ? 'is-active' : ''}`}
              style={styleFromRect(RECTS.filterSlopeButton)}
              onClick={() => setSlope24Enabled((previous) => !previous)}
              aria-label="Toggle filter slope"
            />
            <button
              type="button"
              className={`hot-button module-button ${curveEnabled ? 'is-active' : ''}`}
              style={styleFromRect(RECTS.filterCurveButton)}
              onClick={() => setCurveEnabled((previous) => !previous)}
              aria-label="Toggle filter curve"
            />

            <button
              type="button"
              className={`hot-button module-button ${loopEnabled ? 'is-active' : ''}`}
              style={styleFromRect(RECTS.envLoopButton)}
              onClick={() => setLoopEnabled((previous) => !previous)}
              aria-label="Envelope loop toggle"
            />

            <button
              type="button"
              className={`hot-button module-button ${delaySyncEnabled ? 'is-active' : ''}`}
              style={styleFromRect(RECTS.delaySyncButton)}
              onClick={() => setDelaySyncEnabled((previous) => !previous)}
              aria-label="Delay sync toggle"
            />
            <button
              type="button"
              className={`hot-button module-button ${delayPingPongEnabled ? 'is-active' : ''}`}
              style={styleFromRect(RECTS.delayPingPongButton)}
              onClick={() => setDelayPingPongEnabled((previous) => !previous)}
              aria-label="Delay ping pong toggle"
            />
            <button
              type="button"
              className={`hot-button module-button ${delayDuckEnabled ? 'is-active' : ''}`}
              style={styleFromRect(RECTS.delayDuckButton)}
              onClick={() => setDelayDuckEnabled((previous) => !previous)}
              aria-label="Delay duck toggle"
            />

            <button
              type="button"
              className={`hot-button module-button ${holdEnabled ? 'is-active' : ''}`}
              style={styleFromRect(RECTS.hold)}
              onClick={() => {
                setHoldEnabled((previous) => {
                  const next = !previous
                  if (!next) {
                    panic()
                  }
                  return next
                })
              }}
              aria-label="Hold toggle"
            />
            <button
              type="button"
              className={`hot-button module-button ${arpEnabled ? 'is-active' : ''}`}
              style={styleFromRect(RECTS.arp)}
              onClick={() => setArpEnabled((previous) => !previous)}
              aria-label="Arp toggle"
            />

            <div className="keybed-overlay" style={styleFromRect(RECTS.keybed)}>
              {WHITE_KEY_NOTES.map((baseNote, index) => (
                <button
                  key={`white-${baseNote}`}
                  type="button"
                  className={`key white ${activeNoteSet.has(baseNote + octaveShift * 12) ? 'is-active' : ''}`}
                  style={{
                    left: `${(index / WHITE_KEY_NOTES.length) * 100}%`,
                    width: `${100 / WHITE_KEY_NOTES.length}%`,
                  }}
                  onPointerDown={() => {
                    if (holdEnabled) {
                      void toggleHeldBaseNote(baseNote)
                    } else {
                      void playBaseNote(baseNote)
                    }
                  }}
                  onPointerUp={() => {
                    if (!holdEnabled) {
                      releaseBaseNote(baseNote)
                    }
                  }}
                  onPointerLeave={() => {
                    if (!holdEnabled) {
                      releaseBaseNote(baseNote)
                    }
                  }}
                  aria-label={`White key ${baseNote}`}
                >
                  {keyboardLegend.get(baseNote) ?? ''}
                </button>
              ))}
              {BLACK_KEYS.map((blackKey) => {
                const widthPercent = (BLACK_KEY_WIDTH / WHITE_KEY_WIDTH) * 100
                const centerPercent = ((blackKey.centerX - WHITE_KEY_START_X) / WHITE_KEY_WIDTH) * 100
                return (
                  <button
                    key={`black-${blackKey.note}`}
                    type="button"
                    className={`key black ${activeNoteSet.has(blackKey.note + octaveShift * 12) ? 'is-active' : ''}`}
                    style={{
                      left: `${centerPercent - widthPercent * 0.5}%`,
                      width: `${widthPercent}%`,
                    }}
                    onPointerDown={() => {
                      if (holdEnabled) {
                        void toggleHeldBaseNote(blackKey.note)
                      } else {
                        void playBaseNote(blackKey.note)
                      }
                    }}
                    onPointerUp={() => {
                      if (!holdEnabled) {
                        releaseBaseNote(blackKey.note)
                      }
                    }}
                    onPointerLeave={() => {
                      if (!holdEnabled) {
                        releaseBaseNote(blackKey.note)
                      }
                    }}
                    aria-label={`Black key ${blackKey.note}`}
                  >
                    {keyboardLegend.get(blackKey.note) ?? ''}
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      </div>

      <ChordField
        engine={engineInstance}
        isAudioReady={isAudioReady}
        ensureAudioStarted={ensureAudioStarted}
        onPanic={panic}
      />

      <footer className="status-strip">
        <span>{statusText}</span>
        <span>Route: OSC → FILTER → DIST → DELAY → REVERB → MASTER</span>
      </footer>
    </main>
  )
}

export default App
