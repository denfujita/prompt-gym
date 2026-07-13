import type { ChallengeSlug, RunEvent } from "./types";

export type PublicTaskState = Record<string, unknown>;

function finiteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

export function latestTaskState(events: RunEvent[]): PublicTaskState | undefined {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const state = events[index]?.taskState;
    if (state) return state;
  }
  return undefined;
}

/** Converts public task state to the three-step visual progress scale used by the arena. */
export function taskProgress(slug: ChallengeSlug, state: PublicTaskState | undefined): number {
  if (!state) return 0;
  if (slug === "signal-vault") {
    const opened = finiteNumber(state.chambersOpened) ?? finiteNumber(state.chambersOpen) ?? 0;
    return clamp(Math.floor(opened), 0, 3);
  }
  if (slug === "clone-the-gremlin") {
    const remaining = finiteNumber(state.probesRemaining);
    if (remaining === undefined) return 0;
    const used = clamp(18 - remaining, 0, 18);
    return used === 0 ? 0 : used < 10 ? 1 : used < 18 ? 2 : 3;
  }
  const filesRead = finiteNumber(state.filesRead) ?? 0;
  return clamp(Math.floor(filesRead), 0, 3);
}

export function taskStateNumber(state: PublicTaskState | undefined, ...keys: string[]): number | undefined {
  for (const key of keys) {
    const value = finiteNumber(state?.[key]);
    if (value !== undefined) return value;
  }
  return undefined;
}

export function taskStateString(state: PublicTaskState | undefined, key: string): string | undefined {
  const value = state?.[key];
  return typeof value === "string" ? value : undefined;
}

export function taskStateStrings(state: PublicTaskState | undefined, key: string): string[] {
  const value = state?.[key];
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}
