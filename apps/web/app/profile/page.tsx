import type { Metadata } from "next";

import { SettingsNav } from "@/components/settings-nav";
import { apiMode } from "@/lib/api";

export const metadata: Metadata = { title: "Profile" };

export default function ProfilePage() {
  return (
    <div className="shell">
      <header className="page-header">
        <span className="eyebrow">Your runs</span>
        <h1>See how your coaching is improving.</h1>
        <p>Track your progress without the streak pressure.</p>
      </header>
      <div className="settings-layout">
        <SettingsNav active="profile" />
        <section className="surface settings-content">
          <span className="eyebrow">Display name</span>
          <h2>Your stats</h2>
          {apiMode === "demo" ? (
            <>
              <div className="profile-identity">
                <div className="profile-avatar" aria-hidden="true">
                  QT
                </div>
                <div>
                  <h3>quietcoach</h3>
                  <p>Sample private-by-default profile</p>
                </div>
              </div>
              <div className="profile-stats">
                <div className="profile-stat">
                  <small>Verified wins</small>
                  <strong>11 / 16</strong>
                </div>
                <div className="profile-stat">
                  <small>Best percentile</small>
                  <strong>Top 4%</strong>
                </div>
                <div className="profile-stat">
                  <small>Weekly consistency</small>
                  <strong>4 days</strong>
                </div>
              </div>
              <span className="eyebrow">Sample badges</span>
              <div className="badge-grid">
                <article className="badge-card">
                  <span aria-hidden="true">◇</span>
                  <strong>Signal Reader</strong>
                  <small>Solve a vault in under 3 turns</small>
                </article>
                <article className="badge-card">
                  <span aria-hidden="true">↓</span>
                  <strong>Token Tamer</strong>
                  <small>Beat your own score by 25%</small>
                </article>
                <article className="badge-card">
                  <span aria-hidden="true">4</span>
                  <strong>Four-day Form</strong>
                  <small>Train on four days in one week</small>
                </article>
              </div>
            </>
          ) : (
            <div className="live-state-wait">
              <strong>Your profile is still warming up.</strong>
              <p>
                Your handle, wins, weekly activity, and badges will show here once account summaries are
                ready.
              </p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
