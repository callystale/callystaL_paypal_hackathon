import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { bad, ok, toErrorResponse } from "@/lib/api";
import { toGroupDetailDTO, toGroupSummaryDTO } from "@/lib/dto";
import { findGroupDetail, findGroupSummaries } from "@/lib/group-data";
import { GROUP_CURRENCIES } from "@/lib/group";

export const dynamic = "force-dynamic";

const createSchema = z.object({
  name: z.string().trim().min(1).max(80),
  currency: z.enum(GROUP_CURRENCIES).default("USD"),
  /** Creates the "you" member. Account-less demo groups need one for balances. */
  yourName: z.string().trim().min(1).max(60).optional(),
  /** PayPal email or PayPal.Me handle for the local user. */
  yourPaypalAddress: z.string().trim().max(120).optional(),
});

export async function GET() {
  try {
    const groups = await findGroupSummaries();
    return ok(groups.map(toGroupSummaryDTO));
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = createSchema.parse(await request.json());
    if (!GROUP_CURRENCIES.includes(body.currency)) {
      return bad("Unsupported currency", 400);
    }

    const group = await prisma.group.create({
      data: {
        name: body.name,
        currency: body.currency,
        ...(body.yourName
          ? {
              members: {
                create: {
                  displayName: body.yourName,
                  isSelf: true,
                  paypalAddress: body.yourPaypalAddress || null,
                },
              },
            }
          : {}),
      },
    });

    const detail = await findGroupDetail(group.id);
    return ok(toGroupDetailDTO(detail!), 201);
  } catch (error) {
    return toErrorResponse(error);
  }
}
