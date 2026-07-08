import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
type JackKind = 'audio' | 'cv'
type ModuleId = 'osc' | 'filter' | 'env' | 'lfo' | 'dist' | 'delay' | 'reverb' | 'master'

type JackDefinition = {
  id: ModDeskJackId
  module: ModuleId
  direction: JackDirection
  kind: JackKind
  label: string
}

type Point = { x: number; y: number }

type KnobProps = {
  label: string
  value: number
  min: number
  max: number
  step?: number
  onChange: (value: number) => void
  readout: string
}

const JACKS: JackDefinition[] = [
  { id: 'osc.out', module: 'osc', direction: 'out', kind: 'audio', label: 'OUT' },
  { id: 'osc.pitchCv', module: 'osc', direction: 'in', kind: 'cv', label: 'PITCH CV' },
  { id: 'filter.in', module: 'filter', direction: 'in', kind: 'audio', label: 'IN' },
  { id: 'filter.out', module: 'filter', direction: 'out', kind: 'audio', label: 'OUT' },
  { id: 'filter.cutoffCv', module: 'filter', direction: 'in', kind: 'cv', label: 'CUTOFF CV' },
  { id: 'env.out', module: 'env', direction: 'out', kind: 'cv', label: 'ENV OUT' },
  { id: 'lfo.out', module: 'lfo', direction: 'out', kind: 'cv', label: 'LFO OUT' },
  { id: 'dist.in', module: 'dist', direction: 'in', kind: 'audio', label: 'IN' },
  { id: 'dist.out', module: 'dist', direction: 'out', kind: 'audio', label: 'OUT' },
  { id: 'delay.in', module: 'delay', direction: 'in', kind: 'audio', label: 'IN' },
  { id: 'delay.out', module: 'delay', direction: 'out', kind: 'audio', label: 'OUT' },
  { id: 'reverb.in', module: 'reverb', direction: 'in', kind: 'audio', label: 'IN' },
  { id: 'reverb.out', module: 'reverb', direction: 'out', kind: 'audio', label: 'OUT' },
  { id: 'master.in', module: 'master', direction: 'in', kind: 'audio', label: 'MASTER IN' },
]

const JACK_LOOKUP = Object.fromEntries(
  JACKS.map((jackDefinition) => [jackDefinition.id, jackDefinition]),
) as Record<ModDeskJackId, JackDefinition>

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

const ENGINE_MODES: Array<{ value: EngineMode; label: string }> = [
  { value: 'analog', label: 'ANALOG' },
  { value: 'fmBell', label: 'FM BELL' },
  { value: 'noise', label: 'NOISE' },
  { value: 'pluck', label: 'PLUCK' },
  { value: 'bass', label: 'BASS' },
  { value: 'pad', label: 'PAD' },
  { value: 'perc', label: 'PERC' },
  { value: 'choir', label: 'CHOIR' },
]

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
  a: 60,
  w: 61,
  e: 63,
  r: 65,
  t: 66,
  y: 68,
  u: 70,
  i: 72,
}

const BLACK_OFFSETS = new Set([1, 3, 6, 8, 10])

const MODULE_COLORS: Record<ModuleId, string> = {
  osc: '#ff8a2f',
  filter: '#16b8b2',
  env: '#f3ce39',
  lfo: '#60b85b',
  dist: '#d867bf',
  delay: '#dc4e42',
  reverb: '#4587d6',
  master: '#3d4a5e',
}

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value))

const formatMilliseconds = (seconds: number): string => `${Math.round(seconds * 1000)}ms`

const formatHz = (value: number): string => (value >= 1000 ? `${(value / 1000).toFixed(1)}k` : `${Math.round(value)}`)

const buildCablePath = (from: Point, to: Point): string => {
  const curve = Math.max(48, Math.abs(to.x - from.x) * 0.45)
  const c1x = from.x + curve
  const c2x = to.x - curve
  return `M ${from.x} ${from.y} C ${c1x} ${from.y}, ${c2x} ${to.y}, ${to.x} ${to.y}`
}

const noteLabel = (note: number): string => {
  const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
  const octave = Math.floor(note / 12) - 1
  return `${names[note % 12]}${octave}`
}

const PIANO_NOTES = Array.from({ length: 25 }, (_, index) => 48 + index)

function Knob({ label, value, min, max, step = 0.001, onChange, readout }: KnobProps) {
  const dragState = useRef<{ startY: number; startValue: number; pointerId: number } | null>(null)
  const rotation = -135 + ((value - min) / (max - min)) * 270

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
      const delta = ((dragState.current.startY - event.clientY) / 130) * range
      onChange(clamp(dragState.current.startValue + delta, min, max))
    },
    [max, min, onChange],
  )

  const clearDrag = useCallback((event: React.PointerEvent<HTMLButtonElement>) => {
    if (dragState.current && dragState.current.pointerId === event.pointerId) {
      event.currentTarget.releasePointerCapture(event.pointerId)
      dragState.current = null
    }
  }, [])

  return (
    <label className="knob-control">
      <span className="knob-label">{label}</span>
      <button
        type="button"
        className="knob-shell"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={clearDrag}
        onPointerCancel={clearDrag}
        onPointerLeave={clearDrag}
      >
        <span className="knob-face">
          <span className="knob-indicator" style={{ transform: `rotate(${rotation}deg)` }} />
        </span>
      </button>
      <input
        className="knob-range"
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
      <span className="knob-readout">{readout}</span>
    </label>
  )
}

function App() {
  const synthRef = useRef<ModDeskSynthEngine | null>(null)
  const activeComputerKeysRef = useRef(new Set<string>())
  const activeNotesRef = useRef(new Set<number>())
  const benchRef = useRef<HTMLDivElement | null>(null)
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const jackRefs = useRef<Partial<Record<ModDeskJackId, HTMLButtonElement | null>>>({})

  const [isAudioReady, setIsAudioReady] = useState(false)
  const [holdEnabled, setHoldEnabled] = useState(false)
  const [params, setParams] = useState<SynthParameters>({ ...DEFAULT_PARAMETERS })
  const [connections, setConnections] = useState<PatchConnection[]>([...DEFAULT_PATCH_CONNECTIONS])
  const [selectedOutputJack, setSelectedOutputJack] = useState<ModDeskJackId | null>(null)
  const [activeNotes, setActiveNotes] = useState<number[]>([])
  const [patchStatus, setPatchStatus] = useState('Patch an OUT jack into an IN jack.')
  const [jackPoints, setJackPoints] = useState<Partial<Record<ModDeskJackId, Point>>>({})
  const [ghostPoint, setGhostPoint] = useState<Point | null>(null)

  useEffect(() => {
    activeNotesRef.current = new Set(activeNotes)
  }, [activeNotes])

  const allowedConnections = useMemo(
    () => new Set(ALLOWED_CONNECTIONS.map(([from, to]) => `${from}>${to}`)),
    [],
  )

  const addActiveNote = useCallback((note: number) => {
    setActiveNotes((previousNotes) =>
      previousNotes.includes(note) ? previousNotes : [...previousNotes, note],
    )
  }, [])

  const removeActiveNote = useCallback((note: number) => {
    setActiveNotes((previousNotes) => previousNotes.filter((activeNote) => activeNote !== note))
  }, [])

  const ensureAudioStarted = useCallback(async () => {
    const synth = synthRef.current
    if (!synth) {
      return
    }
    await synth.start()
    setIsAudioReady(synth.isReady())
  }, [])

  const playNote = useCallback(
    async (note: number) => {
      if (!isAudioReady) {
        await ensureAudioStarted()
      }
      synthRef.current?.noteOn(note)
      addActiveNote(note)
    },
    [addActiveNote, ensureAudioStarted, isAudioReady],
  )

  const releaseNote = useCallback(
    (note: number) => {
      synthRef.current?.noteOff(note)
      removeActiveNote(note)
    },
    [removeActiveNote],
  )

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
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (
        target &&
        ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(target.tagName.toUpperCase())
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

  const updateParameter = useCallback(
    <K extends keyof SynthParameters>(key: K, value: SynthParameters[K]) => {
      setParams((previous) => ({ ...previous, [key]: value }))
    },
    [],
  )

  const panic = useCallback(() => {
    synthRef.current?.allNotesOff()
    setActiveNotes([])
    activeComputerKeysRef.current.clear()
  }, [])

  const connectJacks = useCallback(
    (from: ModDeskJackId, to: ModDeskJackId) => {
      if (!allowedConnections.has(`${from}>${to}`)) {
        setPatchStatus(`Route blocked: ${from} cannot patch into ${to}.`)
        return
      }
      setConnections((previousConnections) => {
        const alreadyPatched = previousConnections.some(
          (connection) => connection.from === from && connection.to === to,
        )
        if (alreadyPatched) {
          setPatchStatus(`Cable removed: ${from} → ${to}.`)
          return previousConnections.filter(
            (connection) => !(connection.from === from && connection.to === to),
          )
        }
        const withoutDestination = previousConnections.filter((connection) => connection.to !== to)
        setPatchStatus(`Patched: ${from} → ${to}`)
        return [...withoutDestination, { from, to }]
      })
    },
    [allowedConnections],
  )

  const disconnectCable = useCallback((cable: PatchConnection) => {
    setConnections((previousConnections) =>
      previousConnections.filter(
        (connection) => !(connection.from === cable.from && connection.to === cable.to),
      ),
    )
    setPatchStatus(`Cable removed: ${cable.from} → ${cable.to}.`)
  }, [])

  const registerJackRef = useCallback((jackId: ModDeskJackId, node: HTMLButtonElement | null) => {
    jackRefs.current[jackId] = node
  }, [])

  const measureJackPoints = useCallback(() => {
    if (!benchRef.current) {
      return
    }
    const benchRect = benchRef.current.getBoundingClientRect()
    const nextPoints: Partial<Record<ModDeskJackId, Point>> = {}
    for (const jackDefinition of JACKS) {
      const node = jackRefs.current[jackDefinition.id]
      if (!node) {
        continue
      }
      const nodeRect = node.getBoundingClientRect()
      nextPoints[jackDefinition.id] = {
        x: nodeRect.left - benchRect.left + nodeRect.width * 0.5,
        y: nodeRect.top - benchRect.top + nodeRect.height * 0.5,
      }
    }
    setJackPoints(nextPoints)
  }, [])

  useEffect(() => {
    const animationFrame = window.requestAnimationFrame(measureJackPoints)
    const onResize = () => measureJackPoints()
    const onScroll = () => measureJackPoints()
    const scroller = scrollRef.current

    window.addEventListener('resize', onResize)
    scroller?.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      window.cancelAnimationFrame(animationFrame)
      window.removeEventListener('resize', onResize)
      scroller?.removeEventListener('scroll', onScroll)
    }
  }, [connections, measureJackPoints, params.engine])

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

  const connectedJacks = useMemo(() => {
    const connected = new Set<ModDeskJackId>()
    for (const connection of connections) {
      connected.add(connection.from)
      connected.add(connection.to)
    }
    return connected
  }, [connections])

  const onJackClick = useCallback(
    (jack: JackDefinition) => {
      if (!selectedOutputJack) {
        if (jack.direction === 'out') {
          setSelectedOutputJack(jack.id)
          setPatchStatus(`Selected output: ${jack.id}. Choose an input jack.`)
        } else {
          setPatchStatus('Start by selecting an OUT jack.')
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
      setPatchStatus(`Selected output: ${jack.id}. Choose an input jack.`)
    },
    [connectJacks, selectedOutputJack],
  )

  const onWorkbenchPointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!selectedOutputJack || !benchRef.current) {
        return
      }
      const benchRect = benchRef.current.getBoundingClientRect()
      setGhostPoint({
        x: event.clientX - benchRect.left,
        y: event.clientY - benchRect.top,
      })
    },
    [selectedOutputJack],
  )

  const ghostCable = useMemo(() => {
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
    const noteToKey = new Map<number, string>()
    for (const [key, note] of Object.entries(KEYBOARD_NOTE_MAP)) {
      if (!noteToKey.has(note)) {
        noteToKey.set(note, key.toUpperCase())
      }
    }
    return noteToKey
  }, [])

  const activeNoteSet = useMemo(() => new Set(activeNotes), [activeNotes])

  return (
    <main className="mod-desk-app">
      <header className="hero-head">
        <div className="hero-brand">
          <p className="brand-kicker">PATCHABLE WEB SYNTH</p>
          <h1>MOD DESK</h1>
          <p className="brand-sub">
            Build signal chains with colorful cables, twist chunky controls, and jam with keyboard or
            on-screen piano.
          </p>
        </div>
        <div className="hero-actions">
          <button type="button" className="power-button" onClick={() => void ensureAudioStarted()}>
            {isAudioReady ? 'AUDIO READY' : 'POWER ON'}
          </button>
          <button type="button" className="utility-button" onClick={panic}>
            PANIC / ALL NOTES OFF
          </button>
          <label className="hold-toggle">
            <input
              type="checkbox"
              checked={holdEnabled}
              onChange={(event) => {
                setHoldEnabled(event.target.checked)
                if (!event.target.checked) {
                  panic()
                }
              }}
            />
            HOLD MODE
          </label>
          <div className="master-volume">
            <Knob
              label="MASTER"
              value={params.masterVolume}
              min={0}
              max={1}
              step={0.01}
              onChange={(value) => updateParameter('masterVolume', value)}
              readout={`${Math.round(params.masterVolume * 100)}%`}
            />
          </div>
        </div>
      </header>

      <section className="patch-panel">
        <p className="patch-status">{patchStatus}</p>
        <div className="patch-buttons">
          <button
            type="button"
            onClick={() => {
              setConnections([...DEFAULT_PATCH_CONNECTIONS])
              setSelectedOutputJack(null)
              setPatchStatus('Factory patch restored.')
            }}
          >
            FACTORY PATCH
          </button>
          <button
            type="button"
            onClick={() => {
              setConnections([])
              setSelectedOutputJack(null)
              setPatchStatus('Patch bay cleared.')
            }}
          >
            CLEAR ALL CABLES
          </button>
        </div>
      </section>

      <section className="workbench-scroll" ref={scrollRef}>
        <div
          className="workbench-surface"
          ref={benchRef}
          onPointerMove={onWorkbenchPointerMove}
          onPointerLeave={() => setGhostPoint(null)}
        >
          <svg className="cable-layer" viewBox={`0 0 1800 520`} preserveAspectRatio="none" aria-hidden>
            {cables.map((cable) => (
              <g key={`${cable.from}->${cable.to}`}>
                <path className="cable-hit" d={cable.path} onClick={() => disconnectCable(cable)} />
                <path className="cable cable-main" style={{ stroke: cable.color }} d={cable.path} />
                <path className="cable cable-glow" style={{ stroke: cable.color }} d={cable.path} />
              </g>
            ))}
            {ghostCable ? <path className="cable cable-ghost" d={ghostCable} /> : null}
          </svg>

          <div className="modules">
            <article className="module module-osc">
              <header>
                <h2>OSC</h2>
                <p className="lcd">ENGINE: {params.engine.toUpperCase()}</p>
              </header>
              <div className="jack-row">
                <button
                  ref={(node) => registerJackRef('osc.out', node)}
                  type="button"
                  className={`jack jack-out ${
                    selectedOutputJack === 'osc.out' ? 'is-selected' : ''
                  } ${connectedJacks.has('osc.out') ? 'is-connected' : ''}`}
                  onClick={() => onJackClick(JACK_LOOKUP['osc.out'])}
                >
                  OUT
                </button>
                <button
                  ref={(node) => registerJackRef('osc.pitchCv', node)}
                  type="button"
                  className={`jack jack-in ${connectedJacks.has('osc.pitchCv') ? 'is-connected' : ''}`}
                  onClick={() => onJackClick(JACK_LOOKUP['osc.pitchCv'])}
                >
                  PITCH CV
                </button>
              </div>
              <div className="engine-grid">
                {ENGINE_MODES.map((engineMode) => (
                  <button
                    key={engineMode.value}
                    type="button"
                    className={params.engine === engineMode.value ? 'is-active' : ''}
                    onClick={() => updateParameter('engine', engineMode.value)}
                  >
                    {engineMode.label}
                  </button>
                ))}
              </div>
              <div className="lcd-wave">
                {Array.from({ length: 14 }, (_, index) => (
                  <span key={`bar-${index}`} style={{ animationDelay: `${index * 0.05}s` }} />
                ))}
              </div>
              <div className="knob-row">
                <Knob
                  label="DETUNE"
                  value={params.detuneCents}
                  min={-40}
                  max={40}
                  step={0.5}
                  onChange={(value) => updateParameter('detuneCents', value)}
                  readout={`${params.detuneCents.toFixed(1)}¢`}
                />
                <Knob
                  label="MIX"
                  value={params.mix}
                  min={0}
                  max={1}
                  step={0.01}
                  onChange={(value) => updateParameter('mix', value)}
                  readout={`${Math.round(params.mix * 100)}%`}
                />
              </div>
            </article>

            <article className="module module-filter">
              <header>
                <h2>FILTER</h2>
                <p className="lcd">{params.filterType.toUpperCase()}</p>
              </header>
              <div className="jack-row">
                <button
                  ref={(node) => registerJackRef('filter.in', node)}
                  type="button"
                  className={`jack jack-in ${connectedJacks.has('filter.in') ? 'is-connected' : ''}`}
                  onClick={() => onJackClick(JACK_LOOKUP['filter.in'])}
                >
                  IN
                </button>
                <button
                  ref={(node) => registerJackRef('filter.out', node)}
                  type="button"
                  className={`jack jack-out ${
                    selectedOutputJack === 'filter.out' ? 'is-selected' : ''
                  } ${connectedJacks.has('filter.out') ? 'is-connected' : ''}`}
                  onClick={() => onJackClick(JACK_LOOKUP['filter.out'])}
                >
                  OUT
                </button>
                <button
                  ref={(node) => registerJackRef('filter.cutoffCv', node)}
                  type="button"
                  className={`jack jack-in ${connectedJacks.has('filter.cutoffCv') ? 'is-connected' : ''}`}
                  onClick={() => onJackClick(JACK_LOOKUP['filter.cutoffCv'])}
                >
                  CUTOFF CV
                </button>
              </div>
              <div className="knob-row">
                <Knob
                  label="CUTOFF"
                  value={params.filterCutoff}
                  min={80}
                  max={12000}
                  step={1}
                  onChange={(value) => updateParameter('filterCutoff', value)}
                  readout={`${formatHz(params.filterCutoff)}Hz`}
                />
                <Knob
                  label="RES"
                  value={params.resonance}
                  min={0.2}
                  max={20}
                  step={0.1}
                  onChange={(value) => updateParameter('resonance', value)}
                  readout={params.resonance.toFixed(1)}
                />
              </div>
              <div className="mini-select">
                {(['lowpass', 'bandpass', 'highpass', 'notch'] as BiquadFilterType[]).map((type) => (
                  <button
                    key={type}
                    type="button"
                    className={params.filterType === type ? 'is-active' : ''}
                    onClick={() => updateParameter('filterType', type)}
                  >
                    {type.slice(0, 3).toUpperCase()}
                  </button>
                ))}
              </div>
            </article>

            <article className="module module-env">
              <header>
                <h2>ENV</h2>
                <p className="lcd">
                  A {formatMilliseconds(params.attack)} / R {formatMilliseconds(params.release)}
                </p>
              </header>
              <div className="jack-row">
                <button
                  ref={(node) => registerJackRef('env.out', node)}
                  type="button"
                  className={`jack jack-out ${
                    selectedOutputJack === 'env.out' ? 'is-selected' : ''
                  } ${connectedJacks.has('env.out') ? 'is-connected' : ''}`}
                  onClick={() => onJackClick(JACK_LOOKUP['env.out'])}
                >
                  ENV OUT
                </button>
              </div>
              <div className="knob-row knob-row-quad">
                <Knob
                  label="A"
                  value={params.attack}
                  min={0.003}
                  max={1.8}
                  step={0.001}
                  onChange={(value) => updateParameter('attack', value)}
                  readout={formatMilliseconds(params.attack)}
                />
                <Knob
                  label="D"
                  value={params.decay}
                  min={0.01}
                  max={2.8}
                  step={0.001}
                  onChange={(value) => updateParameter('decay', value)}
                  readout={formatMilliseconds(params.decay)}
                />
                <Knob
                  label="S"
                  value={params.sustain}
                  min={0}
                  max={1}
                  step={0.01}
                  onChange={(value) => updateParameter('sustain', value)}
                  readout={`${Math.round(params.sustain * 100)}%`}
                />
                <Knob
                  label="R"
                  value={params.release}
                  min={0.02}
                  max={3.6}
                  step={0.001}
                  onChange={(value) => updateParameter('release', value)}
                  readout={formatMilliseconds(params.release)}
                />
              </div>
            </article>

            <article className="module module-lfo">
              <header>
                <h2>LFO</h2>
                <p className="lcd">
                  {params.lfoRate.toFixed(1)}Hz / DEPTH {Math.round(params.lfoDepth * 100)}%
                </p>
              </header>
              <div className="jack-row">
                <button
                  ref={(node) => registerJackRef('lfo.out', node)}
                  type="button"
                  className={`jack jack-out ${
                    selectedOutputJack === 'lfo.out' ? 'is-selected' : ''
                  } ${connectedJacks.has('lfo.out') ? 'is-connected' : ''}`}
                  onClick={() => onJackClick(JACK_LOOKUP['lfo.out'])}
                >
                  LFO OUT
                </button>
              </div>
              <div className="knob-row">
                <Knob
                  label="RATE"
                  value={params.lfoRate}
                  min={0.05}
                  max={14}
                  step={0.01}
                  onChange={(value) => updateParameter('lfoRate', value)}
                  readout={`${params.lfoRate.toFixed(1)}Hz`}
                />
                <Knob
                  label="DEPTH"
                  value={params.lfoDepth}
                  min={0}
                  max={1}
                  step={0.01}
                  onChange={(value) => updateParameter('lfoDepth', value)}
                  readout={`${Math.round(params.lfoDepth * 100)}%`}
                />
              </div>
              <p className="module-help">Patch LFO to FILTER cutoff or OSC pitch CV.</p>
            </article>

            <article className="module module-dist">
              <header>
                <h2>DIST</h2>
                <p className="lcd">DRIVE {params.distDrive.toFixed(1)}</p>
              </header>
              <div className="jack-row">
                <button
                  ref={(node) => registerJackRef('dist.in', node)}
                  type="button"
                  className={`jack jack-in ${connectedJacks.has('dist.in') ? 'is-connected' : ''}`}
                  onClick={() => onJackClick(JACK_LOOKUP['dist.in'])}
                >
                  IN
                </button>
                <button
                  ref={(node) => registerJackRef('dist.out', node)}
                  type="button"
                  className={`jack jack-out ${
                    selectedOutputJack === 'dist.out' ? 'is-selected' : ''
                  } ${connectedJacks.has('dist.out') ? 'is-connected' : ''}`}
                  onClick={() => onJackClick(JACK_LOOKUP['dist.out'])}
                >
                  OUT
                </button>
              </div>
              <div className="knob-row">
                <Knob
                  label="DRIVE"
                  value={params.distDrive}
                  min={1}
                  max={32}
                  step={0.1}
                  onChange={(value) => updateParameter('distDrive', value)}
                  readout={params.distDrive.toFixed(1)}
                />
                <Knob
                  label="MIX"
                  value={params.distMix}
                  min={0}
                  max={1}
                  step={0.01}
                  onChange={(value) => updateParameter('distMix', value)}
                  readout={`${Math.round(params.distMix * 100)}%`}
                />
              </div>
            </article>

            <article className="module module-delay">
              <header>
                <h2>DELAY</h2>
                <p className="lcd">{formatMilliseconds(params.delayTime)}</p>
              </header>
              <div className="jack-row">
                <button
                  ref={(node) => registerJackRef('delay.in', node)}
                  type="button"
                  className={`jack jack-in ${connectedJacks.has('delay.in') ? 'is-connected' : ''}`}
                  onClick={() => onJackClick(JACK_LOOKUP['delay.in'])}
                >
                  IN
                </button>
                <button
                  ref={(node) => registerJackRef('delay.out', node)}
                  type="button"
                  className={`jack jack-out ${
                    selectedOutputJack === 'delay.out' ? 'is-selected' : ''
                  } ${connectedJacks.has('delay.out') ? 'is-connected' : ''}`}
                  onClick={() => onJackClick(JACK_LOOKUP['delay.out'])}
                >
                  OUT
                </button>
              </div>
              <div className="knob-row">
                <Knob
                  label="TIME"
                  value={params.delayTime}
                  min={0.02}
                  max={0.9}
                  step={0.001}
                  onChange={(value) => updateParameter('delayTime', value)}
                  readout={formatMilliseconds(params.delayTime)}
                />
                <Knob
                  label="FDBK"
                  value={params.delayFeedback}
                  min={0}
                  max={0.92}
                  step={0.01}
                  onChange={(value) => updateParameter('delayFeedback', value)}
                  readout={`${Math.round(params.delayFeedback * 100)}%`}
                />
                <Knob
                  label="MIX"
                  value={params.delayMix}
                  min={0}
                  max={1}
                  step={0.01}
                  onChange={(value) => updateParameter('delayMix', value)}
                  readout={`${Math.round(params.delayMix * 100)}%`}
                />
              </div>
            </article>

            <article className="module module-reverb">
              <header>
                <h2>REVERB</h2>
                <p className="lcd">{params.reverbDecay.toFixed(1)}s</p>
              </header>
              <div className="jack-row">
                <button
                  ref={(node) => registerJackRef('reverb.in', node)}
                  type="button"
                  className={`jack jack-in ${connectedJacks.has('reverb.in') ? 'is-connected' : ''}`}
                  onClick={() => onJackClick(JACK_LOOKUP['reverb.in'])}
                >
                  IN
                </button>
                <button
                  ref={(node) => registerJackRef('reverb.out', node)}
                  type="button"
                  className={`jack jack-out ${
                    selectedOutputJack === 'reverb.out' ? 'is-selected' : ''
                  } ${connectedJacks.has('reverb.out') ? 'is-connected' : ''}`}
                  onClick={() => onJackClick(JACK_LOOKUP['reverb.out'])}
                >
                  OUT
                </button>
              </div>
              <div className="knob-row">
                <Knob
                  label="DECAY"
                  value={params.reverbDecay}
                  min={0.4}
                  max={6.5}
                  step={0.05}
                  onChange={(value) => updateParameter('reverbDecay', value)}
                  readout={`${params.reverbDecay.toFixed(1)}s`}
                />
                <Knob
                  label="MIX"
                  value={params.reverbMix}
                  min={0}
                  max={1}
                  step={0.01}
                  onChange={(value) => updateParameter('reverbMix', value)}
                  readout={`${Math.round(params.reverbMix * 100)}%`}
                />
              </div>
            </article>

            <article className="module module-master">
              <header>
                <h2>OUTPUT</h2>
                <p className="lcd">{activeNotes.length} ACTIVE</p>
              </header>
              <div className="jack-row">
                <button
                  ref={(node) => registerJackRef('master.in', node)}
                  type="button"
                  className={`jack jack-in ${connectedJacks.has('master.in') ? 'is-connected' : ''}`}
                  onClick={() => onJackClick(JACK_LOOKUP['master.in'])}
                >
                  MASTER IN
                </button>
              </div>
              <p className="module-help">Patch any audio output jack into MASTER IN to hear sound.</p>
              <p className="module-help">Try disconnecting and repatching the effects order.</p>
            </article>
          </div>
        </div>
      </section>

      <section className="keyboard-zone">
        <div className="keyboard-header">
          <h3>PLAY</h3>
          <p>Computer keyboard: Z-M (low octave) and A-I (upper accents)</p>
        </div>
        <div className="piano">
          {PIANO_NOTES.filter((note) => !BLACK_OFFSETS.has(note % 12)).map((whiteNote) => {
            const hasSharp = BLACK_OFFSETS.has((whiteNote + 1) % 12)
            const sharpNote = whiteNote + 1
            return (
              <div key={whiteNote} className="piano-column">
                <button
                  type="button"
                  className={`white-key ${activeNoteSet.has(whiteNote) ? 'is-active' : ''}`}
                  onPointerDown={() => {
                    if (holdEnabled) {
                      void toggleHeldNote(whiteNote)
                    } else {
                      void playNote(whiteNote)
                    }
                  }}
                  onPointerUp={() => {
                    if (!holdEnabled) {
                      releaseNote(whiteNote)
                    }
                  }}
                  onPointerLeave={() => {
                    if (!holdEnabled) {
                      releaseNote(whiteNote)
                    }
                  }}
                >
                  <span>{noteLabel(whiteNote)}</span>
                  {keyboardLegend.has(whiteNote) ? <em>{keyboardLegend.get(whiteNote)}</em> : null}
                </button>
                {hasSharp ? (
                  <button
                    type="button"
                    className={`black-key ${activeNoteSet.has(sharpNote) ? 'is-active' : ''}`}
                    onPointerDown={() => {
                      if (holdEnabled) {
                        void toggleHeldNote(sharpNote)
                      } else {
                        void playNote(sharpNote)
                      }
                    }}
                    onPointerUp={() => {
                      if (!holdEnabled) {
                        releaseNote(sharpNote)
                      }
                    }}
                    onPointerLeave={() => {
                      if (!holdEnabled) {
                        releaseNote(sharpNote)
                      }
                    }}
                  >
                    {keyboardLegend.get(sharpNote) ?? ''}
                  </button>
                ) : null}
              </div>
            )
          })}
        </div>
      </section>
    </main>
  )
}

export default App
