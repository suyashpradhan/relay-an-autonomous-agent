import { z } from "zod";
import { analyzeSchedule, findFreeSlots } from "./analyzer";
import type {
  DaySchedule,
  ScheduledTaskBlock,
  SchedulingToolName,
  ToolErrorCode,
  ToolResult,
} from "./types";
import { validateSchedule } from "./validator";

export const schedulingToolSchemas = {
  inspect_schedule: z.object({}).strict(),
  find_available_slots: z
    .object({
      duration: z.number().int().positive(),
      before: z.number().int().min(0).max(1440).nullish(),
    })
    .strict(),
  move_task: z
    .object({
      taskId: z.string().min(1),
      start: z.number().int().min(0).max(1439),
    })
    .strict(),
  split_task: z
    .object({
      taskId: z.string().min(1),
      blocks: z
        .array(
          z
            .object({
              start: z.number().int().min(0).max(1439),
              duration: z.number().int().positive(),
            })
            .strict(),
        )
        .min(2),
    })
    .strict(),
  shorten_task: z
    .object({
      taskId: z.string().min(1),
      duration: z.number().int().positive(),
    })
    .strict(),
  defer_task: z
    .object({
      taskId: z.string().min(1),
      reason: z.string().min(1),
    })
    .strict(),
  insert_break: z
    .object({
      title: z.string().min(1).default("Break"),
      start: z.number().int().min(0).max(1439),
      duration: z.number().int().min(15),
    })
    .strict(),
  validate_schedule: z.object({}).strict(),
} satisfies Record<SchedulingToolName, z.ZodType>;

function reject(
  tool: SchedulingToolName,
  errorCode: ToolErrorCode,
  observation: string,
): ToolResult {
  return { success: false, tool, errorCode, observation };
}

function success(
  tool: SchedulingToolName,
  observation: string,
  schedule?: DaySchedule,
  data?: unknown,
): ToolResult {
  return { success: true, tool, observation, schedule, data };
}

function taskById(
  schedule: DaySchedule,
  id: string,
): ScheduledTaskBlock | undefined {
  return schedule.items.find(
    (item): item is ScheduledTaskBlock =>
      item.kind === "task" &&
      (item.id === id || item.taskId === id) &&
      !item.deferred,
  );
}

function collides(
  schedule: DaySchedule,
  start: number,
  end: number,
  excludedIds: string[] = [],
): boolean {
  return schedule.items.some(
    (item) =>
      !excludedIds.includes(item.id) &&
      (item.kind !== "task" || !item.deferred) &&
      start < item.end &&
      end > item.start,
  );
}

function replaceItems(
  schedule: DaySchedule,
  removedIds: string[],
  additions: DaySchedule["items"],
): DaySchedule {
  return {
    ...schedule,
    items: [
      ...schedule.items.filter((item) => !removedIds.includes(item.id)),
      ...additions,
    ],
  };
}

export function executeTool(
  name: SchedulingToolName,
  schedule: DaySchedule,
  rawInput: unknown,
): ToolResult {
  const parsed = schedulingToolSchemas[name].safeParse(rawInput);
  if (!parsed.success) {
    return reject(
      name,
      "INVALID_INPUT",
      parsed.error.issues.map((issue) => issue.message).join("; "),
    );
  }

  if (name === "inspect_schedule") {
    const analysis = analyzeSchedule(schedule);
    return success(
      name,
      `Found ${analysis.issues.length} issues with a health score of ${analysis.healthScore}.`,
      undefined,
      analysis,
    );
  }

  if (name === "find_available_slots") {
    const input = schedulingToolSchemas.find_available_slots.parse(rawInput);
    const slots = findFreeSlots(schedule, input.duration, input.before ?? undefined);
    return success(
      name,
      `Found ${slots.length} available slot${slots.length === 1 ? "" : "s"}.`,
      undefined,
      { slots },
    );
  }

  if (name === "validate_schedule") {
    const validation = validateSchedule(schedule);
    return success(name, validation.summary, undefined, validation);
  }

  if (name === "move_task") {
    const input = schedulingToolSchemas.move_task.parse(rawInput);
    const task = taskById(schedule, input.taskId);
    if (!task)
      return reject(
        name,
        "TASK_NOT_FOUND",
        `No active task matches ${input.taskId}.`,
      );
    if (!task.canMove)
      return reject(name, "TASK_IMMOVABLE", `${task.title} cannot be moved.`);
    const end = input.start + task.duration;
    if (
      input.start < schedule.workingHours.start ||
      end > schedule.workingHours.end
    ) {
      return reject(
        name,
        "OUT_OF_HOURS",
        "The proposed block falls outside working hours.",
      );
    }
    if (end > task.deadline)
      return reject(
        name,
        "DEADLINE_EXCEEDED",
        "The proposed move finishes after the task deadline.",
      );
    if (collides(schedule, input.start, end, [task.id])) {
      return reject(
        name,
        "COLLISION",
        "The proposed move overlaps another active block.",
      );
    }
    const moved = { ...task, start: input.start, end };
    return success(
      name,
      `Moved ${task.title} without changing its duration.`,
      replaceItems(schedule, [task.id], [moved]),
    );
  }

  if (name === "shorten_task") {
    const input = schedulingToolSchemas.shorten_task.parse(rawInput);
    const task = taskById(schedule, input.taskId);
    if (!task)
      return reject(
        name,
        "TASK_NOT_FOUND",
        `No active task matches ${input.taskId}.`,
      );
    if (!task.canShorten)
      return reject(
        name,
        "TASK_NOT_SHORTENABLE",
        `${task.title} cannot be shortened.`,
      );
    if (input.duration < task.minimumDuration) {
      return reject(
        name,
        "BELOW_MINIMUM_DURATION",
        `The minimum allowed duration is ${task.minimumDuration} minutes.`,
      );
    }
    if (input.duration >= task.duration) {
      return reject(
        name,
        "INVALID_INPUT",
        "The new duration must be shorter than the current duration.",
      );
    }
    const shortened = {
      ...task,
      duration: input.duration,
      end: task.start + input.duration,
    };
    return success(
      name,
      `Shortened ${task.title} to ${input.duration} minutes.`,
      replaceItems(schedule, [task.id], [shortened]),
    );
  }

  if (name === "defer_task") {
    const input = schedulingToolSchemas.defer_task.parse(rawInput);
    const task = taskById(schedule, input.taskId);
    if (!task)
      return reject(
        name,
        "TASK_NOT_FOUND",
        `No active task matches ${input.taskId}.`,
      );
    if (!task.canDefer)
      return reject(
        name,
        "TASK_NOT_DEFERRABLE",
        `${task.title} cannot be deferred.`,
      );
    const deferred = { ...task, deferred: true, deferredReason: input.reason };
    return success(
      name,
      `Deferred ${task.title}. Reason recorded: ${input.reason}.`,
      replaceItems(schedule, [task.id], [deferred]),
    );
  }

  if (name === "insert_break") {
    const input = schedulingToolSchemas.insert_break.parse(rawInput);
    const end = input.start + input.duration;
    if (
      input.start < schedule.workingHours.start ||
      end > schedule.workingHours.end
    ) {
      return reject(
        name,
        "OUT_OF_HOURS",
        "The proposed break falls outside working hours.",
      );
    }
    if (collides(schedule, input.start, end)) {
      return reject(
        name,
        "COLLISION",
        "The proposed break overlaps another active block.",
      );
    }
    const block = {
      kind: "break" as const,
      id: `break-${input.start}-${input.duration}`,
      title: input.title,
      start: input.start,
      end,
    };
    return success(
      name,
      `Inserted ${input.duration}-minute ${input.title}.`,
      replaceItems(schedule, [], [block]),
    );
  }

  const input = schedulingToolSchemas.split_task.parse(rawInput);
  const task = taskById(schedule, input.taskId);
  if (!task)
    return reject(
      name,
      "TASK_NOT_FOUND",
      `No active task matches ${input.taskId}.`,
    );
  if (!task.canSplit)
    return reject(name, "TASK_UNSPLITTABLE", `${task.title} cannot be split.`);
  const total = input.blocks.reduce((sum, block) => sum + block.duration, 0);
  if (
    total !== task.duration ||
    input.blocks.some((block) => block.duration < task.minimumDuration)
  ) {
    return reject(
      name,
      "INVALID_BLOCKS",
      `Split blocks must total ${task.duration} minutes and each be at least ${task.minimumDuration} minutes.`,
    );
  }
  for (const block of input.blocks) {
    const end = block.start + block.duration;
    if (
      block.start < schedule.workingHours.start ||
      end > schedule.workingHours.end
    ) {
      return reject(
        name,
        "OUT_OF_HOURS",
        "A proposed split block falls outside working hours.",
      );
    }
    if (end > task.deadline)
      return reject(
        name,
        "DEADLINE_EXCEEDED",
        "A proposed split block finishes after the deadline.",
      );
    if (collides(schedule, block.start, end, [task.id])) {
      return reject(
        name,
        "COLLISION",
        "A proposed split block overlaps another active block.",
      );
    }
  }
  const sortedBlocks = [...input.blocks].sort((a, b) => a.start - b.start);
  if (
    sortedBlocks.some(
      (block, index) =>
        index > 0 &&
        block.start <
          sortedBlocks[index - 1].start + sortedBlocks[index - 1].duration,
    )
  ) {
    return reject(
      name,
      "INVALID_BLOCKS",
      "The proposed split blocks overlap each other.",
    );
  }
  const additions = sortedBlocks.map((block, index) => ({
    ...task,
    id: `${task.taskId}-part-${index + 1}`,
    start: block.start,
    end: block.start + block.duration,
    duration: block.duration,
  }));
  return success(
    name,
    `Split ${task.title} into ${additions.length} blocks.`,
    replaceItems(schedule, [task.id], additions),
  );
}
