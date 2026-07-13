import type { Metadata } from "next";

import { ConsentForm } from "@/components/consent-form";
import { SettingsNav } from "@/components/settings-nav";

export const metadata: Metadata = { title: "Data Choices" };

export default function ConsentPage() {
  return (
    <div className="shell">
      <header className="page-header">
        <span className="eyebrow">Privacy controls</span>
        <h1>Your data. Your call.</h1>
        <p>
          Playing the game and contributing data are separate choices. Optional consent is off by default and
          never changes your API subsidy.
        </p>
      </header>
      <div className="settings-layout">
        <SettingsNav active="consent" />
        <section className="surface settings-content">
          <span className="eyebrow">Consent version · 2026-07-12.v1</span>
          <h2>Choose what leaves the gym</h2>
          <p>You can change or withdraw optional permissions at any time.</p>
          <ConsentForm />
        </section>
      </div>
    </div>
  );
}
