"use client";

import { useEffect, useMemo, useState } from "react";

import { apiMode, getLeaderboard } from "@/lib/api";
import { challenges, leaderboard as demoEntries } from "@/lib/demo-data";
import { formatTokens } from "@/lib/format";
import type { ChallengeSlug, LeaderboardEntry } from "@/lib/types";

export function LeaderboardClient() {
  const [challenge, setChallenge] = useState<ChallengeSlug>("signal-vault");
  const [track, setTrack] = useState<"unassisted" | "assisted">("unassisted");
  const [entries, setEntries] = useState<LeaderboardEntry[]>(apiMode === "demo" ? demoEntries : []);
  const [needsInstance, setNeedsInstance] = useState(false);

  useEffect(() => {
    let active = true;
    if (apiMode === "demo") {
      setEntries(demoEntries);
      setNeedsInstance(false);
    } else {
      const instanceId = localStorage.getItem(`prompt-gym:seed:${challenge}`);
      if (!instanceId) {
        setEntries([]);
        setNeedsInstance(true);
      } else {
        setNeedsInstance(false);
        void getLeaderboard({
          arena: "current",
          challengeSlug: challenge,
          instanceId,
          assisted: track === "assisted",
        }).then((data) => {
          if (active) setEntries(data);
        });
      }
    }
    return () => {
      active = false;
    };
  }, [challenge, track]);

  const visible = useMemo(() => {
    return entries
      .filter((entry) => entry.challengeSlug === challenge)
      .filter((entry) => (track === "assisted" ? entry.assisted : !entry.assisted));
  }, [challenge, entries, track]);

  return (
    <>
      <div className="board-controls">
        <div className="segmented" role="tablist" aria-label="Challenge leaderboard">
          {challenges.map((item) => (
            <button
              className={challenge === item.slug ? "is-active" : ""}
              key={item.slug}
              onClick={() => setChallenge(item.slug)}
              role="tab"
              aria-selected={challenge === item.slug}
              type="button"
            >
              {item.name}
            </button>
          ))}
        </div>
        <div className="segmented" role="tablist" aria-label="Assistance track">
          <button
            className={track === "unassisted" ? "is-active" : ""}
            onClick={() => setTrack("unassisted")}
            role="tab"
            aria-selected={track === "unassisted"}
            type="button"
          >
            Unassisted
          </button>
          <button
            className={track === "assisted" ? "is-active" : ""}
            onClick={() => setTrack("assisted")}
            role="tab"
            aria-selected={track === "assisted"}
            type="button"
          >
            Assisted
          </button>
        </div>
      </div>

      <div className="board-callout">
        <p>
          <strong>Fair board:</strong>{" "}
          {needsInstance
            ? "Start this challenge once to reveal your exact-instance board."
            : "Scores are compared only within the same hidden instance, model configuration, and challenge version."}
        </p>
        {apiMode === "demo" ? (
          <span className="pill">Demo closes in 06:18:42</span>
        ) : (
          <span className="pill">Season timing set by server</span>
        )}
      </div>

      <div className="surface leaderboard-wrap">
        <table className="leaderboard-table">
          <thead>
            <tr>
              <th>Rank</th>
              <th>Coach</th>
              <th>Tokens</th>
              <th>Turns</th>
              <th>Result</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((entry) => (
              <tr className={entry.isCurrentUser ? "is-you" : ""} key={`${entry.rank}-${entry.handle}`}>
                <td>
                  <span className="rank-badge">{entry.rank}</span>
                </td>
                <td>{entry.isCurrentUser ? `${entry.handle} · you` : entry.handle}</td>
                <td>{formatTokens(entry.tokens)}</td>
                <td>{entry.turns}</td>
                <td>Exact solve</td>
              </tr>
            ))}
            {visible.length === 0 ? (
              <tr>
                <td colSpan={5}>No exact-instance solves are visible on this track yet.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </>
  );
}
