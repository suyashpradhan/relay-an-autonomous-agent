import type {
  AgentRunStatus,
  ScheduleIssue,
  SchedulingToolName,
  ToolErrorCode,
} from "../scheduling/types";

const statusLabels: Record<AgentRunStatus | "idle", string> = {
  idle: "Ready",
  planning: "Choosing the next step",
  executing: "Making a schedule change",
  observing: "Checking what happened",
  validating: "Checking the final schedule",
  completed: "Day repaired",
  partially_completed: "Best available plan",
  failed: "Run stopped",
  cancelled: "Run cancelled",
};

const toolLabels: Record<SchedulingToolName, string> = {
  inspect_schedule: "Review schedule",
  find_available_slots: "Find open time",
  move_task: "Move task",
  split_task: "Split task",
  shorten_task: "Shorten task",
  defer_task: "Move to another day",
  insert_break: "Add break",
  validate_schedule: "Check final schedule",
};

const errorLabels: Record<ToolErrorCode, string> = {
  INVALID_INPUT: "That information was not usable",
  TASK_NOT_FOUND: "Task could not be found",
  TASK_IMMOVABLE: "This task cannot be moved",
  TASK_UNSPLITTABLE: "This task cannot be split",
  TASK_NOT_SHORTENABLE: "This task cannot be shortened",
  TASK_NOT_DEFERRABLE: "This task must stay today",
  BELOW_MINIMUM_DURATION: "The task would become too short",
  COLLISION: "That time is already occupied",
  OUT_OF_HOURS: "That time is outside the workday",
  DEADLINE_EXCEEDED: "That change would miss the deadline",
  INVALID_BLOCKS: "Those time blocks do not work",
  REPEATED_FAILED_CALL: "Relay already tried that option",
  FIXED_MEETING: "Meetings are protected",
};

export function friendlyStatus(status: AgentRunStatus | "idle"): string {
  return statusLabels[status];
}

export function friendlyToolName(tool: SchedulingToolName): string {
  return toolLabels[tool];
}

export function friendlyError(errorCode?: ToolErrorCode): string | undefined {
  return errorCode ? errorLabels[errorCode] : undefined;
}

export function friendlyIssue(issue: ScheduleIssue): {
  label: string;
  title: string;
  message: string;
} {
  if (issue.code === "OVERLAP") {
    return {
      label: "Time conflict",
      title: "Two items happen at the same time",
      message: issue.message,
    };
  }
  if (issue.code === "OVERLOADED") {
    return {
      label: "Too much planned",
      title: "There is more work than the day can hold",
      message: `${issue.minutes ?? 0} minutes need to be moved, shortened, or rescheduled.`,
    };
  }
  if (issue.code === "MISSING_LUNCH") {
    return {
      label: "Break needed",
      title: "There is no protected lunch break",
      message:
        "Relay will try to protect at least 30 minutes between noon and 2 PM.",
    };
  }
  if (issue.code === "DEADLINE_RISK") {
    return {
      label: "Deadline risk",
      title: "This task may finish late",
      message: issue.message,
    };
  }
  return {
    label: "Outside workday",
    title: "This item runs past working hours",
    message: issue.message,
  };
}

export function friendlyObservation(observation: string): string {
  return observation
    .replace(
      /^Found (\d+) issues with a health score of (\d+)\.$/,
      "I found $1 schedule problems. The starting health score is $2.",
    )
    .replace(
      /^Found (\d+) available slot(s?)\.$/,
      "I found $1 open time slot$2.",
    )
    .replace(
      /^Deferred (.+)\. Reason recorded: (.+)\.$/,
      "Moved $1 to a later workday. $2",
    )
    .replace(/^Inserted (\d+)-minute (.+)\.$/, "Added a $1-minute $2.")
    .replace(
      /^The proposed move overlaps another active block\.$/,
      "That time is already occupied, so the task stayed where it was.",
    )
    .replace(
      /^The proposed break overlaps another active block\.$/,
      "That time is already occupied, so no break was added.",
    )
    .replace(
      /^The proposed block falls outside working hours\.$/,
      "That time falls outside the workday, so nothing changed.",
    )
    .replace(
      /^The proposed move finishes after the task deadline\.$/,
      "That move would finish after the deadline, so nothing changed.",
    )
    .replace(
      /^This identical call was already rejected\..*$/,
      "Relay already tried that exact option and will choose a different approach.",
    );
}
