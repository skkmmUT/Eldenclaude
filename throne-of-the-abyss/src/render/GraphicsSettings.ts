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
  /** Fake volumetric light shafts and ground fog sheets. */
  volumetrics: boolean;
  /** Character outline pass (inverted hull). */
  outlines: boolean;
  /** Max simultaneous dynamic point lights (torches/braziers); the rest are baked to glow only. */
  maxPointLights: number;
  /** Camera far plane / fog-hidden view distance. */
  viewDistance: number;
  /** Film grain + chromatic aberration in the grading pass. */
  filmEffects: boolean;
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
    volumetrics: false,
    outlines: false,
    maxPointLights: 2,
    viewDistance: 140,
    filmEffects: false,
  },
  medium: {
    preset: 'medium',
    maxPixelRatio: 1,
    renderScale: 1,
    shadows: true,
    shadowMapSize: 1024,
    bloom: true,
    bloomStrength: 0.7,
    antialias: 'fxaa',
    particleDensity: 0.6,
    volumetrics: true,
    outlines: true,
    maxPointLights: 4,
    viewDistance: 220,
    filmEffects: false,
  },
  high: {
    preset: 'high',
    maxPixelRatio: 1.5,
    renderScale: 1,
    shadows: true,
    shadowMapSize: 2048,
    bloom: true,
    bloomStrength: 0.85,
    antialias: 'fxaa',
    particleDensity: 1,
    volumetrics: true,
    outlines: true,
    maxPointLights: 6,
    viewDistance: 320,
    filmEffects: true,
  },
  ultra: {
    preset: 'ultra',
    maxPixelRatio: 2,
    renderScale: 1,
    shadows: true,
    shadowMapSize: 4096,
    bloom: true,
    bloomStrength: 0.95,
    antialias: 'smaa',
    particleDensity: 1.5,
    volumetrics: true,
    outlines: true,
    maxPointLights: 8,
    viewDistance: 420,
    filmEffects: true,
  },
};

export function profileFor(preset: QualityPreset): GraphicsProfile {
  return { ...GRAPHICS_PRESETS[preset] };
}
