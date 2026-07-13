"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

import { apiMode, getResult } from "@/lib/api";
import { getChallenge } from "@/lib/demo-data";
import { formatCost, formatTokens, scoreDelta } from "@/lib/format";
import type { AttemptResult } from "@/lib/types";

export default function ResultPage() {
  const { id } = useParams<{ id: string }>();
  const [result, setResult] = useState<AttemptResult | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    void getResult(id)
      .then((value) => {
        if (active) setResult(value);
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
    };
  }, [id]);

  if (!result) {
    return (
      <div className="narrow-shell page-header">
        <span className="eyebrow">Result</span>
        <h1>{failed ? "Result unavailable" : "Checking the verifier…"}</h1>
        <p>
          {failed
            ? "Sign in with the account that owns this run, then try again."
            : "Loading exact usage and instance rank."}
        </p>
      </div>
    );
  }
  const challenge = getChallenge(result.challengeSlug);
  const isBuild = challenge.playMode === "build";
  const rewardTitle = result.solved
    ? isBuild
      ? "Verified Build"
      : "Case Cracked"
    : isBuild
      ? "Build Attempted"
      : "Case Still Open";
  const delta =
    result.cheapestTokens === undefined ? undefined : scoreDelta(result.tokens, result.cheapestTokens);
  const comparison = !result.ranked
    ? "Practice run · your result did not enter the leaderboard."
    : delta === undefined
      ? "Exact-instance comparison is not available yet."
      : delta === 0
        ? `Cheapest solve${result.rank === undefined ? "" : ` · rank #${result.rank}`}`
        : `${formatTokens(delta)} above the cheapest solve${result.rank === undefined ? "" : ` · rank #${result.rank}`}`;
  const usage = [
    ["Uncached input", Math.max(0, result.usage.input - result.usage.cachedInput)],
    ["Cached input", result.usage.cachedInput],
    ["Visible output", Math.max(0, result.usage.output - result.usage.reasoning)],
    ["Reasoning", result.usage.reasoning],
  ] as const;

  return (
    <div className="result-page">
      <div className="shell">
        <section className="result-hero">
          <span className="result-kicker">
            {result.solved ? "✓ Exact solve" : "Run complete"} · {challenge.name}
          </span>
          <h1>
            {result.solved ? "Solved" : "Finished"} in {formatTokens(result.tokens)} tokens.
          </h1>
          <p>{comparison}</p>
          <div className={`result-reward-stamp ${isBuild ? "is-build" : "is-puzzle"}`}>
            <span aria-hidden="true">{result.solved ? (isBuild ? "✦" : "◇") : "·"}</span>
            <div>
              <small>{isBuild ? "Build badge" : "Puzzle badge"}</small>
              <strong>{rewardTitle}</strong>
              <p>
                {result.solved
                  ? `Exact verifier passed in ${result.turns} coaching turn${result.turns === 1 ? "" : "s"}.`
                  : "Return in practice mode to improve the run without changing this score."}
              </p>
            </div>
          </div>
          <div className="result-stats">
            <div className="result-stat">
              <small>Competition score</small>
              <strong>{formatTokens(result.tokens)}</strong>
            </div>
            <div className="result-stat">
              <small>Coaching turns</small>
              <strong>{result.turns} / 6</strong>
            </div>
            <div className="result-stat">
              <small>Exact-instance rank</small>
              <strong>
                {!result.ranked
                  ? "Practice · unranked"
                  : result.rank === undefined
                    ? "Pending"
                    : `#${result.rank}`}
              </strong>
            </div>
            <div className="result-stat">
              <small>Track</small>
              <strong>{result.assisted ? "Assisted" : "Unassisted"}</strong>
            </div>
          </div>
        </section>

        <div className="result-grid">
          <section className="surface result-card">
            <span className="eyebrow">Where your tokens went</span>
            <h2>Usage breakdown</h2>
            <div className="usage-list">
              {usage.map(([label, value]) => (
                <div className="usage-row" key={label}>
                  <span>{label}</span>
                  <span className="usage-row-bar" aria-hidden="true">
                    <span
                      style={{
                        width: `${Math.min(100, (value / Math.max(1, result.usage.total)) * 100 * 2.3)}%`,
                      }}
                    />
                  </span>
                  <strong>{formatTokens(value)}</strong>
                </div>
              ))}
            </div>
            <p className="covered-cost">
              Actual API cost: {formatCost(result.usage.actualCostUsd)} · covered by Prompt Gym
            </p>
          </section>

          <aside className="surface result-card">
            <span className="eyebrow">Deterministic check</span>
            <h2>Verifier</h2>
            <div className="verifier-box">
              <span aria-hidden="true">{result.solved ? "✓" : "!"}</span>
              <div>
                <strong>{result.solved ? "PASS" : "NOT PASSED"}</strong>
                <p>{result.verifierMessage}</p>
              </div>
            </div>
            <div className="result-actions">
              <Link className="button button-dark button-wide" href="/play">
                Next daily challenge →
              </Link>
              {apiMode === "demo" ? (
                <Link className="button button-wide" href="/replays/tiny-prompt-signal-vault">
                  Watch demo cheapest solve
                </Link>
              ) : null}
              <Link className="button button-ghost button-wide" href="/leaderboard">
                View full board
              </Link>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
