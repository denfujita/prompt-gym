"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { AuthControls } from "./auth-controls";
import { Brand } from "./brand";
import { isClerkMode } from "@/lib/auth-client";

const nav = [
  { href: "/play", label: "Daily Gym", shortLabel: "Daily", symbol: "◇" },
  { href: "/models", label: "Models", shortLabel: "Models", symbol: "◈" },
  { href: "/benchmarks", label: "Benchmark Lab", shortLabel: "Lab", symbol: "⚡" },
  { href: "/leaderboard", label: "Leaderboard", shortLabel: "Board", symbol: "↗" },
  { href: "/profile", label: "Profile", shortLabel: "Me", symbol: "●" },
];

export function SiteHeader() {
  const pathname = usePathname();
  const clerkEnabled = isClerkMode();

  return (
    <header className="site-header">
      <div className="shell site-header-inner">
        <Brand />
        <nav className="desktop-nav" aria-label="Main navigation">
          {nav.map((item) => (
            <Link
              className={pathname.startsWith(item.href) ? "nav-link is-active" : "nav-link"}
              href={item.href}
              key={item.href}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <AuthControls clerkEnabled={clerkEnabled} pathname={pathname} />
      </div>
    </header>
  );
}

export function MobileDock() {
  const pathname = usePathname();
  return (
    <nav className="mobile-dock" aria-label="Mobile navigation">
      {nav.map((item) => (
        <Link
          className={pathname.startsWith(item.href) ? "dock-link is-active" : "dock-link"}
          href={item.href}
          key={item.href}
        >
          <span aria-hidden="true">{item.symbol}</span>
          {item.shortLabel}
        </Link>
      ))}
    </nav>
  );
}
