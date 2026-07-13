"use client";

import { useEffect, useState } from "react";

import { apiMode, listChallenges } from "@/lib/api";
import { challenges as demoChallenges } from "@/lib/demo-data";
import type { Challenge } from "@/lib/types";

import { ChallengeCard } from "./challenge-card";

const playModes = [
  {
    id: "puzzle",
    title: "Puzzle",
    doorLabel: "Door 1 · discover",
    symbol: "◇",
    description:
      "Solve a mystery with your AI. Tell it what to investigate; it handles the evidence and actions.",
    fit: "Pick this when you want deduction, experiments, and a clean final answer.",
    includes: (challenge: Challenge) => challenge.playMode === "puzzle",
  },
  {
    id: "build",
    title: "Build",
    doorLabel: "Door 2 · create",
    symbol: "✦",
    description: "Coach your AI to make the match. Give it a target; it probes, builds, tests, and submits.",
    fit: "Pick this when you want probes, code changes, tests, and a verifier-passing artifact.",
    includes: (challenge: Challenge) => challenge.playMode === "build",
  },
] as const;

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
              ? "Same AI. Same challenge. Fewer tokens wins. Your instance is fixed for the day."
              : "Same AI. Same challenge. Fewer tokens wins. Your exact board is confirmed at entry."}
          </p>
        </div>
        <span className="pill">
          <span className="status-dot" /> GPT-5.6 Terra · Medium
        </span>
      </div>

      <section className="play-onboarding" aria-labelledby="play-loop-title">
        <div className="play-onboarding-heading">
          <span className="eyebrow">60-second orientation</span>
          <h2 id="play-loop-title">You are the coach, not the operator.</h2>
        </div>
        <ol>
          <li>
            <b>1</b>
            <div>
              <strong>Choose a play style</strong>
              <span>Puzzle means discover. Build means make.</span>
            </div>
          </li>
          <li>
            <b>2</b>
            <div>
              <strong>Send one precise direction</strong>
              <span>The AI alone can inspect, act, edit, and submit.</span>
            </div>
          </li>
          <li>
            <b>3</b>
            <div>
              <strong>Reach the verifier for less</strong>
              <span>Every model token counts. Exact success locks your score.</span>
            </div>
          </li>
        </ol>
      </section>

      <div className="challenge-list" aria-label="Daily challenges">
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
        {loaded
          ? playModes.map((mode) => {
              const modeChallenges = challenges.filter(mode.includes);
              if (!modeChallenges.length) return null;
              return (
                <section className={`challenge-mode challenge-mode-${mode.id}`} key={mode.id}>
                  <header className="challenge-mode-header">
                    <span className="challenge-mode-symbol" aria-hidden="true">
                      {mode.symbol}
                    </span>
                    <div>
                      <span className="eyebrow">{mode.doorLabel}</span>
                      <h2>{mode.title}</h2>
                      <p>{mode.description}</p>
                    </div>
                    <small>{mode.fit}</small>
                  </header>
                  <div className="challenge-mode-grid">
                    {modeChallenges.map((challenge, index) => (
                      <ChallengeCard
                        challenge={challenge}
                        key={challenge.slug}
                        mode={mode.title}
                        order={index + 1}
                      />
                    ))}
                  </div>
                </section>
              );
            })
          : null}
      </div>
    </>
  );
}
