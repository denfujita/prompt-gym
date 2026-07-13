"use client";

import { useEffect, type ReactNode } from "react";

export function AnalyticsProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
    if (!key) return;

    void import("posthog-js").then(({ default: posthog }) => {
      posthog.init(key, {
        api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://us.i.posthog.com",
        autocapture: false,
        capture_pageview: true,
        mask_all_element_attributes: true,
        mask_all_text: true,
        persistence: "localStorage+cookie",
      });
    });
  }, []);

  return children;
}
