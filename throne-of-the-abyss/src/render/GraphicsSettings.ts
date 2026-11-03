export type QualityPreset = 'low' | 'medium' | 'high' | 'ultra';

export interface GraphicsProfile {
  preset: QualityPreset;
  /** Upper bound for devicePixelRatio (internal render resolution). */
  maxPixelRatio: number;
  /** Render scale applied on top (dynamic resolution). */
  renderScale: number;
  shadows: boolean;
  shadowMapSize: number;
  bloom: boolean;
  bloomStrength: number;
  antialias: 'none' | 'fxaa' | 'smaa';
  /** Multiplier on ambient/combat particle counts. */
  particleDensity: number;
  /** Character outline pass (inverted hull). */
  outlines: boolean;
  /** Max simultaneous dynamic point lights (torches/braziers); the rest are baked to glow only. */
  maxPointLights: number;
  /** Camera far plane / fog-hidden view distance. */
  viewDistance: number;
  /** Film grain + chromatic aberration in the grading pass. */
  filmEffects: boolean;
  /** Planar reflections on lakes and rivers (renders the scene a second time). */
  waterReflections: boolean;
  /** Multiplier on grass / flower instance counts. */
  foliageDensity: number;
  /** Trees farther than this are hidden (metres). */
  treeDistance: number;
}

export const GRAPHICS_PRESETS: Record<QualityPreset, GraphicsProfile> = {
  low: {
    preset: 'low',
    maxPixelRatio: 1,
    renderScale: 0.75,
    shadows: false,
    shadowMapSize: 512,
    bloom: false,
    bloomStrength: 0,
    antialias: 'none',
    particleDensity: 0.35,
    outlines: false,
    maxPointLights: 2,
    viewDistance: 420,
    filmEffects: false,
    waterReflections: false,
    foliageDensity: 0.3,
    treeDistance: 220,
  },
  medium: {
    preset: 'medium',
    maxPixelRatio: 1,
    renderScale: 1,
    shadows: true,
    shadowMapSize: 1024,
    bloom: true,
    bloomStrength: 0.3,
    antialias: 'fxaa',
    particleDensity: 0.6,
    outlines: false,
    maxPointLights: 4,
    viewDistance: 700,
    filmEffects: false,
    waterReflections: false,
    foliageDensity: 0.6,
    treeDistance: 380,
  },
  high: {
    preset: 'high',
    maxPixelRatio: 1.5,
    renderScale: 1,
    shadows: true,
    shadowMapSize: 2048,
    bloom: true,
    bloomStrength: 0.35,
    antialias: 'fxaa',
    particleDensity: 1,
    outlines: false,
    maxPointLights: 6,
    viewDistance: 1100,
    filmEffects: false,
    waterReflections: true,
    foliageDensity: 1,
    treeDistance: 600,
  },
  ultra: {
    preset: 'ultra',
    maxPixelRatio: 2,
    renderScale: 1,
    shadows: true,
    shadowMapSize: 4096,
    bloom: true,
    bloomStrength: 0.4,
    antialias: 'smaa',
    particleDensity: 1.5,
    outlines: false,
    maxPointLights: 8,
    viewDistance: 1500,
    filmEffects: false,
    waterReflections: true,
    foliageDensity: 1.5,
    treeDistance: 900,
  },
};

export function profileFor(preset: QualityPreset): GraphicsProfile {
  return { ...GRAPHICS_PRESETS[preset] };
}
