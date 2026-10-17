import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ok, toErrorResponse } from "@/lib/api";
import { DEFAULT_SETTINGS, getSettings, SETTINGS_ID, toSettingsDTO } from "@/lib/settings";

export const dynamic = "force-dynamic";

const patchSchema = z.object({
  monthStartDay: z.number().int().min(1).max(31).optional(),
  salary: z.number().nonnegative().optional(),
  goals: z.string().max(2000).nullable().optional(),
});

export async function GET() {
  try {
    return ok(toSettingsDTO(await getSettings()));
  } catch (error) {
    return toErrorResponse(error);
  }
}

/** Partial update, currently used by the calendar to set the period start day. */
export async function PATCH(request: Request) {
  try {
    const body = patchSchema.parse(await request.json());
    const settings = await prisma.settings.upsert({
      where: { id: SETTINGS_ID },
      create: { id: SETTINGS_ID, ...DEFAULT_SETTINGS, ...body },
      update: body,
    });
    return ok(toSettingsDTO(settings));
  } catch (error) {
    return toErrorResponse(error);
  }
}
