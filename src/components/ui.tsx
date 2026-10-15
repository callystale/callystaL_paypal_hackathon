"use client";

import { useEffect, type ReactNode } from "react";
import { formatCurrency } from "@/lib/money";

export function Money({
  amount,
  currency = "USD",
  className = "",
}: {
  amount: number;
  currency?: string;
  className?: string;
}) {
  return <span className={className}>{formatCurrency(amount, currency)}</span>;
}

export function Spinner({ className = "" }: { className?: string }) {
  return (
    <span
      className={`inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent ${className}`}
      role="status"
      aria-label="loading"
    />
  );
}

export function PriorityBadge({ priority }: { priority: string }) {
  const styles: Record<string, string> = {
    HIGH: "bg-rose-100 text-rose-700",
    MEDIUM: "bg-amber-100 text-amber-700",
    LOW: "bg-slate-100 text-slate-600",
  };
  return (
    <span className={`badge ${styles[priority] ?? styles.LOW}`}>{priority.toLowerCase()}</span>
  );
}

export function Progress({
  value,
  max,
  color = "#6366f1",
}: {
  value: number;
  max: number;
  color?: string;
}) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  const over = max > 0 && value > max;
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
      <div
        className="h-full rounded-full transition-all"
        style={{ width: `${pct}%`, backgroundColor: over ? "#e11d48" : color }}
      />
    </div>
  );
}

export function Modal({
  open,
  onClose,
  title,
  children,
  wide = false,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4 sm:items-center">
      <div
        className={`my-8 w-full ${wide ? "max-w-3xl" : "max-w-lg"} rounded-2xl bg-white p-6 shadow-xl`}
      >
        <div className="mb-4 flex items-center justify-between gap-4">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button onClick={onClose} className="btn-ghost" aria-label="Close">
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 text-center text-sm text-slate-500">
      {children}
    </p>
  );
}

export function Alert({ kind = "error", children }: { kind?: "error" | "info"; children: ReactNode }) {
  const styles =
    kind === "error"
      ? "border-rose-200 bg-rose-50 text-rose-700"
      : "border-sky-200 bg-sky-50 text-sky-700";
  return <div className={`rounded-lg border px-3 py-2 text-sm ${styles}`}>{children}</div>;
}
