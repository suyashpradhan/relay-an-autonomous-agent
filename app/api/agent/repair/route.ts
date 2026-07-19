import { z } from "zod";
import { runSchedulingAgent } from "../../../../lib/agent/controller";

export const runtime = "nodejs";

const requestSchema = z.object({
  schedule: z.object({
    id: z.string().min(1),
    title: z.string().min(1),
    date: z.string().min(1),
    workingHours: z.object({
      start: z.number().int().min(0).max(1439),
      end: z.number().int().min(1).max(1440),
    }),
    items: z.array(z.discriminatedUnion("kind", [
      z.object({
        kind: z.literal("meeting"), id: z.string(), title: z.string(),
        start: z.number().int(), end: z.number().int(), fixed: z.literal(true),
      }),
      z.object({
        kind: z.literal("break"), id: z.string(), title: z.string(),
        start: z.number().int(), end: z.number().int(),
      }),
      z.object({
        kind: z.literal("task"), id: z.string(), taskId: z.string(), title: z.string(),
        start: z.number().int(), end: z.number().int(), duration: z.number().int().positive(),
        minimumDuration: z.number().int().positive(),
        priority: z.enum(["low", "medium", "high", "critical"]),
        deadline: z.number().int(), canMove: z.boolean(), canSplit: z.boolean(),
        canShorten: z.boolean(), canDefer: z.boolean(), deferred: z.boolean().optional(),
        deferredReason: z.string().optional(),
      }),
    ])),
  }),
}).strict();

export async function POST(request: Request): Promise<Response> {
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json(
      { error: "INVALID_REQUEST", message: parsed.error.issues.map((issue) => issue.message).join("; ") },
      { status: 400 },
    );
  }
  if (!process.env.OPENAI_API_KEY) {
    return Response.json(
      { error: "OPENAI_NOT_CONFIGURED", message: "OPENAI_API_KEY is not configured on the server." },
      { status: 503 },
    );
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: unknown) => controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      try {
        const result = await runSchedulingAgent(parsed.data.schedule, {
          signal: request.signal,
          onStatus: (status) => send({ type: "status", status }),
          onStep: (step) => send({ type: "step", step }),
        });
        send({ type: "complete", result });
      } catch (error) {
        send({ type: "error", message: error instanceof Error ? error.message : "Agent run failed." });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
    },
  });
}
