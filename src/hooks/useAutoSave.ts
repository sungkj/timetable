import { useEffect, useRef, useState } from "react";
import { putTimetable } from "../lib/api.ts";
import type { TimetableEvent } from "../lib/types.ts";

export type SaveStatus = "saved" | "saving" | "error";

const SAVE_DELAY_MS = 600;

interface Options {
  // 로딩이 끝나기 전 빈 상태가 서버로 올라가는 것을 막는다
  isLoadedRef: React.MutableRefObject<boolean>;
  // 시간표를 새로 불러온 직후의 불필요한 재저장을 막는다
  skipNextSaveRef: React.MutableRefObject<boolean>;
  titleRef: React.MutableRefObject<string>;
  eventsRef: React.MutableRefObject<TimetableEvent[]>;
}

// 일정이 바뀌면 자동 저장. 입력이 멈추고 600ms 뒤 한 번만 서버로 보낸다.
export function useAutoSave(
  events: TimetableEvent[],
  { isLoadedRef, skipNextSaveRef, titleRef, eventsRef }: Options
): SaveStatus {
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("saved");
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!isLoadedRef.current) return;
    if (skipNextSaveRef.current) {
      skipNextSaveRef.current = false;
      return;
    }

    setSaveStatus("saving");
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      try {
        await putTimetable(titleRef.current, eventsRef.current);
        setSaveStatus("saved");
      } catch {
        setSaveStatus("error");
      }
    }, SAVE_DELAY_MS);

    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [events, isLoadedRef, skipNextSaveRef, titleRef, eventsRef]);

  return saveStatus;
}
