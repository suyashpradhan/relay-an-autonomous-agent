import { analyzeSchedule } from "../scheduling/analyzer";
import type {
  AgentRunResult,
  AgentStep,
  DaySchedule,
  ScheduleAnalysis,
  ScheduleItem,
  SchedulingToolName,
} from "../scheduling/types";

export interface DisplayBlock {
  id: string;
  kind: ScheduleItem["kind"];
  title: string;
  start: number;
  end: number;
  tag?: string;
  note?: string;
  conflicted: boolean;
  lane: "full" | "left" | "right";
  deferred: boolean;
}

export interface DisplayConflict {
  id: string;
  start: number;
  end: number;
  label: string;
}

export interface ScheduleDisplay {
  blocks: DisplayBlock[];
  deferred: DisplayBlock[];
  conflicts: DisplayConflict[];
}

export interface ScenarioDisplay {
  id: string;
  name: string;
  description: string;
  healthScore: number;
  meetingCount: number;
  taskCount: number;
  overloadedMinutes: number;
  mainIssues: string[];
  segments: Array<{ kind: "meeting" | "task"; left: number; width: number }>;
  conflicts: Array<{ left: number; width: number }>;
}

export function formatTime(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  const suffix = hours >= 12 ? "PM" : "AM";
  return `${hours % 12 || 12}:${mins.toString().padStart(2, "0")} ${suffix}`;
}

export function formatRange(start: number, end: number): string {
  return `${formatTime(start)}–${formatTime(end)}`;
}

export function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  if (!hours) return `${remainder}m`;
  return remainder ? `${hours}h ${remainder}m` : `${hours}h`;
}

export function scheduleDisplay(
  schedule: DaySchedule,
  analysis: ScheduleAnalysis = analyzeSchedule(schedule),
  run?: AgentRunResult | null,
): ScheduleDisplay {
  const conflictIds = new Set(analysis.overlaps.flatMap((issue) => issue.itemIds));
  const laneById = new Map<string, "left" | "right">();
  for (const issue of analysis.overlaps) {
    if (issue.itemIds[0] && !laneById.has(issue.itemIds[0])) laneById.set(issue.itemIds[0], "left");
    if (issue.itemIds[1] && !laneById.has(issue.itemIds[1])) laneById.set(issue.itemIds[1], "right");
  }
  const splitTaskIds = new Set(
    schedule.items
      .filter((item) => item.kind === "task")
      .map((item) => item.taskId)
      .filter((taskId, index, all) => all.indexOf(taskId) !== index),
  );
  const originalByTask = new Map(
    run?.originalSchedule.items
      .filter((item) => item.kind === "task")
      .map((item) => [item.taskId, item]) ?? [],
  );

  const display = schedule.items.map((item): DisplayBlock => {
    const deferred = item.kind === "task" && Boolean(item.deferred);
    const before = item.kind === "task" ? originalByTask.get(item.taskId) : undefined;
    let tag: string | undefined;
    if (deferred) tag = "DEFERRED";
    else if (item.kind === "break" && run && !run.originalSchedule.items.some((original) => original.id === item.id)) tag = "NEW";
    else if (item.kind === "task" && splitTaskIds.has(item.taskId)) tag = "SPLIT";
    else if (item.kind === "task" && before && before.start !== item.start) tag = "MOVED";
    else if (item.kind === "task" && before && before.duration > item.duration) tag = "SHORTENED";
    return {
      id: item.id,
      kind: item.kind,
      title: item.title,
      start: item.start,
      end: item.end,
      tag,
      note: item.kind === "task"
        ? `${item.priority.toUpperCase()} · due ${formatTime(item.deadline)}`
        : item.kind === "meeting"
          ? "Fixed meeting"
          : "Protected break",
      conflicted: conflictIds.has(item.id),
      lane: laneById.get(item.id) ?? "full",
      deferred,
    };
  });

  const conflicts = analysis.overlaps.map((issue) => {
    const items = issue.itemIds
      .map((id) => schedule.items.find((item) => item.id === id))
      .filter((item): item is ScheduleItem => Boolean(item));
    return {
      id: issue.id,
      start: Math.max(...items.map((item) => item.start)),
      end: Math.min(...items.map((item) => item.end)),
      label: `${issue.minutes ?? 0}m conflict`,
    };
  });
  return {
    blocks: display.filter((block) => !block.deferred),
    deferred: display.filter((block) => block.deferred),
    conflicts,
  };
}

export function scenarioDisplay(
  schedule: DaySchedule,
  name: string,
  description: string,
): ScenarioDisplay {
  const analysis = analyzeSchedule(schedule);
  const span = schedule.workingHours.end - schedule.workingHours.start;
  return {
    id: schedule.id,
    name,
    description,
    healthScore: analysis.healthScore,
    meetingCount: schedule.items.filter((item) => item.kind === "meeting").length,
    taskCount: schedule.items.filter((item) => item.kind === "task").length,
    overloadedMinutes: analysis.overloadedMinutes,
    mainIssues: analysis.issues.slice(0, 3).map((issue) => issue.title),
    segments: schedule.items
      .filter((item): item is ScheduleItem & { kind: "meeting" | "task" } => item.kind === "meeting" || item.kind === "task")
      .map((item) => ({
        kind: item.kind,
        left: ((item.start - schedule.workingHours.start) / span) * 100,
        width: ((item.end - item.start) / span) * 100,
      })),
    conflicts: analysis.overlaps.map((issue) => {
      const items = issue.itemIds
        .map((id) => schedule.items.find((item) => item.id === id))
        .filter((item): item is ScheduleItem => Boolean(item));
      const start = Math.max(...items.map((item) => item.start));
      const end = Math.min(...items.map((item) => item.end));
      return {
        left: ((start - schedule.workingHours.start) / span) * 100,
        width: ((end - start) / span) * 100,
      };
    }),
  };
}

export function replaySchedule(run: AgentRunResult, stepIndex: number): DaySchedule {
  let schedule = structuredClone(run.originalSchedule);
  for (const step of run.steps.slice(0, stepIndex + 1)) {
    if (step.success && step.scheduleAfter) schedule = structuredClone(step.scheduleAfter);
  }
  return schedule;
}

export function activeTool(steps: AgentStep[]): SchedulingToolName | undefined {
  return steps.at(-1)?.toolName;
}

export function inputFields(input: unknown): Array<{ label: string; value: string }> {
  if (typeof input !== "object" || input === null) return [{ label: "value", value: String(input) }];
  return Object.entries(input).map(([label, value]) => ({
    label,
    value: typeof value === "object" ? JSON.stringify(value) : String(value),
  }));
}
