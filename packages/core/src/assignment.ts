import { hmacSha256 } from "./crypto.js";

export function utcDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function nextUtcDay(date: Date): string {
  const next = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + 1));
  return next.toISOString();
}

/** Users are deterministically and evenly assigned without exposing an instance seed. */
export function assignSeedSlot(input: {
  secret: string;
  userId: string;
  challengeSlug: string;
  date: Date;
  slotCount?: number;
}): number {
  const slotCount = input.slotCount ?? 3;
  if (!Number.isSafeInteger(slotCount) || slotCount < 1) throw new RangeError("slotCount must be positive");
  const digest = hmacSha256(input.secret, `${input.userId}:${input.challengeSlug}:${utcDay(input.date)}`);
  return Number.parseInt(digest.slice(0, 12), 16) % slotCount;
}

export function publicHandleForUser(secret: string, userId: string): string {
  const digest = hmacSha256(secret, `handle:${userId}`);
  const adjectives = ["Bright", "Calm", "Daring", "Keen", "Swift", "Witty", "Zen"];
  const mascots = ["Axolotl", "Badger", "Gecko", "Moth", "Otter", "Raven", "Tiger"];
  const adjective = adjectives[Number.parseInt(digest.slice(0, 2), 16) % adjectives.length] ?? "Keen";
  const mascot = mascots[Number.parseInt(digest.slice(2, 4), 16) % mascots.length] ?? "Otter";
  return `${adjective}${mascot}${Number.parseInt(digest.slice(4, 8), 16) % 10_000}`;
}
