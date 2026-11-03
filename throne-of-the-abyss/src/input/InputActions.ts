/**
 * Logical input actions — gameplay code only ever talks about these, never about keys.
 * Mirrors the Enhanced Input idea of "Input Actions" decoupled from "Mapping Contexts".
 */
export const InputAction = {
  Jump: 'Jump',
  DodgeSprint: 'DodgeSprint',
  LightAttack: 'LightAttack',
  HeavyAttack: 'HeavyAttack',
  Block: 'Block',
  Parry: 'Parry',
  LockOn: 'LockOn',
  Interact: 'Interact',
  UseItem: 'UseItem',
  CycleItem: 'CycleItem',
  CastSpell: 'CastSpell',
  CycleSpell: 'CycleSpell',
  SwitchWeapon: 'SwitchWeapon',
  ToggleWalk: 'ToggleWalk',
  Pause: 'Pause',
  MoveForward: 'MoveForward',
  MoveBack: 'MoveBack',
  MoveLeft: 'MoveLeft',
  MoveRight: 'MoveRight',
} as const;

export type InputActionId = (typeof InputAction)[keyof typeof InputAction];

/**
 * Binding ids:
 *  - keyboard: KeyboardEvent.code (e.g. "KeyW", "ShiftLeft")
 *  - mouse:    "Mouse0" (left), "Mouse1" (middle), "Mouse2" (right)
 *  - gamepad:  "Pad<n>" using the W3C standard gamepad button index
 */
export type BindingMap = Record<InputActionId, string[]>;
