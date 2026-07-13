import type { Metadata } from "next";

import { SettingsNav } from "@/components/settings-nav";
import { apiMode } from "@/lib/api";

export const metadata: Metadata = { title: "Profile" };

export default function ProfilePage() {
  return (
    <div className="shell">
      <header className="page-header">
        <span className="eyebrow">Your training log</span>
        <h1>Coach profile</h1>
        <p>Track personal improvement without turning consistency into a chore.</p>
      </header>
      <div className="settings-layout">
        <SettingsNav active="profile" />
        <section className="surface settings-content">
          <span className="eyebrow">Public identity</span>
          <h2>Form and history</h2>
          {apiMode === "demo" ? (
            <>
              <div className="profile-identity">
                <div className="profile-avatar" aria-hidden="true">
                  QT
                </div>
                <div>
                  <h3>quietcoach</h3>
                  <p>Illustrative pseudonymous profile · demo data</p>
                </div>
              </div>
              <div className="profile-stats">
                <div className="profile-stat">
                  <small>Exact solves</small>
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
              <span className="eyebrow">Demo badges</span>
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
              <strong>Live profile metrics are not connected yet.</strong>
              <p>
                This page will show your server-backed handle, solves, form, and badges when the account
                summary endpoint ships.
              </p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
