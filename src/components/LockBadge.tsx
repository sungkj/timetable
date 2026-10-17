interface Props {
  onToggleLock: () => void;
}

// 편집이 잠긴 상태에서만 보이는 우측 상단 배지. 누르면 편집 모드로 전환된다.
export default function LockBadge({ onToggleLock }: Props) {
  return (
    <div className="lock-badge" onClick={onToggleLock}>
      🔒 보기 모드
    </div>
  );
}
