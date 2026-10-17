export const MAX_NAME_LENGTH = 50;

const CONTROL_CHARS_RE = /[\u0000-\u001f\u007f]/;

export function hasControlChars(name: string): boolean {
  return CONTROL_CHARS_RE.test(name);
}

// 서버·클라이언트 공용. 저장 가능한 이름이면 다듬은 값을, 아니면 null을 돌려준다.
export function sanitizeName(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const name = input.trim();
  if (!name || name.length > MAX_NAME_LENGTH) return null;
  if (hasControlChars(name)) return null;
  return name;
}

// 이미 쓰이는 이름이면 "이름 (2)" 형태로 비어 있는 이름을 찾는다.
export function freeName(base: string, taken: string[]): string {
  if (!taken.includes(base)) return base;
  for (let i = 2; i < 1000; i++) {
    const candidate = `${base} (${i})`;
    if (!taken.includes(candidate)) return candidate;
  }
  return `${base} ${Date.now()}`;
}
