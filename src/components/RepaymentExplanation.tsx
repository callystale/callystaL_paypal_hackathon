"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { api, type GroupDetailDTO } from "@/lib/client";
import { repaymentExplanation, type RepaymentFact } from "@/lib/repayment-explanation";
import { Alert, Spinner } from "./ui";

function FactList({ facts }: { facts: RepaymentFact[] }) {
  return <ul className="space-y-1">{facts.map((fact) => <li key={fact.id}>{fact.text}</li>)}</ul>;
}

export function RepaymentExplanation({ group }: { group: GroupDetailDTO }) {
  const details = useMemo(() => repaymentExplanation(group), [group]);
  const [expanded, setExpanded] = useState(false);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<{ source: "ollama" | "calculated"; facts: RepaymentFact[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const requestRef = useRef(0);
  const fingerprint = JSON.stringify([group.id, group.expenses, group.repayments, group.balances, group.directionChanges, group.settlements]);
  useEffect(() => {
    requestRef.current += 1;
    setExpanded(false);
    setQuestion("");
    setAnswer(null);
    setError(null);
    setBusy(false);
    return () => { requestRef.current += 1; };
  }, [fingerprint]);
  const ask = async () => {
    if (!question.trim() || busy) return;
    const current = ++requestRef.current;
    setBusy(true);
    setError(null);
    try {
      const response = await api.post<{ source: "ollama" | "calculated"; facts: RepaymentFact[] }>(`/api/groups/${group.id}/explain`, { question: question.trim() });
      if (current === requestRef.current) setAnswer(response);
    } catch (e) {
      if (current === requestRef.current) setError(e instanceof Error ? e.message : "Could not explain this repayment.");
    } finally {
      if (current === requestRef.current) setBusy(false);
    }
  };

  if (!group.expenses.length && !group.settlements.length && !group.directionChanges.length) return null;
  return <div className="mb-4 rounded-xl border border-paper-line bg-paper-page/60 p-3 text-sm">
    <button
      className="btn-ghost w-full justify-between text-left"
      type="button"
      aria-expanded={expanded}
      aria-controls={`repayment-help-${group.id}`}
      onClick={() => setExpanded((value) => !value)}
    >
      <span>Ask AI about repayments</span>
      <span aria-hidden="true">{expanded ? "−" : "+"}</span>
    </button>
    {expanded && <div id={`repayment-help-${group.id}`}>
    <form className="mt-4 space-y-2 border-t border-paper-line pt-3" onSubmit={(event) => { event.preventDefault(); if (question.trim() && !busy) void ask(); }}>
      <label htmlFor={`repayment-question-${group.id}`} className="block text-xs font-semibold text-ink">What would you like explained?</label>
      <div className="flex flex-wrap gap-2">
        <input id={`repayment-question-${group.id}`} className="input min-w-0 flex-1 basis-48" value={question} maxLength={500} onChange={(event) => setQuestion(event.target.value)} placeholder="Why does Nguyen pay Mia?" />
        <button className="btn-secondary btn-sm" type="submit" disabled={!question.trim() || busy}>{busy ? <Spinner /> : null} Ask AI</button>
      </div>
      <p className="text-[11px] text-ink-muted">AI can pick the most relevant facts. All amounts come from the group ledger.</p>
    </form>
    {error && <div className="mt-2"><Alert>{error}</Alert></div>}
    {answer && <div className="mt-3 rounded-lg bg-paper-base/70 p-3 text-xs text-ink-soft" aria-live="polite">
      <p className="mb-2 font-semibold text-ink">{answer.source === "ollama" ? "Relevant facts selected by AI" : "Calculated breakdown · AI selection unavailable"}</p>
      {answer.facts.length ? <FactList facts={answer.facts} /> : <p>Add expenses to explain a repayment.</p>}
      <details className="mt-3 border-t border-paper-line pt-2">
        <summary className="cursor-pointer font-semibold text-ink">View full repayment breakdown</summary>
    <div className="mt-3 space-y-3 text-xs leading-relaxed text-ink-soft">
      <div>
        <p className="mb-1 font-semibold text-ink">Original debts from expenses</p>
        {details.original.length ? <FactList facts={details.original} /> : <p>No one owes another member for the recorded expense shares.</p>}
        <p className="mt-1 text-ink-muted">These are the original shares before payments or direction corrections.</p>
      </div>
      {details.changes.length > 0 && <div><p className="mb-1 font-semibold text-ink">Payments and corrections</p><FactList facts={details.changes} /></div>}
      <div><p className="mb-1 font-semibold text-ink">Current net balances</p><FactList facts={details.balances} /></div>
      {details.shortcuts.length > 0 && <div><p className="mb-1 font-semibold text-brand-300">How amounts combine or cancel</p><FactList facts={details.shortcuts} /></div>}
      <div><p className="mb-1 font-semibold text-ink">Suggested transfers</p>
        {details.transfers.length ? <FactList facts={details.transfers} /> : <p>There are no remaining transfers.</p>}
      </div>
    </div>
      </details>
    </div>}
    </div>}
  </div>;
}
