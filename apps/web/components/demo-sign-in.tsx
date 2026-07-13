"use client";

import { useRouter } from "next/navigation";

export function DemoSignIn() {
  const router = useRouter();

  function signIn() {
    window.localStorage.setItem("prompt-gym-demo-user", "quietcoach");
    router.push("/play");
  }

  return (
    <div className="sign-in-page">
      <section className="surface sign-in-card">
        <span className="brand-mark" aria-hidden="true">
          PG
        </span>
        <span className="eyebrow">Alpha access</span>
        <h1>Enter the gym</h1>
        <p>Sign in protects one ranked start per daily challenge and keeps the leaderboard fair.</p>
        <div className="auth-buttons">
          <button className="button button-dark button-wide" onClick={signIn} type="button">
            Continue with Google
          </button>
          <button className="button button-wide" onClick={signIn} type="button">
            Continue with Apple
          </button>
        </div>
        <p className="auth-disclaimer">
          Local demo mode is active until Clerk keys are configured. By continuing, you confirm you are 18+
          and currently in the United States.
        </p>
      </section>
    </div>
  );
}
