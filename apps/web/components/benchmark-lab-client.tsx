"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";

import { benchmarkTier, compareBenchmarkScores, type BenchmarkTier } from "@/lib/benchmark-score";
import { formatTokens } from "@/lib/format";

type Phase = "idle" | "thinking" | "editing" | "checking" | "timing";

interface DemoRound {
  tokenDelta: number;
  cumulativeTokens: number;
  speedup: number;
  runtimeUs: number;
  rank: number;
  change: string;
  code: string;
}

const referenceRuntimeUs = 184;

const demoRounds: DemoRound[] = [
  {
    tokenDelta: 1_286,
    cumulativeTokens: 1_286,
    speedup: 1.4,
    runtimeUs: 131,
    rank: 84,
    change: "Fused the eager reductions into one Triton program and coalesced the row loads.",
    code: `@triton.jit
def layer_norm_gelu(x, out, n_cols: tl.constexpr):
    row = tl.program_id(0)
    cols = tl.arange(0, 1024)
    values = tl.load(x + row * n_cols + cols)
    mean = tl.sum(values, axis=0) / n_cols
    centered = values - mean
    variance = tl.sum(centered * centered, axis=0) / n_cols
    normalized = centered * tl.rsqrt(variance + 1e-5)
    tl.store(out + row * n_cols + cols, gelu(normalized))`,
  },
  {
    tokenDelta: 884,
    cumulativeTokens: 2_170,
    speedup: 2.08,
    runtimeUs: 88.5,
    rank: 16,
    change: "Moved the reduction into warp-local partials and cut the second memory pass.",
    code: `@triton.jit
def layer_norm_gelu(x, out, n_cols: tl.constexpr):
    row = tl.program_id(0)
    cols = tl.arange(0, 1024)
    mask = cols < n_cols
    values = tl.load(x + row * n_cols + cols, mask=mask)
    mean = tl.sum(values, axis=0) * (1.0 / n_cols)
    centered = values - mean
    inv_std = tl.rsqrt(tl.sum(centered * centered, axis=0) / n_cols + 1e-5)
    y = centered * inv_std
    gelu = 0.5 * y * (1.0 + tl.libdevice.erf(y * 0.70710678))
    tl.store(out + row * n_cols + cols, gelu, mask=mask)`,
  },
  {
    tokenDelta: 733,
    cumulativeTokens: 2_903,
    speedup: 2.26,
    runtimeUs: 81.4,
    rank: 37,
    change:
      "Tried a larger block with approximate GELU. It was faster, but cost more tokens without leaving Gold.",
    code: `@triton.jit
def layer_norm_gelu(x, out, n_cols: tl.constexpr):
    row = tl.program_id(0)
    cols = tl.arange(0, 2048)
    mask = cols < n_cols
    values = tl.load(x + row * n_cols + cols, mask=mask, other=0.0)
    mean = tl.sum(values, axis=0) / n_cols
    centered = values - mean
    y = centered * tl.rsqrt(tl.sum(centered * centered, axis=0) / n_cols + 1e-5)
    cubic = 0.79788456 * (y + 0.044715 * y * y * y)
    tl.store(out + row * n_cols + cols, 0.5 * y * (1.0 + tl.libdevice.tanh(cubic)), mask=mask)`,
  },
];

const coachingSuggestions = [
  "Fuse LayerNorm and GELU in one Triton kernel. Start with a correct row-wise reduction, then run the first sample.",
  "The kernel is correct but still Silver. Remove the extra memory pass and try a warp-local reduction.",
  "Gold is locked at 2,170 tokens. Continue only if the speed gain is worth more tokens in the same band.",
];

const tierLabel: Record<BenchmarkTier, string> = {
  invalid: "Not eligible",
  bronze: "Bronze",
  silver: "Silver",
  gold: "Gold",
};

export function BenchmarkLabClient() {
  const [prompt, setPrompt] = useState("");
  const [lastPrompt, setLastPrompt] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [completedRounds, setCompletedRounds] = useState(0);
  const timers = useRef<Array<ReturnType<typeof setTimeout>>>([]);
  const promptRef = useRef<HTMLTextAreaElement>(null);
  const resetRef = useRef<HTMLButtonElement>(null);

  const evaluations = useMemo(() => demoRounds.slice(0, completedRounds), [completedRounds]);
  const latest = evaluations.at(-1);
  const best = useMemo(
    () =>
      [...evaluations].sort((left, right) =>
        compareBenchmarkScores(
          { correct: true, speedup: left.speedup, competitionTokens: left.cumulativeTokens },
          { correct: true, speedup: right.speedup, competitionTokens: right.cumulativeTokens },
        ),
      )[0],
    [evaluations],
  );
  const running = phase !== "idle";
  const tokens = latest?.cumulativeTokens ?? 0;
  const suggestion = coachingSuggestions[Math.min(completedRounds, coachingSuggestions.length - 1)]!;

  useEffect(
    () => () => {
      timers.current.forEach(clearTimeout);
    },
    [],
  );

  useEffect(() => {
    if (phase !== "idle" || completedRounds === 0) return;
    if (completedRounds >= demoRounds.length) resetRef.current?.focus();
    else promptRef.current?.focus();
  }, [completedRounds, phase]);

  function schedule(delay: number, callback: () => void) {
    const timer = setTimeout(callback, delay);
    timers.current.push(timer);
  }

  function runTurn(event: FormEvent) {
    event.preventDefault();
    const cleaned = prompt.trim();
    if (!cleaned || running || completedRounds >= demoRounds.length) return;

    const roundIndex = completedRounds;
    setLastPrompt(cleaned);
    setPrompt("");
    setPhase("thinking");
    schedule(450, () => setPhase("editing"));
    schedule(1_000, () => setPhase("checking"));
    schedule(1_550, () => setPhase("timing"));
    schedule(2_150, () => {
      setCompletedRounds(roundIndex + 1);
      setPhase("idle");
    });
  }

  function resetPreview() {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    setPrompt("");
    setLastPrompt("");
    setPhase("idle");
    setCompletedRounds(0);
  }

  const tier = best ? benchmarkTier(true, best.speedup) : "invalid";

  return (
    <section className="benchmark-demo-section" id="kernel-sprint-preview">
      <div className="shell">
        <div className="benchmark-preview-note">
          <span className="pill">Scripted preview</span>
          <p>
            No model, API, or GPU is used. Your prompt appears on screen, but every turn follows the same
            script.
          </p>
        </div>

        <div className="benchmark-arena">
          <header className="benchmark-arena-topbar">
            <div>
              <span className="eyebrow">Benchmark Lab · Kernel Sprint 01</span>
              <h2>Fused LayerNorm + GELU</h2>
              <p>See how you might guide Terra from a PyTorch operator to a correct, faster kernel.</p>
            </div>
            <div className="benchmark-score-strip" aria-label="Current benchmark score">
              <div>
                <small>Best band</small>
                <strong className={`benchmark-tier tier-${tier}`}>{tierLabel[tier]}</strong>
              </div>
              <div>
                <small>Speedup</small>
                <strong>{best ? `${best.speedup.toFixed(2)}×` : "—"}</strong>
              </div>
              <div>
                <small>Tokens spent</small>
                <strong>{formatTokens(tokens)} / 15k</strong>
              </div>
              <div>
                <small>Sample runs</small>
                <strong>{completedRounds} / 3</strong>
              </div>
            </div>
          </header>

          <div className="benchmark-rulebar">
            <span>
              <b>Must pass</b> · all 5 sample shapes
            </span>
            <span>
              <b>Bands</b> · Bronze: correct · Silver: ≥1× · Gold: ≥2×
            </span>
            <span>
              <b>Rank</b> · band first, then fewer tokens
            </span>
          </div>

          <form className="benchmark-prompt" onSubmit={runTurn}>
            <div>
              <small>Coach the next move</small>
              <textarea
                aria-label="Benchmark coaching prompt"
                disabled={running || completedRounds >= demoRounds.length}
                maxLength={900}
                onChange={(event) => setPrompt(event.target.value)}
                placeholder="What should the AI optimize or test next?"
                ref={promptRef}
                rows={3}
                value={prompt}
              />
              <button
                className="benchmark-suggestion"
                disabled={running || completedRounds >= demoRounds.length}
                onClick={() => setPrompt(suggestion)}
                type="button"
              >
                Try a sample prompt
              </button>
            </div>
            <div className="benchmark-prompt-actions">
              <span>{prompt.length}/900</span>
              <button
                className="button button-dark"
                disabled={!prompt.trim() || running || completedRounds >= demoRounds.length}
                type="submit"
              >
                {running
                  ? "Running the next step…"
                  : completedRounds >= demoRounds.length
                    ? "Preview complete"
                    : "Run sample turn"}
              </button>
              {completedRounds > 0 ? (
                <button className="button button-ghost" onClick={resetPreview} ref={resetRef} type="button">
                  Reset preview
                </button>
              ) : null}
            </div>
          </form>

          <div className="benchmark-arena-grid">
            <section className="benchmark-code-panel">
              <div className="panel-head">
                <h3>The AI’s code</h3>
                <small>Read only</small>
              </div>
              <div className="benchmark-task-brief">
                <small>Reference operation</small>
                <strong>FP16 · shape [4096, 1024] · LayerNorm → GELU</strong>
                <p>Illustrative PyTorch reference median: {referenceRuntimeUs.toFixed(1)} μs.</p>
              </div>
              <pre aria-label="Current AI-controlled candidate code" className="benchmark-code" tabIndex={0}>
                <code>
                  {latest?.code ??
                    `# candidate.py\n# The AI can replace this with Triton or CUDA.\n\ndef custom_kernel(x):\n    return torch.nn.functional.gelu(\n        torch.nn.functional.layer_norm(x, (1024,))\n    )`}
                </code>
              </pre>
              <div className="benchmark-change-note">
                <small>Latest version</small>
                <p>{latest?.change ?? "No candidate yet. Ask the AI to build one."}</p>
              </div>
            </section>

            <section className="benchmark-check-panel">
              <div className="panel-head">
                <h3>Sample checks</h3>
                <small>Scripted results</small>
              </div>
              <div className="benchmark-check-ladder" aria-live="polite">
                <CheckRow
                  label="Compiles"
                  state={
                    phase === "editing"
                      ? "running"
                      : completedRounds > 0 || phase === "checking" || phase === "timing"
                        ? "pass"
                        : "waiting"
                  }
                  value={completedRounds > 0 || phase === "checking" || phase === "timing" ? "PASS" : "—"}
                />
                <CheckRow
                  label="Hidden correctness"
                  state={
                    phase === "checking"
                      ? "running"
                      : completedRounds > 0 || phase === "timing"
                        ? "pass"
                        : "waiting"
                  }
                  value={completedRounds > 0 || phase === "timing" ? "5 / 5" : "—"}
                />
                <CheckRow
                  label="Median runtime"
                  state={phase === "timing" ? "running" : completedRounds > 0 ? "pass" : "waiting"}
                  value={latest ? `${latest.runtimeUs.toFixed(1)} μs` : "—"}
                />
                <CheckRow
                  label="Illustrative speedup"
                  state={phase === "timing" ? "running" : completedRounds > 0 ? "pass" : "waiting"}
                  value={latest ? `${latest.speedup.toFixed(2)}×` : "—"}
                />
              </div>

              <div className="benchmark-activity">
                <span className="eyebrow">What the AI is doing</span>
                {lastPrompt ? (
                  <article>
                    <small>Your prompt · Turn {Math.min(completedRounds + (running ? 1 : 0), 3)}</small>
                    <p>{lastPrompt}</p>
                  </article>
                ) : (
                  <article>
                    <small>Workbench ready</small>
                    <p>
                      In live play, the AI can inspect the reference, edit candidate.py, run tests, and ask
                      for an evaluation.
                    </p>
                  </article>
                )}
                {phase === "thinking" ? (
                  <ActivityRow label="Thinking…" detail="Choosing the next optimization." />
                ) : null}
                {phase === "editing" ? (
                  <ActivityRow label="Code changed" detail="candidate.py updated." />
                ) : null}
                {phase === "checking" ? (
                  <ActivityRow label="Simulated correctness" detail="Checking five sample shapes." />
                ) : null}
                {phase === "timing" ? (
                  <ActivityRow
                    label="Simulated timing"
                    detail="Comparing the sample candidate with the reference."
                  />
                ) : null}
                {!running && latest ? (
                  <article
                    aria-atomic="true"
                    aria-live="polite"
                    className="official-result-card"
                    role="status"
                  >
                    <small>Sample evaluation {completedRounds}</small>
                    <strong>
                      {tierLabel[benchmarkTier(true, latest.speedup)]} · {latest.speedup.toFixed(2)}× faster
                    </strong>
                    <p>
                      +{formatTokens(latest.tokenDelta)} tokens · sample rank #{latest.rank}. The best valid
                      result stays, even if a later run is worse.
                    </p>
                  </article>
                ) : null}
              </div>
            </section>
          </div>

          {best ? (
            <footer className="benchmark-best-footer">
              <span aria-hidden="true">★</span>
              <div>
                <small>Best sample result</small>
                <strong>
                  {tierLabel[benchmarkTier(true, best.speedup)]} · {best.speedup.toFixed(2)}× · reached in{" "}
                  {formatTokens(best.cumulativeTokens)} tokens
                </strong>
              </div>
              <span>Sample rank #{best.rank}</span>
            </footer>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function CheckRow({
  label,
  state,
  value,
}: {
  label: string;
  state: "waiting" | "running" | "pass";
  value: string;
}) {
  return (
    <div className={`benchmark-check-row is-${state}`}>
      <span aria-hidden="true">{state === "pass" ? "✓" : state === "running" ? "…" : "○"}</span>
      <strong>{label}</strong>
      <small>{state === "running" ? "RUNNING" : value}</small>
    </div>
  );
}

function ActivityRow({ label, detail }: { label: string; detail: string }) {
  return (
    <article>
      <small>{label}</small>
      <p>{detail}</p>
    </article>
  );
}
