export const DEMO_SESSION_KEY = "prompt-gym:demo-session";
export const DEMO_ELIGIBILITY_KEY = "prompt-gym:demo-eligibility";
export const DEMO_AUTH_EVENT = "prompt-gym:demo-auth-change";

export interface DemoSession {
  handle: string;
  signedInAt: string;
}

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export interface ClerkBrowserClient {
  loaded?: boolean;
  session?: { getToken(): Promise<string | null> };
  user?: { firstName?: string | null; username?: string | null };
  addListener?(listener: () => void): () => void;
  signOut?(options?: { redirectUrl?: string }): Promise<void>;
}

export function isClerkMode(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && process.env.NEXT_PUBLIC_API_URL);
}

declare global {
  interface Window {
    Clerk?: ClerkBrowserClient;
  }
}

function browserStorage(): StorageLike | undefined {
  return typeof window === "undefined" ? undefined : window.localStorage;
}

function announceDemoAuthChange(): void {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(DEMO_AUTH_EVENT));
}

export function readDemoSession(storage: StorageLike | undefined = browserStorage()): DemoSession | null {
  if (!storage) return null;
  try {
    const parsed = JSON.parse(storage.getItem(DEMO_SESSION_KEY) ?? "null") as Partial<DemoSession> | null;
    return parsed && typeof parsed.handle === "string" && typeof parsed.signedInAt === "string"
      ? { handle: parsed.handle, signedInAt: parsed.signedInAt }
      : null;
  } catch {
    return null;
  }
}

export function startDemoSession(storage: StorageLike | undefined = browserStorage()): DemoSession {
  const session = { handle: "quietcoach", signedInAt: new Date().toISOString() };
  storage?.setItem(DEMO_SESSION_KEY, JSON.stringify(session));
  announceDemoAuthChange();
  return session;
}

export function endDemoSession(storage: StorageLike | undefined = browserStorage()): void {
  storage?.removeItem(DEMO_SESSION_KEY);
  storage?.removeItem(DEMO_ELIGIBILITY_KEY);
  announceDemoAuthChange();
}

export function saveDemoEligibility(
  version: string,
  storage: StorageLike | undefined = browserStorage(),
): void {
  storage?.setItem(DEMO_ELIGIBILITY_KEY, JSON.stringify({ version, savedAt: new Date().toISOString() }));
}

export function hasDemoEligibility(storage: StorageLike | undefined = browserStorage()): boolean {
  if (!storage) return false;
  try {
    const parsed = JSON.parse(storage.getItem(DEMO_ELIGIBILITY_KEY) ?? "null") as {
      version?: unknown;
      savedAt?: unknown;
    } | null;
    return Boolean(parsed && typeof parsed.version === "string" && typeof parsed.savedAt === "string");
  } catch {
    return false;
  }
}

export function safeReturnTo(value: string | null | undefined, fallback = "/play"): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return fallback;
  try {
    const parsed = new URL(value, "https://prompt.gym");
    if (parsed.origin !== "https://prompt.gym") return fallback;
    if (parsed.pathname.startsWith("/sign-in") || parsed.pathname.startsWith("/eligibility")) return fallback;
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return fallback;
  }
}

export async function waitForClerkBrowser(timeoutMs = 5_000): Promise<ClerkBrowserClient | undefined> {
  if (typeof window === "undefined" || !isClerkMode()) return undefined;
  if (window.Clerk?.loaded) return window.Clerk;

  return new Promise((resolve) => {
    const startedAt = Date.now();
    const timer = window.setInterval(() => {
      if (window.Clerk?.loaded || Date.now() - startedAt >= timeoutMs) {
        window.clearInterval(timer);
        resolve(window.Clerk?.loaded ? window.Clerk : undefined);
      }
    }, 50);
  });
}

export async function getClerkToken(): Promise<string | null> {
  const clerk = await waitForClerkBrowser();
  return clerk?.session ? clerk.session.getToken().catch(() => null) : null;
}

export function isLoopbackUrl(value: string | undefined): boolean {
  if (!value) return false;
  try {
    const hostname = new URL(value).hostname;
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1" || hostname === "[::1]";
  } catch {
    return false;
  }
}
