"use client";

import { useEffect, useState } from "react";

import { apiMode, listChallenges } from "@/lib/api";
import { challenges as demoChallenges } from "@/lib/demo-data";
import type { Challenge } from "@/lib/types";

import { ChallengeCard } from "./challenge-card";

export function LobbyClient() {
  const [challenges, setChallenges] = useState<Challenge[]>(apiMode === "demo" ? demoChallenges : []);
  const [loaded, setLoaded] = useState(apiMode === "demo");

  useEffect(() => {
    let active = true;
    void listChallenges().then((data) => {
      if (!active) return;
      setChallenges(data);
      setLoaded(true);
    });
    return () => {
      active = false;
    };
  }, []);

  return (
    <>
      <div className="lobby-banner">
        <div>
          <strong>{apiMode === "demo" ? "Week 01 · Precision Season" : "Live daily circuit"}</strong>
          <p>
            {apiMode === "demo"
              ? "Your instance is fixed for the day. The leaderboard closes Sunday at 7:00 PM PT."
              : "Your exact instance, ranked eligibility, and board are confirmed when a run starts."}
          </p>
        </div>
        <span className="pill">
          <span className="status-dot" /> GPT-5.6 Terra · Medium
        </span>
      </div>

      <section className="challenge-list" aria-label="Daily challenges">
        {!loaded ? (
          <article className="surface history-card">
            <h3>Loading today’s live circuit…</h3>
            <p>Waiting for challenge manifests from Prompt Gym.</p>
          </article>
        ) : null}
        {loaded && challenges.length === 0 ? (
          <article className="surface history-card">
            <h3>Live circuit unavailable</h3>
            <p>No challenge manifests were returned. Refresh when the API is available.</p>
          </article>
        ) : null}
        {challenges.map((challenge, index) => (
          <ChallengeCard challenge={challenge} key={challenge.slug} order={index + 1} />
        ))}
      </section>
    </>
  );
}
