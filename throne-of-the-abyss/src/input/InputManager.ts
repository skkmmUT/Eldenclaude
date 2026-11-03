import { DEFAULT_BINDINGS } from '@/data/inputBindings';
import type { BindingMap, InputActionId } from './InputActions';

interface ActionState {
  down: boolean;
  pressed: boolean; // went down this frame
  released: boolean; // went up this frame
  holdTime: number; // seconds held (valid while down and on the release frame)
}

const PAD_DEADZONE = 0.18;

/**
 * Polls keyboard/mouse/gamepad once per frame and exposes logical actions.
 * Raw events only set "physical" flags; `update()` turns them into per-frame edges so
 * a press is never lost between frames, even if down+up happen within one frame.
 */
export class InputManager {
  private bindings: BindingMap;
  private physicalDown = new Set<string>();
  private physicalPressedThisFrame = new Set<string>();
  private actions = new Map<InputActionId, ActionState>();
  private mouseDX = 0;
  private mouseDY = 0;
  private wheelAccum = 0;
  private gamepadIndex: number | null = null;

  /** Normalised move intent in camera space: x = right, y = forward. */
  readonly move = { x: 0, y: 0 };
  /** Look delta for this frame (pixels-equivalent). */
  readonly look = { x: 0, y: 0 };
  wheel = 0;
  /** True when the last meaningful input came from a gamepad (UI glyph hints). */
  usingGamepad = false;
  mouseSensitivity = 1;
  invertY = false;
  /** Allows mouse buttons without pointer lock (automated tests, menus). */
  allowUnlockedMouse = false;
  enabled = true;

  constructor(private readonly element: HTMLElement, bindings: BindingMap = DEFAULT_BINDINGS) {
    this.bindings = bindings;
    for (const id of Object.keys(bindings) as InputActionId[]) {
      this.actions.set(id, { down: false, pressed: false, released: false, holdTime: 0 });
    }
    this.attach();
  }

  get pointerLocked(): boolean {
    return document.pointerLockElement === this.element;
  }

  requestPointerLock(): void {
    if (this.pointerLocked) return;
    try {
      const p = this.element.requestPointerLock() as unknown as Promise<void> | undefined;
      if (p && typeof p.catch === 'function') p.catch(() => undefined);
    } catch {
      /* not available (headless / iframe) */
    }
  }

  exitPointerLock(): void {
    if (this.pointerLocked) document.exitPointerLock();
  }

  private attach(): void {
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Tab' || e.code === 'Space' || e.code.startsWith('Arrow') || e.altKey) e.preventDefault();
      if (!e.repeat) this.setPhysical(e.code, true);
      this.usingGamepad = false;
    });
    window.addEventListener('keyup', (e) => this.setPhysical(e.code, false));
    window.addEventListener('blur', () => {
      this.physicalDown.clear();
    });
    window.addEventListener('mousedown', (e) => {
      if (!this.pointerLocked && !this.allowUnlockedMouse) return;
      this.setPhysical(`Mouse${e.button}`, true);
      this.usingGamepad = false;
    });
    window.addEventListener('mouseup', (e) => this.setPhysical(`Mouse${e.button}`, false));
    window.addEventListener('mousemove', (e) => {
      if (!this.pointerLocked) return;
      this.mouseDX += e.movementX;
      this.mouseDY += e.movementY;
    });
    window.addEventListener(
      'wheel',
      (e) => {
        this.wheelAccum += Math.sign(e.deltaY);
      },
      { passive: true },
    );
    window.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('gamepadconnected', (e) => {
      this.gamepadIndex = (e as GamepadEvent).gamepad.index;
    });
    window.addEventListener('gamepaddisconnected', () => {
      this.gamepadIndex = null;
    });
  }

  private setPhysical(code: string, down: boolean): void {
    if (down) {
      if (!this.physicalDown.has(code)) this.physicalPressedThisFrame.add(code);
      this.physicalDown.add(code);
    } else {
      this.physicalDown.delete(code);
    }
  }

  /** Synthetic input — used by automated play tests and on-screen debug tools. */
  simulate(code: string, down: boolean): void {
    this.setPhysical(code, down);
  }

  update(dt: number): void {
    // --- Gamepad polling -------------------------------------------------------
    let padMoveX = 0;
    let padMoveY = 0;
    let padLookX = 0;
    let padLookY = 0;
    const pads = typeof navigator !== 'undefined' && navigator.getGamepads ? navigator.getGamepads() : [];
    const pad = this.gamepadIndex !== null ? pads[this.gamepadIndex] : null;
    if (pad) {
      pad.buttons.forEach((b, i) => {
        const code = `Pad${i}`;
        const isDown = b.pressed || b.value > 0.5;
        if (isDown && !this.physicalDown.has(code)) this.usingGamepad = true;
        this.setPhysical(code, isDown);
      });
      const dz = (v: number) => (Math.abs(v) < PAD_DEADZONE ? 0 : (v - Math.sign(v) * PAD_DEADZONE) / (1 - PAD_DEADZONE));
      padMoveX = dz(pad.axes[0] ?? 0);
      padMoveY = -dz(pad.axes[1] ?? 0);
      padLookX = dz(pad.axes[2] ?? 0);
      padLookY = dz(pad.axes[3] ?? 0);
      if (padMoveX || padMoveY || padLookX || padLookY) this.usingGamepad = true;
    }

    // --- Actions -------------------------------------------------------------------
    for (const [id, st] of this.actions) {
      const codes = this.bindings[id];
      let down = false;
      let pressed = false;
      for (const c of codes) {
        if (this.physicalDown.has(c)) down = true;
        if (this.physicalPressedThisFrame.has(c)) pressed = true;
      }
      if (!this.enabled) {
        down = false;
        pressed = false;
      }
      const wasDown = st.down;
      st.pressed = pressed || (down && !wasDown);
      st.released = wasDown && !down;
      if (st.pressed && !wasDown) st.holdTime = 0;
      if (down) st.holdTime += dt;
      // A press+release inside one frame still counts as pressed this frame.
      if (pressed && !down) st.released = true;
      st.down = down;
    }
    this.physicalPressedThisFrame.clear();

    // --- Axes -------------------------------------------------------------------------
    let mx = (this.held('MoveRight') ? 1 : 0) - (this.held('MoveLeft') ? 1 : 0);
    let my = (this.held('MoveForward') ? 1 : 0) - (this.held('MoveBack') ? 1 : 0);
    if (padMoveX || padMoveY) {
      mx = padMoveX;
      my = padMoveY;
    }
    const len = Math.hypot(mx, my);
    if (len > 1) {
      mx /= len;
      my /= len;
    }
    this.move.x = this.enabled ? mx : 0;
    this.move.y = this.enabled ? my : 0;

    const sens = this.mouseSensitivity;
    this.look.x = this.mouseDX * 0.0022 * sens + padLookX * 2.6 * dt * sens;
    this.look.y = (this.mouseDY * 0.0022 * sens + padLookY * 1.8 * dt * sens) * (this.invertY ? -1 : 1);
    if (!this.enabled) {
      this.look.x = 0;
      this.look.y = 0;
    }
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.wheel = this.enabled ? this.wheelAccum : 0;
    this.wheelAccum = 0;
  }

  held(id: InputActionId): boolean {
    return this.actions.get(id)!.down;
  }
  pressed(id: InputActionId): boolean {
    return this.actions.get(id)!.pressed;
  }
  released(id: InputActionId): boolean {
    return this.actions.get(id)!.released;
  }
  holdTime(id: InputActionId): number {
    return this.actions.get(id)!.holdTime;
  }
  /** Consume a press so a second system reading the same frame does not react to it. */
  consume(id: InputActionId): void {
    const st = this.actions.get(id)!;
    st.pressed = false;
  }
}
