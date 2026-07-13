"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";

import { apiMode, cancelAttempt, createAttempt, submitTurn, subscribeToAttempt, unlockHint } from "@/lib/api";
import { deriveArenaRunState, type ArenaRunState } from "@/lib/arena-state";
import { demoTurns, initialArenaEvents } from "@/lib/demo-data";
import { formatTokens } from "@/lib/format";
import { latestTaskState, taskProgress } from "@/lib/task-state";
import type { Attempt, Challenge, RunEvent } from "@/lib/types";

import { TaskView } from "./task-views";
import { TokenMeter } from "./token-meter";

const promptSuggestions: Record<Challenge["slug"], string[]> = {
  "signal-vault": [
    "Probe one control at a time. Track symbol, gate, and tone changes separately.",
    "Treat the tone pattern as an ordering rule. Test the mapping, not random paths.",
    "Reuse the chamber mapping under rotation. Finish without another exploratory action.",
  ],
  "clone-the-gremlin": [
    "Partition your oracle probes across input classes before writing the clone.",
    "Focus the remaining probes on delimiter escaping, Unicode, and empty-run boundaries.",
    "Use the observed equivalence classes to finish and submit; do not overfit examples.",
  ],
  "rigged-race": [
    "Resolve aliases first, then correct sensor drift before trusting the leaderboard.",
    "Cross-check the impossible acceleration against pit logs and estimate causal advantage.",
    "Submit canonical IDs, corrected advantage, and only evidence that survives the correction.",
  ],
};

export function ArenaClient({ challenge }: { challenge: Challenge }) {
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const [events, setEvents] = useState<RunEvent[]>(() =>
    apiMode === "demo" ? initialArenaEvents[challenge.slug] : [],
  );
  const [prompt, setPrompt] = useState("");
  const [turn, setTurn] = useState(0);
  const [tokens, setTokens] = useState(0);
  const [thinking, setThinking] = useState(false);
  const [running, setRunning] = useState(false);
  const [solved, setSolved] = useState(false);
  const [assisted, setAssisted] = useState(false);
  const [activeTab, setActiveTab] = useState<"task" | "model">("task");
  const [briefExpanded, setBriefExpanded] = useState(false);
  const [connectionNote, setConnectionNote] = useState("Preparing run…");
  const timelineRef = useRef<HTMLDivElement>(null);
  const timersRef = useRef<Array<ReturnType<typeof setTimeout>>>([]);
  const authoritativeEventsRef = useRef<RunEvent[]>([]);

  function applyRunState(state: ArenaRunState) {
    setTurn(state.turnsUsed);
    setTokens(state.competitionTokens);
    setAssisted(state.assisted);
    setSolved(state.solved);
    setRunning(state.running);
    setThinking(state.thinking);
  }

  const displayedEvents = useMemo(() => events.slice().sort((a, b) => a.sequence - b.sequence), [events]);
  const publicTaskState = useMemo(() => latestTaskState(displayedEvents), [displayedEvents]);
  const progress = solved ? 3 : apiMode === "demo" ? turn : taskProgress(challenge.slug, publicTaskState);
  const suggestion = promptSuggestions[challenge.slug][Math.min(turn, 2)]!;

  useEffect(() => {
    let active = true;
    let unsubscribe: () => void = () => {};

    void createAttempt(challenge.slug, apiMode === "demo" ? "practice" : "ranked")
      .then(({ attempt: created, events: bootstrapEvents }) => {
        if (!active) return;
        setAttempt(created);
        if (created.seedCommitment)
          localStorage.setItem(`prompt-gym:seed:${created.challengeSlug}`, created.seedCommitment);
        if (bootstrapEvents.length) setEvents(bootstrapEvents);
        authoritativeEventsRef.current = bootstrapEvents;
        applyRunState(deriveArenaRunState(created, bootstrapEvents));
        setConnectionNote(
          created.id.startsWith("demo-") ? "Demo arena · no API spend" : "Live arena · connected",
        );
        unsubscribe = subscribeToAttempt(
          created.id,
          (event) => {
            if (!authoritativeEventsRef.current.some((item) => item.id === event.id))
              authoritativeEventsRef.current = [...authoritativeEventsRef.current, event];
            setEvents((current) =>
              current.some((item) => item.id === event.id) ? current : [...current, event],
            );
            applyRunState(deriveArenaRunState(created, authoritativeEventsRef.current));
          },
          () => setConnectionNote("Reconnecting to live events…"),
          () => setConnectionNote("Live arena · connected"),
        );
      })
      .catch(() => {
        if (!active) return;
        setConnectionNote("Sign in and confirm 18+ US eligibility to start live play");
        setEvents((current) => [
          ...current,
          {
            id: `auth-${Date.now()}`,
            sequence: current.length + 1,
            actor: "system",
            type: "model.status",
            title: "Live run not started",
            body: "Visit Sign in, complete the one-time eligibility check, then return to the arena.",
            createdAt: new Date().toISOString(),
          },
        ]);
      });

    return () => {
      active = false;
      unsubscribe();
      timersRef.current.forEach(clearTimeout);
    };
  }, [challenge.slug]);

  useEffect(() => {
    const target = timelineRef.current;
    if (target) target.scrollTop = target.scrollHeight;
  }, [events, thinking]);

  function appendEvent(event: RunEvent) {
    setEvents((current) => [...current, event]);
    if (event.tokenDelta) setTokens((current) => current + event.tokenDelta!);
  }

  function playDemoTurn(turnIndex: number) {
    const scripted = demoTurns[challenge.slug][Math.min(turnIndex, 2)]!;
    scripted.forEach((event, index) => {
      const timer = setTimeout(
        () => {
          appendEvent({
            ...event,
            id: `${challenge.slug}-${turnIndex}-${index}-${Date.now()}`,
            sequence: events.length + turnIndex * 10 + index + 2,
            createdAt: new Date().toISOString(),
          });
          if (index === scripted.length - 1) {
            setThinking(false);
            setRunning(false);
            if (turnIndex >= 2) setSolved(true);
          }
        },
        650 + index * 780,
      );
      timersRef.current.push(timer);
    });
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const cleaned = prompt.trim();
    if (!cleaned || !attempt || running || solved || turn >= 6) return;

    const nextTurn = turn + 1;
    appendEvent({
      id: `player-${nextTurn}-${Date.now()}`,
      sequence: events.length + 1,
      type: "player.prompt",
      actor: "player",
      title: `Your coaching prompt · Turn ${nextTurn}`,
      body: cleaned,
      createdAt: new Date().toISOString(),
    });
    setPrompt("");
    setTurn(nextTurn);
    setThinking(true);
    setRunning(true);
    setActiveTab("model");

    try {
      await submitTurn(attempt.id, cleaned);
      if (attempt.id.startsWith("demo-")) playDemoTurn(nextTurn - 1);
    } catch {
      setThinking(false);
      setRunning(false);
      appendEvent({
        id: `error-${Date.now()}`,
        sequence: events.length + 2,
        type: "model.status",
        actor: "system",
        title: "Turn did not start",
        body: "Your prompt was preserved. Try sending it again.",
        createdAt: new Date().toISOString(),
      });
      setPrompt(cleaned);
      setTurn(nextTurn - 1);
    }
  }

  async function handleStop() {
    if (!attempt || !running) return;
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
    setThinking(false);
    setRunning(false);
    await cancelAttempt(attempt.id);
    appendEvent({
      id: `interrupted-${Date.now()}`,
      sequence: events.length + 2,
      type: "attempt.interrupted",
      actor: "system",
      title: "Turn stopped",
      body: "Any usage reported before cancellation still counts toward your score.",
      createdAt: new Date().toISOString(),
    });
  }

  async function useHint() {
    if (!attempt) return;
    try {
      const serverHint = await unlockHint(attempt.id);
      setAssisted(true);
      setPrompt(serverHint ?? suggestion);
    } catch {
      setConnectionNote("Hints unlock after two completed turns");
    }
  }

  return (
    <div className="arena-page">
      <div className="arena-topbar">
        <div className="shell arena-topbar-inner">
          <div className="arena-title">
            <span className="arena-title-symbol" aria-hidden="true">
              {challenge.symbol}
            </span>
            <div>
              <h1>{challenge.name}</h1>
              <p>{connectionNote}</p>
            </div>
          </div>
          <TokenMeter tokens={tokens} />
          <div className="arena-counter">
            <small>Coaching turns</small>
            <strong>{turn} / 6</strong>
          </div>
        </div>
      </div>

      <div className="mobile-arena-tabs" role="tablist" aria-label="Arena views">
        <button
          className={activeTab === "task" ? "is-active" : ""}
          onClick={() => setActiveTab("task")}
          role="tab"
          aria-selected={activeTab === "task"}
        >
          Task
        </button>
        <button
          className={activeTab === "model" ? "is-active" : ""}
          onClick={() => setActiveTab("model")}
          role="tab"
          aria-selected={activeTab === "model"}
        >
          Model <span aria-hidden="true">· {events.length}</span>
        </button>
      </div>

      <div className="arena-grid">
        <section
          className={`arena-panel ${activeTab !== "task" ? "is-mobile-hidden" : ""}`}
          aria-label="Task view"
        >
          <div className="panel-head">
            <h2>Task view</h2>
            <small>Human controls disabled</small>
          </div>
          <div className="task-panel-body">
            <div className="challenge-brief">
              <p>
                <strong>Objective:</strong> {challenge.objective}{" "}
                {briefExpanded
                  ? `You have ${challenge.timeLimitMinutes} minutes, ${challenge.actionLimit} task actions, and six coaching prompts. The complete brief is already included in the model context.`
                  : ""}
              </p>
              <button type="button" onClick={() => setBriefExpanded((value) => !value)}>
                {briefExpanded ? "Show less" : "Full brief"}
              </button>
            </div>
            <TaskView
              slug={challenge.slug}
              progress={progress}
              taskState={publicTaskState}
              demo={apiMode === "demo"}
            />
          </div>
        </section>

        <section
          className={`arena-panel timeline-panel ${activeTab !== "model" ? "is-mobile-hidden" : ""}`}
          aria-label="Model activity"
        >
          <div className="panel-head">
            <h2>Model activity</h2>
            <small>Visible messages & actions only</small>
          </div>
          <div className="timeline" ref={timelineRef} aria-live="polite">
            {displayedEvents.map((event) => (
              <article className={`timeline-event event-${event.actor}`} key={event.id}>
                <div className="event-meta">
                  <strong>{event.title}</strong>
                  {event.tokenDelta ? (
                    <span className="event-token">+{formatTokens(event.tokenDelta)}</span>
                  ) : null}
                </div>
                <p>{event.body}</p>
                {event.detail ? (
                  <details>
                    <summary>Technical detail</summary>
                    <pre>{event.detail}</pre>
                  </details>
                ) : null}
              </article>
            ))}
            {thinking ? (
              <div className="thinking-row">
                <span className="thinking-dots" aria-hidden="true">
                  <span />
                  <span />
                  <span />
                </span>
                Thinking… private reasoning is never shown
              </div>
            ) : null}
          </div>
        </section>
      </div>

      <div className="prompt-dock">
        <form className="prompt-form" onSubmit={handleSubmit}>
          <div className="prompt-input-wrap">
            <textarea
              aria-label="Coaching prompt"
              className="prompt-input"
              disabled={!attempt || running || solved}
              maxLength={900}
              onChange={(event) => setPrompt(event.target.value)}
              onKeyDown={(event) => {
                if ((event.metaKey || event.ctrlKey) && event.key === "Enter")
                  event.currentTarget.form?.requestSubmit();
              }}
              placeholder={solved ? "Exact solve verified." : "Coach the model’s next move…"}
              rows={2}
              value={prompt}
            />
            <span className="prompt-count">{prompt.length}/900</span>
          </div>
          <div className="prompt-actions">
            {running ? (
              <button className="button button-ghost" onClick={handleStop} type="button">
                Stop turn
              </button>
            ) : null}
            {turn >= 2 && !solved ? (
              <button className="button button-ghost" onClick={useHint} type="button">
                {assisted ? "Hint loaded" : "Use hint"}
              </button>
            ) : null}
            {solved ? (
              <Link
                className="button button-volt"
                href={`/results/${attempt?.id ?? `demo-${challenge.slug}`}`}
              >
                See result →
              </Link>
            ) : (
              <button
                className="button button-dark"
                disabled={!attempt || !prompt.trim() || running}
                type="submit"
              >
                Send prompt <span aria-hidden="true">⌘↵</span>
              </button>
            )}
          </div>
        </form>
        <div className="prompt-footnote">
          <span>You can prompt only. Task controls belong to the model.</span>
          <span>
            {!attempt
              ? "Preparing run…"
              : attempt.mode === "practice"
                ? "Practice · unranked"
                : assisted
                  ? "Assisted leaderboard"
                  : "Ranked · unassisted"}
          </span>
        </div>
      </div>
    </div>
  );
}
