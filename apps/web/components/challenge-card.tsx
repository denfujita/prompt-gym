import Link from "next/link";

import { apiMode } from "@/lib/api";
import { compactNumber, formatTokens } from "@/lib/format";
import type { Challenge } from "@/lib/types";

import { Mascot } from "./mascot";

export function ChallengeCard({ challenge, order }: { challenge: Challenge; order: number }) {
  return (
    <article className={`challenge-card accent-${challenge.accent}`}>
      <div className="challenge-card-top">
        <div>
          <span className="eyebrow">
            0{order} · {challenge.category}
          </span>
          <h3>{challenge.name}</h3>
        </div>
        <Mascot accent={challenge.accent} />
      </div>
      <p>{challenge.brief}</p>
      <dl className="challenge-stats">
        <div>
          <dt>Best today</dt>
          <dd>
            {challenge.cheapestTokens === null ? "After entry" : formatTokens(challenge.cheapestTokens)}
          </dd>
        </div>
        <div>
          <dt>Players</dt>
          <dd>{challenge.playersToday === null ? "Exact seed" : compactNumber(challenge.playersToday)}</dd>
        </div>
        <div>
          <dt>Difficulty</dt>
          <dd>{challenge.difficulty}</dd>
        </div>
      </dl>
      <div className="challenge-card-footer">
        <span
          className="energy-cost"
          aria-label={apiMode === "demo" ? "Costs one demo energy pass" : "Uses the challenge's ranked start"}
        >
          <span aria-hidden="true">⚡</span> {apiMode === "demo" ? "1 demo pass" : "Ranked start"}
        </span>
        <Link className="button button-dark" href={`/arena/${challenge.slug}`}>
          Enter challenge <span aria-hidden="true">→</span>
        </Link>
      </div>
    </article>
  );
}
