import "@testing-library/jest-dom";

// Node 22+ ships its own global `localStorage`, which requires the --localstorage-file flag
// to actually work and otherwise stays inert (undefined-ish), shadowing jsdom's real
// implementation under Vitest's `globals: true` (where window === globalThis in tests). Lab 2's
// RequesterContext relies on localStorage, so replace it here with a simple in-memory stand-in —
// test environment only, real browsers are unaffected.
class MemoryStorage implements Storage {
  private store = new Map<string, string>();
  get length() {
    return this.store.size;
  }
  clear() {
    this.store.clear();
  }
  getItem(key: string) {
    return this.store.has(key) ? this.store.get(key)! : null;
  }
  key(index: number) {
    return Array.from(this.store.keys())[index] ?? null;
  }
  removeItem(key: string) {
    this.store.delete(key);
  }
  setItem(key: string, value: string) {
    this.store.set(key, String(value));
  }
}

Object.defineProperty(globalThis, "localStorage", {
  value: new MemoryStorage(),
  writable: true,
  configurable: true,
});
