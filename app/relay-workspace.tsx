"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeft, CalendarDays, Check, Link2, ListPlus, Play, Sparkles } from "lucide-react";
import { AgentExecutionFeed, RunStatusPanel } from "../components/relay/agent-view";
import { AppHeader, Button, EmptyState, HealthScore, StatusBadge } from "../components/relay/primitives";
import { FinalResults, ReplayControls, type ReplaySpeed } from "../components/relay/results-view";
import { DeferredTasks, ScheduleTimeline } from "../components/relay/schedule-view";
import { analyzeSchedule } from "../lib/scheduling/analyzer";
import { demoScenarios } from "../lib/scheduling/scenarios";
import type {
  AgentRunResult,
  AgentRunStatus,
  AgentStep,
  DaySchedule,
  Priority,
  ScheduleItem,
} from "../lib/scheduling/types";
import { validateSchedule } from "../lib/scheduling/validator";
import {
  activeTool,
  formatDuration,
  formatRange,
  replaySchedule,
  scenarioDisplay,
} from "../lib/ui/adapters";

type Screen = "entry" | "scenarios" | "manual" | "review" | "running" | "final" | "replay" | "connect";

interface StreamEvent {
  type: "status" | "step" | "complete" | "error";
  status?: AgentRunStatus;
  step?: AgentStep;
  result?: AgentRunResult;
  message?: string;
}

function countMinutes(schedule: DaySchedule, kind: ScheduleItem["kind"]): number {
  return schedule.items
    .filter((item) => item.kind === kind && (item.kind !== "task" || !item.deferred))
    .reduce((sum, item) => sum + item.end - item.start, 0);
}

function EntryCard({
  icon,
  title,
  copy,
  action,
  primary,
  badge,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  copy: string;
  action: string;
  primary?: boolean;
  badge?: string;
  onClick: () => void;
}) {
  return (
    <article className={`pp-entry-card ${primary ? "primary" : ""}`}>
      {badge ? <StatusBadge tone="violet">{badge}</StatusBadge> : null}
      <span className="pp-entry-icon">{icon}</span>
      <h2>{title}</h2>
      <p>{copy}</p>
      <Button variant={primary ? "primary" : "secondary"} onClick={onClick}>{action} →</Button>
    </article>
  );
}

function EntryScreen({ navigate }: { navigate: (screen: Screen) => void }) {
  return (
    <main className="pp-entry">
      <span className="pp-kicker"><Sparkles size={13} /> Autonomous workday repair</span>
      <h1>Give Relay a broken day.<br /><em>Watch the agent repair it.</em></h1>
      <p className="pp-entry-copy">Start with a prepared scenario, build a schedule yourself, or connect a workspace later. Every real tool decision, rejection, retry, and validator result stays visible.</p>
      <div className="pp-entry-grid">
        <EntryCard primary badge="Recommended for judges" icon={<Play size={21} />} title="Try a Demo Scenario" copy="Run a prepared overloaded schedule instantly. No login or account connection required." action="Explore Demo Scenarios" onClick={() => navigate("scenarios")} />
        <EntryCard icon={<ListPlus size={21} />} title="Build Schedule Manually" copy="Create fixed meetings and flexible tasks using Relay’s existing schedule model." action="Create My Schedule" onClick={() => navigate("manual")} />
        <EntryCard icon={<Link2 size={21} />} title="Connect Workspace" copy="Google Calendar and Notion remain an optional future input path." action="View connection status" onClick={() => navigate("connect")} />
      </div>
      <ul className="pp-assurances"><li><Check /> Real tool calls</li><li><Check /> Deterministic validation</li><li><Check /> No hidden schedule mutation</li><li><Check /> No account required for demo</li></ul>
    </main>
  );
}

function ScenarioGallery({ onBack, onSelect }: { onBack: () => void; onSelect: (schedule: DaySchedule) => void }) {
  return (
    <main className="pp-gallery">
      <button className="pp-back" onClick={onBack}><ArrowLeft size={13} /> Back to entry</button>
      <h1>Choose a demo scenario</h1>
      <p>Three prepared days, each broken in a different way. All metrics below come from Relay’s deterministic analyzer.</p>
      <div className="pp-scenario-grid">
        {demoScenarios.map((scenario) => {
          const view = scenarioDisplay(scenario.schedule, scenario.name, scenario.description);
          return (
            <article className="pp-scenario-card" key={scenario.id}>
              <div className="pp-preview-strip">
                {view.conflicts.map((zone, index) => <i className="conflict" style={{ left: `${zone.left}%`, width: `${zone.width}%` }} key={index} />)}
                {view.segments.map((segment, index) => <i className={segment.kind} style={{ left: `${segment.left}%`, width: `${segment.width}%` }} key={index} />)}
                <span>9A</span><span>12P</span><span>3P</span><span>5P</span>
              </div>
              <h2>{view.name}</h2>
              <p>{view.description}</p>
              <div className="pp-tags">{view.mainIssues.map((issue, index) => <span key={`${issue}-${index}`}>{issue}</span>)}</div>
              <div className="pp-scenario-score"><HealthScore value={view.healthScore} size={38} /><div><small>Initial health</small><b>{view.meetingCount} meetings · {view.taskCount} tasks</b></div></div>
              <p className="pp-main-issue">{view.overloadedMinutes > 0 ? `+${view.overloadedMinutes} minutes overloaded` : view.mainIssues[0]}</p>
              <Button onClick={() => onSelect(structuredClone(scenario.schedule))}>Start Scenario</Button>
            </article>
          );
        })}
      </div>
    </main>
  );
}

function ManualBuilder({
  schedule,
  setSchedule,
  onBack,
  onReview,
}: {
  schedule: DaySchedule;
  setSchedule: (schedule: DaySchedule) => void;
  onBack: () => void;
  onReview: () => void;
}) {
  const [kind, setKind] = useState<"meeting" | "task">("meeting");
  const [title, setTitle] = useState("");
  const [start, setStart] = useState(540);
  const [duration, setDuration] = useState(60);
  const [priority, setPriority] = useState<Priority>("medium");
  const analysis = analyzeSchedule(schedule);

  function addItem() {
    if (!title.trim()) return;
    const id = `manual-${kind}-${Date.now()}`;
    const item: ScheduleItem = kind === "meeting"
      ? { kind: "meeting", id, title: title.trim(), start, end: start + duration, fixed: true }
      : {
          kind: "task", id, taskId: id, title: title.trim(), start, end: start + duration,
          duration, minimumDuration: Math.min(30, duration), priority,
          deadline: schedule.workingHours.end, canMove: true, canSplit: duration >= 60,
          canShorten: duration > 30, canDefer: true,
        };
    setSchedule({ ...schedule, items: [...schedule.items, item] });
    setTitle("");
  }

  return (
    <main className="pp-manual">
      <button className="pp-back" onClick={onBack}><ArrowLeft size={13} /> Back to entry</button>
      <h1>Build a schedule manually</h1>
      <p>Create the starting state. Meetings are fixed; tasks remain constrained by the existing deterministic tool registry.</p>
      <div className="pp-manual-grid">
        <section className="pp-builder-card">
          <header><button className={kind === "meeting" ? "active" : ""} onClick={() => setKind("meeting")}>Fixed meeting</button><button className={kind === "task" ? "active" : ""} onClick={() => setKind("task")}>Flexible task</button></header>
          <label>Title<input value={title} onChange={(event) => setTitle(event.target.value)} placeholder={kind === "meeting" ? "Client review" : "Draft launch brief"} /></label>
          <div className="pp-form-row">
            <label>Start, minutes from midnight<input type="number" value={start} onChange={(event) => setStart(Number(event.target.value))} /></label>
            <label>Duration<input type="number" min={15} step={15} value={duration} onChange={(event) => setDuration(Number(event.target.value))} /></label>
          </div>
          {kind === "task" ? <label>Priority<select value={priority} onChange={(event) => setPriority(event.target.value as Priority)}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="critical">Critical</option></select></label> : null}
          <Button onClick={addItem}>Add {kind}</Button>
        </section>
        <section className="pp-builder-list">
          <header><b>Today · {schedule.items.length} items</b><span>Health {analysis.healthScore}</span></header>
          {schedule.items.length === 0 ? <EmptyState title="No schedule items yet" copy="Add at least one meeting or task to create a day." /> : (
            <ul>{[...schedule.items].sort((a, b) => a.start - b.start).map((item) => <li key={item.id}><i className={item.kind} /><b>{item.title}</b><span>{formatRange(item.start, item.end)}</span><em>{item.kind}</em><button onClick={() => setSchedule({ ...schedule, items: schedule.items.filter((candidate) => candidate.id !== item.id) })}>Remove</button></li>)}</ul>
          )}
          <Button onClick={onReview} disabled={schedule.items.length === 0}>Analyze Schedule →</Button>
        </section>
      </div>
    </main>
  );
}

function ReviewScreen({
  schedule,
  onBack,
  onEdit,
  onRepair,
}: {
  schedule: DaySchedule;
  onBack: () => void;
  onEdit: () => void;
  onRepair: () => void;
}) {
  const analysis = analyzeSchedule(schedule);
  const validation = validateSchedule(schedule);
  return (
    <main className="pp-review">
      <div className="pp-review-title"><div><h1>Schedule review</h1><StatusBadge tone="amber" dot>Source: {schedule.id.startsWith("manual") ? "Manual builder" : "Demo scenario"}</StatusBadge></div><span><CalendarDays size={13} /> {schedule.date} · {formatRange(schedule.workingHours.start, schedule.workingHours.end)}</span></div>
      <div className="pp-review-grid">
        <section className="pp-card pp-review-timeline"><header><b>Timeline</b><span><i className="meeting" /> Meeting <i className="task" /> Task <i className="break" /> Break</span></header><ScheduleTimeline schedule={schedule} analysis={analysis} /><DeferredTasks schedule={schedule} /></section>
        <section className="pp-card pp-day-analysis">
          <h2>Day analysis</h2>
          <div className="pp-health-summary"><HealthScore value={analysis.healthScore} size={66} /><div><b>{validation.valid ? "Already valid" : "Needs repair"}</b><span>Computed by deterministic rules</span></div></div>
          <dl>
            <dt>Meeting time</dt><dd>{formatDuration(countMinutes(schedule, "meeting"))}</dd>
            <dt>Task time</dt><dd>{formatDuration(countMinutes(schedule, "task"))}</dd>
            <dt>Available time</dt><dd>{formatDuration(analysis.availableMinutes)}</dd>
            <dt>Overloaded</dt><dd className="bad">+{analysis.overloadedMinutes} min</dd>
            <dt>Conflicts</dt><dd className="bad">{analysis.overlaps.length}</dd>
            <dt>Deadline risks</dt><dd>{analysis.deadlineRisks.length}</dd>
            <dt>Lunch</dt><dd className={analysis.missingLunch ? "bad" : "ok"}>{analysis.missingLunch ? "Missing" : "Placed"}</dd>
          </dl>
          <small>Independent of the language model.</small>
        </section>
        <section className="pp-issues"><header><b>Issues</b><span>{analysis.issues.length} found</span></header>{analysis.issues.length ? <ul>{analysis.issues.map((issue) => <li className={issue.severity} key={issue.id}><span>{issue.code}</span><b>{issue.title}</b><p>{issue.message}</p></li>)}</ul> : <EmptyState title="No issues detected" copy="The validator already considers this schedule valid." />}</section>
      </div>
      <div className="pp-review-actions"><Button variant="ghost" onClick={onEdit}>Edit schedule</Button><Button variant="ghost" onClick={onBack}>Change scenario</Button><span /><small>Agent gets 12 attempts · fixed meetings stay fixed</small><Button onClick={onRepair}><Sparkles size={13} /> Repair My Day</Button></div>
    </main>
  );
}

function ConnectScreen({ onBack }: { onBack: () => void }) {
  return (
    <main className="pp-connect">
      <button className="pp-back" onClick={onBack}><ArrowLeft size={13} /> Back to entry</button>
      <h1>Connect a workspace</h1><p>Optional integrations are intentionally outside today’s working demo.</p>
      <div><article><CalendarDays /><h2>Google Calendar</h2><StatusBadge tone="neutral">Coming next</StatusBadge><p>Import fixed meetings as read-only schedule blocks.</p><Button disabled variant="secondary">Not available in this build</Button></article><article><ListPlus /><h2>Notion</h2><StatusBadge tone="neutral">Coming next</StatusBadge><p>Import flexible tasks and scheduling constraints.</p><Button disabled variant="secondary">Not available in this build</Button></article></div>
    </main>
  );
}

function RunningScreen({
  original,
  current,
  status,
  steps,
  run,
  onCancel,
  onFinal,
}: {
  original: DaySchedule;
  current: DaySchedule;
  status: AgentRunStatus;
  steps: AgentStep[];
  run: AgentRunResult | null;
  onCancel: () => void;
  onFinal: () => void;
}) {
  const analysis = analyzeSchedule(current);
  const initial = analyzeSchedule(original);
  const [view, setView] = useState<"current" | "original">("current");
  const displayed = view === "current" ? current : original;
  const displayedAnalysis = view === "current" ? analysis : initial;
  return (
    <main className="pp-workspace">
      <div className="pp-run-header"><div><StatusBadge tone={run?.validation.valid ? "green" : status === "failed" ? "red" : "violet"} dot>{status.replace("_", " ")}</StatusBadge><h1>Repairing {original.title}</h1></div><span>{steps.length} events · active tool {activeTool(steps) ?? "waiting"}</span>{run ? <Button onClick={onFinal}>Review final result →</Button> : null}</div>
      <div className="pp-workspace-grid">
        <section className="pp-card pp-live-schedule">
          <header><b>{view === "current" ? "Current schedule" : "Original schedule"}</b><div><button className={view === "original" ? "active" : ""} onClick={() => setView("original")}>Original</button><button className={view === "current" ? "active" : ""} onClick={() => setView("current")}>Current</button></div></header>
          <ScheduleTimeline schedule={displayed} analysis={displayedAnalysis} run={run} />
          <DeferredTasks schedule={displayed} />
        </section>
        <AgentExecutionFeed steps={steps} />
        <RunStatusPanel status={status} attempts={steps.length} health={analysis.healthScore} healthStart={initial.healthScore} issues={analysis.issues} steps={steps} onCancel={onCancel} />
      </div>
    </main>
  );
}

function ReplayScreen({ run, onExit }: { run: AgentRunResult; onExit: () => void }) {
  const [step, setStep] = useState(1);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<ReplaySpeed>(1);
  const schedule = replaySchedule(run, step - 1);
  const analysis = analyzeSchedule(schedule);
  useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(() => {
      setStep((current) => {
        if (current >= run.steps.length) {
          setPlaying(false);
          return current;
        }
        return current + 1;
      });
    }, 900 / speed);
    return () => window.clearInterval(timer);
  }, [playing, run.steps.length, speed]);
  return (
    <main className="pp-replay">
      <header><div><h1>Replay · {run.originalSchedule.title}</h1><StatusBadge tone="blue" dot>Step {step} of {run.steps.length}</StatusBadge></div><span>Recorded state transitions only — OpenAI is not called again.</span><Button variant="secondary" onClick={onExit}>Exit replay</Button></header>
      <div className="pp-replay-grid">
        <section className="pp-card"><header><b>Schedule at step {step}</b><span>health {analysis.healthScore}</span></header><ScheduleTimeline schedule={schedule} analysis={analysis} compact run={run} /><DeferredTasks schedule={schedule} /></section>
        <AgentExecutionFeed steps={run.steps} playhead={step} />
        <RunStatusPanel status={step === run.steps.length ? run.status : "observing"} attempts={step} health={analysis.healthScore} healthStart={run.initialAnalysis.healthScore} issues={analysis.issues} steps={run.steps.slice(0, step)} />
      </div>
      <ReplayControls step={step} total={run.steps.length} playing={playing} speed={speed} rejected={run.steps.filter((event) => !event.success).map((event) => event.sequence)} onStep={setStep} onPlay={() => setPlaying((value) => !value)} onSpeed={setSpeed} />
    </main>
  );
}

function initialManualSchedule(): DaySchedule {
  return { id: "manual-schedule", title: "My Workday", date: "2026-07-19", workingHours: { start: 540, end: 1020 }, items: [] };
}

export function RelayWorkspace() {
  const [screen, setScreen] = useState<Screen>("entry");
  const [schedule, setSchedule] = useState<DaySchedule>(initialManualSchedule());
  const [original, setOriginal] = useState<DaySchedule>(initialManualSchedule());
  const [current, setCurrent] = useState<DaySchedule>(initialManualSchedule());
  const [steps, setSteps] = useState<AgentStep[]>([]);
  const [status, setStatus] = useState<AgentRunStatus>("planning");
  const [run, setRun] = useState<AgentRunResult | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  function goHome() {
    abortRef.current?.abort();
    setScreen("entry");
  }

  function selectSchedule(next: DaySchedule) {
    setSchedule(next);
    setOriginal(structuredClone(next));
    setCurrent(structuredClone(next));
    setRun(null);
    setSteps([]);
    setScreen("review");
  }

  async function repair() {
    const source = structuredClone(schedule);
    setOriginal(source);
    setCurrent(structuredClone(source));
    setSteps([]);
    setRun(null);
    setStatus("planning");
    setScreen("running");
    const abort = new AbortController();
    abortRef.current = abort;
    try {
      const response = await fetch("/api/agent/repair", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ schedule: source }),
        signal: abort.signal,
      });
      if (!response.ok || !response.body) {
        const payload = await response.json().catch(() => ({ message: "The agent could not start." })) as { message?: string };
        throw new Error(payload.message ?? "The agent could not start.");
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const event = JSON.parse(line) as StreamEvent;
          if (event.type === "status" && event.status) setStatus(event.status);
          if (event.type === "step" && event.step) {
            const step = event.step;
            setSteps((existing) => [...existing, step]);
            if (step.success && step.scheduleAfter) setCurrent(step.scheduleAfter);
          }
          if (event.type === "complete" && event.result) {
            setRun(event.result);
            setCurrent(event.result.workingSchedule);
            setStatus(event.result.status);
          }
          if (event.type === "error") throw new Error(event.message ?? "Agent run failed.");
        }
      }
    } catch (error) {
      if (abort.signal.aborted) {
        setStatus("cancelled");
      } else {
        setStatus("failed");
        const message = error instanceof Error ? error.message : "Agent run failed.";
        setSteps((existing) => [...existing, {
          sequence: existing.length + 1,
          type: "validation",
          decisionSummary: "The run stopped before the model could continue.",
          toolName: "validate_schedule",
          toolInput: {},
          toolResult: { success: false, tool: "validate_schedule", errorCode: "INVALID_INPUT", observation: message },
          success: false,
          errorCode: "INVALID_INPUT",
          durationMs: 0,
        }]);
      }
    } finally {
      abortRef.current = null;
    }
  }

  const content = (() => {
    if (screen === "entry") return <EntryScreen navigate={setScreen} />;
    if (screen === "scenarios") return <ScenarioGallery onBack={() => setScreen("entry")} onSelect={selectSchedule} />;
    if (screen === "manual") return <ManualBuilder schedule={schedule.id === "manual-schedule" ? schedule : initialManualSchedule()} setSchedule={setSchedule} onBack={() => setScreen("entry")} onReview={() => selectSchedule(schedule)} />;
    if (screen === "connect") return <ConnectScreen onBack={() => setScreen("entry")} />;
    if (screen === "review") return <ReviewScreen schedule={schedule} onBack={() => setScreen("scenarios")} onEdit={() => setScreen("manual")} onRepair={repair} />;
    if (screen === "running") return <RunningScreen original={original} current={current} status={status} steps={steps} run={run} onCancel={() => abortRef.current?.abort()} onFinal={() => setScreen("final")} />;
    if (screen === "final" && run) return <FinalResults run={run} onReplay={() => setScreen("replay")} onTryAnother={() => setScreen("scenarios")} onReturn={() => setScreen("running")} />;
    if (screen === "replay" && run) return <ReplayScreen run={run} onExit={() => setScreen("final")} />;
    return <EmptyState title="No schedule selected" copy="Return to the entry screen and choose a real scenario." />;
  })();

  return (
    <div className="pp-root">
      <div className="pp-shell">
        <AppHeader active={screen === "replay" ? "runs" : "workspace"} onHome={goHome} />
        {content}
      </div>
    </div>
  );
}
