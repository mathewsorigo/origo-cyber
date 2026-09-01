import type { ReactNode } from "react";
import { severityClass, severityLabel, type Severity } from "@/lib/domain";

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function SeverityBadge({ severity }: { severity: Severity }) {
  return (
    <span
      className={`inline-flex items-center rounded border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider ${severityClass[severity]}`}
    >
      {severityLabel[severity]}
    </span>
  );
}

export function StatusPill({ label, tone = "muted" }: { label: string; tone?: "muted" | "primary" | "critical" | "accent" }) {
  const tones: Record<string, string> = {
    muted: "bg-muted text-muted-foreground border-border",
    primary: "bg-primary/15 text-primary border-primary/40",
    critical: "bg-critical/15 text-critical border-critical/40",
    accent: "bg-accent/15 text-accent border-accent/40",
  };
  return (
    <span className={`inline-flex items-center rounded border px-2 py-0.5 text-xs ${tones[tone]}`}>
      {label}
    </span>
  );
}

export function StatCard({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  tone?: "default" | "critical" | "primary" | "warn";
}) {
  const accent =
    tone === "critical"
      ? "text-critical"
      : tone === "warn"
        ? "text-high"
        : tone === "primary"
          ? "text-primary"
          : "text-foreground";
  return (
    <div className="panel rounded-lg p-4">
      <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{label}</p>
      <p className={`mt-2 font-display text-3xl font-bold ${accent}`}>{value}</p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function Panel({
  title,
  action,
  children,
  className = "",
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`panel rounded-lg ${className}`}>
      <header className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
        <h2 className="font-mono text-xs uppercase tracking-widest text-muted-foreground">{title}</h2>
        {action}
      </header>
      <div className="p-4">{children}</div>
    </section>
  );
}

export function EmptyState({ text }: { text: string }) {
  return <p className="py-8 text-center text-sm text-muted-foreground">{text}</p>;
}
