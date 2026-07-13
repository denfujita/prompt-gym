import Link from "next/link";

export function Brand() {
  return (
    <Link className="brand" href="/" aria-label="Prompt Gym home">
      <span className="brand-mark" aria-hidden="true">
        PG
      </span>
      <span>PROMPT GYM</span>
    </Link>
  );
}
