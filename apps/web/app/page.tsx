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
            <span className="eyebrow">A daily game for better prompting</span>
            <h1>
              Can you guide the AI to a win <span className="highlight">with fewer tokens?</span>
            </h1>
            <p>
              You can’t touch the task yourself. Watch the AI work, spot what it missed, and point it in the
              right direction.
            </p>
            <div className="hero-actions">
              <Link className="button button-dark" href="/play">
                Play today <span aria-hidden="true">→</span>
              </Link>
              <Link className="button button-volt" href="/tutorial">
                Try a free practice round
              </Link>
            </div>
            <div className="hero-note">
              <span aria-hidden="true">$0</span>
              We cover the API bill during alpha. No card needed.
            </div>
          </div>

          <div className="hero-demo" aria-label="Example Crack the Signal Vault game">
            <div className="hero-demo-card">
              <div className="demo-card-bar">
                <span>Signal Vault · Sample run</span>
                <span>{apiMode === "demo" ? "2,843 demo tokens" : "Sample run"}</span>
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
                  <small>AI action</small>
                  <p>Used the inverse sequence. Every light turned green.</p>
                </div>
              </div>
            </div>
            <div className="floating-score">
              {apiMode === "demo" ? "DEMO WIN · RANK #42 ↑" : "SAMPLE WIN"}
            </div>
          </div>
        </div>
      </section>

      <div className="marquee" aria-hidden="true">
        <div className="marquee-track">
          <span>Three fresh challenges daily</span>
          <span>◆</span>
          <span>Lowest token count wins</span>
          <span>◆</span>
          <span>Every win is checked</span>
          <span>◆</span>
          <span>You only prompt</span>
          <span>◆</span>
          <span>Three fresh challenges daily</span>
          <span>◆</span>
          <span>Lowest token count wins</span>
          <span>◆</span>
          <span>Every win is checked</span>
          <span>◆</span>
          <span>You only prompt</span>
          <span>◆</span>
        </div>
      </div>

      <section className="section">
        <div className="shell">
          <div className="section-heading">
            <div>
              <span className="eyebrow">The idea</span>
              <h2>Watch. Nudge. Solve.</h2>
            </div>
            <p>
              The model already knows the task. Your edge is catching its blind spots and choosing the next
              move.
            </p>
          </div>
          <div className="how-grid">
            <article className="how-card">
              <span className="how-number">01</span>
              <h3>See what happened</h3>
              <p>Follow what the model says, tries, and changes. Its private reasoning stays private.</p>
            </article>
            <article className="how-card">
              <span className="how-number">02</span>
              <h3>Give it a nudge</h3>
              <p>Narrow the next step with one clear prompt. Then watch it inspect, edit, and test.</p>
            </article>
            <article className="how-card">
              <span className="how-number">03</span>
              <h3>Solve with less</h3>
              <p>
                Every token reported for a model call counts. Get it right, beat your best, and climb your
                board.
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
              <h2>Pick your kind of challenge.</h2>
            </div>
            <p>Each run is generated and checked by code. A win is a win—no judges, votes, or guesswork.</p>
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
                    : "Score to beat shown when you start"}
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
            <span className="eyebrow">A scripted Benchmark Lab preview</span>
            <h2>Think you can make the model better?</h2>
            <p>
              Coach it through a coding benchmark. Strongest band wins; within a band, fewer tokens ranks
              higher.
            </p>
          </div>
          <Link className="button button-dark" href="/benchmarks">
            Open the preview <span aria-hidden="true">→</span>
          </Link>
        </div>
      </section>

      <section className="section">
        <div className="shell">
          <div className="cta-band">
            <div className="cta-band-inner">
              <h2>One better instruction can change the whole run.</h2>
              <Link className="button button-volt" href="/tutorial">
                Try it yourself <span aria-hidden="true">→</span>
              </Link>
            </div>
          </div>
        </div>
      </section>

      <footer className="site-footer">
        <div className="shell footer-inner">
          <span>© 2026 Prompt Gym. Built for people who like making AI work better.</span>
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
