import type { QualityPreset } from '@/render/GraphicsSettings';

export interface GameSettings {
  quality: QualityPreset;
  mouseSensitivity: number;
  invertY: boolean;
  cameraShake: number;
  damageNumbers: boolean;
  showFps: boolean;
}

const KEY = 'throne_of_the_abyss_settings_v1';

export const DEFAULT_SETTINGS: GameSettings = {
  quality: 'high',
  mouseSensitivity: 1,
  invertY: false,
  cameraShake: 1,
  damageNumbers: true,
  showFps: false,
};

export function loadSettings(): GameSettings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    return { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<GameSettings>) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(s: GameSettings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* storage unavailable (private mode) — settings stay for this session */
  }
}
