"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
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
    HIGH: "bg-rose-500/20 text-rose-300",
    MEDIUM: "bg-amber-500/20 text-amber-300",
    LOW: "bg-paper-inset text-ink-soft",
  };
  return (
    <span className={`badge ${styles[priority] ?? styles.LOW}`}>{priority.toLowerCase()}</span>
  );
}

export function Progress({
  value,
  max,
  color = "#829877",
}: {
  value: number;
  max: number;
  color?: string;
}) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  const over = max > 0 && value > max;
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-paper-inset">
      <div
        className="h-full rounded-full transition-all"
        style={{ width: `${pct}%`, backgroundColor: over ? "#ae5b65" : color }}
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
  dim = true,
  draggable = false,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  wide?: boolean;
  /** Darken the page behind the dialog. Set false for lightweight popovers. */
  dim?: boolean;
  /** Allow dragging the dialog by its header. */
  draggable?: boolean;
}) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const drag = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);

  useEffect(() => {
    if (!open) setOffset({ x: 0, y: 0 });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    const dialog = dialogRef.current;
    dialog?.focus();
    const trapFocus = (event: KeyboardEvent) => {
      if (event.key !== "Tab" || !dialog) return;
      const dialogs = document.querySelectorAll('[aria-modal="true"]');
      if (dialogs[dialogs.length - 1] !== dialog) return;
      const controls = Array.from(dialog.querySelectorAll<HTMLElement>('a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), iframe, [tabindex="0"]')).filter((element) => element.getClientRects().length > 0);
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (!first) { event.preventDefault(); dialog.focus(); return; }
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog)) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || document.activeElement === dialog)) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", trapFocus);
    return () => { document.removeEventListener("keydown", trapFocus); if (previousFocus?.isConnected) previousFocus.focus(); };
  }, [open]);

  const startDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!draggable) return;
    if ((e.target as HTMLElement).closest("button")) return;
    e.preventDefault();
    drag.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      originX: offset.x,
      originY: offset.y,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const moveDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.pointerId !== e.pointerId) return;
    setOffset({
      x: d.originX + e.clientX - d.startX,
      y: d.originY + e.clientY - d.startY,
    });
  };

  const endDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    if (drag.current?.pointerId === e.pointerId) drag.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  };

  if (!open) return null;

  return (
    <div
      className={`fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 sm:items-center ${
        dim ? "bg-[#302b23]/35 backdrop-blur-[2px]" : "bg-transparent"
      }`}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={`notebook-dialog my-8 w-full ${wide ? "max-w-3xl" : "max-w-lg"} rounded-2xl border border-paper-line bg-paper-page p-5 sm:p-7`}
        style={draggable ? { transform: `translate(${offset.x}px, ${offset.y}px)` } : undefined}
      >
        <div
          className={`mb-4 flex items-center justify-between gap-4 ${
            draggable ? "cursor-move touch-none select-none" : ""
          }`}
          onPointerDown={startDrag}
          onPointerMove={moveDrag}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        >
          <div className="flex min-w-0 items-center gap-2">
            {draggable && (
              <span className="shrink-0 text-sm text-ink-muted" aria-hidden="true">
                ⠿
              </span>
            )}
            <h2 id={titleId} className="dialog-title text-2xl">{title}</h2>
          </div>
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
    <p className="notebook-empty rounded-xl border border-dashed border-paper-line bg-paper-page p-4 text-center text-sm text-ink-muted">
      {children}
    </p>
  );
}

/** Always points left → right: the debtor on the left owes the creditor on the right. */
export function DebtArrow({ className = "my-0.5 h-4 w-16 sm:w-24" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 120 18"
      className={`text-amber-400 ${className}`}
      role="img"
      aria-label="owes"
    >
      <line
        x1="4"
        y1="9"
        x2="103"
        y2="9"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <path d="M103 3 L117 9 L103 15 Z" fill="currentColor" />
    </svg>
  );
}

export function Alert({ kind = "error", children }: { kind?: "error" | "info"; children: ReactNode }) {
  const styles =
    kind === "error"
      ? "border-rose-500/30 bg-rose-500/10 text-rose-300"
      : "border-sky-500/30 bg-sky-500/10 text-sky-300";
  return <div className={`rounded-lg border px-3 py-2 text-sm ${styles}`}>{children}</div>;
}
