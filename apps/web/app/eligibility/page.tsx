import type { Metadata } from "next";
import { EligibilityForm } from "@/components/eligibility-form";
import { safeReturnTo } from "@/lib/auth-client";

export const metadata: Metadata = { title: "Player Eligibility" };

export default async function EligibilityPage({
  searchParams,
}: {
  searchParams: Promise<{ returnTo?: string | string[] }>;
}) {
  const query = await searchParams;
  const returnTo = safeReturnTo(typeof query.returnTo === "string" ? query.returnTo : undefined);
  return (
    <div className="sign-in-page">
      <section className="sign-in-card eligibility-card">
        <span className="eyebrow">A quick alpha check</span>
        <h1>Ready to enter?</h1>
        <p>
          For now, live play is limited to adults in the United States. We use these answers only to confirm
          eligibility and prevent abuse.
        </p>
        <EligibilityForm returnTo={returnTo} />
      </section>
    </div>
  );
}
