import '@fontsource/cinzel/500.css';
import '@fontsource/cinzel/600.css';
import '@fontsource/cinzel/700.css';
import '@fontsource/cormorant-garamond/400.css';
import '@fontsource/cormorant-garamond/500.css';
import '@fontsource/cormorant-garamond/400-italic.css';
import '@fontsource/cormorant-garamond/500-italic.css';
import './ui/styles.css';
import { Raycaster, Vector3 } from 'three';
import { Game } from '@/core/Game';
import type { QualityPreset } from '@/render/GraphicsSettings';

/**
 * Entry point. URL flags (for development & automated tests):
 *   ?test=1          — no pointer-lock requirement, exposes window.__TOA
 *   ?quality=low|medium|high|ultra
 *   ?skipTitle=1     — start a new game immediately without the opening scene
 */
function boot(): void {
  const params = new URLSearchParams(location.search);
  const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
  const ui = document.getElementById('ui-root') as HTMLElement;
  const loading = document.getElementById('loading') as HTMLElement;
  const q = params.get('quality');
  try {
    const game = new Game(canvas, ui, {
      testMode: params.has('test'),
      quality: q && ['low', 'medium', 'high', 'ultra'].includes(q) ? (q as QualityPreset) : undefined,
      skipTitle: params.has('skipTitle'),
    });
    game.start();
    // Test mode also exposes a few three.js classes for geometry checks in automated tests.
    (window as unknown as { __TOA: unknown }).__TOA = params.has('test') ? { game, three: { Raycaster, Vector3 } } : { game };
    requestAnimationFrame(() => loading.classList.add('done'));
  } catch (err) {
    console.error(err);
    loading.classList.add('done');
    const box = document.createElement('div');
    box.className = 'error-box';
    box.textContent =
      'The abyss could not be rendered: WebGL 2 is required. ' + (err instanceof Error ? err.message : String(err));
    ui.append(box);
  }
}

boot();
