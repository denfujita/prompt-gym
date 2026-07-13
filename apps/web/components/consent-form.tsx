"use client";

import { useEffect, useState } from "react";

import { apiMode, deleteAccountData, getConsent, saveConsent } from "@/lib/api";
import type { ConsentPreferences } from "@/lib/types";

const initial: ConsentPreferences = {
  operational: true,
  research: false,
  publicReplay: false,
  version: "2026-07-12.v1",
};

export function ConsentForm() {
  const [preferences, setPreferences] = useState(initial);
  const [status, setStatus] = useState<
    "loading" | "idle" | "saving" | "saved" | "deleting" | "deleted" | "error"
  >(apiMode === "live" ? "loading" : "idle");

  useEffect(() => {
    if (apiMode !== "live") return;
    let active = true;
    void getConsent()
      .then((saved) => {
        if (!active) return;
        if (saved) setPreferences(saved);
        setStatus("idle");
      })
      .catch(() => {
        if (active) setStatus("error");
      });
    return () => {
      active = false;
    };
  }, []);

  async function handleSave() {
    setStatus("saving");
    try {
      const saved = await saveConsent(preferences);
      setPreferences(saved);
      setStatus("saved");
      setTimeout(() => setStatus("idle"), 2500);
    } catch {
      setStatus("error");
    }
  }

  async function handleDelete() {
    if (!window.confirm("Delete your Prompt Gym account data? This cannot be undone.")) return;
    setStatus("deleting");
    try {
      await deleteAccountData();
      setPreferences(initial);
      setStatus("deleted");
    } catch {
      setStatus("error");
    }
  }

  return (
    <>
      <div className="consent-list">
        <div className="consent-row">
          <div>
            <h3>Use my data to run the game</h3>
            <p>
              Required. We use model calls, visible activity, verifier results, token usage, and abuse signals
              to run and score your attempts. Raw traces are kept for no more than 30 days.
            </p>
          </div>
          <label className="toggle">
            <input aria-label="Operational processing required" checked disabled type="checkbox" readOnly />
            <span />
          </label>
        </div>
        <div className="consent-row">
          <div>
            <h3>Share sanitized runs for AI research and training</h3>
            <p>
              Optional. If you opt in, Prompt Gym may remove identifying details and license eligible prompts,
              visible AI outputs, tool activity, and objective results to AI labs for training and evaluation.
              Your choice doesn’t affect the API costs we cover.
            </p>
          </div>
          <label className="toggle">
            <input
              aria-label="Contribute runs to commercial research and training"
              checked={preferences.research}
              onChange={(event) => {
                setPreferences((value) => ({ ...value, research: event.target.checked }));
                setStatus("idle");
              }}
              type="checkbox"
            />
            <span />
          </label>
        </div>
        <div className="consent-row">
          <div>
            <h3>Share my handle and replays after the season</h3>
            <p>
              Optional. A successful replay can become public only after the seven-day season ends and its
              task instance is retired.
            </p>
          </div>
          <label className="toggle">
            <input
              aria-label="Publish handle and replays after season close"
              checked={preferences.publicReplay}
              onChange={(event) => {
                setPreferences((value) => ({ ...value, publicReplay: event.target.checked }));
                setStatus("idle");
              }}
              type="checkbox"
            />
            <span />
          </label>
        </div>
      </div>

      <div className="consent-actions">
        <button
          className="button button-dark"
          disabled={status === "loading" || status === "saving" || status === "deleting"}
          onClick={handleSave}
          type="button"
        >
          {status === "loading" ? "Loading…" : status === "saving" ? "Saving…" : "Save choices"}
        </button>
        {status === "saved" ? (
          <span className="save-status" role="status">
            Choices saved
          </span>
        ) : null}
        {status === "deleted" ? (
          <span className="save-status" role="status">
            Account data deleted
          </span>
        ) : null}
        {status === "error" ? (
          <span className="form-error" role="alert">
            We couldn’t save your choices. Check your connection and try again.
          </span>
        ) : null}
      </div>

      <div className="danger-zone">
        <h3>Download or delete your data</h3>
        <p>
          You can request a copy of your data or delete your account. Withdrawing removes unexported traces
          from future releases and sends deletion notices for earlier buyer deliveries. We can’t guarantee
          removal from models that were already trained.
        </p>
        <div className="hero-actions">
          <button
            className="button button-small"
            disabled
            title="Data export will open during alpha"
            type="button"
          >
            Export coming in alpha
          </button>
          <button
            className="button button-small button-ghost"
            disabled={status === "deleting"}
            onClick={handleDelete}
            type="button"
          >
            {status === "deleting" ? "Deleting…" : "Delete account data"}
          </button>
        </div>
      </div>
    </>
  );
}
