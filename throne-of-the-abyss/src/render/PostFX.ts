import { HalfFloatType, Vector2, WebGLRenderTarget, type PerspectiveCamera, type Scene, type WebGLRenderer } from 'three';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js';
import { FXAAShader } from 'three/examples/jsm/shaders/FXAAShader.js';
import type { GraphicsProfile } from './GraphicsSettings';

/** Final colour grade: natural saturation/contrast, soft vignette, damage flash, death desaturation. */
const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uVignette: { value: 0.22 },
    uGrain: { value: 0.02 },
    uAberration: { value: 0.0 },
    uDamage: { value: 0.0 },
    uDesaturate: { value: 0.0 },
    uFilm: { value: 1.0 },
    uFade: { value: 0.0 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime, uVignette, uGrain, uAberration, uDamage, uDesaturate, uFilm, uFade;
    varying vec2 vUv;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main() {
      vec2 c = vUv - 0.5;
      float r2 = dot(c, c);
      vec3 col;
      float ca = uAberration * uFilm + uDamage * 0.003;
      if (ca > 0.00001) {
        col.r = texture2D(tDiffuse, vUv + c * ca).r;
        col.g = texture2D(tDiffuse, vUv).g;
        col.b = texture2D(tDiffuse, vUv - c * ca).b;
      } else {
        col = texture2D(tDiffuse, vUv).rgb;
      }
      // Natural grade: gentle saturation and contrast, no colour cast.
      float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(vec3(l), col, 1.06);
      col = mix(col, vec3(l), uDesaturate);
      col = clamp(col, 0.0, 1.0);
      col = mix(col, col * col * (3.0 - 2.0 * col), 0.08);
      col *= 1.0 - smoothstep(0.12, 0.55, r2) * uVignette;
      col = mix(col, vec3(0.55, 0.0, 0.04), uDamage * 0.7 * smoothstep(0.14, 0.5, r2));
      float n = hash(vUv * 1024.0 + fract(uTime * 13.0)) - 0.5;
      col += n * uGrain * uFilm;
      col = mix(col, vec3(0.0), uFade);
      gl_FragColor = vec4(col, 1.0);
    }`,
};

/**
 * Post-processing chain: scene (MSAA) → ambient occlusion → bloom → tone-map/sRGB →
 * grade → post AA (FXAA/SMAA catches shader and alpha aliasing that MSAA misses).
 * Rebuilt whenever the graphics profile changes.
 */
export class PostFX {
  composer: EffectComposer;
  private renderPass: RenderPass;
  private bloom: UnrealBloomPass | null = null;
  readonly grade: ShaderPass;
  private aaPass: ShaderPass | SMAAPass | null = null;
  private ao: GTAOPass | null = null;
  private width = 1;
  private height = 1;
  private pixelRatio = 1;

  constructor(
    private readonly renderer: WebGLRenderer,
    private readonly scene: Scene,
    private readonly camera: PerspectiveCamera,
    private profile: GraphicsProfile,
  ) {
    this.composer = new EffectComposer(renderer);
    this.renderPass = new RenderPass(scene, camera);
    this.grade = new ShaderPass(GradeShader);
    this.build();
  }

  private build(): void {
    const old = this.composer;
    // Half-float target keeps HDR for bloom; `samples` turns on hardware MSAA.
    const target = new WebGLRenderTarget(Math.max(1, this.width), Math.max(1, this.height), {
      type: HalfFloatType,
      samples: this.profile.msaa,
    });
    this.composer = new EffectComposer(this.renderer, target);
    old.dispose();
    this.renderPass = new RenderPass(this.scene, this.camera);
    this.composer.addPass(this.renderPass);
    this.ao = null;
    if (this.profile.ambientOcclusion) {
      this.ao = new GTAOPass(this.scene, this.camera, Math.max(1, this.width), Math.max(1, this.height));
      this.ao.blendIntensity = 0.85;
      this.ao.updateGtaoMaterial({ radius: 0.9, distanceExponent: 1.4, thickness: 1.2, scale: 1.0, samples: 12 });
      this.ao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 12 });
      this.composer.addPass(this.ao);
    }
    this.bloom = null;
    if (this.profile.bloom) {
      this.bloom = new UnrealBloomPass(new Vector2(256, 256), this.profile.bloomStrength, 0.4, 0.92);
      this.composer.addPass(this.bloom);
    }
    this.composer.addPass(new OutputPass());
    this.grade.uniforms.uFilm.value = this.profile.filmEffects ? 1 : 0;
    this.composer.addPass(this.grade);
    this.aaPass = null;
    if (this.profile.antialias === 'fxaa') {
      this.aaPass = new ShaderPass(FXAAShader);
      this.composer.addPass(this.aaPass);
    } else if (this.profile.antialias === 'smaa') {
      this.aaPass = new SMAAPass();
      this.composer.addPass(this.aaPass);
    }
    this.setSize(this.width, this.height, this.pixelRatio);
  }

  applyProfile(profile: GraphicsProfile): void {
    this.profile = profile;
    this.build();
  }

  setSize(width: number, height: number, pixelRatio: number): void {
    this.width = width;
    this.height = height;
    this.pixelRatio = pixelRatio;
    this.composer.setPixelRatio(pixelRatio);
    this.composer.setSize(width, height);
    if (this.bloom) this.bloom.resolution.set(width * pixelRatio * 0.5, height * pixelRatio * 0.5);
    this.ao?.setSize(width * pixelRatio, height * pixelRatio);
    if (this.aaPass instanceof ShaderPass) {
      this.aaPass.uniforms.resolution.value.set(1 / (width * pixelRatio), 1 / (height * pixelRatio));
    }
  }

  render(dt: number): void {
    this.grade.uniforms.uTime.value += dt;
    this.composer.render(dt);
  }
}
