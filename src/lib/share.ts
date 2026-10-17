import { PASTEL_COLORS } from "./constants.ts";
import type { PastelColor, TimetableEvent } from "./types.ts";

// 공유 링크 포맷: ID|D|START|END|TITLE|COLOR_IDX 를 * 로 이은 문자열.
// 구버전 링크와 호환이 필요한 자리라 escape/unescape 사용을 그대로 유지한다.
export function encodeShareData(events: TimetableEvent[]): string {
  const customFormat = events
    .map(ev => {
      const colorObj: PastelColor = JSON.parse(ev.color);
      const cIdx = PASTEL_COLORS.findIndex(c => c.bg === colorObj.bg);
      const s = ev.startTime.replace(":", "");
      const e = ev.endTime.replace(":", "");
      return `${ev.id}|${ev.day}|${s}|${e}|${ev.title}|${cIdx >= 0 ? cIdx : 0}`;
    })
    .join("*");

  return btoa(unescape(encodeURIComponent(customFormat)));
}

export function decodeLegacyShare(encoded: string): TimetableEvent[] | null {
  try {
    const decoded = decodeURIComponent(escape(atob(encoded)));
    const imported = decoded
      .split("*")
      .filter(Boolean)
      .map(s => {
        const [id, day, start, end, title, colorIdx] = s.split("|");
        const fmtTime = (t: string) => `${t.substring(0, 2)}:${t.substring(2, 4)}`;
        const cIdx = parseInt(colorIdx) || 0;
        return {
          id,
          day: parseInt(day),
          startTime: fmtTime(start),
          endTime: fmtTime(end),
          title,
          color: JSON.stringify(PASTEL_COLORS[cIdx] || PASTEL_COLORS[0]),
        };
      });
    return imported.length > 0 ? imported : null;
  } catch {
    return null;
  }
}
