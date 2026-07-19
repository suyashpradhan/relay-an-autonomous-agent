import { analyzeSchedule } from "./analyzer";
import type { DaySchedule, ValidationResult } from "./types";

export function validateSchedule(schedule: DaySchedule): ValidationResult {
  const analysis = analyzeSchedule(schedule);
  const hardIssues = analysis.issues.filter((issue) => issue.severity === "hard");
  const softIssues = analysis.issues.filter((issue) => issue.severity === "soft");
  const valid = hardIssues.length === 0 && analysis.overloadedMinutes === 0;
  const summary = valid
    ? softIssues.length === 0
      ? "All deterministic constraints are satisfied."
      : `All hard constraints pass; ${softIssues.length} soft issue remains.`
    : `${hardIssues.length} hard issue${hardIssues.length === 1 ? "" : "s"} must be resolved before completion.`;
  return {
    valid,
    hardIssues,
    softIssues,
    overloadedMinutes: analysis.overloadedMinutes,
    healthScore: analysis.healthScore,
    summary,
  };
}
