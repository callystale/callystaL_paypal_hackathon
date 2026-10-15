# Budget Planner

Set category budgets, record spending, and let a locally-run AI turn your wishlist into
**affordable milestones**. For each planned item the app finds cheaper alternatives, and when
you're ready you approve a milestone and pay with **PayPal Sandbox**.

The AI recommends. You approve. Nothing is ever paid automatically.

---

## The workflow

| Step | What happens | Where in the UI |
| ---- | ------------ | --------------- |
| 1. Set up a budget | Choose spending categories and set a budget for each — or skip budgets and just track spending. | **Budget** panel |
| 2. Add purchases | Record purchases manually. AI categorizes each item and shows spending against the budget. Correct its guesses anytime. | **Purchases** panel |
| 3. Build a purchase plan | Add desired items with optional priority, target date, or max price. The AI groups them into affordable milestones based on your budget and priorities. | **Desired items** + **AI milestones** |
| 4. Find lower-cost options | For each planned item, the app searches similar products and compares price, availability, and fit. Swap an item into your plan in one click. | **Find cheaper** → alternatives modal |
| 5. Pay when ready | Select a milestone, review the total, and approve a PayPal checkout. Items are marked purchased after capture. | **Check out this milestone** |

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
- **Database:** SQLite via Prisma.

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

## Scripts

| Command | Description |
| ------- | ----------- |
| `npm run dev` | Start the dev server |
| `npm run build` | `prisma generate` + production build |
| `npm start` | Start the production server |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | `next lint` |
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
  schema.prisma        Category, Purchase, DesiredItem, Milestone, Order
  seed.ts              Sample data
src/
  app/
    page.tsx           Dashboard entry
    api/               Route handlers (budgets, purchases, plan, alternatives, paypal…)
  components/          UI: budget, purchases, wishlist, plan, checkout, modals
  lib/
    ollama.ts          Local model client (JSON mode)
    planner.ts         Plan + categorization prompts and heuristic fallbacks
    channel3.ts        Product search + fallback catalogue
    paypal.ts          Orders v2 create/capture
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
