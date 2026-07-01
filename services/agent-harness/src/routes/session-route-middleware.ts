import type { FastifyReply, FastifyRequest } from "fastify";
import {
  ANONYMOUS_USER_ID,
  parseBearerToken,
  type Condition,
  type SessionIntent,
  type TrackSeed,
} from "@auracle/shared";
import type { MemoryServiceClient } from "@auracle/clients";
import { parseSessionIntent } from "../session/lifecycle/create.js";
import type { SessionRuntime } from "../session/runtime.js";
import type { ToolCall } from "../session/tool-runner.js";

interface SessionRouteMiddlewareDeps {
  harness: SessionRuntime;
  memory: MemoryServiceClient;
}

interface OwnedSessionContext<Body> {
  id: string;
  body: Body;
}

interface CreateSessionContext {
  intent: SessionIntent & { condition?: Condition; seeds?: TrackSeed[] };
  userId: string;
}

interface ToolCallContext {
  id: string;
  call: ToolCall;
}

type CreateSessionHandler = (ctx: CreateSessionContext) => Promise<unknown> | unknown;
type SessionReadHandler<Result> = (id: string) => Promise<Result | undefined> | Result | undefined;
type ToolCallHandler = (ctx: ToolCallContext) => Promise<unknown | undefined> | unknown | undefined;
type OwnedSessionHandler<Body> = (ctx: OwnedSessionContext<Body>) => Promise<unknown | undefined> | unknown | undefined;
type OwnedOkHandler<Body> = (ctx: OwnedSessionContext<Body>) => Promise<boolean | undefined> | boolean | undefined;

export interface SessionRouteMiddleware {
  create(req: FastifyRequest, reply: FastifyReply, handler: CreateSessionHandler): Promise<unknown>;
  read<Result>(req: FastifyRequest, reply: FastifyReply, handler: SessionReadHandler<Result>): Promise<unknown>;
  tool(req: FastifyRequest, reply: FastifyReply, handler: ToolCallHandler): Promise<unknown>;
  owned<Body>(req: FastifyRequest, reply: FastifyReply, handler: OwnedSessionHandler<Body>): Promise<unknown>;
  ownedOk<Body>(req: FastifyRequest, reply: FastifyReply, handler: OwnedOkHandler<Body>): Promise<unknown>;
}

export function createSessionRouteMiddleware(deps: SessionRouteMiddlewareDeps): SessionRouteMiddleware {
  return {
    async create(req: FastifyRequest, reply: FastifyReply, handler: CreateSessionHandler) {
      const body = (req.body ?? {}) as Partial<SessionIntent> & { condition?: Condition; seeds?: TrackSeed[] };
      const intent = parseSessionIntent(body);
      if (!intent) return reply.code(400).send({ error: "mood and scene are required" });

      const token = parseBearerToken(req.headers.authorization);
      const resolved = await deps.memory.resolveSessionUser(token);
      if (resolved.kind === "invalid_token") {
        return reply.code(401).send({ error: "invalid or expired token" });
      }
      return handler({
        intent: body as SessionIntent & { condition?: Condition; seeds?: TrackSeed[] },
        userId: resolved.userId,
      });
    },

    async read<Result>(req: FastifyRequest, reply: FastifyReply, handler: SessionReadHandler<Result>) {
      const { id } = req.params as { id: string };
      const result = await handler(id);
      if (result === undefined) return reply.code(404).send({ error: "session not found" });
      return result;
    },

    async tool(req: FastifyRequest, reply: FastifyReply, handler: ToolCallHandler) {
      const { id } = req.params as { id: string };
      const body = (req.body ?? {}) as Partial<ToolCall>;
      if (!body.name) return reply.code(400).send({ error: "tool name is required" });

      const result = await handler({ id, call: { name: body.name, args: body.args } });
      if (result === undefined) return reply.code(404).send({ error: "session not found" });
      return result;
    },

    async owned<Body>(req: FastifyRequest, reply: FastifyReply, handler: OwnedSessionHandler<Body>) {
      const { id } = req.params as { id: string };
      if (!(await ensureOwner(deps, req, reply, id))) return reply;
      const result = await handler({ id, body: (req.body ?? {}) as Body });
      if (result === undefined) return reply.code(404).send({ error: "session not found" });
      return result;
    },

    async ownedOk<Body>(req: FastifyRequest, reply: FastifyReply, handler: OwnedOkHandler<Body>) {
      const { id } = req.params as { id: string };
      if (!(await ensureOwner(deps, req, reply, id))) return reply;
      const ok = await handler({ id, body: (req.body ?? {}) as Body });
      if (!ok) return reply.code(404).send({ error: "session not found" });
      return { ok: true };
    },
  };
}

/**
 * Ownership guard for client-facing /sessions/:id/* routes (issue #55). A
 * session bound to an authenticated user may only be operated by that user's
 * Bearer token. Guest sessions (anonymous owner) carry no binding and stay
 * open. A superseded id answers 410 Gone so the old device gets a clear
 * signal; an unknown id stays 404. The internal proxy->harness /tool path is
 * exempt because it never crosses this helper.
 */
async function ensureOwner(deps: SessionRouteMiddlewareDeps, req: FastifyRequest, reply: FastifyReply, id: string): Promise<boolean> {
  const owner = deps.harness.sessionOwner(id);
  if (owner === undefined) {
    const reason = deps.harness.invalidationReason(id);
    if (reason) reply.code(410).send({ error: "session superseded", reason });
    else reply.code(404).send({ error: "session not found" });
    return false;
  }
  if (owner === ANONYMOUS_USER_ID) return true;

  const token = parseBearerToken(req.headers.authorization);
  const resolved = await deps.memory.resolveSessionUser(token);
  if (resolved.kind !== "authenticated" || resolved.userId !== owner) {
    reply.code(403).send({ error: "forbidden" });
    return false;
  }
  return true;
}
