import type { ChallengeAccent } from "@/lib/types";

export function Mascot({
  accent,
  mood = "ready",
}: {
  accent: ChallengeAccent;
  mood?: "ready" | "happy" | "focus";
}) {
  return (
    <span className={`mascot mascot-${accent} mascot-${mood}`} aria-hidden="true">
      <span className="mascot-eye mascot-eye-left" />
      <span className="mascot-eye mascot-eye-right" />
      <span className="mascot-mouth" />
    </span>
  );
}
