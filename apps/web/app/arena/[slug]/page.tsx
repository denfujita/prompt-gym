import type { Metadata } from "next";

import { ArenaClient } from "@/components/arena-client";
import { getChallenge } from "@/lib/demo-data";

export const metadata: Metadata = { title: "Arena" };

export default async function ArenaPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ model?: string | string[]; mode?: string | string[] }>;
}) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const modelProfileId = Array.isArray(query.model) ? query.model[0] : query.model;
  const requestedMode = Array.isArray(query.mode) ? query.mode[0] : query.mode;
  return (
    <ArenaClient
      attemptMode={requestedMode === "practice" ? "practice" : "ranked"}
      challenge={getChallenge(slug)}
      modelProfileId={modelProfileId}
    />
  );
}
