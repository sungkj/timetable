import { LOCAL_EVENTS_KEY, LOCAL_TITLE_KEY } from "./constants.ts";
import type { TimetableEvent } from "./types.ts";

export function readLocalEvents(): TimetableEvent[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(LOCAL_EVENTS_KEY) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function readLocalTitle(): string {
  try {
    return localStorage.getItem(LOCAL_TITLE_KEY) || "";
  } catch {
    return "";
  }
}

export function writeLocalEvents(events: TimetableEvent[]): void {
  try {
    localStorage.setItem(LOCAL_EVENTS_KEY, JSON.stringify(events));
  } catch {}
}

export function writeLocalTitle(name: string): void {
  try {
    localStorage.setItem(LOCAL_TITLE_KEY, name);
  } catch {}
}
