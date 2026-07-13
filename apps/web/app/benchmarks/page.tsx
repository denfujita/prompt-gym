import type { Metadata } from "next";
import Link from "next/link";

import { BenchmarkLabClient } from "@/components/benchmark-lab-client";

export const metadata: Metadata = {
  title: "Benchmark Lab Preview",
  description: "A scripted preview of Prompt Gym's proposed correctness-gated coding benchmark mode.",
};

const benchmarkCards = [
  {
    state: "Preview open",
    family: "KernelBench-style preview · GPU code",
    title: "Kernel Sprint",
    description: "Coach the AI to turn a PyTorch operator into a correct, faster Triton or CUDA kernel.",
    win: "All hidden correctness cases pass",
    score: "Bronze / Silver / Gold band, then fewer tokens",
    accent: "volt",
    action: "Try the scripted preview",
    href: "#kernel-sprint-preview",
  },
  {
    state: "Next collection",
    family: "Prompt Gym original · repository code",
    title: "Patch Sprint",
    description: "Coach the AI through a compact software issue without touching the repository yourself.",
    win: "Issue tests and regression tests all pass",
    score: "Tasks solved, then fewer tokens",
    accent: "sky",
  },
  {
    state: "Research track",
    family: "CodeClash-inspired research · bot code",
    title: "Bot Arena",
    description: "Coach the AI to build a bot that climbs a frozen ladder of deterministic opponents.",
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
            <span className="eyebrow">Scripted product preview</span>
            <h1>How far can you push the model?</h1>
            <p>
              Daily Gym rewards the shortest exact solve. A live Benchmark Lab would reward the highest
              verified performance band you can coach from the same pinned model under a fixed token budget.
            </p>
            <div className="benchmark-hero-actions">
              <Link className="button button-dark" href="#kernel-sprint-preview">
                Preview Kernel Sprint <span aria-hidden="true">↓</span>
              </Link>
              <Link className="button button-ghost" href="/play">
                Return to Daily Gym
              </Link>
            </div>
          </div>
          <aside className="benchmark-score-explainer">
            <span className="eyebrow">Proposed fair-play rule</span>
            <ol>
              <li>
                <b>1</b>
                <span>Correctness unlocks a score.</span>
              </li>
              <li>
                <b>2</b>
                <span>Verified performance would earn Bronze, Silver, or Gold.</span>
              </li>
              <li>
                <b>3</b>
                <span>Inside a band, the coach who spent fewer tokens ranks higher.</span>
              </li>
            </ol>
            <p>Exact speed remains visible. Stable bands keep tiny GPU timing noise from deciding winners.</p>
          </aside>
        </div>
      </section>

      <div className="benchmark-season-strip">
        <div className="shell">
          <strong>Proposed Kernel Season 01</strong>
          <span>GPT-5.6 Terra · medium</span>
          <span>Pinned GPU target</span>
          <span>15,000-token cap</span>
          <span>3 evaluation cap</span>
          <span className="pill">Open prompting</span>
        </div>
      </div>

      <section className="section benchmark-catalog">
        <div className="shell">
          <div className="section-heading">
            <div>
              <span className="eyebrow">Benchmark collections</span>
              <h2>Code is the model’s controller.</h2>
            </div>
            <p>
              In live ranked play, you would still only prompt. The AI would write, compile, test, and submit
              while standardized runners grade the artifact.
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
                    <dt>Verified when</dt>
                    <dd>{card.win}</dd>
                  </div>
                  <div>
                    <dt>Ranked by</dt>
                    <dd>{card.score}</dd>
                  </div>
                </dl>
                {"href" in card ? (
                  <Link className="button button-dark" href={card.href}>
                    {card.action} <span aria-hidden="true">→</span>
                  </Link>
                ) : (
                  <span className="benchmark-coming">Not enabled in the alpha</span>
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
            <span className="eyebrow">What is real today</span>
            <h2>A product preview, not a benchmark claim.</h2>
            <p>
              The interactive Kernel Sprint above is a fixed walkthrough and spends no API or GPU credits.
              Entered text is displayed but does not change its sample results. Ranked launch requires a
              pinned, networkless GPU runner, hidden randomized correctness cases, repeated timing, and
              independent reruns of leaderboard scores.
            </p>
          </article>
          <article>
            <span className="eyebrow">Research basis</span>
            <p>
              KernelBench evaluates whether generated GPU kernels are both correct and faster than a PyTorch
              reference. Prompt Gym would use a pinned compatible runner and disclose every environment
              detail. Bronze, Silver, and Gold are Prompt Gym bands, not official KernelBench metrics.
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
