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
              {apiMode === "demo" ? "Demo season · Day 1" : "Your assigned task"}
            </span>
            <h1>Today’s board</h1>
            <p>Verified wins, ranked by provider-reported tokens. The clock never breaks a tie.</p>
          </div>
          <span className="pill">
            <span className="status-dot" /> {apiMode === "demo" ? "Demo · 3,217 players" : "Live now"}
          </span>
        </div>
      </header>
      <LeaderboardClient />
    </div>
  );
}
