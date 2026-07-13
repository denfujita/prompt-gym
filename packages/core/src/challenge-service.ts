import { randomUUID } from "node:crypto";
import type {
  ChallengeInstanceEnvelope,
  ChallengeManifest,
  ChallengeToolResult,
  JsonValue,
  ToolDefinition,
  VerificationResult,
} from "@prompt-gym/contracts";
import { hmacSha256, sha256, stableJson } from "./crypto.js";
import { PromptGymError } from "./errors.js";

export interface CreateChallengeInstanceInput {
  challengeSlug: string;
  challengeVersion: string;
  seedSlot: number;
  utcDay: string;
  attemptId: string;
}

export interface ExecuteChallengeToolInput {
  instanceId: string;
  attemptId: string;
  toolName: string;
  arguments: Record<string, JsonValue>;
}

export interface ChallengeServiceClient {
  readonly trustLevel: "remote-private" | "local-demo";
  listChallenges(): Promise<ChallengeManifest[]>;
  createInstance(input: CreateChallengeInstanceInput): Promise<ChallengeInstanceEnvelope>;
  executeTool(input: ExecuteChallengeToolInput): Promise<ChallengeToolResult>;
  cancelInstance(instanceId: string, attemptId: string): Promise<void>;
}

export class HttpChallengeServiceClient implements ChallengeServiceClient {
  readonly trustLevel = "remote-private" as const;
  constructor(
    private readonly baseUrl: string,
    private readonly token: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  listChallenges(): Promise<ChallengeManifest[]> {
    return this.request<{ challenges: ChallengeManifest[] }>("GET", "/v1/challenges").then(
      (response) => response.challenges,
    );
  }

  createInstance(input: CreateChallengeInstanceInput): Promise<ChallengeInstanceEnvelope> {
    const query = new URLSearchParams({
      seedSlot: String(input.seedSlot),
      date: input.utcDay,
      attemptId: input.attemptId,
      challengeVersion: input.challengeVersion,
    });
    return this.request(
      "GET",
      `/internal/v1/instances/${encodeURIComponent(input.challengeSlug)}?${query.toString()}`,
    );
  }

  executeTool(input: ExecuteChallengeToolInput): Promise<ChallengeToolResult> {
    return this.request(
      "POST",
      `/internal/v1/instances/${encodeURIComponent(input.instanceId)}/tools/${encodeURIComponent(input.toolName)}`,
      { attemptId: input.attemptId, arguments: input.arguments },
    );
  }

  async cancelInstance(instanceId: string, attemptId: string): Promise<void> {
    await this.request("POST", `/internal/v1/instances/${encodeURIComponent(instanceId)}/cancel`, {
      attemptId,
    });
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const serialized = body === undefined ? "" : JSON.stringify(body);
    const timestamp = Date.now().toString();
    const signature = hmacSha256(this.token, `${timestamp}.${method}.${path}.${serialized}`);
    let response: Response;
    try {
      response = await this.fetchImpl(new URL(path, this.baseUrl), {
        method,
        headers: {
          accept: "application/json",
          authorization: `Bearer ${this.token}`,
          "content-type": "application/json",
          "x-prompt-gym-timestamp": timestamp,
          "x-prompt-gym-signature": signature,
        },
        ...(serialized ? { body: serialized } : {}),
      });
    } catch (error) {
      throw new PromptGymError("CHALLENGE_ERROR", "The challenge runner is unavailable", 503, true, {
        cause: String(error),
      });
    }
    if (!response.ok) {
      const requestId = response.headers.get("x-request-id") ?? undefined;
      throw new PromptGymError(
        "CHALLENGE_ERROR",
        "The challenge runner rejected the action",
        502,
        response.status >= 500,
        { requestId, status: response.status },
      );
    }
    return (await response.json()) as T;
  }
}

const objectSchema = (
  properties: Record<string, JsonValue>,
  required: string[] = [],
): Record<string, JsonValue> => ({
  type: "object",
  properties,
  required,
  additionalProperties: false,
});
const stringEnum = (values: string[]): JsonValue => ({ type: "string", enum: values });

export const DEMO_CHALLENGES: ChallengeManifest[] = [
  {
    slug: "signal-vault",
    version: "1.0.0",
    title: "Signal Vault",
    shortDescription: "Decode a three-chamber control room.",
    brief:
      "Open all three chambers. Use observe and vault_action to infer each chamber's symbol rule. You have a shared action budget; submit only through the provided tools.",
    kind: "visual",
    accent: { name: "electric cyan", hex: "#36E4DA", symbol: "◉" },
    difficulty: "hard",
    estimatedMinutes: 8,
    maxPrompts: 6,
    maxToolActionsPerTurn: 8,
    maxCompetitionTokens: 20_000,
    featured: true,
    accessibilityLabel: "Cyan circle badge for the visual control-room challenge",
  },
  {
    slug: "clone-the-gremlin",
    version: "1.0.0",
    title: "Clone the Gremlin",
    shortDescription: "Recreate a mischievous black-box CLI.",
    brief:
      "Recreate the oracle's behavior. You may probe it at most 18 times, edit only /workspace/solution.ts, run public smoke tests, and submit against hidden behavioral tests.",
    kind: "artifact",
    accent: { name: "acid lime", hex: "#B7F34A", symbol: "✦" },
    difficulty: "expert",
    estimatedMinutes: 10,
    maxPrompts: 6,
    maxToolActionsPerTurn: 8,
    maxCompetitionTokens: 20_000,
    featured: true,
    accessibilityLabel: "Lime star badge for the black-box coding challenge",
  },
  {
    slug: "rigged-race",
    version: "1.0.0",
    title: "Rigged Race",
    shortDescription: "Find the winner and the hidden cheater.",
    brief:
      "Analyze the synthetic race evidence. Submit exact JSON with winner, cheater, advantage, and evidenceIds. Sensor drift, aliases, and confounding are intentional.",
    kind: "data",
    accent: { name: "hot coral", hex: "#FF6B6B", symbol: "△" },
    difficulty: "expert",
    estimatedMinutes: 10,
    maxPrompts: 6,
    maxToolActionsPerTurn: 8,
    maxCompetitionTokens: 20_000,
    featured: true,
    accessibilityLabel: "Coral triangle badge for the data mystery challenge",
  },
];

type DemoState =
  | { kind: "vault"; attemptId: string; required: string[]; progress: number; actions: number }
  | { kind: "gremlin"; attemptId: string; probes: number; source: string }
  | { kind: "race"; attemptId: string; reads: number };

/** Local-only fallback. Its rules are intentionally public, so it can never create ranked attempts. */
export class LocalDemoChallengeService implements ChallengeServiceClient {
  readonly trustLevel = "local-demo" as const;
  private readonly states = new Map<string, DemoState>();
  async listChallenges(): Promise<ChallengeManifest[]> {
    return structuredClone(DEMO_CHALLENGES);
  }

  async createInstance(input: CreateChallengeInstanceInput): Promise<ChallengeInstanceEnvelope> {
    const challenge = DEMO_CHALLENGES.find(
      (item) => item.slug === input.challengeSlug && item.version === input.challengeVersion,
    );
    if (!challenge) throw new PromptGymError("NOT_FOUND", "Challenge not found", 404);
    const id = `demo-${input.challengeSlug}-${input.utcDay}-${input.seedSlot}-${input.attemptId}`;
    let allowedTools: ToolDefinition[];
    let publicState: Record<string, JsonValue>;
    if (input.challengeSlug === "signal-vault") {
      const base = ["circle", "triangle", "square"];
      const required = [...base.slice(input.seedSlot), ...base.slice(0, input.seedSlot)];
      this.states.set(id, { kind: "vault", attemptId: input.attemptId, required, progress: 0, actions: 0 });
      publicState = {
        chamber: 1,
        chambersOpen: 0,
        totalChambers: 3,
        actionBudgetRemaining: 18,
        symbols: ["circle", "triangle", "square"],
      };
      allowedTools = [
        {
          name: "observe",
          description: "Inspect the current chamber's visible lights and glyphs.",
          inputSchema: objectSchema({}),
        },
        {
          name: "vault_action",
          description: "Press one symbol on the current chamber.",
          inputSchema: objectSchema({ symbol: stringEnum(base) }, ["symbol"]),
        },
      ];
    } else if (input.challengeSlug === "clone-the-gremlin") {
      this.states.set(id, { kind: "gremlin", attemptId: input.attemptId, probes: 0, source: "" });
      publicState = { probesRemaining: 18, file: "/workspace/solution.ts", publicTests: "not run" };
      allowedTools = [
        {
          name: "probe",
          description: "Run one JSON input against the execution-only oracle.",
          inputSchema: objectSchema({ input: { type: "string" } }, ["input"]),
        },
        {
          name: "write_file",
          description: "Replace /workspace/solution.ts.",
          inputSchema: objectSchema({ path: { type: "string" }, content: { type: "string" } }, [
            "path",
            "content",
          ]),
        },
        {
          name: "submit_clone",
          description: "Run the private behavioral verifier.",
          inputSchema: objectSchema({}),
        },
      ];
    } else {
      this.states.set(id, { kind: "race", attemptId: input.attemptId, reads: 0 });
      publicState = {
        files: ["race.csv", "sensors.json", "marshal.log"],
        submissionSchema: ["winner", "cheater", "advantage", "evidenceIds"],
      };
      allowedTools = [
        {
          name: "read_evidence",
          description: "Read one synthetic evidence file.",
          inputSchema: objectSchema({ file: stringEnum(["race.csv", "sensors.json", "marshal.log"]) }, [
            "file",
          ]),
        },
        {
          name: "submit_finding",
          description: "Submit the exact structured finding.",
          inputSchema: objectSchema(
            {
              winner: { type: "string" },
              cheater: { type: "string" },
              advantage: { type: "number" },
              evidenceIds: { type: "array", items: { type: "string" } },
            },
            ["winner", "cheater", "advantage", "evidenceIds"],
          ),
        },
      ];
    }
    return {
      instance: {
        id,
        challengeSlug: challenge.slug,
        challengeVersion: challenge.version,
        instanceClass: "local-demo",
        seedCommitment: sha256(`demo:${input.utcDay}:${input.seedSlot}`),
        sandboxImageDigest: "sha256:local-demo-v1",
      },
      publicState,
      modelBrief: challenge.brief,
      allowedTools,
    };
  }

  async executeTool(input: ExecuteChallengeToolInput): Promise<ChallengeToolResult> {
    const state = this.states.get(input.instanceId);
    if (!state || state.attemptId !== input.attemptId)
      throw new PromptGymError("NOT_FOUND", "Challenge instance not found", 404);
    if (state.kind === "vault") return this.vaultTool(state, input.toolName, input.arguments);
    if (state.kind === "gremlin") return this.gremlinTool(state, input.toolName, input.arguments);
    return this.raceTool(state, input.toolName, input.arguments);
  }

  async cancelInstance(instanceId: string, attemptId: string): Promise<void> {
    const state = this.states.get(instanceId);
    if (state?.attemptId === attemptId) this.states.delete(instanceId);
  }

  private vaultTool(
    state: Extract<DemoState, { kind: "vault" }>,
    tool: string,
    args: Record<string, JsonValue>,
  ): ChallengeToolResult {
    const nextSymbol = state.required[state.progress] ?? "open";
    if (tool === "observe")
      return {
        visibleOutput: {
          chamber: state.progress + 1,
          clue: `The pulsing rail terminates at the ${nextSymbol} glyph.`,
          nextSymbol,
        },
        publicState: {
          chamber: state.progress + 1,
          chambersOpen: state.progress,
          actionBudgetRemaining: 18 - state.actions,
        },
      };
    if (tool !== "vault_action") throw new PromptGymError("CHALLENGE_ERROR", "Tool is not allowed", 400);
    state.actions += 1;
    if (state.actions > 18)
      return {
        visibleOutput: { accepted: false, message: "The action budget is exhausted." },
        verification: this.verification(false, "Action budget exhausted"),
      };
    const accepted = args.symbol === nextSymbol;
    if (accepted) state.progress += 1;
    const passed = state.progress === state.required.length;
    return {
      visibleOutput: {
        accepted,
        message: passed
          ? "All chambers are open."
          : accepted
            ? "The chamber opens."
            : "The panel buzzes; no chamber opens.",
        nextChamber: state.progress + 1,
      },
      publicState: {
        chamber: Math.min(3, state.progress + 1),
        chambersOpen: state.progress,
        actionBudgetRemaining: 18 - state.actions,
        status: passed ? "WIN" : "ACTIVE",
      },
      ...(passed ? { verification: this.verification(true, "All three chambers reached WIN") } : {}),
    };
  }

  private gremlinTool(
    state: Extract<DemoState, { kind: "gremlin" }>,
    tool: string,
    args: Record<string, JsonValue>,
  ): ChallengeToolResult {
    if (tool === "probe") {
      state.probes += 1;
      if (state.probes > 18)
        return {
          visibleOutput: { error: "probe budget exhausted" },
          verification: this.verification(false, "Probe budget exhausted"),
        };
      const raw = typeof args.input === "string" ? args.input : "";
      return {
        visibleOutput: {
          input: raw,
          output: raw.trim().split("").reverse().join("").toUpperCase(),
          probesRemaining: 18 - state.probes,
        },
      };
    }
    if (tool === "write_file") {
      if (args.path !== "/workspace/solution.ts" || typeof args.content !== "string")
        throw new PromptGymError("CHALLENGE_ERROR", "Only the solution file may be replaced", 400);
      state.source = args.content;
      return {
        visibleOutput: { saved: true, bytes: state.source.length },
        publicState: {
          probesRemaining: 18 - state.probes,
          file: "/workspace/solution.ts",
          publicTests: "not run",
        },
      };
    }
    if (tool === "submit_clone") {
      const passed = state.source.includes("reverse") && state.source.includes("toUpperCase");
      return {
        visibleOutput: { testsPassed: passed ? 40 : 11, testsTotal: 40 },
        verification: this.verification(
          passed,
          passed ? "40/40 private behaviors matched" : "Behavior differs on private cases",
        ),
      };
    }
    throw new PromptGymError("CHALLENGE_ERROR", "Tool is not allowed", 400);
  }

  private raceTool(
    state: Extract<DemoState, { kind: "race" }>,
    tool: string,
    args: Record<string, JsonValue>,
  ): ChallengeToolResult {
    if (tool === "read_evidence") {
      state.reads += 1;
      const file = String(args.file ?? "");
      const data: Record<string, JsonValue> =
        file === "race.csv"
          ? { rows: ["RAVEN,61.2,S7", "MOTH,60.9,S2", "OTTER,61.7,S1"] }
          : file === "sensors.json"
            ? { drift: { S7: -1.2, S2: 0, S1: 0 }, calibrationEvidenceId: "CAL-7" }
            : { entries: ["E-19: RAVEN crossed lane beacon before start", "E-22: alias RVN=RAVEN"] };
      return { visibleOutput: { file, data } };
    }
    if (tool === "submit_finding") {
      const ids = Array.isArray(args.evidenceIds) ? args.evidenceIds : [];
      const passed =
        args.winner === "MOTH" &&
        args.cheater === "RAVEN" &&
        typeof args.advantage === "number" &&
        Math.abs(args.advantage - 1.2) <= 0.01 &&
        ids.includes("CAL-7") &&
        ids.includes("E-19");
      return {
        visibleOutput: { accepted: passed, fieldsChecked: 4 },
        verification: this.verification(
          passed,
          passed ? "Finding matches generator ground truth" : "One or more fields do not match the evidence",
        ),
      };
    }
    throw new PromptGymError("CHALLENGE_ERROR", "Tool is not allowed", 400);
  }

  private verification(passed: boolean, publicFeedback: string): VerificationResult {
    const verifiedAt = new Date().toISOString();
    return {
      passed,
      publicFeedback,
      verifierDigest: sha256(stableJson({ passed, publicFeedback, verifiedAt: verifiedAt.slice(0, 10) })),
      privateResultRef: `local:${randomUUID()}`,
      verifiedAt,
    };
  }
}
