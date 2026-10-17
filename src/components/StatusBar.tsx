"use client";

import type { StatusDTO } from "@/lib/client";

function Dot({ ok }: { ok: boolean }) {
  return (
    <span
      className={`inline-block h-2 w-2 rounded-full ${ok ? "bg-emerald-500" : "bg-slate-600"}`}
    />
  );
}

function Pill({
  label,
  ok,
  detail,
}: {
  label: string;
  ok: boolean;
  detail: string;
}) {
  return (
    <div className="flex items-center gap-2 rounded-full border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-slate-300">
      <Dot ok={ok} />
      <span className="font-medium text-slate-100">{label}</span>
      <span className="text-slate-400">{detail}</span>
    </div>
  );
}

export function StatusBar({ status }: { status: StatusDTO | null }) {
  if (!status) return null;
  return (
    <div className="flex flex-wrap gap-2">
      <Pill
        label="AI"
        ok={status.ollama.configured}
        detail={status.ollama.configured ? status.ollama.model : "Ollama offline · using heuristics"}
      />
      <Pill
        label="Product search"
        ok={status.channel3.configured}
        detail={status.channel3.configured ? "Channel3 live" : "fallback catalogue"}
      />
      <Pill
        label="Payments"
        ok={status.paypal.configured}
        detail={status.paypal.configured ? `PayPal ${status.paypal.env}` : "sandbox not configured"}
      />
    </div>
  );
}
