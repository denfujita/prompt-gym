import Link from "next/link";

import { apiMode } from "@/lib/api";
import { compactNumber, formatTokens } from "@/lib/format";
import type { Challenge } from "@/lib/types";

import { Mascot } from "./mascot";

const cardCopy: Record<Challenge["slug"], { role: string; format: string; cta: string }> = {
  "signal-vault": {
    role: "Tell it what to test next and help it connect the clues.",
    format: "Visual actions",
    cta: "Crack the vault",
  },
  "rigged-race": {
    role: "Tell it which file, alias, or timestamp to investigate next.",
    format: "Evidence answer",
    cta: "Solve the case",
  },
  "clone-the-gremlin": {
    role: "Choose revealing test inputs, then tell the AI what to fix.",
    format: "Working code",
    cta: "Build the clone",
  },
};

export function ChallengeCard({
  challenge,
  mode,
  modelDisplayName,
  modelProfileId,
  modelRanked = true,
  order,
}: {
  challenge: Challenge;
  mode: "Puzzle" | "Build";
  modelDisplayName?: string;
  modelProfileId?: string;
  modelRanked?: boolean;
  order: number;
}) {
  const copy = cardCopy[challenge.slug];
  const query = new URLSearchParams();
  if (modelProfileId) query.set("model", modelProfileId);
  query.set("mode", modelRanked ? "ranked" : "practice");
  return (
    <article className={`challenge-card accent-${challenge.accent}`}>
      <div className="challenge-card-top">
        <div>
          <span className="eyebrow">
            {mode} {order} · {challenge.category}
          </span>
          <h3>{challenge.name}</h3>
        </div>
        <Mascot accent={challenge.accent} />
      </div>
      <p>{challenge.brief}</p>
      <div className="challenge-explainer">
        <div>
          <small>Your role</small>
          <p>{copy.role}</p>
        </div>
        <div>
          <small>Verified win</small>
          <p>{challenge.objective}</p>
        </div>
      </div>
      <dl className="challenge-stats">
        <div>
          <dt>Outcome</dt>
          <dd>{copy.format}</dd>
        </div>
        <div>
          <dt>Time box</dt>
          <dd>{challenge.timeLimitMinutes} min</dd>
        </div>
        <div>
          <dt>Difficulty</dt>
          <dd>{challenge.difficulty}</dd>
        </div>
      </dl>
      <div className="challenge-benchmark">
        <span>Cheapest verified solve</span>
        <strong>
          {challenge.cheapestTokens === null
            ? "Revealed after entry"
            : formatTokens(challenge.cheapestTokens)}
        </strong>
        <small>
          {challenge.playersToday === null
            ? "Compared on your exact seed"
            : `${compactNumber(challenge.playersToday)} players today`}
        </small>
      </div>
      <div className="challenge-card-footer">
        <span
          className="energy-cost"
          aria-label={apiMode === "demo" ? "Costs one demo energy pass" : "Uses the challenge's ranked start"}
        >
          <span aria-hidden="true">⚡</span>{" "}
          {modelRanked ? (apiMode === "demo" ? "1 demo pass" : "Ranked start") : "Practice run"}
        </span>
        <Link
          aria-label={`${copy.cta} with ${modelDisplayName ?? "the default model"}`}
          className="button button-dark"
          href={`/arena/${challenge.slug}?${query.toString()}`}
        >
          {copy.cta} <span aria-hidden="true">→</span>
        </Link>
      </div>
    </article>
  );
}
