import { test } from "node:test";
import assert from "node:assert/strict";
import { freeName, hasControlChars, sanitizeName, MAX_NAME_LENGTH } from "./name.ts";

test("freeName은 비어 있으면 그대로 돌려준다", () => {
  assert.equal(freeName("수업", []), "수업");
  assert.equal(freeName("수업", ["다른거"]), "수업");
});

test("freeName은 겹치면 번호를 붙인다", () => {
  assert.equal(freeName("수업", ["수업"]), "수업 (2)");
  assert.equal(freeName("수업", ["수업", "수업 (2)"]), "수업 (3)");
});

test("freeName은 중간에 빈 번호가 있어도 처음 빈 자리를 쓴다", () => {
  assert.equal(freeName("수업", ["수업", "수업 (3)"]), "수업 (2)");
});

test("hasControlChars", () => {
  assert.equal(hasControlChars("수업"), false);
  assert.equal(hasControlChars("수업\n시간표"), true);
  assert.equal(hasControlChars("수업\u0000"), true);
});

test("sanitizeName은 앞뒤 공백을 다듬는다", () => {
  assert.equal(sanitizeName("  수업  "), "수업");
});

test("sanitizeName은 잘못된 입력을 거부한다", () => {
  assert.equal(sanitizeName(undefined), null);
  assert.equal(sanitizeName(123), null);
  assert.equal(sanitizeName(""), null);
  assert.equal(sanitizeName("   "), null);
  assert.equal(sanitizeName("수업\n시간표"), null);
  assert.equal(sanitizeName("ㄱ".repeat(MAX_NAME_LENGTH + 1)), null);
});

test("sanitizeName은 최대 길이는 허용한다", () => {
  const name = "ㄱ".repeat(MAX_NAME_LENGTH);
  assert.equal(sanitizeName(name), name);
});
