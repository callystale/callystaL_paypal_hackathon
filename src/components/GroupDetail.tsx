"use client";

import { useEffect, useMemo, useState } from "react";
import type {
  CategoryDTO,
  GroupDetailDTO,
  GroupExpenseDTO,
  GroupMemberDTO,
  StatusDTO,
  SuggestedRepayment,
} from "@/lib/client";
import { fromCents, settlementLocksExpenses, splitEqually, toCents } from "@/lib/group";
import { memberPaypalEmailSchema } from "@/lib/group-member";
import { paypalPaymentLink, settlementReferenceLabel } from "@/lib/payment-link";
import { DebtArrow, EmptyState, Modal, Money, Spinner } from "./ui";
import { RepaymentExplanation } from "./RepaymentExplanation";

export interface ExpenseInput {
  description: string;
  amount: number;
  payerId: string;
  occurredAt: string;
  category: string | null;
  participantIds: string[];
  addToBudget: boolean;
  categoryId: string | null;
}

export interface ExpenseUpdateInput {
  description: string;
  amount: number;
  payerId: string;
  occurredAt: string;
  category: string | null;
  shares: Array<{ memberId: string; amountCents: number }>;
}

export function GroupDetail({
  group,
  status,
  categories,
  busy,
  onAddMember,
  onUpdateMember,
  onRemoveMember,
  onSetSelf,
  onCreateExpense,
  onUpdateExpense,
  onDeleteExpense,
  onToggleBudget,
  onReverseRepayment,
  onMarkSettled,
  onDeleteSettlement,
  onRequestPayment,
  onPayWithPayPal,
  onDeleteGroup,
}: {
  group: GroupDetailDTO;
  status: StatusDTO | null;
  categories: CategoryDTO[];
  busy: string | null;
  onAddMember: (paypalAddress: string, nickname: string) => Promise<boolean>;
  onUpdateMember: (
    memberId: string,
    input: { displayName: string; paypalAddress: string | null },
  ) => Promise<boolean>;
  onRemoveMember: (memberId: string) => Promise<void>;
  onSetSelf: (memberId: string) => Promise<void>;
  onCreateExpense: (input: ExpenseInput) => Promise<boolean>;
  onUpdateExpense: (expenseId: string, input: ExpenseUpdateInput) => Promise<boolean>;
  onDeleteExpense: (expenseId: string) => Promise<void>;
  onToggleBudget: (
    expenseId: string,
    shareId: string,
    categoryId: string | null,
    linked: boolean,
  ) => Promise<void>;
  onReverseRepayment: (repayment: SuggestedRepayment) => Promise<void>;
  onMarkSettled: (repayment: SuggestedRepayment) => Promise<void>;
  onDeleteSettlement: (settlementId: string) => Promise<void>;
  onRequestPayment: (repayment: SuggestedRepayment) => void;
  onPayWithPayPal: (repayment: SuggestedRepayment) => void;
  onDeleteGroup: () => Promise<void>;
}) {
  const selfMember = group.members.find((member) => member.isSelf) ?? null;
  const [memberPaypal, setMemberPaypal] = useState("");
  const [memberNickname, setMemberNickname] = useState("");
  const [editingMember, setEditingMember] = useState<GroupMemberDTO | null>(null);
  const [memberDraft, setMemberDraft] = useState({
    displayName: "",
    paypalAddress: "",
  });
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [payerId, setPayerId] = useState(
    selfMember?.id ?? group.members[0]?.id ?? "",
  );
  const [expenseDate, setExpenseDate] = useState(todayInput());
  const [expenseCategory, setExpenseCategory] = useState("");
  const [participantIds, setParticipantIds] = useState<string[]>(
    group.members.map((member) => member.id),
  );
  const [addToBudget, setAddToBudget] = useState(false);
  const [categoryId, setCategoryId] = useState("");
  const [shareCategories, setShareCategories] = useState<Record<string, string>>({});
  const [editingExpenseId, setEditingExpenseId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState({
    description: "",
    amount: "",
    payerId: "",
    date: todayInput(),
    category: "",
    shares: {} as Record<string, string>,
  });

  // Members can be added/removed while the form is open; keep selections valid.
  useEffect(() => {
    const ids = new Set(group.members.map((member) => member.id));
    if (!ids.has(payerId)) {
      setPayerId(selfMember?.id ?? group.members[0]?.id ?? "");
    }
    setParticipantIds((current) => {
      const valid = current.filter((id) => ids.has(id));
      return valid.length === current.length ? current : valid;
    });
  }, [group.members, payerId, selfMember?.id]);

  const selfSelected = Boolean(
    selfMember && participantIds.includes(selfMember.id),
  );
  const amountNumber = Number(amount);

  const preview = useMemo(() => {
    if (!Number.isFinite(amountNumber) || amountNumber <= 0) return null;
    if (participantIds.length === 0) return null;
    const cents = toCents(amountNumber);
    if (cents <= 0) return null;
    try {
      return splitEqually(cents, participantIds);
    } catch {
      return null;
    }
  }, [amountNumber, participantIds]);

  const nameById = new Map(group.members.map((member) => [member.id, member.displayName]));
  const canSubmit =
    description.trim().length > 0 &&
    Number.isFinite(amountNumber) &&
    amountNumber > 0 &&
    Boolean(payerId) &&
    participantIds.length > 0 &&
    busy !== "expense-create";

  const yourNet = group.totals.yourNetCents;
  const editLocked = group.settlements.some((settlement) => settlementLocksExpenses(settlement.status));

  const editAmountNumber = Number(editDraft.amount);
  const editAmountCents = toCents(
    Number.isFinite(editAmountNumber) ? editAmountNumber : 0,
  );
  const editShareRows = group.members.map((member) => ({
    member,
    amountCents: toCents(
      Math.max(0, Number(editDraft.shares[member.id]) || 0),
    ),
  }));
  const editShareTotal = editShareRows.reduce(
    (sum, row) => sum + row.amountCents,
    0,
  );
  const editRemaining = editAmountCents - editShareTotal;
  const canSaveEdit =
    Boolean(editingExpenseId) &&
    editDraft.description.trim().length > 0 &&
    editAmountCents > 0 &&
    Boolean(editDraft.payerId) &&
    editShareTotal > 0 &&
    editRemaining === 0 &&
    busy !== `expense-edit-${editingExpenseId}`;

  const submitExpense = async () => {
    if (!canSubmit) return;
    const created = await onCreateExpense({
      description: description.trim(),
      amount: amountNumber,
      payerId,
      occurredAt: new Date(`${expenseDate}T12:00:00`).toISOString(),
      category: expenseCategory.trim() || null,
      participantIds,
      addToBudget: addToBudget && selfSelected,
      categoryId: categoryId || null,
    });
    if (created) {
      setDescription("");
      setAmount("");
      setExpenseCategory("");
      setAddToBudget(false);
    }
  };

  const addMember = async () => {
    const email = memberPaypalEmailSchema.safeParse(memberPaypal);
    if (!email.success || busy === "member-add") return;
    const added = await onAddMember(email.data, memberNickname.trim());
    if (added) {
      setMemberPaypal("");
      setMemberNickname("");
    }
  };

  const startEditMember = (member: GroupMemberDTO) => {
    setEditingMember(member);
    setMemberDraft({
      displayName: member.displayName === member.paypalAddress ? "" : member.displayName,
      paypalAddress: member.paypalAddress ?? "",
    });
  };

  const saveMember = async () => {
    if (!editingMember) return;
    const name = memberDraft.displayName.trim();
    if ((!name && !memberDraft.paypalAddress.trim()) || busy === `member-update-${editingMember.id}`) return;
    const saved = await onUpdateMember(editingMember.id, {
      displayName: name,
      paypalAddress: memberDraft.paypalAddress.trim() || null,
    });
    if (saved) setEditingMember(null);
  };

  const startEditExpense = (expense: GroupExpenseDTO) => {
    const shares: Record<string, string> = {};
    for (const member of group.members) {
      const share = expense.shares.find((row) => row.memberId === member.id);
      shares[member.id] =
        share && share.amountCents > 0
          ? fromCents(share.amountCents).toFixed(2)
          : "";
    }
    setEditingExpenseId(expense.id);
    setEditDraft({
      description: expense.description,
      amount: fromCents(expense.amountCents).toFixed(2),
      payerId: expense.payerId,
      date: toDateInput(expense.occurredAt),
      category: expense.category ?? "",
      shares,
    });
  };

  const splitEditEqually = () => {
    if (editAmountCents <= 0 || group.members.length === 0) return;
    const split = splitEqually(
      editAmountCents,
      group.members.map((member) => member.id),
    );
    setEditDraft((current) => ({
      ...current,
      shares: Object.fromEntries(
        split.map((share) => [
          share.memberId,
          fromCents(share.amountCents).toFixed(2),
        ]),
      ),
    }));
  };

  const saveExpense = async () => {
    if (!editingExpenseId || !canSaveEdit) return;
    const updated = await onUpdateExpense(editingExpenseId, {
      description: editDraft.description.trim(),
      amount: editAmountNumber,
      payerId: editDraft.payerId,
      occurredAt: new Date(`${editDraft.date}T12:00:00`).toISOString(),
      category: editDraft.category.trim() || null,
      shares: editShareRows
        .filter((row) => row.amountCents > 0)
        .map((row) => ({
          memberId: row.member.id,
          amountCents: row.amountCents,
        })),
    });
    if (updated) {
      setEditingExpenseId(null);
      setShareCategories({});
    }
  };

  return (
    <div className="space-y-5">
      <datalist id="group-expense-categories">
        {categories.map((category) => (
          <option key={category.id} value={category.name} />
        ))}
      </datalist>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-xl font-semibold">{group.name}</h3>
            <span className="badge bg-slate-800 text-slate-300">{group.currency}</span>
          </div>
          <p className="mt-1 text-xs text-slate-400">
            {group.members.length} member{group.members.length === 1 ? "" : "s"} ·{" "}
            {group.expenses.length} expense{group.expenses.length === 1 ? "" : "s"} ·{" "}
            <Cents cents={group.totals.spentCents} currency={group.currency} /> shared
          </p>
        </div>
        <div className="flex items-center gap-3">
          {yourNet !== null && (
            <div
              className={`rounded-lg border px-3 py-1.5 text-sm ${
                yourNet > 0
                  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                  : yourNet < 0
                    ? "border-rose-500/30 bg-rose-500/10 text-rose-300"
                    : "border-slate-700 bg-slate-800/50 text-slate-300"
              }`}
            >
              {yourNet > 0 ? "You are owed " : yourNet < 0 ? "You owe " : "You are settled"}
              {yourNet !== 0 && (
                <Money
                  amount={fromCents(Math.abs(yourNet))}
                  currency={group.currency}
                  className="font-semibold"
                />
              )}
            </div>
          )}
          <button
            className="btn-ghost px-2 py-1 text-xs"
            disabled={busy === "group-delete"}
            onClick={() => {
              if (
                window.confirm(
                  `Delete "${group.name}" and its expenses? Budget purchases copied from your shares will also be removed.`,
                )
              ) {
                void onDeleteGroup();
              }
            }}
          >
            Delete group
          </button>
        </div>
      </header>

      <div className="grid gap-4 2xl:grid-cols-2 2xl:items-start">
        <section className="rounded-xl border border-slate-800 bg-slate-950/40 p-4">
          <div className="mb-2 flex items-center justify-between gap-2">
            <h4 className="text-sm font-semibold uppercase tracking-wide text-slate-300">
              Members
            </h4>
            {!selfMember && (
              <span className="text-[11px] text-amber-300">Mark yourself below</span>
            )}
          </div>

          <ul className="divide-y divide-slate-800">
            {group.members.map((member) => {
              const balance = group.balances.find(
                (row) => row.memberId === member.id,
              );
              const net = balance?.netCents ?? 0;
              return (
                <li key={member.id} className="flex items-center gap-2 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1.5 text-sm font-medium">
                      <span className="truncate">{member.displayName}</span>
                      {member.isSelf && (
                        <span className="badge bg-brand-500/20 text-brand-300">you</span>
                      )}
                    </p>
                    <p className="truncate text-xs text-slate-400">
                      Paid <Cents cents={balance?.paidCents ?? 0} currency={group.currency} /> ·{" "}
                      {member.isSelf ? "your" : "their"} share{" "}
                      <Cents cents={balance?.shareCents ?? 0} currency={group.currency} />
                    </p>
                    <p className="truncate text-[11px] text-sky-300/80">
                      {member.paypalAddress
                        ? `PayPal: ${member.paypalAddress}`
                        : "No PayPal address yet"}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 text-right text-xs font-medium ${
                      net > 0
                        ? "text-emerald-300"
                        : net < 0
                          ? "text-rose-300"
                          : "text-slate-400"
                    }`}
                  >
                    {net > 0 ? "is owed " : net < 0 ? "owes " : "settled"}
                    {net !== 0 && (
                      <Cents cents={Math.abs(net)} currency={group.currency} />
                    )}
                  </span>
                  <button
                    className="btn-ghost shrink-0 px-1.5 py-1 text-[11px]"
                    title="Edit nickname or PayPal address"
                    aria-label={`Edit nickname or PayPal address for ${member.displayName}`}
                    disabled={busy === `member-update-${member.id}`}
                    onClick={() => startEditMember(member)}
                  >
                    ✎
                  </button>
                  {!member.isSelf && (
                    <button
                      className="btn-ghost shrink-0 px-1.5 py-1 text-[11px]"
                      title="Mark this member as you"
                      disabled={busy === `member-self-${member.id}`}
                      onClick={() => void onSetSelf(member.id)}
                    >
                      That&apos;s me
                    </button>
                  )}
                  {!member.isSelf && (
                    <button
                      className="btn-ghost shrink-0 px-1 py-1 text-[11px]"
                      title="Remove member"
                      disabled={busy === `member-remove-${member.id}`}
                      onClick={() => {
                        if (window.confirm(`Remove ${member.displayName} from the group?`)) {
                          void onRemoveMember(member.id);
                        }
                      }}
                    >
                      ✕
                    </button>
                  )}
                </li>
              );
            })}
          </ul>

          <p className="mt-2 rounded-lg bg-slate-900/80 px-2 py-1.5 text-[11px] leading-relaxed text-slate-500">
            <span className="text-slate-300">Paid</span> = what this member fronted for the
            group. <span className="text-slate-300">Share</span> = their part of all expenses.{" "}
            <span className="text-slate-300">Net</span> = paid − share + settlements + direction changes.
          </p>

          <div className="mt-3 space-y-2">
            <div className="flex flex-wrap gap-2">
              <input
                className="input min-w-0 flex-1 basis-36"
                aria-label="Friend’s nickname (optional)"
                placeholder="Nickname (optional)"
                autoComplete="off"
                maxLength={120}
                value={memberNickname}
                onChange={(e) => setMemberNickname(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void addMember();
                  }
                }}
              />
              <input
                className="input min-w-0 flex-1 basis-48"
                type="email"
                aria-label="Friend’s PayPal email"
                autoComplete="off"
                placeholder="Friend’s PayPal email"
                value={memberPaypal}
                maxLength={120}
                onChange={(e) => setMemberPaypal(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void addMember();
                  }
                }}
              />
              <button
                className="btn-secondary shrink-0"
                disabled={!memberPaypalEmailSchema.safeParse(memberPaypal).success || busy === "member-add"}
                onClick={() => void addMember()}
              >
                {busy === "member-add" ? <Spinner /> : null} Add
              </button>
            </div>
          </div>
          <p className="mt-1.5 text-[11px] text-slate-500">
            Add a friend using their PayPal email and an optional nickname. Leave the nickname
            blank to display their email. You can edit it later with the pencil. Adding an email does not verify
            their PayPal account or retrieve their profile name.
          </p>
        </section>

        <section className="rounded-xl border border-slate-800 bg-slate-950/40 p-4">
          <h4 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-300">
            Add expense
          </h4>
          <div className="grid grid-cols-2 gap-2">
            <div className="col-span-2">
              <input
                className="input"
                placeholder="What was it for?"
                value={description}
                maxLength={140}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
            <input
              className="input"
              type="number"
              min="0"
              step="0.01"
              placeholder="Total amount"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
            <input
              className="input"
              type="date"
              value={expenseDate}
              onChange={(e) => setExpenseDate(e.target.value)}
            />
            <label className="col-span-2 text-xs text-slate-400">
              Paid by
              <select
                className="input mt-1"
                value={payerId}
                onChange={(e) => setPayerId(e.target.value)}
              >
                {group.members.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.displayName}
                    {member.isSelf ? " (you)" : ""}
                  </option>
                ))}
              </select>
            </label>
            <label className="col-span-2 text-xs text-slate-400">
              Category (optional)
              <input
                className="input mt-1"
                list="group-expense-categories"
                placeholder="e.g. Travel, Groceries, Utilities"
                value={expenseCategory}
                maxLength={60}
                onChange={(e) => setExpenseCategory(e.target.value)}
              />
            </label>
          </div>

          <div className="mt-3">
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <span className="text-xs text-slate-400">Split equally between</span>
              <span className="flex gap-2 text-[11px]">
                <button
                  type="button"
                  className="underline text-slate-400 hover:text-slate-200"
                  onClick={() =>
                    setParticipantIds(group.members.map((member) => member.id))
                  }
                >
                  Select all
                </button>
                <button
                  type="button"
                  className="underline text-slate-400 hover:text-slate-200"
                  onClick={() => setParticipantIds([])}
                >
                  Clear
                </button>
              </span>
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {group.members.map((member) => (
                <label
                  key={member.id}
                  className="flex items-center gap-2 rounded-md border border-slate-800 px-2 py-1.5 text-sm"
                >
                  <input
                    type="checkbox"
                    className="accent-brand-500"
                    checked={participantIds.includes(member.id)}
                    onChange={(e) =>
                      setParticipantIds((current) =>
                        e.target.checked
                          ? [...current, member.id]
                          : current.filter((id) => id !== member.id),
                      )
                    }
                  />
                  <span className="truncate">
                    {member.displayName}
                    {member.isSelf ? " (you)" : ""}
                  </span>
                </label>
              ))}
            </div>
          </div>

          {preview && (
            <div className="mt-3 rounded-lg border border-slate-800 bg-slate-900/70 p-2.5 text-xs">
              <p className="font-medium text-slate-300">Equal split preview</p>
              <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-slate-400">
                {preview.map((share) => (
                  <span key={share.memberId}>
                    {nameById.get(share.memberId) ?? "Member"}:{" "}
                    <Cents cents={share.amountCents} currency={group.currency} />
                  </span>
                ))}
              </div>
              <p className="mt-1 text-[11px] text-slate-500">
                Leftover cents are assigned one at a time, so the shares add up exactly.
              </p>
            </div>
          )}

          <div className="mt-3 rounded-lg border border-slate-800 p-2.5">
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                className="mt-0.5 accent-brand-500"
                checked={addToBudget}
                disabled={!selfSelected}
                onChange={(e) => setAddToBudget(e.target.checked)}
              />
              <span>
                Add my share to my personal budget
                <span className="block text-[11px] text-slate-500">
                  Only your share is copied, not the whole group expense.
                </span>
              </span>
            </label>
            <select
              className="input mt-2 py-1.5"
              value={categoryId}
              disabled={!addToBudget || !selfSelected}
              onChange={(e) => setCategoryId(e.target.value)}
            >
              <option value="">Uncategorized</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
            {!selfMember && (
              <p className="mt-1.5 text-[11px] text-amber-300">
                Mark a member as &quot;you&quot; to copy a share into your budget.
              </p>
            )}
            {selfMember && !selfSelected && (
              <p className="mt-1.5 text-[11px] text-amber-300">
                Select yourself as a participant to add your share.
              </p>
            )}
          </div>

          <button
            className="btn-primary mt-3 w-full"
            disabled={!canSubmit}
            onClick={() => void submitExpense()}
          >
            {busy === "expense-create" ? <Spinner /> : null} Record expense
          </button>
        </section>
      </div>

      <section>
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-1">
          <h4 className="text-sm font-semibold uppercase tracking-wide text-slate-300">
            Expense history
          </h4>
          <span className="text-[10px] uppercase tracking-wide text-slate-500">
            {editLocked
              ? "editing locked after payment or during processing"
              : "totals and custom shares are editable before payment"}
          </span>
        </div>
        {editLocked && (
          <p className="mb-2 rounded-lg border border-amber-500/25 bg-amber-500/10 px-2.5 py-1.5 text-[11px] text-amber-200">
            A payment has been completed or is being processed in this group. Expense
            amounts and shares are locked to protect those payments.
          </p>
        )}
        {!editLocked && group.settlements.some((settlement) => settlement.status === "PENDING") && (
          <p className="mb-2 text-xs text-slate-400">
            Nothing has been paid yet. You can edit expenses; saving changes clears pending
            payment requests so you can create new ones for the updated balances.
          </p>
        )}
        {group.expenses.length === 0 ? (
          <EmptyState>No shared expenses yet. Record the first one above.</EmptyState>
        ) : (
          <ul className="space-y-2">
            {group.expenses.map((expense) => {
              const selfShare = expense.shares.find((share) => share.isSelf);
              const deleting = busy === `expense-delete-${expense.id}`;
              const editing = editingExpenseId === expense.id;

              if (editing) {
                return (
                  <li
                    key={expense.id}
                    className="rounded-xl border border-brand-500/40 bg-brand-500/5 p-3"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-medium">Editing expense</p>
                      <span className="badge bg-brand-500/15 text-brand-200">
                        custom split
                      </span>
                    </div>

                    <div className="mt-2 grid grid-cols-2 gap-2">
                      <input
                        className="input col-span-2"
                        placeholder="What was it for?"
                        value={editDraft.description}
                        maxLength={140}
                        onChange={(e) =>
                          setEditDraft((current) => ({
                            ...current,
                            description: e.target.value,
                          }))
                        }
                      />
                      <input
                        className="input"
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder="Total amount"
                        value={editDraft.amount}
                        onChange={(e) =>
                          setEditDraft((current) => ({
                            ...current,
                            amount: e.target.value,
                          }))
                        }
                      />
                      <input
                        className="input"
                        type="date"
                        value={editDraft.date}
                        onChange={(e) =>
                          setEditDraft((current) => ({
                            ...current,
                            date: e.target.value,
                          }))
                        }
                      />
                      <label className="col-span-2 text-xs text-slate-400">
                        Paid by
                        <select
                          className="input mt-1"
                          value={editDraft.payerId}
                          onChange={(e) =>
                            setEditDraft((current) => ({
                              ...current,
                              payerId: e.target.value,
                            }))
                          }
                        >
                          {group.members.map((member) => (
                            <option key={member.id} value={member.id}>
                              {member.displayName}
                              {member.isSelf ? " (you)" : ""}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="col-span-2 text-xs text-slate-400">
                        Category (optional)
                        <input
                          className="input mt-1"
                          list="group-expense-categories"
                          placeholder="e.g. Travel, Groceries, Utilities"
                          value={editDraft.category}
                          maxLength={60}
                          onChange={(e) =>
                            setEditDraft((current) => ({
                              ...current,
                              category: e.target.value,
                            }))
                          }
                        />
                      </label>
                    </div>

                    <div className="mt-3">
                      <div className="mb-1.5 flex items-center justify-between gap-2">
                        <span className="text-xs text-slate-400">
                          Each person&apos;s share
                        </span>
                        <button
                          type="button"
                          className="text-[11px] underline text-slate-400 hover:text-slate-200"
                          onClick={splitEditEqually}
                        >
                          Split equally between everyone
                        </button>
                      </div>
                      <div className="space-y-1.5">
                        {group.members.map((member) => (
                          <label
                            key={member.id}
                            className="flex items-center gap-2 rounded-md border border-slate-800 px-2 py-1.5"
                          >
                            <span className="min-w-0 flex-1 truncate text-sm">
                              {member.displayName}
                              {member.isSelf ? " (you)" : ""}
                            </span>
                            <input
                              className="input w-28 py-1 text-right text-xs"
                              type="number"
                              min="0"
                              step="0.01"
                              placeholder="0.00"
                              value={editDraft.shares[member.id] ?? ""}
                              onChange={(e) =>
                                setEditDraft((current) => ({
                                  ...current,
                                  shares: {
                                    ...current.shares,
                                    [member.id]: e.target.value,
                                  },
                                }))
                              }
                            />
                          </label>
                        ))}
                      </div>
                    </div>

                    <div
                      className={`mt-2 rounded-lg border px-2.5 py-2 text-[11px] ${
                        editRemaining === 0
                          ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                          : "border-amber-500/30 bg-amber-500/10 text-amber-200"
                      }`}
                    >
                      Allocated <Cents cents={editShareTotal} currency={group.currency} /> of{" "}
                      <Cents cents={Math.max(editAmountCents, 0)} currency={group.currency} />
                      {editRemaining === 0 ? (
                        " · balanced"
                      ) : (
                        <>
                          {" · "}
                          <Cents
                            cents={Math.abs(editRemaining)}
                            currency={group.currency}
                          />{" "}
                          {editRemaining > 0 ? "left to assign" : "over the total"}
                        </>
                      )}
                    </div>

                    <div className="mt-2 flex flex-wrap gap-2">
                      <button
                        className="btn-primary btn-sm text-xs"
                        disabled={!canSaveEdit}
                        onClick={() => void saveExpense()}
                      >
                        {busy === `expense-edit-${expense.id}` ? <Spinner /> : null}
                        Save changes
                      </button>
                      <button
                        className="btn-ghost btn-sm text-xs"
                        onClick={() => setEditingExpenseId(null)}
                      >
                        Cancel
                      </button>
                    </div>
                  </li>
                );
              }

              return (
                <li
                  key={expense.id}
                  className="rounded-xl border border-slate-800 bg-slate-950/40 p-3"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-1.5 text-sm font-medium">
                        <span className="truncate">{expense.description}</span>
                        {expense.category && (
                          <span className="badge bg-sky-500/10 text-sky-300">
                            {expense.category}
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-slate-400">
                        {new Date(expense.occurredAt).toLocaleDateString()} · paid by{" "}
                        {expense.payerName} · {expense.shares.length} participant
                        {expense.shares.length === 1 ? "" : "s"}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold">
                        <Cents cents={expense.amountCents} currency={group.currency} />
                      </span>
                      <button
                        className="btn-ghost px-1 py-1 text-xs"
                        title={
                          editLocked
                            ? "Locked after a payment or payment request"
                            : "Edit total and each person's share"
                        }
                        disabled={editLocked || busy === `expense-edit-${expense.id}`}
                        onClick={() => startEditExpense(expense)}
                      >
                        ✎
                      </button>
                      <button
                        className="btn-ghost px-1 py-1 text-xs"
                        title={
                          editLocked
                            ? "Remove recorded settlements before deleting expenses"
                            : "Delete expense"
                        }
                        disabled={editLocked || deleting}
                        onClick={() => {
                          if (
                            window.confirm(
                              `Delete "${expense.description}"? Any budget purchase copied from your share will also be removed.`,
                            )
                          ) {
                            void onDeleteExpense(expense.id);
                          }
                        }}
                      >
                        {deleting ? <Spinner /> : "✕"}
                      </button>
                    </div>
                  </div>

                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {expense.shares.map((share) => (
                      <span
                        key={share.id}
                        className={`badge border ${
                          share.isSelf
                            ? "border-brand-500/40 bg-brand-500/15 text-brand-200"
                            : "border-slate-700 bg-slate-800/60 text-slate-300"
                        }`}
                      >
                        {share.memberName}:{" "}
                        <Cents cents={share.amountCents} currency={group.currency} />
                      </span>
                    ))}
                  </div>

                  {selfShare && (
                    <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-slate-800 pt-2">
                      {selfShare.purchaseId ? (
                        <>
                          <span className="text-xs text-emerald-300">
                            Your share is in your personal budget
                          </span>
                          <button
                            className="btn-ghost px-1.5 py-1 text-[11px]"
                            disabled={busy === `budget-${selfShare.id}`}
                            onClick={() =>
                              void onToggleBudget(
                                expense.id,
                                selfShare.id,
                                null,
                                true,
                              )
                            }
                          >
                            {busy === `budget-${selfShare.id}` ? <Spinner /> : null}
                            Remove from budget
                          </button>
                        </>
                      ) : selfShare.amountCents === 0 ? (
                        <span className="text-xs text-slate-400">
                          Your share is zero, so there is nothing to add.
                        </span>
                      ) : (
                        <>
                          <select
                            className="input max-w-[10rem] py-1 text-xs"
                            value={shareCategories[selfShare.id] ?? ""}
                            onChange={(e) =>
                              setShareCategories((current) => ({
                                ...current,
                                [selfShare.id]: e.target.value,
                              }))
                            }
                          >
                            <option value="">Uncategorized</option>
                            {categories.map((category) => (
                              <option key={category.id} value={category.id}>
                                {category.name}
                              </option>
                            ))}
                          </select>
                          <button
                            className="btn-secondary btn-sm text-xs"
                            disabled={busy === `budget-${selfShare.id}`}
                            onClick={() =>
                              void onToggleBudget(
                                expense.id,
                                selfShare.id,
                                shareCategories[selfShare.id] || null,
                                false,
                              )
                            }
                          >
                            {busy === `budget-${selfShare.id}` ? <Spinner /> : null}
                            Add my share to budget
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <div className="grid gap-5 2xl:grid-cols-2 2xl:items-start">
        <section>
          <div className="mb-2 flex flex-wrap items-baseline justify-between gap-1">
            <h4 className="text-sm font-semibold uppercase tracking-wide text-slate-300">
              Suggested repayments
            </h4>
            <span className="text-[10px] uppercase tracking-wide text-slate-500">
              arrow → points to who is owed
            </span>
          </div>
          <RepaymentExplanation group={group} />
          {group.repayments.length === 0 ? (
            <EmptyState>
              {group.expenses.length === 0
                ? "Add expenses to see who owes whom."
                : "Everyone is settled up."}
            </EmptyState>
          ) : (
            <ul className="space-y-2">
              {group.repayments.map((repayment) => {
                const key = `${repayment.fromMemberId}-${repayment.toMemberId}-${repayment.amountCents}`;
                const pending = group.settlements.some(
                  (settlement) =>
                    settlement.status === "PENDING" &&
                    settlement.senderId === repayment.fromMemberId &&
                    settlement.recipientId === repayment.toMemberId &&
                    settlement.amountCents === repayment.amountCents,
                );
                const fromIsYou = repayment.fromMemberId === selfMember?.id;
                const toIsYou = repayment.toMemberId === selfMember?.id;
                const recipient = group.members.find(
                  (member) => member.id === repayment.toMemberId,
                );
                const payLink = paypalPaymentLink(recipient?.paypalAddress, repayment.amountCents, group.currency);
                const canRequest = Boolean(payLink || memberPaypalEmailSchema.safeParse(recipient?.paypalAddress).success);
                return (
                  <li
                    key={key}
                    className="rounded-xl border border-slate-800 bg-slate-950/40 p-3"
                  >
                    <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2">
                      <div className="min-w-0 text-right">
                        <p className="flex items-center justify-end gap-1.5 text-sm font-medium">
                          <span className="truncate">{repayment.fromName}</span>
                          {fromIsYou && (
                            <span className="badge shrink-0 bg-brand-500/20 text-brand-300">
                              you
                            </span>
                          )}
                        </p>
                        <p className="text-[11px] text-rose-300">owes</p>
                      </div>

                      <div className="flex flex-col items-center">
                        <span className="text-sm font-semibold text-amber-300">
                          <Cents
                            cents={repayment.amountCents}
                            currency={group.currency}
                          />
                        </span>
                        <DebtArrow />
                      </div>

                      <div className="min-w-0">
                        <p className="flex items-center gap-1.5 text-sm font-medium">
                          <span className="truncate">{repayment.toName}</span>
                          {toIsYou && (
                            <span className="badge shrink-0 bg-brand-500/20 text-brand-300">
                              you
                            </span>
                          )}
                        </p>
                        <p className="text-[11px] text-emerald-300">is owed</p>
                      </div>
                    </div>

                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <span
                        className={`badge ${
                          pending
                            ? "bg-amber-500/15 text-amber-300"
                            : "bg-slate-800 text-slate-300"
                        }`}
                      >
                        {pending ? "requested" : "unpaid"}
                      </span>
                      <span className="text-[11px] text-slate-500">
                        {pending
                          ? "Payment request sent · waiting for confirmation"
                          : "No payment request yet"}
                      </span>
                    </div>

                    <div className="mt-2 flex flex-wrap gap-2">
                      <button
                        className="btn-secondary btn-sm text-xs"
                        disabled={editLocked || busy !== null}
                        title={editLocked ? "A completed or processing payment locks direction changes" : "Swap who pays and who receives"}
                        onClick={() => {
                          if (window.confirm(
                            `Change this to ${repayment.toName} owes ${repayment.fromName}? This updates group balances and clears unpaid payment requests.`,
                          )) void onReverseRepayment(repayment);
                        }}
                      >
                        {busy === `reverse-${key}` ? <Spinner /> : "⇄"} Reverse direction
                      </button>
                      <button
                        className="btn-secondary btn-sm text-xs"
                        disabled={busy === `settle-${key}`}
                        onClick={() => void onMarkSettled(repayment)}
                      >
                        {busy === `settle-${key}` ? <Spinner /> : null} Mark settled
                      </button>
                      <button
                        className="btn-secondary btn-sm text-xs"
                        disabled={!canRequest}
                        title={
                          canRequest
                            ? "Create a payment request with a link and QR code"
                            : "Add the recipient’s PayPal email or PayPal.Me handle first"
                        }
                        onClick={() => onRequestPayment(repayment)}
                      >
                        {pending ? "View payment link / QR" : "Request payment / QR"}
                      </button>
                      {recipient?.paypalAddress?.includes("@") && (
                        <button
                          className="btn-secondary btn-sm text-xs"
                          disabled={busy !== null}
                          title={`Pay ${recipient.paypalAddress} through PayPal checkout`}
                          onClick={() => onPayWithPayPal(repayment)}
                        >
                          Pay {repayment.toName}
                        </button>
                      )}
                    </div>
                    {!canRequest && !recipient?.paypalAddress?.includes("@") && (
                      <p className="mt-1.5 text-[11px] text-amber-300">
                        Add a PayPal email or PayPal.Me handle for{" "}
                        {recipient?.displayName ?? repayment.toName} (pencil icon in
                        Members) to request this share.
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          {group.directionChanges.length > 0 && (
            <details className="mt-3 rounded-lg border border-slate-800 px-3 py-2 text-xs text-slate-400">
              <summary className="cursor-pointer">Saved direction changes ({group.directionChanges.length})</summary>
              <ul className="mt-2 space-y-1">
                {group.directionChanges.map((change) => (
                  <li key={change.id}>
                    {change.fromName} → {change.toName} changed to {change.toName} → {change.fromName}{" "}
                    · <Cents cents={change.amountCents} currency={group.currency} />
                  </li>
                ))}
              </ul>
            </details>
          )}
          <p className="mt-2 text-[11px] text-slate-500">
            Reverse direction corrects who owes whom and saves the change without recording a payment.
            Mark settled records a manual repayment. A payment link or QR code records a
            pending request; the balance changes only after you confirm the payment.
            A confirmed payment can clear a chain of debts. Partial payments leave the remainder;
            overpayments become credit owed back to the payer.
          </p>
        </section>

        <section>
          <h4 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-300">
            Settlement history
          </h4>
          {group.settlements.length === 0 ? (
            <EmptyState>No settlements recorded yet.</EmptyState>
          ) : (
            <ul className="space-y-2">
              {group.settlements.map((settlement) => {
                const deleting = busy === `settlement-delete-${settlement.id}`;
                return (
                  <li
                    key={settlement.id}
                    className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-800 bg-slate-950/40 p-3"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm">
                        {settlement.senderName}
                        <span className="mx-1.5 text-slate-500">→</span>
                        {settlement.recipientName}
                      </p>
                      <p className="truncate text-xs text-slate-400">
                        {new Date(settlement.settledAt ?? settlement.createdAt).toLocaleDateString()}
                        {settlementReferenceLabel(settlement.paymentReference)
                          ? ` · ${settlementReferenceLabel(settlement.paymentReference)}`
                          : settlement.paypalOrderId
                            ? ` · PayPal ${settlement.paypalOrderId}`
                            : ""}
                      </p>
                      {settlement.note && <p className="mt-1 text-xs text-slate-500">{settlement.note}</p>}
                    </div>
                    <span className="text-sm font-medium">
                      <Cents cents={settlement.amountCents} currency={group.currency} />
                    </span>
                    <span
                      className={`badge ${
                        settlement.status === "SETTLED"
                          ? "bg-emerald-500/15 text-emerald-300"
                          : settlement.status === "PENDING"
                            ? "bg-amber-500/15 text-amber-300"
                            : "bg-rose-500/15 text-rose-300"
                      }`}
                    >
                      {settlement.status.toLowerCase()}
                    </span>
                    <button
                      className="btn-ghost px-1.5 py-1 text-[11px]"
                      title={settlement.status === "SETTLED" && settlement.paypalOrderId ? "Completed PayPal payments stay in the ledger" : "Remove this settlement from the ledger"}
                      disabled={deleting || settlement.status === "CAPTURING" || (settlement.status === "SETTLED" && Boolean(settlement.paypalOrderId))}
                      onClick={() => {
                        if (
                          window.confirm(
                            "Remove this settlement? Group balances will be recalculated.",
                          )
                        ) {
                          void onDeleteSettlement(settlement.id);
                        }
                      }}
                    >
                      {deleting ? <Spinner /> : "✕"}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>

      <Modal
        open={Boolean(editingMember)}
        onClose={() => setEditingMember(null)}
        title={`Edit ${editingMember?.displayName ?? "member"}`}
      >
        <div className="space-y-3">
          <label className="block text-xs text-slate-400">
            Nickname (optional)
            <input
              className="input mt-1"
              value={memberDraft.displayName}
              placeholder={memberDraft.paypalAddress || "Member nickname"}
              maxLength={120}
              onChange={(e) =>
                setMemberDraft((current) => ({
                  ...current,
                  displayName: e.target.value,
                }))
              }
            />
          </label>
          <label className="block text-xs text-slate-400">
            PayPal email or PayPal.Me handle
            <input
              className="input mt-1"
              placeholder="name@example.com or paypal-me-name"
              value={memberDraft.paypalAddress}
              maxLength={120}
              onChange={(e) =>
                setMemberDraft((current) => ({
                  ...current,
                  paypalAddress: e.target.value,
                }))
              }
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void saveMember();
                }
              }}
            />
          </label>
          <p className="text-[11px] leading-relaxed text-slate-500">
            Leave the nickname blank to display the PayPal address. Changing a nickname
            keeps the payment address unchanged. The address is used for payment links
            and QR codes; leave it blank to remove it.
          </p>
          <div className="flex gap-2">
            <button
              className="btn-primary"
              disabled={
                (!memberDraft.displayName.trim() && !memberDraft.paypalAddress.trim()) ||
                busy === `member-update-${editingMember?.id}`
              }
              onClick={() => void saveMember()}
            >
              {busy === `member-update-${editingMember?.id}` ? <Spinner /> : null}
              Save member
            </button>
            <button className="btn-ghost" onClick={() => setEditingMember(null)}>
              Cancel
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function Cents({ cents, currency }: { cents: number; currency: string }) {
  return <Money amount={fromCents(cents)} currency={currency} />;
}

/** Local YYYY-MM-DD for a date input. */
function todayInput(): string {
  const date = new Date();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

/** Convert an ISO timestamp to the local YYYY-MM-DD value used by date inputs. */
function toDateInput(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return todayInput();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}
