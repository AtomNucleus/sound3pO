import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Synth, type Waveform } from "./audio/synth";
import { PADS, WAVEFORMS, keyToPad, type PadDef } from "./audio/pads";
import "./App.css";

export default function App() {
  const synthRef = useRef<Synth | null>(null);
  const [waveform, setWaveform] = useState<Waveform>("triangle");
  const [volume, setVolume] = useState(0.3);
  const [active, setActive] = useState<Set<string>>(new Set());
  const [lastNote, setLastNote] = useState<string | null>(null);
  const [count, setCount] = useState(0);

  const getSynth = useCallback(() => {
    if (!synthRef.current) {
      synthRef.current = new Synth({ waveform, masterGain: volume });
    }
    return synthRef.current;
  }, [waveform, volume]);

  const trigger = useCallback(
    (pad: PadDef) => {
      const synth = getSynth();
      void synth.resume();
      synth.playNote(pad.note, { waveform });
      setLastNote(pad.note);
      setCount((c) => c + 1);
      setActive((prev) => new Set(prev).add(pad.id));
      window.setTimeout(() => {
        setActive((prev) => {
          const next = new Set(prev);
          next.delete(pad.id);
          return next;
        });
      }, 180);
    },
    [getSynth, waveform],
  );

  useEffect(() => {
    synthRef.current?.setMasterGain(volume);
  }, [volume]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return;
      const pad = keyToPad.get(e.key.toLowerCase());
      if (pad) {
        e.preventDefault();
        trigger(pad);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [trigger]);

  const statusLabel = useMemo(() => {
    if (count === 0) return "Tap a pad or press A S D F G H J K";
    return `Last note: ${lastNote} · ${count} played`;
  }, [count, lastNote]);

  return (
    <main className="app">
      <header className="app__header">
        <h1 className="app__title">
          sound<span className="app__title-accent">3pO</span>
        </h1>
        <p className="app__subtitle">A Web Audio synth pad</p>
      </header>

      <section className="pads" aria-label="Synth pads">
        {PADS.map((pad) => (
          <button
            key={pad.id}
            data-testid={pad.id}
            className={`pad${active.has(pad.id) ? " pad--active" : ""}`}
            style={{ "--hue": pad.hue } as React.CSSProperties}
            onPointerDown={() => trigger(pad)}
            aria-label={`Play ${pad.note}`}
          >
            <span className="pad__note">{pad.label}</span>
            <span className="pad__key">{pad.key.toUpperCase()}</span>
          </button>
        ))}
      </section>

      <section className="controls">
        <label className="control">
          <span className="control__label">Waveform</span>
          <div className="control__waveforms" role="group" aria-label="Waveform">
            {WAVEFORMS.map((w) => (
              <button
                key={w}
                type="button"
                className={`chip${w === waveform ? " chip--active" : ""}`}
                onClick={() => setWaveform(w)}
              >
                {w}
              </button>
            ))}
          </div>
        </label>

        <label className="control">
          <span className="control__label">
            Volume <span className="control__value">{Math.round(volume * 100)}%</span>
          </span>
          <input
            className="control__slider"
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={volume}
            onChange={(e) => setVolume(Number(e.target.value))}
            aria-label="Master volume"
          />
        </label>
      </section>

      <footer className="app__status" data-testid="status" aria-live="polite">
        {statusLabel}
      </footer>
    </main>
  );
}
