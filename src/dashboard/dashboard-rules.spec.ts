import { localDay, startOfDay, topVisitors } from './dashboard-rules.js';

const ECUADOR = 'America/Guayaquil';

describe('localDay', () => {
  it('reads the day on the clock of the time zone, not of UTC', () => {
    expect(localDay(new Date('2026-10-30T04:59:00Z'), ECUADOR)).toBe(
      '2026-10-29',
    );
    expect(localDay(new Date('2026-10-30T05:00:00Z'), ECUADOR)).toBe(
      '2026-10-30',
    );
  });
});

describe('startOfDay', () => {
  it('is local midnight: 05:00 UTC in Ecuador', () => {
    expect(
      startOfDay(new Date('2026-10-30T18:30:15.250Z'), ECUADOR).toISOString(),
    ).toBe('2026-10-30T05:00:00.000Z');
  });

  it('late in the evening is still the same local day', () => {
    expect(
      startOfDay(new Date('2026-10-31T03:00:00Z'), ECUADOR).toISOString(),
    ).toBe('2026-10-30T05:00:00.000Z');
  });

  it('works for a zone ahead of UTC', () => {
    expect(
      startOfDay(new Date('2026-10-30T12:00:00Z'), 'Asia/Tokyo').toISOString(),
    ).toBe('2026-10-29T15:00:00.000Z');
  });
});

describe('topVisitors', () => {
  const visit = (customerId: string, at: string) => ({
    customerId,
    name: `Cliente ${customerId}`,
    at: new Date(at),
  });

  it('counts days, not movements', () => {
    const [ana] = topVisitors(
      [
        visit('ana', '2026-10-01T15:00:00Z'),
        visit('ana', '2026-10-01T15:01:00Z'),
        visit('ana', '2026-10-02T15:00:00Z'),
      ],
      ECUADOR,
      5,
    );
    expect(ana).toEqual({
      id: 'ana',
      name: 'Cliente ana',
      visits: 2,
      lastVisitAt: new Date('2026-10-02T15:00:00Z'),
    });
  });

  it('splits days on local midnight', () => {
    const [ana] = topVisitors(
      [
        visit('ana', '2026-10-02T04:00:00Z'),
        visit('ana', '2026-10-02T06:00:00Z'),
      ],
      ECUADOR,
      5,
    );
    expect(ana.visits).toBe(2);
  });

  it('ranks by visits, then by the most recent, and keeps the first ones', () => {
    const ranked = topVisitors(
      [
        visit('ana', '2026-10-01T15:00:00Z'),
        visit('ana', '2026-10-02T15:00:00Z'),
        visit('luis', '2026-10-01T15:00:00Z'),
        visit('maria', '2026-10-03T15:00:00Z'),
      ],
      ECUADOR,
      2,
    );
    expect(ranked.map((r) => r.id)).toEqual(['ana', 'maria']);
  });
});
