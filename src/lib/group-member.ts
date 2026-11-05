import { z } from "zod";

export const memberPaypalEmailSchema = z
  .string()
  .trim()
  .max(120)
  .email("Enter a valid PayPal email address")
  .transform((email) => email.toLowerCase());

/** A nickname affects presentation only; the payment address stays separate. */
export function memberDisplayName(
  nickname: string | null | undefined,
  paypalAddress: string | null | undefined,
): string {
  return nickname?.trim() || paypalAddress?.trim() || "";
}

export const createGroupMemberSchema = z
  .object({
    displayName: z.string().trim().max(120).optional(),
    paypalAddress: memberPaypalEmailSchema,
  })
  .transform((member) => ({
    ...member,
    displayName: memberDisplayName(member.displayName, member.paypalAddress),
  }));
