import { ACESFilmicToneMapping, PCFSoftShadowMap, PerspectiveCamera, SRGBColorSpace, Scene, WebGLRenderer } from 'three';
import { PostFX } from './PostFX';
import type { GraphicsProfile } from './GraphicsSettings';

/** Owns the WebGL context, camera projection, resize handling and the post chain. */
export class GameRenderer {
  readonly renderer: WebGLRenderer;
  readonly scene = new Scene();
  readonly camera: PerspectiveCamera;
  readonly post: PostFX;
  profile: GraphicsProfile;
  baseFov = 58;
  /** Additive FOV offset used for dynamic zoom (impacts, sprint, cinematics). */
  fovOffset = 0;

  constructor(readonly canvas: HTMLCanvasElement, profile: GraphicsProfile) {
    this.profile = profile;
    this.renderer = new WebGLRenderer({
      canvas,
      antialias: false,
      powerPreference: 'high-performance',
      stencil: false,
      preserveDrawingBuffer: false,
    });
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.toneMapping = ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = profile.shadows;
    this.renderer.shadowMap.type = PCFSoftShadowMap;
    this.camera = new PerspectiveCamera(this.baseFov, 1, 0.1, profile.viewDistance);
    this.post = new PostFX(this.renderer, this.scene, this.camera, profile);
    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  applyProfile(profile: GraphicsProfile): void {
    this.profile = profile;
    this.renderer.shadowMap.enabled = profile.shadows;
    this.renderer.shadowMap.needsUpdate = true;
    this.camera.far = profile.viewDistance;
    this.camera.updateProjectionMatrix();
    this.post.applyProfile(profile);
    // Shadow-receiving materials must recompile when shadows are toggled.
    this.scene.traverse((o) => {
      const m = (o as { material?: { needsUpdate: boolean } | Array<{ needsUpdate: boolean }> }).material;
      if (!m) return;
      (Array.isArray(m) ? m : [m]).forEach((x) => (x.needsUpdate = true));
    });
    this.resize();
  }

  resize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const pr = Math.min(window.devicePixelRatio || 1, this.profile.maxPixelRatio) * this.profile.renderScale;
    this.renderer.setPixelRatio(pr);
    this.renderer.setSize(w, h, false);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.post.setSize(w, h, pr);
  }

  render(dt: number): void {
    const fov = this.baseFov + this.fovOffset;
    if (Math.abs(this.camera.fov - fov) > 0.01) {
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }
    this.post.render(dt);
  }
}
