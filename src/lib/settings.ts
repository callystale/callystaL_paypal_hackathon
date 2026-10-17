import type { Settings } from "@prisma/client";
import { prisma } from "./prisma";

export const SETTINGS_ID = "singleton";

export const DEFAULT_SETTINGS: { salary: number; goals: string | null; monthStartDay: number } = {
  salary: 0,
  goals: null,
  monthStartDay: 1,
};

/** Settings DTO exposed to the browser. */
export interface SettingsDTO {
  salary: number;
  goals: string | null;
  monthStartDay: number;
}

export function toSettingsDTO(settings: {
  salary: number;
  goals: string | null;
  monthStartDay: number;
}): SettingsDTO {
  return { salary: settings.salary, goals: settings.goals, monthStartDay: settings.monthStartDay };
}

/** Reads the singleton settings row, creating it with defaults on first use. */
export async function getSettings(): Promise<Settings> {
  return prisma.settings.upsert({
    where: { id: SETTINGS_ID },
    create: { id: SETTINGS_ID, ...DEFAULT_SETTINGS },
    update: {},
  });
}
