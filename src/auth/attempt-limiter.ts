interface Window {
  count: number;
  resetsAt: number;
}

export class AttemptLimiter {
  private readonly windows = new Map<string, Window>();
  private readonly maxAttempts: number;
  private readonly windowMs: number;
  private readonly maxKeys: number;

  constructor(maxAttempts: number, windowMs: number, maxKeys = 10_000) {
    this.maxAttempts = maxAttempts;
    this.windowMs = windowMs;
    this.maxKeys = maxKeys;
  }

  // Counts the attempt before the password is checked: counting only after a
  // failure would let a burst of parallel requests all pass the check.
  // Returns 0 when the attempt may go ahead, otherwise the seconds to wait.
  take(key: string, now = Date.now()): number {
    let window = this.windows.get(key);
    if (!window || window.resetsAt <= now) {
      window = { count: 0, resetsAt: now + this.windowMs };
      this.windows.delete(key);
      this.windows.set(key, window);
      this.evict(now);
    }
    if (window.count >= this.maxAttempts)
      return Math.ceil((window.resetsAt - now) / 1000);
    window.count++;
    return 0;
  }

  clear(key: string) {
    this.windows.delete(key);
  }

  // Windows share one length, so insertion order is expiry order: the stale
  // ones are always at the front.
  private evict(now: number) {
    for (const [key, window] of this.windows) {
      if (this.windows.size <= this.maxKeys && window.resetsAt > now) return;
      this.windows.delete(key);
    }
  }
}
