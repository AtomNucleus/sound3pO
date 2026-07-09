export const CHORD_INTERVALS = {
  maj: [0, 4, 7],
  min: [0, 3, 7],
  maj7: [0, 4, 7, 11],
  min7: [0, 3, 7, 10],
  dom7: [0, 4, 7, 10],
  sus2: [0, 2, 7],
  sus4: [0, 5, 7],
  dim: [0, 3, 6],
  add9: [0, 4, 7, 14],
  min9: [0, 3, 7, 10, 14],
} as const

export type ChordQuality = keyof typeof CHORD_INTERVALS

const ROOT_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const

const QUALITY_SUFFIX: Record<ChordQuality, string> = {
  maj: 'maj',
  min: 'min',
  maj7: 'maj7',
  min7: 'min7',
  dom7: '7',
  sus2: 'sus2',
  sus4: 'sus4',
  dim: 'dim',
  add9: 'add9',
  min9: 'min9',
}

const clampPitchClass = (pitchClass: number): number => {
  const wrapped = pitchClass % 12
  return wrapped < 0 ? wrapped + 12 : wrapped
}

export const rootPcToName = (rootPitchClass: number): string => ROOT_NAMES[clampPitchClass(rootPitchClass)]

export const chordName = (rootPitchClass: number, quality: ChordQuality): string =>
  `${rootPcToName(rootPitchClass)}${QUALITY_SUFFIX[quality]}`

export const chordMidiNotes = (
  rootPitchClass: number,
  quality: ChordQuality,
  octave = 4,
): number[] => {
  const root = octave * 12 + clampPitchClass(rootPitchClass)
  return CHORD_INTERVALS[quality].map((interval) => root + interval)
}
