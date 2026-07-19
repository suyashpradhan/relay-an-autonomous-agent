"use client";

import { motion } from "framer-motion";
import type { DaySchedule, ScheduleAnalysis } from "../../lib/scheduling/types";
import { formatRange, scheduleDisplay } from "../../lib/ui/adapters";

const PX_PER_MINUTE = 0.82;

function hourLabel(minutes: number): string {
  const h = minutes / 60;
  return h === 12 ? "12P" : h > 12 ? `${h - 12}P` : `${h}A`;
}

export function ScheduleTimeline({
  schedule,
  analysis,
  compact = false,
  run,
}: {
  schedule: DaySchedule;
  analysis: ScheduleAnalysis;
  compact?: boolean;
  run?: import("../../lib/scheduling/types").AgentRunResult | null;
}) {
  const view = scheduleDisplay(schedule, analysis, run);
  const start = schedule.workingHours.start;
  const end = schedule.workingHours.end;
  const height = (end - start) * PX_PER_MINUTE;
  const marks: number[] = [];
  for (let minute = start; minute <= end; minute += 60) marks.push(minute);
  return (
    <div className={`pp-timeline ${compact ? "compact" : ""}`} style={{ height }}>
      {marks.map((minute) => (
        <div className="pp-hour" style={{ top: (minute - start) * PX_PER_MINUTE }} key={minute}>
          <span>{hourLabel(minute)}</span><i />
        </div>
      ))}
      <div className="pp-lunch-window" style={{ top: (720 - start) * PX_PER_MINUTE, height: 120 * PX_PER_MINUTE }} />
      <div className="pp-block-layer">
        {view.blocks.map((block) => {
          const laneStyle = block.lane === "left"
            ? { left: 0, right: "42%" }
            : block.lane === "right"
              ? { left: "61%", right: 0 }
              : { left: 0, right: 0 };
          return (
            <motion.div
              layout
              transition={{ duration: 0.35, ease: [0.2, 0.8, 0.2, 1] }}
              className={`pp-schedule-block ${block.kind} ${block.conflicted ? "conflicted" : ""}`}
              style={{
                top: (block.start - start) * PX_PER_MINUTE,
                height: Math.max(22, (block.end - block.start) * PX_PER_MINUTE - 2),
                ...laneStyle,
              }}
              key={block.id}
            >
              <div><b>{block.title}</b>{block.tag ? <em>{block.tag}</em> : null}</div>
              <small>{formatRange(block.start, block.end)} · {block.end - block.start}m</small>
              {!compact && block.end - block.start >= 45 ? <span>{block.note}</span> : null}
            </motion.div>
          );
        })}
        {view.conflicts.map((conflict) => (
          <div
            className="pp-conflict-zone"
            style={{ top: (conflict.start - start) * PX_PER_MINUTE - 2, height: (conflict.end - conflict.start) * PX_PER_MINUTE + 4 }}
            key={conflict.id}
          ><span>{conflict.label}</span></div>
        ))}
      </div>
    </div>
  );
}

export function DeferredTasks({ schedule }: { schedule: DaySchedule }) {
  const deferred = schedule.items.filter((item) => item.kind === "task" && item.deferred);
  if (!deferred.length) return null;
  return (
    <div className="pp-deferred">
      <b>Deferred</b>
      {deferred.map((item) => <span key={item.id}>{item.title} → next workday</span>)}
    </div>
  );
}
