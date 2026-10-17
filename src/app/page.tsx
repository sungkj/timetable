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

const LOCAL_EVENTS_KEY = "my-timetable-events";
const LOCAL_TITLE_KEY = "my-timetable-title";
const DEFAULT_TIMETABLE_NAME = "내 시간표";

// 이미 쓰이는 이름이면 "이름 (2)" 형태로 비어 있는 이름을 찾는다.
function freeName(base: string, taken: string[]): string {
  if (!taken.includes(base)) return base;
  for (let i = 2; i < 1000; i++) {
    const candidate = `${base} (${i})`;
    if (!taken.includes(candidate)) return candidate;
  }
  return `${base} ${Date.now()}`;
}

// 구버전 공유 링크(?data=) 디코딩. 형식: ID|D|START|END|TITLE|COLOR_IDX 를 * 로 이은 문자열
function decodeLegacyShare(encoded: string): TimetableEvent[] | null {
  try {
    const decoded = decodeURIComponent(escape(atob(encoded)));
    const imported = decoded.split("*").filter(Boolean).map(s => {
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

function readLocalEvents(): TimetableEvent[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(LOCAL_EVENTS_KEY) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function readLocalTitle(): string {
  try {
    return localStorage.getItem(LOCAL_TITLE_KEY) || "";
  } catch {
    return "";
  }
}

function writeLocalTitle(name: string) {
  try {
    localStorage.setItem(LOCAL_TITLE_KEY, name);
  } catch {}
}

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

  const [isListOpen, setIsListOpen] = useState(false); // 시간표 목록 모달
  const [timetableNames, setTimetableNames] = useState<string[]>([]);
  const [saveStatus, setSaveStatus] = useState<"saved" | "saving" | "error">("saved");

  const gridRef = useRef<HTMLDivElement>(null);
  const eventsRef = useRef<TimetableEvent[]>([]);
  const resizeGuideRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef("시간표"); // 저장 요청이 최신 제목을 참조하도록
  const isLoadedRef = useRef(false); // 로딩 전 빈 상태가 서버로 저장되는 것을 막는다
  const skipNextSaveRef = useRef(false); // 시간표 전환 직후의 불필요한 재저장 방지
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  
  const [newTitle, setNewTitle] = useState("");
  const [newDay, setNewDay] = useState(0);
  const [newStartTime, setNewStartTime] = useState("09:00");
  const [newEndTime, setNewEndTime] = useState("10:00");
  const [newColor, setNewColor] = useState(PASTEL_COLORS[0]); // 기본 색상

  useEffect(() => {
    eventsRef.current = events;
  }, [events]);

  useEffect(() => {
    titleRef.current = timetableTitle;
  }, [timetableTitle]);

  // 서버에 저장된 시간표 목록을 가져온다. 최근 수정순이며 그대로 돌려준다.
  const refreshNameList = async (): Promise<string[]> => {
    try {
      const res = await fetch("/api/timetables");
      if (!res.ok) return [];
      const data = await res.json();
      if (Array.isArray(data.names)) {
        setTimetableNames(data.names);
        return data.names;
      }
    } catch {
      // 오프라인이면 마지막으로 받아둔 목록을 그대로 둔다
    }
    return [];
  };

  // 현재 제목의 시간표를 서버에서 불러온다. 없으면 null.
  const fetchTimetable = async (name: string): Promise<TimetableEvent[] | null> => {
    const res = await fetch(`/api/timetables?name=${encodeURIComponent(name)}`);
    if (res.status === 404) return null;
    if (!res.ok) throw new Error("load failed");
    const data = await res.json();
    return Array.isArray(data.events) ? data.events : [];
  };

  // 서버에 시간표를 저장한다(있으면 덮어씀).
  const putTimetable = async (name: string, list: TimetableEvent[]) => {
    const res = await fetch(`/api/timetables?name=${encodeURIComponent(name)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ events: list }),
    });
    if (!res.ok) throw new Error("save failed");
  };

  // 앱 시작: 시간표 목록을 받아오고, 마지막에 보던 시간표를 서버에서 불러온다.
  useEffect(() => {
    setNow(new Date());
    const timer = setInterval(() => setNow(new Date()), 60000);

    (async () => {
      // 구버전 공유 링크로 들어온 경우: 로컬 데이터를 대체할 일정을 먼저 확보한다.
      let importedEvents: TimetableEvent[] | null = null;
      let importedName: string | null = null;
      const params = new URLSearchParams(window.location.search);
      const sharedData = params.get("data");
      if (sharedData) {
        importedEvents = decodeLegacyShare(sharedData);
        importedName = params.get("title");
        window.history.replaceState({}, document.title, window.location.pathname);
      }

      // refreshNameList가 돌려준 목록을 쓴다. state는 이 시점에 아직 갱신되지 않는다.
      const names = await refreshNameList();

      const localEvents = readLocalEvents();
      const localTitle = readLocalTitle();
      const isEmptyLocal = localEvents.length === 0;
      // 로컬에 이 시간표가 아직 없어도, 마지막으로 쓰던 시간표가 서버에 있으면 그걸 연다.
      const savedName = importedName || localTitle || DEFAULT_TIMETABLE_NAME;
      const hasLocalForTitle = !isEmptyLocal && localTitle === savedName;

      // 열어야 할 시간표를 고른다: 공유받은 데이터 → 로컬 데이터 → 서버의 최근 시간표 → 새 기본 시간표
      let openedEvents: TimetableEvent[] = [];
      let openedName = savedName;

      try {
        if (importedEvents) {
          openedName = freeName(savedName, names);
          const res = await fetch("/api/timetables", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: openedName, events: importedEvents }),
          });
          openedEvents = importedEvents;
          if (res.ok) await refreshNameList();
        } else if (hasLocalForTitle) {
          await putTimetable(savedName, localEvents);
          openedEvents = localEvents;
          await refreshNameList();
        } else if (!localTitle && names.length > 0) {
          // 기억해 둔 이름이 없으면 서버의 가장 최근 시간표를 바로 연다.
          openedName = names[0];
          openedEvents = (await fetchTimetable(openedName)) ?? [];
        } else {
          const remote = await fetchTimetable(openedName);
          if (remote !== null) {
            openedEvents = remote;
          } else if (!isEmptyLocal) {
            // 서버에 아직 없는 시간표라면 로컬 내용을 올려서 만든다.
            await putTimetable(openedName, localEvents);
            openedEvents = localEvents;
            await refreshNameList();
          }
        }
      } catch {
        // 서버에 못 닿으면 마지막으로 쓰던 로컬 데이터로 계속 동작한다
        openedEvents = importedEvents || localEvents;
        openedName = importedName || localTitle || DEFAULT_TIMETABLE_NAME;
      }

      // 불러온 내용을 곧바로 되쓰지 않도록 자동 저장을 한 번 건너뛴다.
      skipNextSaveRef.current = true;
      setEvents(openedEvents);
      setTimetableTitle(openedName);

      isLoadedRef.current = true;
      setIsLoaded(true);
    })();

    return () => clearInterval(timer);
  }, []);

  useIsomorphicLayoutEffect(() => {
    if (!isLoaded) return;
    try {
      localStorage.setItem(LOCAL_EVENTS_KEY, JSON.stringify(events));
    } catch {}
    initDraggables();
  }, [events, isLoaded]);

  // 일정이 바뀌면 자동 저장. 입력이 멈추고 600ms 뒤 한 번만 서버로 보낸다.
  useEffect(() => {
    if (!isLoadedRef.current) return;
    if (skipNextSaveRef.current) {
      skipNextSaveRef.current = false;
      return;
    }

    setSaveStatus("saving");
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      try {
        await putTimetable(titleRef.current, eventsRef.current);
        setSaveStatus("saved");
      } catch {
        setSaveStatus("error");
      }
    }, 600);

    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [events]);

  // 제목이 바뀌면 로컬에도 기억해 두어 다음 실행 때 이 시간표로 시작한다.
  useEffect(() => {
    if (!isLoaded) return;
    writeLocalTitle(timetableTitle);
  }, [timetableTitle, isLoaded]);

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

  const handleEditTitle = async () => {
    const input = window.prompt("시간표 제목을 입력하세요.", timetableTitle);
    setIsMenuOpen(false);
    if (input === null) return;

    const next = input.trim();
    if (!next || next === timetableTitle) return;
    if (/[\u0000-\u001f\u007f]/.test(next)) return alert("사용할 수 없는 문자가 포함되어 있습니다.");

    if (timetableNames.includes(next)) {
      return alert("같은 이름의 시간표가 이미 있습니다. 다른 이름을 사용하세요.");
    }

    try {
      const res = await fetch("/api/timetables", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ from: timetableTitle, to: next }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        return alert(data.error || "제목을 변경하지 못했습니다.");
      }
    } catch {
      return alert("서버에 연결할 수 없습니다. 잠시 후 다시 시도하세요.");
    }

    // 제목만 바뀌었고 일정 내용은 그대로이므로 재저장은 건너뛴다.
    skipNextSaveRef.current = true;
    setTimetableTitle(next);
    await refreshNameList();
  };

  const switchTimetable = async (name: string) => {
    setIsListOpen(false);
    if (name === timetableTitle) return;

    try {
      const list = await fetchTimetable(name);
      if (list === null) {
        alert("이미 삭제된 시간표입니다.");
        return refreshNameList();
      }
      skipNextSaveRef.current = true; // 불러온 내용을 곧바로 되쓰지 않는다
      setEvents(list);
      setTimetableTitle(name);
      setMenuData(null);
    } catch {
      alert("시간표를 불러오지 못했습니다. 서버 연결을 확인하세요.");
    }
  };

  const createTimetable = async () => {
    const input = window.prompt("새 시간표 이름을 입력하세요.");
    if (input === null) return;

    const name = input.trim();
    if (!name) return;
    if (/[\u0000-\u001f\u007f]/.test(name)) return alert("사용할 수 없는 문자가 포함되어 있습니다.");
    if (timetableNames.includes(name)) {
      return alert("같은 이름의 시간표가 이미 있습니다. 다른 이름을 사용하세요.");
    }

    try {
      const res = await fetch("/api/timetables", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, events: [] }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        return alert(data.error || "시간표를 만들지 못했습니다.");
      }
    } catch {
      return alert("서버에 연결할 수 없습니다. 잠시 후 다시 시도하세요.");
    }

    skipNextSaveRef.current = true;
    setIsListOpen(false);
    setEvents([]);
    setTimetableTitle(name);
    await refreshNameList();
  };

  const handleDeleteAll = async () => {
    if (!confirm(`"${timetableTitle}"의 모든 일정을 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.`)) {
      setIsMenuOpen(false);
      return;
    }
    setIsMenuOpen(false);

    try {
      await putTimetable(timetableTitle, []);
      skipNextSaveRef.current = true;
      setSaveStatus("saved");
    } catch {
      setSaveStatus("error");
    }
    setEvents([]);
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
          }, 400);
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
          gsap.set(this.target, { opacity: 0.8, boxShadow: "0 0 16px rgba(0,0,0,0.4)", zIndex: 100, cursor: "grabbing" });
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
              clearProps: "x,y,transform,boxShadow,zIndex,opacity",
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
      gsap.to(targetItem, { boxShadow: "0 0 16px rgba(0,0,0,0.4)", zIndex: 100, duration: 0.2 });
      
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
        gsap.set(targetItem, { opacity: 0.8, boxShadow: "0 0 16px rgba(0,0,0,0.4)", zIndex: 100 });
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
        gsap.to(targetItem, { boxShadow: "0 2px 4px rgba(0,0,0,0.1)", zIndex: 2, duration: 0.2, clearProps: "boxShadow" });
      }

      if (didDrag) {
        gsap.set(targetItem, { clearProps: "transform,boxShadow,zIndex,opacity", zIndex: 2 });
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

      <h1 className="timetable-main-title" onClick={() => { refreshNameList(); setIsListOpen(true); setIsMenuOpen(false); }}>
        {timetableTitle}
        <span className="save-status">
          {saveStatus === "saving" ? "저장 중…" : saveStatus === "error" ? "저장 실패" : "저장됨"}
          {" · "}목록 ▾
        </span>
      </h1>

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

      {isListOpen && (
        <div className="modal-overlay" onClick={() => setIsListOpen(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h2>시간표 목록</h2>
            <div className="timetable-list">
              {timetableNames.length === 0 && <div className="timetable-list-empty">시간표가 없습니다.</div>}
              {timetableNames.map(name => (
                <button
                  key={name}
                  className={`timetable-list-item ${name === timetableTitle ? "active" : ""}`}
                  onClick={() => switchTimetable(name)}
                >
                  {name}
                  {name === timetableTitle && <span className="timetable-list-badge">사용 중</span>}
                </button>
              ))}
            </div>
            <div className="modal-buttons">
              <button className="btn-cancel" onClick={() => setIsListOpen(false)}>닫기</button>
              <button className="btn-save" onClick={createTimetable}>새 시간표</button>
            </div>
          </div>
        </div>
      )}

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
