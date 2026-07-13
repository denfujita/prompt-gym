"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import {
  DEMO_AUTH_EVENT,
  endDemoSession,
  hasDemoEligibility,
  readDemoSession,
  startDemoSession,
  type DemoSession,
} from "@/lib/auth-client";

export function DemoSignIn({ returnTo }: { returnTo: string }) {
  const router = useRouter();
  const [session, setSession] = useState<DemoSession | null>(null);

  useEffect(() => {
    const refresh = () => setSession(readDemoSession());
    refresh();
    window.addEventListener(DEMO_AUTH_EVENT, refresh);
    return () => window.removeEventListener(DEMO_AUTH_EVENT, refresh);
  }, []);

  function signIn() {
    startDemoSession();
    router.push(`/eligibility?returnTo=${encodeURIComponent(returnTo)}`);
  }

  function continueSession() {
    router.push(hasDemoEligibility() ? returnTo : `/eligibility?returnTo=${encodeURIComponent(returnTo)}`);
  }

  return (
    <div className="sign-in-page">
      <section className="surface sign-in-card">
        <span className="brand-mark" aria-hidden="true">
          PG
        </span>
        <span className="eyebrow">Local demo access</span>
        <h1>{session ? "You’re signed in" : "Enter the gym"}</h1>
        <p>
          {session
            ? `Welcome back, ${session.handle}.`
            : "Use the demo account to test sign-in, eligibility, and sign-out without calling an outside service."}
        </p>
        <div className="auth-buttons">
          {session ? (
            <>
              <button className="button button-dark button-wide" onClick={continueSession} type="button">
                Continue as {session.handle} →
              </button>
              <button
                className="button button-ghost button-wide"
                onClick={() => endDemoSession()}
                type="button"
              >
                Sign out
              </button>
            </>
          ) : (
            <button className="button button-dark button-wide" onClick={signIn} type="button">
              Continue with demo account →
            </button>
          )}
        </div>
        <p className="auth-disclaimer">
          Google and Apple appear here only when Clerk is configured. This local session stays in your browser
          and never leaves this device.
        </p>
      </section>
    </div>
  );
}
