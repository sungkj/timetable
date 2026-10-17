import { useEffect, useRef } from "react";
import { putTimetable } from "../lib/api.ts";
import { readPendingSave, writePendingSave, clearPendingSave } from "../lib/pendingSave.ts";
import type { TimetableEvent } from "../lib/types.ts";

const SAVE_DELAY_MS = 600;
const RETRY_DELAY_MS = 5000;

interface Options {
  // 로딩이 끝나기 전 빈 상태가 서버로 올라가는 것을 막는다
  isLoadedRef: React.MutableRefObject<boolean>;
  // 시간표를 새로 불러온 직후의 불필요한 재저장을 막는다
  skipNextSaveRef: React.MutableRefObject<boolean>;
  titleRef: React.MutableRefObject<string>;
  eventsRef: React.MutableRefObject<TimetableEvent[]>;
}

// 일정이 바뀌면 자동 저장. 입력이 멈추고 600ms 뒤 한 번만 서버로 보낸다.
// 서버로 못 보내면 브라우저에 남겨 두고 5초마다, 그리고 연결이 돌아올 때 다시 보낸다.
export function useAutoSave(
  events: TimetableEvent[],
  { isLoadedRef, skipNextSaveRef, titleRef, eventsRef }: Options
): void {
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // 밀린 저장을 다시 보낸다. 성공하면 지운다.
  const flushPending = async () => {
    const pending = readPendingSave();
    if (!pending) return;
    try {
      await putTimetable(pending.name, pending.events);
      clearPendingSave();
    } catch {
      // 아직 안 되면 남겨 두고 다음 차례에 다시 시도한다
    }
  };

  useEffect(() => {
    flushPending();
    retryTimerRef.current = setInterval(flushPending, RETRY_DELAY_MS);
    window.addEventListener("online", flushPending);

    return () => {
      if (retryTimerRef.current) clearInterval(retryTimerRef.current);
      window.removeEventListener("online", flushPending);
    };
  }, []);

  useEffect(() => {
    if (!isLoadedRef.current) return;
    if (skipNextSaveRef.current) {
      skipNextSaveRef.current = false;
      return;
    }

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      try {
        await putTimetable(titleRef.current, eventsRef.current);
        clearPendingSave(); // 이 내용이 서버에 있으므로 밀린 저장은 필요 없다
      } catch {
        // 지금 내용을 로컬에 남겨 두고 나중에 다시 보낸다
        writePendingSave({ name: titleRef.current, events: eventsRef.current });
      }
    }, SAVE_DELAY_MS);

    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [events, isLoadedRef, skipNextSaveRef, titleRef, eventsRef]);
}
