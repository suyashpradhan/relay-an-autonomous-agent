import { schedulingToolSchemas } from "../scheduling/tools";
import type { SchedulingToolName } from "../scheduling/types";

const descriptions: Record<SchedulingToolName, string> = {
  inspect_schedule: "Inspect the current schedule and return deterministic issues, capacity, free slots, and health score. Does not mutate.",
  find_available_slots: "Find collision-free slots of at least the requested duration, optionally before a deadline. Does not mutate.",
  move_task: "Move one movable flexible task to a new start time without changing its duration.",
  split_task: "Replace one splittable task with two or more non-overlapping blocks whose durations exactly equal the original duration.",
  shorten_task: "Shorten one eligible task without going below its minimum duration.",
  defer_task: "Remove one deferrable task from active demand and record the reason.",
  insert_break: "Insert a break into a collision-free time range within working hours.",
  validate_schedule: "Run the independent deterministic validator. Only a valid result permits completion.",
};

const emptyObject = {
  type: "object",
  properties: {},
  required: [],
  additionalProperties: false,
};

const parameters: Record<SchedulingToolName, Record<string, unknown>> = {
  inspect_schedule: emptyObject,
  find_available_slots: {
    type: "object",
    properties: {
      duration: { type: "integer", minimum: 1 },
      before: { type: "integer", minimum: 0, maximum: 1440 },
    },
    required: ["duration"],
    additionalProperties: false,
  },
  move_task: {
    type: "object",
    properties: {
      taskId: { type: "string", minLength: 1 },
      start: { type: "integer", minimum: 0, maximum: 1439 },
    },
    required: ["taskId", "start"],
    additionalProperties: false,
  },
  split_task: {
    type: "object",
    properties: {
      taskId: { type: "string", minLength: 1 },
      blocks: {
        type: "array",
        minItems: 2,
        items: {
          type: "object",
          properties: {
            start: { type: "integer", minimum: 0, maximum: 1439 },
            duration: { type: "integer", minimum: 1 },
          },
          required: ["start", "duration"],
          additionalProperties: false,
        },
      },
    },
    required: ["taskId", "blocks"],
    additionalProperties: false,
  },
  shorten_task: {
    type: "object",
    properties: {
      taskId: { type: "string", minLength: 1 },
      duration: { type: "integer", minimum: 1 },
    },
    required: ["taskId", "duration"],
    additionalProperties: false,
  },
  defer_task: {
    type: "object",
    properties: {
      taskId: { type: "string", minLength: 1 },
      reason: { type: "string", minLength: 1 },
    },
    required: ["taskId", "reason"],
    additionalProperties: false,
  },
  insert_break: {
    type: "object",
    properties: {
      title: { type: "string", minLength: 1 },
      start: { type: "integer", minimum: 0, maximum: 1439 },
      duration: { type: "integer", minimum: 15 },
    },
    required: ["title", "start", "duration"],
    additionalProperties: false,
  },
  validate_schedule: emptyObject,
};

export interface AgentToolDefinition {
  type: "function";
  name: SchedulingToolName;
  description: string;
  parameters: Record<string, unknown>;
  strict: true;
}

export const agentToolDefinitions: AgentToolDefinition[] = (
  Object.keys(schedulingToolSchemas) as SchedulingToolName[]
).map((name) => ({
  type: "function",
  name,
  description: descriptions[name],
  parameters: parameters[name],
  strict: true,
}));

export function isSchedulingToolName(value: string): value is SchedulingToolName {
  return Object.hasOwn(schedulingToolSchemas, value);
}
