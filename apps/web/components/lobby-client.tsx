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
    doorLabel: "Step 2: choose a mystery",
    symbol: "◇",
    description:
      "Solve a mystery together. You choose what to investigate; the AI handles the evidence and actions.",
    fit: "Best for clues, experiments, and a satisfying reveal.",
    includes: (challenge: Challenge) => challenge.playMode === "puzzle",
  },
  {
    id: "build",
    title: "Build",
    doorLabel: "Step 2: choose a build",
    symbol: "✦",
    description: "Give the AI a target. It probes, builds, tests, and keeps going until the result passes.",
    fit: "Best for testing ideas and making something that works.",
    includes: (challenge: Challenge) => challenge.playMode === "build",
  },
] as const;

const emptyCatalog: ModelCatalogV1 = { models: [], defaultModelId: "" };

function routeLabel(model: ModelProfileV1): string {
  return model.provider === "openai" ? "Direct from OpenAI" : "Via OpenRouter";
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
          <strong>{apiMode === "demo" ? "Week 01 · Precision Season" : "Today’s live challenges"}</strong>
          <p>Same model. Same task. Lower token count wins.</p>
        </div>
        <span className="pill">
          <span className="status-dot" /> {selectedModel?.displayName ?? "Choose a model"}
        </span>
      </div>

      <section className="model-checkpoint" aria-labelledby="model-checkpoint-title">
        <div className="model-checkpoint-heading">
          <div>
            <span className="eyebrow">Step 1: pick a model</span>
            <h2 id="model-checkpoint-title">Which AI will you coach?</h2>
            <p>Choose one, then pick a task. You’ll only compete with people using the same setup.</p>
          </div>
          <Link className="text-link" href="/models">
            Browse all models →
          </Link>
        </div>

        {!modelsLoaded ? <p className="model-picker-note">Loading this season’s models…</p> : null}
        {modelsLoaded && catalog.models.length === 0 ? (
          <p className="model-picker-note">We couldn’t load the models. Refresh and try once more.</p>
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
                    {available ? "Ready" : "Needs a route"}
                  </b>
                </span>
                <strong>{model.displayName}</strong>
                <small>
                  {available ? routeLabel(model) : "No live route yet"}, {model.reasoningMode} mode
                </small>
                <span className="model-pick-check" aria-hidden="true">
                  {selected ? "✓ Your pick" : available ? "Choose" : "—"}
                </span>
              </button>
            );
          })}
        </div>

        {selectedModel ? (
          <div className="model-lock-note" role="status">
            <span aria-hidden="true">◈</span>
            <div>
              <strong>You’ll play this run with {selectedModel.displayName}.</strong>
              <p>
                {selectedModel.ranked
                  ? "Its board only includes the same model, route, reasoning, tools, price table, task version, seed, and sandbox."
                  : "Practice is open while we tune its ranked arena."}
              </p>
            </div>
          </div>
        ) : null}
      </section>

      <section className="play-onboarding" aria-labelledby="play-loop-title">
        <div className="play-onboarding-heading">
          <span className="eyebrow">The short version</span>
          <h2 id="play-loop-title">You coach. The AI does the work.</h2>
        </div>
        <ol>
          <li>
            <b>1</b>
            <div>
              <strong>Pick a style</strong>
              <span>Uncover a mystery or build something that passes.</span>
            </div>
          </li>
          <li>
            <b>2</b>
            <div>
              <strong>Give one clear direction</strong>
              <span>Only the AI can inspect, act, edit, and submit.</span>
            </div>
          </li>
          <li>
            <b>3</b>
            <div>
              <strong>Get there with less</strong>
              <span>
                Every token reported for a model call counts. The first verified win locks your score.
              </span>
            </div>
          </li>
        </ol>
      </section>

      <div className="challenge-list" aria-label="Daily challenges">
        {!loaded ? (
          <article className="surface history-card">
            <h3>Setting up today’s challenges…</h3>
            <p>This should only take a moment.</p>
          </article>
        ) : null}
        {loaded && challenges.length === 0 ? (
          <article className="surface history-card">
            <h3>Today’s challenges didn’t load</h3>
            <p>Refresh the page and give it another try.</p>
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
