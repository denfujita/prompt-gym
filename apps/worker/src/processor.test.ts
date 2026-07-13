import { describe, expect, it, vi } from "vitest";
import { createJobProcessor } from "./processor.js";

describe("worker job processor", () => {
  it("delegates the durable turn id to the authoritative run engine", async () => {
    const processTurn = vi.fn(async () => undefined);
    const process = createJobProcessor({ processTurn });
    await process({ name: "run-turn", data: { turnId: "turn-1" } } as never);
    expect(processTurn).toHaveBeenCalledExactlyOnceWith("turn-1");
  });
});
