import { formatTokens } from "@/lib/format";

export function TokenMeter({ tokens, limit = 20_000 }: { tokens: number; limit?: number }) {
  const progress = Math.min(100, Math.max(0, (tokens / limit) * 100));
  return (
    <div className="token-meter" aria-label={`${formatTokens(tokens)} of ${formatTokens(limit)} token limit`}>
      <div className="token-meter-label">
        <span>Tokens so far</span>
        <strong aria-live="polite">{formatTokens(tokens)}</strong>
      </div>
      <div className="meter-track" aria-hidden="true">
        <span style={{ width: `${progress}%` }} />
      </div>
      <div className="token-meter-foot">
        <span>Lower is better</span>
        <span>{formatTokens(limit)} max</span>
      </div>
    </div>
  );
}
