import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { bad, ok, toErrorResponse } from "@/lib/api";
import { memberDisplayName, memberPaypalEmailSchema } from "@/lib/group-member";

export const dynamic = "force-dynamic";

const updateSchema = z
  .object({
    displayName: z.string().trim().max(120).optional(),
    isSelf: z.boolean().optional(),
    paypalAddress: z.string().trim().max(120).nullable().optional(),
  })
  .refine(
    (value) =>
      value.displayName !== undefined ||
      value.isSelf !== undefined ||
      value.paypalAddress !== undefined,
    { message: "Nothing to update" },
  );

export async function PATCH(
  request: Request,
  { params }: { params: { id: string; memberId: string } },
) {
  try {
    const body = updateSchema.parse(await request.json());
    const member = await prisma.groupMember.findFirst({
      where: { id: params.memberId, groupId: params.id },
    });
    if (!member) return bad("Member not found", 404);

    // Keep an automatically displayed email in sync when its address changes.
    // A custom nickname remains independent of the payment address.
    const address = body.paypalAddress !== undefined
      ? body.paypalAddress || null
      : member.paypalAddress;
    const email = memberPaypalEmailSchema.safeParse(address);
    const paypalAddress = email.success ? email.data : address;
    const displayName = memberDisplayName(
      body.displayName !== undefined
        ? body.displayName
        : member.displayName === member.paypalAddress ? undefined : member.displayName,
      paypalAddress,
    );
    if (!displayName) return bad("Enter a nickname or PayPal address", 422);

    if (email.success) {
      // Existing addresses may predate email normalization.
      const members = await prisma.groupMember.findMany({ where: { groupId: params.id } });
      if (members.some((other) => other.id !== member.id &&
        other.paypalAddress?.trim().toLowerCase() === email.data)) {
        return bad("A member with that PayPal email already exists in this group", 409);
      }
    }

    if (displayName !== member.displayName) {
      const duplicate = await prisma.groupMember.findFirst({
        where: {
          groupId: params.id,
          displayName,
          id: { not: member.id },
        },
      });
      if (duplicate) {
        return bad("A member with that name already exists in this group", 409);
      }
    }

    const updated = await prisma.$transaction(async (tx) => {
      // A group has at most one "you" marker, so clear the old one first.
      if (body.isSelf === true) {
        await tx.groupMember.updateMany({
          where: { groupId: params.id, isSelf: true },
          data: { isSelf: false },
        });
      }
      return tx.groupMember.update({
        where: { id: member.id },
        data: {
          displayName,
          ...(body.isSelf !== undefined ? { isSelf: body.isSelf } : {}),
          ...(body.paypalAddress !== undefined
            ? { paypalAddress }
            : {}),
        },
      });
    });

    return ok({
      id: updated.id,
      displayName: updated.displayName,
      isSelf: updated.isSelf,
      paypalAddress: updated.paypalAddress,
      createdAt: updated.createdAt.toISOString(),
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: { id: string; memberId: string } },
) {
  try {
    const member = await prisma.groupMember.findFirst({
      where: { id: params.memberId, groupId: params.id },
      include: {
        _count: {
          select: {
            expensesPaid: true,
            shares: true,
            settlementsSent: true,
            settlementsReceived: true,
            reversalsFrom: true,
            reversalsTo: true,
          },
        },
      },
    });
    if (!member) return bad("Member not found", 404);

    const references =
      member._count.expensesPaid +
      member._count.shares +
      member._count.settlementsSent +
      member._count.settlementsReceived +
      member._count.reversalsFrom +
      member._count.reversalsTo;
    if (references > 0) {
      return bad(
        "This member is part of an expense or settlement. Remove those records first.",
        409,
      );
    }

    await prisma.groupMember.delete({ where: { id: member.id } });
    return ok({ deleted: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}
