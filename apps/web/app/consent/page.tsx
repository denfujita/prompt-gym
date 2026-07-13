import type { Metadata } from "next";

import { ConsentForm } from "@/components/consent-form";
import { SettingsNav } from "@/components/settings-nav";

export const metadata: Metadata = { title: "Data Choices" };

export default function ConsentPage() {
  return (
    <div className="shell">
      <header className="page-header">
        <span className="eyebrow">Your privacy</span>
        <h1>You decide what gets shared.</h1>
        <p>
          Playing and sharing data are separate choices. Both optional settings are off by default, and
          neither affects the API costs we cover.
        </p>
      </header>
      <div className="settings-layout">
        <SettingsNav active="consent" />
        <section className="surface settings-content">
          <span className="eyebrow">Consent version · 2026-07-12.v1</span>
          <h2>Choose what you share</h2>
          <p>Change or withdraw either optional permission whenever you like.</p>
          <ConsentForm />
        </section>
      </div>
    </div>
  );
}
