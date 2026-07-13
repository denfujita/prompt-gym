import Link from "next/link";

import { apiMode } from "@/lib/api";
import { compactNumber, formatTokens } from "@/lib/format";
import type { Challenge } from "@/lib/types";

import { Mascot } from "./mascot";

const cardCopy: Record<Challenge["slug"], { role: string; format: string; cta: string }> = {
  "signal-vault": {
    role: "Choose the next test, then help it connect the clues.",
    format: "Visual actions",
    cta: "Crack the vault",
  },
  "rigged-race": {
    role: "Point it toward the next file, alias, or timestamp worth checking.",
    format: "Evidence answer",
    cta: "Solve the case",
  },
  "clone-the-gremlin": {
    role: "Pick revealing inputs, then guide the AI toward the right fix.",
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
            {mode} {order} — {challenge.category}
          </span>
          <h3>{challenge.name}</h3>
        </div>
        <Mascot accent={challenge.accent} />
      </div>
      <p>{challenge.brief}</p>
      <div className="challenge-explainer">
        <div>
          <small>What you do</small>
          <p>{copy.role}</p>
        </div>
        <div>
          <small>You win when</small>
          <p>{challenge.objective}</p>
        </div>
      </div>
      <dl className="challenge-stats">
        <div>
          <dt>Result</dt>
          <dd>{copy.format}</dd>
        </div>
        <div>
          <dt>Time</dt>
          <dd>{challenge.timeLimitMinutes} min</dd>
        </div>
        <div>
          <dt>Difficulty</dt>
          <dd>{challenge.difficulty}</dd>
        </div>
      </dl>
      <div className="challenge-benchmark">
        <span>Score to beat</span>
        <strong>
          {challenge.cheapestTokens === null
            ? "Shown when you enter"
            : formatTokens(challenge.cheapestTokens)}
        </strong>
        <small>
          {challenge.playersToday === null
            ? "Compared on your exact task"
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
