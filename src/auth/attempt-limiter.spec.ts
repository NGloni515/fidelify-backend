import { AttemptLimiter } from './attempt-limiter.js';

const MINUTE = 60_000;

describe('AttemptLimiter', () => {
  it('lets the first attempts through and blocks the next one', () => {
    const limiter = new AttemptLimiter(3, 15 * MINUTE);
    expect(limiter.take('a', 0)).toBe(0);
    expect(limiter.take('a', 0)).toBe(0);
    expect(limiter.take('a', 0)).toBe(0);
    expect(limiter.take('a', 0)).toBe(15 * 60);
  });

  it('reports the seconds left until the window ends, rounded up', () => {
    const limiter = new AttemptLimiter(1, 15 * MINUTE);
    limiter.take('a', 0);
    expect(limiter.take('a', 10 * MINUTE + 500)).toBe(5 * 60);
    expect(limiter.take('a', 15 * MINUTE - 1)).toBe(1);
  });

  it('does not extend the block with attempts made while blocked', () => {
    const limiter = new AttemptLimiter(1, 15 * MINUTE);
    limiter.take('a', 0);
    limiter.take('a', 5 * MINUTE);
    limiter.take('a', 10 * MINUTE);
    expect(limiter.take('a', 15 * MINUTE)).toBe(0);
  });

  it('starts over once the window ends', () => {
    const limiter = new AttemptLimiter(2, 15 * MINUTE);
    limiter.take('a', 0);
    limiter.take('a', 0);
    expect(limiter.take('a', 15 * MINUTE)).toBe(0);
    expect(limiter.take('a', 15 * MINUTE)).toBe(0);
    expect(limiter.take('a', 15 * MINUTE)).toBe(15 * 60);
  });

  it('clear() gives the key its attempts back', () => {
    const limiter = new AttemptLimiter(1, 15 * MINUTE);
    limiter.take('a', 0);
    limiter.clear('a');
    expect(limiter.take('a', 0)).toBe(0);
  });

  it('keeps each key apart', () => {
    const limiter = new AttemptLimiter(1, 15 * MINUTE);
    limiter.take('a', 0);
    expect(limiter.take('a', 0)).toBeGreaterThan(0);
    expect(limiter.take('b', 0)).toBe(0);
  });

  it('drops the oldest keys past its capacity instead of growing', () => {
    const limiter = new AttemptLimiter(1, 15 * MINUTE, 2);
    limiter.take('a', 0);
    limiter.take('b', 1);
    limiter.take('c', 2);
    expect(limiter.take('a', 3)).toBe(0);
    expect(limiter.take('c', 3)).toBeGreaterThan(0);
  });
});
