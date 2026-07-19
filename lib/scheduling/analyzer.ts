import type {
  DaySchedule,
  ScheduledTaskBlock,
  ScheduleAnalysis,
  ScheduleIssue,
  ScheduleItem,
  TimeSlot,
} from "./types";

const LUNCH_WINDOW_START = 12 * 60;
const LUNCH_WINDOW_END = 14 * 60;
const MIN_LUNCH_MINUTES = 30;

function activeItems(schedule: DaySchedule): ScheduleItem[] {
  return schedule.items.filter((item) => item.kind !== "task" || !item.deferred);
}

function overlapMinutes(a: ScheduleItem, b: ScheduleItem): number {
  return Math.max(0, Math.min(a.end, b.end) - Math.max(a.start, b.start));
}

export function detectOverlaps(schedule: DaySchedule): ScheduleIssue[] {
  const sorted = [...activeItems(schedule)].sort((a, b) => a.start - b.start || a.end - b.end);
  const issues: ScheduleIssue[] = [];
  for (let left = 0; left < sorted.length; left += 1) {
    for (let right = left + 1; right < sorted.length; right += 1) {
      if (sorted[right].start >= sorted[left].end) break;
      const minutes = overlapMinutes(sorted[left], sorted[right]);
      if (minutes > 0) {
        issues.push({
          id: `overlap-${sorted[left].id}-${sorted[right].id}`,
          code: "OVERLAP",
          severity: "hard",
          title: "Blocks overlap",
          message: `${sorted[left].title} conflicts with ${sorted[right].title} for ${minutes} minutes.`,
          itemIds: [sorted[left].id, sorted[right].id],
          minutes,
        });
      }
    }
  }
  return issues;
}

function mergedBusyRanges(schedule: DaySchedule): Array<{ start: number; end: number }> {
  const { start: dayStart, end: dayEnd } = schedule.workingHours;
  const ranges = activeItems(schedule)
    .map((item) => ({ start: Math.max(dayStart, item.start), end: Math.min(dayEnd, item.end) }))
    .filter((range) => range.end > range.start)
    .sort((a, b) => a.start - b.start);
  return ranges.reduce<Array<{ start: number; end: number }>>((merged, range) => {
    const previous = merged.at(-1);
    if (!previous || range.start > previous.end) return [...merged, { ...range }];
    previous.end = Math.max(previous.end, range.end);
    return merged;
  }, []);
}

export function calculateAvailableTime(schedule: DaySchedule): number {
  return schedule.workingHours.end - schedule.workingHours.start;
}

export function calculateBusyTime(schedule: DaySchedule): number {
  return mergedBusyRanges(schedule).reduce((total, range) => total + range.end - range.start, 0);
}

export function calculateOverloadedMinutes(schedule: DaySchedule): number {
  const rawDemand = activeItems(schedule).reduce((total, item) => total + item.end - item.start, 0);
  return Math.max(0, rawDemand - calculateAvailableTime(schedule));
}

export function detectMissingLunch(schedule: DaySchedule): boolean {
  return !activeItems(schedule).some(
    (item) =>
      item.kind === "break" &&
      item.end - item.start >= MIN_LUNCH_MINUTES &&
      item.start < LUNCH_WINDOW_END &&
      item.end > LUNCH_WINDOW_START,
  );
}

export function detectDeadlineRisk(schedule: DaySchedule): ScheduleIssue[] {
  return activeItems(schedule)
    .filter((item): item is ScheduledTaskBlock => item.kind === "task" && item.end > item.deadline)
    .map((item) => ({
      id: `deadline-${item.id}`,
      code: "DEADLINE_RISK" as const,
      severity: "hard" as const,
      title: "Deadline at risk",
      message: `${item.title} finishes ${item.end - item.deadline} minutes after its deadline.`,
      itemIds: [item.id],
      minutes: item.end - item.deadline,
    }));
}

export function detectOutOfHours(schedule: DaySchedule): ScheduleIssue[] {
  return activeItems(schedule)
    .filter((item) => item.start < schedule.workingHours.start || item.end > schedule.workingHours.end)
    .map((item) => ({
      id: `hours-${item.id}`,
      code: "OUT_OF_HOURS" as const,
      severity: "hard" as const,
      title: "Outside working hours",
      message: `${item.title} extends beyond the configured workday.`,
      itemIds: [item.id],
    }));
}

export function findFreeSlots(schedule: DaySchedule, minimumDuration = 1, before?: number): TimeSlot[] {
  const dayStart = schedule.workingHours.start;
  const dayEnd = Math.min(schedule.workingHours.end, before ?? schedule.workingHours.end);
  const ranges = mergedBusyRanges(schedule);
  const slots: TimeSlot[] = [];
  let cursor = dayStart;
  for (const range of ranges) {
    if (range.start > cursor && range.start - cursor >= minimumDuration) {
      slots.push({ start: cursor, end: range.start, duration: range.start - cursor });
    }
    cursor = Math.max(cursor, range.end);
  }
  if (dayEnd > cursor && dayEnd - cursor >= minimumDuration) {
    slots.push({ start: cursor, end: dayEnd, duration: dayEnd - cursor });
  }
  return slots.filter((slot) => slot.start < dayEnd && slot.end <= dayEnd);
}

export function calculateHealthScore(issues: ScheduleIssue[], overloadedMinutes: number): number {
  const deductions = issues.reduce((total, issue) => {
    if (issue.code === "OVERLAP") return total + 14;
    if (issue.code === "OUT_OF_HOURS") return total + 18;
    if (issue.code === "DEADLINE_RISK") return total + 16;
    if (issue.code === "MISSING_LUNCH") return total + 8;
    return total + 10;
  }, 0);
  return Math.max(0, Math.round(100 - deductions - Math.min(25, overloadedMinutes / 6)));
}

export function analyzeSchedule(schedule: DaySchedule): ScheduleAnalysis {
  const overlaps = detectOverlaps(schedule);
  const overloadedMinutes = calculateOverloadedMinutes(schedule);
  const missingLunch = detectMissingLunch(schedule);
  const deadlineRisks = detectDeadlineRisk(schedule);
  const outOfHours = detectOutOfHours(schedule);
  const issues: ScheduleIssue[] = [...overlaps, ...deadlineRisks, ...outOfHours];
  if (overloadedMinutes > 0) {
    issues.push({
      id: "overloaded",
      code: "OVERLOADED",
      severity: "hard",
      title: "Day is over capacity",
      message: `Scheduled demand exceeds working capacity by ${overloadedMinutes} minutes.`,
      itemIds: [],
      minutes: overloadedMinutes,
    });
  }
  if (missingLunch) {
    issues.push({
      id: "missing-lunch",
      code: "MISSING_LUNCH",
      severity: "soft",
      title: "No protected lunch",
      message: "There is no 30-minute break between noon and 2 PM.",
      itemIds: [],
      minutes: MIN_LUNCH_MINUTES,
    });
  }
  return {
    issues,
    overlaps,
    availableMinutes: calculateAvailableTime(schedule),
    busyMinutes: calculateBusyTime(schedule),
    overloadedMinutes,
    missingLunch,
    deadlineRisks,
    outOfHours,
    freeSlots: findFreeSlots(schedule),
    healthScore: calculateHealthScore(issues, overloadedMinutes),
  };
}
