import { createHash, createHmac, randomUUID } from "node:crypto";
import type { JsonValue, RunEvent, RunEventActor, RunEventType } from "@prompt-gym/contracts";

export const GENESIS_EVENT_HASH = "0".repeat(64);

export function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`)
    .join(",")}}`;
}

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function hmacSha256(secret: string, value: string): string {
  return createHmac("sha256", secret).update(value).digest("hex");
}

export function createVisibleRunEvent(input: {
  attemptId: string;
  sequence: number;
  actor: RunEventActor;
  type: RunEventType;
  payload: Record<string, JsonValue>;
  createdAt: string;
  previousHash: string;
}): RunEvent {
  const canonical = stableJson(input);
  return { id: randomUUID(), ...input, hash: sha256(canonical) };
}

export function verifyEventChain(events: RunEvent[]): boolean {
  let previousHash = GENESIS_EVENT_HASH;
  let sequence = 1;
  for (const event of events) {
    if (event.sequence !== sequence || event.previousHash !== previousHash) return false;
    const { id: _id, hash: _hash, ...unsigned } = event;
    if (sha256(stableJson(unsigned)) !== event.hash) return false;
    previousHash = event.hash;
    sequence += 1;
  }
  return true;
}

export function privacySafetyIdentifier(secret: string, userId: string): string {
  return hmacSha256(secret, `safety:${userId}`);
}
