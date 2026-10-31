export const DAY_MS = 24 * 60 * 60 * 1000;

const dayFormats = new Map<string, Intl.DateTimeFormat>();

function dayFormat(timeZone: string) {
  let format = dayFormats.get(timeZone);
  if (!format) {
    format = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    dayFormats.set(timeZone, format);
  }
  return format;
}

// The calendar day of an instant in a time zone, as YYYY-MM-DD.
export function localDay(at: Date, timeZone: string): string {
  return dayFormat(timeZone).format(at);
}

export function startOfDay(now: Date, timeZone: string): Date {
  const day = localDay(now, timeZone);
  const midnightAsUtc = new Date(`${day}T00:00:00Z`).getTime();
  // How far the zone is from UTC right now, read off the wall clock.
  const wall = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
  }).formatToParts(now);
  const part = (type: string) =>
    Number(wall.find((p) => p.type === type)?.value);
  const wallAsUtc = Date.UTC(
    part('year'),
    part('month') - 1,
    part('day'),
    part('hour'),
    part('minute'),
    part('second'),
  );
  const offset = wallAsUtc - Math.floor(now.getTime() / 1000) * 1000;
  return new Date(midnightAsUtc - offset);
}

export interface Visit {
  customerId: string;
  name: string;
  at: Date;
}

// A visit is a day the customer came, however many stamps or redemptions it
// took: three scans at the counter on one afternoon are one visit.
export function topVisitors(visits: Visit[], timeZone: string, limit: number) {
  const byCustomer = new Map<
    string,
    { id: string; name: string; days: Set<string>; lastVisitAt: Date }
  >();
  for (const visit of visits) {
    const entry = byCustomer.get(visit.customerId) ?? {
      id: visit.customerId,
      name: visit.name,
      days: new Set<string>(),
      lastVisitAt: visit.at,
    };
    entry.days.add(localDay(visit.at, timeZone));
    if (visit.at > entry.lastVisitAt) entry.lastVisitAt = visit.at;
    byCustomer.set(visit.customerId, entry);
  }
  return [...byCustomer.values()]
    .map(({ days, ...entry }) => ({ ...entry, visits: days.size }))
    .sort(
      (a, b) =>
        b.visits - a.visits ||
        b.lastVisitAt.getTime() - a.lastVisitAt.getTime(),
    )
    .slice(0, limit);
}
