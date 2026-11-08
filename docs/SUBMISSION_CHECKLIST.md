# BudgetPal submission checklist

The official [rules](https://paypalaihackathon.devpost.com/rules) and [hackathon overview](https://paypalaihackathon.devpost.com/) govern the submission. This checklist records what remains to verify; it is not a submission confirmation.

## Deadline

- Submit all required Devpost fields by **November 12, 2026 at 12:00 p.m. Pacific Standard Time**, which is **November 13 at 3:00 a.m. in Ho Chi Minh City**.
- Keep the project freely accessible for judges through the end of judging: **December 15, 2026 at 8:00 a.m. PST**, or **11:00 p.m. in Ho Chi Minh City**. The rules permit judges to evaluate the text, images, and video without testing.

## Required submission

- [ ] Join the hackathon and complete and submit all required Devpost fields. Confirm entrant eligibility and, if entering as a team, designate an authorized representative.
- [ ] Describe BudgetPal's features and identify the AI model/service and how it is used. The project must integrate PayPal Sandbox and an AI tool, with PayPal central to the project. Sponsor tools such as Channel3 are optional for the main competition.
- [ ] Give judges a functional build and complete setup and testing instructions, or a hosted demo. The repository's Docker instructions are a local-run option; a static mockup is insufficient. Verify the instructions from a clean checkout.
- [ ] Supply any test-account details, API keys, Sandbox logins, or clear instructions for obtaining special access needed to test the project. BudgetPal's seeded PayPal email addresses do not include passwords. Arrange dedicated Sandbox buyer and recipient access and a means for judges to obtain it. Keep secrets out of the public repository. Explain how judges can use Ollama and, if demonstrating live offers, Channel3.
- [ ] Make the repository public and include all source, assets, and instructions. Confirm GitHub detects the existing MIT `LICENSE` in the repository's About section while signed out. Push the final changes before providing the repository URL; local files alone are not available to judges.
- [ ] Upload a **public YouTube video under three minutes**, showing the functioning application on its intended device, and include its link in the submission. Obtain permission for third-party trademarks or copyrighted material in the video, or omit them.
- [ ] Submit materials in English, or include the English translations required by the rules. Confirm rights to the project's third-party tools and assets. If the project existed before October 1, explain its significant updates during the submission period.
- [ ] Review the specific sponsor-prize requirements before claiming one. For example, a Channel3 prize requires actual use of Channel3; the built-in estimated catalogue is a fallback.

## Suggested description draft

BudgetPal helps people turn a monthly budget and wishlist into achievable milestones. It tracks purchases, proposes a budget and staged plan using a local Ollama model, and lets users compare lower-cost product offers when Channel3 is configured. Users can choose one item or a combination for PayPal Sandbox checkout. Shared groups split expenses, calculate net balances and suggested repayments, answer questions about the ledger, and support PayPal Sandbox settlement. The user reviews and approves each payment. If Ollama or Channel3 is unavailable, the interface identifies the corresponding fallback.

**Tools:** Next.js, TypeScript, Prisma/SQLite, Ollama (`llama3.2:3b` by default), PayPal JavaScript SDK and Orders v2 Sandbox API, and optional Channel3 product search. Ollama is used for budget suggestions, purchase categorization, milestone planning, product comparisons, and selecting relevant calculated repayment facts.

## Suggested video outline (2:40)

- **0:00–0:20:** Who the app helps and the budgeting problem.
- **0:20–0:50:** Enter or review a budget and show a suggestion labeled “Suggested by your local AI.”
- **0:50–1:15:** Show a wishlist, a product comparison, and selected-item checkout review. State clearly if product offers are demo estimates.
- **1:15–2:10:** Open a sample group, show the repayment explanation on request, and complete a PayPal Sandbox payment; show the updated result.
- **2:10–2:40:** Recap the user benefit and the tools, showing the working app.

Recommendations: review the production dependency audit before exposing the app publicly; `npm audit --omit=dev` currently reports critical and high advisories for existing dependencies. The provided Docker port is bound to localhost. Rehearse the entire flow with the same build and configuration judges will receive; use a clean browser window and no unlicensed music; keep a fixed submission commit and the demo available during judging. Check Devpost's access mechanism before sharing dedicated test credentials.
