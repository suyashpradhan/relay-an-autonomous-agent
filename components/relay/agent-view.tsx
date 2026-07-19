"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";
import type {
  AgentRunStatus,
  AgentStep,
  ScheduleIssue,
} from "../../lib/scheduling/types";
import { inputFields } from "../../lib/ui/adapters";
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
        <dt>Tool</dt><dd><MonoChip>{step.toolName}</MonoChip></dd>
        <dt>Validated input</dt><dd className="mono">{inputFields(step.toolInput).map((field) => <span key={field.label}>{field.label}: {field.value}</span>)}</dd>
        <dt>Result</dt><dd className={step.success ? "ok" : "bad"}>{step.success ? "Success" : "Rejected"}</dd>
        {step.errorCode ? <><dt>Error code</dt><dd><MonoChip tone="red">{step.errorCode}</MonoChip></dd></> : null}
        <dt>Observation</dt><dd>{step.toolResult.observation}</dd>
        <dt>Duration</dt><dd className="mono">{step.durationMs} ms</dd>
      </dl>
      <button onClick={() => setRaw((value) => !value)}>Technical details {raw ? "▾" : "▸"}</button>
      {!step.success ? <small>Rejection recorded — schedule not mutated</small> : null}
      {raw ? <pre>{JSON.stringify({ input: step.toolInput, result: step.toolResult }, null, 2)}</pre> : null}
    </div>
  );
}

function AgentStepCard({ step, previous, dimmed = false, active = false }: { step: AgentStep; previous?: AgentStep; dimmed?: boolean; active?: boolean }) {
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
        <button className="pp-step-head" onClick={() => setExpanded((value) => !value)}>
          <b>{category}</b>
          <MonoChip>{step.toolName}</MonoChip>
          <StatusBadge tone={step.success ? (category === "Validation" ? "blue" : "green") : "red"}>
            {step.success ? "Success" : "Rejected"}
          </StatusBadge>
          <span>{step.durationMs} ms {expanded ? "▾" : "▸"}</span>
        </button>
        <p>{step.decisionSummary}</p>
        <div className="pp-observation">{step.toolResult.observation}</div>
        <AnimatePresence initial={false}>
          {expanded ? (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="pp-expand">
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
      <header><b>Agent execution</b><span>{steps.length} recorded steps</span><small>No chain-of-thought · structured events only</small></header>
      <div>
        {steps.length === 0 ? <p className="pp-feed-empty">Waiting for the first recorded tool event…</p> : steps.map((step, index) => (
          <AgentStepCard
            key={step.sequence}
            step={step}
            previous={steps[index - 1]}
            active={playhead === step.sequence}
            dimmed={playhead !== undefined && step.sequence > playhead}
          />
        ))}
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
  const objective = issues[0]?.title ?? (status === "completed" ? "Deterministic validation approved" : "Repair the overloaded workday");
  const tone = status === "completed" ? "green" : status === "failed" ? "red" : status === "partially_completed" ? "amber" : "violet";
  return (
    <aside className="pp-run-panel">
      <section>
        <h3>Run status</h3>
        <div className="pp-status-row"><span>Status</span><StatusBadge tone={tone} dot>{status.replace("_", " ")}</StatusBadge></div>
        <div className="pp-status-row"><span>Objective</span><b>{objective}</b></div>
        <div className="pp-status-row"><span>Active tool</span>{active ? <MonoChip tone="violet">{active}</MonoChip> : <i>—</i>}</div>
        <div className="pp-status-row"><span>Attempts</span><b className="mono">{attempts} / 12</b></div>
        <div className="pp-progress"><i style={{ width: `${Math.min(100, (attempts / 12) * 100)}%` }} /></div>
      </section>
      <section>
        <h3>Current health</h3>
        <div className="pp-health-row"><HealthScore value={health} size={60} /><div><b>{health - healthStart >= 0 ? "+" : ""}{health - healthStart}</b><span>since start</span></div></div>
        <h4>Remaining issues · {issues.length}</h4>
        <ul>{issues.slice(0, 5).map((issue) => <li key={issue.id} className={issue.severity}><i />{issue.title}</li>)}</ul>
      </section>
      <section>
        <h4>Latest observation</h4>
        <p className="mono">{latest?.toolResult.observation ?? "Run has not started."}</p>
        {onCancel && !["completed", "failed", "partially_completed", "cancelled"].includes(status)
          ? <button className="pp-cancel" onClick={onCancel}>Cancel run</button>
          : null}
      </section>
    </aside>
  );
}
