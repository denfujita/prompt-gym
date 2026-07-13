import { describe, expect, it } from "vitest";

import { latestTaskState, taskProgress } from "./task-state";
import type { RunEvent } from "./types";

describe("public task state", () => {
  it("uses the latest streamed task.state payload", () => {
    const events = [
      {
        id: "1",
        sequence: 1,
        actor: "system",
        type: "artifact.change",
        title: "State",
        body: "ACTIVE",
        taskState: { chambersOpened: 0 },
        createdAt: "2026-07-12T00:00:00Z",
      },
      {
        id: "2",
        sequence: 2,
        actor: "model",
        type: "model.message",
        title: "Model",
        body: "Trying a control",
        createdAt: "2026-07-12T00:00:01Z",
      },
      {
        id: "3",
        sequence: 3,
        actor: "system",
        type: "artifact.change",
        title: "State",
        body: "ACTIVE",
        taskState: { chambersOpened: 2 },
        createdAt: "2026-07-12T00:00:02Z",
      },
    ] satisfies RunEvent[];

    expect(latestTaskState(events)).toEqual({ chambersOpened: 2 });
    expect(taskProgress("signal-vault", latestTaskState(events))).toBe(2);
  });

  it("derives progress from each challenge's authoritative counters", () => {
    expect(taskProgress("clone-the-gremlin", { probesRemaining: 17 })).toBe(1);
    expect(taskProgress("clone-the-gremlin", { probesRemaining: 8 })).toBe(2);
    expect(taskProgress("rigged-race", { filesRead: 3 })).toBe(3);
  });

  it("does not invent progress when state is absent or malformed", () => {
    expect(taskProgress("signal-vault", undefined)).toBe(0);
    expect(taskProgress("rigged-race", { filesRead: "three" })).toBe(0);
  });
});
