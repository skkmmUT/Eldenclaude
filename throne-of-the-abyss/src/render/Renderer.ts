import { ACESFilmicToneMapping, PCFSoftShadowMap, PerspectiveCamera, SRGBColorSpace, Scene, WebGLRenderer } from 'three';
import type { Material } from 'three';
import { PostFX } from './PostFX';
import { setTextureAnisotropy } from './TextureFactory';
import type { GraphicsProfile } from './GraphicsSettings';

/** Owns the WebGL context, camera projection, resize handling and the post chain. */
export class GameRenderer {
  readonly renderer: WebGLRenderer;
  readonly scene = new Scene();
  readonly camera: PerspectiveCamera;
  readonly post: PostFX;
  profile: GraphicsProfile;
  baseFov = 60;
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
    this.renderer.toneMappingExposure = 0.85;
    this.renderer.shadowMap.enabled = profile.shadows;
    this.renderer.shadowMap.type = PCFSoftShadowMap;
    this.camera = new PerspectiveCamera(this.baseFov, 1, 0.15, profile.viewDistance);
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
    this.syncMaterials();
    this.resize();
  }

  /**
   * Per-profile material state: recompile for shadow toggles, and with MSAA turn
   * alpha-tested cut-outs (leaves, grass, banners, cloth) into alpha-to-coverage so
   * their edges are smoothed too. Also applies texture anisotropy.
   */
  syncMaterials(): void {
    const a2c = this.profile.msaa > 0;
    this.scene.traverse((o) => {
      const m = (o as { material?: Material | Material[] }).material;
      if (!m) return;
      (Array.isArray(m) ? m : [m]).forEach((x) => {
        if (x.alphaTest > 0) x.alphaToCoverage = a2c;
        x.needsUpdate = true;
      });
    });
    setTextureAnisotropy(Math.min(this.profile.anisotropy, this.renderer.capabilities.getMaxAnisotropy()));
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
