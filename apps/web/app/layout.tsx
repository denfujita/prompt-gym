import type { Metadata } from "next";
import type { ReactNode } from "react";

import { ClerkProvider } from "@clerk/nextjs";

import { AnalyticsProvider } from "@/components/analytics-provider";
import { MobileDock, SiteHeader } from "@/components/site-header";
import { isClerkMode } from "@/lib/auth-client";

import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://prompt.gym"),
  title: {
    default: "Prompt Gym — Guide the AI to a win with fewer tokens",
    template: "%s · Prompt Gym",
  },
  description:
    "A daily game where you coach an AI through puzzles and builds, then compete to solve them with fewer tokens.",
  openGraph: {
    title: "Prompt Gym",
    description: "Can you guide an AI to a win with fewer tokens?",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Prompt Gym",
    description: "Can you guide an AI to a win with fewer tokens?",
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
  const clerkEnabled = isClerkMode();

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
