// ЭТАЛОННЫЙ ТЕСТ приложения Calendar Booking.
//
// Это интеграционный (end-to-end) тест бэкенда: он поднимает НАСТОЯЩИЙ сервер
// (src/index.js) на временной SQLite-базе и свободном порту, затем прогоняет по
// HTTP весь жизненный цикл предметной области из CONTEXT.md:
//
//   Публичная страница организатора → расчёт свободных Slot → создание Booking
//   участником (Attendee) → защита от двойной брони → вход организатора
//   (Organizer) → управление Event Type → подтверждение / перенос / отмена брони.
//
// Ничего не мокаем: тест проверяет реальные Express-маршруты, слой моделей,
// расчёт слотов (slots.js) и сессионную авторизацию. Это «золотой» образец —
// новые тесты стоит писать по его образу.
//
// Зависимостей нет: встроенный node:test + глобальный fetch (Node 18+).
// Запуск:  cd server && node --test           (или  npm test)

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { rmSync } from "node:fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SERVER_DIR = join(__dirname, "..");

// Демо-данные из seed.js: организатор `nina` и два типа события.
const SEED = {
  email: "khabarova.ninaa@gmail.com",
  password: "password123",
  username: "nina",
  introEventId: 1, // «Интро-звонок», 15 мин, без подтверждения
  consultEventId: 2, // «Консультация 30 минут», требует подтверждения + поле agenda
};

// Общий контекст, который передаётся между шагами теста.
const ctx = {
  proc: null,
  base: "", // http://127.0.0.1:<port>
  dbPath: "",
  cookie: "", // сессия организатора после входа
};

// ── Вспомогательные функции ──────────────────────────────────────────────

/** Найти свободный TCP-порт (просим ОС выдать эфемерный и сразу освобождаем). */
function freePort() {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.once("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Обёртка над fetch: JSON-тело, cookie сессии, разбор ответа.
 * Возвращает { status, body }. Пустое тело (204) → body === null.
 */
async function api(method, path, { body, cookie } = {}) {
  const headers = {};
  if (body !== undefined) headers["content-type"] = "application/json";
  if (cookie) headers.cookie = cookie;
  const res = await fetch(ctx.base + path, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null, res };
}

/** Дата YYYY-MM-DD со сдвигом в днях от сегодня (для окна расчёта слотов). */
function ymd(offsetDays) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

/** Запросить свободные слоты события и вернуть первый (гарантированно валидный). */
async function firstSlot(eventId, extra = "") {
  const { status, body } = await api(
    "GET",
    `/slots?eventTypeId=${eventId}&start=${ymd(1)}&end=${ymd(25)}${extra}`,
  );
  assert.equal(status, 200, "GET /slots должен отвечать 200");
  assert.ok(Array.isArray(body.slots), "ответ /slots содержит массив slots");
  assert.ok(body.slots.length > 0, "в окне 25 дней должен найтись хотя бы один слот");
  return body.slots[0];
}

// ── Поднятие/остановка сервера вокруг всех тестов ─────────────────────────

before(async () => {
  const port = await freePort();
  ctx.base = `http://127.0.0.1:${port}`;
  ctx.dbPath = join(tmpdir(), `calendar-test-${process.pid}-${port}.db`);

  ctx.proc = spawn(process.execPath, ["src/index.js"], {
    cwd: SERVER_DIR,
    env: {
      ...process.env,
      BACKEND_PORT: String(port),
      DB_PATH: ctx.dbPath,
      NODE_ENV: "test",
      SMTP_HOST: "", // почта в режиме заглушки (наружу ничего не уходит)
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  ctx.proc.stderr.on("data", (d) => process.stderr.write(`[server] ${d}`));

  // Ждём готовности: опрашиваем публичный маршрут, пока не ответит 200.
  const deadline = Date.now() + 15000;
  for (;;) {
    if (Date.now() > deadline) throw new Error("Сервер не поднялся за 15 секунд");
    try {
      const r = await fetch(`${ctx.base}/public/${SEED.username}`);
      if (r.status === 200) break;
    } catch {
      /* сервер ещё не слушает — ждём */
    }
    await sleep(150);
  }
});

after(() => {
  if (ctx.proc) ctx.proc.kill("SIGKILL");
  // Удаляем временную БД и WAL-хвосты.
  for (const suffix of ["", "-wal", "-shm"]) {
    try {
      rmSync(ctx.dbPath + suffix, { force: true });
    } catch {
      /* уже удалено */
    }
  }
});

// ── 1. Публичная страница организатора ────────────────────────────────────

test("публичный профиль организатора отдаётся без приватных полей", async () => {
  const { status, body } = await api("GET", `/public/${SEED.username}`);
  assert.equal(status, 200);
  assert.equal(body.username, SEED.username);
  assert.ok(Array.isArray(body.eventTypes) && body.eventTypes.length >= 2);
  // Приватные поля организатора не должны утекать на публичный маршрут.
  assert.equal(body.email, undefined, "email организатора не публикуется");
  assert.equal(body.passwordHash, undefined, "хэш пароля не публикуется");
});

test("публичный тип события доступен по slug, скрытый/несуществующий → 404", async () => {
  const ok = await api("GET", `/public/${SEED.username}/intro`);
  assert.equal(ok.status, 200);
  assert.equal(ok.body.slug, "intro");

  const missing = await api("GET", `/public/${SEED.username}/no-such-slug`);
  assert.equal(missing.status, 404);
  assert.equal(missing.body.errorCode, "event_type_not_found");
});

// ── 2. Создание брони участником (без авторизации) ────────────────────────

test("участник бронирует свободный слот интро-звонка → 201 accepted", async () => {
  const slot = await firstSlot(SEED.introEventId);

  const { status, body } = await api("POST", "/bookings", {
    body: {
      eventTypeId: SEED.introEventId,
      start: slot.start,
      attendee: {
        name: "Тестовый Участник",
        email: "attendee@example.com",
        timeZone: "Europe/Moscow",
      },
    },
  });

  assert.equal(status, 201, "бронь создаётся");
  assert.equal(body.status, "accepted", "интро-звонок без подтверждения → accepted");
  assert.ok(body.uid, "у брони есть uid");
  assert.equal(body.attendees[0].email, "attendee@example.com");

  ctx.introBookingUid = body.uid;
  ctx.introBookingStart = slot.start;
});

test("повторная бронь того же слота отклоняется → 409 slot_unavailable", async () => {
  const { status, body } = await api("POST", "/bookings", {
    body: {
      eventTypeId: SEED.introEventId,
      start: ctx.introBookingStart, // тот же слот, что заняли выше
      attendee: { name: "Второй", email: "second@example.com", timeZone: "Europe/Moscow" },
    },
  });
  assert.equal(status, 409, "двойное бронирование запрещено");
  assert.equal(body.errorCode, "slot_unavailable");
});

test("занятый слот исчезает из ответа /slots", async () => {
  const { body } = await api(
    "GET",
    `/slots?eventTypeId=${SEED.introEventId}&start=${ymd(1)}&end=${ymd(25)}`,
  );
  const stillFree = body.slots.some((s) => s.start === ctx.introBookingStart);
  assert.equal(stillFree, false, "занятое время больше не предлагается");
});

test("бронь читается публично по uid", async () => {
  const { status, body } = await api("GET", `/bookings/${ctx.introBookingUid}`);
  assert.equal(status, 200);
  assert.equal(body.uid, ctx.introBookingUid);
});

// ── 3. Авторизация организатора ───────────────────────────────────────────

test("защищённый маршрут без сессии → 401", async () => {
  const { status } = await api("GET", "/me");
  assert.equal(status, 401);
});

test("вход с неверным паролем → 401", async () => {
  const { status, body } = await api("POST", "/auth/login", {
    body: { email: SEED.email, password: "wrong-password" },
  });
  assert.equal(status, 401);
  assert.equal(body.errorCode, "invalid_credentials");
});

test("вход организатора выдаёт сессионную cookie", async () => {
  const { status, body, res } = await api("POST", "/auth/login", {
    body: { email: SEED.email, password: SEED.password },
  });
  assert.equal(status, 200);
  assert.equal(body.username, SEED.username);

  const setCookie = res.headers.getSetCookie();
  assert.ok(setCookie && setCookie.length > 0, "сервер ставит cookie сессии");
  ctx.cookie = setCookie[0].split(";")[0]; // connect.sid=...

  const me = await api("GET", "/me", { cookie: ctx.cookie });
  assert.equal(me.status, 200);
  assert.equal(me.body.email, SEED.email);
});

// ── 4. Управление типами событий (организатор) ────────────────────────────

test("организатор создаёт тип события; дублирующийся slug → 409", async () => {
  const created = await api("POST", "/event-types", {
    cookie: ctx.cookie,
    body: { title: "Демо-тест", slug: "demo-test", lengthInMinutes: 20 },
  });
  assert.equal(created.status, 201);
  assert.equal(created.body.slug, "demo-test");
  ctx.newEventId = created.body.id;

  const dup = await api("POST", "/event-types", {
    cookie: ctx.cookie,
    body: { title: "Дубль", slug: "demo-test", lengthInMinutes: 20 },
  });
  assert.equal(dup.status, 409);
  assert.equal(dup.body.errorCode, "slug_conflict");
});

test("организатор редактирует тип события (PATCH)", async () => {
  const { status, body } = await api("PATCH", `/event-types/${ctx.newEventId}`, {
    cookie: ctx.cookie,
    body: { title: "Демо-тест (обновлён)", requiresConfirmation: true },
  });
  assert.equal(status, 200);
  assert.equal(body.title, "Демо-тест (обновлён)");
  assert.equal(body.requiresConfirmation, true);
});

test("список типов событий требует сессию и видит новый тип", async () => {
  const anon = await api("GET", "/event-types");
  assert.equal(anon.status, 401);

  const { status, body } = await api("GET", "/event-types", { cookie: ctx.cookie });
  assert.equal(status, 200);
  assert.ok(body.items.some((e) => e.id === ctx.newEventId));
});

// ── 5. Валидация формы брони ──────────────────────────────────────────────

test("бронь консультации без обязательного поля agenda → 400", async () => {
  const slot = await firstSlot(SEED.consultEventId);
  const { status, body } = await api("POST", "/bookings", {
    body: {
      eventTypeId: SEED.consultEventId,
      start: slot.start,
      attendee: { name: "Клиент", email: "client@example.com", timeZone: "Europe/Moscow" },
      // bookingFieldsResponses.agenda не передан
    },
  });
  assert.equal(status, 400);
  assert.equal(body.errorCode, "missing_booking_field");
});

// ── 6. Жизненный цикл брони с подтверждением ──────────────────────────────

test("бронь консультации создаётся в статусе pending", async () => {
  const slot = await firstSlot(SEED.consultEventId);
  const { status, body } = await api("POST", "/bookings", {
    body: {
      eventTypeId: SEED.consultEventId,
      start: slot.start,
      attendee: { name: "Клиент", email: "client@example.com", timeZone: "Europe/Moscow" },
      bookingFieldsResponses: { agenda: "Обсудить дорожную карту." },
    },
  });
  assert.equal(status, 201);
  assert.equal(body.status, "pending", "событие с requiresConfirmation → pending");
  ctx.consultBookingUid = body.uid;
});

test("организатор подтверждает бронь → accepted + ссылка на встречу", async () => {
  const anon = await api("POST", `/bookings/${ctx.consultBookingUid}/confirm`);
  assert.equal(anon.status, 401, "подтверждение требует сессию");

  const { status, body } = await api("POST", `/bookings/${ctx.consultBookingUid}/confirm`, {
    cookie: ctx.cookie,
  });
  assert.equal(status, 200);
  assert.equal(body.status, "accepted");
  assert.ok(body.meetingUrl, "при подтверждении создаётся ссылка на встречу");
});

test("подтверждённую бронь переносят на другой свободный слот", async () => {
  // Берём слот, отличный от текущего времени брони.
  const { body } = await api(
    "GET",
    `/slots?eventTypeId=${SEED.consultEventId}&start=${ymd(1)}&end=${ymd(25)}`,
  );
  const current = await api("GET", `/bookings/${ctx.consultBookingUid}`);
  const target = body.slots.find((s) => s.start !== current.body.start);
  assert.ok(target, "должен найтись альтернативный слот для переноса");

  const { status, body: moved } = await api(
    "POST",
    `/bookings/${ctx.consultBookingUid}/reschedule`,
    { body: { start: target.start } },
  );
  assert.equal(status, 200);
  assert.equal(moved.start, target.start, "время брони обновилось");
  assert.equal(moved.status, "accepted", "перенос сохраняет статус");
});

test("бронь отменяют; повторная отмена → 409", async () => {
  const { status, body } = await api("POST", `/bookings/${ctx.consultBookingUid}/cancel`, {
    body: { reason: "Планы изменились" },
  });
  assert.equal(status, 200);
  assert.equal(body.status, "cancelled");
  assert.equal(body.cancellationReason, "Планы изменились");

  const again = await api("POST", `/bookings/${ctx.consultBookingUid}/cancel`, {
    body: { reason: "ещё раз" },
  });
  assert.equal(again.status, 409, "нельзя отменить уже отменённую бронь");
  assert.equal(again.body.errorCode, "invalid_state");
});

// ── 7. Выход ──────────────────────────────────────────────────────────────

test("выход завершает сессию организатора", async () => {
  const { status } = await api("POST", "/auth/logout", { cookie: ctx.cookie });
  assert.equal(status, 204);
});
