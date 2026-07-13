import type { Metadata } from "next";

import { SignIn } from "@clerk/nextjs";

import { DemoSignIn } from "@/components/demo-sign-in";

export const metadata: Metadata = { title: "Sign In" };

export default function SignInPage() {
  if (!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) return <DemoSignIn />;
  return (
    <div className="sign-in-page">
      <SignIn fallbackRedirectUrl="/eligibility" />
    </div>
  );
}
