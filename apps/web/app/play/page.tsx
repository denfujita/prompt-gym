import type { Metadata } from "next";
import Link from "next/link";

import { LobbyClient } from "@/components/lobby-client";
import { apiMode } from "@/lib/api";

export const metadata: Metadata = { title: "Daily Gym" };

function liveDateLabel(): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(new Date());
}

export default function PlayPage() {
  return (
    <div className="shell">
      <header className="page-header">
        <div className="page-header-row">
          <div>
            <span className="eyebrow">{apiMode === "demo" ? "Demo day · July 12" : liveDateLabel()}</span>
            <h1>What are you in the mood for?</h1>
            <p>
              Uncover a mystery in Puzzle, or coach the AI through a Build that has to survive hidden tests.
            </p>
          </div>
          <div className="lobby-meta">
            <div className="meta-card">
              <small>{apiMode === "demo" ? "Plays left today" : "Ranked starts"}</small>
              {apiMode === "demo" ? (
                <div className="energy-pips" aria-label="3 of 3 demo energy passes remaining">
                  <span />
                  <span />
                  <span />
                </div>
              ) : (
                <strong>Shown when you enter</strong>
              )}
            </div>
            <div className="meta-card">
              <small>This week</small>
              <strong>{apiMode === "demo" ? "Played 4 days" : "Coming soon"}</strong>
            </div>
          </div>
        </div>
      </header>

      <LobbyClient />

      <section className="benchmark-entry-banner" aria-labelledby="benchmark-entry-title">
        <div>
          <span className="eyebrow">Want something tougher?</span>
          <h2 id="benchmark-entry-title">Try to beat the model’s benchmark score.</h2>
          <p>
            Kernel Sprint is a scripted taste of the idea. Get a correct result, push it faster, and use fewer
            tokens than the other coaches. It doesn’t call a model or GPU yet.
          </p>
        </div>
        <Link className="button button-dark" href="/benchmarks">
          Try the lab preview <span aria-hidden="true">→</span>
        </Link>
      </section>

      <section className="lobby-bottom">
        <article className="surface history-card">
          <h3>Recent runs</h3>
          {apiMode === "demo" ? (
            <>
              <div className="history-row">
                <span>Crack the Signal Vault</span>
                <strong>2,843</strong>
                <span>Top 8%</span>
              </div>
              <div className="history-row">
                <span>Who Rigged the Race?</span>
                <strong>3,204</strong>
                <span>Top 19%</span>
              </div>
              <div className="history-row">
                <span>Copy the Gremlin</span>
                <strong>—</strong>
                <span>Unsolved</span>
              </div>
              <Link className="text-link" href="/profile">
                See all demo runs
              </Link>
            </>
          ) : (
            <p>Your full history isn’t connected yet. You’ll still see each result as soon as a run ends.</p>
          )}
        </article>
        <article className="surface rules-card">
          <h3>How scoring works</h3>
          <ul className="rules-list">
            <li>
              <b>1</b>
              <span>You write prompts. Only the model can touch the task.</span>
            </li>
            <li>
              <b>2</b>
              <span>Every token reported for a model call counts until the first verified win.</span>
            </li>
            <li>
              <b>3</b>
              <span>Hints open after two turns and move the run to the assisted board.</span>
            </li>
            <li>
              <b>4</b>
              <span>The clock is just for fun. Token ties stay tied.</span>
            </li>
          </ul>
        </article>
      </section>
    </div>
  );
}
