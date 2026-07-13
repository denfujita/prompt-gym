import type { Metadata } from "next";

import { SignIn } from "@clerk/nextjs";

import { DemoSignIn } from "@/components/demo-sign-in";
import { isClerkMode, safeReturnTo } from "@/lib/auth-client";

export const metadata: Metadata = { title: "Sign In" };

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ returnTo?: string | string[] }>;
}) {
  const query = await searchParams;
  const returnTo = safeReturnTo(typeof query.returnTo === "string" ? query.returnTo : undefined);
  if (!isClerkMode()) return <DemoSignIn returnTo={returnTo} />;
  return (
    <div className="sign-in-page">
      <SignIn fallbackRedirectUrl={`/eligibility?returnTo=${encodeURIComponent(returnTo)}`} />
    </div>
  );
}
