export type EngineMode =
  | 'analog'
  | 'fmBell'
  | 'noise'
  | 'pluck'
  | 'bass'
  | 'pad'
  | 'perc'
  | 'choir'

export type ModDeskJackId =
  | 'osc.out'
  | 'osc.pitchCv'
  | 'filter.in'
  | 'filter.out'
  | 'filter.cutoffCv'
  | 'env.out'
  | 'lfo.out'
  | 'dist.in'
  | 'dist.out'
  | 'delay.in'
  | 'delay.out'
  | 'reverb.in'
  | 'reverb.out'
  | 'master.in'

export interface PatchConnection {
  from: ModDeskJackId
  to: ModDeskJackId
}

export interface SynthParameters {
  engine: EngineMode
  masterVolume: number
  detuneCents: number
  mix: number
  filterCutoff: number
  resonance: number
  filterType: BiquadFilterType
  attack: number
  decay: number
  sustain: number
  release: number
  delayTime: number
  delayFeedback: number
  delayMix: number
  lfoRate: number
  lfoDepth: number
  reverbMix: number
  reverbDecay: number
  distDrive: number
  distMix: number
}

type EngineEnvelopeShape = {
  attackMul: number
  decayMul: number
  sustainMul: number
  releaseMul: number
  peakMul: number
}

type MixUpdater = (mix: number) => void

type VoiceState = {
  note: number
  amp: GainNode
  sources: Array<OscillatorNode | AudioBufferSourceNode>
  detuneTargets: Array<{ param: AudioParam; base: number }>
  mixUpdaters: MixUpdater[]
  startTime: number
  releaseTime: number | null
  envAttack: number
  envDecay: number
  envSustain: number
  envRelease: number
  peak: number
}

const MIN_FILTER_HZ = 40
const MAX_FILTER_HZ = 14_000

export const DEFAULT_PARAMETERS: SynthParameters = {
  engine: 'analog',
  masterVolume: 0.72,
  detuneCents: 0,
  mix: 0.42,
  filterCutoff: 2_300,
  resonance: 5.5,
  filterType: 'lowpass',
  attack: 0.02,
  decay: 0.28,
  sustain: 0.62,
  release: 0.35,
  delayTime: 0.28,
  delayFeedback: 0.35,
  delayMix: 0.23,
  lfoRate: 3.2,
  lfoDepth: 0.24,
  reverbMix: 0.22,
  reverbDecay: 2.4,
  distDrive: 7.2,
  distMix: 0.12,
}

export const DEFAULT_PATCH_CONNECTIONS: PatchConnection[] = [
  { from: 'osc.out', to: 'filter.in' },
  { from: 'filter.out', to: 'dist.in' },
  { from: 'dist.out', to: 'delay.in' },
  { from: 'delay.out', to: 'reverb.in' },
  { from: 'reverb.out', to: 'master.in' },
  { from: 'env.out', to: 'filter.cutoffCv' },
  { from: 'lfo.out', to: 'filter.cutoffCv' },
]

const ENGINE_ENVELOPES: Record<EngineMode, EngineEnvelopeShape> = {
  analog: { attackMul: 1, decayMul: 1, sustainMul: 1, releaseMul: 1, peakMul: 1 },
  fmBell: { attackMul: 0.25, decayMul: 1.8, sustainMul: 0.18, releaseMul: 1.4, peakMul: 0.95 },
  noise: { attackMul: 0.3, decayMul: 1.4, sustainMul: 0.55, releaseMul: 0.8, peakMul: 0.8 },
  pluck: { attackMul: 0.1, decayMul: 0.3, sustainMul: 0.08, releaseMul: 0.35, peakMul: 0.86 },
  bass: { attackMul: 0.5, decayMul: 0.8, sustainMul: 0.86, releaseMul: 0.8, peakMul: 0.95 },
  pad: { attackMul: 2.8, decayMul: 1.2, sustainMul: 0.92, releaseMul: 2.2, peakMul: 0.82 },
  perc: { attackMul: 0.05, decayMul: 0.24, sustainMul: 0.03, releaseMul: 0.24, peakMul: 0.95 },
  choir: { attackMul: 1.8, decayMul: 1.2, sustainMul: 0.88, releaseMul: 1.9, peakMul: 0.8 },
}

const AUDIO_INPUTS: ReadonlyArray<ModDeskJackId> = [
  'filter.in',
  'dist.in',
  'delay.in',
  'reverb.in',
  'master.in',
]

const midiToFrequency = (midiNote: number): number => 440 * Math.pow(2, (midiNote - 69) / 12)

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value))

const createDistortionCurve = (amount: number): Float32Array<ArrayBuffer> => {
  const sampleCount = 44_100
  const curve = new Float32Array(sampleCount) as Float32Array<ArrayBuffer>
  const normalizedAmount = Math.max(0, amount)
  for (let sampleIndex = 0; sampleIndex < sampleCount; sampleIndex += 1) {
    const x = (sampleIndex * 2) / sampleCount - 1
    curve[sampleIndex] =
      ((3 + normalizedAmount) * x * 20 * (Math.PI / 180)) /
      (Math.PI + normalizedAmount * Math.abs(x))
  }
  return curve
}

const createNoiseBuffer = (audioContext: AudioContext): AudioBuffer => {
  const frameCount = audioContext.sampleRate * 2
  const buffer = audioContext.createBuffer(1, frameCount, audioContext.sampleRate)
  const channel = buffer.getChannelData(0)
  for (let index = 0; index < frameCount; index += 1) {
    channel[index] = Math.random() * 2 - 1
  }
  return buffer
}

const createImpulseResponse = (audioContext: AudioContext, decaySeconds: number): AudioBuffer => {
  const frameCount = Math.floor(audioContext.sampleRate * decaySeconds)
  const impulse = audioContext.createBuffer(2, frameCount, audioContext.sampleRate)
  for (let channelIndex = 0; channelIndex < impulse.numberOfChannels; channelIndex += 1) {
    const channel = impulse.getChannelData(channelIndex)
    for (let index = 0; index < frameCount; index += 1) {
      const envelope = Math.pow(1 - index / frameCount, decaySeconds * 1.7)
      channel[index] = (Math.random() * 2 - 1) * envelope
    }
  }
  return impulse
}

export class ModDeskSynthEngine {
  private context: AudioContext | null = null

  private parameters: SynthParameters = { ...DEFAULT_PARAMETERS }

  private patchConnections: PatchConnection[] = [...DEFAULT_PATCH_CONNECTIONS]

  private activeVoices = new Map<number, VoiceState>()

  private modulationFrame = 0

  private noiseBuffer: AudioBuffer | null = null

  private outputNodes: Partial<Record<ModDeskJackId, AudioNode>> = {}

  private inputNodes: Partial<Record<ModDeskJackId, AudioNode>> = {}

  private masterGain: GainNode | null = null

  private filterNode: BiquadFilterNode | null = null

  private distDrive: GainNode | null = null

  private distShaper: WaveShaperNode | null = null

  private distDryGain: GainNode | null = null

  private distWetGain: GainNode | null = null

  private delayNode: DelayNode | null = null

  private delayFeedback: GainNode | null = null

  private delayDryGain: GainNode | null = null

  private delayWetGain: GainNode | null = null

  private reverbConvolver: ConvolverNode | null = null

  private reverbDryGain: GainNode | null = null

  private reverbWetGain: GainNode | null = null

  private previousReverbDecay = -1

  private get hasAudioContext(): boolean {
    return this.context !== null
  }

  public isReady(): boolean {
    return this.hasAudioContext
  }

  public async start(): Promise<void> {
    if (!this.context) {
      this.initializeAudioGraph()
    }
    if (!this.context) {
      return
    }
    if (this.context.state !== 'running') {
      await this.context.resume()
    }
    this.applyAllParameters()
    this.rebuildAudioRouting()
    if (this.modulationFrame === 0) {
      this.modulationFrame = window.requestAnimationFrame(this.modulationTick)
    }
  }

  public updateParameters(partial: Partial<SynthParameters>): void {
    this.parameters = { ...this.parameters, ...partial }
    if (this.hasAudioContext) {
      this.applyAllParameters()
    }
  }

  public setPatchConnections(connections: PatchConnection[]): void {
    this.patchConnections = connections
    if (this.hasAudioContext) {
      this.rebuildAudioRouting()
    }
  }

  public noteOn(note: number, velocity = 0.9): void {
    if (!this.context || !this.masterGain) {
      return
    }
    this.noteOff(note, true)

    const now = this.context.currentTime
    const profile = ENGINE_ENVELOPES[this.parameters.engine]
    const envAttack = clamp(this.parameters.attack * profile.attackMul, 0.003, 3.2)
    const envDecay = clamp(this.parameters.decay * profile.decayMul, 0.01, 4)
    const envSustain = clamp(this.parameters.sustain * profile.sustainMul, 0, 1)
    const envRelease = clamp(this.parameters.release * profile.releaseMul, 0.02, 6)
    const peak = clamp(velocity * profile.peakMul, 0.01, 1)

    const amp = this.context.createGain()
    amp.gain.setValueAtTime(0, now)
    amp.gain.linearRampToValueAtTime(peak, now + envAttack)
    amp.gain.linearRampToValueAtTime(peak * envSustain, now + envAttack + envDecay)
    amp.connect(this.outputNodes['osc.out']!)

    const frequency = midiToFrequency(note)
    const constructed = this.createVoiceSources(this.parameters.engine, frequency, amp)
    for (const source of constructed.sources) {
      source.start(now)
    }

    const voice: VoiceState = {
      note,
      amp,
      sources: constructed.sources,
      detuneTargets: constructed.detuneTargets,
      mixUpdaters: constructed.mixUpdaters,
      startTime: now,
      releaseTime: null,
      envAttack,
      envDecay,
      envSustain,
      envRelease,
      peak,
    }
    this.activeVoices.set(note, voice)
  }

  public noteOff(note: number, force = false): void {
    if (!this.context) {
      return
    }
    const voice = this.activeVoices.get(note)
    if (!voice) {
      return
    }
    if (voice.releaseTime !== null && !force) {
      return
    }

    const now = this.context.currentTime
    const releaseDuration = force ? 0.015 : voice.envRelease
    voice.amp.gain.cancelScheduledValues(now)
    voice.amp.gain.setValueAtTime(voice.amp.gain.value, now)
    voice.amp.gain.linearRampToValueAtTime(0.0001, now + releaseDuration)

    voice.releaseTime = now
    const stopAt = now + releaseDuration + 0.08
    for (const source of voice.sources) {
      try {
        source.stop(stopAt)
      } catch {
        // Some one-shot sources (pluck excitation/noise clicks) may already be stopped.
      }
    }

    window.setTimeout(() => {
      for (const source of voice.sources) {
        source.disconnect()
      }
      voice.amp.disconnect()
      this.activeVoices.delete(note)
    }, Math.ceil((releaseDuration + 0.2) * 1000))
  }

  public allNotesOff(): void {
    for (const note of this.activeVoices.keys()) {
      this.noteOff(note, true)
    }
  }

  public dispose(): void {
    this.allNotesOff()
    if (this.modulationFrame !== 0) {
      window.cancelAnimationFrame(this.modulationFrame)
      this.modulationFrame = 0
    }
    if (this.context && this.context.state !== 'closed') {
      void this.context.close()
    }
    this.context = null
    this.noiseBuffer = null
  }

  private modulationTick = (): void => {
    if (!this.context || !this.filterNode) {
      this.modulationFrame = 0
      return
    }

    const now = this.context.currentTime
    const lfoWave = Math.sin(now * this.parameters.lfoRate * Math.PI * 2)
    const lfoToFilter = this.isPatched('lfo.out', 'filter.cutoffCv')
    const envToFilter = this.isPatched('env.out', 'filter.cutoffCv')
    const lfoToPitch = this.isPatched('lfo.out', 'osc.pitchCv')
    const envToPitch = this.isPatched('env.out', 'osc.pitchCv')

    let envAccumulator = 0
    let envCount = 0
    for (const voice of this.activeVoices.values()) {
      const envValue = this.sampleVoiceEnvelope(voice, now)
      envAccumulator += envValue
      envCount += 1

      for (const updater of voice.mixUpdaters) {
        updater(this.parameters.mix)
      }

      const pitchLfoDepth = lfoToPitch ? this.parameters.lfoDepth * 52 * lfoWave : 0
      const pitchEnvDepth = envToPitch ? envValue * this.parameters.lfoDepth * 24 : 0
      for (const target of voice.detuneTargets) {
        const detuneValue = target.base + this.parameters.detuneCents + pitchLfoDepth + pitchEnvDepth
        target.param.setTargetAtTime(detuneValue, now, 0.01)
      }
    }

    const envAverage = envCount > 0 ? envAccumulator / envCount : 0
    let cutoffTarget = this.parameters.filterCutoff
    if (lfoToFilter) {
      cutoffTarget += lfoWave * this.parameters.lfoDepth * 2_800
    }
    if (envToFilter) {
      cutoffTarget += envAverage * 2_600
    }
    const clampedCutoff = clamp(cutoffTarget, MIN_FILTER_HZ, MAX_FILTER_HZ)
    this.filterNode.frequency.setTargetAtTime(clampedCutoff, now, 0.015)

    this.modulationFrame = window.requestAnimationFrame(this.modulationTick)
  }

  private sampleVoiceEnvelope(voice: VoiceState, now: number): number {
    if (voice.releaseTime !== null) {
      const releasedFor = now - voice.releaseTime
      const releaseProgress = clamp(releasedFor / voice.envRelease, 0, 1)
      return (1 - releaseProgress) * voice.envSustain
    }

    const elapsed = now - voice.startTime
    if (elapsed <= voice.envAttack) {
      return voice.envAttack === 0 ? 1 : elapsed / voice.envAttack
    }
    const decayElapsed = elapsed - voice.envAttack
    if (decayElapsed <= voice.envDecay) {
      const decayProgress = voice.envDecay === 0 ? 1 : decayElapsed / voice.envDecay
      return 1 - decayProgress * (1 - voice.envSustain)
    }
    return voice.envSustain
  }

  private createVoiceSources(
    engine: EngineMode,
    frequency: number,
    voiceOutput: GainNode,
  ): {
    sources: Array<OscillatorNode | AudioBufferSourceNode>
    detuneTargets: Array<{ param: AudioParam; base: number }>
    mixUpdaters: MixUpdater[]
  } {
    if (!this.context || !this.noiseBuffer) {
      return { sources: [], detuneTargets: [], mixUpdaters: [] }
    }

    const sources: Array<OscillatorNode | AudioBufferSourceNode> = []
    const detuneTargets: Array<{ param: AudioParam; base: number }> = []
    const mixUpdaters: MixUpdater[] = []

    const addOscillator = (
      type: OscillatorType,
      freq: number,
      gainValue: number,
      baseDetune = 0,
    ): { osc: OscillatorNode; gain: GainNode } => {
      const oscillator = this.context!.createOscillator()
      oscillator.type = type
      oscillator.frequency.value = freq
      oscillator.detune.value = baseDetune + this.parameters.detuneCents
      const gain = this.context!.createGain()
      gain.gain.value = gainValue
      oscillator.connect(gain).connect(voiceOutput)
      sources.push(oscillator)
      detuneTargets.push({ param: oscillator.detune, base: baseDetune })
      return { osc: oscillator, gain }
    }

    if (engine === 'analog') {
      const saw = addOscillator('sawtooth', frequency, 0.6, -5)
      const square = addOscillator('square', frequency, 0.4, 5)
      const triangle = addOscillator('triangle', frequency * 0.5, 0.15, 2)
      mixUpdaters.push((mix) => {
        saw.gain.gain.setTargetAtTime(clamp(1 - mix * 0.9, 0.12, 1), this.context!.currentTime, 0.03)
        square.gain.gain.setTargetAtTime(clamp(0.2 + mix * 0.85, 0.12, 1), this.context!.currentTime, 0.03)
        triangle.gain.gain.setTargetAtTime(clamp(0.05 + (1 - mix) * 0.2, 0.04, 0.3), this.context!.currentTime, 0.03)
      })
    } else if (engine === 'fmBell') {
      const carrier = addOscillator('sine', frequency, 0.82)
      const modulator = this.context.createOscillator()
      modulator.type = 'sine'
      modulator.frequency.value = frequency * 2.1
      const modAmount = this.context.createGain()
      modAmount.gain.value = frequency * 0.8
      modulator.connect(modAmount).connect(carrier.osc.frequency)
      mixUpdaters.push((mix) => {
        modAmount.gain.setTargetAtTime(frequency * (0.2 + mix * 4.2), this.context!.currentTime, 0.05)
      })
      sources.push(modulator)
      carrier.osc.detune.value = this.parameters.detuneCents
      detuneTargets.push({ param: modulator.detune, base: 0 })
      mixUpdaters.push((mix) => {
        carrier.gain.gain.setTargetAtTime(0.4 + (1 - mix) * 0.52, this.context!.currentTime, 0.04)
      })
    } else if (engine === 'noise') {
      const noiseSource = this.context.createBufferSource()
      noiseSource.buffer = this.noiseBuffer
      noiseSource.loop = true
      const noiseBand = this.context.createBiquadFilter()
      noiseBand.type = 'bandpass'
      noiseBand.frequency.value = 1_000
      noiseBand.Q.value = 0.8
      const noiseGain = this.context.createGain()
      noiseGain.gain.value = 0.48
      noiseSource.connect(noiseBand).connect(noiseGain).connect(voiceOutput)
      mixUpdaters.push((mix) => {
        noiseBand.frequency.setTargetAtTime(350 + mix * 2_800, this.context!.currentTime, 0.05)
        noiseBand.Q.setTargetAtTime(0.5 + mix * 12, this.context!.currentTime, 0.05)
      })
      sources.push(noiseSource)
    } else if (engine === 'pluck') {
      const excitation = this.context.createBufferSource()
      excitation.buffer = this.noiseBuffer
      excitation.loop = true
      const delay = this.context.createDelay(1)
      delay.delayTime.value = 1 / frequency
      const feedback = this.context.createGain()
      feedback.gain.value = 0.86
      const tone = this.context.createBiquadFilter()
      tone.type = 'lowpass'
      tone.frequency.value = frequency * 4.2
      tone.Q.value = 0.8
      const damp = this.context.createGain()
      damp.gain.value = 0.72
      excitation.connect(delay)
      delay.connect(tone).connect(damp).connect(voiceOutput)
      delay.connect(feedback).connect(delay)
      mixUpdaters.push((mix) => {
        tone.frequency.setTargetAtTime(frequency * (2.2 + mix * 5.3), this.context!.currentTime, 0.04)
        feedback.gain.setTargetAtTime(0.72 + mix * 0.2, this.context!.currentTime, 0.04)
      })
      sources.push(excitation)
      window.setTimeout(() => {
        const cutTime = this.context ? this.context.currentTime + 0.02 : 0
        if (cutTime > 0) {
          excitation.stop(cutTime)
        }
      }, 35)
    } else if (engine === 'bass') {
      const square = addOscillator('square', frequency, 0.52, -2)
      const sub = addOscillator('sine', frequency * 0.5, 0.68, 0)
      const mid = addOscillator('triangle', frequency, 0.18, 2)
      mixUpdaters.push((mix) => {
        square.gain.gain.setTargetAtTime(0.28 + mix * 0.72, this.context!.currentTime, 0.04)
        sub.gain.gain.setTargetAtTime(0.86 - mix * 0.28, this.context!.currentTime, 0.04)
        mid.gain.gain.setTargetAtTime(0.2 + mix * 0.35, this.context!.currentTime, 0.04)
      })
    } else if (engine === 'pad') {
      const saw = addOscillator('sawtooth', frequency, 0.44, -7)
      const tri = addOscillator('triangle', frequency, 0.38, 7)
      const sine = addOscillator('sine', frequency * 0.5, 0.28, 0)
      mixUpdaters.push((mix) => {
        saw.gain.gain.setTargetAtTime(0.25 + mix * 0.65, this.context!.currentTime, 0.06)
        tri.gain.gain.setTargetAtTime(0.5 + (1 - mix) * 0.35, this.context!.currentTime, 0.06)
        sine.gain.gain.setTargetAtTime(0.15 + mix * 0.25, this.context!.currentTime, 0.06)
      })
    } else if (engine === 'perc') {
      const tone = addOscillator('sine', frequency * 2, 0.74)
      const clickNoise = this.context.createBufferSource()
      clickNoise.buffer = this.noiseBuffer
      const clickFilter = this.context.createBiquadFilter()
      clickFilter.type = 'highpass'
      clickFilter.frequency.value = 2_100
      const clickGain = this.context.createGain()
      clickGain.gain.setValueAtTime(0.28, this.context.currentTime)
      clickGain.gain.exponentialRampToValueAtTime(0.0001, this.context.currentTime + 0.05)
      clickNoise.connect(clickFilter).connect(clickGain).connect(voiceOutput)
      mixUpdaters.push((mix) => {
        tone.gain.gain.setTargetAtTime(0.35 + (1 - mix) * 0.48, this.context!.currentTime, 0.03)
      })
      sources.push(clickNoise)
    } else {
      const formantOne = addOscillator('sawtooth', frequency, 0.35, -6)
      const formantTwo = addOscillator('triangle', frequency * 1.01, 0.35, 6)
      const formantFilterA = this.context.createBiquadFilter()
      const formantFilterB = this.context.createBiquadFilter()
      formantFilterA.type = 'bandpass'
      formantFilterB.type = 'bandpass'
      formantFilterA.frequency.value = 900
      formantFilterB.frequency.value = 1_600
      formantFilterA.Q.value = 3
      formantFilterB.Q.value = 5
      formantOne.gain.disconnect()
      formantTwo.gain.disconnect()
      formantOne.gain.connect(formantFilterA).connect(voiceOutput)
      formantTwo.gain.connect(formantFilterB).connect(voiceOutput)
      mixUpdaters.push((mix) => {
        formantFilterA.frequency.setTargetAtTime(500 + mix * 900, this.context!.currentTime, 0.07)
        formantFilterB.frequency.setTargetAtTime(1_100 + mix * 1_400, this.context!.currentTime, 0.07)
        formantFilterA.Q.setTargetAtTime(2 + mix * 5, this.context!.currentTime, 0.07)
      })
    }

    for (const updater of mixUpdaters) {
      updater(this.parameters.mix)
    }

    return { sources, detuneTargets, mixUpdaters }
  }

  private isPatched(from: ModDeskJackId, to: ModDeskJackId): boolean {
    return this.patchConnections.some((connection) => connection.from === from && connection.to === to)
  }

  private initializeAudioGraph(): void {
    this.context = new AudioContext()
    this.noiseBuffer = createNoiseBuffer(this.context)

    const oscOut = this.context.createGain()
    oscOut.gain.value = 1

    const filterIn = this.context.createGain()
    const filterNode = this.context.createBiquadFilter()
    const filterOut = this.context.createGain()
    filterNode.type = this.parameters.filterType
    filterIn.connect(filterNode).connect(filterOut)

    const distIn = this.context.createGain()
    const distOut = this.context.createGain()
    const distDrive = this.context.createGain()
    const distShaper = this.context.createWaveShaper()
    distShaper.oversample = '4x'
    const distDryGain = this.context.createGain()
    const distWetGain = this.context.createGain()
    distIn.connect(distDryGain).connect(distOut)
    distIn.connect(distDrive).connect(distShaper).connect(distWetGain).connect(distOut)

    const delayIn = this.context.createGain()
    const delayOut = this.context.createGain()
    const delayDry = this.context.createGain()
    const delayWet = this.context.createGain()
    const delayNode = this.context.createDelay(1.2)
    const delayFeedback = this.context.createGain()
    delayIn.connect(delayDry).connect(delayOut)
    delayIn.connect(delayNode).connect(delayWet).connect(delayOut)
    delayNode.connect(delayFeedback).connect(delayNode)

    const reverbIn = this.context.createGain()
    const reverbOut = this.context.createGain()
    const reverbDry = this.context.createGain()
    const reverbWet = this.context.createGain()
    const convolver = this.context.createConvolver()
    reverbIn.connect(reverbDry).connect(reverbOut)
    reverbIn.connect(convolver).connect(reverbWet).connect(reverbOut)

    const masterGain = this.context.createGain()
    const limiter = this.context.createDynamicsCompressor()
    limiter.threshold.value = -11
    limiter.knee.value = 18
    limiter.ratio.value = 7
    limiter.attack.value = 0.003
    limiter.release.value = 0.11
    masterGain.connect(limiter).connect(this.context.destination)

    this.outputNodes = {
      'osc.out': oscOut,
      'filter.out': filterOut,
      'dist.out': distOut,
      'delay.out': delayOut,
      'reverb.out': reverbOut,
    }
    this.inputNodes = {
      'filter.in': filterIn,
      'dist.in': distIn,
      'delay.in': delayIn,
      'reverb.in': reverbIn,
      'master.in': masterGain,
    }

    this.masterGain = masterGain
    this.filterNode = filterNode
    this.distDrive = distDrive
    this.distShaper = distShaper
    this.distDryGain = distDryGain
    this.distWetGain = distWetGain
    this.delayNode = delayNode
    this.delayFeedback = delayFeedback
    this.delayDryGain = delayDry
    this.delayWetGain = delayWet
    this.reverbConvolver = convolver
    this.reverbDryGain = reverbDry
    this.reverbWetGain = reverbWet
  }

  private applyAllParameters(): void {
    if (
      !this.context ||
      !this.masterGain ||
      !this.filterNode ||
      !this.distDrive ||
      !this.distShaper ||
      !this.distDryGain ||
      !this.distWetGain ||
      !this.delayNode ||
      !this.delayFeedback ||
      !this.delayDryGain ||
      !this.delayWetGain ||
      !this.reverbConvolver ||
      !this.reverbDryGain ||
      !this.reverbWetGain
    ) {
      return
    }

    const now = this.context.currentTime
    this.masterGain.gain.setTargetAtTime(clamp(this.parameters.masterVolume, 0, 1), now, 0.03)
    this.filterNode.type = this.parameters.filterType
    this.filterNode.frequency.setTargetAtTime(
      clamp(this.parameters.filterCutoff, MIN_FILTER_HZ, MAX_FILTER_HZ),
      now,
      0.03,
    )
    this.filterNode.Q.setTargetAtTime(clamp(this.parameters.resonance, 0.01, 24), now, 0.03)

    this.distDrive.gain.setTargetAtTime(clamp(this.parameters.distDrive, 1, 42), now, 0.04)
    this.distDryGain.gain.setTargetAtTime(1 - this.parameters.distMix, now, 0.04)
    this.distWetGain.gain.setTargetAtTime(this.parameters.distMix, now, 0.04)
    this.rebuildDistortionCurve()

    this.delayNode.delayTime.setTargetAtTime(clamp(this.parameters.delayTime, 0.01, 1), now, 0.04)
    this.delayFeedback.gain.setTargetAtTime(clamp(this.parameters.delayFeedback, 0, 0.96), now, 0.04)
    this.delayDryGain.gain.setTargetAtTime(1 - this.parameters.delayMix, now, 0.04)
    this.delayWetGain.gain.setTargetAtTime(this.parameters.delayMix, now, 0.04)

    this.reverbDryGain.gain.setTargetAtTime(1 - this.parameters.reverbMix, now, 0.06)
    this.reverbWetGain.gain.setTargetAtTime(this.parameters.reverbMix, now, 0.06)
    if (Math.abs(this.parameters.reverbDecay - this.previousReverbDecay) > 0.07) {
      this.reverbConvolver.buffer = createImpulseResponse(
        this.context,
        clamp(this.parameters.reverbDecay, 0.4, 6.5),
      )
      this.previousReverbDecay = this.parameters.reverbDecay
    }
  }

  private rebuildDistortionCurve(): void {
    if (!this.context || !this.distShaper) {
      return
    }
    const curveAmount = 28 + this.parameters.distDrive * 2.3
    this.distShaper.curve = createDistortionCurve(curveAmount)
  }

  private rebuildAudioRouting(): void {
    for (const outputNode of Object.values(this.outputNodes)) {
      if (!outputNode) {
        continue
      }
      try {
        outputNode.disconnect()
      } catch {
        // No-op: disconnect can throw when there are no active connections.
      }
    }

    const validAudioConnections = this.patchConnections.filter((connection) =>
      AUDIO_INPUTS.includes(connection.to),
    )

    for (const connection of validAudioConnections) {
      const fromNode = this.outputNodes[connection.from]
      const toNode = this.inputNodes[connection.to]
      if (!fromNode || !toNode) {
        continue
      }
      fromNode.connect(toNode)
    }
  }
}
