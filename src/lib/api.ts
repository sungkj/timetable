import type { TimetableEvent } from "./types.ts";

const ENDPOINT = "/api/timetables";

export class ApiError extends Error {}

// 서버에 저장된 시간표 목록. 최근 수정순이며 그대로 돌려준다.
// 서버에 닿지 못하면 null. "목록이 비어 있음"과 "못 받아옴"은 다르므로 구분한다.
export async function fetchNames(): Promise<string[] | null> {
  try {
    const res = await fetch(ENDPOINT);
    if (!res.ok) return null;
    const data = await res.json();
    return Array.isArray(data.names) ? data.names : null;
  } catch {
    return null;
  }
}

// 시간표 하나를 불러온다. 서버에 없으면 null.
export async function fetchTimetable(name: string): Promise<TimetableEvent[] | null> {
  const res = await fetch(`${ENDPOINT}?name=${encodeURIComponent(name)}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new ApiError("불러오지 못했습니다.");
  const data = await res.json();
  return Array.isArray(data.events) ? data.events : [];
}

// 저장(업서트).
export async function putTimetable(name: string, events: TimetableEvent[]): Promise<void> {
  const res = await fetch(`${ENDPOINT}?name=${encodeURIComponent(name)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ events }),
  });
  if (!res.ok) throw new ApiError("저장하지 못했습니다.");
}

// 새 시간표 생성. 이미 있으면 ApiError.
export async function createTimetable(name: string, events: TimetableEvent[] = []): Promise<void> {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, events }),
  });
  if (!res.ok) throw new ApiError(await readError(res, "시간표를 만들지 못했습니다."));
}

// 제목 변경. 대상 이름이 이미 있으면 ApiError.
export async function renameTimetable(from: string, to: string): Promise<void> {
  const res = await fetch(ENDPOINT, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ from, to }),
  });
  if (!res.ok) throw new ApiError(await readError(res, "제목을 변경하지 못했습니다."));
}

// 서버가 보낸 한국어 오류 메시지를 그대로 쓰고, 없으면 기본 문구로 대체한다.
async function readError(res: Response, fallback: string): Promise<string> {
  try {
    const data = await res.json();
    return typeof data?.error === "string" ? data.error : fallback;
  } catch {
    return fallback;
  }
}
