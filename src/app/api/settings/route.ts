import { ok, toErrorResponse } from "@/lib/api";
import { getSettings, toSettingsDTO } from "@/lib/settings";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return ok(toSettingsDTO(await getSettings()));
  } catch (error) {
    return toErrorResponse(error);
  }
}
