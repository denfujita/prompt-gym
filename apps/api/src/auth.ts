import { verifyToken } from "@clerk/backend";
import type { FastifyRequest } from "fastify";
import { PromptGymError } from "@prompt-gym/core";

export interface AuthContext {
  userId: string;
  publicHandle?: string;
  eligible: boolean;
}
export interface AuthResolver {
  optional(request: FastifyRequest): Promise<AuthContext | undefined>;
  required(request: FastifyRequest): Promise<AuthContext>;
}

export class ClerkAuthResolver implements AuthResolver {
  constructor(
    private readonly secretKey: string,
    private readonly authorizedParties: string[] = [],
  ) {}
  async optional(request: FastifyRequest): Promise<AuthContext | undefined> {
    const header = request.headers.authorization;
    if (!header?.startsWith("Bearer ")) return undefined;
    try {
      const payload = await verifyToken(header.slice(7), {
        secretKey: this.secretKey,
        ...(this.authorizedParties.length ? { authorizedParties: this.authorizedParties } : {}),
      });
      const claims = payload as unknown as Record<string, unknown>;
      return {
        userId: payload.sub,
        ...(typeof claims.public_handle === "string" ? { publicHandle: claims.public_handle } : {}),
        eligible: claims.pg_eligible === true,
      };
    } catch {
      throw new PromptGymError("AUTH_REQUIRED", "Sign in to play", 401);
    }
  }
  async required(request: FastifyRequest): Promise<AuthContext> {
    const auth = await this.optional(request);
    if (!auth) throw new PromptGymError("AUTH_REQUIRED", "Sign in to play", 401);
    return auth;
  }
}

export class HeaderAuthResolver implements AuthResolver {
  constructor(private readonly allowDemoHeaders = false) {}
  async optional(request: FastifyRequest): Promise<AuthContext | undefined> {
    if (!this.allowDemoHeaders) return undefined;
    const raw = request.headers["x-prompt-gym-user"];
    const userId = typeof raw === "string" ? raw : undefined;
    return userId ? { userId, eligible: true } : undefined;
  }
  async required(request: FastifyRequest): Promise<AuthContext> {
    const auth = await this.optional(request);
    if (!auth) throw new PromptGymError("AUTH_REQUIRED", "Sign in to play", 401);
    return auth;
  }
}
