import Link from "next/link";

import { apiMode } from "@/lib/api";
import { challenges } from "@/lib/demo-data";
import { formatTokens } from "@/lib/format";

export default function HomePage() {
  return (
    <>
      <section className="landing-hero">
        <div className="shell hero-grid">
          <div className="hero-copy">
            <span className="eyebrow">The daily AI coaching arcade</span>
            <h1>
              Coach an AI. <span className="highlight">Spend fewer tokens.</span> Climb the board.
            </h1>
            <p>
              You cannot touch the task. You can only coach the model. Solve hard, verifiable challenges and
              win by saying less.
            </p>
            <div className="hero-actions">
              <Link className="button button-dark" href="/play">
                Play today’s gym <span aria-hidden="true">→</span>
              </Link>
              <Link className="button button-volt" href="/tutorial">
                Try the free tutorial
              </Link>
            </div>
            <div className="hero-note">
              <span aria-hidden="true">$0</span>
              API cost is covered during the alpha. No card required.
            </div>
          </div>

          <div className="hero-demo" aria-label="Example Crack the Signal Vault game">
            <div className="hero-demo-card">
              <div className="demo-card-bar">
                <span>Crack the Signal Vault · Example run</span>
                <span>{apiMode === "demo" ? "2,843 demo tokens" : "Illustrative preview"}</span>
              </div>
              <div className="demo-card-body">
                <div className="demo-vault" aria-hidden="true">
                  <div className="mini-chamber is-cleared">
                    ✓<small>WIN</small>
                  </div>
                  <div className="mini-chamber is-cleared">
                    ✓<small>WIN</small>
                  </div>
                  <div className="mini-chamber">
                    ◇<small>LOCKED</small>
                  </div>
                </div>
                <div className="demo-prompt">
                  <small>Your prompt · Turn 3</small>
                  <p>Chamber three is a rotated version of two. Reuse the mapping; don’t probe again.</p>
                </div>
                <div className="demo-event">
                  <small>Model action</small>
                  <p>Applied inverse sequence · all indicators green</p>
                </div>
              </div>
            </div>
            <div className="floating-score">
              {apiMode === "demo" ? "DEMO SOLVE · RANK #42 ↑" : "EXAMPLE EXACT SOLVE"}
            </div>
          </div>
        </div>
      </section>

      <div className="marquee" aria-hidden="true">
        <div className="marquee-track">
          <span>Three fresh challenges daily</span>
          <span>◆</span>
          <span>Fewest tokens wins</span>
          <span>◆</span>
          <span>Exact verification</span>
          <span>◆</span>
          <span>Prompt only</span>
          <span>◆</span>
          <span>Three fresh challenges daily</span>
          <span>◆</span>
          <span>Fewest tokens wins</span>
          <span>◆</span>
          <span>Exact verification</span>
          <span>◆</span>
          <span>Prompt only</span>
          <span>◆</span>
        </div>
      </div>

      <section className="section">
        <div className="shell">
          <div className="section-heading">
            <div>
              <span className="eyebrow">How the game works</span>
              <h2>Easy rules. Deep game.</h2>
            </div>
            <p>
              The task brief is already in the model’s context. Your edge is noticing what it missed and
              steering the next move.
            </p>
          </div>
          <div className="how-grid">
            <article className="how-card">
              <span className="how-number">01</span>
              <h3>Read the room</h3>
              <p>
                Study the task, model actions, and verifier feedback. You see everything useful—never private
                chain-of-thought.
              </p>
            </article>
            <article className="how-card">
              <span className="how-number">02</span>
              <h3>Coach the model</h3>
              <p>
                Send a precise prompt. The model acts; you watch it query, edit, test, and learn in real time.
              </p>
            </article>
            <article className="how-card">
              <span className="how-number">03</span>
              <h3>Spend less. Win.</h3>
              <p>
                Every provider-reported token counts. Get an exact solve, beat your best, and move up your
                seed’s board.
              </p>
            </article>
          </div>
        </div>
      </section>

      <section className="task-strip section">
        <div className="shell">
          <div className="section-heading">
            <div>
              <span className="eyebrow">
                {apiMode === "demo" ? "Demo training circuit" : "Challenge formats"}
              </span>
              <h2>Three ways to think.</h2>
            </div>
            <p>
              Every challenge is generated, replayable, and graded by a deterministic verifier—not vibes or
              votes.
            </p>
          </div>
          <div className="task-strip-grid">
            {challenges.map((challenge, index) => (
              <article className={`mini-task-card accent-${challenge.accent}`} key={challenge.slug}>
                <span className="pill">
                  0{index + 1} · {challenge.difficulty}
                </span>
                <h3>{challenge.name}</h3>
                <p>{challenge.brief}</p>
                <strong>
                  {apiMode === "demo" && challenge.cheapestTokens !== null
                    ? `${formatTokens(challenge.cheapestTokens)} demo tokens to beat`
                    : "Exact-instance score shown after entry"}
                </strong>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="section benchmark-home-section">
        <div className="shell benchmark-home-band">
          <div className="benchmark-home-mark" aria-hidden="true">
            ⚡
          </div>
          <div>
            <span className="eyebrow">Scripted preview · Benchmark Lab</span>
            <h2>How far can you push the same model?</h2>
            <p>
              Preview a future competition where you coach the AI through verified coding benchmarks, reach
              the strongest performance band, then win by spending fewer tokens.
            </p>
          </div>
          <Link className="button button-dark" href="/benchmarks">
            Preview the lab <span aria-hidden="true">→</span>
          </Link>
        </div>
      </section>

      <section className="section">
        <div className="shell">
          <div className="cta-band">
            <div className="cta-band-inner">
              <h2>Your best prompt is probably one edit away.</h2>
              <Link className="button button-volt" href="/tutorial">
                Learn the loop <span aria-hidden="true">→</span>
              </Link>
            </div>
          </div>
        </div>
      </section>

      <footer className="site-footer">
        <div className="shell footer-inner">
          <span>© 2026 Prompt Gym · Built for better human–AI teamwork.</span>
          <div className="footer-links">
            <Link href="/consent">Data choices</Link>
            <Link href="/leaderboard">Fair-play rules</Link>
            <a href="mailto:hello@prompt.gym">Contact</a>
          </div>
        </div>
      </footer>
    </>
  );
}
