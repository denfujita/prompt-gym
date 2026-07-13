"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import {
  DEMO_AUTH_EVENT,
  endDemoSession,
  readDemoSession,
  safeReturnTo,
  type DemoSession,
  waitForClerkBrowser,
} from "@/lib/auth-client";

function signInHref(returnTo: string): string {
  return `/sign-in?returnTo=${encodeURIComponent(returnTo)}`;
}

function DemoAuthControls({ returnTo }: { returnTo: string }) {
  const router = useRouter();
  const [session, setSession] = useState<DemoSession | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const refresh = () => {
      setSession(readDemoSession());
      setLoaded(true);
    };
    refresh();
    window.addEventListener(DEMO_AUTH_EVENT, refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener(DEMO_AUTH_EVENT, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  if (!loaded) return <span className="auth-loading" role="status" aria-label="Loading account" />;
  if (!session)
    return (
      <Link className="button button-small button-dark" href={signInHref(returnTo)}>
        Sign in
      </Link>
    );

  return (
    <button
      aria-label={`Sign out ${session.handle}`}
      className="button button-small button-dark demo-sign-out"
      onClick={() => {
        endDemoSession();
        router.push("/");
        router.refresh();
      }}
      type="button"
    >
      <span className="demo-account-dot" aria-hidden="true" />
      <span className="demo-account-handle">{session.handle} · </span>Sign out
    </button>
  );
}

function ClerkAuthControls({ returnTo }: { returnTo: string }) {
  const router = useRouter();
  const [loaded, setLoaded] = useState(false);
  const [handle, setHandle] = useState<string | null>(null);
  const [signingOut, setSigningOut] = useState(false);
  const [signOutFailed, setSignOutFailed] = useState(false);

  useEffect(() => {
    let active = true;
    let unsubscribe: (() => void) | undefined;
    void waitForClerkBrowser().then((clerk) => {
      if (!active) return;
      const refresh = () => {
        setHandle(clerk?.user?.username ?? clerk?.user?.firstName ?? (clerk?.session ? "Account" : null));
        setLoaded(true);
      };
      refresh();
      unsubscribe = clerk?.addListener?.(refresh);
    });
    return () => {
      active = false;
      unsubscribe?.();
    };
  }, []);

  if (!loaded) return <span className="auth-loading" role="status" aria-label="Loading account" />;
  if (!handle)
    return (
      <Link className="button button-small button-dark" href={signInHref(returnTo)}>
        Sign in
      </Link>
    );
  return (
    <button
      aria-label={`Sign out ${handle}`}
      className="button button-small button-dark demo-sign-out"
      disabled={signingOut}
      onClick={() => {
        setSigningOut(true);
        setSignOutFailed(false);
        void waitForClerkBrowser().then(async (clerk) => {
          try {
            if (!clerk?.signOut) throw new Error("Clerk did not load");
            await clerk.signOut({ redirectUrl: "/" });
            setHandle(null);
            router.push("/");
            router.refresh();
          } catch {
            setSignOutFailed(true);
          } finally {
            setSigningOut(false);
          }
        });
      }}
      type="button"
    >
      <span className="demo-account-dot" aria-hidden="true" />
      <span className="demo-account-handle">{handle} · </span>
      {signingOut ? "Signing out…" : signOutFailed ? "Try sign out again" : "Sign out"}
    </button>
  );
}

export function AuthControls({ clerkEnabled, pathname }: { clerkEnabled: boolean; pathname: string }) {
  const [returnTo, setReturnTo] = useState(safeReturnTo(pathname));

  useEffect(() => {
    setReturnTo(safeReturnTo(`${window.location.pathname}${window.location.search}${window.location.hash}`));
  }, [pathname]);

  return clerkEnabled ? <ClerkAuthControls returnTo={returnTo} /> : <DemoAuthControls returnTo={returnTo} />;
}
