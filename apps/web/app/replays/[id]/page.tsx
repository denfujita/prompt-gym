import type { Metadata } from "next";

import { ReplayPlayer } from "@/components/replay-player";
import { apiMode, getReplay } from "@/lib/api";
import { getChallenge } from "@/lib/demo-data";
import { formatTokens } from "@/lib/format";

export const metadata: Metadata = { title: "Replay" };

export default async function ReplayPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const replay = await getReplay(id);
  const challenge = getChallenge(replay.challengeSlug);
  return (
    <div className="shell">
      <header className="page-header">
        <div className="page-header-row">
          <div>
            <span className="eyebrow">Replay from a finished season</span>
            <h1>{replay.handle}’s solve</h1>
            <p>
              {formatTokens(replay.tokens)} tokens · {replay.turns} turns · verified win
            </p>
          </div>
          <span className="pill">
            {apiMode === "demo" ? "Demo · #1 on this board" : "Published after the season"}
          </span>
        </div>
      </header>
      <ReplayPlayer challenge={challenge} replay={replay} />
    </div>
  );
}
