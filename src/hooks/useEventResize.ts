import { format12h, gridHeight, heightPercent, minutesToTimeStr, timeToMinutes, topPercent } from "../lib/time.ts";
import { gsap, Draggable } from "../lib/gsap.ts";
import {
  DAY_END_MINUTES,
  DAY_START_MINUTES,
  MIN_EVENT_MINUTES,
  TEN_MIN_SLOTS,
  TOTAL_MINUTES,
} from "../lib/constants.ts";
import type { TimetableEvent } from "../lib/types.ts";

const LONG_PRESS_MS = 400;
const SNAP_MINUTES = TEN_MIN_SLOTS[1]; // 10분 단위 스냅

interface Options {
  gridRef: React.RefObject<HTMLDivElement>;
  resizeGuideRef: React.RefObject<HTMLDivElement>;
  eventsRef: React.MutableRefObject<TimetableEvent[]>;
  setEvents: React.Dispatch<React.SetStateAction<TimetableEvent[]>>;
}

// 일정 박스의 위/아래 가장자리를 끌어 시작·종료 시각을 10분 단위로 조절한다.
export function useEventResize({ gridRef, resizeGuideRef, eventsRef, setEvents }: Options) {
  const handleResizeStart = (
    e: React.MouseEvent | React.TouchEvent,
    eventId: string,
    type: "top" | "bottom"
  ) => {
    e.stopPropagation();

    const targetItem = (e.currentTarget as HTMLElement).parentElement;
    if (!targetItem || !gridRef.current) return;

    let isLongPressed = false;
    let didDrag = false;

    // 핸들을 터치한 정확한 초기 위치 캡처 (손가락을 댄 위치에 따른 오차 방지)
    const startClientY = "touches" in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY;

    const pixelsPerMinute = gridHeight(gridRef.current) / TOTAL_MINUTES;

    const currentEvent = eventsRef.current.find(ev => ev.id === eventId);
    if (!currentEvent) {
      return;
    }

    const originalStartMins = timeToMinutes(currentEvent.startTime);
    const originalEndMins = timeToMinutes(currentEvent.endTime);

    let tempStartMins = originalStartMins;
    let tempEndMins = originalEndMins;

    const timer = setTimeout(() => {
      isLongPressed = true;
      gsap.to(targetItem, { boxShadow: "0 0 16px rgba(0,0,0,0.4)", zIndex: 100, duration: 0.2 });

      if (resizeGuideRef.current) {
        const edgeMins = type === "top" ? tempStartMins : tempEndMins;
        gsap.set(resizeGuideRef.current, { display: "block", top: `${topPercent(edgeMins)}%` });
        const timeSpan = resizeGuideRef.current.querySelector("span");
        if (timeSpan) timeSpan.innerText = format12h(minutesToTimeStr(edgeMins));
      }
    }, LONG_PRESS_MS);

    const dInstance = Draggable.get(targetItem);

    const onMove = (moveEvent: MouseEvent | TouchEvent) => {
      if (!isLongPressed) {
        clearTimeout(timer);
        onEnd(); // 드래그 취소 (터치 스크롤 허용)
        return;
      }

      // 롱프레스 후 드래그 시 브라우저 스크롤 방지
      if (moveEvent.cancelable) {
        moveEvent.preventDefault();
      }

      if (!didDrag) {
        didDrag = true;
        if (dInstance) dInstance.disable();
        gsap.killTweensOf(targetItem);
        gsap.set(targetItem, { opacity: 0.8, boxShadow: "0 0 16px rgba(0,0,0,0.4)", zIndex: 100 });
      }

      if (!gridRef.current) return;
      const clientY = "touches" in moveEvent ? moveEvent.touches[0].clientY : (moveEvent as MouseEvent).clientY;
      const deltaY = clientY - startClientY;
      const deltaMins = Math.round(deltaY / pixelsPerMinute / SNAP_MINUTES) * SNAP_MINUTES;

      if (type === "top") {
        tempStartMins = Math.max(
          DAY_START_MINUTES,
          Math.min(originalStartMins + deltaMins, originalEndMins - MIN_EVENT_MINUTES)
        );
        tempEndMins = originalEndMins;
      } else {
        tempEndMins = Math.min(
          DAY_END_MINUTES,
          Math.max(originalEndMins + deltaMins, originalStartMins + MIN_EVENT_MINUTES)
        );
        tempStartMins = originalStartMins;
      }

      gsap.set(targetItem, {
        top: `${topPercent(tempStartMins)}%`,
        height: `${heightPercent(tempEndMins - tempStartMins)}%`,
      });

      if (resizeGuideRef.current) {
        const edgeMins = type === "top" ? tempStartMins : tempEndMins;
        gsap.set(resizeGuideRef.current, { top: `${topPercent(edgeMins)}%` });
        const timeSpan = resizeGuideRef.current.querySelector("span");
        if (timeSpan) timeSpan.innerText = format12h(minutesToTimeStr(edgeMins));
      }

      const timeSmall = targetItem.querySelector("small");
      if (timeSmall) {
        timeSmall.innerText = `${format12h(minutesToTimeStr(tempStartMins))}-${format12h(minutesToTimeStr(tempEndMins))}`;
      }
    };

    const onEnd = () => {
      clearTimeout(timer);
      if (resizeGuideRef.current) {
        gsap.set(resizeGuideRef.current, { display: "none" });
      }
      window.removeEventListener("mousemove", onMove as any);
      window.removeEventListener("mouseup", onEnd);
      window.removeEventListener("touchmove", onMove as any);
      window.removeEventListener("touchend", onEnd);

      if (isLongPressed && !didDrag) {
        gsap.to(targetItem, { boxShadow: "0 2px 4px rgba(0,0,0,0.1)", zIndex: 2, duration: 0.2, clearProps: "boxShadow" });
      }

      if (didDrag) {
        gsap.set(targetItem, { clearProps: "transform,boxShadow,zIndex,opacity", zIndex: 2 });
        if (dInstance) dInstance.enable();

        setEvents(prev =>
          prev.map(ev =>
            ev.id === eventId
              ? {
                  ...ev,
                  startTime: minutesToTimeStr(tempStartMins),
                  endTime: minutesToTimeStr(tempEndMins),
                }
              : ev
          )
        );
      }
    };

    window.addEventListener("mousemove", onMove as any);
    window.addEventListener("mouseup", onEnd);
    window.addEventListener("touchmove", onMove as any, { passive: false });
    window.addEventListener("touchend", onEnd);
  };

  return { handleResizeStart };
}
