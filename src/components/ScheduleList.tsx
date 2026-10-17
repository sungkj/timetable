"use client";

import { useRef, useState } from "react";

const LONG_PRESS_MS = 400;
const MENU_WIDTH = 130;
const MENU_HEIGHT = 50;
const MOVE_TOLERANCE_PX = 10;

interface Props {
  names: string[];
  currentName: string;
  onSelect: (name: string) => void;
  onCreate: () => void;
  onDelete: (name: string) => void;
  onClose: () => void;
}

// 시간표 목록 모달. 항목을 길게 누른 뒤 손을 떼면 제거 메뉴가 뜬다.
export default function ScheduleList({ names, currentName, onSelect, onCreate, onDelete, onClose }: Props) {
  const [menu, setMenu] = useState<{ name: string; x: number; y: number } | null>(null);
  const pressRef = useRef<{ timer: ReturnType<typeof setTimeout>; startX: number; startY: number } | null>(null);
  const longPressedRef = useRef(false);

  const cancelPress = () => {
    if (pressRef.current) clearTimeout(pressRef.current.timer);
    pressRef.current = null;
  };

  const startPress = (e: React.PointerEvent, name: string) => {
    cancelPress();
    longPressedRef.current = false;
    const { clientX, clientY } = e;
    pressRef.current = {
      startX: clientX,
      startY: clientY,
      timer: setTimeout(() => {
        longPressedRef.current = true;
        pressRef.current = null;
      }, LONG_PRESS_MS),
    };
  };

  // 손가락이 조금이라도 움직이면 스크롤로 보고 길게 누르기를 취소한다.
  const movePress = (e: React.PointerEvent) => {
    const press = pressRef.current;
    if (!press) return;
    if (Math.abs(e.clientX - press.startX) > MOVE_TOLERANCE_PX ||
        Math.abs(e.clientY - press.startY) > MOVE_TOLERANCE_PX) {
      cancelPress();
    }
  };

  const handleClick = (e: React.MouseEvent, name: string) => {
    if (longPressedRef.current) {
      longPressedRef.current = false;
      setMenu({ name, x: e.clientX, y: e.clientY });
      return;
    }
    onSelect(name);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <h2>시간표 목록</h2>
        <div className="timetable-list" onContextMenu={(e) => e.preventDefault()}>
          {names.length === 0 && <div className="timetable-list-empty">시간표가 없습니다.</div>}
          {names.map(name => (
            <button
              key={name}
              className="timetable-list-item"
              data-active={name === currentName}
              onPointerDown={(e) => startPress(e, name)}
              onPointerMove={movePress}
              onPointerUp={cancelPress}
              onPointerLeave={cancelPress}
              onPointerCancel={cancelPress}
              onClick={(e) => handleClick(e, name)}
            >
              {name}
              {name === currentName && <span className="timetable-list-badge">사용 중</span>}
            </button>
          ))}
        </div>
        <div className="modal-buttons">
          <button className="btn-cancel" onClick={onClose}>닫기</button>
          <button className="btn-save" onClick={onCreate}>새 시간표</button>
        </div>
      </div>

      {menu && (
        <div className="event-menu-overlay" onClick={() => setMenu(null)}>
          <div
            className="event-menu"
            style={{
              left: Math.min(menu.x, window.innerWidth - MENU_WIDTH),
              top: Math.min(menu.y, window.innerHeight - MENU_HEIGHT),
            }}
          >
            <button
              className="event-menu-item delete"
              onClick={(e) => { e.stopPropagation(); setMenu(null); onDelete(menu.name); }}
            >
              제거
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
