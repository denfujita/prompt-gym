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
        <h1>{failed ? "We couldn’t load this result" : "Checking your result…"}</h1>
        <p>
          {failed
            ? "Sign in with the account that played this run, then try again."
            : "We’re pulling in your token total and rank."}
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
    ? "Practice run. This score stays off the leaderboard."
    : delta === undefined
      ? "There isn’t a comparison for your task yet."
      : delta === 0
        ? `You matched the cheapest win${result.rank === undefined ? "" : `, rank #${result.rank}`}`
        : `${formatTokens(delta)} more tokens than the cheapest win${result.rank === undefined ? "" : `, rank #${result.rank}`}`;
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
            {result.solved ? "✓ Verified win" : "Run finished"} · {challenge.name}
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
                  ? `Passed in ${result.turns} coaching turn${result.turns === 1 ? "" : "s"}.`
                  : "Try it again in practice. This score won’t change."}
              </p>
            </div>
          </div>
          <div className="result-stats">
            <div className="result-stat">
              <small>Tokens</small>
              <strong>{formatTokens(result.tokens)}</strong>
            </div>
            <div className="result-stat">
              <small>Coaching turns</small>
              <strong>{result.turns} / 6</strong>
            </div>
            <div className="result-stat">
              <small>Rank on this board</small>
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
            <h2>Token breakdown</h2>
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
            <p className="covered-cost">API cost: {formatCost(result.usage.actualCostUsd)} — on us</p>
          </section>

          <aside className="surface result-card">
            <span className="eyebrow">The final check</span>
            <h2>{result.solved ? "It passed" : "Not quite"}</h2>
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
                  Watch the cheapest demo win
                </Link>
              ) : null}
              <Link className="button button-ghost button-wide" href="/leaderboard">
                Open the leaderboard
              </Link>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
