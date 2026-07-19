import { analyzeSchedule } from "../scheduling/analyzer";
import { executeTool } from "../scheduling/tools";
import type {
  AgentRunResult,
  AgentRunStatus,
  AgentStep,
  DaySchedule,
  ScheduledTaskBlock,
  ScheduleChanges,
  SchedulingToolName,
  ToolResult,
} from "../scheduling/types";
import { validateSchedule } from "../scheduling/validator";
import { agentToolDefinitions, isSchedulingToolName } from "./tool-definitions";

const DEFAULT_MAX_ATTEMPTS = 12;
const MODEL = process.env.OPENAI_MODEL?.trim() || "gpt-5.6-luna";

interface ModelFunctionCall {
  type: "function_call";
  call_id: string;
  name: string;
  arguments: string;
}

interface ModelMessage {
  type: "message";
  content?: Array<{ type?: string; text?: string }>;
}

interface OpenAIResponse {
  output?: Array<ModelFunctionCall | ModelMessage | { type: string }>;
  output_text?: string;
  error?: { message?: string };
}

interface ModelDecision {
  summary: string;
  toolName: SchedulingToolName;
  toolInput: unknown;
}

export interface RunAgentOptions {
  maxAttempts?: number;
  signal?: AbortSignal;
  decide?: (context: AgentDecisionContext) => Promise<ModelDecision>;
  onStep?: (step: AgentStep) => void;
  onStatus?: (status: AgentRunStatus) => void;
}

export interface AgentDecisionContext {
  originalSchedule: DaySchedule;
  workingSchedule: DaySchedule;
  steps: AgentStep[];
  attemptCount: number;
  maxAttempts: number;
}

function cloneSchedule(schedule: DaySchedule): DaySchedule {
  return structuredClone(schedule);
}

function conciseSchedule(schedule: DaySchedule): unknown {
  return {
    id: schedule.id,
    date: schedule.date,
    workingHours: schedule.workingHours,
    items: schedule.items.map((item) => ({
      ...item,
      duration: item.end - item.start,
    })),
    fixedMeetingIds: schedule.items
      .filter((item) => item.kind === "meeting")
      .map((item) => item.id),
    flexibleTasks: schedule.items
      .filter(
        (item): item is ScheduledTaskBlock =>
          item.kind === "task" && !item.deferred,
      )
      .map((item) => ({
        taskId: item.taskId,
        title: item.title,
        canMove: item.canMove,
        deadline: item.deadline,
        duration: item.duration,
      })),
  };
}

function conciseHistory(steps: AgentStep[]): unknown {
  return steps.map((step) => ({
    sequence: step.sequence,
    decisionSummary: step.decisionSummary,
    tool: step.toolName,
    input: step.toolInput,
    success: step.success,
    errorCode: step.errorCode,
    observation: step.toolResult.observation,
    data: step.toolResult.data,
  }));
}

const AGENT_INSTRUCTIONS = `You are Relay's scheduling decision controller.
You never edit or return a schedule. You choose exactly one provided function tool per turn.

Rules:
- Make the fewest, smallest changes that can satisfy deterministic validation.
- Resolve hard overlaps before soft issues such as lunch.
- Fixed meetings are immutable. IDs beginning with "google-" identify imported fixed meetings, never tasks.
- For move_task, split_task, shorten_task, and defer_task, use only a taskId listed in CURRENT_SCHEDULE.flexibleTasks. Never use an item ID from CURRENT_SCHEDULE.fixedMeetingIds.
- When an overlap contains one meeting and one task, change the task side of the overlap.
- If a tool returns FIXED_MEETING or TASK_NOT_FOUND, use data.movableTaskIds to select a valid flexible task next.
- Protect critical and high-priority hard-deadline tasks. Prefer moving/splitting/shortening lower-value work before deferring important work.
- Respect working hours and task deadlines. Insert a 30-minute lunch between 12:00 and 14:00 when possible.
- Read structured tool results. A rejected action changed nothing; change strategy after rejection.
- Never repeat an identical rejected tool call.
- Use inspect_schedule and find_available_slots when information is missing.
- Call validate_schedule before claiming completion. Only the deterministic validator can approve completion.
- Your visible text, if any, must be a single concise sentence explaining the next decision. Do not provide hidden reasoning or chain-of-thought.`;

function extractSummary(response: OpenAIResponse): string {
  if (response.output_text?.trim()) return response.output_text.trim();
  for (const item of response.output ?? []) {
    if (item.type !== "message" || !("content" in item)) continue;
    const text = item.content
      ?.map((content) => content.text ?? "")
      .join(" ")
      .trim();
    if (text) return text;
  }
  return "Selected the next deterministic scheduling action.";
}

async function requestModelDecision(
  context: AgentDecisionContext,
): Promise<ModelDecision> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not configured on the server.");
  }

  const currentSchedule = conciseSchedule(context.workingSchedule);
  const prompt = JSON.stringify({
    goal: "Repair the current workday using one tool at a time until deterministic validation succeeds.",
    attempt: context.attemptCount + 1,
    maxAttempts: context.maxAttempts,
    currentSchedule,
    originalSchedule: conciseSchedule(context.originalSchedule),
    recordedSteps: conciseHistory(context.steps),
    currentAnalysis: analyzeSchedule(context.workingSchedule),
    latestValidation: validateSchedule(context.workingSchedule),
  });

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      instructions: AGENT_INSTRUCTIONS,
      input: prompt,
      tools: agentToolDefinitions,
      tool_choice: "required",
      parallel_tool_calls: false,
      max_output_tokens: 900,
    }),
  });

  const payload = (await response.json()) as OpenAIResponse;
  if (!response.ok) {
    throw new Error(
      payload.error?.message ||
        `OpenAI request failed with status ${response.status}.`,
    );
  }
  const call = payload.output?.find(
    (item): item is ModelFunctionCall => item.type === "function_call",
  );
  if (!call) throw new Error("The model did not select a scheduling tool.");
  if (!isSchedulingToolName(call.name))
    throw new Error(`The model selected an unknown tool: ${call.name}.`);

  let toolInput: unknown;
  try {
    toolInput = JSON.parse(call.arguments);
  } catch {
    toolInput = call.arguments;
  }
  return { summary: extractSummary(payload), toolName: call.name, toolInput };
}

function createStep(
  sequence: number,
  type: AgentStep["type"],
  decisionSummary: string,
  toolName: SchedulingToolName,
  toolInput: unknown,
  toolResult: ToolResult,
  durationMs: number,
): AgentStep {
  return {
    sequence,
    type,
    decisionSummary,
    toolName,
    toolInput,
    toolResult,
    success: toolResult.success,
    errorCode: toolResult.errorCode,
    durationMs,
    scheduleAfter:
      toolResult.success && toolResult.schedule
        ? cloneSchedule(toolResult.schedule)
        : undefined,
  };
}

function scheduleChanges(
  original: DaySchedule,
  current: DaySchedule,
): ScheduleChanges {
  const originalTasks = new Map(
    original.items
      .filter((item): item is ScheduledTaskBlock => item.kind === "task")
      .map((item) => [item.taskId, item]),
  );
  const currentTasks = current.items.filter(
    (item): item is ScheduledTaskBlock => item.kind === "task",
  );
  const currentByTask = new Map<string, ScheduledTaskBlock[]>();
  for (const task of currentTasks) {
    currentByTask.set(task.taskId, [
      ...(currentByTask.get(task.taskId) ?? []),
      task,
    ]);
  }

  const moved: string[] = [];
  const split: string[] = [];
  const shortened: string[] = [];
  const deferred: string[] = [];
  for (const [taskId, before] of originalTasks) {
    const after = currentByTask.get(taskId) ?? [];
    if (after.some((task) => task.deferred)) deferred.push(before.title);
    const active = after.filter((task) => !task.deferred);
    if (active.length > 1) split.push(before.title);
    if (active.length === 1 && active[0].start !== before.start)
      moved.push(before.title);
    const activeDuration = active.reduce((sum, task) => sum + task.duration, 0);
    if (active.length > 0 && activeDuration < before.duration)
      shortened.push(before.title);
  }
  const originalBreakIds = new Set(
    original.items
      .filter((item) => item.kind === "break")
      .map((item) => item.id),
  );
  const breaksInserted = current.items
    .filter((item) => item.kind === "break" && !originalBreakIds.has(item.id))
    .map((item) => item.title);
  return { moved, split, shortened, deferred, breaksInserted };
}

function finalSummary(
  status: AgentRunStatus,
  validationSummary: string,
  attempts: number,
): string {
  if (status === "completed")
    return `Relay repaired the day in ${attempts} tool attempts. ${validationSummary}`;
  if (status === "partially_completed")
    return `Relay improved the day but reached its ${attempts}-attempt limit. ${validationSummary}`;
  return `Relay stopped before completing the repair. ${validationSummary}`;
}

export async function runSchedulingAgent(
  schedule: DaySchedule,
  options: RunAgentOptions = {},
): Promise<AgentRunResult> {
  const maxAttempts = Math.min(
    12,
    Math.max(2, options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS),
  );
  const originalSchedule = cloneSchedule(schedule);
  let workingSchedule = cloneSchedule(schedule);
  const initialAnalysis = analyzeSchedule(originalSchedule);
  const steps: AgentStep[] = [];
  const failedCalls = new Set<string>();
  let status: AgentRunStatus = "planning";
  let attemptCount = 0;
  const setStatus = (next: AgentRunStatus) => {
    status = next;
    options.onStatus?.(next);
  };

  const inspectionStarted = performance.now();
  const inspection = executeTool("inspect_schedule", workingSchedule, {});
  attemptCount += 1;
  steps.push(
    createStep(
      steps.length + 1,
      "inspection",
      "Inspect the original schedule before choosing any mutation.",
      "inspect_schedule",
      {},
      inspection,
      Math.round(performance.now() - inspectionStarted),
    ),
  );
  options.onStep?.(steps.at(-1)!);

  try {
    while (attemptCount < maxAttempts) {
      if (options.signal?.aborted) {
        setStatus("cancelled");
        break;
      }

      setStatus("planning");
      const decide = options.decide ?? requestModelDecision;
      const decision = await decide({
        originalSchedule,
        workingSchedule,
        steps,
        attemptCount,
        maxAttempts,
      });
      setStatus(
        decision.toolName === "validate_schedule" ? "validating" : "executing",
      );
      const signature = `${decision.toolName}:${JSON.stringify(decision.toolInput)}`;
      const started = performance.now();
      let result: ToolResult;

      if (failedCalls.has(signature)) {
        result = {
          success: false,
          tool: decision.toolName,
          errorCode: "REPEATED_FAILED_CALL",
          observation:
            "This identical call was already rejected. Select a different tool or different arguments.",
        };
      } else {
        result = executeTool(
          decision.toolName,
          workingSchedule,
          decision.toolInput,
        );
      }
      attemptCount += 1;
      if (!result.success) failedCalls.add(signature);
      if (result.success && result.schedule)
        workingSchedule = cloneSchedule(result.schedule);
      setStatus("observing");
      steps.push(
        createStep(
          steps.length + 1,
          decision.toolName === "validate_schedule" ? "validation" : "tool",
          decision.summary,
          decision.toolName,
          decision.toolInput,
          result,
          Math.round(performance.now() - started),
        ),
      );
      options.onStep?.(steps.at(-1)!);

      if (decision.toolName === "validate_schedule" && result.success) {
        const validation = validateSchedule(workingSchedule);
        if (validation.valid) {
          setStatus("completed");
          break;
        }
      }
    }
  } catch (error) {
    setStatus("failed");
    const message =
      error instanceof Error ? error.message : "The agent controller failed.";
    steps.push(
      createStep(
        steps.length + 1,
        "validation",
        "The controller stopped because the model request could not continue.",
        "validate_schedule",
        {},
        {
          success: false,
          tool: "validate_schedule",
          errorCode: "INVALID_INPUT",
          observation: message,
        },
        0,
      ),
    );
    options.onStep?.(steps.at(-1)!);
  }

  const validation = validateSchedule(workingSchedule);
  const terminalStatus = status as AgentRunStatus;
  if (terminalStatus !== "failed" && terminalStatus !== "cancelled") {
    setStatus(validation.valid ? "completed" : "partially_completed");
  }
  const finalAnalysis = analyzeSchedule(workingSchedule);
  return {
    status,
    model: MODEL,
    originalSchedule,
    workingSchedule,
    steps,
    attemptCount,
    unresolvedIssues: finalAnalysis.issues,
    validation,
    initialAnalysis,
    finalAnalysis,
    changes: scheduleChanges(originalSchedule, workingSchedule),
    summary: finalSummary(status, validation.summary, attemptCount),
  };
}
