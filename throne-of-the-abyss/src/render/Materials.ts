import {
  BackSide,
  Color,
  DoubleSide,
  Material,
  MeshBasicMaterial,
  MeshStandardMaterial,
  ShaderMaterial,
  UniformsLib,
  UniformsUtils,
  type Texture,
} from 'three';

/**
 * Shared look-development: physically based materials (roughness / metalness, lit by the
 * sun, the sky's image-based lighting and reflections). A very subtle optional fresnel
 * "sheen" keeps characters readable at a distance without a cartoon look.
 */
export const GlobalShading = {
  rimColor: { value: new Color('#fff4e0') },
  rimStrength: { value: 0.06 },
  rimPower: { value: 4.0 },
  time: { value: 0 },
};

export interface SurfaceOptions {
  color: string | number | Color;
  map?: Texture | null;
  roughness?: number;
  metalness?: number;
  emissive?: string | number | Color;
  emissiveIntensity?: number;
  /** Multiplier on the global fresnel sheen (0 disables, 1 = characters). */
  rim?: number;
  transparent?: boolean;
  opacity?: number;
  doubleSide?: boolean;
  vertexColors?: boolean;
  flatShading?: boolean;
}

const cache = new Map<string, MeshStandardMaterial>();

/** Creates (or reuses) a PBR surface material. */
export function surfaceMaterial(opts: SurfaceOptions): MeshStandardMaterial {
  const color = new Color(opts.color as never);
  const key = [
    color.getHexString(),
    opts.map?.uuid ?? '',
    opts.roughness ?? 0.85,
    opts.metalness ?? 0,
    opts.emissive !== undefined ? new Color(opts.emissive as never).getHexString() : '',
    opts.emissiveIntensity ?? 1,
    opts.rim ?? 0,
    opts.transparent ? opts.opacity ?? 1 : '',
    opts.doubleSide ? 'd' : '',
    opts.vertexColors ? 'v' : '',
    opts.flatShading ? 'f' : '',
  ].join('|');
  const cached = cache.get(key);
  if (cached) return cached;

  const mat = new MeshStandardMaterial({
    color,
    map: opts.map ?? null,
    roughness: opts.roughness ?? 0.85,
    metalness: opts.metalness ?? 0,
    emissive: opts.emissive !== undefined ? new Color(opts.emissive as never) : new Color(0x000000),
    emissiveIntensity: opts.emissiveIntensity ?? 1,
    transparent: !!opts.transparent,
    opacity: opts.opacity ?? 1,
    vertexColors: !!opts.vertexColors,
    flatShading: !!opts.flatShading,
  });
  if (opts.doubleSide) mat.side = DoubleSide;
  const rimMul = opts.rim ?? 0;
  if (rimMul > 0) {
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uRimColor = GlobalShading.rimColor;
      shader.uniforms.uRimStrength = GlobalShading.rimStrength;
      shader.uniforms.uRimPower = GlobalShading.rimPower;
      shader.uniforms.uRimMul = { value: rimMul };
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
uniform vec3 uRimColor; uniform float uRimStrength; uniform float uRimPower; uniform float uRimMul;`,
        )
        .replace(
          '#include <opaque_fragment>',
          `{
  vec3 vdir = normalize(vViewPosition);
  float fres = pow(1.0 - clamp(dot(normal, vdir), 0.0, 1.0), uRimPower);
  outgoingLight += uRimColor * fres * uRimStrength * uRimMul;
}
#include <opaque_fragment>`,
        );
    };
    mat.customProgramCacheKey = () => `pbrRim_${rimMul}`;
  }
  cache.set(key, mat);
  return mat;
}

/** Unlit emissive material for glowing runes, eyes, flames (feeds the bloom pass). */
const glowCache = new Map<string, MeshBasicMaterial>();
export function glowMaterial(color: string | number, intensity = 1, transparent = false, opacity = 1): MeshBasicMaterial {
  const key = `${color}|${intensity}|${transparent}|${opacity}`;
  const cached = glowCache.get(key);
  if (cached) return cached;
  const c = new Color(color as never).multiplyScalar(intensity);
  const mat = new MeshBasicMaterial({ color: c, transparent, opacity, depthWrite: !transparent, fog: false });
  if (transparent) mat.toneMapped = false;
  glowCache.set(key, mat);
  return mat;
}

/** Inverted-hull outline shader (optional stylisation; disabled in the default presets). */
let outlineMat: ShaderMaterial | null = null;
export function outlineMaterial(): ShaderMaterial {
  if (outlineMat) return outlineMat;
  outlineMat = new ShaderMaterial({
    uniforms: UniformsUtils.merge([
      UniformsLib.fog,
      { uThickness: { value: 0.008 }, uColor: { value: new Color('#14100c') } },
    ]),
    vertexShader: /* glsl */ `
      uniform float uThickness;
      #include <fog_pars_vertex>
      void main() {
        vec3 n = normalize(normalMatrix * normal);
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        float dist = clamp(-mvPosition.z, 1.0, 40.0);
        mvPosition.xyz += n * uThickness * (0.6 + dist * 0.06);
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      #include <fog_pars_fragment>
      void main() {
        gl_FragColor = vec4(uColor, 1.0);
        #include <fog_fragment>
      }`,
    side: BackSide,
    fog: true,
  });
  return outlineMat;
}

export function disposeMaterial(m: Material | Material[]): void {
  (Array.isArray(m) ? m : [m]).forEach((x) => x.dispose());
}
