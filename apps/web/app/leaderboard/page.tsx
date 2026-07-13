import type { Metadata } from "next";

import { LeaderboardClient } from "@/components/leaderboard-client";
import { apiMode } from "@/lib/api";

export const metadata: Metadata = { title: "Leaderboard" };

export default function LeaderboardPage() {
  return (
    <div className="shell">
      <header className="page-header">
        <div className="page-header-row">
          <div>
            <span className="eyebrow">
              {apiMode === "demo" ? "Demo season · Day 1" : "Exact-instance leaderboard"}
            </span>
            <h1>Daily board</h1>
            <p>Exact solves, ranked by provider-reported tokens. Time never breaks a tie.</p>
          </div>
          <span className="pill">
            <span className="status-dot" /> {apiMode === "demo" ? "Demo · 3,217 coaches" : "Live board"}
          </span>
        </div>
      </header>
      <LeaderboardClient />
    </div>
  );
}
