import type { Settings } from "@prisma/client";
import { prisma } from "./prisma";

export const SETTINGS_ID = "singleton";

export const DEFAULT_SETTINGS: { salary: number; goals: string | null } = {
  salary: 0,
  goals: null,
};

/** Settings DTO exposed to the browser. */
export interface SettingsDTO {
  salary: number;
  goals: string | null;
}

export function toSettingsDTO(settings: {
  salary: number;
  goals: string | null;
}): SettingsDTO {
  return { salary: settings.salary, goals: settings.goals };
}

/** Reads the singleton settings row, creating it with defaults on first use. */
export async function getSettings(): Promise<Settings> {
  return prisma.settings.upsert({
    where: { id: SETTINGS_ID },
    create: { id: SETTINGS_ID, ...DEFAULT_SETTINGS },
    update: {},
  });
}
