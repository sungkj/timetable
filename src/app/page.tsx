"use client";

import { useState, useEffect, useRef, useLayoutEffect } from "react";
import { flushSync } from "react-dom";
import { gsap } from "gsap";
import { Draggable } from "gsap/Draggable";

if (typeof window !== "undefined") {
  gsap.registerPlugin(Draggable);
}

const useIsomorphicLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

const DAYS = ["월", "화", "수", "목", "금", "토", "일"];
const START_HOUR = 8;
const END_HOUR = 21;
const HOURS = Array.from({ length: END_HOUR - START_HOUR + 1 }, (_, i) => i + START_HOUR);
const TEN_MIN_SLOTS = [0, 10, 20, 30, 40, 50];

interface TimetableEvent {
  id: string;
  day: number;
  startTime: string;
  endTime: string;
  title: string;
  color: string; // 색상 속성 추가
}

const PASTEL_COLORS = [
  { bg: "#e3f2fd", border: "#2196f3", label: "파랑" },
  { bg: "#fce4ec", border: "#f06292", label: "분홍" },
  { bg: "#e8f5e9", border: "#66bb6a", label: "초록" },
  { bg: "#fff3e0", border: "#ffb74d", label: "주황" },
  { bg: "#f3e5f5", border: "#ba68c8", label: "보라" },
  { bg: "#efebe9", border: "#8d6e63", label: "갈색" },
];

export default function TimetablePage() {
  const [now, setNow] = useState<Date | null>(null);
  const [events, setEvents] = useState<TimetableEvent[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false); // 메뉴 상태 추가
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [menuData, setMenuData] = useState<{ id: string, x: number, y: number } | null>(null);
  const [isLocked, setIsLocked] = useState(true); // 기본값: 안전하게 잠금 상태로 시작
  const isLockedRef = useRef(true); // GSAP 콜백에서 최신 상태를 참조하기 위한 Ref
  const [timetableTitle, setTimetableTitle] = useState("시간표"); // 시간표 제목 상태
  
  const gridRef = useRef<HTMLDivElement>(null);
  const eventsRef = useRef<TimetableEvent[]>([]);
  const resizeGuideRef = useRef<HTMLDivElement>(null);
  
  const [newTitle, setNewTitle] = useState("");
  const [newDay, setNewDay] = useState(0);
  const [newStartTime, setNewStartTime] = useState("09:00");
  const [newEndTime, setNewEndTime] = useState("10:00");
  const [newColor, setNewColor] = useState(PASTEL_COLORS[0]); // 기본 색상

  useEffect(() => {
    eventsRef.current = events;
  }, [events]);

  useEffect(() => {
    setNow(new Date());
    
    const saved = localStorage.getItem("my-timetable-events");
    let initialEvents: TimetableEvent[] = [];
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) initialEvents = parsed;
      } catch (e) {}
    }

    // URL에서 공유 데이터 확인 및 즉시 적용
    const params = new URLSearchParams(window.location.search);
    const sharedData = params.get("data");
    const sharedTitle = params.get("title");

    if (sharedData) {
      try {
        // 커스텀 포맷 디코딩: ID|D|START|END|TITLE|COLOR_IDX * ...
        const decoded = decodeURIComponent(escape(atob(sharedData)));
        const eventStrings = decoded.split("*");
        
        const importedEvents: TimetableEvent[] = eventStrings.filter(s => s).map(s => {
          const [id, day, start, end, title, colorIdx] = s.split("|");
          // 시간 복구 (0900 -> 09:00)
          const fmtTime = (t: string) => `${t.substring(0, 2)}:${t.substring(2, 4)}`;
          const cIdx = parseInt(colorIdx) || 0;
          return {
            id,
            day: parseInt(day),
            startTime: fmtTime(start),
            endTime: fmtTime(end),
            title,
            color: JSON.stringify(PASTEL_COLORS[cIdx] || PASTEL_COLORS[0])
          };
        });

        if (importedEvents.length > 0) {
          if (confirm("공유받은 시간표 데이터가 있습니다. 현재 데이터를 덮어씌울까요?")) {
            setEvents(importedEvents);
            localStorage.setItem("my-timetable-events", JSON.stringify(importedEvents));
            if (sharedTitle) {
              setTimetableTitle(sharedTitle);
              localStorage.setItem("my-timetable-title", sharedTitle);
            }
          }
          window.history.replaceState({}, document.title, window.location.pathname);
          setIsLoaded(true);
          return;
        }
      } catch (e) {
        console.error("데이터 임포트 실패", e);
      }
    }

    const savedTitle = localStorage.getItem("my-timetable-title");
    if (savedTitle) setTimetableTitle(savedTitle);

    setEvents(initialEvents);
    setIsLoaded(true);
    const timer = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  useIsomorphicLayoutEffect(() => {
    if (isLoaded) {
      localStorage.setItem("my-timetable-events", JSON.stringify(events));
      initDraggables();
    }
  }, [events, isLoaded]);

  // 공유 기능: 극단적으로 짧은 커스텀 포맷으로 변환
  const handleShare = async () => {
    // 포맷: ID|D|START|END|TITLE|COLOR_IDX
    const customFormat = events.map(ev => {
      const colorObj = JSON.parse(ev.color);
      // 색상 인덱스 찾기
      const cIdx = PASTEL_COLORS.findIndex(c => c.bg === colorObj.bg);
      // 시간에서 콜론 제거 (09:00 -> 0900)
      const s = ev.startTime.replace(":", "");
      const e = ev.endTime.replace(":", "");
      return `${ev.id}|${ev.day}|${s}|${e}|${ev.title}|${cIdx >= 0 ? cIdx : 0}`;
    }).join("*");

    const encodedData = btoa(unescape(encodeURIComponent(customFormat)));
    const shareUrl = `${window.location.origin}/?data=${encodedData}&title=${encodeURIComponent(timetableTitle)}`;
    
    // 1. 모바일 기기 자체 공유 기능 시도 (HTTPS에서만 작동)
    if (navigator.share) {
      try {
        await navigator.share({
          title: '시간표 공유',
          text: `${timetableTitle}`,
          url: shareUrl,
        });
        setIsMenuOpen(false);
        return;
      } catch (e) {
        console.log("공유 취소 또는 실패");
      }
    } else {
      const shareText = `시간표 공유 - ${timetableTitle}\n${shareUrl}`;

      // 2. 자동 복사 시도 (보안 정책 우회 방식)
      let success = false;
      try {
        if (navigator.clipboard && window.isSecureContext) {
          await navigator.clipboard.writeText(shareText);
          success = true;
        } else {
          // HTTP 환경을 위한 구식 복사 방식
          const textArea = document.createElement("textarea");
          textArea.value = shareText;
          textArea.style.position = "fixed";
          textArea.style.left = "-9999px";
          textArea.style.top = "0";
          document.body.appendChild(textArea);
          textArea.focus();
          textArea.select();
          success = document.execCommand('copy');
          document.body.removeChild(textArea);
        }
      } catch (err) {
        success = false;
      }

      if (success) {
        alert("공유 링크가 클립보드에 복사되었습니다.\n카톡 등에 붙여넣기 하세요!");
      } else {
        // 3. 최후의 수단: 수동 복사 팝업
        prompt("아래 텍스트를 길게 눌러 복사하여 공유하세요:", shareText);
      }
    }  
    setIsMenuOpen(false);
  };

  const handleEditTitle = () => {
    const newTitle = window.prompt("시간표 제목을 입력하세요.", timetableTitle);
    if (newTitle !== null && newTitle.trim() !== "") {
      setTimetableTitle(newTitle.trim());
      localStorage.setItem("my-timetable-title", newTitle.trim());
    }
    setIsMenuOpen(false);
  };

  const handleDeleteAll = () => {
    if (confirm("모든 일정을 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.")) {
      setEvents([]);
    }
    setIsMenuOpen(false);
  };

  // 잠금 상태 토글 함수
  const toggleLock = () => {
    const nextLocked = !isLocked;
    setIsLocked(nextLocked);
    isLockedRef.current = nextLocked;
    
    // 모든 일정 아이템을 순회하며 Draggable 인스턴스를 찾아 토글
    gsap.utils.toArray<HTMLElement>(".event-item").forEach(el => {
      const d = Draggable.get(el);
      if (d) nextLocked ? d.disable() : d.enable();
    });
    setIsMenuOpen(false);
  };

  const initDraggables = () => {
    if (typeof window === "undefined") return;
    
    // 기존 인스턴스 모두 제거
    gsap.utils.toArray<HTMLElement>(".event-item").forEach(el => {
      gsap.killTweensOf(el); // 충돌을 일으키는 진행 중인 모든 GSAP 애니메이션 강제 종료
      const d = Draggable.get(el);
      if (d) d.kill();
      gsap.set(el, { clearProps: "x,y,transform,scale,boxShadow,zIndex,opacity" });
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
            gsap.to(this.target, { scale: 1.02, boxShadow: "0 8px 16px rgba(0,0,0,0.3)", zIndex: 100, duration: 0.2 });
          }, 400);
        },
        onRelease: function() {
          clearTimeout(pressTimer);
          if (isLongPressed && !didDrag) {
            // 제자리에서 길게 누르기만 하고 드래그하지 않았을 때만 원상 복구 애니메이션 실행
            gsap.to(this.target, { scale: 1, boxShadow: "0 2px 4px rgba(0,0,0,0.1)", zIndex: 2, duration: 0.2, clearProps: "scale,boxShadow" });
          }
        },
        onClick: function() {
          if (isLockedRef.current) return; // 잠금 상태면 클릭 무시
          if (isLongPressed) return; // 길게 누른 상태에서 뗀 경우 메뉴 무시
          const id = (this.target as HTMLElement).getAttribute("data-id");
          if (id) {
            // GSAP Draggable 인스턴스의 pointerX, pointerY를 사용하여 터치 위치 확보
            setMenuData({ id, x: this.pointerX, y: this.pointerY });
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
          gsap.set(this.target, { opacity: 0.8, scale: 1.02, boxShadow: "0 8px 16px rgba(0,0,0,0.3)", zIndex: 100, cursor: "grabbing" });
        },
        onDragEnd: function() {
          if (!isLongPressed) return;
          if (!gridRef.current) return;
          const gridRect = gridRef.current.getBoundingClientRect();
          const itemRect = this.target.getBoundingClientRect();
          const itemCenterX = itemRect.left + itemRect.width / 2;
          const relativeCenterX = itemCenterX - gridRect.left - 40;
          const colWidth = (gridRect.width - 40) / 7;
          
          let newDay = Math.floor(relativeCenterX / colWidth);
          newDay = Math.max(0, Math.min(6, newDay));

          const relativeY = itemRect.top - gridRect.top;
          const totalMinutes = (END_HOUR - START_HOUR + 1) * 60;
          // 테두리 두께 등에 의한 오차를 줄이기 위해 clientHeight를 우선 사용합니다.
          const totalHeight = gridRef.current.clientHeight || gridRect.height;
          const minutesPerPixel = totalMinutes / totalHeight;
          let newStartMinutes = Math.round((relativeY * minutesPerPixel) / 10) * 10 + (START_HOUR * 60);
          
          const eventId = (this.target as HTMLElement).getAttribute("data-id");
          const currentEvent = eventsRef.current.find(ev => ev.id === eventId);
          
          if (currentEvent && eventId) {
            const originalStartMins = timeToMinutes(currentEvent.startTime);
            const duration = timeToMinutes(currentEvent.endTime) - originalStartMins;
            
            // 화면 최하단으로 드래그 시 박스 길이가 줄어들거나 튕기는 현상을 막기 위해 범위를 제한합니다.
            if (newStartMinutes < START_HOUR * 60) newStartMinutes = START_HOUR * 60;
            if (newStartMinutes + duration > (END_HOUR + 1) * 60) {
              newStartMinutes = (END_HOUR + 1) * 60 - duration;
            }

            const newST = minutesToTimeStr(newStartMinutes);
            const newET = minutesToTimeStr(newStartMinutes + duration);

            // [해결 핵심] GSAP의 튕김 현상을 근본적으로 차단하기 위해, 드래그가 끝난 즉시 계산된 진짜 목적지로 박스를 0ms 만에 꽂아버립니다.
            const topPct = ((newStartMinutes - START_HOUR * 60) / totalMinutes) * 100;
            const heightPct = (duration / totalMinutes) * 100;

            gsap.set(this.target, { 
              clearProps: "x,y,transform,scale,boxShadow,zIndex,opacity",
              top: `${topPct}%`,
              height: `${heightPct}%`
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

  const handleResizeStart = (e: React.MouseEvent | React.TouchEvent, eventId: string, type: 'top' | 'bottom') => {
    e.stopPropagation();
    
    const targetItem = (e.currentTarget as HTMLElement).parentElement;
    if (!targetItem || !gridRef.current) return;

    let isLongPressed = false;
    let didDrag = false;

    // 핸들을 터치한 정확한 초기 위치 캡처 (손가락을 댄 위치에 따른 오차 방지)
    const startClientY = 'touches' in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY;

    const gridRect = gridRef.current.getBoundingClientRect();
    const totalMinutes = (END_HOUR - START_HOUR + 1) * 60;
    const totalHeight = gridRef.current.clientHeight || gridRect.height;
    const pixelsPerMinute = totalHeight / totalMinutes;

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
      gsap.to(targetItem, { scale: 1.02, boxShadow: "0 8px 16px rgba(0,0,0,0.3)", zIndex: 100, duration: 0.2 });
      
      if (resizeGuideRef.current) {
        const edgeMins = type === 'top' ? tempStartMins : tempEndMins;
        const edgePct = ((edgeMins - START_HOUR * 60) / totalMinutes) * 100;
        gsap.set(resizeGuideRef.current, { display: "block", top: `${edgePct}%` });
        const timeSpan = resizeGuideRef.current.querySelector('span');
        if (timeSpan) timeSpan.innerText = format12h(minutesToTimeStr(edgeMins));
      }
    }, 400);

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
        gsap.set(targetItem, { opacity: 0.8, scale: 1.02, boxShadow: "0 8px 16px rgba(0,0,0,0.3)", zIndex: 100 });
      }

      if (!gridRef.current) return;
      const clientY = 'touches' in moveEvent ? moveEvent.touches[0].clientY : (moveEvent as MouseEvent).clientY;
      const deltaY = clientY - startClientY;
      const deltaMins = Math.round((deltaY / pixelsPerMinute) / 10) * 10;
      
      if (type === 'top') {
        tempStartMins = Math.max(START_HOUR * 60, Math.min(originalStartMins + deltaMins, originalEndMins - 10));
        tempEndMins = originalEndMins;
      } else {
        tempEndMins = Math.min((END_HOUR + 1) * 60, Math.max(originalEndMins + deltaMins, originalStartMins + 10));
        tempStartMins = originalStartMins;
      }

      const topPct = ((tempStartMins - START_HOUR * 60) / totalMinutes) * 100;
      const heightPct = ((tempEndMins - tempStartMins) / totalMinutes) * 100;
      
      gsap.set(targetItem, { top: `${topPct}%`, height: `${heightPct}%` });

      if (resizeGuideRef.current) {
        const edgeMins = type === 'top' ? tempStartMins : tempEndMins;
        const edgePct = ((edgeMins - START_HOUR * 60) / totalMinutes) * 100;
        gsap.set(resizeGuideRef.current, { top: `${edgePct}%` });
        const timeSpan = resizeGuideRef.current.querySelector('span');
        if (timeSpan) timeSpan.innerText = format12h(minutesToTimeStr(edgeMins));
      }

      const timeSmall = targetItem.querySelector('small');
      if (timeSmall) {
        timeSmall.innerText = `${format12h(minutesToTimeStr(tempStartMins))}-${format12h(minutesToTimeStr(tempEndMins))}`;
      }
    };

    const onEnd = () => {
      clearTimeout(timer);
      if (resizeGuideRef.current) {
        gsap.set(resizeGuideRef.current, { display: "none" });
      }
      window.removeEventListener('mousemove', onMove as any);
      window.removeEventListener('mouseup', onEnd);
      window.removeEventListener('touchmove', onMove as any);
      window.removeEventListener('touchend', onEnd);
      
      if (isLongPressed && !didDrag) {
        gsap.to(targetItem, { scale: 1, boxShadow: "0 2px 4px rgba(0,0,0,0.1)", zIndex: 2, duration: 0.2, clearProps: "scale,boxShadow" });
      }

      if (didDrag) {
        gsap.set(targetItem, { clearProps: "transform,scale,boxShadow,zIndex,opacity", zIndex: 2 });
        if (dInstance) dInstance.enable();
        
        setEvents(prev => prev.map(ev => 
          ev.id === eventId ? { 
            ...ev, 
            startTime: minutesToTimeStr(tempStartMins), 
            endTime: minutesToTimeStr(tempEndMins) 
          } : ev
        ));
      }
    };

    window.addEventListener('mousemove', onMove as any);
    window.addEventListener('mouseup', onEnd);
    window.addEventListener('touchmove', onMove as any, { passive: false });
    window.addEventListener('touchend', onEnd);
  };

  const format12h = (timeStr: string) => {
    const [h, m] = timeStr.split(":").map(Number);
    const hour12 = h % 12 === 0 ? 12 : h % 12;
    return `${String(hour12)}:${String(m).padStart(2, '0')}`;
  };

  const formatLabel = (timeStr: string) => {
    const [h, m] = timeStr.split(":").map(Number);
    const hour12 = h % 12 === 0 ? 12 : h % 12;
    if (m === 0) return `${hour12}시`;
    return `${hour12}시 ${m}분`;
  };

  const timeToMinutes = (timeStr: string) => {
    const [h, m] = timeStr.split(":").map(Number);
    return (h * 60) + m;
  };

  const minutesToTimeStr = (totalMinutes: number) => {
    const h = Math.floor(totalMinutes / 60);
    const m = totalMinutes % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  };

  const calculatePosition = (timeStr: string) => {
    const minutes = timeToMinutes(timeStr);
    const startMinutes = START_HOUR * 60;
    const totalMinutes = (END_HOUR - START_HOUR + 1) * 60;
    return Math.max(0, Math.min(100, ((minutes - startMinutes) / totalMinutes) * 100));
  };

  const isOverlap = (day: number, start: number, end: number, ignoreId?: string) => {
    return events.some(ev => {
      if (ev.id === ignoreId) return false;
      if (ev.day !== day) return false;
      const s = timeToMinutes(ev.startTime);
      const e = timeToMinutes(ev.endTime);
      return (start < e && end > s);
    });
  };

  // 3자리 유니크 ID 생성 함수 (001~999)
  const generateId3 = (currentEvents: TimetableEvent[]) => {
    const usedIds = new Set(currentEvents.map(e => e.id));
    for (let i = 1; i <= 999; i++) {
      const id = String(i).padStart(3, '0');
      if (!usedIds.has(id)) return id;
    }
    return Date.now().toString(); // 만약 999개가 꽉 찬 경우 타임스탬프 사용
  };

  const saveEvent = () => {
    if (!newTitle) return alert("제목을 입력하세요.");
    const start = timeToMinutes(newStartTime);
    const end = timeToMinutes(newEndTime);
    if (start >= end) return alert("종료 시간은 시작 시간보다 늦어야 합니다.");
    if (isOverlap(newDay, start, end, editingEventId || undefined)) return alert("해당 시간에 이미 일정이 있습니다.");

    if (editingEventId) {
      setEvents(prev => prev.map(ev => ev.id === editingEventId ? {
        ...ev,
        title: newTitle,
        day: newDay,
        startTime: newStartTime,
        endTime: newEndTime,
        color: JSON.stringify(newColor)
      } : ev));
    } else {
      setEvents(prev => [...prev, { 
        id: generateId3(prev), // 3자리 ID 적용
        day: newDay, 
        startTime: newStartTime, 
        endTime: newEndTime, 
        title: newTitle,
        color: JSON.stringify(newColor)
      }]);
    }
    
    closeModal();
  };

  const openAddModal = () => {
    setEditingEventId(null);
    setNewTitle("");
    setNewDay(0);
    setNewStartTime("09:00");
    setNewEndTime("10:00");
    setNewColor(PASTEL_COLORS[0]);
    setIsModalOpen(true);
    setIsMenuOpen(false);
  };

  const openEditModal = (id: string) => {
    const ev = events.find(e => e.id === id);
    if (!ev) return;
    setEditingEventId(id);
    setNewTitle(ev.title);
    setNewDay(ev.day);
    setNewStartTime(ev.startTime);
    setNewEndTime(ev.endTime);
    setNewColor(ev.color ? JSON.parse(ev.color) : PASTEL_COLORS[0]);
    setIsModalOpen(true);
    setMenuData(null);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingEventId(null);
  };

  const deleteEvent = (id: string) => {
    if (confirm("정말 이 일정을 삭제하시겠습니까?")) {
      setEvents(prev => prev.filter(e => e.id !== id));
      setMenuData(null);
    }
  };

  const copyEvent = (id: string) => {
    const ev = events.find(e => e.id === id);
    if (!ev) return;

    const duration = timeToMinutes(ev.endTime) - timeToMinutes(ev.startTime);
    let found = false;
    
    // 같은 날 뒤쪽 공간 찾기
    let checkDay = ev.day;
    let checkStart = timeToMinutes(ev.endTime);
    
    // 최대 7일간 빈 자리 탐색
    for (let i = 0; i < 7; i++) {
      const day = (checkDay + i) % 7;
      let startMins = (i === 0) ? checkStart : START_HOUR * 60;
      
      while (startMins + duration <= (END_HOUR + 1) * 60) {
        if (!isOverlap(day, startMins, startMins + duration)) {
          setEvents(prev => [...prev, {
            ...ev,
            id: generateId3(prev),
            day: day,
            startTime: minutesToTimeStr(startMins),
            endTime: minutesToTimeStr(startMins + duration)
          }]);
          found = true;
          break;
        }
        startMins += 30; // 30분 단위로 탐색
      }
      if (found) break;
    }

    if (!found) alert("복사할 수 있는 빈 공간이 없습니다.");
    setMenuData(null);
  };

  const currentDayIndex = now ? (now.getDay() === 0 ? 6 : now.getDay() - 1) : -1;
  const currentTop = now ? calculatePosition(`${now.getHours()}:${now.getMinutes()}`) : -1;

  // 현재 진행 중인 일정의 남은 시간 계산 (분 단위)
  const currentMinutes = now ? now.getHours() * 60 + now.getMinutes() : -1;
  let remainingMinutes = -1;
  if (currentDayIndex !== -1 && currentMinutes !== -1) {
    const ongoingEvent = events.find(
      (e) =>
        e.day === currentDayIndex &&
        timeToMinutes(e.startTime) <= currentMinutes &&
        timeToMinutes(e.endTime) > currentMinutes
    );
    if (ongoingEvent) {
      remainingMinutes = timeToMinutes(ongoingEvent.endTime) - currentMinutes;
    }
  }

  return (
    <main className="timetable-container">
      {/* 보기 모드 배지 (우측 상단 고정) */}
      {isLocked && (
        <div 
          onClick={toggleLock}
          style={{ position: "fixed", top: "10px", right: "12px", zIndex: 50, background: "rgba(0,0,0,0.6)", color: "#fff", padding: "6px 6px", borderRadius: "20px", fontSize: "7px", cursor: "pointer", boxShadow: "0 2px 5px rgba(0,0,0,0.2)" }}
        >
          🔒 보기 모드
        </div>
      )}

      <h1 className="timetable-main-title">{timetableTitle}</h1>

      {/* 플로팅 메뉴 버튼 */}
      <div className="fab-container">
        <div className={`fab-menu ${isMenuOpen ? 'open' : ''}`}>
          <div className="fab-item" onClick={toggleLock}>
            {isLocked ? "🔓 편집 모드로 전환" : "🔒 시간표 잠금"}
          </div>
          <div className="fab-item" onClick={openAddModal}>일정 추가</div>
          <div className="fab-item" onClick={handleEditTitle}>제목 편집</div>
          <div className="fab-item" onClick={handleShare}>공유</div>
          <div className="fab-item delete-all" onClick={handleDeleteAll}>일정 모두 삭제</div>
        </div>
        <button 
          className={`add-button ${isMenuOpen ? 'open' : ''}`} 
          onClick={() => setIsMenuOpen(!isMenuOpen)}
        >
          {isMenuOpen ? '+' : '☰'}
        </button>
      </div>
      
      {menuData && (
        <div className="event-menu-overlay" onClick={() => setMenuData(null)}>
          <div className="event-menu" style={{ 
            left: Math.min(menuData.x, typeof window !== 'undefined' ? window.innerWidth - 160 : menuData.x), 
            top: Math.min(menuData.y, typeof window !== 'undefined' ? window.innerHeight - 150 : menuData.y) 
          }}>
            <button className="event-menu-item" onClick={() => openEditModal(menuData.id)}>일정 수정</button>
            <button className="event-menu-item" onClick={() => copyEvent(menuData.id)}>일정 복사</button>
            <button className="event-menu-item delete" onClick={() => deleteEvent(menuData.id)}>일정 삭제</button>
          </div>
        </div>
      )}

      <div className="timetable-wrapper">
        <div className="timetable-header">
          <div className="time-label-header" style={{ display: "flex", alignItems: "center", justifyContent: "center" }}></div>
          {DAYS.map((day, i) => (
            <div 
              key={day} 
              style={{ 
                color: i === currentDayIndex ? "red" : "inherit", 
                display: "flex", 
                alignItems: "center", 
                justifyContent: "center", 
                gap: "3px" 
              }}
            >
              <span>{day}</span>
              {i === currentDayIndex && <span style={{ fontSize: "0.45rem" }}>●</span>}
            </div>
          ))}
        </div>
        <div className="timetable-grid" ref={gridRef}>
          <div className="time-labels-column">{HOURS.map(hour => <div key={hour} className="time-slot-label">{formatLabel(`${hour}:00`)}</div>)}</div>
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
                <div className="current-time-indicator" style={{ top: `${currentTop}%`, zIndex: 150 }}>
                  {remainingMinutes > 0 && remainingMinutes <= 60 && (
                    <span style={{
                      position: "absolute",
                      right: "100%", // 텍스트의 오른쪽 끝을 빨간 라인의 왼쪽 끝에 맞춤
                      marginRight: "2px", // 빨간 라인과 글자 사이의 간격
                      bottom: "-4px",
                      fontSize: "8px",
                      fontWeight: "bold",
                      color: "red",
                      backgroundColor: "rgba(255, 255, 255, 0.7)", // 흐려짐 방지를 위해 불투명도 증가
                      padding: "0px 0px",
                      borderRadius: "2px",
                      whiteSpace: "nowrap"
                    }}>
                      {remainingMinutes}
                    </span>
                  )}
                </div>
              )}
              {events.filter(e => e.day === dayIndex).map(event => {
                const topPct = calculatePosition(event.startTime);
                const bottomPct = calculatePosition(event.endTime);
                const colorObj = event.color ? JSON.parse(event.color) : PASTEL_COLORS[0];
                const bgWithAlpha = colorObj.bg.startsWith('#') && colorObj.bg.length === 7 ? `${colorObj.bg}B3` : colorObj.bg;
                
                return (
                  <div 
                    key={event.id} 
                    data-id={event.id} 
                    className="event-item" 
                    style={{ 
                      top: `${topPct}%`, 
                      height: `${bottomPct - topPct}%`,
                      backgroundColor: bgWithAlpha,
                      borderColor: colorObj.border
                    }}
                  >
                    {!isLocked && (
                      <div 
                        className="resize-handle resize-handle-top" 
                        onMouseDown={(e) => handleResizeStart(e, event.id, 'top')} 
                        onTouchStart={(e) => handleResizeStart(e, event.id, 'top')}
                      />
                    )}
                    <div className="event-info">
                      <strong>{event.title}</strong><br/>
                      <small>{format12h(event.startTime)}-{format12h(event.endTime)}</small>
                    </div>

                    {!isLocked && (
                      <div 
                        className="resize-handle resize-handle-bottom" 
                        onMouseDown={(e) => handleResizeStart(e, event.id, 'bottom')} 
                        onTouchStart={(e) => handleResizeStart(e, event.id, 'bottom')}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          ))}

          {/* 시간표 크기 조절 시 가려짐 방지를 위한 좌우 안내선 */}
          <div 
            ref={resizeGuideRef}
            style={{
              display: "none",
              position: "absolute",
              left: 0,
              right: 0,
              height: "0",
              borderTop: "2px dashed rgba(33, 150, 243, 0.5)",
              zIndex: 200,
              pointerEvents: "none"
            }}
          >
            <span style={{
              position: "absolute",
              left: "4px",
              bottom: "2px",
              fontSize: "11px",
              fontWeight: "bold",
              color: "var(--primary-color, #2196f3)",
              backgroundColor: "var(--background, #fff)",
              padding: "1px 4px",
              borderRadius: "4px",
              boxShadow: "0 1px 3px rgba(0,0,0,0.2)"
            }}></span>
          </div>
        </div>
      </div>

      {isModalOpen && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h2>{editingEventId ? "일정 수정" : "새 일정 추가"}</h2>
            <div className="form-group"><label>일정 이름</label><input type="text" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} /></div>
            <div className="form-group"><label>요일</label><select value={newDay} onChange={(e) => setNewDay(Number(e.target.value))}>{DAYS.map((day, i) => <option key={day} value={i}>{day}요일</option>)}</select></div>
            <div className="form-group"><label>시작 시간</label><input type="time" step="600" value={newStartTime} onChange={(e) => setNewStartTime(e.target.value)} /></div>
            <div className="form-group"><label>종료 시간</label><input type="time" step="600" value={newEndTime} onChange={(e) => setNewEndTime(e.target.value)} /></div>
            <div className="form-group">
              <label>색상 선택</label>
              <div className="color-presets">
                {PASTEL_COLORS.map((c, i) => (
                  <button 
                    key={i} 
                    className={`color-preset-btn ${JSON.stringify(newColor) === JSON.stringify(c) ? 'active' : ''}`}
                    style={{ backgroundColor: c.bg, borderColor: c.border }}
                    onClick={() => setNewColor(c)}
                  />
                ))}
              </div>
            </div>
            <div className="modal-buttons"><button className="btn-cancel" onClick={closeModal}>취소</button><button className="btn-save" onClick={saveEvent}>저장</button></div>
          </div>
        </div>
      )}
    </main>
  );
}
