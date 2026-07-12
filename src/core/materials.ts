import * as THREE from 'three';

/**
 * Default MOD DESK product palette (Teenage Engineering–inspired).
 */
export const PALETTE = {
  chassis: '#EFEAE2',
  teal: '#3BA8A0',
  orange: '#E8762C',
  vermilion: '#D94F2B',
  mustard: '#D9A82C',
  dark: '#2A2A28',
  cableRed: '#E23B2E',
  mint: '#7EC8A3',
  yellow: '#F0D35A',
  lcdBg: '#0E1A14',
  lcdGreen: '#5CFF9A',
  background: '#DDD8D0',
  whiteKey: '#F5F2EC',
  blackKey: '#1C1C1A',
} as const;

/** Hex/css color or THREE.Color. */
export type ColorInput = THREE.ColorRepresentation;

/**
 * Soft matte plastic — high roughness, slight clearcoat feel.
 * @param color - Base color
 * @param opts - Optional roughness / clearcoat overrides
 */
export function matte(
  color: ColorInput,
  opts: { roughness?: number; clearcoat?: number; clearcoatRoughness?: number; metalness?: number } = {},
): THREE.MeshPhysicalMaterial {
  return new THREE.MeshPhysicalMaterial({
    color,
    roughness: opts.roughness ?? 0.82,
    metalness: opts.metalness ?? 0.02,
    clearcoat: opts.clearcoat ?? 0.18,
    clearcoatRoughness: opts.clearcoatRoughness ?? 0.55,
  });
}

/**
 * Slightly reflective metal (knob rings, jack sleeves, LCD bezels).
 */
export function metal(
  color: ColorInput,
  opts: { roughness?: number; metalness?: number } = {},
): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: opts.roughness ?? 0.35,
    metalness: opts.metalness ?? 0.85,
  });
}

/**
 * Toon / cel-shaded material for clay / toy variants.
 */
export function toon(color: ColorInput, opts: { gradientMap?: THREE.Texture | null } = {}): THREE.MeshToonMaterial {
  return new THREE.MeshToonMaterial({
    color,
    gradientMap: opts.gradientMap ?? null,
  });
}

/**
 * Emissive surface (neon screens, lit pads, night-mode accents).
 */
export function emissive(
  color: ColorInput,
  intensity = 1,
  opts: { roughness?: number } = {},
): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color,
    emissive: color,
    emissiveIntensity: intensity,
    roughness: opts.roughness ?? 0.6,
    metalness: 0.05,
  });
}

/**
 * Factory bag variants can swap in wholesale (PBR / toon / emissive pipelines).
 */
export interface MaterialFactory {
  matte: typeof matte;
  metal: typeof metal;
  toon: typeof toon;
  emissive: typeof emissive;
}

/** Default material factory used by {@link buildDevice}. */
export const defaultMaterials: MaterialFactory = { matte, metal, toon, emissive };
