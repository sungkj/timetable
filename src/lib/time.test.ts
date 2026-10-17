import { test } from "node:test";
import assert from "node:assert/strict";
import {
  calculatePosition,
  format12h,
  formatLabel,
  generateId3,
  heightPercent,
  isOverlap,
  minutesToTimeStr,
  timeToMinutes,
  topPercent,
} from "./time.ts";
import type { TimetableEvent } from "./types.ts";

function ev(partial: Partial<TimetableEvent> & { id: string }): TimetableEvent {
  return {
    day: 0,
    startTime: "09:00",
    endTime: "10:00",
    title: "일정",
    color: "",
    ...partial,
  };
}

test("timeToMinutes / minutesToTimeStr 왕복", () => {
  for (const t of ["00:00", "08:00", "09:30", "13:10", "21:00", "23:50"]) {
    assert.equal(minutesToTimeStr(timeToMinutes(t)), t);
  }
});

test("minutesToTimeStr는 두 자리로 채운다", () => {
  assert.equal(minutesToTimeStr(0), "00:00");
  assert.equal(minutesToTimeStr(9 * 60 + 5), "09:05");
});

test("format12h", () => {
  assert.equal(format12h("00:00"), "12:00");
  assert.equal(format12h("09:05"), "9:05");
  assert.equal(format12h("12:00"), "12:00");
  assert.equal(format12h("13:30"), "1:30");
});

test("formatLabel은 정각이면 분을 생략한다", () => {
  assert.equal(formatLabel("08:00"), "8시");
  assert.equal(formatLabel("13:10"), "1시 10분");
  assert.equal(formatLabel("12:30"), "12시 30분");
});

test("calculatePosition 경계값", () => {
  // 그리드 범위는 08:00 ~ 22:00 (14시간)
  assert.equal(calculatePosition("08:00"), 0);
  assert.equal(calculatePosition("22:00"), 100);
  assert.equal(calculatePosition("15:00"), 50);
});

test("calculatePosition은 범위를 벗어나면 0~100으로 자른다", () => {
  assert.equal(calculatePosition("03:00"), 0);
  assert.equal(calculatePosition("23:30"), 100);
});

test("topPercent / heightPercent", () => {
  assert.equal(topPercent(8 * 60), 0);
  assert.equal(heightPercent(60), (60 / 840) * 100);
});

test("isOverlap: 겹치는 경우", () => {
  const events = [ev({ id: "001", day: 0, startTime: "09:00", endTime: "10:00" })];
  // 완전 포함
  assert.ok(isOverlap(events, 0, 9 * 60 + 10, 9 * 60 + 50));
  // 부분 겹침 (앞)
  assert.ok(isOverlap(events, 0, 8 * 60 + 30, 9 * 60 + 30));
  // 부분 겹침 (뒤)
  assert.ok(isOverlap(events, 0, 9 * 60 + 30, 10 * 60 + 30));
  // 완전히 감쌈
  assert.ok(isOverlap(events, 0, 8 * 60, 11 * 60));
});

test("isOverlap: 맞닿은 경우는 겹치지 않는다", () => {
  const events = [ev({ id: "001", day: 0, startTime: "09:00", endTime: "10:00" })];
  // 앞 일정이 끝나는 시각에 시작
  assert.equal(isOverlap(events, 0, 10 * 60, 11 * 60), false);
  // 뒤 일정이 시작하는 시각에 끝남
  assert.equal(isOverlap(events, 0, 8 * 60, 9 * 60), false);
});

test("isOverlap: 다른 요일은 무시한다", () => {
  const events = [ev({ id: "001", day: 0, startTime: "09:00", endTime: "10:00" })];
  assert.equal(isOverlap(events, 1, 9 * 60, 10 * 60), false);
});

test("isOverlap: ignoreId는 자기 자신을 제외한다", () => {
  const events = [ev({ id: "001", day: 0, startTime: "09:00", endTime: "10:00" })];
  assert.equal(isOverlap(events, 0, 9 * 60, 10 * 60, "001"), false);
  assert.equal(isOverlap(events, 0, 9 * 60, 10 * 60, "002"), true);
});

test("generateId3는 001부터 빈 번호를 채운다", () => {
  assert.equal(generateId3([]), "001");
  assert.equal(generateId3([ev({ id: "001" })]), "002");
});

test("generateId3는 중간의 빈 번호를 재사용한다", () => {
  const events = [ev({ id: "001" }), ev({ id: "003" })];
  assert.equal(generateId3(events), "002");
});

test("generateId3는 999개가 차면 타임스탬프를 돌려준다", () => {
  const full = Array.from({ length: 999 }, (_, i) => ev({ id: String(i + 1).padStart(3, "0") }));
  const id = generateId3(full);
  assert.equal(id.length > 3, true);
  assert.ok(Number(id) > 0);
});
