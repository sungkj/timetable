import type { PastelColor } from "./types.ts";

export const DAYS = ["월", "화", "수", "목", "금", "토", "일"];
export const START_HOUR = 8;
export const END_HOUR = 21;
export const HOURS = Array.from({ length: END_HOUR - START_HOUR + 1 }, (_, i) => i + START_HOUR);
export const TEN_MIN_SLOTS = [0, 10, 20, 30, 40, 50];

// 그리드가 나타내는 시간 범위 (분 단위). 시작 시각부터 END_HOUR 다음 시 정각까지.
export const DAY_START_MINUTES = START_HOUR * 60;
export const DAY_END_MINUTES = (END_HOUR + 1) * 60;
export const TOTAL_MINUTES = DAY_END_MINUTES - DAY_START_MINUTES;
export const MIN_EVENT_MINUTES = 10;

export const PASTEL_COLORS: PastelColor[] = [
  { bg: "#e3f2fd", border: "#2196f3", label: "파랑" },
  { bg: "#fce4ec", border: "#f06292", label: "분홍" },
  { bg: "#e8f5e9", border: "#66bb6a", label: "초록" },
  { bg: "#fff3e0", border: "#ffb74d", label: "주황" },
  { bg: "#f3e5f5", border: "#ba68c8", label: "보라" },
  { bg: "#efebe9", border: "#8d6e63", label: "갈색" },
];

export const LOCAL_EVENTS_KEY = "my-timetable-events";
export const LOCAL_TITLE_KEY = "my-timetable-title";
export const DEFAULT_TIMETABLE_NAME = "내 시간표";
