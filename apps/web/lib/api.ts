import {
  challenges as demoChallenges,
  demoReplay,
  demoResult,
  getChallenge,
  leaderboard as demoLeaderboard,
} from "./demo-data";
import type {
  Attempt,
  AttemptResult,
  Challenge,
  ChallengeSlug,
  ConsentPreferences,
  LeaderboardEntry,
  Replay,
  RunEvent,
} from "./types";

const API_URL = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "");

export const apiMode = API_URL ? "live" : "demo";

type ClerkBrowser = {
  session?: { getToken(options?: { template?: string }): Promise<string | null> };
};

async function authHeaders(): Promise<Record<string, string>> {
  if (typeof window === "undefined") return {};
  const clerk = (window as typeof window & { Clerk?: ClerkBrowser }).Clerk;
  const token = await clerk?.session?.getToken().catch(() => null);
  if (token) return { authorization: `Bearer ${token}` };
  const demoUser = process.env.NEXT_PUBLIC_DEMO_USER_ID;
  return demoUser ? { "x-prompt-gym-user": demoUser } : {};
}

type WireChallenge = {
  slug: string;
  title: string;
  shortDescription: string;
  brief: string;
  kind: "visual" | "artifact" | "data";
  difficulty: "hard" | "expert";
  estimatedMinutes: number;
  maxToolActionsPerTurn: number;
};

type WireAttempt = {
  id: string;
  publicHandle?: string;
  challengeSlug: string;
  status: string;
  ranked: boolean;
  competitionTokens: number;
  promptsUsed: number;
  maxPrompts: number;
  assisted: boolean;
  startedAt: string;
  instance?: { seedCommitment?: string };
};

type WireEvent = {
  id: string;
  sequence: number;
  type: string;
  actor: RunEvent["actor"];
  payload: Record<string, unknown>;
  createdAt: string;
};

function isChallengeSlug(value: string): value is ChallengeSlug {
  return value === "signal-vault" || value === "clone-the-gremlin" || value === "rigged-race";
}

function normalizeChallenge(manifest: WireChallenge): Challenge {
  const slug = isChallengeSlug(manifest.slug) ? manifest.slug : "signal-vault";
  const fallback = getChallenge(slug);
  return {
    ...fallback,
    id: `${manifest.slug}:live`,
    slug,
    name: manifest.title,
    category:
      manifest.kind === "visual"
        ? "Hidden-rule control room"
        : manifest.kind === "artifact"
          ? "Black-box code mystery"
          : "Data forensics",
    brief: manifest.shortDescription || fallback.brief,
    objective: manifest.brief || fallback.objective,
    difficulty: manifest.difficulty === "expert" ? "Very hard" : "Hard",
    timeLimitMinutes: manifest.estimatedMinutes,
    actionLimit: manifest.maxToolActionsPerTurn * 3,
    // The manifest endpoint does not currently expose exact-instance board data.
    // Never carry illustrative demo scores into a live challenge card.
    cheapestTokens: null,
    playersToday: null,
  };
}

function normalizeAttempt(state: WireAttempt): Attempt {
  const status: Attempt["status"] =
    state.status === "solved"
      ? "solved"
      : state.status === "failed" || state.status === "budget_exhausted" || state.status === "expired"
        ? "failed"
        : state.status === "cancelled"
          ? "cancelled"
          : state.status === "running"
            ? "running"
            : "ready";
  return {
    id: state.id,
    challengeSlug: isChallengeSlug(state.challengeSlug) ? state.challengeSlug : "signal-vault",
    status,
    mode: state.ranked ? "ranked" : "practice",
    competitionTokens: state.competitionTokens,
    turnsUsed: state.promptsUsed,
    maxTurns: state.maxPrompts,
    assisted: state.assisted,
    seedCommitment: state.instance?.seedCommitment,
    createdAt: state.startedAt,
  };
}

export function normalizeEvent(event: WireEvent): RunEvent {
  const payload = event.payload ?? {};
  const defaultTitle = event.type
    .split(".")
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");
  const title =
    payload.passed === true
      ? "Verifier pass"
      : typeof payload.title === "string"
        ? payload.title
        : defaultTitle;
  const bodyValue =
    payload.body ??
    payload.message ??
    payload.publicFeedback ??
    payload.text ??
    payload.output ??
    payload.visibleOutput ??
    payload.label ??
    payload.status;
  const body =
    typeof bodyValue === "string"
      ? bodyValue
      : bodyValue === undefined
        ? "Activity recorded."
        : JSON.stringify(bodyValue);
  const totalTokens =
    typeof payload.totalTokens === "number"
      ? payload.totalTokens
      : typeof payload.tokenDelta === "number"
        ? payload.tokenDelta
        : undefined;
  const type: RunEvent["type"] =
    event.type === "model.message"
      ? "model.message"
      : event.type === "model.thinking"
        ? "model.status"
        : event.type.startsWith("tool.")
          ? event.type === "tool.started"
            ? "tool.action"
            : "tool.result"
          : event.type === "task.state"
            ? "artifact.change"
            : event.type === "verification.completed"
              ? "verifier.result"
              : event.type === "attempt.cancelled" || event.type === "turn.cancelled"
                ? "attempt.interrupted"
                : "model.status";
  return {
    id: event.id,
    sequence: event.sequence,
    actor: event.actor,
    type,
    title,
    body,
    detail: typeof payload.detail === "string" ? payload.detail : undefined,
    tokenDelta: totalTokens,
    sourceType: event.type,
    ...(typeof payload.ordinal === "number" ? { turnOrdinal: payload.ordinal } : {}),
    ...(event.type === "model.thinking" && typeof payload.active === "boolean"
      ? { thinkingActive: payload.active }
      : {}),
    ...(typeof payload.competitionTokens === "number"
      ? { competitionTokens: payload.competitionTokens }
      : {}),
    ...(typeof payload.assisted === "boolean" ? { assisted: payload.assisted } : {}),
    ...(event.type === "verification.completed" && typeof payload.passed === "boolean"
      ? { verifierPassed: payload.passed }
      : {}),
    ...(event.type === "task.state" ? { taskState: payload } : {}),
    createdAt: event.createdAt,
  };
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  if (!API_URL) throw new Error("Demo mode");

  const authorization = await authHeaders();

  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    credentials: "include",
    headers: {
      "content-type": "application/json",
      ...authorization,
      ...init?.headers,
    },
  });

  if (!response.ok) {
    throw new Error(`Prompt Gym API returned ${response.status}`);
  }

  return response.json() as Promise<T>;
}

export async function listChallenges(): Promise<Challenge[]> {
  if (!API_URL) return demoChallenges;
  try {
    const payload = await request<{ challenges?: WireChallenge[] } | WireChallenge[]>("/v1/challenges");
    const manifests = Array.isArray(payload) ? payload : (payload.challenges ?? []);
    return manifests.map(normalizeChallenge);
  } catch {
    return [];
  }
}

export async function createAttempt(
  challengeSlug: ChallengeSlug,
  mode: "ranked" | "practice" = "ranked",
): Promise<{ attempt: Attempt; events: RunEvent[] }> {
  if (API_URL) {
    const payload = await request<{ attempt: WireAttempt; events?: WireEvent[] }>("/v1/attempts", {
      method: "POST",
      body: JSON.stringify({ challengeSlug, ranked: mode === "ranked" }),
    });
    return {
      attempt: normalizeAttempt(payload.attempt),
      events: payload.events?.map(normalizeEvent) ?? [],
    };
  }
  return {
    attempt: {
      id: `demo-${challengeSlug}-${Date.now()}`,
      challengeSlug,
      status: "ready",
      mode,
      competitionTokens: 0,
      turnsUsed: 0,
      maxTurns: 6,
      assisted: false,
      seedCommitment: `demo-seed-${challengeSlug}`,
      createdAt: new Date().toISOString(),
    },
    events: [],
  };
}

export async function submitTurn(attemptId: string, prompt: string): Promise<void> {
  if (!API_URL || attemptId.startsWith("demo-")) return;
  await request(`/v1/attempts/${encodeURIComponent(attemptId)}/turns`, {
    method: "POST",
    body: JSON.stringify({ prompt }),
  });
}

export async function cancelAttempt(attemptId: string): Promise<void> {
  if (!API_URL || attemptId.startsWith("demo-")) return;
  await request(`/v1/attempts/${encodeURIComponent(attemptId)}/cancel`, {
    method: "POST",
  });
}

export function subscribeToAttempt(
  attemptId: string,
  onEvent: (event: RunEvent) => void,
  onError?: () => void,
  onOpen?: () => void,
): () => void {
  if (!API_URL || attemptId.startsWith("demo-")) return () => undefined;

  const controller = new AbortController();
  let lastEventId = 0;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;

  const consume = async () => {
    while (!controller.signal.aborted) {
      try {
        const response = await fetch(`${API_URL}/v1/attempts/${encodeURIComponent(attemptId)}/events`, {
          credentials: "include",
          headers: {
            accept: "text/event-stream",
            "last-event-id": String(lastEventId),
            ...(await authHeaders()),
          },
          signal: controller.signal,
        });
        if (!response.ok || !response.body) throw new Error(`Event stream returned ${response.status}`);
        onOpen?.();
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        while (!controller.signal.aborted) {
          const { done, value } = await reader.read();
          buffer += decoder.decode(value, { stream: !done }).replaceAll("\r\n", "\n");
          let boundary = buffer.indexOf("\n\n");
          while (boundary >= 0) {
            const frame = buffer.slice(0, boundary);
            buffer = buffer.slice(boundary + 2);
            const idLine = frame.split("\n").find((line) => line.startsWith("id:"));
            const data = frame
              .split("\n")
              .filter((line) => line.startsWith("data:"))
              .map((line) => line.slice(5).trimStart())
              .join("\n");
            if (data) {
              const parsed = JSON.parse(data) as WireEvent;
              lastEventId = Math.max(lastEventId, Number(idLine?.slice(3).trim()) || parsed.sequence || 0);
              onEvent(normalizeEvent(parsed));
            }
            boundary = buffer.indexOf("\n\n");
          }
          if (done) break;
        }
      } catch {
        if (controller.signal.aborted) return;
        onError?.();
      }
      await new Promise<void>((resolve) => {
        retryTimer = setTimeout(resolve, 1_000);
      });
    }
  };
  void consume();
  return () => {
    controller.abort();
    if (retryTimer) clearTimeout(retryTimer);
  };
}

export async function unlockHint(attemptId: string): Promise<string | undefined> {
  if (!API_URL || attemptId.startsWith("demo-")) return undefined;
  const payload = await request<{ hint: string }>(`/v1/attempts/${encodeURIComponent(attemptId)}/hint`, {
    method: "POST",
  });
  return payload.hint;
}

export async function getLeaderboard(input?: {
  arena?: string;
  challengeSlug?: ChallengeSlug;
  instanceId?: string;
  assisted?: boolean;
}): Promise<LeaderboardEntry[]> {
  if (!API_URL) return demoLeaderboard;
  if (!input?.challengeSlug || !input.instanceId) return [];
  try {
    const query = new URLSearchParams({
      challengeSlug: input.challengeSlug,
      instanceId: input.instanceId,
      assisted: String(input.assisted ?? false),
    });
    const payload = await request<{
      entries?: Array<{
        rank: number;
        publicHandle: string;
        competitionTokens: number;
        turns: number;
        assisted: boolean;
      }>;
    }>(`/v1/leaderboards/${encodeURIComponent(input.arena ?? "current")}?${query.toString()}`);
    return (
      payload.entries?.map((entry) => ({
        rank: entry.rank,
        handle: entry.publicHandle,
        tokens: entry.competitionTokens,
        turns: entry.turns,
        challengeSlug: input.challengeSlug!,
        assisted: entry.assisted,
      })) ?? []
    );
  } catch {
    return [];
  }
}

export async function getReplay(id: string): Promise<Replay> {
  if (!API_URL) return demoReplay;
  const payload = await request<{ attempt: WireAttempt; challenge: WireChallenge; events: WireEvent[] }>(
    `/v1/replays/${encodeURIComponent(id)}`,
  );
  return {
    id,
    handle: payload.attempt.publicHandle ?? "season_coach",
    challengeSlug: isChallengeSlug(payload.attempt.challengeSlug)
      ? payload.attempt.challengeSlug
      : "signal-vault",
    tokens: payload.attempt.competitionTokens,
    turns: payload.attempt.promptsUsed,
    events: payload.events.map(normalizeEvent),
    publishedAt: payload.attempt.startedAt,
  };
}

export async function getResult(id: string): Promise<AttemptResult> {
  if (API_URL && !id.startsWith("demo-")) {
    const payload = await request<{
      attempt: WireAttempt;
      usage: Array<{
        inputTokens: number;
        cachedInputTokens: number;
        outputTokens: number;
        reasoningTokens: number;
        totalTokens: number;
        actualCostNanoUsd: number;
      }>;
      verification?: { publicFeedback: string };
      leaderboard: Array<{ rank: number; attemptId: string; competitionTokens: number }>;
    }>(`/v1/attempts/${encodeURIComponent(id)}/result`);
    const attempt = normalizeAttempt(payload.attempt);
    const usage = payload.usage.reduce(
      (sum, item) => ({
        input: sum.input + item.inputTokens,
        cachedInput: sum.cachedInput + item.cachedInputTokens,
        output: sum.output + item.outputTokens,
        reasoning: sum.reasoning + item.reasoningTokens,
        total: sum.total + item.totalTokens,
        actualCostUsd: sum.actualCostUsd + item.actualCostNanoUsd / 1_000_000_000,
      }),
      { input: 0, cachedInput: 0, output: 0, reasoning: 0, total: 0, actualCostUsd: 0 },
    );
    const own = payload.leaderboard.find((entry) => entry.attemptId === id);
    return {
      attemptId: id,
      challengeSlug: attempt.challengeSlug,
      solved: attempt.status === "solved",
      tokens: attempt.competitionTokens,
      cheapestTokens: payload.leaderboard[0]?.competitionTokens,
      rank: own?.rank,
      playerCount: payload.leaderboard.length,
      turns: attempt.turnsUsed,
      assisted: attempt.assisted,
      usage,
      verifierMessage: payload.verification?.publicFeedback ?? "Exact verifier passed.",
    };
  }
  const slug = id.includes("clone-the-gremlin")
    ? "clone-the-gremlin"
    : id.includes("rigged-race")
      ? "rigged-race"
      : "signal-vault";
  const challenge = getChallenge(slug);
  const tokens = slug === "signal-vault" ? demoResult.tokens : slug === "clone-the-gremlin" ? 4_226 : 3_118;
  return {
    ...demoResult,
    attemptId: id,
    challengeSlug: slug,
    tokens,
    cheapestTokens: challenge.cheapestTokens ?? demoResult.cheapestTokens,
    usage: { ...demoResult.usage, total: tokens },
    verifierMessage:
      slug === "clone-the-gremlin"
        ? "42/42 private behaviors matched. 11/18 oracle probes used."
        : slug === "rigged-race"
          ? "All identities, evidence IDs, and numeric tolerances passed."
          : demoResult.verifierMessage,
  };
}

export async function saveConsent(preferences: ConsentPreferences): Promise<ConsentPreferences> {
  if (!API_URL) return preferences;
  const payload = await request<{ consent: ConsentPreferences }>("/v1/consents", {
    method: "POST",
    body: JSON.stringify({
      research: preferences.research,
      publicReplay: preferences.publicReplay,
      version: preferences.version,
    }),
  });
  return { ...payload.consent, operational: true };
}

export async function getConsent(): Promise<ConsentPreferences | undefined> {
  if (!API_URL) return undefined;
  const payload = await request<{ consent: ConsentPreferences | null }>("/v1/consents");
  return payload.consent ? { ...payload.consent, operational: true } : undefined;
}

export async function deleteAccountData(): Promise<void> {
  if (!API_URL) return;
  await request("/v1/account/data", { method: "DELETE" });
}

export async function saveEligibility(input: {
  age18Plus: true;
  usResident: true;
  version: string;
  turnstileToken?: string;
}): Promise<void> {
  await request("/v1/eligibility", { method: "POST", body: JSON.stringify(input) });
}
