import { banneredClothTexture, flagstoneTexture, wallTexture } from '@/render/TextureFactory';
import { glowMaterial, surfaceMaterial } from '@/render/Materials';
import type { BuildCtx } from './Architecture';

/** Natural, daylight-friendly material palette for architecture (grey stone, slate, oak, gold). */
export function architectureMaterials(): BuildCtx['mats'] {
  const stoneTex = wallTexture();
  const floorTex = flagstoneTexture();
  const banner = surfaceMaterial({ color: '#ffffff', map: banneredClothTexture('#7a1424', '#d8a83c', '#d8a83c'), roughness: 0.95, doubleSide: true });
  (banner as { alphaTest: number }).alphaTest = 0.5;
  return {
    stone: surfaceMaterial({ color: '#c4bdb1', map: stoneTex, roughness: 0.9 }),
    stoneDark: surfaceMaterial({ color: '#a39b8f', map: stoneTex, roughness: 0.92 }),
    floor: surfaceMaterial({ color: '#bdb4a6', map: floorTex, roughness: 0.88 }),
    trim: surfaceMaterial({ color: '#d4a64a', metalness: 0.9, roughness: 0.32 }),
    wood: surfaceMaterial({ color: '#6b4a30', roughness: 0.85 }),
    iron: surfaceMaterial({ color: '#4a4a52', metalness: 0.65, roughness: 0.5 }),
    bark: surfaceMaterial({ color: '#5a4630', roughness: 0.95 }),
    glowCrimson: glowMaterial('#ff6a4a', 1.1),
    glowViolet: glowMaterial('#b08cff', 1.4),
    banner,
    statue: surfaceMaterial({ color: '#c9c3b8', map: stoneTex, roughness: 0.8 }),
    roof: surfaceMaterial({ color: '#4c5866', roughness: 0.7, metalness: 0.1 }),
    window: surfaceMaterial({ color: '#202a36', roughness: 0.3, metalness: 0.2 }),
  };
}
