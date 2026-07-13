import type { Metadata } from "next";

import { TutorialClient } from "@/components/tutorial-client";

export const metadata: Metadata = { title: "Tutorial" };

export default function TutorialPage() {
  return <TutorialClient />;
}
