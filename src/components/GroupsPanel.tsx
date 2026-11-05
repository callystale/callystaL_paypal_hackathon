"use client";

import { useCallback, useEffect, useState } from "react";
import {
  api,
  type CreateExpenseResponse,
  type GroupDetailDTO,
  type GroupMutationResponse,
  type GroupSummaryDTO,
  type SettlementDTO,
  type StatusDTO,
  type SummaryDTO,
  type SuggestedRepayment,
} from "@/lib/client";
import { createGroupMemberSchema } from "@/lib/group-member";
import { GROUP_CURRENCIES } from "@/lib/group";
import { GroupDetail, type ExpenseInput, type ExpenseUpdateInput } from "./GroupDetail";
import { PaymentLinkModal } from "./PaymentLinkModal";
import { SettlementCheckoutModal } from "./SettlementCheckoutModal";
import { Alert, EmptyState, Spinner } from "./ui";

export function GroupsPanel({
  summary,
  status,
  refresh,
  onClose,
}: {
  summary: SummaryDTO | null;
  status: StatusDTO | null;
  refresh: () => Promise<void>;
  /** When provided, renders a close control for the split-screen view. */
  onClose?: () => void;
}) {
  const [groups, setGroups] = useState<GroupSummaryDTO[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<GroupDetailDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newCurrency, setNewCurrency] = useState<string>("USD");
  const [newYourName, setNewYourName] = useState("You");
  const [newYourPaypal, setNewYourPaypal] = useState("");
  const [newFriends, setNewFriends] = useState([{ paypalAddress: "", displayName: "" }]);
  const enteredFriends = newFriends.filter((friend) => friend.paypalAddress.trim() || friend.displayName.trim());
  const friendsValid = enteredFriends.every((friend) => createGroupMemberSchema.safeParse(friend).success);
  const updateNewFriend = (index: number, field: "paypalAddress" | "displayName", value: string) => {
    setNewFriends((friends) => friends.map((friend, i) => i === index ? { ...friend, [field]: value } : friend));
  };
  const [settlementFor, setSettlementFor] = useState<SuggestedRepayment | null>(null);
  const [paymentLinkFor, setPaymentLinkFor] = useState<SuggestedRepayment | null>(null);

  const loadGroups = useCallback(async (): Promise<GroupSummaryDTO[]> => {
    const data = await api.get<GroupSummaryDTO[]>("/api/groups");
    setGroups(data);
    setSelectedId((current) =>
      current && data.some((group) => group.id === current)
        ? current
        : (data[0]?.id ?? null),
    );
    return data;
  }, []);

  useEffect(() => {
    let cancelled = false;
    loadGroups()
      .catch((e) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Could not load groups");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [loadGroups]);

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      return;
    }
    let cancelled = false;
    setDetail(null);
    setDetailLoading(true);
    api
      .get<GroupDetailDTO>(`/api/groups/${selectedId}`)
      .then((group) => {
        if (!cancelled) setDetail(group);
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Could not load this group");
        }
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  const reloadGroup = useCallback(
    async (id: string | null = selectedId) => {
      if (!id) return null;
      const fresh = await api.get<GroupDetailDTO>(`/api/groups/${id}`);
      setDetail(fresh);
      return fresh;
    },
    [selectedId],
  );

  useEffect(() => {
    if (!paymentLinkFor || !selectedId) return;
    const timer = window.setInterval(() => { void reloadGroup().catch(() => {}); }, 5000);
    return () => window.clearInterval(timer);
  }, [paymentLinkFor, selectedId, reloadGroup]);

  const runAction = useCallback(
    async (key: string, action: () => Promise<void>): Promise<boolean> => {
      setBusy(key);
      setError(null);
      setNotice(null);
      try {
        await action();
        return true;
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong");
        return false;
      } finally {
        setBusy(null);
      }
    },
    [],
  );

  const createGroup = async () => {
    const name = newName.trim();
    if (!name || !friendsValid || busy === "group-create") return;
    const created = await runAction("group-create", async () => {
      const group = await api.post<GroupDetailDTO>("/api/groups", {
        name,
        friends: enteredFriends,
        currency: newCurrency,
        yourName: newYourName.trim() || undefined,
        yourPaypalAddress: newYourPaypal.trim() || undefined,
      });
      setDetail(group);
      setSelectedId(group.id);
      await loadGroups();
    });
    if (created) {
      setNewName("");
      setNewCurrency("USD");
      setNewYourName("You");
      setNewYourPaypal("");
      setNewFriends([{ paypalAddress: "", displayName: "" }]);
      setShowCreate(false);
      setNotice("Group created. Record your first shared expense.");
    }
  };

  const deleteGroup = async () => {
    if (!detail) return;
    const id = detail.id;
    const deleted = await runAction("group-delete", async () => {
      await api.delete(`/api/groups/${id}`);
      const data = await loadGroups();
      setSelectedId(data[0]?.id ?? null);
      setDetail(null);
      // Deleting a group also removes any budget purchases copied from it.
      await refresh();
    });
    if (deleted) {
      setNotice("Group deleted.");
    }
  };

  const addMember = async (
    paypalAddress: string,
    nickname: string,
  ): Promise<boolean> => {
    if (!detail) return false;
    return runAction("member-add", async () => {
      await api.post(`/api/groups/${detail.id}/members`, {
        paypalAddress,
        displayName: nickname,
      });
      await reloadGroup();
    });
  };

  const updateMember = async (
    memberId: string,
    input: { displayName: string; paypalAddress: string | null },
  ): Promise<boolean> => {
    if (!detail) return false;
    return runAction(`member-update-${memberId}`, async () => {
      await api.patch(`/api/groups/${detail.id}/members/${memberId}`, {
        displayName: input.displayName,
        paypalAddress: input.paypalAddress,
      });
      await reloadGroup();
    });
  };

  const removeMember = async (memberId: string): Promise<void> => {
    if (!detail) return;
    await runAction(`member-remove-${memberId}`, async () => {
      await api.delete(`/api/groups/${detail.id}/members/${memberId}`);
      await reloadGroup();
    });
  };

  const setSelf = async (memberId: string): Promise<void> => {
    if (!detail) return;
    await runAction(`member-self-${memberId}`, async () => {
      await api.patch(`/api/groups/${detail.id}/members/${memberId}`, {
        isSelf: true,
      });
      await reloadGroup();
    });
  };

  const createExpense = async (input: ExpenseInput): Promise<boolean> => {
    if (!detail) return false;
    let warning: string | null = null;

    const created = await runAction("expense-create", async () => {
      const response = await api.post<CreateExpenseResponse>(
        `/api/groups/${detail.id}/expenses`,
        {
          description: input.description,
          amount: input.amount,
          payerId: input.payerId,
          occurredAt: input.occurredAt,
          category: input.category || undefined,
          participantIds: input.participantIds,
        },
      );

      let group = response.group;
      const selfShare = response.expense?.shares.find((share) => share.isSelf);

      if (input.addToBudget && response.expense) {
        if (!selfShare) {
          warning =
            "Expense recorded, but you were not a participant, so nothing was added to your budget.";
        } else if (selfShare.amountCents <= 0) {
          warning =
            "Expense recorded, but your share is zero, so nothing was added to your budget.";
        } else {
          try {
            await api.post(
              `/api/groups/${detail.id}/expenses/${response.expense.id}/shares/${selfShare.id}/budget`,
              { categoryId: input.categoryId },
            );
          } catch (e) {
            warning = `Expense recorded, but adding your share to the budget failed: ${
              e instanceof Error ? e.message : "unknown error"
            }`;
          }

          if (!warning) {
            setNotice(
              "Expense recorded and your share was added to your personal budget.",
            );
            try {
              group = await api.get<GroupDetailDTO>(`/api/groups/${detail.id}`);
            } catch {
              // Keep the response we already have; the share link is still valid.
            }
            try {
              await refresh();
            } catch (e) {
              warning = `Your share was saved, but the dashboard could not be refreshed: ${
                e instanceof Error ? e.message : "unknown error"
              }`;
            }
          }
        }
      }

      setDetail(group);
    });

    if (warning) setError(warning);
    return created;
  };

  const updateExpense = async (
    expenseId: string,
    input: ExpenseUpdateInput,
  ): Promise<boolean> => {
    if (!detail) return false;
    const updated = await runAction(`expense-edit-${expenseId}`, async () => {
      const response = await api.patch<GroupMutationResponse>(
        `/api/groups/${detail.id}/expenses/${expenseId}`,
        input,
      );
      if (response.group) setDetail(response.group);
      else await reloadGroup();
      await refresh();
    });
    if (updated) {
      setNotice(
        "Expense updated. Linked budget shares were kept in sync; any unpaid requests were cleared. Create new requests for the updated balances.",
      );
    }
    return updated;
  };

  const deleteExpense = async (expenseId: string): Promise<void> => {
    if (!detail) return;
    await runAction(`expense-delete-${expenseId}`, async () => {
      await api.delete(`/api/groups/${detail.id}/expenses/${expenseId}`);
      await reloadGroup();
      await refresh();
    });
  };

  const toggleBudget = async (
    expenseId: string,
    shareId: string,
    categoryId: string | null,
    linked: boolean,
  ): Promise<void> => {
    if (!detail) return;
    await runAction(`budget-${shareId}`, async () => {
      const url = `/api/groups/${detail.id}/expenses/${expenseId}/shares/${shareId}/budget`;
      if (linked) {
        await api.delete(url);
      } else {
        await api.post(url, { categoryId });
      }
      await reloadGroup();
      await refresh();
      setNotice(
        linked
          ? "Your share was removed from the personal budget."
          : "Your share was added to the personal budget.",
      );
    });
  };

  const reverseRepayment = async (repayment: SuggestedRepayment): Promise<void> => {
    if (!detail) return;
    const key = `reverse-${repayment.fromMemberId}-${repayment.toMemberId}-${repayment.amountCents}`;
    await runAction(key, async () => {
      const response = await api.post<GroupMutationResponse>(
        `/api/groups/${detail.id}/repayments/reverse`, repayment,
      );
      if (response.group) setDetail(response.group);
      else await reloadGroup();
      setPaymentLinkFor(null);
      setSettlementFor(null);
      setNotice("Repayment direction reversed and saved. Unpaid requests were cleared; create new links for the updated balances.");
    });
  };

  const markSettled = async (repayment: SuggestedRepayment): Promise<void> => {
    if (!detail) return;
    const key = `settle-${repayment.fromMemberId}-${repayment.toMemberId}-${repayment.amountCents}`;
    await runAction(key, async () => {
      const pending = detail.settlements.find(
        (settlement) =>
          settlement.status === "PENDING" &&
          settlement.senderId === repayment.fromMemberId &&
          settlement.recipientId === repayment.toMemberId &&
          settlement.amountCents === repayment.amountCents,
      );

      if (pending) {
        const response = await api.patch<GroupMutationResponse>(
          `/api/groups/${detail.id}/settlements/${pending.id}`,
          {
            status: "SETTLED",
            paymentReference: "manual",
            note: "Payment request marked settled manually",
          },
        );
        if (response.group) setDetail(response.group);
        else await reloadGroup();
      } else {
        const response = await api.post<GroupMutationResponse>(
          `/api/groups/${detail.id}/settlements`,
          {
            senderId: repayment.fromMemberId,
            recipientId: repayment.toMemberId,
            amountCents: repayment.amountCents,
            status: "SETTLED",
            note: "Marked settled manually",
          },
        );
        if (response.group) setDetail(response.group);
        else await reloadGroup();
      }
      setPaymentLinkFor(null);
      setNotice("Repayment marked settled.");
    });
  };

  const requestPayment = async (repayment: SuggestedRepayment): Promise<void> => {
    if (!detail) return;
    const recipient = detail.members.find(
      (member) => member.id === repayment.toMemberId,
    );
    if (!recipient?.paypalAddress) {
      setError(
        `Add a PayPal email or PayPal.Me handle for ${recipient?.displayName ?? repayment.toName} before requesting payment.`,
      );
      return;
    }

    const pending = detail.settlements.find(
      (settlement) =>
        settlement.status === "PENDING" &&
        settlement.senderId === repayment.fromMemberId &&
        settlement.recipientId === repayment.toMemberId &&
        settlement.amountCents === repayment.amountCents,
    );
    if (pending) {
      setPaymentLinkFor(repayment);
      return;
    }

    const key = `request-${repayment.fromMemberId}-${repayment.toMemberId}-${repayment.amountCents}`;
    const requested = await runAction(key, async () => {
      const response = await api.post<GroupMutationResponse>(
        `/api/groups/${detail.id}/settlements`,
        {
          senderId: repayment.fromMemberId,
          recipientId: repayment.toMemberId,
          amountCents: repayment.amountCents,
          status: "PENDING",
          note: "Payment link request",
          paymentReference: "payment-link",
        },
      );
      if (response.group) setDetail(response.group);
      else await reloadGroup();
    });

    if (requested) {
      setPaymentLinkFor(repayment);
      setNotice(
        "Payment request created. Share the link or let the payer scan the QR code.",
      );
    }
  };

  const settleRequest = async (settlement: SettlementDTO): Promise<boolean> => {
    if (!detail) return false;
    const settled = await runAction(`settlement-pay-${settlement.id}`, async () => {
      const response = await api.patch<GroupMutationResponse>(
        `/api/groups/${detail.id}/settlements/${settlement.id}`,
        {
          status: "SETTLED",
          paymentReference: "paypal-link-confirmed",
          note: "Payment link marked settled manually",
        },
      );
      if (response.group) setDetail(response.group);
      else await reloadGroup();
    });
    if (settled) {
      setNotice("Payment request marked settled.");
      setPaymentLinkFor(null);
    }
    return settled;
  };

  const deleteSettlementRequest = async (
    settlement: SettlementDTO,
  ): Promise<boolean> => {
    if (!detail) return false;
    const deleted = await runAction(
      `settlement-delete-${settlement.id}`,
      async () => {
        await api.delete(`/api/groups/${detail.id}/settlements/${settlement.id}`);
        await reloadGroup();
      },
    );
    if (deleted) {
      setNotice("Payment request deleted; the repayment is unpaid again.");
      setPaymentLinkFor(null);
    }
    return deleted;
  };

  const deleteSettlement = async (settlementId: string): Promise<void> => {
    if (!detail) return;
    await runAction(`settlement-delete-${settlementId}`, async () => {
      await api.delete(`/api/groups/${detail.id}/settlements/${settlementId}`);
      await reloadGroup();
      setNotice("Settlement removed; balances recalculated.");
    });
  };

  const handleSettlementPaid = (result: {
    status: string;
    captureId?: string;
  }): void => {
    setNotice(
      `PayPal payment ${result.status === "SETTLED" ? "confirmed. Remaining debts updated" : `status: ${result.status.toLowerCase()}`} ${
        result.captureId ? ` · capture ${result.captureId}` : ""
      }.`,
    );
    void reloadGroup().catch((e) => {
      setError(e instanceof Error ? e.message : "Could not refresh the group");
    });
  };

  const creating = showCreate || groups.length === 0;

  return (
    <section className="card p-5">
      <header className="sticky -top-5 z-10 -mx-5 -mt-5 mb-4 flex flex-wrap items-start justify-between gap-3 rounded-t-2xl border-b border-slate-800 bg-slate-900 px-5 py-4">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-brand-400">
            Shared spending
          </p>
          <h2 className="text-lg font-semibold">Groups</h2>
          <p className="mt-1 text-sm text-slate-400">
            Split shared expenses and settle up. Only your own share can be copied into the
            personal budget.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {groups.length > 0 && (
            <button
              className="btn-ghost px-2 py-1 text-xs"
              onClick={() => setShowCreate((value) => !value)}
            >
              {showCreate ? "Cancel" : "+ New group"}
            </button>
          )}
          {onClose && (
            <button
              className="btn-ghost px-2 py-1 text-xs"
              onClick={onClose}
              title="Close split view"
            >
              ✕ Close
            </button>
          )}
        </div>
      </header>

      {error && (
        <div className="mb-3">
          <Alert>
            <span className="flex items-start justify-between gap-4">
              <span>{error}</span>
              <button className="underline" onClick={() => setError(null)}>
                dismiss
              </button>
            </span>
          </Alert>
        </div>
      )}
      {notice && (
        <div className="mb-3">
          <Alert kind="info">
            <span className="flex items-start justify-between gap-4">
              <span>{notice}</span>
              <button className="underline" onClick={() => setNotice(null)}>
                dismiss
              </button>
            </span>
          </Alert>
        </div>
      )}

      {creating && (
        <div className="mb-4 rounded-xl border border-slate-800 bg-slate-950/40 p-3">
          <div className="grid gap-2 sm:grid-cols-2">
            <input
              className="input sm:col-span-2"
              placeholder="Group name (e.g. Lake trip)"
              value={newName}
              maxLength={80}
              onChange={(e) => setNewName(e.target.value)}
            />
            <input
              className="input"
              placeholder="Your display name"
              value={newYourName}
              maxLength={60}
              onChange={(e) => setNewYourName(e.target.value)}
            />
            <select
              className="input"
              value={newCurrency}
              onChange={(e) => setNewCurrency(e.target.value)}
            >
              {GROUP_CURRENCIES.map((code) => (
                <option key={code} value={code}>
                  {code}
                </option>
              ))}
            </select>
            <input
              className="input sm:col-span-2"
              placeholder="Your PayPal email or paypal.me handle (optional)"
              value={newYourPaypal}
              maxLength={120}
              onChange={(e) => setNewYourPaypal(e.target.value)}
            />
          </div>
          <fieldset className="mt-3 space-y-2" disabled={busy === "group-create"}>
            <legend className="mb-2 text-sm font-medium">Friends (optional)</legend>
            {newFriends.map((friend, index) => (
              <div key={index} className="flex flex-wrap gap-2">
                <input
                  className="input min-w-0 flex-1 basis-36"
                  aria-label={`Friend ${index + 1} nickname (optional)`}
                  placeholder="Nickname (optional)"
                  maxLength={120}
                  value={friend.displayName}
                  onChange={(e) => updateNewFriend(index, "displayName", e.target.value)}
                />
                <input
                  className="input min-w-0 flex-1 basis-48"
                  type="email"
                  aria-label={`Friend ${index + 1} PayPal email`}
                  placeholder="Friend’s PayPal email"
                  autoComplete="off"
                  maxLength={120}
                  value={friend.paypalAddress}
                  onChange={(e) => updateNewFriend(index, "paypalAddress", e.target.value)}
                />
                <button
                  className="btn-ghost text-xs"
                  aria-label={`Remove friend ${index + 1}`}
                  onClick={() => setNewFriends((friends) => friends.filter((_, i) => i !== index))}
                >Remove</button>
              </div>
            ))}
            <button
              className="btn-secondary btn-sm"
              disabled={newFriends.length >= 100}
              onClick={() => setNewFriends((friends) => [...friends, { paypalAddress: "", displayName: "" }])}
            >+ Add friend</button>
            {!friendsValid && (
              <p className="text-xs text-amber-300">Enter a valid PayPal email for each friend, or remove the row.</p>
            )}
          </fieldset>
          <div className="mt-2 flex items-center gap-2">
            <button
              className="btn-primary"
              disabled={!newName.trim() || !friendsValid || busy === "group-create"}
              onClick={() => void createGroup()}
            >
              {busy === "group-create" ? <Spinner /> : null} Create group
            </button>
            {groups.length > 0 && (
              <button className="btn-ghost" onClick={() => setShowCreate(false)}>
                Cancel
              </button>
            )}
          </div>
          <p className="mt-1.5 text-[11px] text-slate-500">
            Your display name becomes the member marked &quot;you&quot;. The optional PayPal
            address lets people request or send your share with a link or QR code.
          </p>
        </div>
      )}

      {loading ? (
        <p className="flex items-center gap-2 py-4 text-sm text-slate-400">
          <Spinner /> Loading groups…
        </p>
      ) : (
        <>
          {groups.length > 0 && (
            <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
              {groups.map((group) => {
                const active = group.id === selectedId;
                return (
                  <button
                    key={group.id}
                    onClick={() => {
                      setSelectedId(group.id);
                      setError(null);
                      setNotice(null);
                    }}
                    className={`shrink-0 rounded-lg border px-3 py-1.5 text-left text-sm transition ${
                      active
                        ? "border-brand-500 bg-brand-500/10 text-brand-100"
                        : "border-slate-800 bg-slate-950/40 text-slate-300 hover:border-slate-700"
                    }`}
                  >
                    <span className="block max-w-[12rem] truncate font-medium">
                      {group.name}
                    </span>
                    <span className="block text-[11px] text-slate-400">
                      {group.currency} · {group.memberCount} member
                      {group.memberCount === 1 ? "" : "s"} · {group.expenseCount} expense
                      {group.expenseCount === 1 ? "" : "s"}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {detailLoading && !detail ? (
            <p className="flex items-center gap-2 py-8 text-sm text-slate-400">
              <Spinner /> Loading group…
            </p>
          ) : detail ? (
            <GroupDetail
              key={detail.id}
              group={detail}
              status={status}
              categories={summary?.categories ?? []}
              busy={busy}
              onAddMember={addMember}
              onUpdateMember={updateMember}
              onRemoveMember={removeMember}
              onSetSelf={setSelf}
              onCreateExpense={createExpense}
              onUpdateExpense={updateExpense}
              onDeleteExpense={deleteExpense}
              onToggleBudget={toggleBudget}
              onReverseRepayment={reverseRepayment}
              onMarkSettled={markSettled}
              onDeleteSettlement={deleteSettlement}
              onRequestPayment={(repayment) => void requestPayment(repayment)}
              onPayWithPayPal={setSettlementFor}
              onDeleteGroup={deleteGroup}
            />
          ) : (
            <EmptyState>
              {groups.length === 0
                ? "No groups yet. Create one above to start splitting."
                : "Select a group above to see its expenses and balances."}
            </EmptyState>
          )}
        </>
      )}

      {detail && (
        <SettlementCheckoutModal
          group={detail}
          repayment={settlementFor}
          status={status}
          onClose={() => setSettlementFor(null)}
          onPaid={handleSettlementPaid}
        />
      )}

      {detail && (
        <PaymentLinkModal
          group={detail}
          repayment={paymentLinkFor}
          busy={busy}
          onClose={() => setPaymentLinkFor(null)}
          onMarkPaid={settleRequest}
          onDeleteRequest={deleteSettlementRequest}
        />
      )}
    </section>
  );
}
