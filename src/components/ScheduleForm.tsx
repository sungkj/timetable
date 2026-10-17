import { DAYS, PASTEL_COLORS } from "../lib/constants";
import type { PastelColor } from "../lib/types";

interface Props {
  isEditing: boolean;
  title: string;
  day: number;
  startTime: string;
  endTime: string;
  color: PastelColor;
  onTitleChange: (value: string) => void;
  onDayChange: (value: number) => void;
  onStartTimeChange: (value: string) => void;
  onEndTimeChange: (value: string) => void;
  onColorChange: (value: PastelColor) => void;
  onSave: () => void;
  onClose: () => void;
}

export default function ScheduleForm({
  isEditing,
  title,
  day,
  startTime,
  endTime,
  color,
  onTitleChange,
  onDayChange,
  onStartTimeChange,
  onEndTimeChange,
  onColorChange,
  onSave,
  onClose,
}: Props) {
  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <h2>{isEditing ? "일정 수정" : "새 일정 추가"}</h2>
        <div className="form-group">
          <label>일정 이름</label>
          <input type="text" value={title} onChange={(e) => onTitleChange(e.target.value)} />
        </div>
        <div className="form-group">
          <label>요일</label>
          <select value={day} onChange={(e) => onDayChange(Number(e.target.value))}>
            {DAYS.map((d, i) => <option key={d} value={i}>{d}요일</option>)}
          </select>
        </div>
        <div className="form-group">
          <label>시작 시간</label>
          <input type="time" step="600" value={startTime} onChange={(e) => onStartTimeChange(e.target.value)} />
        </div>
        <div className="form-group">
          <label>종료 시간</label>
          <input type="time" step="600" value={endTime} onChange={(e) => onEndTimeChange(e.target.value)} />
        </div>
        <div className="form-group">
          <label>색상 선택</label>
          <div className="color-presets">
            {PASTEL_COLORS.map((c, i) => (
              <button
                key={i}
                data-active={color.bg === c.bg}
                className="color-preset-btn"
                style={{ backgroundColor: c.bg, borderColor: c.border }}
                onClick={() => onColorChange(c)}
              />
            ))}
          </div>
        </div>
        <div className="modal-buttons">
          <button className="btn-cancel" onClick={onClose}>취소</button>
          <button className="btn-save" onClick={onSave}>저장</button>
        </div>
      </div>
    </div>
  );
}
