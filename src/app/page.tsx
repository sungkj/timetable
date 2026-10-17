"use client";

import { useState, useEffect, useRef, useLayoutEffect } from "react";
import { gsap, Draggable } from "../lib/gsap";
import {
  PASTEL_COLORS,
  DEFAULT_TIMETABLE_NAME,
  DAY_START_MINUTES,
  DAY_END_MINUTES,
} from "../lib/constants";
import {
  timeToMinutes,
  minutesToTimeStr,
  calculatePosition,
  isOverlap,
  generateId3,
} from "../lib/time";
import { freeName, hasControlChars } from "../lib/name";
import { readLocalEvents, readLocalTitle, writeLocalEvents, writeLocalTitle } from "../lib/storage";
import { encodeShareData, decodeLegacyShare } from "../lib/share";
import {
  ApiError,
  createTimetable,
  fetchNames,
  fetchTimetable,
  putTimetable,
  renameTimetable,
} from "../lib/api";
import type { TimetableEvent } from "../lib/types";
import { useAutoSave } from "../hooks/useAutoSave";
import { useEventResize } from "../hooks/useEventResize";
import EventContextMenu from "../components/EventContextMenu";
import FabMenu from "../components/FabMenu";
import LockBadge from "../components/LockBadge";
import ScheduleForm from "../components/ScheduleForm";
import ScheduleList from "../components/ScheduleList";
import TimetableGrid from "../components/TimetableGrid";

const useIsomorphicLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

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

  const gridRef = useRef<HTMLDivElement>(null);
  const eventsRef = useRef<TimetableEvent[]>([]);
  const resizeGuideRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef("시간표"); // 저장 요청이 최신 제목을 참조하도록
  const isLoadedRef = useRef(false); // 로딩 전 빈 상태가 서버로 저장되는 것을 막는다
  const skipNextSaveRef = useRef(false); // 시간표 전환 직후의 불필요한 재저장 방지

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

  useAutoSave(events, { isLoadedRef, skipNextSaveRef, titleRef, eventsRef });

  // 서버 목록을 받아 state에 반영하고, 같은 목록을 호출부에도 돌려준다.
  // 서버에 닿지 못하면(null) 마지막으로 받아둔 목록을 그대로 두고 빈 배열을 돌려준다.
  const refreshNameList = async (): Promise<string[]> => {
    const names = await fetchNames();
    if (names === null) return [];
    setTimetableNames(names);
    return names;
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
          openedEvents = importedEvents;
          try {
            await createTimetable(openedName, importedEvents);
            await refreshNameList();
          } catch {
            // 이미 있는 이름이거나 서버에 못 닿아도 가져온 일정은 화면에 띄운다
          }
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
    writeLocalEvents(events);
  }, [events, isLoaded]);

  // 제목이 바뀌면 로컬에도 기억해 두어 다음 실행 때 이 시간표로 시작한다.
  useEffect(() => {
    if (!isLoaded) return;
    writeLocalTitle(timetableTitle);
  }, [timetableTitle, isLoaded]);

  const handleShare = async () => {
    const encodedData = encodeShareData(events);
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
    if (hasControlChars(next)) return alert("사용할 수 없는 문자가 포함되어 있습니다.");

    if (timetableNames.includes(next)) {
      return alert("같은 이름의 시간표가 이미 있습니다. 다른 이름을 사용하세요.");
    }

    try {
      await renameTimetable(timetableTitle, next);
    } catch (err) {
      return alert(err instanceof ApiError ? err.message : "서버에 연결할 수 없습니다. 잠시 후 다시 시도하세요.");
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

  const handleCreateTimetable = async () => {
    const input = window.prompt("새 시간표 이름을 입력하세요.");
    if (input === null) return;

    const name = input.trim();
    if (!name) return;
    if (hasControlChars(name)) return alert("사용할 수 없는 문자가 포함되어 있습니다.");
    if (timetableNames.includes(name)) {
      return alert("같은 이름의 시간표가 이미 있습니다. 다른 이름을 사용하세요.");
    }

    try {
      await createTimetable(name);
    } catch (err) {
      return alert(err instanceof ApiError ? err.message : "서버에 연결할 수 없습니다. 잠시 후 다시 시도하세요.");
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
    } catch {
      alert("일정을 삭제하지 못했습니다. 서버 연결을 확인하세요.");
      return;
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


  const { handleResizeStart } = useEventResize({ gridRef, resizeGuideRef, eventsRef, setEvents });

  const overlaps = (day: number, start: number, end: number, ignoreId?: string) =>
    isOverlap(events, day, start, end, ignoreId);

  const saveEvent = () => {
    if (!newTitle) return alert("제목을 입력하세요.");
    const start = timeToMinutes(newStartTime);
    const end = timeToMinutes(newEndTime);
    if (start >= end) return alert("종료 시간은 시작 시간보다 늦어야 합니다.");
    if (overlaps(newDay, start, end, editingEventId || undefined)) return alert("해당 시간에 이미 일정이 있습니다.");

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
      let startMins = (i === 0) ? checkStart : DAY_START_MINUTES;

      while (startMins + duration <= DAY_END_MINUTES) {
        if (!overlaps(day, startMins, startMins + duration)) {
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
      {isLocked && <LockBadge onToggleLock={toggleLock} />}

      <h1 className="timetable-main-title" onClick={() => { refreshNameList(); setIsListOpen(true); setIsMenuOpen(false); }}>
        {timetableTitle}
        <span className="list-caret">▾</span>
      </h1>

      <FabMenu
        isOpen={isMenuOpen}
        isLocked={isLocked}
        onToggle={() => setIsMenuOpen(!isMenuOpen)}
        onToggleLock={toggleLock}
        onAddEvent={openAddModal}
        onEditTitle={handleEditTitle}
        onShare={handleShare}
        onDeleteAll={handleDeleteAll}
      />

      {menuData && (
        <EventContextMenu
          x={menuData.x}
          y={menuData.y}
          onEdit={() => openEditModal(menuData.id)}
          onCopy={() => copyEvent(menuData.id)}
          onDelete={() => deleteEvent(menuData.id)}
          onClose={() => setMenuData(null)}
        />
      )}

      <TimetableGrid
        events={events}
        isLocked={isLocked}
        isLockedRef={isLockedRef}
        eventsRef={eventsRef}
        gridRef={gridRef}
        resizeGuideRef={resizeGuideRef}
        setEvents={setEvents}
        currentDayIndex={currentDayIndex}
        currentTop={currentTop}
        remainingMinutes={remainingMinutes}
        onSelectEvent={(id, x, y) => setMenuData({ id, x, y })}
        onResizeStart={handleResizeStart}
      />

      {isListOpen && (
        <ScheduleList
          names={timetableNames}
          currentName={timetableTitle}
          onSelect={switchTimetable}
          onCreate={handleCreateTimetable}
          onClose={() => setIsListOpen(false)}
        />
      )}

      {isModalOpen && (
        <ScheduleForm
          isEditing={editingEventId !== null}
          title={newTitle}
          day={newDay}
          startTime={newStartTime}
          endTime={newEndTime}
          color={newColor}
          onTitleChange={setNewTitle}
          onDayChange={setNewDay}
          onStartTimeChange={setNewStartTime}
          onEndTimeChange={setNewEndTime}
          onColorChange={setNewColor}
          onSave={saveEvent}
          onClose={closeModal}
        />
      )}
    </main>
  );
}
