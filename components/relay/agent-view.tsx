"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";
import type {
  AgentRunStatus,
  AgentStep,
  ScheduleIssue,
} from "../../lib/scheduling/types";
import { inputFields } from "../../lib/ui/adapters";
import {
  friendlyError,
  friendlyIssue,
  friendlyObservation,
  friendlyStatus,
  friendlyToolName,
} from "../../lib/ui/copy";
import { HealthScore, MonoChip, StatusBadge } from "./primitives";

function stepCategory(step: AgentStep, previous?: AgentStep): string {
  if (step.type === "inspection") return "Inspection";
  if (step.type === "validation" && step.success) return "Validation";
  if (!step.success) return "Rejection";
  if (previous && !previous.success) return "Strategy change";
  return "Tool call";
}

function ToolDetails({ step }: { step: AgentStep }) {
  const [raw, setRaw] = useState(false);
  return (
    <div className="pp-tool-details">
      <dl>
        <dt>Action</dt>
        <dd>
          <MonoChip>{friendlyToolName(step.toolName)}</MonoChip>
        </dd>
        <dt>Details used</dt>
        <dd className="mono">
          {inputFields(step.toolInput).map((field) => (
            <span key={field.label}>
              {field.label}: {field.value}
            </span>
          ))}
        </dd>
        <dt>Outcome</dt>
        <dd className={step.success ? "ok" : "bad"}>
          {step.success ? "Worked" : "Could not apply"}
        </dd>
        {step.errorCode ? (
          <>
            <dt>Why it stopped</dt>
            <dd>{friendlyError(step.errorCode)}</dd>
          </>
        ) : null}
        <dt>What happened</dt>
        <dd>{friendlyObservation(step.toolResult.observation)}</dd>
        <dt>Time taken</dt>
        <dd className="mono">{step.durationMs} ms</dd>
      </dl>
      <button onClick={() => setRaw((value) => !value)}>
        Technical details {raw ? "▾" : "▸"}
      </button>
      {!step.success ? <small>Nothing on the schedule changed</small> : null}
      {raw ? (
        <pre>
          {JSON.stringify(
            { input: step.toolInput, result: step.toolResult },
            null,
            2,
          )}
        </pre>
      ) : null}
    </div>
  );
}

function AgentStepCard({
  step,
  previous,
  dimmed = false,
  active = false,
}: {
  step: AgentStep;
  previous?: AgentStep;
  dimmed?: boolean;
  active?: boolean;
}) {
  const [expanded, setExpanded] = useState(!step.success);
  const category = stepCategory(step, previous);
  return (
    <motion.article
      initial={!step.success ? { x: 0 } : false}
      animate={!step.success ? { x: [0, -4, 4, 0] } : {}}
      transition={{ duration: 0.15 }}
      className={`pp-agent-step ${step.success ? "success" : "rejected"} ${active ? "active" : ""} ${dimmed ? "dimmed" : ""}`}
    >
      <span className="pp-step-seq">{step.sequence}</span>
      <span className="pp-step-icon">{step.success ? "✓" : "×"}</span>
      <div>
        <button
          className="pp-step-head"
          onClick={() => setExpanded((value) => !value)}
        >
          <b>{category}</b>
          <MonoChip>{friendlyToolName(step.toolName)}</MonoChip>
          <StatusBadge
            tone={
              step.success
                ? category === "Validation"
                  ? "blue"
                  : "green"
                : "red"
            }
          >
            {step.success ? "Done" : "Didn’t work"}
          </StatusBadge>
          <span>
            {step.durationMs} ms {expanded ? "▾" : "▸"}
          </span>
        </button>
        <p>{step.decisionSummary}</p>
        <div className="pp-observation">
          {friendlyObservation(step.toolResult.observation)}
        </div>
        <AnimatePresence initial={false}>
          {expanded ? (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="pp-expand"
            >
              <ToolDetails step={step} />
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
    </motion.article>
  );
}

export function AgentExecutionFeed({
  steps,
  playhead,
}: {
  steps: AgentStep[];
  playhead?: number;
}) {
  return (
    <section className="pp-agent-feed">
      <header>
        <b>What Relay is doing</b>
        <span>{steps.length} steps</span>
        <small>Only real actions and results are shown</small>
      </header>
      <div>
        {steps.length === 0 ? (
          <p className="pp-feed-empty">
            Relay is reviewing your day and choosing the first step…
          </p>
        ) : (
          steps.map((step, index) => (
            <AgentStepCard
              key={step.sequence}
              step={step}
              previous={steps[index - 1]}
              active={playhead === step.sequence}
              dimmed={playhead !== undefined && step.sequence > playhead}
            />
          ))
        )}
      </div>
    </section>
  );
}

export function RunStatusPanel({
  status,
  attempts,
  health,
  healthStart,
  issues,
  steps,
  onCancel,
}: {
  status: AgentRunStatus | "idle";
  attempts: number;
  health: number;
  healthStart: number;
  issues: ScheduleIssue[];
  steps: AgentStep[];
  onCancel?: () => void;
}) {
  const latest = steps.at(-1);
  const active = latest?.toolName;
  const objective = issues[0]
    ? friendlyIssue(issues[0]).title
    : status === "completed"
      ? "The schedule passed every required check"
      : "Make the day realistic and conflict-free";
  const tone =
    status === "completed"
      ? "green"
      : status === "failed"
        ? "red"
        : status === "partially_completed"
          ? "amber"
          : "violet";
  return (
    <aside className="pp-run-panel">
      <section>
        <h3>Progress</h3>
        <div className="pp-status-row">
          <span>Right now</span>
          <StatusBadge tone={tone} dot>
            {friendlyStatus(status)}
          </StatusBadge>
        </div>
        <div className="pp-status-row">
          <span>Current goal</span>
          <b>{objective}</b>
        </div>
        <div className="pp-status-row">
          <span>Action</span>
          {active ? (
            <MonoChip tone="violet">{friendlyToolName(active)}</MonoChip>
          ) : (
            <i>Waiting</i>
          )}
        </div>
        <div className="pp-status-row">
          <span>Steps used</span>
          <b className="mono">{attempts} of 12</b>
        </div>
        <div className="pp-progress">
          <i style={{ width: `${Math.min(100, (attempts / 12) * 100)}%` }} />
        </div>
      </section>
      <section>
        <h3>Schedule health</h3>
        <div className="pp-health-row">
          <HealthScore value={health} size={60} />
          <div>
            <b>
              {health - healthStart >= 0 ? "+" : ""}
              {health - healthStart}
            </b>
            <span>points improved</span>
          </div>
        </div>
        <h4>Still to solve · {issues.length}</h4>
        <ul>
          {issues.slice(0, 5).map((issue) => (
            <li key={issue.id} className={issue.severity}>
              <i />
              {friendlyIssue(issue).title}
            </li>
          ))}
        </ul>
      </section>
      <section>
        <h4>Latest update</h4>
        <p>
          {latest
            ? friendlyObservation(latest.toolResult.observation)
            : "Relay is getting ready to review the schedule."}
        </p>
        {onCancel &&
        !["completed", "failed", "partially_completed", "cancelled"].includes(
          status,
        ) ? (
          <button className="pp-cancel" onClick={onCancel}>
            Cancel run
          </button>
        ) : null}
      </section>
    </aside>
  );
}
