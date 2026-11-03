import { Vector2, type PerspectiveCamera, type Scene, type WebGLRenderer } from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js';
import { FXAAShader } from 'three/examples/jsm/shaders/FXAAShader.js';
import type { GraphicsProfile } from './GraphicsSettings';

/** Final colour grade: crushed purple shadows, warm highlights, vignette, grain, CA, damage flash. */
const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uVignette: { value: 0.42 },
    uGrain: { value: 0.035 },
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
      float ca = uAberration * uFilm + uDamage * 0.004;
      if (ca > 0.00001) {
        col.r = texture2D(tDiffuse, vUv + c * ca).r;
        col.g = texture2D(tDiffuse, vUv).g;
        col.b = texture2D(tDiffuse, vUv - c * ca).b;
      } else {
        col = texture2D(tDiffuse, vUv).rgb;
      }
      // split-tone: violet shadows, warm-gold highlights
      float l = dot(col, vec3(0.299, 0.587, 0.114));
      col = mix(col, col * vec3(0.92, 0.86, 1.08), (1.0 - l) * 0.35);
      col = mix(col, col * vec3(1.06, 1.0, 0.92), l * 0.25);
      col = mix(col, vec3(l), uDesaturate);
      // contrast S-curve
      col = clamp(col, 0.0, 1.0);
      col = mix(col, col * col * (3.0 - 2.0 * col), 0.22);
      // vignette (+ crimson damage pulse at the edges)
      float vig = 1.0 - smoothstep(0.08, 0.5, r2) * uVignette;
      col *= vig;
      col = mix(col, vec3(0.55, 0.0, 0.04), uDamage * 0.75 * smoothstep(0.14, 0.5, r2));
      // grain
      float n = hash(vUv * 1024.0 + fract(uTime * 13.0)) - 0.5;
      col += n * uGrain * uFilm;
      col = mix(col, vec3(0.0), uFade);
      gl_FragColor = vec4(col, 1.0);
    }`,
};

/**
 * Post-processing chain: scene → bloom → tone-map/sRGB → grade → AA.
 * Rebuilt whenever the graphics profile changes.
 */
export class PostFX {
  composer: EffectComposer;
  private renderPass: RenderPass;
  private bloom: UnrealBloomPass | null = null;
  readonly grade: ShaderPass;
  private aaPass: ShaderPass | SMAAPass | null = null;
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
    this.composer = new EffectComposer(this.renderer);
    old.dispose();
    this.renderPass = new RenderPass(this.scene, this.camera);
    this.composer.addPass(this.renderPass);
    this.bloom = null;
    if (this.profile.bloom) {
      this.bloom = new UnrealBloomPass(new Vector2(256, 256), this.profile.bloomStrength, 0.55, 0.78);
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
    if (this.aaPass instanceof ShaderPass) {
      this.aaPass.uniforms.resolution.value.set(1 / (width * pixelRatio), 1 / (height * pixelRatio));
    }
  }

  render(dt: number): void {
    this.grade.uniforms.uTime.value += dt;
    this.composer.render(dt);
  }
}
