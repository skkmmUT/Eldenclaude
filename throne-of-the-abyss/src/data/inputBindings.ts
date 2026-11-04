import type { BindingMap } from '@/input/InputActions';

/** Default mapping context (keyboard + mouse + standard gamepad). */
export const DEFAULT_BINDINGS: BindingMap = {
  MoveForward: ['KeyW', 'ArrowUp'],
  MoveBack: ['KeyS', 'ArrowDown'],
  MoveLeft: ['KeyA', 'ArrowLeft'],
  MoveRight: ['KeyD', 'ArrowRight'],
  Jump: ['Space', 'Pad0'],
  DodgeSprint: ['ShiftLeft', 'ShiftRight', 'Pad1'],
  LightAttack: ['Mouse0', 'KeyJ', 'Pad5'],
  HeavyAttack: ['KeyF', 'KeyK', 'Pad7'],
  Block: ['Mouse2', 'KeyL', 'Pad4'],
  Parry: ['KeyQ', 'Pad6'],
  LockOn: ['Mouse1', 'Tab', 'Pad11'],
  Interact: ['KeyE', 'Pad0'],
  UseItem: ['KeyR', 'Pad2'],
  CycleItem: ['KeyT', 'Pad13'],
  CastSpell: ['KeyC', 'Pad3'],
  CycleSpell: ['KeyV', 'Pad12'],
  SwitchWeapon: ['KeyX', 'Pad15'],
  WeaponArt: ['KeyG', 'Pad14'],
  ToggleWalk: ['KeyZ', 'Pad10'],
  Pause: ['Escape', 'KeyP', 'Pad9'],
};

/** Human-readable control list for the pause menu / README. */
export const CONTROL_HINTS: Array<[string, string]> = [
  ['WASD', 'Move'],
  ['Mouse', 'Camera'],
  ['Wheel', 'Camera distance / switch target (locked)'],
  ['Shift (tap)', 'Roll — backstep with no direction'],
  ['Shift (hold)', 'Sprint'],
  ['Space', 'Jump (attack mid-air for a jump attack)'],
  ['LMB / J', 'Light attack (chain for combo)'],
  ['F / K', 'Heavy attack — hold to charge'],
  ['RMB / L', 'Block'],
  ['Q', 'Parry'],
  ['MMB / Tab', 'Lock on / release target'],
  ['E', 'Interact · rest at altar'],
  ['R / T', 'Use item / cycle item'],
  ['C / V', 'Cast spell / cycle spell'],
  ['X', 'Switch weapon'],
  ['G', 'Weapon art (costs mana)'],
  ['Z', 'Toggle walk'],
  ['Esc / P', 'Pause menu'],
];
