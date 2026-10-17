import type { TimetableEvent } from "./types.ts";

const PENDING_KEY = "timetable:pending-save";

export interface PendingSave {
  name: string;
  events: TimetableEvent[];
}

// 서버로 보내지 못한 내용을 브라우저에 남겨 둔다. 나중에 다시 보낸다.
// 여러 번 실패해도 가장 최근 내용 하나만 있으면 되므로 항목은 하나뿐이다.
export function writePendingSave(save: PendingSave): boolean {
  try {
    localStorage.setItem(PENDING_KEY, JSON.stringify(save));
    return true;
  } catch {
    return false;
  }
}

export function readPendingSave(): PendingSave | null {
  try {
    const parsed = JSON.parse(localStorage.getItem(PENDING_KEY) || "null");
    if (!parsed || typeof parsed.name !== "string" || !Array.isArray(parsed.events)) {
      return null;
    }
    return { name: parsed.name, events: parsed.events };
  } catch {
    return null;
  }
}

export function clearPendingSave(): void {
  try {
    localStorage.removeItem(PENDING_KEY);
  } catch {}
}
