export interface TimetableEvent {
  id: string;
  day: number;
  startTime: string;
  endTime: string;
  title: string;
  color: string; // PASTEL_COLORS 항목을 JSON.stringify 한 문자열
}

export interface PastelColor {
  bg: string;
  border: string;
  label: string;
}
