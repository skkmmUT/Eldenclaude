import {
  BackSide,
  Color,
  DataTexture,
  DoubleSide,
  Material,
  MeshBasicMaterial,
  MeshToonMaterial,
  NearestFilter,
  RedFormat,
  ShaderMaterial,
  UniformsLib,
  UniformsUtils,
  type Texture,
} from 'three';

/**
 * Shared look-development for the "anime gothic" style:
 *  - cel shading with a 3-band light ramp,
 *  - a global coloured rim light (dramatic back-lighting, tinted per region),
 *  - inverted-hull outlines for characters.
 * Global uniforms are shared by every material so a region can re-tint the whole scene.
 */
export const GlobalShading = {
  rimColor: { value: new Color('#b05cff') },
  rimStrength: { value: 0.55 },
  rimPower: { value: 3.2 },
  time: { value: 0 },
};

let rampCache: DataTexture | null = null;
/** 3-step light ramp (shadow / mid / lit) — the core of the cel look. */
export function toonRamp(): DataTexture {
  if (rampCache) return rampCache;
  const data = new Uint8Array([92, 92, 160, 160, 160, 255, 255, 255]);
  const tex = new DataTexture(data, data.length, 1, RedFormat);
  tex.minFilter = NearestFilter;
  tex.magFilter = NearestFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  rampCache = tex;
  return tex;
}

export interface ToonOptions {
  color: string | number | Color;
  map?: Texture | null;
  emissive?: string | number | Color;
  emissiveIntensity?: number;
  rim?: number; // multiplier on global rim strength (0 disables)
  transparent?: boolean;
  opacity?: number;
  doubleSide?: boolean;
}

const toonCache = new Map<string, MeshToonMaterial>();

/** Creates (or reuses) a toon material with the global rim-light injection. */
export function toonMaterial(opts: ToonOptions): MeshToonMaterial {
  const color = new Color(opts.color as never);
  const key = [
    color.getHexString(),
    opts.map?.uuid ?? '',
    opts.emissive !== undefined ? new Color(opts.emissive as never).getHexString() : '',
    opts.emissiveIntensity ?? 1,
    opts.rim ?? 1,
    opts.transparent ? opts.opacity ?? 1 : '',
    opts.doubleSide ? 'd' : '',
  ].join('|');
  const cached = toonCache.get(key);
  if (cached) return cached;

  const mat = new MeshToonMaterial({
    color,
    map: opts.map ?? null,
    gradientMap: toonRamp(),
    emissive: opts.emissive !== undefined ? new Color(opts.emissive as never) : new Color(0x000000),
    emissiveIntensity: opts.emissiveIntensity ?? 1,
    transparent: !!opts.transparent,
    opacity: opts.opacity ?? 1,
  });
  if (opts.doubleSide) mat.side = DoubleSide;
  const rimMul = opts.rim ?? 1;
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
  float rimBand = smoothstep(0.35, 0.55, fres);
  outgoingLight += uRimColor * rimBand * uRimStrength * uRimMul;
}
#include <opaque_fragment>`,
      );
  };
  mat.customProgramCacheKey = () => `toonRim_${rimMul}`;
  toonCache.set(key, mat);
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

/** Inverted-hull outline shader: extrudes back faces along normals in view space. */
let outlineMat: ShaderMaterial | null = null;
export function outlineMaterial(): ShaderMaterial {
  if (outlineMat) return outlineMat;
  outlineMat = new ShaderMaterial({
    uniforms: UniformsUtils.merge([
      UniformsLib.fog,
      { uThickness: { value: 0.012 }, uColor: { value: new Color('#07030c') } },
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
