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
            <h3>Run and score my attempts</h3>
            <p>
              Required to operate the game: model calls, visible activity, verifier output, usage, abuse
              prevention, and scorekeeping. Raw operational traces are retained for no more than 30 days.
            </p>
          </div>
          <label className="toggle">
            <input aria-label="Operational processing required" checked disabled type="checkbox" readOnly />
            <span />
          </label>
        </div>
        <div className="consent-row">
          <div>
            <h3>Contribute sanitized runs to AI research and training</h3>
            <p>
              Optional. Prompt Gym may deidentify and license eligible prompts, visible model outputs, tool
              activity, and objective outcomes to AI labs for model training and evaluation. This does not
              change your subsidy.
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
            <h3>Publish my handle and replays after a season</h3>
            <p>
              Optional. Successful run replays may appear publicly only after the seven-day season closes and
              the underlying instance is retired.
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
            Choices were not saved. Check your connection and try again.
          </span>
        ) : null}
      </div>

      <div className="danger-zone">
        <h3>Export or delete your data</h3>
        <p>
          You can request a portable export or delete your account. Withdrawal removes unexported traces from
          future releases and issues tombstones for prior buyer deliveries; it cannot guarantee removal from
          model weights already trained.
        </p>
        <div className="hero-actions">
          <button
            className="button button-small"
            disabled
            title="Portable export delivery is an alpha launch gate"
            type="button"
          >
            Export opens in alpha
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
