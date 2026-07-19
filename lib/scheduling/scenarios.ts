import type { DaySchedule } from "./types";

function task(
  id: string,
  title: string,
  start: number,
  duration: number,
  options: Partial<{
    minimumDuration: number;
    priority: "low" | "medium" | "high" | "critical";
    deadline: number;
    canMove: boolean;
    canSplit: boolean;
    canShorten: boolean;
    canDefer: boolean;
  }> = {},
) {
  const minimumDuration = options.minimumDuration ?? 30;
  return {
    kind: "task" as const,
    id,
    taskId: id,
    title,
    start,
    end: start + duration,
    duration,
    minimumDuration,
    priority: options.priority ?? "medium",
    deadline: options.deadline ?? 17 * 60,
    canMove: options.canMove ?? true,
    canSplit: options.canSplit ?? duration >= minimumDuration * 2,
    canShorten: options.canShorten ?? false,
    canDefer: options.canDefer ?? true,
  };
}

function meeting(id: string, title: string, start: number, end: number) {
  return {
    kind: "meeting" as const,
    id,
    title,
    start,
    end,
    fixed: true as const,
  };
}

export interface DemoScenario {
  id: string;
  label: string;
  name: string;
  description: string;
  expectedPressure: string;
  schedule: DaySchedule;
}

export const demoScenarios: DemoScenario[] = [
  {
    id: "product-launch",
    label: "01",
    name: "Product Launch Day",
    description:
      "Critical launch work collides with fixed reviews and a hard publishing cutoff.",
    expectedPressure: "high pressure",
    schedule: {
      id: "product-launch",
      title: "Product Launch Day",
      date: "2026-07-21",
      workingHours: { start: 9 * 60, end: 17 * 60 },
      items: [
        meeting("standup", "Launch stand-up", 540, 585),
        task("launch-deck", "Finalize launch deck", 570, 120, {
          minimumDuration: 60,
          priority: "critical",
          deadline: 720,
          canShorten: true,
        }),
        meeting("exec-review", "Executive review", 660, 720),
        task("release-notes", "Publish release notes", 705, 90, {
          priority: "critical",
          deadline: 780,
        }),
        meeting("press-briefing", "Press briefing", 795, 855),
        task("qa-pass", "Final QA pass", 840, 105, {
          minimumDuration: 60,
          priority: "high",
          deadline: 930,
          canShorten: true,
        }),
        meeting("customer-call", "Launch customer call", 930, 990),
        task("backlog-groom", "Groom follow-up backlog", 975, 75, {
          priority: "low",
          deadline: 1020,
        }),
      ],
    },
  },
  {
    id: "overloaded-monday",
    label: "02",
    name: "Overloaded Monday",
    description:
      "Recurring meetings consume the day while three flexible tasks compete for focus time.",
    expectedPressure: "45m over",
    schedule: {
      id: "overloaded-monday",
      title: "Overloaded Monday",
      date: "2026-07-20",
      workingHours: { start: 540, end: 1020 },
      items: [
        meeting("weekly-sync", "Weekly team sync", 540, 600),
        task("strategy-memo", "Write strategy memo", 585, 120, {
          minimumDuration: 75,
          priority: "high",
          deadline: 900,
          canShorten: true,
        }),
        meeting("one-one", "Manager 1:1", 690, 735),
        task("research", "Customer research synthesis", 720, 120, {
          priority: "high",
          deadline: 960,
        }),
        meeting("planning", "Quarterly planning", 825, 915),
        task("metrics", "Update metrics report", 900, 90, {
          minimumDuration: 45,
          priority: "medium",
          deadline: 990,
          canShorten: true,
        }),
      ],
    },
  },
  {
    id: "deadline-collision",
    label: "03",
    name: "Deadline Collision",
    description:
      "Three important deliverables compete with immovable reviews and a shared afternoon cutoff.",
    expectedPressure: "2 deadlines",
    schedule: {
      id: "deadline-collision",
      title: "Deadline Collision",
      date: "2026-07-22",
      workingHours: { start: 540, end: 1020 },
      items: [
        task("proposal", "Finish enterprise proposal", 540, 120, {
          minimumDuration: 90,
          priority: "critical",
          deadline: 780,
          canShorten: true,
        }),
        meeting("design-review", "Design review", 660, 720),
        task("board-update", "Prepare board update", 705, 90, {
          minimumDuration: 60,
          priority: "critical",
          deadline: 810,
          canShorten: true,
        }),
        meeting("legal-review", "Legal review", 780, 840),
        task("pricing", "Pricing analysis", 825, 90, {
          priority: "high",
          deadline: 900,
        }),
        meeting("client-demo", "Client demo", 915, 975),
      ],
    },
  },
];
