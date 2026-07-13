import type { Metadata } from "next";

import { ModelsRoster } from "@/components/models-roster";

export const metadata: Metadata = { title: "Models" };

export default function ModelsPage() {
  return (
    <div className="shell models-page">
      <header className="models-hero">
        <div>
          <span className="eyebrow">Choose your AI</span>
          <h1>Every playable model gets its own arena.</h1>
        </div>
        <div className="models-hero-copy">
          <p>
            The roster is inspired by{" "}
            <a href="https://www.designarena.ai/models" rel="noreferrer" target="_blank">
              Design Arena
            </a>
            . Here, you coach one model through a verified task and try to do it with fewer tokens than
            everyone else.
          </p>
          <div className="models-fairness-card">
            <span aria-hidden="true">≠</span>
            <div>
              <strong>No cross-model token comparisons.</strong>
              <small>
                Same model, route, reasoning, tools, price table, task version, seed, and sandbox—or it’s a
                different board.
              </small>
            </div>
          </div>
        </div>
      </header>

      <ModelsRoster />
    </div>
  );
}
