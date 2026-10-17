interface Props {
  isOpen: boolean;
  isLocked: boolean;
  onToggle: () => void;
  onToggleLock: () => void;
  onAddEvent: () => void;
  onEditTitle: () => void;
  onShare: () => void;
  onDeleteAll: () => void;
}

export default function FabMenu({
  isOpen,
  isLocked,
  onToggle,
  onToggleLock,
  onAddEvent,
  onEditTitle,
  onShare,
  onDeleteAll,
}: Props) {
  return (
    <div className="fab-container">
      <div className={`fab-menu ${isOpen ? "open" : ""}`}>
        <div className="fab-item" onClick={onToggleLock}>
          {isLocked ? "🔓 편집 모드로 전환" : "🔒 시간표 잠금"}
        </div>
        <div className="fab-item" onClick={onAddEvent}>일정 추가</div>
        <div className="fab-item" onClick={onEditTitle}>제목 편집</div>
        <div className="fab-item" onClick={onShare}>공유</div>
        <div className="fab-item delete-all" onClick={onDeleteAll}>일정 모두 삭제</div>
      </div>
      <button className={`add-button ${isOpen ? "open" : ""}`} onClick={onToggle}>
        {isOpen ? "+" : "☰"}
      </button>
    </div>
  );
}
