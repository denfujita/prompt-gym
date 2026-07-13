"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { apiMode, listModels } from "@/lib/api";
import { demoModelCatalog } from "@/lib/demo-data";
import type { ModelCatalogV1, ModelProfileV1 } from "@/lib/types";

const emptyCatalog: ModelCatalogV1 = { models: [], defaultModelId: "" };

function routeLabel(model: ModelProfileV1): string {
  return model.provider === "openai" ? "Direct OpenAI" : "OpenRouter";
}

export function ModelsRoster() {
  const [catalog, setCatalog] = useState<ModelCatalogV1>(
    apiMode === "demo" ? demoModelCatalog : emptyCatalog,
  );
  const [loaded, setLoaded] = useState(apiMode === "demo");

  useEffect(() => {
    let active = true;
    void listModels().then((nextCatalog) => {
      if (!active) return;
      setCatalog(nextCatalog);
      setLoaded(true);
    });
    return () => {
      active = false;
    };
  }, []);

  const groups = useMemo(() => {
    const byCreator = new Map<string, ModelProfileV1[]>();
    catalog.models.forEach((model) => {
      const models = byCreator.get(model.creator) ?? [];
      models.push(model);
      byCreator.set(model.creator, models);
    });
    return [...byCreator.entries()];
  }, [catalog.models]);
  const readyCount = catalog.models.filter((model) => model.availability === "available").length;

  return (
    <section className="model-roster" aria-label="Season model roster">
      <div className="model-roster-summary">
        <div>
          <small>Season roster</small>
          <strong>{loaded ? catalog.models.length : "—"}</strong>
          <span>text + code models tracked</span>
        </div>
        <div>
          <small>Playable now</small>
          <strong>{loaded ? readyCount : "—"}</strong>
          <span>production routes ready</span>
        </div>
        <div>
          <small>Fair comparison</small>
          <strong>1:1</strong>
          <span>one board per exact setup</span>
        </div>
      </div>

      {!loaded ? (
        <article className="surface model-roster-empty">
          <h2>Loading the live model roster…</h2>
        </article>
      ) : null}
      {loaded && groups.length === 0 ? (
        <article className="surface model-roster-empty">
          <h2>The model roster is between rounds.</h2>
          <p>Refresh when the live API is available.</p>
        </article>
      ) : null}

      {groups.map(([creator, models], groupIndex) => (
        <section className="model-provider-group" key={creator}>
          <header>
            <div className="model-provider-index" aria-hidden="true">
              {String(groupIndex + 1).padStart(2, "0")}
            </div>
            <div>
              <span className="eyebrow">Model provider</span>
              <h2>{creator}</h2>
            </div>
            <small>{models.length} in this season</small>
          </header>
          <div className="model-roster-grid">
            {models.map((model) => {
              const available = model.availability === "available";
              return (
                <article
                  className={`model-roster-card ${available ? "is-ready" : "is-needed"}`}
                  key={model.id}
                >
                  <div className="model-roster-card-top">
                    <span className={`route-state ${available ? "is-ready" : "is-needed"}`}>
                      {available ? "Available" : "Needs route"}
                    </span>
                    <span className="model-route-chip">{routeLabel(model)}</span>
                  </div>
                  <h3>{model.displayName}</h3>
                  <p>
                    {available
                      ? model.ranked
                        ? "Ranked Puzzle, Build, and Benchmark arenas can pin this setup."
                        : "Playable in practice while its first ranked arena is calibrated."
                      : "Tracked from Design Arena, but no approved production endpoint is available yet."}
                  </p>
                  <dl className="model-roster-specs">
                    <div>
                      <dt>Reasoning</dt>
                      <dd>{model.reasoningMode}</dd>
                    </div>
                    <div>
                      <dt>Board</dt>
                      <dd>{model.ranked ? "Ranked" : "Practice"}</dd>
                    </div>
                    <div>
                      <dt>Price season</dt>
                      <dd>{model.priceVersion === "unpriced" ? "Pending" : "Pinned"}</dd>
                    </div>
                  </dl>
                  {available ? (
                    <Link className="button button-dark" href={`/play?model=${encodeURIComponent(model.id)}`}>
                      Coach this model <span aria-hidden="true">→</span>
                    </Link>
                  ) : (
                    <span
                      className="model-route-needed"
                      aria-label={`${model.displayName} needs a provider route`}
                    >
                      Route required before play
                    </span>
                  )}
                </article>
              );
            })}
          </div>
        </section>
      ))}
    </section>
  );
}
