"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { Brand } from "./brand";

const nav = [
  { href: "/play", label: "Daily gym" },
  { href: "/leaderboard", label: "Leaderboard" },
  { href: "/profile", label: "Profile" },
];

export function SiteHeader() {
  const pathname = usePathname();

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
        <Link className="button button-small button-dark" href="/sign-in">
          Sign in
        </Link>
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
          <span aria-hidden="true">
            {item.href === "/play" ? "◇" : item.href === "/leaderboard" ? "↗" : "●"}
          </span>
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
