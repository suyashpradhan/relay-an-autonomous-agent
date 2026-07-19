"use client";

import {
  Pause,
  Play,
  SkipBack,
  SkipForward,
  StepBack,
  StepForward,
} from "lucide-react";
import type { AgentRunResult, DaySchedule } from "../../lib/scheduling/types";
import { analyzeSchedule } from "../../lib/scheduling/analyzer";
import { ScheduleTimeline, DeferredTasks } from "./schedule-view";
import { Button, StatusBadge } from "./primitives";

function SchedulePanel({
  title,
  schedule,
  score,
  run,
}: {
  title: string;
  schedule: DaySchedule;
  score: number;
  run: AgentRunResult;
}) {
  const analysis = analyzeSchedule(schedule);
  return (
    <section className="pp-result-schedule">
      <header>
        <b>{title}</b>
        <span>{score}</span>
        <small>
          {analysis.overlaps.length} time conflicts ·{" "}
          {analysis.overloadedMinutes} min over capacity
        </small>
      </header>
      <ScheduleTimeline
        schedule={schedule}
        analysis={analysis}
        compact
        run={run}
      />
      <DeferredTasks schedule={schedule} />
    </section>
  );
}

export function FinalResults({
  run,
  onReplay,
  onTryAnother,
  onReturn,
}: {
  run: AgentRunResult;
  onReplay: () => void;
  onTryAnother: () => void;
  onReturn: () => void;
}) {
  const rejected = run.steps.filter((step) => !step.success).length;
  const metrics = [
    [
      "Health score",
      run.initialAnalysis.healthScore,
      run.finalAnalysis.healthScore,
    ],
    [
      "Conflicts",
      run.initialAnalysis.overlaps.length,
      run.finalAnalysis.overlaps.length,
    ],
    [
      "Extra work",
      `${run.initialAnalysis.overloadedMinutes}m`,
      `${run.finalAnalysis.overloadedMinutes}m`,
    ],
    [
      "Late-task risks",
      run.initialAnalysis.deadlineRisks.length,
      run.finalAnalysis.deadlineRisks.length,
    ],
  ] as const;
  const changes = [
    ["Moved", run.changes.moved],
    ["Split", run.changes.split],
    ["Shortened", run.changes.shortened],
    ["Moved to another day", run.changes.deferred],
    ["Breaks added", run.changes.breaksInserted],
  ] as const;
  return (
    <main className="pp-final">
      <div className="pp-final-title">
        <span className={run.validation.valid ? "valid" : "partial"}>
          {run.validation.valid ? "✓" : "!"}
        </span>
        <h1>
          {run.validation.valid
            ? "Your day has been repaired"
            : "Best plan found within the limit"}
        </h1>
        <p>{run.summary}</p>
      </div>
      <div className="pp-metric-strip">
        {metrics.map(([label, before, after]) => (
          <article key={label}>
            <b>{label}</b>
            <div>
              <span>{before}</span>→<strong>{after}</strong>
            </div>
          </article>
        ))}
        <article>
          <b>How Relay got there</b>
          <p>
            {run.attemptCount} steps · <em>{rejected} options didn’t work</em>
          </p>
        </article>
      </div>
      <div className="pp-before-after">
        <SchedulePanel
          title="Before"
          schedule={run.originalSchedule}
          score={run.initialAnalysis.healthScore}
          run={run}
        />
        <div className="pp-result-middle">
          <section>
            <h2>What changed in your day</h2>
            {changes.map(([label, items]) => (
              <div className="pp-change-row" key={label}>
                <span>{label}</span>
                <p>{items.length ? items.join(", ") : "None"}</p>
              </div>
            ))}
          </section>
          <section
            className={
              run.validation.valid ? "pp-validation approved" : "pp-validation"
            }
          >
            <header>
              <b>Final schedule check</b>
              <StatusBadge tone={run.validation.valid ? "green" : "red"}>
                {run.validation.valid ? "All checks passed" : "Needs more work"}
              </StatusBadge>
            </header>
            <p>
              This check is performed by Relay’s scheduling rules, separately
              from the AI.
            </p>
            <ul>
              <li>
                {run.validation.hardIssues.length === 0 ? "✓" : "×"} No blocking
                problems remain
              </li>
              <li>
                {run.validation.overloadedMinutes === 0 ? "✓" : "×"} The work
                fits into the day
              </li>
              <li>
                {run.finalAnalysis.outOfHours.length === 0 ? "✓" : "×"}{" "}
                Everything is inside working hours
              </li>
              <li>
                {run.finalAnalysis.deadlineRisks.length === 0 ? "✓" : "×"} Tasks
                finish before their deadlines
              </li>
              <li>
                {run.finalAnalysis.missingLunch ? "!" : "✓"}{" "}
                {run.finalAnalysis.missingLunch
                  ? "Lunch still needs time"
                  : "Lunch has protected time"}
              </li>
            </ul>
          </section>
          <section className="pp-rejected-summary">
            <b>Options that didn’t work</b>
            <span>{rejected}</span>
            <p>
              Relay recorded each attempt and left your schedule untouched when
              an option failed.
            </p>
          </section>
          <div className="pp-result-actions">
            <Button onClick={onReplay}>
              <Play size={13} fill="currentColor" /> Replay run
            </Button>
            <Button variant="secondary" onClick={onTryAnother}>
              Try another scenario
            </Button>
            <Button variant="ghost" onClick={onReturn}>
              Return to workspace
            </Button>
          </div>
        </div>
        <SchedulePanel
          title="After"
          schedule={run.workingSchedule}
          score={run.finalAnalysis.healthScore}
          run={run}
        />
      </div>
    </main>
  );
}

export type ReplaySpeed = 0.5 | 1 | 1.5 | 2;

export function ReplayControls({
  step,
  total,
  playing,
  speed,
  rejected,
  onStep,
  onPlay,
  onSpeed,
}: {
  step: number;
  total: number;
  playing: boolean;
  speed: ReplaySpeed;
  rejected: number[];
  onStep: (step: number) => void;
  onPlay: () => void;
  onSpeed: (speed: ReplaySpeed) => void;
}) {
  const max = Math.max(1, total);
  const progress = max <= 1 ? 100 : ((step - 1) / (max - 1)) * 100;
  return (
    <div className="pp-replay-controls">
      <div>
        <button onClick={() => onStep(1)} aria-label="Start">
          <SkipBack size={13} />
        </button>
        <button
          onClick={() => onStep(Math.max(1, step - 1))}
          aria-label="Previous"
        >
          <StepBack size={13} />
        </button>
        <button
          className="play"
          onClick={onPlay}
          aria-label={playing ? "Pause" : "Play"}
        >
          {playing ? (
            <Pause size={14} />
          ) : (
            <Play size={14} fill="currentColor" />
          )}
        </button>
        <button
          onClick={() => onStep(Math.min(max, step + 1))}
          aria-label="Next"
        >
          <StepForward size={13} />
        </button>
        <button onClick={() => onStep(max)} aria-label="End">
          <SkipForward size={13} />
        </button>
      </div>
      <select
        value={speed}
        onChange={(event) => onSpeed(Number(event.target.value) as ReplaySpeed)}
        aria-label="Replay speed"
      >
        <option value={0.5}>0.5×</option>
        <option value={1}>1×</option>
        <option value={1.5}>1.5×</option>
        <option value={2}>2×</option>
      </select>
      <div className="pp-scrubber">
        <i style={{ width: `${progress}%` }} />
        {Array.from({ length: max }, (_, index) => (
          <button
            className={rejected.includes(index + 1) ? "rejected" : ""}
            style={{ left: `${max <= 1 ? 0 : (index / (max - 1)) * 100}%` }}
            onClick={() => onStep(index + 1)}
            key={index}
          />
        ))}
        <input
          type="range"
          min={1}
          max={max}
          value={step}
          onChange={(event) => onStep(Number(event.target.value))}
        />
      </div>
      <span>
        step {step} / {max}
      </span>
    </div>
  );
}
