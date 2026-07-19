import assert from "node:assert/strict";
import test from "node:test";
import { runSchedulingAgent } from "../lib/agent/controller";
import { demoScenarios } from "../lib/scheduling/scenarios";
import type { SchedulingToolName } from "../lib/scheduling/types";

test("Product Launch Day recovers from a rejected move and reaches validator approval", async () => {
  const decisions: Array<{ summary: string; toolName: SchedulingToolName; toolInput: unknown }> = [
    {
      summary: "Try moving the launch deck into the first apparent focus window.",
      toolName: "move_task",
      toolInput: { taskId: "launch-deck", start: 600 },
    },
    {
      summary: "The full block does not fit, so reduce it to its allowed minimum.",
      toolName: "shorten_task",
      toolInput: { taskId: "launch-deck", duration: 60 },
    },
    {
      summary: "Move the shorter launch deck between fixed meetings.",
      toolName: "move_task",
      toolInput: { taskId: "launch-deck", start: 585 },
    },
    {
      summary: "The release notes cannot meet their deadline around fixed meetings.",
      toolName: "defer_task",
      toolInput: { taskId: "release-notes", reason: "No valid slot remains before the hard deadline." },
    },
    {
      summary: "Reduce final QA to its permitted minimum.",
      toolName: "shorten_task",
      toolInput: { taskId: "qa-pass", duration: 60 },
    },
    {
      summary: "Move final QA into the open afternoon window.",
      toolName: "move_task",
      toolInput: { taskId: "qa-pass", start: 855 },
    },
    {
      summary: "Defer the low-priority backlog to protect launch work.",
      toolName: "defer_task",
      toolInput: { taskId: "backlog-groom", reason: "Protect critical launch tasks and working hours." },
    },
    {
      summary: "Protect a lunch break in the newly opened slot.",
      toolName: "insert_break",
      toolInput: { title: "Lunch", start: 720, duration: 30 },
    },
    {
      summary: "Ask the deterministic validator for final approval.",
      toolName: "validate_schedule",
      toolInput: {},
    },
  ];

  const result = await runSchedulingAgent(demoScenarios[0].schedule, {
    maxAttempts: 12,
    decide: async () => {
      const decision = decisions.shift();
      if (!decision) throw new Error("The test decision queue was exhausted.");
      return decision;
    },
  });

  assert.equal(
    result.status,
    "completed",
    JSON.stringify({
      validation: result.validation,
      steps: result.steps.map((step) => ({
        tool: step.toolName,
        success: step.success,
        error: step.errorCode,
        observation: step.toolResult.observation,
      })),
    }),
  );
  assert.equal(result.validation.valid, true);
  assert.equal(result.finalAnalysis.overlaps.length, 0);
  assert.equal(result.finalAnalysis.overloadedMinutes, 0);
  assert.ok(result.steps.some((step) => step.success === false && step.errorCode === "COLLISION"));
  assert.ok(result.steps.some((step) => step.success && step.toolName === "shorten_task"));
  assert.equal(result.steps.at(-1)?.toolName, "validate_schedule");
  assert.deepEqual(result.changes.breaksInserted, ["Lunch"]);
});
