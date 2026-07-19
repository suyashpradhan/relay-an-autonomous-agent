"use client";

import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  CalendarDays,
  Check,
  ListPlus,
  Play,
  Sparkles,
} from "lucide-react";
import {
  AgentExecutionFeed,
  RunStatusPanel,
} from "../components/relay/agent-view";
import {
  AppFooter,
  AppHeader,
  Button,
  EmptyState,
  HealthScore,
  StatusBadge,
} from "../components/relay/primitives";
import {
  FinalResults,
  ReplayControls,
  type ReplaySpeed,
} from "../components/relay/results-view";
import {
  DeferredTasks,
  ScheduleTimeline,
} from "../components/relay/schedule-view";
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
import {
  friendlyIssue,
  friendlyStatus,
  friendlyToolName,
} from "../lib/ui/copy";

type Screen =
  | "entry"
  | "scenarios"
  | "manual"
  | "review"
  | "running"
  | "final"
  | "replay"
  | "connect";
type CalendarImportStatus = "idle" | "connecting" | "error";

interface StreamEvent {
  type: "status" | "step" | "complete" | "error";
  status?: AgentRunStatus;
  step?: AgentStep;
  result?: AgentRunResult;
  message?: string;
}

function countMinutes(
  schedule: DaySchedule,
  kind: ScheduleItem["kind"],
): number {
  return schedule.items
    .filter(
      (item) => item.kind === kind && (item.kind !== "task" || !item.deferred),
    )
    .reduce((sum, item) => sum + item.end - item.start, 0);
}

function timeInputValue(minutes: number): string {
  return `${Math.floor(minutes / 60)
    .toString()
    .padStart(2, "0")}:${(minutes % 60).toString().padStart(2, "0")}`;
}

function timeInputMinutes(value: string): number {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
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
      <Button variant={primary ? "primary" : "secondary"} onClick={onClick}>
        {action} →
      </Button>
    </article>
  );
}

function EntryScreen({ navigate }: { navigate: (screen: Screen) => void }) {
  return (
    <main className="pp-entry">
      <span className="pp-kicker">
        <Sparkles size={13} /> A smarter way to reshape your day
      </span>
      <h1>
        Give Relay a packed day.
        <br />
        <em>Watch it make room.</em>
      </h1>
      <p className="pp-entry-copy">
        Start with a prepared example or add your own meetings and tasks. Relay
        shows every schedule change, including ideas that could not be applied
        and what it tried next.
      </p>
      <div className="pp-entry-grid">
        <EntryCard
          primary
          badge="Best place to start"
          icon={<Play size={21} />}
          title="Try a Demo Day"
          copy="See Relay work on a prepared, overloaded schedule. No account or setup needed."
          action="Choose a Demo"
          onClick={() => navigate("scenarios")}
        />
        <EntryCard
          icon={<ListPlus size={21} />}
          title="Add My Own Schedule"
          copy="Enter meetings that cannot move and tasks that Relay can rearrange."
          action="Build My Day"
          onClick={() => navigate("manual")}
        />
        <EntryCard
          icon={<CalendarDays size={21} />}
          title="Import Google Calendar"
          copy="Bring in one day of timed meetings from your primary calendar. Relay only reads—Google events are never changed."
          action="Choose a Day"
          onClick={() => navigate("connect")}
        />
      </div>
      <ul className="pp-assurances">
        <li>
          <Check /> Real schedule changes
        </li>
        <li>
          <Check /> Rules check every result
        </li>
        <li>
          <Check /> Failed ideas change nothing
        </li>
        <li>
          <Check /> No account needed
        </li>
      </ul>
    </main>
  );
}

function ScenarioGallery({
  onBack,
  onSelect,
}: {
  onBack: () => void;
  onSelect: (schedule: DaySchedule) => void;
}) {
  return (
    <main className="pp-gallery">
      <button className="pp-back" onClick={onBack}>
        <ArrowLeft size={13} /> Back to entry
      </button>
      <h1>Choose a demo scenario</h1>
      <p>
        Choose a busy day to see how Relay handles different kinds of schedule
        pressure. Every score comes from the scheduling rules.
      </p>
      <div className="pp-scenario-grid">
        {demoScenarios.map((scenario) => {
          const view = scenarioDisplay(
            scenario.schedule,
            scenario.name,
            scenario.description,
          );
          return (
            <article className="pp-scenario-card" key={scenario.id}>
              <div className="pp-preview-strip">
                {view.conflicts.map((zone, index) => (
                  <i
                    className="conflict"
                    style={{ left: `${zone.left}%`, width: `${zone.width}%` }}
                    key={index}
                  />
                ))}
                {view.segments.map((segment, index) => (
                  <i
                    className={segment.kind}
                    style={{
                      left: `${segment.left}%`,
                      width: `${segment.width}%`,
                    }}
                    key={index}
                  />
                ))}
                <span>9A</span>
                <span>12P</span>
                <span>3P</span>
                <span>5P</span>
              </div>
              <h2>{view.name}</h2>
              <p>{view.description}</p>
              <div className="pp-tags">
                {scenario.schedule &&
                  analyzeSchedule(scenario.schedule)
                    .issues.slice(0, 3)
                    .map((issue) => (
                      <span key={issue.id}>{friendlyIssue(issue).label}</span>
                    ))}
              </div>
              <div className="pp-scenario-score">
                <HealthScore value={view.healthScore} size={38} />
                <div>
                  <small>Starting score</small>
                  <b>
                    {view.meetingCount} meetings · {view.taskCount} tasks
                  </b>
                </div>
              </div>
              <p className="pp-main-issue">
                {view.overloadedMinutes > 0
                  ? `${view.overloadedMinutes} minutes more than the day can hold`
                  : "This day needs a few adjustments"}
              </p>
              <Button
                onClick={() => onSelect(structuredClone(scenario.schedule))}
              >
                Use This Day
              </Button>
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
  const [deadline, setDeadline] = useState(1020);
  const [priority, setPriority] = useState<Priority>("medium");
  const analysis = analyzeSchedule(schedule);

  function addItem() {
    if (!title.trim()) return;
    const id = `manual-${kind}-${Date.now()}`;
    const item: ScheduleItem =
      kind === "meeting"
        ? {
            kind: "meeting",
            id,
            title: title.trim(),
            start,
            end: start + duration,
            fixed: true,
          }
        : {
            kind: "task",
            id,
            taskId: id,
            title: title.trim(),
            start,
            end: start + duration,
            duration,
            minimumDuration: Math.min(30, duration),
            priority,
            deadline,
            canMove: true,
            canSplit: duration >= 60,
            canShorten: duration > 30,
            canDefer: true,
          };
    setSchedule({ ...schedule, items: [...schedule.items, item] });
    setTitle("");
  }

  return (
    <main className="pp-manual">
      <button className="pp-back" onClick={onBack}>
        <ArrowLeft size={13} /> Back to entry
      </button>
      <h1>
        {schedule.id.startsWith("google-calendar-")
          ? "Your calendar is ready"
          : "Add your meetings and tasks"}
      </h1>
      <p>
        {schedule.id.startsWith("google-calendar-")
          ? `${schedule.items.filter((item) => item.kind === "meeting").length} timed Google Calendar events were imported as fixed meetings. Add the tasks you want Relay to fit around them.`
          : "Meetings stay fixed. Relay may move, split, shorten, or reschedule tasks when it needs to make the day work."}
      </p>
      <div className="pp-manual-grid">
        <section className="pp-builder-card">
          <header>
            <button
              className={kind === "meeting" ? "active" : ""}
              onClick={() => setKind("meeting")}
            >
              Meeting
            </button>
            <button
              className={kind === "task" ? "active" : ""}
              onClick={() => setKind("task")}
            >
              Task
            </button>
          </header>
          <p className="pp-builder-help">
            {kind === "meeting"
              ? "Meetings are protected and will not be moved."
              : "Tasks are flexible, so Relay can find a better place for them."}
          </p>
          <label>
            Name
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder={
                kind === "meeting" ? "Client review" : "Draft launch brief"
              }
            />
          </label>
          <div className="pp-form-row">
            <label>
              Starts at
              <input
                type="time"
                value={timeInputValue(start)}
                onChange={(event) =>
                  setStart(timeInputMinutes(event.target.value))
                }
              />
            </label>
            <label>
              Minutes
              <input
                type="number"
                min={15}
                step={15}
                value={duration}
                onChange={(event) => setDuration(Number(event.target.value))}
              />
            </label>
          </div>
          {kind === "task" ? (
            <>
              <label>
                Needs to finish by
                <input
                  type="time"
                  value={timeInputValue(deadline)}
                  onChange={(event) =>
                    setDeadline(timeInputMinutes(event.target.value))
                  }
                />
              </label>
              <label>
                Importance
                <select
                  value={priority}
                  onChange={(event) =>
                    setPriority(event.target.value as Priority)
                  }
                >
                  <option value="low">Nice to do</option>
                  <option value="medium">Normal</option>
                  <option value="high">Important</option>
                  <option value="critical">Must finish today</option>
                </select>
              </label>
            </>
          ) : null}
          <Button onClick={addItem}>
            Add {kind === "meeting" ? "Meeting" : "Task"}
          </Button>
        </section>
        <section className="pp-builder-list">
          <header>
            <b>Today · {schedule.items.length} items</b>
            <span>Schedule score {analysis.healthScore}</span>
          </header>
          {schedule.items.length === 0 ? (
            <EmptyState
              title="No schedule items yet"
              copy="Add at least one meeting or task to create a day."
            />
          ) : (
            <ul>
              {[...schedule.items]
                .sort((a, b) => a.start - b.start)
                .map((item) => (
                  <li key={item.id}>
                    <i className={item.kind} />
                    <b>{item.title}</b>
                    <span>{formatRange(item.start, item.end)}</span>
                    <em>{item.kind}</em>
                    <button
                      onClick={() =>
                        setSchedule({
                          ...schedule,
                          items: schedule.items.filter(
                            (candidate) => candidate.id !== item.id,
                          ),
                        })
                      }
                    >
                      Remove
                    </button>
                  </li>
                ))}
            </ul>
          )}
          <Button onClick={onReview} disabled={schedule.items.length === 0}>
            Review My Day →
          </Button>
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
      <div className="pp-review-title">
        <div>
          <h1>Schedule review</h1>
          <StatusBadge tone="amber" dot>
            Source:{" "}
            {schedule.id.startsWith("manual")
              ? "Manual builder"
              : "Demo scenario"}
          </StatusBadge>
        </div>
        <span>
          <CalendarDays size={13} /> {schedule.date} ·{" "}
          {formatRange(schedule.workingHours.start, schedule.workingHours.end)}
        </span>
      </div>
      <div className="pp-review-grid">
        <section className="pp-card pp-review-timeline">
          <header>
            <b>Timeline</b>
            <span>
              <i className="meeting" /> Meeting <i className="task" /> Task{" "}
              <i className="break" /> Break
            </span>
          </header>
          <ScheduleTimeline schedule={schedule} analysis={analysis} />
          <DeferredTasks schedule={schedule} />
        </section>
        <section className="pp-card pp-day-analysis">
          <h2>How your day looks</h2>
          <div className="pp-health-summary">
            <HealthScore value={analysis.healthScore} size={66} />
            <div>
              <b>{validation.valid ? "Ready to go" : "Needs some room"}</b>
              <span>Checked using Relay’s schedule rules</span>
            </div>
          </div>
          <dl>
            <dt>Meeting time</dt>
            <dd>{formatDuration(countMinutes(schedule, "meeting"))}</dd>
            <dt>Task time</dt>
            <dd>{formatDuration(countMinutes(schedule, "task"))}</dd>
            <dt>Available time</dt>
            <dd>{formatDuration(analysis.availableMinutes)}</dd>
            <dt>Extra work</dt>
            <dd className="bad">{analysis.overloadedMinutes} min</dd>
            <dt>Time conflicts</dt>
            <dd className="bad">{analysis.overlaps.length}</dd>
            <dt>Tasks at risk of running late</dt>
            <dd>{analysis.deadlineRisks.length}</dd>
            <dt>Lunch break</dt>
            <dd className={analysis.missingLunch ? "bad" : "ok"}>
              {analysis.missingLunch ? "Needs time" : "Protected"}
            </dd>
          </dl>
          <small>The final result is checked separately from the AI.</small>
        </section>
        <section className="pp-issues">
          <header>
            <b>What needs attention</b>
            <span>{analysis.issues.length} found</span>
          </header>
          {analysis.issues.length ? (
            <ul>
              {analysis.issues.map((issue) => {
                const copy = friendlyIssue(issue);
                return (
                  <li className={issue.severity} key={issue.id}>
                    <span>{copy.label}</span>
                    <b>{copy.title}</b>
                    <p>{copy.message}</p>
                  </li>
                );
              })}
            </ul>
          ) : (
            <EmptyState
              title="Your schedule already works"
              copy="There are no conflicts or capacity problems to fix."
            />
          )}
        </section>
      </div>
      <div className="pp-review-actions">
        <Button variant="ghost" onClick={onEdit}>
          Edit schedule
        </Button>
        <Button variant="ghost" onClick={onBack}>
          Change scenario
        </Button>
        <span />
        <small>Relay can try up to 12 changes. Meetings will not move.</small>
        <Button onClick={onRepair}>
          <Sparkles size={13} /> Make Room in My Day
        </Button>
      </div>
    </main>
  );
}

function ConnectScreen({
  onBack,
  date,
  onDate,
  status,
  message,
}: {
  onBack: () => void;
  date: string;
  onDate: (date: string) => void;
  status: CalendarImportStatus;
  message?: string;
}) {
  function connectGoogleCalendar() {
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const query = new URLSearchParams({ date, timeZone });
    window.location.assign(`/api/google-calendar/connect?${query}`);
  }

  return (
    <main className="pp-connect">
      <button className="pp-back" onClick={onBack}>
        <ArrowLeft size={13} /> Back to entry
      </button>
      <h1>Import meetings from Google Calendar</h1>
      <p>
        Relay reads timed events from your primary calendar for one day. It
        never edits your Google Calendar.
      </p>
      <div>
        <article>
          <header className="pp-connect-card-head">
            <span>
              <CalendarDays />
            </span>
            <div>
              <h2>Google Calendar</h2>
              <small>Primary calendar · timed events only</small>
            </div>
            <StatusBadge tone="green">Read only</StatusBadge>
          </header>
          <p>
            Choose a day, connect Google, and Relay will bring those events in
            as fixed meetings. You can then add flexible tasks before repairing
            the day.
          </p>
          <div className="pp-connect-form">
            <label className="pp-connect-date">
              <span>Day to import</span>
              <input
                type="date"
                value={date}
                onChange={(event) => onDate(event.target.value)}
              />
            </label>
            <Button
              onClick={connectGoogleCalendar}
              disabled={!date || status === "connecting"}
            >
              {status === "connecting"
                ? "Importing Calendar…"
                : "Connect Google Calendar"}
            </Button>
          </div>
          {message ? (
            <div
              className={`pp-connect-message ${status === "error" ? "error" : ""}`}
            >
              {message}
            </div>
          ) : null}
          <small className="pp-connect-note">
            Relay never writes to Google Calendar. All-day events are skipped.
          </small>
        </article>
      </div>
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
  const currentTool = activeTool(steps);
  const [view, setView] = useState<"current" | "original">("current");
  const displayed = view === "current" ? current : original;
  const displayedAnalysis = view === "current" ? analysis : initial;
  return (
    <main className="pp-workspace">
      <div className="pp-run-header">
        <div>
          <StatusBadge
            tone={
              run?.validation.valid
                ? "green"
                : status === "failed"
                  ? "red"
                  : "violet"
            }
            dot
          >
            {friendlyStatus(status)}
          </StatusBadge>
          <h1>Reshaping {original.title}</h1>
        </div>
        <span>
          {steps.length} steps ·{" "}
          {currentTool ? friendlyToolName(currentTool) : "Getting ready"}
        </span>
        {run ? <Button onClick={onFinal}>See What Changed →</Button> : null}
      </div>
      <div className="pp-workspace-grid">
        <section className="pp-card pp-live-schedule">
          <header>
            <b>
              {view === "current" ? "Current schedule" : "Original schedule"}
            </b>
            <div>
              <button
                className={view === "original" ? "active" : ""}
                onClick={() => setView("original")}
              >
                Original
              </button>
              <button
                className={view === "current" ? "active" : ""}
                onClick={() => setView("current")}
              >
                Current
              </button>
            </div>
          </header>
          <ScheduleTimeline
            schedule={displayed}
            analysis={displayedAnalysis}
            run={run}
          />
          <DeferredTasks schedule={displayed} />
        </section>
        <AgentExecutionFeed steps={steps} />
        <RunStatusPanel
          status={status}
          attempts={steps.length}
          health={analysis.healthScore}
          healthStart={initial.healthScore}
          issues={analysis.issues}
          steps={steps}
          onCancel={onCancel}
        />
      </div>
    </main>
  );
}

function ReplayScreen({
  run,
  onExit,
}: {
  run: AgentRunResult;
  onExit: () => void;
}) {
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
      <header>
        <div>
          <h1>Replay · {run.originalSchedule.title}</h1>
          <StatusBadge tone="blue" dot>
            Step {step} of {run.steps.length}
          </StatusBadge>
        </div>
        <span>
          This replay uses the saved run and does not ask the AI again.
        </span>
        <Button variant="secondary" onClick={onExit}>
          Exit replay
        </Button>
      </header>
      <div className="pp-replay-grid">
        <section className="pp-card">
          <header>
            <b>Schedule at step {step}</b>
            <span>health {analysis.healthScore}</span>
          </header>
          <ScheduleTimeline
            schedule={schedule}
            analysis={analysis}
            compact
            run={run}
          />
          <DeferredTasks schedule={schedule} />
        </section>
        <AgentExecutionFeed steps={run.steps} playhead={step} />
        <RunStatusPanel
          status={step === run.steps.length ? run.status : "observing"}
          attempts={step}
          health={analysis.healthScore}
          healthStart={run.initialAnalysis.healthScore}
          issues={analysis.issues}
          steps={run.steps.slice(0, step)}
        />
      </div>
      <ReplayControls
        step={step}
        total={run.steps.length}
        playing={playing}
        speed={speed}
        rejected={run.steps
          .filter((event) => !event.success)
          .map((event) => event.sequence)}
        onStep={setStep}
        onPlay={() => setPlaying((value) => !value)}
        onSpeed={setSpeed}
      />
    </main>
  );
}

function initialManualSchedule(): DaySchedule {
  return {
    id: "manual-schedule",
    title: "My Workday",
    date: "2026-07-19",
    workingHours: { start: 540, end: 1020 },
    items: [],
  };
}

export function RelayWorkspace() {
  const [screen, setScreen] = useState<Screen>("entry");
  const [schedule, setSchedule] = useState<DaySchedule>(
    initialManualSchedule(),
  );
  const [original, setOriginal] = useState<DaySchedule>(
    initialManualSchedule(),
  );
  const [current, setCurrent] = useState<DaySchedule>(initialManualSchedule());
  const [steps, setSteps] = useState<AgentStep[]>([]);
  const [status, setStatus] = useState<AgentRunStatus>("planning");
  const [run, setRun] = useState<AgentRunResult | null>(null);
  const [calendarDate, setCalendarDate] = useState(
    initialManualSchedule().date,
  );
  const [calendarImportStatus, setCalendarImportStatus] =
    useState<CalendarImportStatus>("idle");
  const [calendarMessage, setCalendarMessage] = useState<string>();
  const abortRef = useRef<AbortController | null>(null);
  const calendarHandledRef = useRef(false);

  // OAuth returns through the URL after hydration, so this effect intentionally
  // restores the matching UI state from that external browser state.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (calendarHandledRef.current) return;
    const query = new URLSearchParams(window.location.search);
    const calendar = query.get("calendar");
    if (!calendar) return;
    calendarHandledRef.current = true;
    const date = query.get("date");
    const timeZone = query.get("timeZone");
    window.history.replaceState({}, "", window.location.pathname);
    setScreen("connect");

    if (calendar === "cancelled") {
      setCalendarImportStatus("error");
      setCalendarMessage(
        "Google connection was cancelled. Nothing was imported.",
      );
      return;
    }
    if (calendar === "not_configured") {
      setCalendarImportStatus("error");
      setCalendarMessage(
        "Google Calendar is not configured for this Relay environment yet.",
      );
      return;
    }
    if (calendar === "invalid_client") {
      setCalendarImportStatus("error");
      setCalendarMessage(
        "The Google OAuth Client ID is invalid. Use a Web application Client ID ending in .apps.googleusercontent.com.",
      );
      return;
    }
    if (calendar !== "connected" || !date || !timeZone) {
      setCalendarImportStatus("error");
      setCalendarMessage(
        "Google Calendar could not be connected. Please try again.",
      );
      return;
    }

    setCalendarDate(date);
    setCalendarImportStatus("connecting");
    setCalendarMessage("Google is connected. Importing the selected day…");
    void fetch(
      `/api/google-calendar/import?${new URLSearchParams({ date, timeZone })}`,
      {
        cache: "no-store",
      },
    )
      .then(async (response) => {
        const payload = (await response.json()) as {
          schedule?: DaySchedule;
          message?: string;
        };
        if (!response.ok || !payload.schedule) {
          throw new Error(
            payload.message || "Google Calendar could not be imported.",
          );
        }
        const imported = payload.schedule;
        setSchedule(imported);
        setOriginal(structuredClone(imported));
        setCurrent(structuredClone(imported));
        setRun(null);
        setSteps([]);
        setCalendarImportStatus("idle");
        setCalendarMessage(undefined);
        setScreen("manual");
      })
      .catch((error: unknown) => {
        setCalendarImportStatus("error");
        setCalendarMessage(
          error instanceof Error
            ? error.message
            : "Google Calendar could not be imported.",
        );
        setScreen("connect");
      });
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

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
        const payload = (await response
          .json()
          .catch(() => ({ message: "The agent could not start." }))) as {
          message?: string;
        };
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
            if (step.success && step.scheduleAfter)
              setCurrent(step.scheduleAfter);
          }
          if (event.type === "complete" && event.result) {
            setRun(event.result);
            setCurrent(event.result.workingSchedule);
            setStatus(event.result.status);
          }
          if (event.type === "error")
            throw new Error(event.message ?? "Agent run failed.");
        }
      }
    } catch (error) {
      if (abort.signal.aborted) {
        setStatus("cancelled");
      } else {
        setStatus("failed");
        const message =
          error instanceof Error ? error.message : "Agent run failed.";
        setSteps((existing) => [
          ...existing,
          {
            sequence: existing.length + 1,
            type: "validation",
            decisionSummary: "The run stopped before the model could continue.",
            toolName: "validate_schedule",
            toolInput: {},
            toolResult: {
              success: false,
              tool: "validate_schedule",
              errorCode: "INVALID_INPUT",
              observation: message,
            },
            success: false,
            errorCode: "INVALID_INPUT",
            durationMs: 0,
          },
        ]);
      }
    } finally {
      abortRef.current = null;
    }
  }

  const content = (() => {
    if (screen === "entry") return <EntryScreen navigate={setScreen} />;
    if (screen === "scenarios")
      return (
        <ScenarioGallery
          onBack={() => setScreen("entry")}
          onSelect={selectSchedule}
        />
      );
    if (screen === "manual")
      return (
        <ManualBuilder
          schedule={
            schedule.id === "manual-schedule" ||
            schedule.id.startsWith("google-calendar-")
              ? schedule
              : initialManualSchedule()
          }
          setSchedule={setSchedule}
          onBack={() => setScreen("entry")}
          onReview={() => selectSchedule(schedule)}
        />
      );
    if (screen === "connect")
      return (
        <ConnectScreen
          onBack={() => setScreen("entry")}
          date={calendarDate}
          onDate={setCalendarDate}
          status={calendarImportStatus}
          message={calendarMessage}
        />
      );
    if (screen === "review")
      return (
        <ReviewScreen
          schedule={schedule}
          onBack={() => setScreen("scenarios")}
          onEdit={() => setScreen("manual")}
          onRepair={repair}
        />
      );
    if (screen === "running")
      return (
        <RunningScreen
          original={original}
          current={current}
          status={status}
          steps={steps}
          run={run}
          onCancel={() => abortRef.current?.abort()}
          onFinal={() => setScreen("final")}
        />
      );
    if (screen === "final" && run)
      return (
        <FinalResults
          run={run}
          onReplay={() => setScreen("replay")}
          onTryAnother={() => setScreen("scenarios")}
          onReturn={() => setScreen("running")}
        />
      );
    if (screen === "replay" && run)
      return <ReplayScreen run={run} onExit={() => setScreen("final")} />;
    return (
      <EmptyState
        title="No schedule selected"
        copy="Return to the entry screen and choose a real scenario."
      />
    );
  })();

  return (
    <div className="pp-root">
      <div className="pp-shell">
        <AppHeader onHome={goHome} />
        {content}
        <AppFooter />
      </div>
    </div>
  );
}
