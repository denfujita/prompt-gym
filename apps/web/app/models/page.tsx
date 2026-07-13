import type { Metadata } from "next";

import { ModelsRoster } from "@/components/models-roster";

export const metadata: Metadata = { title: "Models" };

export default function ModelsPage() {
  return (
    <div className="shell models-page">
      <header className="models-hero">
        <div>
          <span className="eyebrow">The contender wall</span>
          <h1>Coach more models. Keep every match fair.</h1>
        </div>
        <div className="models-hero-copy">
          <p>
            The breadth is inspired by{" "}
            <a href="https://www.designarena.ai/models" rel="noreferrer" target="_blank">
              Design Arena
            </a>
            . Prompt Gym changes the contest: people compete to get a pinned model through an exact task with
            the fewest tokens.
          </p>
          <div className="models-fairness-card">
            <span aria-hidden="true">≠</span>
            <div>
              <strong>Models never share a raw-token leaderboard.</strong>
              <small>Route, reasoning, tools, prices, and challenge version must match.</small>
            </div>
          </div>
        </div>
      </header>

      <ModelsRoster />
    </div>
  );
}
