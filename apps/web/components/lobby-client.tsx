"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { apiMode, listChallenges, listModels } from "@/lib/api";
import { challenges as demoChallenges, demoModelCatalog } from "@/lib/demo-data";
import type { Challenge, ModelCatalogV1, ModelProfileV1 } from "@/lib/types";

import { ChallengeCard } from "./challenge-card";

const playModes = [
  {
    id: "puzzle",
    title: "Puzzle",
    doorLabel: "Step 2 · pick a puzzle",
    symbol: "◇",
    description:
      "Solve a mystery with your AI. Tell it what to investigate; it handles the evidence and actions.",
    fit: "Pick this when you want deduction, experiments, and a clean final answer.",
    includes: (challenge: Challenge) => challenge.playMode === "puzzle",
  },
  {
    id: "build",
    title: "Build",
    doorLabel: "Step 2 · pick a build",
    symbol: "✦",
    description: "Coach your AI to make the match. Give it a target; it probes, builds, tests, and submits.",
    fit: "Pick this when you want probes, code changes, tests, and a verifier-passing artifact.",
    includes: (challenge: Challenge) => challenge.playMode === "build",
  },
] as const;

const emptyCatalog: ModelCatalogV1 = { models: [], defaultModelId: "" };

function routeLabel(model: ModelProfileV1): string {
  return model.provider === "openai" ? "Direct route" : "OpenRouter route";
}

export function LobbyClient() {
  const [challenges, setChallenges] = useState<Challenge[]>(apiMode === "demo" ? demoChallenges : []);
  const [loaded, setLoaded] = useState(apiMode === "demo");
  const [catalog, setCatalog] = useState<ModelCatalogV1>(
    apiMode === "demo" ? demoModelCatalog : emptyCatalog,
  );
  const [modelsLoaded, setModelsLoaded] = useState(apiMode === "demo");
  const [selectedModelId, setSelectedModelId] = useState(
    apiMode === "demo" ? demoModelCatalog.defaultModelId : "",
  );

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

  useEffect(() => {
    let active = true;
    void listModels().then((nextCatalog) => {
      if (!active) return;
      setCatalog(nextCatalog);
      setModelsLoaded(true);
      const params = new URLSearchParams(window.location.search);
      const requested = params.get("model");
      const remembered = window.localStorage.getItem("prompt-gym:model-profile");
      const selectable = nextCatalog.models.filter((model) => model.availability === "available");
      const selected =
        selectable.find((model) => model.id === requested) ??
        selectable.find((model) => model.id === remembered) ??
        selectable.find((model) => model.id === nextCatalog.defaultModelId) ??
        selectable[0];
      if (!selected) return;
      setSelectedModelId(selected.id);
      window.localStorage.setItem("prompt-gym:model-profile", selected.id);
      params.set("model", selected.id);
      window.history.replaceState(
        {},
        "",
        `${window.location.pathname}?${params.toString()}${window.location.hash}`,
      );
    });
    return () => {
      active = false;
    };
  }, []);

  function chooseModel(model: ModelProfileV1) {
    if (model.availability !== "available") return;
    setSelectedModelId(model.id);
    window.localStorage.setItem("prompt-gym:model-profile", model.id);
    const url = new URL(window.location.href);
    url.searchParams.set("model", model.id);
    window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
  }

  const selectedModel = catalog.models.find((model) => model.id === selectedModelId);
  const availableModels = catalog.models.filter((model) => model.availability === "available");
  const featuredAvailable = selectedModel
    ? [selectedModel, ...availableModels.filter((model) => model.id !== selectedModel.id)].slice(0, 4)
    : availableModels.slice(0, 4);
  const needsRoutePreview = catalog.models.find((model) => model.availability === "needs-route");
  const pickerModels = needsRoutePreview ? [...featuredAvailable, needsRoutePreview] : featuredAvailable;

  return (
    <>
      <div className="lobby-banner">
        <div>
          <strong>{apiMode === "demo" ? "Week 01 · Precision Season" : "Live daily circuit"}</strong>
          <p>Same pinned model. Same challenge seed. Fewer provider-reported tokens wins.</p>
        </div>
        <span className="pill">
          <span className="status-dot" /> {selectedModel?.displayName ?? "Choose a model"}
        </span>
      </div>

      <section className="model-checkpoint" aria-labelledby="model-checkpoint-title">
        <div className="model-checkpoint-heading">
          <div>
            <span className="eyebrow">Step 1 · choose your contender</span>
            <h2 id="model-checkpoint-title">Which AI will you coach?</h2>
            <p>
              Pick once, then choose a task. Your run is compared only with people coaching this exact model
              and configuration.
            </p>
          </div>
          <Link className="text-link" href="/models">
            See every model & route →
          </Link>
        </div>

        {!modelsLoaded ? <p className="model-picker-note">Loading the season model card…</p> : null}
        {modelsLoaded && catalog.models.length === 0 ? (
          <p className="model-picker-note">
            The live model roster is unavailable. Try refreshing before entry.
          </p>
        ) : null}
        <div className="model-picker" role="radiogroup" aria-label="Choose a model for your run">
          {pickerModels.map((model) => {
            const selected = model.id === selectedModelId;
            const available = model.availability === "available";
            return (
              <button
                aria-checked={selected}
                className={`model-pick-card ${selected ? "is-selected" : ""} ${available ? "" : "is-unavailable"}`}
                disabled={!available}
                key={model.id}
                onClick={() => chooseModel(model)}
                role="radio"
                type="button"
              >
                <span className="model-pick-topline">
                  <span>{model.creator}</span>
                  <b className={`route-state ${available ? "is-ready" : "is-needed"}`}>
                    {available ? "Available" : "Needs route"}
                  </b>
                </span>
                <strong>{model.displayName}</strong>
                <small>
                  {available ? routeLabel(model) : "No production endpoint yet"} · {model.reasoningMode} mode
                </small>
                <span className="model-pick-check" aria-hidden="true">
                  {selected ? "✓ Selected" : available ? "Choose" : "—"}
                </span>
              </button>
            );
          })}
        </div>

        {selectedModel ? (
          <div className="model-lock-note" role="status">
            <span aria-hidden="true">◈</span>
            <div>
              <strong>{selectedModel.displayName} will be locked when you enter.</strong>
              <p>
                {selectedModel.ranked
                  ? "Its leaderboard is isolated from every other model, route, reasoning setting, and price season."
                  : "This model is available for practice while its ranked arena is calibrated."}
              </p>
            </div>
          </div>
        ) : null}
      </section>

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
                        modelDisplayName={selectedModel?.displayName}
                        modelProfileId={selectedModel?.id}
                        modelRanked={selectedModel?.ranked}
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
