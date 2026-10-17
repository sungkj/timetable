import { test } from "node:test";
import assert from "node:assert/strict";
import { decodeLegacyShare, encodeShareData } from "./share.ts";
import { PASTEL_COLORS } from "./constants.ts";
import type { TimetableEvent } from "./types.ts";

const 오전수업: TimetableEvent = {
  id: "001",
  day: 0,
  startTime: "09:00",
  endTime: "10:30",
  title: "수학",
  color: JSON.stringify(PASTEL_COLORS[0]),
};

const 오후수업: TimetableEvent = {
  id: "002",
  day: 3,
  startTime: "13:10",
  endTime: "15:00",
  title: "영어 회화",
  color: JSON.stringify(PASTEL_COLORS[2]),
};

test("encodeShareData → decodeLegacyShare 왕복", () => {
  const decoded = decodeLegacyShare(encodeShareData([오전수업, 오후수업]));
  assert.notEqual(decoded, null);
  assert.deepEqual(decoded, [
    { ...오전수업, color: JSON.stringify(PASTEL_COLORS[0]) },
    { ...오후수업, color: JSON.stringify(PASTEL_COLORS[2]) },
  ]);
});

test("encodeShareData는 색상 인덱스를 담는다", () => {
  // 마지막 필드가 색상 인덱스. 파랑 = 0, 초록 = 2
  const raw = Buffer.from(encodeShareData([오전수업, 오후수업]), "base64").toString("utf8");
  assert.equal(raw, "001|0|0900|1030|수학|0*002|3|1310|1500|영어 회화|2");
});

test("decodeLegacyShare는 깨진 입력에 null을 돌려준다", () => {
  assert.equal(decodeLegacyShare("!!!not base64!!!"), null);
  assert.equal(decodeLegacyShare(""), null);
});

test("decodeLegacyShare는 빈 목록이면 null을 돌려준다", () => {
  assert.equal(decodeLegacyShare(encodeShareData([])), null);
});

test("알 수 없는 색상 인덱스는 첫 번째 색으로 대체된다", () => {
  const raw = btoa(unescape(encodeURIComponent("001|0|0900|1000|수학|99")));
  const decoded = decodeLegacyShare(raw);
  assert.equal(decoded?.[0].color, JSON.stringify(PASTEL_COLORS[0]));
});
