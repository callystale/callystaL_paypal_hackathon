# BudgetPal

Set up a monthly budget with AI help, record spending, and let a locally-run AI turn your
wishlist into **affordable milestones**. For each planned item the app finds cheaper
alternatives, and when you're ready you approve a milestone and pay with **PayPal Sandbox**.

The AI recommends. You approve. Nothing is ever paid automatically.

---

## Browser demo (GitHub Pages)

The static demo renders the same `Dashboard` and `GroupsPanel` components as the full app,
with a browser-only sample-data adapter. It preserves the actual layout, calendar, budget
forms, purchase list, wishlist, milestones, and side-by-side group split. A persistent banner
explains that live AI is off and suggestions are preloaded from a local Ollama run against
the original sample inputs. Personal and group edits stay in memory and reset on reload.
PayPal is disabled; no orders, captures, or payment links are created. Product search and
features requiring fresh AI inference explain their limits instead of claiming live results.

Build with `npm run demo:build`; serve `demo-dist/` with a static web server. No `.env`,
private database, or API credentials are bundled. `demo/snapshot.json` comes from an isolated,
synthetic seeded database and contains saved plans, budget questions, and budget suggestions. `demo/whatif.json` contains genuine pre-recorded
AI buy-now assessments for all six original sample wishlist items. Their dialogs explicitly
label the saved responses; edits do not regenerate these assessments.

To refresh the fixtures, use a dedicated temporary database and a running local Ollama model:

```bash
DATABASE_URL=file:/tmp/budgetpal-demo-ui.db npm run db:push
DATABASE_URL=file:/tmp/budgetpal-demo-ui.db node --import tsx prisma/seed.ts
DATABASE_URL=file:/tmp/budgetpal-demo-ui.db node --import tsx scripts/export-demo.ts
DATABASE_URL=file:/tmp/budgetpal-demo-ui.db npm run demo:capture-whatif
npm run demo:build
```

The exporter refuses other database paths. Run `node --import tsx --test demo/transport.test.ts`
to verify that dashboard and group flows work without network API calls.

The workflow `.github/workflows/demo-pages.yml` builds and publishes the demo on pushes to
`main`. In the repository's **Settings → Pages**, select **GitHub Actions** as the publishing
source. Once deployment succeeds, use the URL returned by the **github-pages** environment
as the submission's **Try it out** link. Expected project URL:
`https://callystale.github.io/callystaL_paypal_hackathon/` (verify deployment before submitting).
The full Next.js app and real PayPal Sandbox integration still run using the instructions below.

---

## Run with Docker (judges)

Install [Docker Desktop](https://docs.docker.com/get-started/get-docker/) or Docker Engine with
Compose, and start the Docker daemon. Clone this repository and run, from the project folder:

```bash
docker compose up --build
```

Open <http://localhost:3000>. The first start builds the app, creates a separate SQLite volume,
and loads sample purchases, wishlist milestones, and two shared-expense groups. Subsequent
starts retain changes; stopping the containers does not erase the database. If port 3000 is
already in use, set `BUDGETPAL_PORT=3001` and open `http://localhost:3001` instead. To stop,
press Ctrl+C, then run `docker compose down`. For the AI option, use
`docker compose -f compose.yaml -f compose.ai.yaml down` instead.

**To test real AI inference**, use the Ollama option below. It downloads the `llama3.2:3b`
model on first use and can take several minutes. Allow at least 12 GB of free disk space for
the container images, dependencies, and model. The app starts after the download completes.
Model files and the database are stored in named Docker volumes.
CPU-only inference can be slow.

```bash
docker compose -f compose.yaml -f compose.ai.yaml up --build
```

Without the AI option, Docker attempts to reach Ollama on the host at
`host.docker.internal:11434`; when unavailable, the app uses its explicitly labeled heuristic
fallback. If you already run Ollama on the host, ensure it accepts connections from Docker,
then pull `llama3.2:3b` before starting. The AI status indicator checks server availability;
the model must also be present for inference to work. A different model can be set with
`OLLAMA_MODEL` in `.env` before starting.

**To test PayPal checkout**, supply Sandbox app credentials in an untracked `.env` file in the
project root before starting Docker (copy `.env.example` if `.env` does not already exist):

```dotenv
PAYPAL_CLIENT_ID=your_sandbox_app_client_id
PAYPAL_CLIENT_SECRET=your_sandbox_app_secret
```

Use the [PayPal Developer Dashboard](https://developer.paypal.com/dashboard/) to obtain the
Sandbox app credentials and a Sandbox buyer login. Docker always uses PayPal Sandbox. The
server supplies the public client ID to the browser at runtime; the secret stays server-side.
The seeded group member addresses are examples, not buyer login credentials. To test a group
repayment, edit its member emails to match accessible Sandbox accounts and log in as the
sender shown at checkout. Contact the entrant through the Devpost submission if the dedicated
judge access details are needed. Do not commit credentials or passwords to the public repo.

**Live product search** additionally requires `CHANNEL3_API_KEY` in `.env`. Without it, the
app shows labeled demo results with estimated prices, not live product photos or retailer links.
After changing `.env`, recreate containers with the relevant `docker compose ... up --build`
command so Compose passes the new settings. `DATABASE_URL` in `.env` is ignored by Docker:
the container uses its own persistent volume. Set `SEED_DEMO=false` before the first startup
to start with an empty database. `BUDGETPAL_TZ` changes the container timezone; the default is
`Asia/Ho_Chi_Minh`.

### Judge walkthrough

1. Review the seeded budget, purchases, and wishlist. In **AI milestones**, select an item or a
   combination and review the PayPal Sandbox checkout. The payment updates only the selected
   items after successful capture.
2. With the AI option running, open **My budget**, use **Ask AI to plan my budget**, answer the
   questions, and select **Get suggested split**. A model-produced suggestion says “Suggested
   by your local AI”; “Suggested heuristically” means the app used its fallback. You can also
   use **Generate plan** or **Regenerate** in **AI milestones**.
3. Open **Split shared spending**, choose a sample group, and review expenses and suggested
   repayments. Use **Ask AI about repayments** to ask a question. If Sandbox accounts have been
   configured, use **Pay with PayPal** and confirm the updated balance after capture.
4. Open **Find cheaper** on a wishlist item. With Channel3 configured it can show live product
   offers; otherwise it explains that the results are estimates.

For a clean sample database, first stop the app and explicitly remove the Docker volume with
`docker compose down -v`. **This deletes the Docker demo database.** Run the startup command
again to reseed it. If using the AI option, `docker compose -f compose.yaml -f compose.ai.yaml
down -v` also deletes the downloaded model volume.

---

## The workflow

| Step | What happens | Where in the UI |
| ---- | ------------ | --------------- |
| 1. Set up a monthly budget | Enter your monthly take-home income and the categories you care about. The local AI asks a few questions, proposes an amount for each category, and you adjust anything before saving. | **Monthly budget** panel |
| 2. Add purchases | Record purchases manually. AI categorizes each item and shows spending against the budget. Correct its guesses anytime. | **Purchases** panel |
| 3. Set up a budget | Choose spending categories and set a budget for each — or skip budgets and just track spending. | **Budget** panel |
| 4. Build a purchase plan | Add desired items with optional priority, target date, or max price. The AI groups them into affordable milestones based on your budget and priorities. | **Desired items** + **AI milestones** |
| 5. Find lower-cost options | For each planned item, the app searches similar products and compares price, availability, and fit. Swap an item into your plan in one click. | **Find cheaper** → alternatives modal |
| 6. Pay when ready | Select one item, any combination, a milestone, or all unpaid items. Review and approve checkout; only captured items are marked purchased. | **AI milestones** → **Pay selected** |
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
requires PayPal Sandbox credentials.

---

## Run without Docker

### Prerequisites

- Node.js 22 (the seed command uses Node’s `--env-file-if-exists` option)
- Optional for live AI: [Ollama](https://ollama.com) running locally with a chat model pulled:
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

`npm run db:seed` adds sample data without deleting or overwriting existing records. It can be
run repeatedly without duplicating the same records. `npm run db:reset` remains the explicit
command for a clean database reset.

The notebook sample includes:

- Purchases across the current and previous payday periods, with groceries, dining, transport,
  daily essentials, rent, savings, giving, and travel. Existing budgets and spending are respected;
  sample purchases only fill the remaining room in each category.
- Six wishlist items with target dates and three ready-to-review milestones.
- **Da Lat weekend · sample** and **Sunday dinner club · sample**, using **You**, **Mia**, and
  **Nguyen** and their existing saved PayPal accounts. On an empty database, the same sandbox
  account identities are used.
- Multiple payers, cent-exact shared expenses, and a clearly labeled sample manual repayment.
  Seeding never calls PayPal or creates a real payment.

Dates follow the configured budget start day in the Asia/Ho_Chi_Minh timezone. Use `SEED_DATE`
(an ISO timestamp) to make a sample run reproducible. Existing income, goals, groups, payment
history, and edited sample records remain unchanged.

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
  seed.ts              Sample budgets, wishlist items, and two groups
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
