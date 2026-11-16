// One operation at a time per container name: Update image, Edit settings, automatic updates, and
// the actions that would interfere with them (Stop, Restart, Remove while one runs).

export class NameLocks {
  private held = new Map<string, symbol>();

  has(name: string): boolean { return this.held.has(name); }

  // Takes the lock for a name, or returns null when it is held. The function it returns releases
  // this hold only, once: a release after someone else took the name again does nothing.
  take(name: string): (() => void) | null {
    if (this.held.has(name)) return null;
    const token = Symbol(name);
    this.held.set(name, token);
    return () => { if (this.held.get(name) === token) this.held.delete(name); };
  }
}
