"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PromptGymApiError, saveEligibility } from "@/lib/api";

declare global {
  interface Window {
    promptGymTurnstile?: (token: string) => void;
    turnstile?: unknown;
  }
}

export function EligibilityForm({ returnTo }: { returnTo: string }) {
  const router = useRouter();
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  const [age18Plus, setAge18Plus] = useState(false);
  const [usResident, setUsResident] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState(siteKey ? "" : "local-demo");
  const [status, setStatus] = useState<"idle" | "saving" | "error" | "auth-required">("idle");
  const [captchaStatus, setCaptchaStatus] = useState<"loading" | "ready" | "error">(
    siteKey ? "loading" : "ready",
  );

  useEffect(() => {
    if (!siteKey) return;
    window.promptGymTurnstile = (token) => {
      setTurnstileToken(token);
      setCaptchaStatus("ready");
    };
    const timeout = window.setTimeout(() => {
      if (!window.turnstile) setCaptchaStatus("error");
    }, 8_000);
    if (!document.querySelector('script[data-prompt-gym-turnstile="true"]')) {
      const script = document.createElement("script");
      script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js";
      script.async = true;
      script.defer = true;
      script.dataset.promptGymTurnstile = "true";
      script.onerror = () => setCaptchaStatus("error");
      document.head.appendChild(script);
    }
    return () => {
      window.clearTimeout(timeout);
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
      router.replace(returnTo);
      router.refresh();
    } catch (error) {
      setStatus(error instanceof PromptGymApiError && error.status === 401 ? "auth-required" : "error");
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
          <strong>I’m currently a United States resident.</strong>
          <small>This subsidized alpha is US-only.</small>
        </span>
      </label>
      {siteKey ? (
        <>
          <div className="cf-turnstile" data-callback="promptGymTurnstile" data-sitekey={siteKey} />
          {captchaStatus === "loading" ? <p className="demo-captcha">Loading the anti-bot check…</p> : null}
          {captchaStatus === "error" ? (
            <p className="form-error" role="alert">
              The anti-bot check didn’t load. Check your connection, then reload this page.
            </p>
          ) : null}
        </>
      ) : (
        <p className="demo-captcha">The anti-bot check is off in this local demo.</p>
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
          We couldn’t save your answers. Sign in again and try once more.
        </p>
      ) : null}
      {status === "auth-required" ? (
        <p className="form-error" role="alert">
          Your sign-in expired.{" "}
          <Link href={`/sign-in?returnTo=${encodeURIComponent(returnTo)}`}>Sign in and come back →</Link>
        </p>
      ) : null}
      <p className="eligibility-note">
        Research sharing and public replays stay off. You can choose them separately after you enter.
      </p>
    </form>
  );
}
