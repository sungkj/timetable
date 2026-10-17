const MENU_WIDTH = 160;
const MENU_HEIGHT = 150;

interface Props {
  x: number;
  y: number;
  onEdit: () => void;
  onCopy: () => void;
  onDelete: () => void;
  onClose: () => void;
}

// 일정을 짧게 눌렀을 때 뜨는 메뉴. 화면 밖으로 나가지 않도록 위치를 자른다.
export default function EventContextMenu({ x, y, onEdit, onCopy, onDelete, onClose }: Props) {
  return (
    <div className="event-menu-overlay" onClick={onClose}>
      <div
        className="event-menu"
        style={{
          left: Math.min(x, typeof window !== "undefined" ? window.innerWidth - MENU_WIDTH : x),
          top: Math.min(y, typeof window !== "undefined" ? window.innerHeight - MENU_HEIGHT : y),
        }}
      >
        <button className="event-menu-item" onClick={onEdit}>일정 수정</button>
        <button className="event-menu-item" onClick={onCopy}>일정 복사</button>
        <button className="event-menu-item delete" onClick={onDelete}>일정 삭제</button>
      </div>
    </div>
  );
}
