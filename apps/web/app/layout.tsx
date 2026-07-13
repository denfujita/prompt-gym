import type { Metadata } from "next";
import type { ReactNode } from "react";

import { ClerkProvider } from "@clerk/nextjs";

import { AnalyticsProvider } from "@/components/analytics-provider";
import { MobileDock, SiteHeader } from "@/components/site-header";

import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://prompt.gym"),
  title: {
    default: "Prompt Gym — Coach smarter. Spend fewer tokens.",
    template: "%s · Prompt Gym",
  },
  description:
    "An AI coaching arcade where exact puzzles reward fewer tokens, with a scripted preview of future coding benchmark competitions.",
  openGraph: {
    title: "Prompt Gym",
    description: "Coach an AI. Spend fewer tokens. Climb the board.",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Prompt Gym",
    description: "Coach an AI. Spend fewer tokens. Climb the board.",
  },
};

function Frame({ children }: { children: ReactNode }) {
  return (
    <AnalyticsProvider>
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <SiteHeader />
      <main id="main-content">{children}</main>
      <MobileDock />
    </AnalyticsProvider>
  );
}

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  const clerkEnabled = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);

  return (
    <html lang="en">
      <body>
        {clerkEnabled ? (
          <ClerkProvider>
            <Frame>{children}</Frame>
          </ClerkProvider>
        ) : (
          <Frame>{children}</Frame>
        )}
      </body>
    </html>
  );
}
