import { NextRequest, NextResponse } from "next/server";
import { Redis } from "@upstash/redis";
import { sanitizeName } from "../../../lib/name.ts";

export const dynamic = "force-dynamic";

// 모든 시간표를 담는 Redis 해시. field = 시간표 제목, value = JSON 문자열.
// 제목이 키이므로 같은 이름의 시간표는 구조적으로 존재할 수 없다.
const KEY = "timetables";
const MAX_EVENTS = 500;

let client: Redis | null = null;

function getRedis(): Redis | null {
  if (client) return client;
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if (!url || !token) return null;
  client = new Redis({ url, token });
  return client;
}

function noRedis() {
  return NextResponse.json(
    { error: "저장소가 설정되지 않았습니다. UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN 환경변수를 확인하세요." },
    { status: 503 }
  );
}

type StoredEvent = {
  id: string;
  day: number;
  startTime: string;
  endTime: string;
  title: string;
  color: string;
};

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

// 클라이언트가 보낸 값을 아는 모양으로만 추려서 저장한다.
function sanitizeEvents(input: unknown): StoredEvent[] | null {
  if (!Array.isArray(input)) return null;
  if (input.length > MAX_EVENTS) return null;

  const out: StoredEvent[] = [];
  for (const raw of input) {
    if (!raw || typeof raw !== "object") return null;
    const e = raw as Record<string, unknown>;
    if (typeof e.id !== "string" || !e.id) return null;
    if (typeof e.title !== "string") return null;
    if (typeof e.startTime !== "string" || !TIME_RE.test(e.startTime)) return null;
    if (typeof e.endTime !== "string" || !TIME_RE.test(e.endTime)) return null;
    if (typeof e.day !== "number" || !Number.isInteger(e.day) || e.day < 0 || e.day > 6) return null;
    out.push({
      id: e.id.slice(0, 32),
      day: e.day,
      startTime: e.startTime,
      endTime: e.endTime,
      title: e.title.slice(0, 100),
      color: typeof e.color === "string" ? e.color : "",
    });
  }
  return out;
}

async function readBody(req: NextRequest): Promise<Record<string, unknown>> {
  try {
    const body = await req.json();
    return body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

// GET /api/timetables                    → { names: [...] } 최근 수정순
// GET /api/timetables?name=수업           → { name, events: [...] }
export async function GET(req: NextRequest) {
  const redis = getRedis();
  if (!redis) return noRedis();

  const name = req.nextUrl.searchParams.get("name");

  if (!name) {
    // 새 기기가 가장 최근에 쓰인 시간표를 열 수 있도록 수정 시각 역순으로 돌려준다.
    const all = await redis.hgetall<Record<string, string | { updatedAt?: number }>>(KEY);
    const names = Object.entries(all || {})
      .map(([key, value]) => {
        let updatedAt = 0;
        try {
          const parsed = typeof value === "string" ? JSON.parse(value) : value;
          updatedAt = Number(parsed?.updatedAt) || 0;
        } catch {}
        return { name: key, updatedAt };
      })
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .map(e => e.name);
    return NextResponse.json({ names });
  }

  const raw = await redis.hget<string>(KEY, name);
  if (raw === null || raw === undefined) {
    return NextResponse.json({ error: "없는 시간표입니다." }, { status: 404 });
  }
  const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
  return NextResponse.json({ name, events: parsed?.events ?? [] });
}

// POST /api/timetables { name, events }  → 새 시간표 생성. 이미 있으면 409.
export async function POST(req: NextRequest) {
  const redis = getRedis();
  if (!redis) return noRedis();

  const body = await readBody(req);
  const name = sanitizeName(body.name);
  if (!name) return NextResponse.json({ error: "시간표 이름이 올바르지 않습니다." }, { status: 400 });

  const events = sanitizeEvents(body.events ?? []);
  if (!events) return NextResponse.json({ error: "일정 데이터가 올바르지 않습니다." }, { status: 400 });

  const exists = await redis.hexists(KEY, name);
  if (exists) return NextResponse.json({ error: "같은 이름의 시간표가 이미 있습니다." }, { status: 409 });

  await redis.hset(KEY, { [name]: JSON.stringify({ events, updatedAt: Date.now() }) });
  return NextResponse.json({ name, events });
}

// PUT /api/timetables?name=수업 { events }  → 자동 저장(업서트)
export async function PUT(req: NextRequest) {
  const redis = getRedis();
  if (!redis) return noRedis();

  const name = sanitizeName(req.nextUrl.searchParams.get("name"));
  if (!name) return NextResponse.json({ error: "시간표 이름이 올바르지 않습니다." }, { status: 400 });

  const body = await readBody(req);
  const events = sanitizeEvents(body.events);
  if (!events) return NextResponse.json({ error: "일정 데이터가 올바르지 않습니다." }, { status: 400 });

  await redis.hset(KEY, { [name]: JSON.stringify({ events, updatedAt: Date.now() }) });
  return NextResponse.json({ name, savedAt: Date.now() });
}

// PATCH /api/timetables { from, to }  → 제목 변경. 대상 이름이 이미 있으면 409.
export async function PATCH(req: NextRequest) {
  const redis = getRedis();
  if (!redis) return noRedis();

  const body = await readBody(req);
  const from = sanitizeName(body.from);
  const to = sanitizeName(body.to);
  if (!from || !to) return NextResponse.json({ error: "시간표 이름이 올바르지 않습니다." }, { status: 400 });
  if (from === to) return NextResponse.json({ name: to });

  const sourceExists = await redis.hexists(KEY, from);
  if (!sourceExists) return NextResponse.json({ error: "없는 시간표입니다." }, { status: 404 });

  const targetExists = await redis.hexists(KEY, to);
  if (targetExists) return NextResponse.json({ error: "같은 이름의 시간표가 이미 있습니다." }, { status: 409 });

  const raw = await redis.hget<string>(KEY, from);
  await redis.hset(KEY, { [to]: raw });
  await redis.hdel(KEY, from);

  return NextResponse.json({ name: to });
}
