import type { SaveStatus as Status } from "../hooks/useAutoSave";

interface Props {
  status: Status;
}

// 저장이 끝난 상태에서는 아무것도 그리지 않는다.
export default function SaveStatus({ status }: Props) {
  if (status === "saved") return null;
  return <span className="save-status">{status === "saving" ? "저장 중…" : "저장 실패"}</span>;
}
