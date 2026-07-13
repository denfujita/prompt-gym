"use client";

import Link from "next/link";
import { useState } from "react";

const steps = [
  {
    title: "Notice, then coach",
    copy: "The AI already has the brief. Don’t repeat it—give it a strategy it hasn’t tried.",
    prompt: "Probe one control and record every state change before acting again.",
    response: "I’ll isolate the diamond control first. The gate opened and a low-high-low tone played.",
  },
  {
    title: "Use the evidence",
    copy: "Treat the activity feed like a shared notebook. Call out the useful clue, then make the next move clear.",
    prompt: "Treat low-high-low as an order. Apply it to the three gate controls.",
    response: "Applying the observed tone order cleared Chamber 1. The next chamber has rotated symbols.",
  },
  {
    title: "Stop extra work",
    copy: "Good coaching also means stopping needless work. Sometimes the best prompt is simply, “Don’t probe again.”",
    prompt: "Reuse the mapping under rotation. Do not spend another probe.",
    response: "The inverse mapping cleared the remaining chambers. All checks: PASS.",
  },
];

export function TutorialClient() {
  const [step, setStep] = useState(0);
  const [hasRun, setHasRun] = useState(false);
  const finished = step >= steps.length;
  const current = steps[Math.min(step, steps.length - 1)]!;

  function runStep() {
    if (hasRun) {
      if (step === steps.length - 1) setStep(steps.length);
      else setStep((value) => value + 1);
      setHasRun(false);
      return;
    }
    setHasRun(true);
  }

  if (finished) {
    return (
      <div className="tutorial-page">
        <div className="narrow-shell">
          <section className="result-hero">
            <span className="result-kicker">✓ Tutorial complete</span>
            <h1>You coached the solve.</h1>
            <p>You set a strategy, used fresh evidence, and stopped wasted work. That’s the game.</p>
            <div className="result-stats">
              <div className="result-stat">
                <small>Coaching turns</small>
                <strong>3</strong>
              </div>
              <div className="result-stat">
                <small>Demo tokens</small>
                <strong>1,482</strong>
              </div>
              <div className="result-stat">
                <small>API cost</small>
                <strong>$0</strong>
              </div>
              <div className="result-stat">
                <small>Verifier</small>
                <strong>PASS</strong>
              </div>
            </div>
            <div className="hero-actions">
              <Link className="button button-dark" href="/play">
                Enter today’s gym →
              </Link>
              <button
                className="button"
                onClick={() => {
                  setStep(0);
                  setHasRun(false);
                }}
                type="button"
              >
                Replay tutorial
              </button>
            </div>
          </section>
        </div>
      </div>
    );
  }

  return (
    <div className="tutorial-page">
      <div className="shell">
        <header className="tutorial-header">
          <div>
            <span className="eyebrow">Free to try. No sign-in or API cost.</span>
            <h1>Learn by playing one quick round.</h1>
          </div>
          <div className="tutorial-progress" aria-label={`Tutorial step ${step + 1} of 3`}>
            <div className="tutorial-progress-track" aria-hidden="true">
              {[0, 1, 2, 3].map((index) => (
                <span className={index <= step ? "is-done" : ""} key={index} />
              ))}
            </div>
            <small>Step {step + 1} of 3</small>
          </div>
        </header>

        <div className="tutorial-stage">
          <section className="surface tutorial-sim">
            <span className="eyebrow">Scripted Signal Vault</span>
            <h2>Chamber {Math.min(step + 1, 3)}</h2>
            <p>You can’t press the controls. The AI has to act.</p>
            <div className="mini-signal-stage">
              <div className={`mini-signal-door ${hasRun ? "is-open" : ""}`}>
                {hasRun ? "✓" : step === 0 ? "◇" : step === 1 ? "○" : "△"}
              </div>
            </div>
          </section>

          <section className="surface tutorial-coach">
            <span className="eyebrow">Coach’s tip</span>
            <h2>{current.title}</h2>
            <p>{current.copy}</p>
            <div className="tutorial-hint">
              <strong>Try this:</strong> focus on the next decision, not the final answer.
            </div>

            <div className="suggested-prompts">
              <button className="prompt-chip is-selected" type="button">
                {current.prompt}
              </button>
              <button className="prompt-chip" disabled type="button">
                Repeat the brief <span aria-hidden="true">· burns tokens</span>
              </button>
            </div>

            <div className="tutorial-response" aria-live="polite">
              <strong>{hasRun ? "Model action" : "Ready to send"}</strong>
              {hasRun ? current.response : "This is a scripted demo. Send the prompt to see what happens."}
            </div>
            <button
              className={hasRun ? "button button-volt button-wide" : "button button-dark button-wide"}
              onClick={runStep}
              type="button"
            >
              {hasRun ? (step === 2 ? "See my result →" : "Next step →") : "Send this prompt"}
            </button>
          </section>
        </div>
      </div>
    </div>
  );
}
