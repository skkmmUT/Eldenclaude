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
  /** Hardware multisampling of the scene render target (0 = off). Smooths geometry edges. */
  msaa: number;
  /** Max anisotropic filtering for surface textures (sharp floors at grazing angles). */
  anisotropy: number;
  /** Screen-space ambient occlusion (soft contact shadows in corners and under objects). */
  ambientOcclusion: boolean;
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
  /** Segment multiplier for smooth procedural geometry (applied when the world is built). */
  geometryDetail: number;
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
    antialias: 'fxaa',
    msaa: 0,
    anisotropy: 4,
    ambientOcclusion: false,
    particleDensity: 0.35,
    outlines: false,
    maxPointLights: 2,
    viewDistance: 420,
    filmEffects: false,
    waterReflections: false,
    foliageDensity: 0.3,
    treeDistance: 220,
    geometryDetail: 0.55,
  },
  medium: {
    preset: 'medium',
    maxPixelRatio: 1,
    renderScale: 1,
    shadows: true,
    shadowMapSize: 1024,
    bloom: true,
    bloomStrength: 0.3,
    antialias: 'none',
    msaa: 4,
    anisotropy: 8,
    ambientOcclusion: false,
    particleDensity: 0.6,
    outlines: false,
    maxPointLights: 4,
    viewDistance: 700,
    filmEffects: false,
    waterReflections: false,
    foliageDensity: 0.6,
    treeDistance: 380,
    geometryDetail: 0.75,
  },
  high: {
    preset: 'high',
    maxPixelRatio: 1.5,
    renderScale: 1,
    shadows: true,
    shadowMapSize: 2048,
    bloom: true,
    bloomStrength: 0.35,
    antialias: 'smaa',
    msaa: 4,
    anisotropy: 16,
    ambientOcclusion: true,
    particleDensity: 1,
    outlines: false,
    maxPointLights: 6,
    viewDistance: 1100,
    filmEffects: false,
    waterReflections: true,
    foliageDensity: 1,
    treeDistance: 600,
    geometryDetail: 1,
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
    msaa: 4,
    anisotropy: 16,
    ambientOcclusion: true,
    particleDensity: 1.5,
    outlines: false,
    maxPointLights: 8,
    viewDistance: 1500,
    filmEffects: false,
    waterReflections: true,
    foliageDensity: 1.5,
    treeDistance: 900,
    geometryDetail: 1.3,
  },
};

export function profileFor(preset: QualityPreset): GraphicsProfile {
  return { ...GRAPHICS_PRESETS[preset] };
}
