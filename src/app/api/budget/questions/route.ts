import { z } from "zod";
import { ok, toErrorResponse } from "@/lib/api";
import { budgetQuestions } from "@/lib/budget";

export const dynamic = "force-dynamic";

const schema = z.object({
  salary: z.number().nonnegative(),
  goals: z.string().max(2000).nullable().optional(),
  categories: z.array(z.object({ name: z.string().min(1).max(60) })).max(50),
});

/** Step 1a: the model asks the user a few questions about their budget. */
export async function POST(request: Request) {
  try {
    const body = schema.parse(await request.json());
    const result = await budgetQuestions({
      salary: body.salary,
      goals: body.goals ?? null,
      categories: body.categories.map((c) => ({ name: c.name })),
    });
    return ok(result);
  } catch (error) {
    return toErrorResponse(error);
  }
}
