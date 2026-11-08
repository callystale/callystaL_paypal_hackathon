# Budget Planner

Set up a monthly budget with AI help, record spending, and let a locally-run AI turn your
wishlist into **affordable milestones**. For each planned item the app finds cheaper
alternatives, and when you're ready you approve a milestone and pay with **PayPal Sandbox**.

The AI recommends. You approve. Nothing is ever paid automatically.

---

## The workflow

| Step | What happens | Where in the UI |
| ---- | ------------ | --------------- |
| 1. Set up a monthly budget | Enter your monthly take-home income and the categories you care about. The local AI asks a few questions, proposes an amount for each category, and you adjust anything before saving. | **Monthly budget** panel |
| 2. Add purchases | Record purchases manually. AI categorizes each item and shows spending against the budget. Correct its guesses anytime. | **Purchases** panel |
| 3. Set up a budget | Choose spending categories and set a budget for each — or skip budgets and just track spending. | **Budget** panel |
| 4. Build a purchase plan | Add desired items with optional priority, target date, or max price. The AI groups them into affordable milestones based on your budget and priorities. | **Desired items** + **AI milestones** |
| 5. Find lower-cost options | For each planned item, the app searches similar products and compares price, availability, and fit. Swap an item into your plan in one click. | **Find cheaper** → alternatives modal |
| 6. Pay when ready | Select a milestone, review the total, and approve a PayPal checkout. Items are marked purchased after capture. | **Check out this milestone** |
| 7. Split group spending | Create a group, add members by PayPal email, record shared expenses, and see net balances plus a simplified repayment plan. Mark repayments settled manually or pay them with PayPal Sandbox. | **Groups** panel |

---

## Tech stack

- **App:** Next.js 14 (App Router) + TypeScript + Tailwind CSS
- **AI:** [Ollama](https://ollama.com) running locally (default `llama3.2:3b`), called from
  server-side Next.js route handlers. Returns structured JSON for plans, categorization, and
  alternative comparisons.
- **Product search:** [Channel3](https://docs.trychannel3.com) `/v1/search` (optional — a
  deterministic fallback catalogue keeps the flow demoable without a key).
- **Payments:** PayPal JavaScript SDK (`@paypal/react-paypal-js`) against the PayPal **Sandbox**,
  with server-side Orders v2 create/capture.
- **Database:** SQLite via Prisma. Group expenses, shares, and settlements store money in
  integer minor units (cents) so splits always add up exactly.

Everything degrades gracefully: if Ollama is offline the app uses a heuristic planner, and if
Channel3 has no key it uses the fallback catalogue. PayPal checkout is the only feature that
requires real credentials.

---

## Getting started

### Prerequisites

- Node.js 20+
- [Ollama](https://ollama.com) running locally with a chat model pulled:
  ```bash
  ollama pull llama3.2:3b
  ollama serve   # usually already running after install
  ```

### Setup

```bash
npm install
cp .env.example .env        # then edit values as needed
npx prisma db push          # create the SQLite schema
npm run db:seed             # optional: sample budgets, purchases and wishlist
npm run dev                 # http://localhost:3000
```

Open http://localhost:3000. The status pills at the top show whether AI, product search, and
PayPal are live. Only PayPal needs credentials to enable checkout.

### Environment variables

| Variable | Required | Purpose |
| -------- | -------- | ------- |
| `DATABASE_URL` | yes | SQLite path, e.g. `file:./dev.db` |
| `OLLAMA_BASE_URL` | no | Default `http://localhost:11434` |
| `OLLAMA_MODEL` | no | Default `llama3.2:3b`. Any chat model works; larger models give better plans. |
| `CHANNEL3_API_KEY` | no | Enables live product search. Without it, the fallback catalogue is used. |
| `CHANNEL3_API_URL` | no | Default `https://api.trychannel3.com` |
| `PAYPAL_ENV` | no | `sandbox` (default) or `live` |
| `NEXT_PUBLIC_PAYPAL_CLIENT_ID` | for checkout | Browser SDK client id |
| `PAYPAL_CLIENT_ID` / `PAYPAL_CLIENT_SECRET` | for checkout | Server-side Orders API credentials |
| `PAYPAL_CURRENCY` | no | Default `USD` |

### PayPal Sandbox setup

1. Create an app at <https://developer.paypal.com/dashboard/applications/sandbox>.
2. Copy the **Client ID** into both `NEXT_PUBLIC_PAYPAL_CLIENT_ID` and `PAYPAL_CLIENT_ID`.
3. Copy the **Secret** into `PAYPAL_CLIENT_SECRET`.
4. Restart the dev server. Use a [sandbox test buyer account](https://developer.paypal.com/dashboard/accounts)
   to complete a checkout without real money.

### Channel3 setup (optional)

Create a free key at <https://trychannel3.com> and set `CHANNEL3_API_KEY`. Search requests are
made server-side to `/v1/search`.

---

## Group spending split

Choose **Split shared spending** in the dashboard header to open the **Groups** pane as a
half-screen split beside the personal budget. Closing it restores the normal full-width planner.

The group pane is an account-less shared-expense ledger for the demo:

- Create a group with a name, currency, and your display name. One member is marked **you**
  (`GroupMember.isSelf`) so the UI can show personal balances and export only your share.
- Add friends while creating the group or later in Members, using their PayPal email and an optional nickname. If no nickname is entered,
  the email becomes their display name. Use the pencil to edit the nickname later without
  changing their payment address.
  Emails are validated and duplicate emails within a group are rejected, ignoring case.
  This does not verify a PayPal account or retrieve its profile name. Invite links and real
  user accounts are intentionally deferred.
- Pending payment requests do not lock expenses. Editing or deleting an expense clears
  pending requests; create new links or QR codes for the updated balances. Completed payments
  and PayPal captures being processed still lock expense edits.
- Record an expense with a description, total, payer, date, and participants. The total is split
  equally; leftover cents are assigned one at a time, deterministically, so the shares always
  sum to the expense total.
- The repayment breakdown shows the original expense shares, recorded payments and corrections,
  member balances, and suggested transfers. When traceable, it explains payments made on
  another person’s behalf and offsetting debts. Ask a question to have the local AI select
  relevant calculated facts; if it is unavailable, the app shows the full calculation.
- Each member's net balance is `paid - own shares + settlements sent - settlements received`.
  A greedy creditor/debtor match produces a short repayment plan.
- Use **Reverse direction** on an unpaid suggested repayment to swap who owes whom.
  This saves a direction correction separately from payments, updates balances, and clears
  pending requests. Payment links and checkout follow the corrected recipient.
- Confirmed payments clear the sender’s debt, including a chain such as Nguyen → You → Mia:
  Nguyen paying Mia once clears both legs. Partial payments leave only the remainder;
  excess payments become credit owed back to the actual payer. Pending, processing, failed,
  and cancelled attempts do not reduce debts. Completed transfers remain in settlement history.
- **Request payment / QR** also works with PayPal email recipients: it opens a shareable
  app payment page so the debtor can review and pay using their own PayPal account.
  Copy the link or download the QR as PNG. Share from a reachable deployed/network URL;
  optionally set `NEXT_PUBLIC_APP_URL` to the public app origin. Localhost QR links do not
  work on another device. The request dialog refreshes balances while awaiting payment.
- Checkout validates the payer, recipient, currency, amount, and remaining debt before capture.
  Already-paid or stale requests are rejected. Completed PayPal payments cannot be marked
  manually or deleted from the ledger. Partial PayPal payments can be entered at checkout.
- Mark a suggested repayment settled manually (recorded immediately), or use
  **Pay with PayPal** to create a Sandbox order addressed to the recipient’s saved PayPal
  email. Checkout shows that email for review and requires a valid recipient email.
  Sandbox payments require a Sandbox recipient account. A PayPal settlement stays `PENDING` and does
  **not** change balances until capture is confirmed; the capture endpoint then marks it
  `SETTLED`.
- For each expense, **Add my share to budget** copies only your share into the personal budget
  as one purchase, with an optional category. **Remove from budget** reverses it. Deleting the
  expense or group also removes the linked personal purchase, so no orphan spending remains.

Money for groups is stored in integer minor units:

```
Group          name, currency, created date
GroupMember    group, display name, isSelf, optional future userId
GroupExpense   group, payer, description, amountCents, date
ExpenseShare   expense, member, amountCents, optional linked Purchase
Settlement     group, sender, recipient, amountCents, status, PayPal reference
```

### Demo walkthrough

`npm run db:seed` resets the sample data and creates a **Lake trip** group with three members:

| Expense | Paid by | Total | Split |
| ------- | ------- | ----- | ----- |
| Cabin rental | You | $300.00 | $100.00 each |
| Groceries for the cabin | Maya | $86.47 | $28.83 + $28.82 + $28.82 |

The seeded balances are therefore **You are owed $171.18**, Maya owes **$42.36**, and Leo owes
**$128.82**. The suggested plan is Leo → You $128.82 and Maya → You $42.36. The groceries expense
also has You's $28.82 share linked to a personal **Groceries** purchase — open the Purchases
panel to confirm the whole $86.47 was not imported.

1. Create a group and add members.
2. Record expenses paid by different members, including an amount that leaves a cent remainder.
3. Check the per-member balances and suggested repayments.
4. Press **Mark settled** on one repayment and watch the balances recalculate.
5. Add/remove a personal share from the budget and check the personal spending total changes.
6. With PayPal configured, press **Pay with PayPal**, approve with a Sandbox buyer, and confirm
   the settlement only becomes `SETTLED` after capture.

---

## Scripts

| Command | Description |
| ------- | ----------- |
| `npm run dev` | Start the dev server |
| `npm run build` | `prisma generate` + production build |
| `npm start` | Start the production server |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | `next lint` |
| `npm test` | Split, balance, and repayment unit tests |
| `npm run db:push` | Sync the Prisma schema to SQLite |
| `npm run db:seed` | Seed sample data |
| `npm run db:reset` | Reset and re-seed |

---

## How the AI is used

All model calls happen server-side in route handlers (see `src/lib/planner.ts` and
`src/lib/alternatives.ts`) and request strict JSON:

- **`POST /api/plan`** — given the wishlist, category budgets, and remaining headroom, the model
  groups every item into milestones that each stay within the affordable budget, honoring
  priority and target dates. Invalid or incomplete output is rejected and replaced by the
  heuristic planner.
- **`POST /api/categorize`** — picks one category for a transaction from the user's categories.
- **`POST /api/alternatives`** — Channel3 returns comparable products; the model writes a one-line
  comparison of price, features, and availability. The user picks whether to swap.

The monthly "affordable budget per milestone" is derived from category budgets minus this month's
spending (60% of the remaining headroom), so plans stay realistic.

---

## Project structure

```
prisma/
  schema.prisma        Settings, Category, Purchase, wishlist, Order, and group-split models
  seed.ts              Sample data (including the Lake trip group)
src/
  app/
    page.tsx           Dashboard entry
    api/               Route handlers (settings, budgets, purchases, plan, groups, paypal…)
  components/          UI: budget, purchases, wishlist, plan, groups, checkout, modals
  lib/
    ollama.ts          Local model client (JSON mode)
    planner.ts         Plan + categorization prompts and heuristic fallbacks
    channel3.ts        Product search + fallback catalogue
    paypal.ts          Orders v2 create/capture
    group.ts           Integer-cent split, balances, repayment plan, group DTOs
    group-data.ts      Shared Prisma query includes
    dto.ts             Response shaping
```

---

## Deploying to Render

A `render.yaml` blueprint is included. It provisions a Node web service with a **persistent disk**
for SQLite at `/var/data`, sets `DATABASE_URL=file:/var/data/prod.db`, and runs `prisma db push`
during the build.

Ollama runs on your development machine, so a hosted demo needs a reachable Ollama instance
(set `OLLAMA_BASE_URL` to it). Otherwise judges/visitors can run the app together with Ollama
locally using the setup above — the heuristic planner keeps every flow working even without Ollama.

Set the PayPal and Channel3 variables as secrets in the Render dashboard.

---

## License

MIT — see [LICENSE](./LICENSE).
