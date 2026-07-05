// Реальный бэкенд Calendar Booking API.
// Реализует все операции из TypeSpec-спеки (api/*.tsp) поверх локальной SQLite.
// Аутентификация — серверные сессии (см. docs/adr/0001): «текущий пользователь»
// берётся из req.session.userId; организаторские маршруты защищены requireAuth.

import express from "express";
import cors from "cors";
import crypto from "node:crypto";
import session from "express-session";
import SqliteStoreFactory from "better-sqlite3-session-store";
import { DateTime } from "luxon";

import { db, initSchema } from "./db.js";
import { seed } from "./seed.js";
import {
  userToApi,
  scheduleToApi,
  eventTypeToApi,
  bookingToApi,
} from "./models.js";
import { computeSlots, isTimeAvailable } from "./slots.js";
import { verifyPassword, createOrganizer } from "./auth.js";
import { notifyBookingCreated, notifyBookingCancelled } from "./mailer.js";

// Отдельная переменная (не PORT): под dev-раннером PORT занят фронтендом Vite.
const PORT = process.env.BACKEND_PORT || 4010;

initSchema();
seed();

const app = express();
app.use(cors({ credentials: true }));
// openapi-fetch для PATCH может слать application/merge-patch+json — парсим и его.
app.use(express.json({ type: ["application/json", "application/*+json"] }));

// ── Сессии (SQLite-store в том же движке БД) ──
const SqliteStore = SqliteStoreFactory(session);
app.use(
  session({
    store: new SqliteStore({ client: db, expired: { clear: true, intervalMs: 900000 } }),
    secret: process.env.SESSION_SECRET || "calendar-dev-secret-change-me",
    resave: false,
    saveUninitialized: false,
    rolling: true, // продлеваем срок при активности
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 дней
    },
  }),
);

// ── Утилиты ──
const nowIso = () => DateTime.utc().toISO({ suppressMilliseconds: true });

function apiError(res, status, errorCode, message) {
  return res.status(status).json({ code: status, errorCode, message });
}

/** Middleware: пускает только с активной сессией организатора. */
function requireAuth(req, res, next) {
  if (!req.session.userId) {
    return apiError(res, 401, "unauthorized", "Требуется вход");
  }
  next();
}

/** Текущий пользователь из сессии (только на защищённых маршрутах). */
function currentUser(req) {
  return db.prepare("SELECT * FROM users WHERE id = ?").get(req.session.userId);
}

/** skip/take из query с валидными границами. */
function pagination(q) {
  let skip = parseInt(q.skip ?? "0", 10);
  let take = parseInt(q.take ?? "20", 10);
  if (!Number.isFinite(skip) || skip < 0) skip = 0;
  if (!Number.isFinite(take) || take < 1) take = 20;
  if (take > 100) take = 100;
  return { skip, take };
}

const genUid = () => "bk_" + crypto.randomBytes(4).toString("hex");

function meetingUrlFor(location) {
  if (!location || location.type !== "integration") return null;
  const rand = crypto.randomBytes(3).toString("hex");
  switch (location.integration) {
    case "google-meet":
      return `https://meet.google.com/${rand.slice(0, 3)}-${rand}-${rand.slice(0, 3)}`;
    case "zoom":
      return `https://zoom.us/j/${crypto.randomInt(10 ** 9, 10 ** 10)}`;
    case "ms-teams":
      return `https://teams.microsoft.com/l/meetup-join/${rand}`;
    case "daily":
      return `https://calendar.daily.co/${rand}`;
    default:
      return null;
  }
}

const bool = (v) => (v ? 1 : 0);
const jstr = (v) => (v == null ? null : JSON.stringify(v));

// ════════════════════════════════════════════════════════
//  /auth — вход, выход, регистрация (публичные)
// ════════════════════════════════════════════════════════
app.post("/auth/login", (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return apiError(res, 400, "validation_error", "Обязательны поля email и password");
  }
  const user = db.prepare("SELECT * FROM users WHERE email = ?").get(email);
  if (!user || !verifyPassword(password, user.passwordHash)) {
    return apiError(res, 401, "invalid_credentials", "Неверный email или пароль");
  }
  req.session.userId = user.id;
  res.json(userToApi(user));
});

app.post("/auth/logout", (req, res) => {
  req.session.destroy(() => {
    res.clearCookie("connect.sid");
    res.status(204).end();
  });
});

app.post("/auth/register", (req, res) => {
  const b = req.body || {};
  const { name, email, password, timeZone, username, locale } = b;
  if (!name || !email || !password || !timeZone || !username) {
    return apiError(res, 400, "validation_error", "Обязательны поля name, email, password, timeZone, username");
  }
  if (String(password).length < 8) {
    return apiError(res, 400, "weak_password", "Пароль должен быть не короче 8 символов");
  }
  if (db.prepare("SELECT id FROM users WHERE email = ?").get(email)) {
    return apiError(res, 409, "email_taken", "Пользователь с таким email уже существует");
  }
  if (db.prepare("SELECT id FROM users WHERE username = ?").get(username)) {
    return apiError(res, 409, "username_taken", `Username «${username}» уже занят`);
  }
  const user = createOrganizer({ name, email, password, timeZone, username, locale });
  req.session.userId = user.id;
  res.status(201).json(userToApi(user));
});

// ════════════════════════════════════════════════════════
//  /me
// ════════════════════════════════════════════════════════
app.get("/me", requireAuth, (req, res) => {
  res.json(userToApi(currentUser(req)));
});

app.patch("/me", requireAuth, (req, res) => {
  const u = currentUser(req);
  const b = req.body || {};
  const fields = ["username", "name", "email", "timeZone", "locale", "avatarUrl", "defaultScheduleId"];
  const updates = {};
  for (const f of fields) if (f in b) updates[f] = b[f];
  // Уникальность email/username — 409 при конфликте (как в /auth/register и ADR-0001), а не сырой SQLITE_CONSTRAINT → 400.
  if ("email" in updates && updates.email !== u.email &&
      db.prepare("SELECT id FROM users WHERE email = ? AND id != ?").get(updates.email, u.id)) {
    return apiError(res, 409, "email_taken", "Пользователь с таким email уже существует");
  }
  if ("username" in updates && updates.username !== u.username &&
      db.prepare("SELECT id FROM users WHERE username = ? AND id != ?").get(updates.username, u.id)) {
    return apiError(res, 409, "username_taken", `Username «${updates.username}» уже занят`);
  }
  if (Object.keys(updates).length) {
    const setSql = Object.keys(updates).map((k) => `${k} = @${k}`).join(", ");
    db.prepare(`UPDATE users SET ${setSql} WHERE id = @id`).run({ ...updates, id: u.id });
  }
  res.json(userToApi(currentUser(req)));
});

// ════════════════════════════════════════════════════════
//  /event-types
// ════════════════════════════════════════════════════════
app.get("/event-types", requireAuth, (req, res) => {
  const { skip, take } = pagination(req.query);
  const totalCount = db
    .prepare("SELECT COUNT(*) AS n FROM event_types WHERE ownerId = ?")
    .get(req.session.userId).n;
  const rows = db
    .prepare("SELECT * FROM event_types WHERE ownerId = ? ORDER BY id LIMIT ? OFFSET ?")
    .all(req.session.userId, take, skip);
  res.json({ items: rows.map(eventTypeToApi), totalCount });
});

app.get("/event-types/:eventTypeId", requireAuth, (req, res) => {
  const row = db
    .prepare("SELECT * FROM event_types WHERE id = ? AND ownerId = ?")
    .get(req.params.eventTypeId, req.session.userId);
  if (!row) return apiError(res, 404, "event_type_not_found", "Тип события не найден");
  res.json(eventTypeToApi(row));
});

function insertEventType(input, ownerId) {
  const ts = nowIso();
  const info = db
    .prepare(
      `INSERT INTO event_types (
        title, slug, description, lengthInMinutes, lengthInMinutesOptions, locations,
        bookingFields, hidden, requiresConfirmation, disableGuests, minimumBookingNotice,
        beforeEventBuffer, afterEventBuffer, slotInterval, seatsPerTimeSlot, bookingWindowDays,
        bookingLimits, recurrence, schedulingType, price, scheduleId, ownerId, createdAt, updatedAt
      ) VALUES (
        @title, @slug, @description, @lengthInMinutes, @lengthInMinutesOptions, @locations,
        @bookingFields, @hidden, @requiresConfirmation, @disableGuests, @minimumBookingNotice,
        @beforeEventBuffer, @afterEventBuffer, @slotInterval, @seatsPerTimeSlot, @bookingWindowDays,
        @bookingLimits, @recurrence, @schedulingType, @price, @scheduleId, @ownerId, @createdAt, @updatedAt
      )`,
    )
    .run({
      title: input.title,
      slug: input.slug,
      description: input.description ?? null,
      lengthInMinutes: input.lengthInMinutes,
      lengthInMinutesOptions: jstr(input.lengthInMinutesOptions),
      locations: jstr(input.locations ?? []),
      bookingFields: jstr(input.bookingFields),
      hidden: bool(input.hidden),
      requiresConfirmation: bool(input.requiresConfirmation),
      disableGuests: bool(input.disableGuests),
      minimumBookingNotice: input.minimumBookingNotice ?? 120,
      beforeEventBuffer: input.beforeEventBuffer ?? 0,
      afterEventBuffer: input.afterEventBuffer ?? 0,
      slotInterval: input.slotInterval ?? null,
      seatsPerTimeSlot: input.seatsPerTimeSlot ?? null,
      bookingWindowDays: input.bookingWindowDays ?? 60,
      bookingLimits: jstr(input.bookingLimits),
      recurrence: jstr(input.recurrence),
      schedulingType: input.schedulingType ?? "individual",
      price: jstr(input.price),
      scheduleId: input.scheduleId ?? null,
      ownerId,
      createdAt: ts,
      updatedAt: ts,
    });
  return db.prepare("SELECT * FROM event_types WHERE id = ?").get(info.lastInsertRowid);
}

app.post("/event-types", requireAuth, (req, res) => {
  const b = req.body || {};
  if (!b.title || !b.slug || !b.lengthInMinutes) {
    return apiError(res, 400, "validation_error", "Обязательны поля title, slug, lengthInMinutes");
  }
  const dup = db
    .prepare("SELECT id FROM event_types WHERE ownerId = ? AND slug = ?")
    .get(req.session.userId, b.slug);
  if (dup) return apiError(res, 409, "slug_conflict", `Слаг «${b.slug}» уже используется`);
  const row = insertEventType(b, req.session.userId);
  res.status(201).json(eventTypeToApi(row));
});

// Колонки event_types с JSON-сериализацией / boolean-приведением при PATCH.
const ET_JSON = new Set([
  "lengthInMinutesOptions", "locations", "bookingFields", "bookingLimits", "recurrence", "price",
]);
const ET_BOOL = new Set(["hidden", "requiresConfirmation", "disableGuests"]);
const ET_EDITABLE = new Set([
  "title", "slug", "description", "lengthInMinutes", "lengthInMinutesOptions", "locations",
  "bookingFields", "hidden", "requiresConfirmation", "disableGuests", "minimumBookingNotice",
  "beforeEventBuffer", "afterEventBuffer", "slotInterval", "seatsPerTimeSlot", "bookingWindowDays",
  "bookingLimits", "recurrence", "schedulingType", "price", "scheduleId",
]);

app.patch("/event-types/:eventTypeId", requireAuth, (req, res) => {
  const row = db
    .prepare("SELECT * FROM event_types WHERE id = ? AND ownerId = ?")
    .get(req.params.eventTypeId, req.session.userId);
  if (!row) return apiError(res, 404, "event_type_not_found", "Тип события не найден");

  const b = req.body || {};
  const updates = {};
  for (const k of Object.keys(b)) {
    if (!ET_EDITABLE.has(k)) continue;
    if (ET_JSON.has(k)) updates[k] = jstr(b[k]);
    else if (ET_BOOL.has(k)) updates[k] = bool(b[k]);
    else updates[k] = b[k];
  }
  if (b.slug && b.slug !== row.slug) {
    const dup = db
      .prepare("SELECT id FROM event_types WHERE ownerId = ? AND slug = ? AND id != ?")
      .get(req.session.userId, b.slug, row.id);
    if (dup) return apiError(res, 409, "slug_conflict", `Слаг «${b.slug}» уже используется`);
  }
  updates.updatedAt = nowIso();
  const setSql = Object.keys(updates).map((k) => `${k} = @${k}`).join(", ");
  db.prepare(`UPDATE event_types SET ${setSql} WHERE id = @id`).run({ ...updates, id: row.id });

  const fresh = db.prepare("SELECT * FROM event_types WHERE id = ?").get(row.id);
  res.json(eventTypeToApi(fresh));
});

app.delete("/event-types/:eventTypeId", requireAuth, (req, res) => {
  const row = db
    .prepare("SELECT * FROM event_types WHERE id = ? AND ownerId = ?")
    .get(req.params.eventTypeId, req.session.userId);
  if (!row) return apiError(res, 404, "event_type_not_found", "Тип события не найден");

  // Каскадно удаляем связанные брони (на них указывает внешний ключ eventTypeId).
  const tx = db.transaction(() => {
    db.prepare("DELETE FROM bookings WHERE eventTypeId = ?").run(row.id);
    db.prepare("DELETE FROM event_types WHERE id = ?").run(row.id);
  });
  tx();
  res.status(204).end();
});

app.post("/event-types/:eventTypeId/duplicate", requireAuth, (req, res) => {
  const src = db
    .prepare("SELECT * FROM event_types WHERE id = ? AND ownerId = ?")
    .get(req.params.eventTypeId, req.session.userId);
  if (!src) return apiError(res, 404, "event_type_not_found", "Тип события не найден");

  // Подбираем свободный слаг: intro-copy, intro-copy-2, …
  let slug = `${src.slug}-copy`;
  let n = 2;
  while (db.prepare("SELECT id FROM event_types WHERE ownerId = ? AND slug = ?").get(req.session.userId, slug)) {
    slug = `${src.slug}-copy-${n++}`;
  }

  const copy = eventTypeToApi(src);
  delete copy.id;
  copy.slug = slug;
  copy.title = `${src.title} (копия)`;
  const row = insertEventType(copy, req.session.userId);
  res.status(201).json(eventTypeToApi(row));
});

// ════════════════════════════════════════════════════════
//  /availability (расписания)
// ════════════════════════════════════════════════════════
app.get("/availability", requireAuth, (req, res) => {
  const { skip, take } = pagination(req.query);
  const totalCount = db
    .prepare("SELECT COUNT(*) AS n FROM schedules WHERE ownerId = ?")
    .get(req.session.userId).n;
  const rows = db
    .prepare("SELECT * FROM schedules WHERE ownerId = ? ORDER BY id LIMIT ? OFFSET ?")
    .all(req.session.userId, take, skip);
  res.json({ items: rows.map(scheduleToApi), totalCount });
});

app.get("/availability/:scheduleId", requireAuth, (req, res) => {
  const row = db
    .prepare("SELECT * FROM schedules WHERE id = ? AND ownerId = ?")
    .get(req.params.scheduleId, req.session.userId);
  if (!row) return apiError(res, 404, "schedule_not_found", "Расписание не найдено");
  res.json(scheduleToApi(row));
});

app.post("/availability", requireAuth, (req, res) => {
  const b = req.body || {};
  if (!b.name || !b.timeZone) {
    return apiError(res, 400, "validation_error", "Обязательны поля name и timeZone");
  }
  const info = db
    .prepare(
      `INSERT INTO schedules (name, timeZone, availability, overrides, isDefault, ownerId)
       VALUES (@name, @timeZone, @availability, @overrides, @isDefault, @ownerId)`,
    )
    .run({
      name: b.name,
      timeZone: b.timeZone,
      availability: jstr(b.availability ?? []),
      overrides: jstr(b.overrides),
      isDefault: bool(b.isDefault),
      ownerId: req.session.userId,
    });
  const row = db.prepare("SELECT * FROM schedules WHERE id = ?").get(info.lastInsertRowid);
  res.status(201).json(scheduleToApi(row));
});

const SCH_JSON = new Set(["availability", "overrides"]);
const SCH_EDITABLE = new Set(["name", "timeZone", "availability", "overrides", "isDefault"]);

app.patch("/availability/:scheduleId", requireAuth, (req, res) => {
  const row = db
    .prepare("SELECT * FROM schedules WHERE id = ? AND ownerId = ?")
    .get(req.params.scheduleId, req.session.userId);
  if (!row) return apiError(res, 404, "schedule_not_found", "Расписание не найдено");

  const b = req.body || {};
  const updates = {};
  for (const k of Object.keys(b)) {
    if (!SCH_EDITABLE.has(k)) continue;
    if (SCH_JSON.has(k)) updates[k] = jstr(b[k]);
    else if (k === "isDefault") updates[k] = bool(b[k]);
    else updates[k] = b[k];
  }
  if (Object.keys(updates).length) {
    const setSql = Object.keys(updates).map((k) => `${k} = @${k}`).join(", ");
    db.prepare(`UPDATE schedules SET ${setSql} WHERE id = @id`).run({ ...updates, id: row.id });
  }
  const fresh = db.prepare("SELECT * FROM schedules WHERE id = ?").get(row.id);
  res.json(scheduleToApi(fresh));
});

app.delete("/availability/:scheduleId", requireAuth, (req, res) => {
  const row = db
    .prepare("SELECT * FROM schedules WHERE id = ? AND ownerId = ?")
    .get(req.params.scheduleId, req.session.userId);
  if (!row) return apiError(res, 404, "schedule_not_found", "Расписание не найдено");
  db.prepare("DELETE FROM schedules WHERE id = ?").run(row.id);
  res.status(204).end();
});

// ════════════════════════════════════════════════════════
//  /slots (расчёт свободных времён)
// ════════════════════════════════════════════════════════
app.get("/slots", (req, res) => {
  const { eventTypeId, start, end, timeZone, duration, scheduleId: scheduleIdParam } = req.query;
  if (!eventTypeId || !start || !end) {
    return apiError(res, 400, "validation_error", "Обязательны параметры eventTypeId, start, end");
  }
  const event = db.prepare("SELECT * FROM event_types WHERE id = ?").get(eventTypeId);
  if (!event) return apiError(res, 404, "event_type_not_found", "Тип события не найдено");

  const eventApi = eventTypeToApi(event);
  // Приоритет: явно переданный scheduleId (предпросмотр) → расписание события →
  // расписание по умолчанию владельца события (публичный маршрут — сессии нет).
  const owner = db.prepare("SELECT * FROM users WHERE id = ?").get(event.ownerId);
  const scheduleId = scheduleIdParam || eventApi.scheduleId || owner?.defaultScheduleId;
  const schedRow = db.prepare("SELECT * FROM schedules WHERE id = ?").get(scheduleId);
  if (!schedRow) return apiError(res, 404, "schedule_not_found", "Расписание события не найдено");

  const activeBookings = db
    .prepare(
      "SELECT start, end FROM bookings WHERE eventTypeId = ? AND status IN ('accepted','pending')",
    )
    .all(event.id);

  const out = computeSlots(eventApi, scheduleToApi(schedRow), {
    start,
    end,
    timeZone,
    duration: duration ? parseInt(duration, 10) : undefined,
    bookings: activeBookings,
  });
  res.json(out);
});

// ════════════════════════════════════════════════════════
//  /bookings
// ════════════════════════════════════════════════════════
function bookingRowToApi(row) {
  const organizer = db.prepare("SELECT * FROM users WHERE id = ?").get(row.organizerId);
  return bookingToApi(row, organizer);
}

/** Расписание события: собственное расписание события → дефолтное владельца. */
function scheduleForEvent(eventApi, event) {
  const owner = db.prepare("SELECT * FROM users WHERE id = ?").get(event.ownerId);
  const scheduleId = eventApi.scheduleId || owner?.defaultScheduleId;
  return db.prepare("SELECT * FROM schedules WHERE id = ?").get(scheduleId);
}

/**
 * Проверить выбранную длительность. Возвращает { length } либо null,
 * если длительность недопустима (вне lengthInMinutesOptions / ≠ базовой).
 */
function resolveLength(eventApi, requested) {
  if (requested == null) return { length: eventApi.lengthInMinutes };
  const options = eventApi.lengthInMinutesOptions;
  if (options && options.length) {
    return options.includes(requested) ? { length: requested } : null;
  }
  return requested === eventApi.lengthInMinutes ? { length: requested } : null;
}

/** Имя первого незаполненного обязательного поля брони или null. */
function firstMissingField(eventApi, responses) {
  const r = responses || {};
  for (const f of eventApi.bookingFields || []) {
    if (!f.required || f.hidden) continue;
    const v = r[f.name];
    if (v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0)) {
      return f.name;
    }
  }
  return null;
}

/** Активные брони события (accepted|pending), кроме одной (для переноса). */
function activeBookingsFor(eventId, excludeUid) {
  return db
    .prepare(
      "SELECT start, end FROM bookings WHERE eventTypeId = ? AND status IN ('accepted','pending') AND uid != ?",
    )
    .all(eventId, excludeUid ?? "");
}

app.get("/bookings", requireAuth, (req, res) => {
  const { skip, take } = pagination(req.query);
  const { status, eventTypeId, afterStart, beforeEnd, attendeeEmail } = req.query;

  const where = ["b.organizerId = @owner"];
  const params = { owner: req.session.userId };
  if (status) { where.push("b.status = @status"); params.status = status; }
  if (eventTypeId) { where.push("b.eventTypeId = @eventTypeId"); params.eventTypeId = eventTypeId; }
  if (afterStart) { where.push("b.start >= @afterStart"); params.afterStart = afterStart; }
  if (beforeEnd) { where.push("b.end <= @beforeEnd"); params.beforeEnd = beforeEnd; }
  if (attendeeEmail) { where.push("b.attendees LIKE @email"); params.email = `%${attendeeEmail}%`; }

  const whereSql = where.join(" AND ");
  const totalCount = db
    .prepare(`SELECT COUNT(*) AS n FROM bookings b WHERE ${whereSql}`)
    .get(params).n;
  const rows = db
    .prepare(`SELECT * FROM bookings b WHERE ${whereSql} ORDER BY b.start DESC LIMIT @take OFFSET @skip`)
    .all({ ...params, take, skip });

  res.json({ items: rows.map(bookingRowToApi), totalCount });
});

app.get("/bookings/:bookingUid", (req, res) => {
  const row = db.prepare("SELECT * FROM bookings WHERE uid = ?").get(req.params.bookingUid);
  if (!row) return apiError(res, 404, "booking_not_found", "Бронирование не найдено");
  res.json(bookingRowToApi(row));
});

app.post("/bookings", (req, res) => {
  const b = req.body || {};
  if (!b.eventTypeId || !b.start || !b.attendee) {
    return apiError(res, 400, "validation_error", "Обязательны поля eventTypeId, start, attendee");
  }
  const event = db.prepare("SELECT * FROM event_types WHERE id = ?").get(b.eventTypeId);
  if (!event) return apiError(res, 404, "event_type_not_found", "Тип события не найдено");

  const eventApi = eventTypeToApi(event);
  const organizer = db.prepare("SELECT * FROM users WHERE id = ?").get(event.ownerId);

  const startDt = DateTime.fromISO(b.start, { zone: "utc" });
  if (!startDt.isValid) return apiError(res, 400, "validation_error", "Некорректное поле start");

  // Длительность: должна входить в lengthInMinutesOptions (или равняться базовой).
  const lengthResult = resolveLength(eventApi, b.lengthInMinutes);
  if (!lengthResult) {
    return apiError(res, 400, "invalid_length", "Недопустимая длительность встречи");
  }
  const { length } = lengthResult;

  // Гости запрещены при disableGuests.
  if (eventApi.disableGuests && Array.isArray(b.guests) && b.guests.length > 0) {
    return apiError(res, 400, "guests_not_allowed", "Гости для этого события запрещены");
  }

  // Обязательные поля формы бронирования.
  const missing = firstMissingField(eventApi, b.bookingFieldsResponses);
  if (missing) {
    return apiError(res, 400, "missing_booking_field", `Не заполнено обязательное поле «${missing}»`);
  }

  // Ключевая проверка: запрошенное время — реальный свободный слот
  // (рабочие часы, minimumBookingNotice, окно, прошлое, двойная бронь, места).
  const schedRow = scheduleForEvent(eventApi, event);
  if (!schedRow) return apiError(res, 404, "schedule_not_found", "Расписание события не найдено");
  const available = isTimeAvailable(eventApi, scheduleToApi(schedRow), {
    start: b.start,
    length,
    bookings: activeBookingsFor(event.id),
  });
  if (!available) {
    return apiError(res, 409, "slot_unavailable", "Выбранное время недоступно для бронирования");
  }

  const endDt = startDt.plus({ minutes: length });

  const location = b.location || eventApi.locations?.[0] || { type: "attendeeDefined" };
  const status = eventApi.requiresConfirmation ? "pending" : "accepted";
  const meetingUrl = status === "accepted" ? meetingUrlFor(location) : null;
  const ts = nowIso();
  const uid = genUid();
  const title = `${eventApi.title}: ${organizer.name} и ${b.attendee.name}`;

  const info = db
    .prepare(
      `INSERT INTO bookings (
        uid, eventTypeId, status, title, start, end, organizerId, attendees, guests,
        location, meetingUrl, bookingFieldsResponses, createdAt, updatedAt
      ) VALUES (
        @uid, @eventTypeId, @status, @title, @start, @end, @organizerId, @attendees, @guests,
        @location, @meetingUrl, @bookingFieldsResponses, @createdAt, @updatedAt
      )`,
    )
    .run({
      uid,
      eventTypeId: event.id,
      status,
      title,
      start: startDt.toISO({ suppressMilliseconds: true }),
      end: endDt.toISO({ suppressMilliseconds: true }),
      organizerId: organizer.id,
      attendees: jstr([b.attendee]),
      guests: jstr(b.guests),
      location: jstr(location),
      meetingUrl,
      bookingFieldsResponses: jstr(b.bookingFieldsResponses),
      createdAt: ts,
      updatedAt: ts,
    });

  const row = db.prepare("SELECT * FROM bookings WHERE id = ?").get(info.lastInsertRowid);
  const api = bookingRowToApi(row);
  // Уведомления шлём после успешной записи, не блокируя ответ.
  notifyBookingCreated(api).catch(() => {});
  res.status(201).json(api);
});

/** Общий помощник: найти бронь или вернуть 404. */
function findBooking(res, uid) {
  const row = db.prepare("SELECT * FROM bookings WHERE uid = ?").get(uid);
  if (!row) {
    apiError(res, 404, "booking_not_found", "Бронирование не найдено");
    return null;
  }
  return row;
}

app.post("/bookings/:bookingUid/cancel", (req, res) => {
  const row = findBooking(res, req.params.bookingUid);
  if (!row) return;
  // Уже завершённую бронь не отменяем повторно (не «тихий» перевод).
  if (row.status === "cancelled" || row.status === "rejected") {
    return apiError(res, 409, "invalid_state", `Бронь уже в статусе ${row.status}`);
  }
  db.prepare(
    "UPDATE bookings SET status = 'cancelled', cancellationReason = @reason, updatedAt = @ts WHERE id = @id",
  ).run({ reason: req.body?.reason ?? null, ts: nowIso(), id: row.id });
  const api = bookingRowToApi(db.prepare("SELECT * FROM bookings WHERE id = ?").get(row.id));
  notifyBookingCancelled(api).catch(() => {});
  res.json(api);
});

app.post("/bookings/:bookingUid/reject", requireAuth, (req, res) => {
  const row = findBooking(res, req.params.bookingUid);
  if (!row) return;
  // Чужая бронь не должна раскрываться существованием → 404.
  if (row.organizerId !== req.session.userId) {
    return apiError(res, 404, "booking_not_found", "Бронирование не найдено");
  }
  db.prepare(
    "UPDATE bookings SET status = 'rejected', rejectionReason = @reason, updatedAt = @ts WHERE id = @id",
  ).run({ reason: req.body?.reason ?? null, ts: nowIso(), id: row.id });
  res.json(bookingRowToApi(db.prepare("SELECT * FROM bookings WHERE id = ?").get(row.id)));
});

app.post("/bookings/:bookingUid/confirm", requireAuth, (req, res) => {
  const row = findBooking(res, req.params.bookingUid);
  if (!row) return;
  if (row.organizerId !== req.session.userId) {
    return apiError(res, 404, "booking_not_found", "Бронирование не найдено");
  }
  if (row.status !== "pending") {
    return apiError(res, 409, "invalid_state", "Подтвердить можно только бронь в статусе pending");
  }
  const location = row.location ? JSON.parse(row.location) : null;
  const meetingUrl = row.meetingUrl || meetingUrlFor(location);
  db.prepare(
    "UPDATE bookings SET status = 'accepted', meetingUrl = @url, updatedAt = @ts WHERE id = @id",
  ).run({ url: meetingUrl, ts: nowIso(), id: row.id });
  res.json(bookingRowToApi(db.prepare("SELECT * FROM bookings WHERE id = ?").get(row.id)));
});

app.post("/bookings/:bookingUid/reschedule", (req, res) => {
  const row = findBooking(res, req.params.bookingUid);
  if (!row) return;
  // Переносить можно только активную бронь.
  if (row.status === "cancelled" || row.status === "rejected") {
    return apiError(res, 409, "invalid_state", `Нельзя перенести бронь в статусе ${row.status}`);
  }
  const b = req.body || {};
  if (!b.start) return apiError(res, 400, "validation_error", "Обязательно поле start");
  const startDt = DateTime.fromISO(b.start, { zone: "utc" });
  if (!startDt.isValid) return apiError(res, 400, "validation_error", "Некорректное поле start");

  const event = db.prepare("SELECT * FROM event_types WHERE id = ?").get(row.eventTypeId);
  const prevStart = DateTime.fromISO(row.start, { zone: "utc" });
  const prevEnd = DateTime.fromISO(row.end, { zone: "utc" });
  const length = event ? event.lengthInMinutes : prevEnd.diff(prevStart, "minutes").minutes;

  // Новое время проходит ту же проверку, что и создание брони (исключая саму бронь).
  if (event) {
    const eventApi = eventTypeToApi(event);
    const schedRow = scheduleForEvent(eventApi, event);
    if (!schedRow) return apiError(res, 404, "schedule_not_found", "Расписание события не найдено");
    const available = isTimeAvailable(eventApi, scheduleToApi(schedRow), {
      start: b.start,
      length,
      bookings: activeBookingsFor(event.id, row.uid),
    });
    if (!available) {
      return apiError(res, 409, "slot_unavailable", "Новое время недоступно для бронирования");
    }
  }

  const endDt = startDt.plus({ minutes: length });

  // Перенос сохраняет статус брони; в модели нет поля причины переноса,
  // поэтому reason в запросе используется только как метка (не сохраняем).
  db.prepare(
    `UPDATE bookings SET start = @start, end = @end, updatedAt = @ts WHERE id = @id`,
  ).run({
    start: startDt.toISO({ suppressMilliseconds: true }),
    end: endDt.toISO({ suppressMilliseconds: true }),
    ts: nowIso(),
    id: row.id,
  });
  res.json(bookingRowToApi(db.prepare("SELECT * FROM bookings WHERE id = ?").get(row.id)));
});

// ════════════════════════════════════════════════════════
//  /public — данные организатора для страницы бронирования (без сессии)
// ════════════════════════════════════════════════════════
/** Публичный профиль: без приватных полей (email, passwordHash). */
function organizerToPublicApi(user, eventTypes) {
  return {
    id: user.id,
    username: user.username,
    name: user.name,
    timeZone: user.timeZone,
    avatarUrl: user.avatarUrl ?? undefined,
    eventTypes,
  };
}

app.get("/public/:username", (req, res) => {
  const user = db.prepare("SELECT * FROM users WHERE username = ?").get(req.params.username);
  if (!user) return apiError(res, 404, "user_not_found", "Организатор не найден");
  const events = db
    .prepare("SELECT * FROM event_types WHERE ownerId = ? AND hidden = 0 ORDER BY id")
    .all(user.id);
  res.json(organizerToPublicApi(user, events.map(eventTypeToApi)));
});

app.get("/public/:username/:slug", (req, res) => {
  const user = db.prepare("SELECT * FROM users WHERE username = ?").get(req.params.username);
  // Скрытое или несуществующее событие неотличимо → 404, не раскрываем.
  if (!user) return apiError(res, 404, "event_type_not_found", "Тип события не найдено");
  const event = db
    .prepare("SELECT * FROM event_types WHERE ownerId = ? AND slug = ? AND hidden = 0")
    .get(user.id, req.params.slug);
  if (!event) return apiError(res, 404, "event_type_not_found", "Тип события не найдено");
  res.json(eventTypeToApi(event));
});

// ── 404 для неизвестных путей ──
app.use((req, res) => apiError(res, 404, "not_found", `Маршрут ${req.method} ${req.path} не найден`));

// ── Обработчик ошибок (например, битый JSON) ──
app.use((err, req, res, next) => {
  console.error(err);
  apiError(res, 400, "bad_request", err.message || "Некорректный запрос");
});

app.listen(PORT, () => {
  console.log(`✓ Calendar backend слушает http://localhost:${PORT}`);
});
