import { ok, toErrorResponse } from "@/lib/api";
import { channel3Enabled } from "@/lib/channel3";
import { ollamaAvailable } from "@/lib/ollama";
import { paypalClientId, paypalConfigured } from "@/lib/paypal";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return ok({
      ollama: {
        configured: await ollamaAvailable(),
        model: process.env.OLLAMA_MODEL || "llama3.2:3b",
        baseUrl: process.env.OLLAMA_BASE_URL || "http://localhost:11434",
      },
      channel3: { configured: channel3Enabled() },
      paypal: {
        configured: paypalConfigured(),
        clientId: paypalClientId(),
        env: process.env.PAYPAL_ENV || "sandbox",
        currency: process.env.PAYPAL_CURRENCY || "USD",
      },
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
