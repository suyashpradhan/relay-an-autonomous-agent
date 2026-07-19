"use client";

import { Moon, Sun } from "lucide-react";
import type { ReactNode } from "react";

export type Tone = "violet" | "green" | "red" | "amber" | "blue" | "neutral";

const tones: Record<Tone, string> = {
  violet: "pp-badge-violet",
  green: "pp-badge-green",
  red: "pp-badge-red",
  amber: "pp-badge-amber",
  blue: "pp-badge-blue",
  neutral: "pp-badge-neutral",
};

export function StatusBadge({
  tone,
  children,
  dot = false,
}: {
  tone: Tone;
  children: ReactNode;
  dot?: boolean;
}) {
  return (
    <span className={`pp-badge ${tones[tone]}`}>
      {dot ? <span className="pp-badge-dot" /> : null}
      {children}
    </span>
  );
}

export function MonoChip({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "violet" | "red";
}) {
  return <span className={`pp-chip pp-chip-${tone}`}>{children}</span>;
}

export function Button({
  children,
  onClick,
  variant = "primary",
  disabled = false,
  className = "",
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      className={`pp-button pp-button-${variant} ${className}`}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
}

export function AppHeader({ onHome }: { onHome: () => void }) {
  return (
    <header className="pp-header">
      <button className="pp-brand" onClick={onHome} aria-label="Relay home">
        <span className="pp-logo">
          <i />
          <b />
        </span>
        <span>Relay</span>
      </button>
      <span className="pp-spacer" />
      <ThemeToggle />
    </header>
  );
}

function ThemeToggle() {
  function toggleTheme() {
    const next = document.documentElement.dataset.theme !== "dark";
    document.documentElement.dataset.theme = next ? "dark" : "light";
    window.localStorage.setItem("relay-theme", next ? "dark" : "light");
  }

  return (
    <button
      className="pp-theme-toggle"
      type="button"
      onClick={toggleTheme}
      aria-label="Toggle color theme"
      title="Toggle color theme"
    >
      <Sun className="pp-theme-sun" size={16} />
      <Moon className="pp-theme-moon" size={16} />
    </button>
  );
}

export function AppFooter() {
  return (
    <footer className="pp-footer">
      Built by <b>Suyash Pradhan</b> with <span aria-label="love">{"<3"}</span>
    </footer>
  );
}

export function HealthScore({
  value,
  size = 54,
}: {
  value: number;
  size?: number;
}) {
  const color = value < 50 ? "#D2404A" : value < 80 ? "#D9A22A" : "#23935B";
  return (
    <span
      className="pp-health"
      style={{
        width: size,
        height: size,
        background: `conic-gradient(${color} 0 ${value}%,#EEF0F4 0)`,
      }}
      aria-label={`Health score ${value}`}
    >
      <span style={{ width: size - 10, height: size - 10 }}>
        <b>{value}</b>
        {size > 45 ? <small>/100</small> : null}
      </span>
    </span>
  );
}

export function EmptyState({ title, copy }: { title: string; copy: string }) {
  return (
    <div className="pp-empty">
      <span>→</span>
      <div>
        <b>{title}</b>
        <p>{copy}</p>
      </div>
    </div>
  );
}
