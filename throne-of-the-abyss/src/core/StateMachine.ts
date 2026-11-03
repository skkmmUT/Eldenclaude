/**
 * Minimal finite state machine. States are plain objects keyed by id; transitions are
 * explicit (`change`) so every state change is easy to trace in a debugger.
 */
export interface State<TOwner, TId extends string> {
  readonly id: TId;
  enter?(owner: TOwner, prev: TId | null, params?: unknown): void;
  update?(owner: TOwner, dt: number): void;
  exit?(owner: TOwner, next: TId): void;
}

export class StateMachine<TOwner, TId extends string> {
  private states = new Map<TId, State<TOwner, TId>>();
  private _current: State<TOwner, TId> | null = null;
  private _previousId: TId | null = null;
  /** Seconds spent in the current state. */
  time = 0;

  constructor(private readonly owner: TOwner) {}

  add(state: State<TOwner, TId>): this {
    this.states.set(state.id, state);
    return this;
  }

  get currentId(): TId | null {
    return this._current ? this._current.id : null;
  }

  get previousId(): TId | null {
    return this._previousId;
  }

  is(...ids: TId[]): boolean {
    return this._current !== null && ids.includes(this._current.id);
  }

  change(id: TId, params?: unknown): void {
    const next = this.states.get(id);
    if (!next) throw new Error(`StateMachine: unknown state "${id}"`);
    const prev = this._current;
    if (prev) prev.exit?.(this.owner, id);
    this._previousId = prev ? prev.id : null;
    this._current = next;
    this.time = 0;
    next.enter?.(this.owner, this._previousId, params);
  }

  update(dt: number): void {
    this.time += dt;
    this._current?.update?.(this.owner, dt);
  }
}
