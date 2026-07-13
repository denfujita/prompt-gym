import type { Metadata } from "next";
import { EligibilityForm } from "@/components/eligibility-form";

export const metadata: Metadata = { title: "Player Eligibility" };

export default function EligibilityPage() {
  return (
    <div className="sign-in-page">
      <section className="sign-in-card eligibility-card">
        <span className="eyebrow">One-time alpha check</span>
        <h1>Ready to enter?</h1>
        <p>
          Live play is currently limited to adults in the United States. These statements are used only for
          eligibility and abuse prevention.
        </p>
        <EligibilityForm />
      </section>
    </div>
  );
}
