import { NextResponse } from "next/server";
import { ZodError } from "zod";

export function ok<T>(data: T, status = 200): NextResponse {
  return NextResponse.json(data, { status });
}

export function bad(message: string, status = 400): NextResponse {
  return NextResponse.json({ error: message }, { status });
}

export function toErrorResponse(error: unknown): NextResponse {
  if (error instanceof ZodError) {
    return bad(error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "), 422);
  }
  const message = error instanceof Error ? error.message : "Unexpected error";
  return bad(message, 500);
}
