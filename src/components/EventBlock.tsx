import { PASTEL_COLORS } from "../lib/constants";
import { calculatePosition, format12h } from "../lib/time";
import type { PastelColor, TimetableEvent } from "../lib/types";

interface Props {
  event: TimetableEvent;
  isLocked: boolean;
  onResizeStart: (e: React.MouseEvent | React.TouchEvent, eventId: string, type: "top" | "bottom") => void;
}

export default function EventBlock({ event, isLocked, onResizeStart }: Props) {
  const topPct = calculatePosition(event.startTime);
  const bottomPct = calculatePosition(event.endTime);
  const colorObj: PastelColor = event.color ? JSON.parse(event.color) : PASTEL_COLORS[0];
  // 배경만 살짝 투명하게 (#rrggbb + 알파)
  const bgWithAlpha =
    colorObj.bg.startsWith("#") && colorObj.bg.length === 7 ? `${colorObj.bg}B3` : colorObj.bg;

  return (
    <div
      data-id={event.id}
      className="event-item"
      style={{
        top: `${topPct}%`,
        height: `${bottomPct - topPct}%`,
        backgroundColor: bgWithAlpha,
        borderColor: colorObj.border,
      }}
    >
      {!isLocked && (
        <div
          className="resize-handle resize-handle-top"
          onMouseDown={(e) => onResizeStart(e, event.id, "top")}
          onTouchStart={(e) => onResizeStart(e, event.id, "top")}
        />
      )}
      <div className="event-info">
        <strong>{event.title}</strong><br />
        <small>{format12h(event.startTime)}-{format12h(event.endTime)}</small>
      </div>
      {!isLocked && (
        <div
          className="resize-handle resize-handle-bottom"
          onMouseDown={(e) => onResizeStart(e, event.id, "bottom")}
          onTouchStart={(e) => onResizeStart(e, event.id, "bottom")}
        />
      )}
    </div>
  );
}
