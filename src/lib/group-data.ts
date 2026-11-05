import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";

/**
 * Shared Prisma shapes for group queries. Keeping them in one place makes the
 * inferred payload types line up with the DTO mappers, and avoids forgetting a
 * relation in one route but not another.
 */
export const groupSummaryInclude = Prisma.validator<Prisma.GroupInclude>()({
  members: { select: { id: true, displayName: true, isSelf: true } },
  _count: { select: { members: true, expenses: true } },
});

export const groupDetailInclude = Prisma.validator<Prisma.GroupInclude>()({
  members: { orderBy: { createdAt: "asc" } },
  expenses: {
    include: {
      payer: true,
      shares: { include: { member: true } },
    },
  },
  directionChanges: { include: { fromMember: true, toMember: true } },
  settlements: {
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    include: { sender: true, recipient: true },
  },
});

export async function findGroupSummaries() {
  return prisma.group.findMany({
    include: groupSummaryInclude,
    orderBy: { createdAt: "asc" },
  });
}

export async function findGroupDetail(id: string) {
  return prisma.group.findUnique({
    where: { id },
    include: groupDetailInclude,
  });
}

/** Load a group + members for validating that ids belong to the group. */
export async function findGroupWithMembers(id: string) {
  return prisma.group.findUnique({
    where: { id },
    include: { members: true },
  });
}
