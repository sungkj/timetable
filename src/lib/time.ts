import { DAY_START_MINUTES, TOTAL_MINUTES } from "./constants.ts";
import type { TimetableEvent } from "./types.ts";

export function timeToMinutes(timeStr: string): number {
  const [h, m] = timeStr.split(":").map(Number);
  return h * 60 + m;
}

export function minutesToTimeStr(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function format12h(timeStr: string): string {
  const [h, m] = timeStr.split(":").map(Number);
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${String(hour12)}:${String(m).padStart(2, "0")}`;
}

export function formatLabel(timeStr: string): string {
  const [h, m] = timeStr.split(":").map(Number);
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  if (m === 0) return `${hour12}시`;
  return `${hour12}시 ${m}분`;
}

// 시각을 그리드 안의 세로 위치(%)로 바꾼다. 범위를 벗어나면 0~100으로 자른다.
export function calculatePosition(timeStr: string): number {
  const minutes = timeToMinutes(timeStr);
  return Math.max(0, Math.min(100, ((minutes - DAY_START_MINUTES) / TOTAL_MINUTES) * 100));
}

// 분 단위 시작 시각 → 그리드 top(%)
export function topPercent(startMinutes: number): number {
  return ((startMinutes - DAY_START_MINUTES) / TOTAL_MINUTES) * 100;
}

// 분 단위 길이 → 그리드 height(%)
export function heightPercent(durationMinutes: number): number {
  return (durationMinutes / TOTAL_MINUTES) * 100;
}

// [start, end) 가 기존 일정과 겹치는지. 끝과 시작이 맞닿은 경우는 겹치지 않는 것으로 본다.
export function isOverlap(
  events: TimetableEvent[],
  day: number,
  start: number,
  end: number,
  ignoreId?: string
): boolean {
  return events.some(ev => {
    if (ev.id === ignoreId) return false;
    if (ev.day !== day) return false;
    const s = timeToMinutes(ev.startTime);
    const e = timeToMinutes(ev.endTime);
    return start < e && end > s;
  });
}

// 3자리 유니크 ID 생성 (001~999)
export function generateId3(currentEvents: TimetableEvent[]): string {
  const usedIds = new Set(currentEvents.map(e => e.id));
  for (let i = 1; i <= 999; i++) {
    const id = String(i).padStart(3, "0");
    if (!usedIds.has(id)) return id;
  }
  return Date.now().toString(); // 999개가 꽉 찬 경우 타임스탬프 사용
}

// 그리드의 실제 픽셀 높이. 레이아웃 전이라 clientHeight가 0이면 rect로 대체한다.
export function gridHeight(gridEl: HTMLElement): number {
  return gridEl.clientHeight || gridEl.getBoundingClientRect().height;
}
