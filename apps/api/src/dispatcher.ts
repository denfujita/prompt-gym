import { Queue, type ConnectionOptions } from "bullmq";
import type { RunDispatcher } from "@prompt-gym/core";

function redisConnection(redisUrl: string): ConnectionOptions {
  const url = new URL(redisUrl);
  return {
    host: url.hostname,
    port: Number(url.port || 6379),
    ...(url.username ? { username: decodeURIComponent(url.username) } : {}),
    ...(url.password ? { password: decodeURIComponent(url.password) } : {}),
    ...(url.pathname.length > 1 ? { db: Number(url.pathname.slice(1)) } : {}),
    ...(url.protocol === "rediss:" ? { tls: {} } : {}),
  };
}

export class BullMqRunDispatcher implements RunDispatcher {
  readonly queue: Queue;
  constructor(redisUrl: string, queueName = "prompt-gym-runs") {
    this.queue = new Queue(queueName, { connection: redisConnection(redisUrl) });
  }
  async dispatchTurn(turnId: string): Promise<void> {
    const existing = await this.queue.getJob(turnId);
    if (existing) {
      const state = await existing.getState();
      if (state === "completed" || state === "failed") await existing.remove();
      else return;
    }
    await this.queue.add(
      "run-turn",
      { turnId },
      { jobId: turnId, attempts: 1, removeOnComplete: 500, removeOnFail: 1_000 },
    );
  }
  async close(): Promise<void> {
    await this.queue.close();
  }
}
