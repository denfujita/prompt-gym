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
            <h1>Today’s gym</h1>
            <p>Three fresh problems. One ranked start per task. Your first exact solve locks your score.</p>
          </div>
          <div className="lobby-meta">
            <div className="meta-card">
              <small>{apiMode === "demo" ? "Demo energy passes" : "Ranked starts"}</small>
              {apiMode === "demo" ? (
                <div className="energy-pips" aria-label="3 of 3 demo energy passes remaining">
                  <span />
                  <span />
                  <span />
                </div>
              ) : (
                <strong>Checked at entry</strong>
              )}
            </div>
            <div className="meta-card">
              <small>{apiMode === "demo" ? "Demo weekly form" : "Weekly form"}</small>
              <strong>{apiMode === "demo" ? "4 day run" : "Not yet synced"}</strong>
            </div>
          </div>
        </div>
      </header>

      <LobbyClient />

      <section className="lobby-bottom">
        <article className="surface history-card">
          <h3>Your recent form</h3>
          {apiMode === "demo" ? (
            <>
              <div className="history-row">
                <span>Signal Vault</span>
                <strong>2,843</strong>
                <span>Top 8%</span>
              </div>
              <div className="history-row">
                <span>Rigged Race</span>
                <strong>3,204</strong>
                <span>Top 19%</span>
              </div>
              <div className="history-row">
                <span>Clone the Gremlin</span>
                <strong>—</strong>
                <span>Unsolved</span>
              </div>
              <Link className="text-link" href="/profile">
                View demo history
              </Link>
            </>
          ) : (
            <p>
              Personal history is not exposed by the live API yet. Your completed run result remains available
              directly after verification.
            </p>
          )}
        </article>
        <article className="surface rules-card">
          <h3>Keep it clean</h3>
          <ul className="rules-list">
            <li>
              <b>1</b>
              <span>You only prompt. The model alone can touch the task.</span>
            </li>
            <li>
              <b>2</b>
              <span>All provider-reported tokens count until the first exact solve.</span>
            </li>
            <li>
              <b>3</b>
              <span>Hints unlock after two turns and move you to the assisted board.</span>
            </li>
            <li>
              <b>4</b>
              <span>Time is displayed for fun. It never breaks a token tie.</span>
            </li>
          </ul>
        </article>
      </section>
    </div>
  );
}
