import { describe, expect, it } from "vitest";

import {
  DEMO_ELIGIBILITY_KEY,
  DEMO_SESSION_KEY,
  endDemoSession,
  hasDemoEligibility,
  isLoopbackUrl,
  readDemoSession,
  safeReturnTo,
  saveDemoEligibility,
  startDemoSession,
} from "./auth-client";

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  };
}

describe("demo authentication", () => {
  it("persists a session and clears its eligibility on sign out", () => {
    const storage = memoryStorage();
    expect(readDemoSession(storage)).toBeNull();

    startDemoSession(storage);
    saveDemoEligibility("policy-v1", storage);

    expect(readDemoSession(storage)?.handle).toBe("quietcoach");
    expect(storage.getItem(DEMO_SESSION_KEY)).toContain("quietcoach");
    expect(storage.getItem(DEMO_ELIGIBILITY_KEY)).toContain("policy-v1");
    expect(hasDemoEligibility(storage)).toBe(true);

    endDemoSession(storage);
    expect(readDemoSession(storage)).toBeNull();
    expect(storage.getItem(DEMO_ELIGIBILITY_KEY)).toBeNull();
    expect(hasDemoEligibility(storage)).toBe(false);
  });
});

describe("authentication redirects", () => {
  it("keeps internal destinations and rejects external or recursive ones", () => {
    expect(safeReturnTo("/arena/signal-vault?model=gpt-5.6-terra")).toBe(
      "/arena/signal-vault?model=gpt-5.6-terra",
    );
    expect(safeReturnTo("https://attacker.example/path")).toBe("/play");
    expect(safeReturnTo("//attacker.example/path")).toBe("/play");
    expect(safeReturnTo("/sign-in?returnTo=/profile")).toBe("/play");
  });
});

describe("local API safety", () => {
  it("only recognizes loopback development URLs", () => {
    expect(isLoopbackUrl("http://localhost:4000")).toBe(true);
    expect(isLoopbackUrl("http://127.0.0.1:4000")).toBe(true);
    expect(isLoopbackUrl("http://[::1]:4000")).toBe(true);
    expect(isLoopbackUrl("https://api.prompt.gym")).toBe(false);
  });
});
