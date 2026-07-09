import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import './App.css'
import ChordField from './ChordField'
import {
  DEFAULT_PARAMETERS,
  DEFAULT_PATCH_CONNECTIONS,
  ModDeskSynthEngine,
  type EngineMode,
  type SynthParameters,
} from './synthEngine'

type KnobConfig = {
  id: string
  label: string
  value: number
  min: number
  max: number
  step: number
  readout: string
  size?: 'lg' | 'md' | 'sm'
  onChange: (value: number) => void
}

type KnobProps = KnobConfig & { defaultValue: number }

const KNOB_SWEEP_START = -135
const KNOB_SWEEP_END = 135
const KNOB_SWEEP_SPAN = KNOB_SWEEP_END - KNOB_SWEEP_START

const ENGINE_ORDER: EngineMode[] = ['analog', 'fmBell', 'noise', 'pluck', 'bass', 'pad', 'perc', 'choir']
const FILTER_TYPES: BiquadFilterType[] = ['lowpass', 'bandpass', 'highpass', 'notch']

const WHITE_KEY_NOTES = [53, 55, 57, 59, 60, 62, 64, 65, 67, 69, 71, 72, 74, 76]
const BLACK_KEY_SLOTS: Array<{ note: number; afterWhiteIndex: number }> = [
  { note: 54, afterWhiteIndex: 0 },
  { note: 56, afterWhiteIndex: 1 },
  { note: 58, afterWhiteIndex: 2 },
  { note: 61, afterWhiteIndex: 4 },
  { note: 63, afterWhiteIndex: 5 },
  { note: 66, afterWhiteIndex: 7 },
  { note: 68, afterWhiteIndex: 8 },
  { note: 70, afterWhiteIndex: 9 },
  { note: 73, afterWhiteIndex: 11 },
  { note: 75, afterWhiteIndex: 12 },
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

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value))

const quantize = (value: number, min: number, step: number): number =>
  Math.round((value - min) / step) * step + min

const randomBetween = (min: number, max: number): number => min + Math.random() * (max - min)

const formatMilliseconds = (seconds: number): string => `${Math.round(seconds * 1000)}ms`

const formatPercent = (value: number): string => `${Math.round(value * 100)}%`

const formatCutoff = (value: number): string =>
  value >= 1000 ? `${(value / 1000).toFixed(2)}kHz` : `${Math.round(value)}Hz`

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

function DeskKnob({
  id,
  label,
  value,
  min,
  max,
  step,
  readout,
  onChange,
  defaultValue,
  size = 'md',
}: KnobProps) {
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
    <div className={`desk-knob-wrap size-${size}`}>
      <button
        type="button"
        className={`desk-knob ${isDragging ? 'is-dragging' : ''}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onDoubleClick={() => onChange(clamp(defaultValue, min, max))}
        aria-label={`${label} knob`}
        data-knob-id={id}
      >
        <span className="desk-knob-body" style={{ transform: `rotate(${displayAngle}deg)` }}>
          <span className="desk-knob-tick" />
          <span className="desk-knob-cap" />
        </span>
        <span className="desk-knob-shadow" aria-hidden />
      </button>
      <span className="desk-knob-label">{label}</span>
      <span className="desk-knob-value">{readout}</span>
    </div>
  )
}

function EnvFader({
  label,
  value,
  min,
  max,
  step,
  onChange,
  ariaLabel,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  onChange: (value: number) => void
  ariaLabel: string
}) {
  const t = clamp((value - min) / (max - min), 0, 1)
  const handleTop = `${(1 - t) * 78 + 4}%`

  return (
    <label className="env-fader">
      <span className="env-fader-track">
        <span className="env-fader-fill" style={{ height: `${t * 100}%` }} />
        <span className="env-fader-handle" style={{ top: handleTop }} aria-hidden />
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(event) => onChange(Number(event.target.value))}
          aria-label={ariaLabel}
        />
      </span>
      <span className="env-fader-label">{label}</span>
    </label>
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
  const [statusText, setStatusText] = useState('Press PLAY to wake the desk.')
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

  const renderKnob = (config: KnobConfig) => (
    <DeskKnob key={config.id} {...config} defaultValue={KNOB_DEFAULT_VALUES[config.id] ?? config.value} />
  )

  const whiteKeyWidth = 100 / WHITE_KEY_NOTES.length

  return (
    <main className="mod-desk-root">
      <section
        className="desk"
        onPointerDownCapture={() => {
          if (!isAudioReady) {
            void ensureAudioStarted()
          }
        }}
      >
        <div className="desk-grain" aria-hidden />
        <div className="desk-bevel" aria-hidden />

        <header className="desk-header">
          <div className="brand-block">
            <p className="brand-mark">MOD DESK</p>
            <p className="brand-sub">modular workbench · factory route</p>
          </div>

          <div className="transport">
            <button
              type="button"
              className={`transport-btn play ${isAudioReady ? 'is-active' : ''}`}
              onClick={() => {
                void ensureAudioStarted()
                setStatusText('Audio resumed.')
              }}
              aria-label="Play / power"
            >
              <span className="transport-icon play-icon" />
              PLAY
            </button>
            <button type="button" className="transport-btn stop" onClick={panic} aria-label="Stop / panic">
              <span className="transport-icon stop-icon" />
              STOP
            </button>
            <button
              type="button"
              className="transport-btn random"
              onClick={randomizeTone}
              aria-label="Randomize tone"
            >
              RND
            </button>
            <button type="button" className="transport-btn save" onClick={resetTone} aria-label="Reset tone">
              RST
            </button>
          </div>

          <div className="header-lcd">
            <span>
              {params.engine.toUpperCase()} · {syncEnabled ? 'SYNC' : 'FREE'}
              {delaySyncEnabled ? ' · D-SYNC' : ''}
            </span>
            <span>
              {isAudioReady ? 'AUDIO ON' : 'STANDBY'} · OCT {octaveShift >= 0 ? '+' : ''}
              {octaveShift}
            </span>
          </div>

          <div className="header-master">
            <div className="speaker-grille" aria-hidden>
              <span />
              <span />
              <span />
              <span />
              <span />
              <span />
              <span />
              <span />
              <span />
            </div>
            {renderKnob({
              id: 'master',
              label: 'VOL',
              value: params.masterVolume,
              min: 0,
              max: 1,
              step: 0.01,
              readout: formatPercent(params.masterVolume),
              size: 'lg',
              onChange: (value) => setParameter('masterVolume', value),
            })}
          </div>
        </header>

        <div className="module-bay">
          <svg className="patch-cables" viewBox="0 0 1000 120" preserveAspectRatio="none" aria-hidden>
            <path className="cable cable-a" d="M120 40 C 220 110, 320 10, 420 55" />
            <path className="cable cable-b" d="M480 50 C 560 100, 640 20, 740 60" />
            <path className="cable cable-c" d="M780 45 C 850 95, 900 25, 960 70" />
          </svg>

          <div className="module-row">
          <article className="module osc">
            <span className="screw tl" aria-hidden />
            <span className="screw tr" aria-hidden />
            <span className="screw bl" aria-hidden />
            <span className="screw br" aria-hidden />
            <div className="module-head">
              <h2>OSC</h2>
              <div className="module-lcd">
                <span>ENGINE {params.engine.toUpperCase()}</span>
                <span>
                  OCT {octaveShift >= 0 ? '+' : ''}
                  {octaveShift} · DET {Math.round(params.detuneCents)}c
                </span>
              </div>
            </div>
            <div className="knob-row primary">
              {renderKnob({
                id: 'osc-freq',
                label: 'FREQ',
                value: params.detuneCents,
                min: -600,
                max: 600,
                step: 1,
                readout: `${Math.round(params.detuneCents)}c`,
                size: 'lg',
                onChange: (value) => setParameter('detuneCents', value),
              })}
              {renderKnob({
                id: 'osc-fine',
                label: 'FINE',
                value: params.mix,
                min: 0,
                max: 1,
                step: 0.01,
                readout: formatPercent(params.mix),
                onChange: (value) => setParameter('mix', value),
              })}
            </div>
            <div className="knob-row">
              {renderKnob({
                id: 'osc-pw',
                label: 'PW',
                value: params.lfoDepth,
                min: 0,
                max: 1,
                step: 0.01,
                readout: formatPercent(params.lfoDepth),
                size: 'sm',
                onChange: (value) => setParameter('lfoDepth', value),
              })}
              {renderKnob({
                id: 'osc-sub',
                label: 'SUB',
                value: params.distMix,
                min: 0,
                max: 1,
                step: 0.01,
                readout: formatPercent(params.distMix),
                size: 'sm',
                onChange: (value) => setParameter('distMix', value),
              })}
              {renderKnob({
                id: 'osc-level',
                label: 'LEVEL',
                value: params.reverbMix,
                min: 0,
                max: 1,
                step: 0.01,
                readout: formatPercent(params.reverbMix),
                size: 'sm',
                onChange: (value) => setParameter('reverbMix', value),
              })}
            </div>
            <div className="module-buttons">
              <button type="button" className="mod-btn" onClick={cycleEngine}>
                WAVE
              </button>
              <button
                type="button"
                className={`mod-btn ${syncEnabled ? 'is-active' : ''}`}
                onClick={() => setSyncEnabled((previous) => !previous)}
              >
                SYNC
              </button>
              <button
                type="button"
                className="mod-btn"
                onClick={() => {
                  setOctaveShift((previous) => clamp(previous - 1, -2, 2))
                  setStatusText('Octave shifted down.')
                }}
              >
                OCT−
              </button>
              <button
                type="button"
                className="mod-btn"
                onClick={() => {
                  setOctaveShift((previous) => clamp(previous + 1, -2, 2))
                  setStatusText('Octave shifted up.')
                }}
              >
                OCT+
              </button>
            </div>
          </article>

          <article className="module filter">
            <span className="screw tl" aria-hidden />
            <span className="screw tr" aria-hidden />
            <span className="screw bl" aria-hidden />
            <span className="screw br" aria-hidden />
            <div className="module-head">
              <h2>FILTER</h2>
              <div className="module-lcd">
                <span>
                  {params.filterType.toUpperCase()} · {slope24Enabled ? '24dB' : '12dB'}
                </span>
                <span>
                  CUT {formatCutoff(params.filterCutoff)} · RES {params.resonance.toFixed(1)}
                </span>
              </div>
            </div>
            <div className="knob-row primary">
              {renderKnob({
                id: 'filter-cutoff',
                label: 'CUTOFF',
                value: params.filterCutoff,
                min: 80,
                max: 12000,
                step: 1,
                readout: formatCutoff(params.filterCutoff),
                size: 'lg',
                onChange: (value) => setParameter('filterCutoff', value),
              })}
              {renderKnob({
                id: 'filter-res',
                label: 'RES',
                value: params.resonance,
                min: 0.2,
                max: 18,
                step: 0.1,
                readout: params.resonance.toFixed(1),
                onChange: (value) => setParameter('resonance', value),
              })}
            </div>
            <div className="knob-row">
              {renderKnob({
                id: 'filter-drive',
                label: 'DRIVE',
                value: params.distDrive,
                min: 1,
                max: 24,
                step: 0.1,
                readout: params.distDrive.toFixed(1),
                size: 'sm',
                onChange: (value) => setParameter('distDrive', value),
              })}
              {renderKnob({
                id: 'filter-env',
                label: 'ENV',
                value: params.delayMix,
                min: 0,
                max: 1,
                step: 0.01,
                readout: formatPercent(params.delayMix),
                size: 'sm',
                onChange: (value) => setParameter('delayMix', value),
              })}
              {renderKnob({
                id: 'filter-track',
                label: 'LFO',
                value: params.lfoRate,
                min: 0.05,
                max: 14,
                step: 0.01,
                readout: `${params.lfoRate.toFixed(1)}Hz`,
                size: 'sm',
                onChange: (value) => setParameter('lfoRate', value),
              })}
            </div>
            <div className="module-buttons">
              <button
                type="button"
                className="mod-btn"
                onClick={() =>
                  setParameter(
                    'filterType',
                    FILTER_TYPES[(FILTER_TYPES.indexOf(params.filterType) + 1) % FILTER_TYPES.length],
                  )
                }
              >
                TYPE
              </button>
              <button
                type="button"
                className={`mod-btn ${slope24Enabled ? 'is-active' : ''}`}
                onClick={() => setSlope24Enabled((previous) => !previous)}
              >
                SLOPE
              </button>
              <button
                type="button"
                className={`mod-btn ${curveEnabled ? 'is-active' : ''}`}
                onClick={() => setCurveEnabled((previous) => !previous)}
              >
                CURVE
              </button>
            </div>
          </article>

          <article className="module env">
            <span className="screw tl" aria-hidden />
            <span className="screw tr" aria-hidden />
            <span className="screw bl" aria-hidden />
            <span className="screw br" aria-hidden />
            <div className="module-head">
              <h2>ENV</h2>
              <div className="module-lcd">
                <span>
                  A {formatMilliseconds(params.attack)} · D {formatMilliseconds(params.decay)}
                </span>
                <span>
                  S {formatPercent(params.sustain)} · R {formatMilliseconds(params.release)}
                  {loopEnabled ? ' · LOOP' : ''}
                </span>
              </div>
            </div>
            <div className="env-fader-row">
              <EnvFader
                label="A"
                value={params.attack}
                min={0.003}
                max={1.8}
                step={0.001}
                onChange={(value) => setParameter('attack', value)}
                ariaLabel="Attack fader"
              />
              <EnvFader
                label="D"
                value={params.decay}
                min={0.01}
                max={2.8}
                step={0.001}
                onChange={(value) => setParameter('decay', value)}
                ariaLabel="Decay fader"
              />
              <EnvFader
                label="S"
                value={params.sustain}
                min={0}
                max={1}
                step={0.01}
                onChange={(value) => setParameter('sustain', value)}
                ariaLabel="Sustain fader"
              />
              <EnvFader
                label="R"
                value={params.release}
                min={0.02}
                max={3.6}
                step={0.001}
                onChange={(value) => setParameter('release', value)}
                ariaLabel="Release fader"
              />
            </div>
            <div className="knob-row env-extra">
              {renderKnob({
                id: 'env-velocity',
                label: 'VEL',
                value: velocityAmount,
                min: 0.1,
                max: 1,
                step: 0.01,
                readout: formatPercent(velocityAmount),
                size: 'sm',
                onChange: setVelocityAmount,
              })}
              <button
                type="button"
                className={`mod-btn loop-btn ${loopEnabled ? 'is-active' : ''}`}
                onClick={() => setLoopEnabled((previous) => !previous)}
              >
                LOOP
              </button>
            </div>
          </article>

          <article className="module delay">
            <span className="screw tl" aria-hidden />
            <span className="screw tr" aria-hidden />
            <span className="screw bl" aria-hidden />
            <span className="screw br" aria-hidden />
            <div className="module-head">
              <h2>DELAY</h2>
              <div className="module-lcd">
                <span>
                  TIME {formatMilliseconds(params.delayTime)} · FB {formatPercent(params.delayFeedback)}
                </span>
                <span>
                  MIX {formatPercent(params.delayMix)}
                  {delayPingPongEnabled ? ' · PING' : ''}
                  {delayDuckEnabled ? ' · DUCK' : ''}
                </span>
              </div>
            </div>
            <div className="knob-row primary">
              {renderKnob({
                id: 'delay-time',
                label: 'TIME',
                value: params.delayTime,
                min: 0.02,
                max: 1.2,
                step: 0.001,
                readout: formatMilliseconds(params.delayTime),
                size: 'lg',
                onChange: (value) => setParameter('delayTime', value),
              })}
              {renderKnob({
                id: 'delay-feedback',
                label: 'FB',
                value: params.delayFeedback,
                min: 0,
                max: 0.95,
                step: 0.01,
                readout: formatPercent(params.delayFeedback),
                onChange: (value) => setParameter('delayFeedback', value),
              })}
            </div>
            <div className="knob-row">
              {renderKnob({
                id: 'delay-mix',
                label: 'MIX',
                value: params.delayMix,
                min: 0,
                max: 1,
                step: 0.01,
                readout: formatPercent(params.delayMix),
                size: 'sm',
                onChange: (value) => setParameter('delayMix', value),
              })}
              {renderKnob({
                id: 'delay-tone',
                label: 'TONE',
                value: params.reverbDecay,
                min: 0.4,
                max: 6.5,
                step: 0.05,
                readout: `${params.reverbDecay.toFixed(1)}s`,
                size: 'sm',
                onChange: (value) => setParameter('reverbDecay', value),
              })}
              {renderKnob({
                id: 'delay-mod',
                label: 'MOD',
                value: params.lfoDepth,
                min: 0,
                max: 1,
                step: 0.01,
                readout: formatPercent(params.lfoDepth),
                size: 'sm',
                onChange: (value) => setParameter('lfoDepth', value),
              })}
            </div>
            <div className="module-buttons">
              <button
                type="button"
                className={`mod-btn ${delaySyncEnabled ? 'is-active' : ''}`}
                onClick={() => setDelaySyncEnabled((previous) => !previous)}
              >
                SYNC
              </button>
              <button
                type="button"
                className={`mod-btn ${delayPingPongEnabled ? 'is-active' : ''}`}
                onClick={() => setDelayPingPongEnabled((previous) => !previous)}
              >
                PING
              </button>
              <button
                type="button"
                className={`mod-btn ${delayDuckEnabled ? 'is-active' : ''}`}
                onClick={() => setDelayDuckEnabled((previous) => !previous)}
              >
                DUCK
              </button>
            </div>
          </article>
        </div>
        </div>

        <div className="desk-bottom">
          <div className="side-controls left">
            {renderKnob({
              id: 'scale',
              label: 'SCALE',
              value: params.mix,
              min: 0,
              max: 1,
              step: 0.01,
              readout: formatPercent(params.mix),
              size: 'sm',
              onChange: (value) => setParameter('mix', value),
            })}
            {renderKnob({
              id: 'glide',
              label: 'GLIDE',
              value: params.release,
              min: 0.02,
              max: 3.6,
              step: 0.001,
              readout: formatMilliseconds(params.release),
              size: 'sm',
              onChange: (value) => setParameter('release', value),
            })}
          </div>

          <div className="keybed">
            <div className="keybed-rail">
              <button
                type="button"
                className={`latch-btn ${holdEnabled ? 'is-active' : ''}`}
                onClick={() => {
                  setHoldEnabled((previous) => {
                    const next = !previous
                    if (!next) {
                      panic()
                    }
                    return next
                  })
                }}
              >
                HOLD
              </button>
              <button
                type="button"
                className={`latch-btn ${arpEnabled ? 'is-active' : ''}`}
                onClick={() => setArpEnabled((previous) => !previous)}
              >
                ARP
              </button>
            </div>
            <div className="piano">
              {WHITE_KEY_NOTES.map((baseNote, index) => (
                <button
                  key={`white-${baseNote}`}
                  type="button"
                  className={`piano-key white ${
                    activeNoteSet.has(baseNote + octaveShift * 12) ? 'is-active' : ''
                  }`}
                  style={{ left: `${index * whiteKeyWidth}%`, width: `${whiteKeyWidth}%` }}
                  onPointerDown={(event) => {
                    event.currentTarget.setPointerCapture(event.pointerId)
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
                  onPointerCancel={() => {
                    if (!holdEnabled) {
                      releaseBaseNote(baseNote)
                    }
                  }}
                  aria-label={`White key ${baseNote}`}
                >
                  <span>{keyboardLegend.get(baseNote) ?? ''}</span>
                </button>
              ))}
              {BLACK_KEY_SLOTS.map((blackKey) => {
                const center = (blackKey.afterWhiteIndex + 1) * whiteKeyWidth
                const width = whiteKeyWidth * 0.62
                return (
                  <button
                    key={`black-${blackKey.note}`}
                    type="button"
                    className={`piano-key black ${
                      activeNoteSet.has(blackKey.note + octaveShift * 12) ? 'is-active' : ''
                    }`}
                    style={{ left: `${center - width * 0.5}%`, width: `${width}%` }}
                    onPointerDown={(event) => {
                      event.currentTarget.setPointerCapture(event.pointerId)
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
                    onPointerCancel={() => {
                      if (!holdEnabled) {
                        releaseBaseNote(blackKey.note)
                      }
                    }}
                    aria-label={`Black key ${blackKey.note}`}
                  >
                    <span>{keyboardLegend.get(blackKey.note) ?? ''}</span>
                  </button>
                )
              })}
            </div>
          </div>

          <div className="side-controls right">
            {renderKnob({
              id: 'macro-1',
              label: 'M1',
              value: params.filterCutoff,
              min: 80,
              max: 12000,
              step: 1,
              readout: formatCutoff(params.filterCutoff),
              size: 'sm',
              onChange: (value) => setParameter('filterCutoff', value),
            })}
            {renderKnob({
              id: 'macro-2',
              label: 'M2',
              value: params.delayMix,
              min: 0,
              max: 1,
              step: 0.01,
              readout: formatPercent(params.delayMix),
              size: 'sm',
              onChange: (value) => setParameter('delayMix', value),
            })}
            {renderKnob({
              id: 'macro-3',
              label: 'M3',
              value: params.reverbMix,
              min: 0,
              max: 1,
              step: 0.01,
              readout: formatPercent(params.reverbMix),
              size: 'sm',
              onChange: (value) => setParameter('reverbMix', value),
            })}
            {renderKnob({
              id: 'macro-4',
              label: 'M4',
              value: params.lfoRate,
              min: 0.05,
              max: 14,
              step: 0.01,
              readout: `${params.lfoRate.toFixed(1)}Hz`,
              size: 'sm',
              onChange: (value) => setParameter('lfoRate', value),
            })}
          </div>
        </div>
      </section>

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
