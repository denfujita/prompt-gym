import type { Metadata } from "next";
import Link from "next/link";

import { BenchmarkLabClient } from "@/components/benchmark-lab-client";

export const metadata: Metadata = {
  title: "Benchmark Lab Preview",
  description: "A scripted look at turning coding benchmarks into head-to-head coaching challenges.",
};

const benchmarkCards = [
  {
    state: "Preview open",
    family: "GPU code · KernelBench-style",
    title: "Kernel Sprint",
    description: "Turn a PyTorch operator into a correct, faster Triton or CUDA kernel.",
    win: "All hidden correctness cases pass",
    score: "Best band, then fewer tokens",
    accent: "volt",
    action: "Try the preview",
    href: "#kernel-sprint-preview",
  },
  {
    state: "Next collection",
    family: "Repository code · Prompt Gym original",
    title: "Patch Sprint",
    description: "Guide the AI through a small software issue without touching the repo yourself.",
    win: "Issue tests and regression tests all pass",
    score: "Issues solved, then fewer tokens",
    accent: "sky",
  },
  {
    state: "Research track",
    family: "Bot code · research track",
    title: "Bot Arena",
    description: "Build a bot that climbs a fixed ladder of deterministic opponents.",
    win: "Beat the required opponent rung",
    score: "Highest rung, match margin, then fewer tokens",
    accent: "coral",
  },
] as const;

export default function BenchmarksPage() {
  return (
    <div className="benchmark-page">
      <section className="benchmark-hero">
        <div className="shell benchmark-hero-grid">
          <div>
            <span className="eyebrow">A scripted look at Benchmark Lab</span>
            <h1>Can you beat the model’s first try?</h1>
            <p>
              Daily Gym rewards a clean solve with fewer tokens. Benchmark Lab asks how far you can improve
              the same model before the budget runs out.
            </p>
            <div className="benchmark-hero-actions">
              <Link className="button button-dark" href="#kernel-sprint-preview">
                Try Kernel Sprint <span aria-hidden="true">↓</span>
              </Link>
              <Link className="button button-ghost" href="/play">
                Back to Daily Gym
              </Link>
            </div>
          </div>
          <aside className="benchmark-score-explainer">
            <span className="eyebrow">How ranking would work</span>
            <ol>
              <li>
                <b>1</b>
                <span>First, make it correct.</span>
              </li>
              <li>
                <b>2</b>
                <span>Then push it into Bronze, Silver, or Gold.</span>
              </li>
              <li>
                <b>3</b>
                <span>Within a band, fewer tokens wins.</span>
              </li>
            </ol>
            <p>We still show raw speed, but bands stop tiny timing swings from picking the winner.</p>
          </aside>
        </div>
      </section>

      <div className="benchmark-season-strip">
        <div className="shell">
          <strong>Kernel Season 01 · preview</strong>
          <span>GPT-5.6 Terra · medium</span>
          <span>Same GPU for everyone</span>
          <span>15,000-token cap</span>
          <span>3 evaluations</span>
          <span className="pill">Open prompting</span>
        </div>
      </div>

      <section className="section benchmark-catalog">
        <div className="shell">
          <div className="section-heading">
            <div>
              <span className="eyebrow">Pick a benchmark</span>
              <h2>You coach. The AI writes the code.</h2>
            </div>
            <p>
              You never touch the files. The AI writes, compiles, tests, and submits; the runner checks the
              result.
            </p>
          </div>
          <div className="benchmark-card-grid">
            {benchmarkCards.map((card) => (
              <article className={`benchmark-card accent-${card.accent}`} key={card.title}>
                <div className="benchmark-card-head">
                  <span className="pill">{card.state}</span>
                  <span aria-hidden="true">
                    {card.title === "Kernel Sprint" ? "⚡" : card.title === "Patch Sprint" ? "⌁" : "♜"}
                  </span>
                </div>
                <small>{card.family}</small>
                <h3>{card.title}</h3>
                <p>{card.description}</p>
                <dl>
                  <div>
                    <dt>You win when</dt>
                    <dd>{card.win}</dd>
                  </div>
                  <div>
                    <dt>Ranking</dt>
                    <dd>{card.score}</dd>
                  </div>
                </dl>
                {"href" in card ? (
                  <Link className="button button-dark" href={card.href}>
                    {card.action} <span aria-hidden="true">→</span>
                  </Link>
                ) : (
                  <span className="benchmark-coming">Coming after alpha</span>
                )}
              </article>
            ))}
          </div>
        </div>
      </section>

      <BenchmarkLabClient />

      <section className="section benchmark-methodology">
        <div className="shell benchmark-methodology-grid">
          <article>
            <span className="eyebrow">What’s live today</span>
            <h2>This is a demo, not a benchmark result.</h2>
            <p>
              Kernel Sprint is a fixed walkthrough. It uses no API or GPU credits, and your text doesn’t
              change the sample results. Ranked play will need an offline GPU runner, hidden randomized
              correctness tests, repeated timing, and independent reruns.
            </p>
          </article>
          <article>
            <span className="eyebrow">Where the idea comes from</span>
            <p>
              KernelBench checks whether generated GPU kernels are correct and faster than a PyTorch
              reference. Prompt Gym would run a fixed, fully disclosed setup. Our Bronze, Silver, and Gold
              bands are not official KernelBench metrics.
            </p>
            <div className="benchmark-source-links">
              <a href="https://github.com/ScalingIntelligence/KernelBench">
                Official KernelBench repository ↗
              </a>
              <a href="https://arxiv.org/abs/2502.10517">KernelBench paper ↗</a>
              <a href="https://github.com/ScalingIntelligence/KernelBench/blob/main/EVAL.md">
                Evaluation guidance ↗
              </a>
            </div>
          </article>
        </div>
      </section>
    </div>
  );
}
