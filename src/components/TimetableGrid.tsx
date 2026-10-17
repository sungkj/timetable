import { useEffect, useLayoutEffect } from "react";
import { Draggable, gsap } from "../lib/gsap";
import { DAYS, DAY_END_MINUTES, DAY_START_MINUTES, HOURS, TEN_MIN_SLOTS, TOTAL_MINUTES } from "../lib/constants";
import { formatLabel, gridHeight, heightPercent, minutesToTimeStr, timeToMinutes, topPercent } from "../lib/time";
import type { TimetableEvent } from "../lib/types";
import EventBlock from "./EventBlock";

const LONG_PRESS_MS = 400;
const TIME_LABEL_WIDTH = 40;

interface Props {
  events: TimetableEvent[];
  isLocked: boolean;
  isLockedRef: React.MutableRefObject<boolean>;
  eventsRef: React.MutableRefObject<TimetableEvent[]>;
  gridRef: React.RefObject<HTMLDivElement>;
  resizeGuideRef: React.RefObject<HTMLDivElement>;
  setEvents: React.Dispatch<React.SetStateAction<TimetableEvent[]>>;
  currentDayIndex: number;
  currentTop: number;
  remainingMinutes: number;
  onSelectEvent: (id: string, x: number, y: number) => void;
  onResizeStart: (e: React.MouseEvent | React.TouchEvent, eventId: string, type: "top" | "bottom") => void;
}

export default function TimetableGrid({
  events,
  isLocked,
  isLockedRef,
  eventsRef,
  gridRef,
  resizeGuideRef,
  setEvents,
  currentDayIndex,
  currentTop,
  remainingMinutes,
  onSelectEvent,
  onResizeStart,
}: Props) {
  // events가 바뀔 때마다 모든 일정의 Draggable을 새로 만든다.
  const initDraggables = () => {
    if (typeof window === "undefined") return;

    // 기존 인스턴스 모두 제거
    gsap.utils.toArray<HTMLElement>(".event-item").forEach(el => {
      gsap.killTweensOf(el); // 충돌을 일으키는 진행 중인 모든 GSAP 애니메이션 강제 종료
      const d = Draggable.get(el);
      if (d) d.kill();
      gsap.set(el, { clearProps: "x,y,transform,boxShadow,zIndex,opacity" });
    });

    // 각 일정 아이템별로 개별 Draggable 생성
    gsap.utils.toArray<HTMLElement>(".event-item").forEach(el => {
      let pressTimer: ReturnType<typeof setTimeout>;
      let isLongPressed = false;
      let didDrag = false; // 드래그가 실제로 일어났는지 추적

      const d = Draggable.create(el, {
        type: "x,y",
        allowNativeTouchScrolling: true, // 터치 스크롤 허용
        trigger: el.querySelector(".event-info"), // 현재 요소 내부의 정보 영역만 트리거로 지정
        onPress: function() {
          if (isLockedRef.current) return;
          isLongPressed = false;
          didDrag = false;
          // 300ms 딜레이 후 드래그 활성화 및 시각적 피드백
          pressTimer = setTimeout(() => {
            isLongPressed = true;
            gsap.to(this.target, { boxShadow: "0 0 16px rgba(0,0,0,0.4)", zIndex: 100, duration: 0.2 });
          }, LONG_PRESS_MS);
        },
        onRelease: function() {
          clearTimeout(pressTimer);
          if (isLongPressed && !didDrag) {
            // 제자리에서 길게 누르기만 하고 드래그하지 않았을 때만 원상 복구 애니메이션 실행
            gsap.to(this.target, { boxShadow: "0 2px 4px rgba(0,0,0,0.1)", zIndex: 2, duration: 0.2, clearProps: "boxShadow" });
          }
        },
        onClick: function() {
          if (isLockedRef.current) return; // 잠금 상태면 클릭 무시
          if (isLongPressed) return; // 길게 누른 상태에서 뗀 경우 메뉴 무시
          const id = (this.target as HTMLElement).getAttribute("data-id");
          if (id) {
            // GSAP Draggable 인스턴스의 pointerX, pointerY를 사용하여 터치 위치 확보
            onSelectEvent(id, this.pointerX, this.pointerY);
          }
        },
        onDragStart: function() {
          if (!isLongPressed) {
            clearTimeout(pressTimer);
            this.endDrag(); // 길게 누르기 전에 움직이면 드래그 취소 (터치 스크롤 허용)
            return;
          }
          didDrag = true;
          gsap.killTweensOf(this.target); // 드래그 중 다른 애니메이션 간섭 차단
          gsap.set(this.target, { opacity: 0.8, boxShadow: "0 0 16px rgba(0,0,0,0.4)", zIndex: 100, cursor: "grabbing" });
        },
        onDragEnd: function() {
          if (!isLongPressed) return;
          if (!gridRef.current) return;
          const gridRect = gridRef.current.getBoundingClientRect();
          const itemRect = this.target.getBoundingClientRect();
          const itemCenterX = itemRect.left + itemRect.width / 2;
          const relativeCenterX = itemCenterX - gridRect.left - TIME_LABEL_WIDTH;
          const colWidth = (gridRect.width - TIME_LABEL_WIDTH) / DAYS.length;

          let newDay = Math.floor(relativeCenterX / colWidth);
          newDay = Math.max(0, Math.min(DAYS.length - 1, newDay));

          const relativeY = itemRect.top - gridRect.top;
          // 테두리 두께 등에 의한 오차를 줄이기 위해 clientHeight를 우선 사용합니다.
          const minutesPerPixel = TOTAL_MINUTES / gridHeight(gridRef.current);
          let newStartMinutes = Math.round((relativeY * minutesPerPixel) / 10) * 10 + DAY_START_MINUTES;

          const eventId = (this.target as HTMLElement).getAttribute("data-id");
          const currentEvent = eventsRef.current.find(ev => ev.id === eventId);

          if (currentEvent && eventId) {
            const originalStartMins = timeToMinutes(currentEvent.startTime);
            const duration = timeToMinutes(currentEvent.endTime) - originalStartMins;

            // 화면 최하단으로 드래그 시 박스 길이가 줄어들거나 튕기는 현상을 막기 위해 범위를 제한합니다.
            if (newStartMinutes < DAY_START_MINUTES) newStartMinutes = DAY_START_MINUTES;
            if (newStartMinutes + duration > DAY_END_MINUTES) {
              newStartMinutes = DAY_END_MINUTES - duration;
            }

            const newST = minutesToTimeStr(newStartMinutes);
            const newET = minutesToTimeStr(newStartMinutes + duration);

            // [해결 핵심] GSAP의 튕김 현상을 근본적으로 차단하기 위해, 드래그가 끝난 즉시 계산된 진짜 목적지로 박스를 0ms 만에 꽂아버립니다.
            gsap.set(this.target, {
              clearProps: "x,y,transform,boxShadow,zIndex,opacity",
              top: `${topPercent(newStartMinutes)}%`,
              height: `${heightPercent(duration)}%`,
            });

            // 이후 백그라운드에서 React 상태 업데이트가 안전하게 수행됩니다.
            setEvents(prev => prev.map(ev => {
              if (ev.id === eventId) {
                return { ...ev, day: newDay, startTime: newST, endTime: newET };
              }
              return ev;
            }));
          }
        }
      })[0];

      if (isLockedRef.current) d.disable(); // 생성 시 잠금 상태면 비활성화
    });
  };

  // 마운트 시점에는 레이아웃이 아직 없을 수 있어 useLayoutEffect로 붙인다.
  const useIsomorphicLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;
  useIsomorphicLayoutEffect(() => {
    initDraggables();
  }, [events]);

  return (
    <div className="timetable-wrapper">
      <div className="timetable-header">
        <div className="time-label-header" />
        {DAYS.map((day, i) => (
          <div key={day} className={`day-header ${i === currentDayIndex ? "today" : ""}`}>
            <span>{day}</span>
            {i === currentDayIndex && <span className="today-dot">●</span>}
          </div>
        ))}
      </div>
      <div className="timetable-grid" ref={gridRef}>
        <div className="time-labels-column">
          {HOURS.map(hour => <div key={hour} className="time-slot-label">{formatLabel(`${hour}:00`)}</div>)}
        </div>
        {DAYS.map((_, dayIndex) => (
          <div key={dayIndex} className="day-column">
            {HOURS.map(hour => (
              <div key={hour} className="hour-grid-slot">
                {TEN_MIN_SLOTS.map(min => (
                  <div key={min} className="ten-min-grid-slot"></div>
                ))}
              </div>
            ))}
            {dayIndex === currentDayIndex && currentTop >= 0 && currentTop <= 100 && (
              <div className="current-time-indicator" style={{ top: `${currentTop}%` }}>
                {remainingMinutes > 0 && remainingMinutes <= 60 && (
                  <span className="remaining-minutes">{remainingMinutes}</span>
                )}
              </div>
            )}
            {events.filter(e => e.day === dayIndex).map(event => (
              <EventBlock
                key={event.id}
                event={event}
                isLocked={isLocked}
                onResizeStart={onResizeStart}
              />
            ))}
          </div>
        ))}

        {/* 시간표 크기 조절 시 가려짐 방지를 위한 좌우 안내선 */}
        <div className="resize-guide" ref={resizeGuideRef}>
          <span></span>
        </div>
      </div>
    </div>
  );
}
