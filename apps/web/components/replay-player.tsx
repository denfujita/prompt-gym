"use client";

import { useEffect, useState } from "react";

import { apiMode } from "@/lib/api";
import { latestTaskState, taskProgress } from "@/lib/task-state";
import type { Challenge, Replay } from "@/lib/types";

import { TaskView } from "./task-views";

export function ReplayPlayer({ challenge, replay }: { challenge: Challenge; replay: Replay }) {
  const [cursor, setCursor] = useState(0);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    if (!playing) return;
    const timer = setInterval(() => {
      setCursor((current) => {
        if (current >= replay.events.length - 1) {
          setPlaying(false);
          return current;
        }
        return current + 1;
      });
    }, 900);
    return () => clearInterval(timer);
  }, [playing, replay.events.length]);

  const visibleEvents = replay.events.slice(0, cursor + 1);
  const publicTaskState = latestTaskState(visibleEvents);
  const progress =
    apiMode === "demo"
      ? Math.min(3, Math.floor(((cursor + 1) / replay.events.length) * 4))
      : taskProgress(challenge.slug, publicTaskState);
  const percent = replay.events.length > 1 ? (cursor / (replay.events.length - 1)) * 100 : 100;

  return (
    <div className="replay-layout">
      <section className="surface replay-stage">
        <div className="panel-head">
          <h2>{challenge.name}</h2>
          <small>Read-only replay</small>
        </div>
        <div className="replay-stage-body">
          <TaskView
            slug={challenge.slug}
            progress={progress}
            taskState={publicTaskState}
            demo={apiMode === "demo"}
          />
        </div>
        <div className="replay-controls">
          <button
            className="button button-small button-dark"
            onClick={() => setPlaying((value) => !value)}
            type="button"
          >
            {playing ? "Pause" : cursor === replay.events.length - 1 ? "Replay" : "Play"}
          </button>
          <div className="replay-progress" aria-label={`Replay ${Math.round(percent)} percent complete`}>
            <span style={{ width: `${percent}%` }} />
          </div>
          <span className="pill">
            {cursor + 1} / {replay.events.length}
          </span>
        </div>
      </section>

      <aside className="surface replay-events">
        <div className="panel-head">
          <h2>Run trace</h2>
          <small>Public after season close</small>
        </div>
        <div className="replay-events-list">
          {replay.events.map((event, index) => (
            <article
              className={`replay-event ${index <= cursor ? "is-visible" : ""} ${index === cursor ? "is-current" : ""}`}
              key={event.id}
            >
              <small>
                {event.actor} · {event.tokenDelta ? `+${event.tokenDelta} tokens` : "no model call"}
              </small>
              <strong>{event.title}</strong>
            </article>
          ))}
        </div>
      </aside>
    </div>
  );
}
