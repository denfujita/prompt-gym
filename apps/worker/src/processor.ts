import type { Job } from "bullmq";

export interface RunTurnJob {
  turnId: string;
}

export function createJobProcessor(input: { processTurn(turnId: string): Promise<void> }) {
  return async (job: Job<RunTurnJob, void, "run-turn">): Promise<void> => {
    if (job.name !== "run-turn" || typeof job.data?.turnId !== "string" || !job.data.turnId)
      throw new Error("Malformed run-turn job");
    await input.processTurn(job.data.turnId);
  };
}
