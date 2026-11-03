/**
 * Strongly typed global event bus. Gameplay systems publish facts ("damage dealt",
 * "enemy died", "altar rested") and presentation layers (HUD, VFX, camera)
 * subscribe — this keeps combat logic free of UI dependencies.
 */
export type Listener<T> = (payload: T) => void;

export class EventBus<Events extends object> {
  private listeners = new Map<keyof Events, Set<Listener<never>>>();

  on<K extends keyof Events>(type: K, fn: Listener<Events[K]>): () => void {
    let set = this.listeners.get(type);
    if (!set) {
      set = new Set();
      this.listeners.set(type, set);
    }
    set.add(fn as Listener<never>);
    return () => this.off(type, fn);
  }

  off<K extends keyof Events>(type: K, fn: Listener<Events[K]>): void {
    this.listeners.get(type)?.delete(fn as Listener<never>);
  }

  emit<K extends keyof Events>(type: K, payload: Events[K]): void {
    const set = this.listeners.get(type);
    if (!set) return;
    for (const fn of set) (fn as Listener<Events[K]>)(payload);
  }

  clear(): void {
    this.listeners.clear();
  }
}
