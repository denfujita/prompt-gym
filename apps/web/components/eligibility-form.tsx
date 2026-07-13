"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { saveEligibility } from "@/lib/api";

declare global {
  interface Window {
    promptGymTurnstile?: (token: string) => void;
  }
}

export function EligibilityForm() {
  const router = useRouter();
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  const [age18Plus, setAge18Plus] = useState(false);
  const [usResident, setUsResident] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState(siteKey ? "" : "local-demo");
  const [status, setStatus] = useState<"idle" | "saving" | "error">("idle");

  useEffect(() => {
    if (!siteKey) return;
    window.promptGymTurnstile = (token) => setTurnstileToken(token);
    if (!document.querySelector('script[data-prompt-gym-turnstile="true"]')) {
      const script = document.createElement("script");
      script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js";
      script.async = true;
      script.defer = true;
      script.dataset.promptGymTurnstile = "true";
      document.head.appendChild(script);
    }
    return () => {
      delete window.promptGymTurnstile;
    };
  }, [siteKey]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!age18Plus || !usResident || !turnstileToken) return;
    setStatus("saving");
    try {
      await saveEligibility({
        age18Plus: true,
        usResident: true,
        version: "2026-07-12.v1",
        ...(siteKey ? { turnstileToken } : {}),
      });
      router.replace("/play");
      router.refresh();
    } catch {
      setStatus("error");
    }
  }

  return (
    <form className="eligibility-form" onSubmit={submit}>
      <label className="attestation-row">
        <input checked={age18Plus} onChange={(event) => setAge18Plus(event.target.checked)} type="checkbox" />
        <span>
          <strong>I am 18 or older.</strong>
          <small>Prompt Gym is not available to minors during the alpha.</small>
        </span>
      </label>
      <label className="attestation-row">
        <input
          checked={usResident}
          onChange={(event) => setUsResident(event.target.checked)}
          type="checkbox"
        />
        <span>
          <strong>I am currently a United States resident.</strong>
          <small>The first subsidized alpha is US-only.</small>
        </span>
      </label>
      {siteKey ? (
        <div className="cf-turnstile" data-callback="promptGymTurnstile" data-sitekey={siteKey} />
      ) : (
        <p className="demo-captcha">Anti-bot check bypassed in local demo mode.</p>
      )}
      <button
        className="button button-dark button-wide"
        disabled={!age18Plus || !usResident || !turnstileToken || status === "saving"}
        type="submit"
      >
        {status === "saving" ? "Saving…" : "Enter the gym →"}
      </button>
      {status === "error" ? (
        <p className="form-error" role="alert">
          We could not save the eligibility check. Sign in again and retry.
        </p>
      ) : null}
      <p className="eligibility-note">
        Optional research and public replay permissions remain off. You choose those separately after
        entering.
      </p>
    </form>
  );
}
