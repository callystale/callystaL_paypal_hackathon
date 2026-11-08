"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  api,
  type BudgetQuestion,
  type BudgetSuggestion,
  type SettingsDTO,
  type SummaryDTO,
} from "@/lib/client";
import { round2 } from "@/lib/money";
import { PeriodFilter } from "./PeriodFilter";
import { Alert, Money } from "./ui";

const COLORS = ["#829877", "#9fafa1", "#c69c80", "#8daab1", "#bf919e", "#a59aba", "#c3b270"];
const STARTER = ["Savings", "Everyday spending", "Investing"];

interface DraftCategory {
  key: string;
  id?: string;
  name: string;
  color: string;
  amount: string;
  // The % input keeps its own text so it can hold partial/empty values while typing.
  percent?: string;
}

function newKey(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return Math.random().toString(36).slice(2);
}

/** The percentage text that represents `amount` out of `salary`. */
function percentFromAmount(amount: string, salary: number): string {
  if (salary <= 0 || amount === "") return "";
  const n = Number(amount);
  if (!Number.isFinite(n)) return "";
  return String(Math.round((n / salary) * 1000) / 10);
}

export function IncomePanel({
  settings,
  summary,
  run,
  period,
  onPeriodChange,
}: {
  settings: SettingsDTO | null;
  summary: SummaryDTO | null;
  run: (fn: () => Promise<unknown>) => Promise<void>;
  period: number;
  onPeriodChange: (period: number) => void;
}) {
  const currencyCode = summary?.currency ?? "USD";

  const [salary, setSalary] = useState("");
  const [goals, setGoals] = useState("");
  const [draft, setDraft] = useState<DraftCategory[]>([]);
  const [questions, setQuestions] = useState<BudgetQuestion[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [suggestion, setSuggestion] = useState<BudgetSuggestion | null>(null);
  const [instruction, setInstruction] = useState("");
  const [working, setWorking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Snapshots of the draft taken just before each AI change, for "revert".
  const [history, setHistory] = useState<DraftCategory[][]>([]);

  const initSig = useRef<string | null>(null);

  useEffect(() => {
    if (!settings) return;
    const categories = summary?.categories ?? [];
    const sig = JSON.stringify([
      settings.salary,
      settings.goals,
      categories.map((c) => [c.id, c.name, c.budget]),
    ]);
    if (sig === initSig.current) return;
    initSig.current = sig;

    setSalary(settings.salary ? String(settings.salary) : "");
    setGoals(settings.goals ?? "");
    setQuestions([]);
    setAnswers({});
    setSuggestion(null);
    setHistory([]);
    const salaryValue = settings.salary || 0;
    setDraft(
      categories.length > 0
        ? categories.map((c) => {
            const amount = c.budget != null ? String(c.budget) : "";
            return {
              key: c.id,
              id: c.id,
              name: c.name,
              color: c.color,
              amount,
              percent: percentFromAmount(amount, salaryValue),
            };
          })
        : STARTER.map((name, i) => ({
            key: newKey(),
            name,
            color: COLORS[i % COLORS.length],
            amount: "",
            percent: "",
          })),
    );
  }, [settings, summary]);

  const salaryNum = Number(salary) || 0;

  const allocated = useMemo(
    () => round2(draft.reduce((sum, d) => sum + (Number(d.amount) || 0), 0)),
    [draft],
  );
  const unallocated = round2(salaryNum - allocated);

  const nameError = useMemo(() => {
    const cleaned = draft.map((d) => d.name.trim());
    if (cleaned.some((n) => !n)) return "Every category needs a name.";
    if (new Set(cleaned.map((n) => n.toLowerCase())).size !== cleaned.length) {
      return "Category names must be unique.";
    }
    return null;
  }, [draft]);

  const canAsk = salaryNum > 0 && draft.some((d) => d.name.trim()) && !nameError;
  const hasInstruction = instruction.trim().length > 0;

  const updateRow = (key: string, patch: Partial<DraftCategory>) =>
    setDraft((rows) => rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  // Editing the amount keeps the % display in sync with it.
  const changeAmount = (key: string, value: string) => {
    updateRow(key, { amount: value, percent: percentFromAmount(value, salaryNum) });
  };

  // Editing the % stores the raw text (so partial input like "12." survives) and
  // recomputes the amount from the monthly income. Clearing it clears the amount.
  const changePercent = (key: string, value: string) => {
    if (salaryNum <= 0) return;
    if (value === "") {
      updateRow(key, { percent: "", amount: "" });
      return;
    }
    const pct = Number(value);
    if (!Number.isFinite(pct)) {
      updateRow(key, { percent: value });
      return;
    }
    updateRow(key, { percent: value, amount: String(round2((salaryNum * pct) / 100)) });
  };

  // Changing income keeps every % in sync with its (unchanged) amount.
  const changeSalary = (value: string) => {
    setSalary(value);
    const next = Number(value) || 0;
    setDraft((rows) => rows.map((r) => ({ ...r, percent: percentFromAmount(r.amount, next) })));
  };

  const addCategory = () =>
    setDraft((rows) => [
      ...rows,
      { key: newKey(), name: "", color: COLORS[rows.length % COLORS.length], amount: "", percent: "" },
    ]);

  const removeCategory = (key: string) =>
    setDraft((rows) => rows.filter((r) => r.key !== key));

  const categoryPayload = () =>
    draft
      .filter((d) => d.name.trim())
      .map((d) => ({
        name: d.name.trim(),
        budget: d.amount === "" ? null : round2(Number(d.amount) || 0),
      }));

  const applySuggestion = (res: BudgetSuggestion) => {
    // Remember the state before this prompt so it can be reverted.
    setHistory((h) => [...h, draft.map((d) => ({ ...d }))]);

    const byName = new Map(
      res.allocations.map((a) => [a.category.trim().toLowerCase(), a.amount]),
    );
    setDraft((rows) => {
      const next = rows.map((r) => {
        const amount = byName.get(r.name.trim().toLowerCase());
        if (amount === undefined) return { ...r };
        return { ...r, amount: String(amount), percent: percentFromAmount(String(amount), salaryNum) };
      });
      // The AI may propose new categories during a revision.
      const known = new Set(next.map((r) => r.name.trim().toLowerCase()));
      for (const a of res.allocations) {
        const key = a.category.trim().toLowerCase();
        if (known.has(key)) continue;
        known.add(key);
        next.push({
          key: newKey(),
          name: a.category.trim(),
          color: COLORS[next.length % COLORS.length],
          amount: String(a.amount),
          percent: percentFromAmount(String(a.amount), salaryNum),
        });
      }
      return next;
    });
  };

  const revert = () => {
    if (history.length === 0) return;
    const previous = history[history.length - 1];
    setDraft(previous.map((d) => ({ ...d })));
    setHistory(history.slice(0, -1));
    setSuggestion(null);
    setInstruction("");
  };

  const askQuestions = async () => {
    setWorking(true);
    setError(null);
    try {
      const res = await api.post<{ questions: BudgetQuestion[] }>("/api/budget/questions", {
        salary: salaryNum,
        goals: goals.trim() || null,
        categories: categoryPayload(),
      });
      setQuestions(res.questions);
      setAnswers({});
      setSuggestion(null);
      setInstruction("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load questions");
    } finally {
      setWorking(false);
    }
  };

  const requestSplit = async (mode: "split" | "revise") => {
    setWorking(true);
    setError(null);
    try {
      const res = await api.post<BudgetSuggestion>("/api/budget/suggest", {
        salary: salaryNum,
        goals: goals.trim() || null,
        instruction: mode === "revise" ? instruction.trim() || null : null,
        answers: questions
          .map((q) => ({ question: q.question, answer: (answers[q.id] ?? "").trim() }))
          .filter((a) => a.answer),
        categories: categoryPayload(),
      });
      setSuggestion(res);
      applySuggestion(res);
      if (mode === "revise") setInstruction("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not build a suggestion");
    } finally {
      setWorking(false);
    }
  };

  // One button that advances the flow: ask -> suggest -> start over (or revise).
  const onPrimary = () => {
    if (hasInstruction) return requestSplit("revise");
    if (suggestion) return askQuestions();
    if (questions.length > 0) return requestSplit("split");
    return askQuestions();
  };

  const primaryLabel = hasInstruction
    ? "Revise my split"
    : suggestion
      ? "Ask AI again"
      : questions.length > 0
        ? "Get suggested split"
        : "Ask AI to plan my budget";

  const save = async () => {
    if (nameError || salaryNum <= 0) return;
    setBusy(true);
    setError(null);
    await run(() =>
      api.put("/api/budget", {
        salary: salaryNum,
        goals: goals.trim() || null,
        categories: draft
          .filter((d) => d.name.trim())
          .map((d) => ({
            ...(d.id ? { id: d.id } : {}),
            name: d.name.trim(),
            color: d.color,
            budget: d.amount === "" ? null : round2(Number(d.amount) || 0),
          })),
      }),
    );
    setBusy(false);
  };

  const denom = Math.max(allocated, salaryNum, 1);

  return (
    <section id="income" tabIndex={-1} className="card notebook-page">
      <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-brand-400">
            Step 1 · Monthly budget
          </p>
          <h2 className="text-lg font-semibold">Set up a personalized monthly budget</h2>
          <p className="mt-1 max-w-2xl text-sm text-ink-muted">
            Tell the AI your income and what matters to you. It asks a few questions, then suggests
            how to split the money across your categories — edit anything before saving.
          </p>
          {summary && (
            <p className="mt-1 text-xs text-ink-muted">
              <Money amount={summary.totals.spent} currency={currencyCode} /> spent of{" "}
              <Money amount={summary.totals.budget} currency={currencyCode} /> budgeted this period.
            </p>
          )}
        </div>
        <PeriodFilter
          value={period}
          onChange={onPeriodChange}
          startDay={settings?.monthStartDay ?? 1}
          label="Budget month"
        />
      </header>

      {error && (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      )}

      {/* --- AI planning block (top) --- */}
      <div className="rounded-xl border border-brand-500/30 bg-brand-500/10 p-4">
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label className="label">Monthly take-home income</label>
            <input
              className="input"
              type="number"
              min="0"
              inputMode="decimal"
              placeholder="e.g. 2000"
              value={salary}
              onChange={(e) => changeSalary(e.target.value)}
            />
          </div>
          <div className="sm:col-span-2">
            <label className="label">Goals &amp; priorities</label>
            <textarea
              className="input min-h-[42px] resize-y"
              rows={1}
              placeholder="e.g. Rent is $800. Save $600 for a trip in six months. Spend less on takeout."
              value={goals}
              onChange={(e) => setGoals(e.target.value)}
            />
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button className="btn-primary" onClick={onPrimary} disabled={!canAsk || working}>
            {working ? "Thinking…" : primaryLabel}
          </button>
          {history.length > 0 && (
            <button className="btn-secondary" onClick={revert} disabled={working}>
              ↩ Revert last AI change
            </button>
          )}
          <span className="text-xs text-ink-muted">
            The AI uses your income, goals and categories to plan your budget.
          </span>
        </div>

        {questions.length > 0 && (
          <div className="mt-4 flex flex-col gap-3">
            {questions.map((q) => (
              <div key={q.id}>
                <label className="label normal-case tracking-normal text-ink-soft">
                  {q.question}
                </label>
                <input
                  className="input"
                  placeholder={q.hint ?? "Your answer"}
                  value={answers[q.id] ?? ""}
                  onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))}
                />
              </div>
            ))}
          </div>
        )}

        {suggestion && (
          <div className="mt-4 rounded-lg border border-paper-line bg-paper-page p-3">
            <p className="text-sm text-ink">{suggestion.explanation}</p>
            <p className="mt-1 text-xs text-ink-muted">
              {suggestion.source === "ollama" ? "Suggested by your local AI" : "Suggested heuristically"} ·
              edit any amount in the categories below.
            </p>

            {suggestion.shortfall > 0 && (
              <p className="mt-2 text-xs text-amber-400">
                Your goals and fixed costs exceed your income by {" "}
                <Money amount={suggestion.shortfall} currency={currencyCode} /> — consider reducing a
                goal or moving it later.
              </p>
            )}

            <input
              className="input mt-3"
              placeholder='Want a change? e.g. "put $50 more toward groceries, take it from entertainment"'
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
            />
          </div>
        )}
      </div>

      {/* --- Categories (below the AI block) --- */}
      <div className="mt-5">
        <div className="mb-2 flex items-center justify-between">
          <p className="label mb-0">Budget categories</p>
          <button className="btn-ghost px-2 py-1 text-xs" onClick={addCategory}>
            + Add category
          </button>
        </div>

        <div className="flex flex-col gap-2">
          {draft.map((row) => (
            <div key={row.key} className="group flex items-center gap-2">
              <span
                className="h-3 w-3 shrink-0 rounded-full"
                style={{ backgroundColor: row.color }}
              />
              <input
                className="input flex-1"
                placeholder="Category name"
                value={row.name}
                onChange={(e) => updateRow(row.key, { name: e.target.value })}
              />
              <div className="relative w-32">
                <input
                  className="input pr-7 text-right"
                  type="number"
                  min="0"
                  inputMode="decimal"
                  placeholder="0"
                  value={row.amount}
                  onChange={(e) => changeAmount(row.key, e.target.value)}
                />
                <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-ink-muted">
                  {currencyCode === "USD" ? "$" : currencyCode}
                </span>
              </div>
              <div className="relative w-16 shrink-0">
                <input
                  className="input pr-5 text-right"
                  type="number"
                  min="0"
                  max="100"
                  step="0.1"
                  inputMode="decimal"
                  placeholder="0"
                  disabled={salaryNum <= 0}
                  value={row.percent ?? ""}
                  onChange={(e) => changePercent(row.key, e.target.value)}
                />
                <span className="pointer-events-none absolute inset-y-0 right-2 flex items-center text-xs text-ink-muted">
                  %
                </span>
              </div>
              <button
                className="btn-ghost px-2"
                title="Remove category"
                onClick={() => removeCategory(row.key)}
                disabled={draft.length <= 1}
              >
                ✕
              </button>
            </div>
          ))}
        </div>

        {draft.length > 0 && allocated > 0 && (
          <div className="mt-3 flex h-2.5 w-full overflow-hidden rounded-full bg-paper-inset">
            {draft.map((d) => (
              <span
                key={d.key}
                style={{
                  width: `${((Number(d.amount) || 0) / denom) * 100}%`,
                  backgroundColor: d.color,
                }}
              />
            ))}
          </div>
        )}
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-paper-line pt-4">
        <p className="text-sm text-ink-muted">
          {salaryNum > 0 ? (
            <>
              Allocated <Money amount={allocated} currency={currencyCode} />
              {allocated > 0 && (
                <> ({Math.round((allocated / salaryNum) * 100)}%)</>
              )}{" "}
              of <Money amount={salaryNum} currency={currencyCode} />
              {Math.abs(unallocated) < 0.01 ? (
                <span className="text-emerald-400"> · fully allocated</span>
              ) : unallocated > 0 ? (
                <span className="text-ink-muted"> · <Money amount={unallocated} currency={currencyCode} /> unallocated</span>
              ) : (
                <span className="text-rose-400"> · <Money amount={Math.abs(unallocated)} currency={currencyCode} /> over income</span>
              )}
            </>
          ) : (
            "Enter your income to start planning."
          )}
        </p>
        <button
          className="btn-primary"
          onClick={save}
          disabled={busy || salaryNum <= 0 || !!nameError}
        >
          {busy ? "Saving…" : "Save budget"}
        </button>
      </div>
      {nameError && <p className="mt-2 text-xs text-rose-400">{nameError}</p>}
    </section>
  );
}
