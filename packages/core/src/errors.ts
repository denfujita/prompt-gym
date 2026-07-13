export type PromptGymErrorCode =
  | "AUTH_REQUIRED"
  | "NOT_FOUND"
  | "INVALID_INPUT"
  | "CONFLICT"
  | "ENERGY_EXHAUSTED"
  | "RUN_ACTIVE"
  | "ATTEMPT_CLOSED"
  | "PROMPT_LIMIT"
  | "TOKEN_BUDGET"
  | "COST_BUDGET"
  | "GLOBAL_CIRCUIT_OPEN"
  | "PROVIDER_AMBIGUOUS"
  | "PROVIDER_ERROR"
  | "CHALLENGE_ERROR";

export class PromptGymError extends Error {
  readonly name = "PromptGymError";
  constructor(
    readonly code: PromptGymErrorCode,
    readonly publicMessage: string,
    readonly statusCode: number,
    readonly retryable = false,
    readonly details?: Record<string, unknown>,
  ) {
    super(publicMessage);
  }
}
