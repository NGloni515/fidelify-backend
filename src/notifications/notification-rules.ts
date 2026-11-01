import { DAY_MS } from '../dashboard/dashboard-rules.js';

export const MAX_MESSAGE_LENGTH = 120;
export const PER_DAY = 1;
export const PER_WEEK = 2;
export const WEEK_MS = 7 * DAY_MS;

// Google Wallet rings a card at most three times a day, and the reward notice
// counts towards that; past these limits customers feel it as spam and delete
// the card. Rolling windows, so the panel can say exactly when the next one goes.
const WINDOWS = [
  { ms: DAY_MS, max: PER_DAY },
  { ms: WEEK_MS, max: PER_WEEK },
];

// null when a message can go out now.
export function nextSendAt(sentAt: Date[], now: Date): Date | null {
  let next: number | null = null;
  for (const { ms, max } of WINDOWS) {
    const inWindow = sentAt
      .map((at) => at.getTime())
      .filter((at) => at > now.getTime() - ms)
      .sort((a, b) => b - a);
    if (inWindow.length < max) continue;
    const frees = inWindow[max - 1] + ms;
    if (next === null || frees > next) next = frees;
  }
  return next === null ? null : new Date(next);
}

// Rounded up: "in 3 hours" must never come before the message can go.
export function waitText(ms: number): string {
  const minutes = Math.ceil(ms / 60_000);
  if (minutes < 60) return minutes === 1 ? '1 minuto' : `${minutes} minutos`;
  const hours = Math.ceil(ms / 3_600_000);
  if (hours < 48) return hours === 1 ? '1 hora' : `${hours} horas`;
  return `${Math.ceil(ms / DAY_MS)} días`;
}
