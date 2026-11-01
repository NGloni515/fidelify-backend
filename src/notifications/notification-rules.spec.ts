import { nextSendAt, waitText } from './notification-rules.js';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const now = new Date('2026-11-01T15:00:00Z');
const ago = (ms: number) => new Date(now.getTime() - ms);
const later = (ms: number) => new Date(now.getTime() + ms);

describe('nextSendAt', () => {
  it('lets the first message go', () => {
    expect(nextSendAt([], now)).toBeNull();
  });

  it('waits a full day after a message', () => {
    expect(nextSendAt([ago(2 * HOUR)], now)).toEqual(later(22 * HOUR));
  });

  it('lets one go once the day has passed', () => {
    expect(nextSendAt([ago(DAY)], now)).toBeNull();
    expect(nextSendAt([ago(25 * HOUR)], now)).toBeNull();
  });

  it('waits for the older of the two messages of the week to turn a week old', () => {
    expect(nextSendAt([ago(2 * DAY), ago(3 * DAY)], now)).toEqual(
      later(4 * DAY),
    );
  });

  it('takes the later of the two limits', () => {
    // The daily limit frees in 23 hours, the weekly one in 24.
    expect(nextSendAt([ago(HOUR), ago(6 * DAY)], now)).toEqual(later(DAY));
    // The daily limit frees in 23 hours, the weekly one already did.
    expect(nextSendAt([ago(HOUR), ago(8 * DAY)], now)).toEqual(
      later(23 * HOUR),
    );
  });

  it('forgets messages older than a week', () => {
    expect(nextSendAt([ago(26 * HOUR), ago(8 * DAY), ago(9 * DAY)], now)).toBe(
      null,
    );
  });
});

describe('waitText', () => {
  it('says minutes under an hour', () => {
    expect(waitText(30_000)).toBe('1 minuto');
    expect(waitText(59 * 60_000)).toBe('59 minutos');
  });

  it('says hours under two days', () => {
    expect(waitText(HOUR)).toBe('1 hora');
    expect(waitText(HOUR + 1)).toBe('2 horas');
    expect(waitText(47 * HOUR)).toBe('47 horas');
  });

  it('says days from two days on', () => {
    expect(waitText(48 * HOUR)).toBe('2 días');
    expect(waitText(4 * DAY + HOUR)).toBe('5 días');
  });
});
