const MENU_WIDTH = 160;
const MENU_HEIGHT = 150;

interface Props {
  names: string[];
  currentName: string;
  onSelect: (name: string) => void;
  onCreate: () => void;
  onClose: () => void;
}

export default function ScheduleList({ names, currentName, onSelect, onCreate, onClose }: Props) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <h2>시간표 목록</h2>
        <div className="timetable-list">
          {names.length === 0 && <div className="timetable-list-empty">시간표가 없습니다.</div>}
          {names.map(name => (
            <button
              key={name}
              className="timetable-list-item"
              data-active={name === currentName}
              onClick={() => onSelect(name)}
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
    </div>
  );
}
