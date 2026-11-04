/**
 * A tiny game-clock scheduler so activity scripts can be written as plain async functions:
 *   await tasks.wait(0.5);  await tasks.tween(0.3, k => ...);  await tasks.waitFor(() => cond, 2)
 */
class Tasks {
  constructor() {
    this.t = 0;
    this.waits = [];
    this.tweens = [];
    this.polls = [];
  }

  wait(seconds) {
    return new Promise((resolve) => this.waits.push({ at: this.t + seconds, resolve }));
  }

  tween(duration, fn, ease = easeInOut) {
    return new Promise((resolve) => this.tweens.push({ start: this.t, duration, fn, ease, resolve }));
  }

  /** Resolves with the predicate's first truthy value, or null after the timeout. */
  waitFor(pred, timeout = Infinity, onTick) {
    return new Promise((resolve) => this.polls.push({ pred, until: this.t + timeout, resolve, onTick }));
  }

  update(dt) {
    this.t += dt;
    for (let i = this.waits.length - 1; i >= 0; i--) {
      if (this.t >= this.waits[i].at) this.waits.splice(i, 1)[0].resolve();
    }
    for (let i = this.tweens.length - 1; i >= 0; i--) {
      const tw = this.tweens[i];
      const k = Math.min(1, (this.t - tw.start) / tw.duration);
      tw.fn(tw.ease(k));
      if (k >= 1) this.tweens.splice(i, 1)[0].resolve();
    }
    for (let i = this.polls.length - 1; i >= 0; i--) {
      const p = this.polls[i];
      const v = p.pred();
      if (v) this.polls.splice(i, 1)[0].resolve(v);
      else if (this.t >= p.until) this.polls.splice(i, 1)[0].resolve(null);
      else p.onTick?.(p.until - this.t);
    }
  }
}

export const easeInOut = (k) => (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2);
export const linear = (k) => k;
export const tasks = new Tasks();
