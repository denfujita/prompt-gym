import type { Metadata } from "next";

import { ArenaClient } from "@/components/arena-client";
import { getChallenge } from "@/lib/demo-data";

export const metadata: Metadata = { title: "Arena" };

export default async function ArenaPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <ArenaClient challenge={getChallenge(slug)} />;
}
