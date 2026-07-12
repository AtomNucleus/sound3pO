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
  background: '#E4E0D8',
  whiteKey: '#FFFEF9',
  blackKey: '#1C1C1A',
} as const;

/** Hex/css color or THREE.Color. */
export type ColorInput = THREE.ColorRepresentation;

/**
 * Boost saturation/lightness so colors survive ACES Filmic tone mapping.
 * Additive helper — does not change {@link PALETTE} constants.
 */
export function punchColor(color: ColorInput, sat = 1.2, light = 1.06): THREE.Color {
  const c = new THREE.Color(color);
  const hsl = { h: 0, s: 0, l: 0 };
  c.getHSL(hsl);
  // Near-grays (chassis / keys): prefer lightness lift only
  if (hsl.s < 0.08) {
    c.setHSL(hsl.h, hsl.s, Math.min(0.97, hsl.l * light));
    return c;
  }
  c.setHSL(hsl.h, Math.min(1, hsl.s * sat), Math.min(0.72, hsl.l * light));
  return c;
}

/**
 * Soft matte plastic — high roughness, essentially no clearcoat (product-photo plastic).
 * @param color - Base color
 * @param opts - Optional roughness / clearcoat overrides
 */
export function matte(
  color: ColorInput,
  opts: { roughness?: number; clearcoat?: number; clearcoatRoughness?: number; metalness?: number } = {},
): THREE.MeshPhysicalMaterial {
  return new THREE.MeshPhysicalMaterial({
    color,
    roughness: opts.roughness ?? 0.92,
    metalness: opts.metalness ?? 0.0,
    clearcoat: opts.clearcoat ?? 0.0,
    clearcoatRoughness: opts.clearcoatRoughness ?? 1.0,
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
    roughness: opts.roughness ?? 0.45,
    metalness: opts.metalness ?? 0.7,
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
