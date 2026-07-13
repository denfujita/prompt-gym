import type { Metadata } from "next";
import { EligibilityForm } from "@/components/eligibility-form";

export const metadata: Metadata = { title: "Player Eligibility" };

export default function EligibilityPage() {
  return (
    <div className="sign-in-page">
      <section className="sign-in-card eligibility-card">
        <span className="eyebrow">A quick alpha check</span>
        <h1>Ready to enter?</h1>
        <p>
          For now, live play is limited to adults in the United States. We use these answers only to confirm
          eligibility and prevent abuse.
        </p>
        <EligibilityForm />
      </section>
    </div>
  );
}
