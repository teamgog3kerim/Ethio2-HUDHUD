import { randomUUID } from "node:crypto";
import { getAuth } from "./auth";
import { db, learners } from "@workspace/db";
import { eq } from "drizzle-orm";
import type { Request, Response } from "express";
import { getAppSettings } from "./app-settings";
import type { StudySchedule } from "@workspace/api-zod";

export const defaultPreferences = {
  displayName: "متعلّم جديد", level: "beginner" as const,
  goals: ["conversation"], dailyGoal: 60, timezone: "Africa/Addis_Ababa",
  reminderTime: "19:00", reminderEnabled: false, language: "ar" as const,
  onboardingComplete: false, retainChat: true,
  studySchedule: null as StudySchedule | null,
};
export async function getLearner(req: Request, res: Response) {
  const auth = getAuth(req);
  const userId = auth.userId;
  let guest = req.signedCookies?.hudhud_guest;
  if (!userId && (typeof guest !== "string" || !/^[0-9a-f-]{36}$/.test(guest))) {
    if (!process.env.SESSION_SECRET) throw new Error("SESSION_SECRET is required");
    guest = randomUUID();
    res.cookie("hudhud_guest", guest, { signed: true, httpOnly: true, sameSite: "lax", secure: req.secure, maxAge: 365 * 86400000, path: "/api" });
  }
  const identity = userId ? `account:${userId}` : `guest:${guest}`;
  const [existing] = await db.select().from(learners).where(eq(learners.identity, identity));
  if (!existing) {
    const settings = await getAppSettings();
    await db.insert(learners).values({ identity, preferences: { ...defaultPreferences, dailyGoal: settings.defaultDailyGoal } }).onConflictDoNothing();
  }
  const [learner] = await db.select().from(learners).where(eq(learners.identity, identity));
  if (!learner) throw new Error("Unable to initialize learner");
  const preferences = { ...defaultPreferences, ...(learner.preferences as Partial<typeof defaultPreferences>) };
  return { ...learner, preferences, isGuest: !userId };
}
export function profileOf(learner: Awaited<ReturnType<typeof getLearner>>) {
  return { ...learner.preferences, id: learner.id, isGuest: learner.isGuest, joinedAt: learner.joinedAt.toISOString() };
}
export function dateInZone(date: Date, zone: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}
