import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ok, toErrorResponse } from "@/lib/api";
import { toMilestoneDTO } from "@/lib/dto";

export async function POST(request: Request) {
  try {
    const { title } = z.object({ title: z.string().trim().min(1).max(80) }).parse(await request.json());
    const milestone = await prisma.$transaction(async (tx) => {
      const last = await tx.milestone.aggregate({ _max: { sequence: true } });
      return tx.milestone.create({ data: { title, sequence: (last._max.sequence ?? 0) + 1 }, include: { items: true } });
    });
    return ok(toMilestoneDTO(milestone), 201);
  } catch (error) { return toErrorResponse(error); }
}
