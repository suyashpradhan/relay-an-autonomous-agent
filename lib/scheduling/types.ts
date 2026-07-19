export type Priority = "low" | "medium" | "high" | "critical";
export type IssueSeverity = "hard" | "soft";

export interface WorkingHours {
  start: number;
  end: number;
}

export interface FixedMeeting {
  kind: "meeting";
  id: string;
  title: string;
  start: number;
  end: number;
  fixed: true;
}

export interface BreakBlock {
  kind: "break";
  id: string;
  title: string;
  start: number;
  end: number;
}

export interface FlexibleTask {
  id: string;
  title: string;
  duration: number;
  minimumDuration: number;
  priority: Priority;
  deadline: number;
  canMove: boolean;
  canSplit: boolean;
  canShorten: boolean;
  canDefer: boolean;
  scheduledStart: number;
  scheduledEnd: number;
}

export interface ScheduledTaskBlock {
  kind: "task";
  id: string;
  taskId: string;
  title: string;
  start: number;
  end: number;
  duration: number;
  minimumDuration: number;
  priority: Priority;
  deadline: number;
  canMove: boolean;
  canSplit: boolean;
  canShorten: boolean;
  canDefer: boolean;
  deferred?: boolean;
  deferredReason?: string;
}

export type ScheduleItem = FixedMeeting | BreakBlock | ScheduledTaskBlock;

export interface DaySchedule {
  id: string;
  title: string;
  date: string;
  workingHours: WorkingHours;
  items: ScheduleItem[];
}

export type IssueCode =
  | "OVERLAP"
  | "OVERLOADED"
  | "MISSING_LUNCH"
  | "DEADLINE_RISK"
  | "OUT_OF_HOURS";

export interface ScheduleIssue {
  id: string;
  code: IssueCode;
  severity: IssueSeverity;
  title: string;
  message: string;
  itemIds: string[];
  minutes?: number;
}

export interface TimeSlot {
  start: number;
  end: number;
  duration: number;
}

export interface ScheduleAnalysis {
  issues: ScheduleIssue[];
  overlaps: ScheduleIssue[];
  availableMinutes: number;
  busyMinutes: number;
  overloadedMinutes: number;
  missingLunch: boolean;
  deadlineRisks: ScheduleIssue[];
  outOfHours: ScheduleIssue[];
  freeSlots: TimeSlot[];
  healthScore: number;
}

export interface ValidationResult {
  valid: boolean;
  hardIssues: ScheduleIssue[];
  softIssues: ScheduleIssue[];
  overloadedMinutes: number;
  healthScore: number;
  summary: string;
}

export type SchedulingToolName =
  | "inspect_schedule"
  | "find_available_slots"
  | "move_task"
  | "split_task"
  | "shorten_task"
  | "defer_task"
  | "insert_break"
  | "validate_schedule";

export type ToolErrorCode =
  | "INVALID_INPUT"
  | "TASK_NOT_FOUND"
  | "FIXED_MEETING"
  | "TASK_IMMOVABLE"
  | "TASK_UNSPLITTABLE"
  | "TASK_NOT_SHORTENABLE"
  | "TASK_NOT_DEFERRABLE"
  | "BELOW_MINIMUM_DURATION"
  | "COLLISION"
  | "OUT_OF_HOURS"
  | "DEADLINE_EXCEEDED"
  | "INVALID_BLOCKS"
  | "REPEATED_FAILED_CALL";

export interface ToolResult {
  success: boolean;
  tool: SchedulingToolName;
  observation: string;
  errorCode?: ToolErrorCode;
  schedule?: DaySchedule;
  data?: unknown;
}

export type AgentRunStatus =
  | "planning"
  | "executing"
  | "observing"
  | "validating"
  | "completed"
  | "partially_completed"
  | "failed"
  | "cancelled";

export type AgentStepType = "inspection" | "tool" | "validation";

export interface AgentStep {
  sequence: number;
  type: AgentStepType;
  decisionSummary: string;
  toolName: SchedulingToolName;
  toolInput: unknown;
  toolResult: ToolResult;
  success: boolean;
  errorCode?: ToolErrorCode;
  durationMs: number;
  scheduleAfter?: DaySchedule;
}

export interface ScheduleChanges {
  moved: string[];
  split: string[];
  shortened: string[];
  deferred: string[];
  breaksInserted: string[];
}

export interface AgentRunResult {
  status: AgentRunStatus;
  model: string;
  originalSchedule: DaySchedule;
  workingSchedule: DaySchedule;
  steps: AgentStep[];
  attemptCount: number;
  unresolvedIssues: ScheduleIssue[];
  validation: ValidationResult;
  initialAnalysis: ScheduleAnalysis;
  finalAnalysis: ScheduleAnalysis;
  changes: ScheduleChanges;
  summary: string;
}
