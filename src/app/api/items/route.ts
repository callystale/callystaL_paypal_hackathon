import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ok, toErrorResponse } from "@/lib/api";
import { toItemDTO } from "@/lib/dto";

export const dynamic = "force-dynamic";

const createSchema = z.object({
  name: z.string().min(1).max(120),
  targetPrice: z.number().positive(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH"]).optional(),
  targetDate: z.string().datetime().nullable().optional(),
  url: z.string().url().nullable().optional(),
  category: z.string().max(60).nullable().optional(),
  notes: z.string().max(300).nullable().optional(),
});

export async function GET() {
  try {
    const items = await prisma.desiredItem.findMany({
      orderBy: [{ purchased: "asc" }, { createdAt: "desc" }],
    });
    return ok(items.map(toItemDTO));
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = createSchema.parse(await request.json());
    const item = await prisma.desiredItem.create({
      data: {
        name: body.name.trim(),
        targetPrice: body.targetPrice,
        priority: body.priority ?? "MEDIUM",
        targetDate: body.targetDate ? new Date(body.targetDate) : null,
        url: body.url ?? null,
        category: body.category ?? null,
        notes: body.notes ?? null,
      },
    });
    return ok(toItemDTO(item), 201);
  } catch (error) {
    return toErrorResponse(error);
  }
}
