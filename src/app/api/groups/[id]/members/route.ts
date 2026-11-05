import { prisma } from "@/lib/prisma";
import { bad, ok, toErrorResponse } from "@/lib/api";
import { findGroupWithMembers } from "@/lib/group-data";
import { createGroupMemberSchema } from "@/lib/group-member";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: { id: string } },
) {
  try {
    const body = createGroupMemberSchema.parse(await request.json());
    const group = await findGroupWithMembers(params.id);
    if (!group) return bad("Group not found", 404);
    if (group.members.some((member) =>
      member.paypalAddress?.trim().toLowerCase() === body.paypalAddress,
    )) {
      return bad("A member with that PayPal email already exists in this group", 409);
    }
    if (group.members.some((member) => member.displayName === body.displayName)) {
      return bad("A member with that name already exists in this group", 409);
    }

    const member = await prisma.groupMember.create({
      data: {
        groupId: params.id,
        displayName: body.displayName,
        paypalAddress: body.paypalAddress || null,
      },
    });

    return ok(
      {
        id: member.id,
        displayName: member.displayName,
        isSelf: member.isSelf,
        paypalAddress: member.paypalAddress,
        createdAt: member.createdAt.toISOString(),
      },
      201,
    );
  } catch (error) {
    return toErrorResponse(error);
  }
}
