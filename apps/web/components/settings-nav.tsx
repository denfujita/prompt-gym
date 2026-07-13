import Link from "next/link";

export function SettingsNav({ active }: { active: "profile" | "consent" }) {
  return (
    <nav className="surface settings-nav" aria-label="Profile settings">
      <Link className={active === "profile" ? "is-active" : ""} href="/profile">
        Profile & history
      </Link>
      <Link className={active === "consent" ? "is-active" : ""} href="/consent">
        Data choices
      </Link>
      <Link href="/leaderboard">Leaderboard</Link>
      <Link href="/play">Daily gym</Link>
    </nav>
  );
}
