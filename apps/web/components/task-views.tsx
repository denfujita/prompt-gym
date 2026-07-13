import type { ChallengeSlug } from "@/lib/types";
import { taskStateNumber, taskStateString, taskStateStrings, type PublicTaskState } from "@/lib/task-state";

export function TaskView({
  slug,
  progress,
  taskState,
  demo = false,
}: {
  slug: ChallengeSlug;
  progress: number;
  taskState?: PublicTaskState;
  demo?: boolean;
}) {
  if (!demo) {
    if (!taskState) return <WaitingForTaskState />;
    if (slug === "clone-the-gremlin") return <LiveGremlinView state={taskState} />;
    if (slug === "rigged-race") return <LiveRaceView state={taskState} />;
    return <LiveSignalVaultView state={taskState} />;
  }
  if (slug === "clone-the-gremlin") return <GremlinView progress={progress} />;
  if (slug === "rigged-race") return <RaceView progress={progress} />;
  return <SignalVaultView progress={progress} />;
}

function WaitingForTaskState() {
  return (
    <div className="live-state-wait" role="status">
      <strong>Getting the task ready…</strong>
      <p>It’ll appear here as soon as the run begins.</p>
    </div>
  );
}

function objectValue(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function LiveSignalVaultView({ state }: { state: PublicTaskState }) {
  const opened = taskStateNumber(state, "chambersOpened", "chambersOpen") ?? 0;
  const total = taskStateNumber(state, "totalChambers") ?? 3;
  const chamber = taskStateNumber(state, "chamber") ?? Math.min(opened + 1, total);
  const actionsRemaining = taskStateNumber(state, "actionsRemaining", "actionBudgetRemaining");
  const status = taskStateString(state, "status") ?? "ACTIVE";
  const controls = taskStateStrings(state, "controls");
  const panelColor = objectValue(state.panelColor);
  const gate = objectValue(state.gate);
  const panelSymbol = typeof panelColor?.symbol === "string" ? panelColor.symbol : "◇";

  return (
    <div
      className="vault-view"
      role="img"
      aria-label={`${opened} of ${total} Signal Vault chambers cleared; state ${status}`}
    >
      <div className="vault-status">
        <span>State · {status}</span>
        <span>
          {opened}/{total} chambers clear
          {actionsRemaining === undefined ? "" : ` · ${actionsRemaining} actions left`}
        </span>
      </div>
      <div className="vault-chambers">
        {Array.from({ length: total }, (_, index) => {
          const clear = index < opened;
          const active = !clear && index === chamber - 1;
          return (
            <section
              className={`vault-chamber ${clear ? "is-clear" : ""} ${active ? "is-active" : ""}`}
              key={index}
            >
              <header>
                <span>CH-0{index + 1}</span>
                <span>{clear ? "WIN" : active ? status : "LOCKED"}</span>
              </header>
              <div className="vault-door">{clear ? "✓" : active ? panelSymbol : "—"}</div>
              {active && controls.length ? (
                <div className="vault-controls" aria-label="Available model actions">
                  {controls.map((control) => (
                    <span className="vault-control" key={control} title={control}>
                      {control.slice(0, 2).toUpperCase()}
                    </span>
                  ))}
                </div>
              ) : null}
            </section>
          );
        })}
      </div>
      <div className="vault-legend">
        {panelColor ? (
          <span>
            <b>{String(panelColor.symbol ?? "Panel")}</b> · {String(panelColor.color ?? "unknown")} ·{" "}
            {String(panelColor.meaning ?? "state")}
          </span>
        ) : null}
        {gate ? (
          <span>
            <b>Gate {String(gate.symbol ?? "")}</b> · {String(gate.position ?? "unknown")}
          </span>
        ) : null}
        <span>Live task update</span>
      </div>
    </div>
  );
}

function LiveGremlinView({ state }: { state: PublicTaskState }) {
  const probesRemaining = taskStateNumber(state, "probesRemaining");
  const artifact = taskStateString(state, "artifact") ?? taskStateString(state, "file") ?? "replacement file";
  const privateTests = taskStateNumber(state, "privateTests");
  const status = taskStateString(state, "status") ?? "ACTIVE";
  const publicTests = taskStateString(state, "publicTests");
  return (
    <div className="gremlin-workbench" aria-label={`Gremlin workbench; state ${status}`}>
      <section className="oracle-pane">
        <div className="terminal-head">
          <span>You can run it, but not inspect it</span>
          <span>{status}</span>
        </div>
        <p className="terminal-line">
          <span className="prompt">Probe budget</span>
        </p>
        <p className="terminal-line">
          <span className="result">→</span>{" "}
          {probesRemaining === undefined ? "Not reported yet" : `${probesRemaining} of 18 remaining`}
        </p>
        <p className="terminal-line">Each oracle query and result appears in the AI activity feed.</p>
      </section>
      <section className="code-pane">
        <div className="terminal-head">
          <span>{artifact}</span>
          <span>AI-controlled</span>
        </div>
        <ol className="code-lines">
          <li>
            <span className="code-key">file</span>: {artifact}
          </li>
          <li>
            <span className="code-key">public tests</span>: {publicTests ?? "not reported"}
          </li>
          <li>
            <span className="code-key">goal</span>: match every behavior
          </li>
        </ol>
        <div className="test-bar">
          <span>HIDDEN TESTS</span>
          <strong>{privateTests === undefined ? "Hidden" : `${privateTests} hidden cases`}</strong>
        </div>
      </section>
    </div>
  );
}

function LiveRaceView({ state }: { state: PublicTaskState }) {
  const files = taskStateStrings(state, "files");
  const fields = taskStateStrings(state, "submissionSchema");
  const filesRead = taskStateNumber(state, "filesRead") ?? 0;
  const status = taskStateString(state, "status") ?? "ACTIVE";
  const unit = taskStateString(state, "advantageUnit");
  const tolerance = taskStateNumber(state, "toleranceSeconds");
  return (
    <div
      className="race-board"
      aria-label={`Rigged Race evidence board; ${filesRead} evidence files read; state ${status}`}
    >
      <div className="race-board-head">
        <strong>Evidence case</strong>
        <span className="pill">{status}</span>
      </div>
      <div className="live-race-grid">
        <section className="live-state-summary">
          <small>Evidence progress</small>
          <strong>
            {filesRead} / {files.length || "—"} files read
          </strong>
          <p>Files and analysis appear here as the AI reads them.</p>
        </section>
        <section className="live-state-summary">
          <small>Answer format</small>
          <strong>{fields.length ? fields.join(" · ") : "Not loaded yet"}</strong>
          {unit ? (
            <p>
              Advantage in {unit}
              {tolerance === undefined ? "" : ` · tolerance ${tolerance}`}
            </p>
          ) : null}
        </section>
      </div>
      <div className="evidence-list" aria-label="Available evidence files">
        {files.map((file) => (
          <span key={file}>{file}</span>
        ))}
      </div>
    </div>
  );
}

function SignalVaultView({ progress }: { progress: number }) {
  return (
    <div
      className="vault-view"
      role="img"
      aria-label={`${Math.min(progress, 3)} of 3 Signal Vault chambers cleared`}
    >
      <div className="vault-status">
        <span>Connection stable</span>
        <span>{Math.min(progress, 3)}/3 chambers clear</span>
      </div>
      <div className="vault-chambers">
        {[0, 1, 2].map((index) => {
          const clear = index < progress;
          const active = index === progress;
          return (
            <section
              className={`vault-chamber ${clear ? "is-clear" : ""} ${active ? "is-active" : ""}`}
              key={index}
            >
              <header>
                <span>CH-0{index + 1}</span>
                <span>{clear ? "WIN" : active ? "ACTIVE" : "LOCKED"}</span>
              </header>
              <div className="vault-door">{clear ? "✓" : index === 0 ? "◇" : index === 1 ? "○" : "△"}</div>
              <div className="vault-controls" aria-hidden="true">
                <span className="vault-control">◇</span>
                <span className="vault-control">○</span>
                <span className="vault-control">△</span>
              </div>
            </section>
          );
        })}
      </div>
      <div className="vault-legend">
        <span>
          <b>◇ Cyan diamond</b> · position
        </span>
        <span>
          <b>○ Amber circle</b> · gate
        </span>
        <span>
          <b>△ Rose triangle</b> · tone
        </span>
      </div>
    </div>
  );
}

function GremlinView({ progress }: { progress: number }) {
  const probeCount = progress === 0 ? 0 : progress === 1 ? 6 : 11;
  const tests = progress === 0 ? "0 / 11" : progress === 1 ? "8 / 11" : "11 / 11";
  return (
    <div className="gremlin-workbench" aria-label={`Gremlin workbench, ${probeCount} of 18 probes used`}>
      <section className="oracle-pane">
        <div className="terminal-head">
          <span>Gremlin oracle</span>
          <span>{18 - probeCount} probes left</span>
        </div>
        <p className="terminal-line">
          <span className="prompt">$ gremlin</span> &quot;aab|c&quot;
        </p>
        <p className="terminal-line">
          <span className="result">→</span> 2:a · 1:b · #07 · c
        </p>
        {progress > 0 && (
          <>
            <p className="terminal-line">
              <span className="prompt">$ gremlin</span> &quot;👾👾|x&quot;
            </p>
            <p className="terminal-line">
              <span className="result">→</span> 2:👾 · #5e · x
            </p>
            <p className="terminal-line">
              <span className="prompt">$ gremlin</span> &quot;\\|&quot;
            </p>
            <p className="terminal-line">
              <span className="result">→</span> 1:| · #00 · ∅
            </p>
          </>
        )}
      </section>
      <section className="code-pane">
        <div className="terminal-head">
          <span>clone.ts</span>
          <span>{progress === 0 ? "empty" : "modified"}</span>
        </div>
        <ol className="code-lines">
          {progress === 0 ? (
            <li>
              <span className="code-key">// Coach the model to build the clone.</span>
            </li>
          ) : (
            <>
              <li>
                <span className="code-key">export function</span> <span className="code-fn">gremlin</span>
                (input: string) &#123;
              </li>
              <li>
                {" "}
                <span className="code-key">const</span> runs = splitEscaped(input);
              </li>
              <li>
                {" "}
                <span className="code-key">return</span> runs.map(encodeRun)
              </li>
              <li> .concat(checksum(input))</li>
              <li>
                {" "}
                .join(<span className="code-str">&quot; · &quot;</span>);
              </li>
              <li>&#125;</li>
              {progress > 1 && (
                <>
                  <li></li>
                  <li>
                    <span className="code-key">function</span> <span className="code-fn">checksum</span>
                    (value: string) &#123;
                  </li>
                  <li>
                    {" "}
                    <span className="code-key">return</span> codePoints(value) % 97;
                  </li>
                  <li>&#125;</li>
                </>
              )}
            </>
          )}
        </ol>
        <div className="test-bar">
          <span>PUBLIC TESTS</span>
          <strong>{tests}</strong>
        </div>
      </section>
    </div>
  );
}

function RaceView({ progress }: { progress: number }) {
  return (
    <div className="race-board" aria-label="Rigged Race telemetry analysis board">
      <div className="race-board-head">
        <strong>Orchid City Night Run</strong>
        <div className="race-flags" aria-hidden="true">
          <span />
          <span />
          <span />
          <span />
          <span />
          <span />
        </div>
      </div>
      <div className="race-grid">
        <div className="race-chart" aria-label="Corrected lap telemetry plot">
          <span className="race-line one" />
          <span className="race-line two" />
          <span className="race-line three" />
          {progress > 0 && <span className="evidence-pin one">E-17</span>}
          {progress > 1 && <span className="evidence-pin two">E-22</span>}
        </div>
        <div className="race-table">
          <div className="racer-row">
            <b>1</b>
            <strong>Moss</strong>
            <span>18:41.09</span>
          </div>
          <div className="racer-row">
            <b>2</b>
            <strong>C7</strong>
            <span>18:42.31</span>
          </div>
          <div className="racer-row">
            <b>3</b>
            <strong>Nova</strong>
            <span>18:43.02</span>
          </div>
        </div>
      </div>
      <div className="evidence-list">
        <span>telemetry.csv</span>
        <span>pit-log.json</span>
        <span>aliases.txt</span>
        {progress > 0 && <span>sensor S4 · drift</span>}
        {progress > 1 && <span>relay window · 2.74s</span>}
      </div>
    </div>
  );
}
