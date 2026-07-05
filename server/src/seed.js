// Наполнение пустой базы демо-данными. Значения повторяют блоки @example из
// TypeSpec-спеки (api/*.tsp), чтобы поведение совпадало с прежним Prism-моком.
// Сид идемпотентен: если в users уже есть строки — ничего не делает.
//
// Демо-контент (типы событий и брони-примеры) сидируется ТОЛЬКО вне production:
// на боевом стенде (Render, NODE_ENV=production) база остаётся чистой — только
// организатор и его расписания, а типы событий и брони создаёт сам пользователь.
// Локально и в тестах демо-набор нужен (на нём держится e2e-тест booking-flow).
// Поведение можно переопределить переменной SEED_DEMO=true|false.

import { db, initSchema } from "./db.js";
import { hashPassword } from "./auth.js";

// Демо-пароль сид-пользователя `nina` (для входа через POST /auth/login).
export const SEED_PASSWORD = "password123";

const SEED_DEMO = process.env.SEED_DEMO
  ? process.env.SEED_DEMO === "true"
  : process.env.NODE_ENV !== "production";

export function seed() {
  initSchema();

  const already = db.prepare("SELECT COUNT(*) AS n FROM users").get().n;
  if (already > 0) return false;

  const now = "2026-01-15T09:00:00Z";

  const tx = db.transaction(() => {
    // ── Пользователь (nina) ──
    db.prepare(
      `INSERT INTO users (id, username, name, email, passwordHash, timeZone, locale, defaultScheduleId, createdAt)
       VALUES (@id, @username, @name, @email, @passwordHash, @timeZone, @locale, @defaultScheduleId, @createdAt)`,
    ).run({
      id: 1,
      username: "nina",
      name: "Nina",
      email: "nina@dev.com",
      passwordHash: hashPassword(SEED_PASSWORD),
      timeZone: "Europe/Moscow",
      locale: "ru",
      defaultScheduleId: 1,
      createdAt: now,
    });

    // ── Расписание «Рабочие часы» ──
    db.prepare(
      `INSERT INTO schedules (id, name, timeZone, availability, overrides, isDefault, ownerId)
       VALUES (@id, @name, @timeZone, @availability, @overrides, @isDefault, @ownerId)`,
    ).run({
      id: 1,
      name: "Рабочие часы",
      timeZone: "Europe/Moscow",
      availability: JSON.stringify([
        {
          days: ["monday", "tuesday", "wednesday", "thursday", "friday"],
          startTime: "09:00:00",
          endTime: "18:00:00",
        },
      ]),
      overrides: null,
      isDefault: 1,
      ownerId: 1,
    });

    // ── Второе расписание для наглядности ──
    db.prepare(
      `INSERT INTO schedules (id, name, timeZone, availability, overrides, isDefault, ownerId)
       VALUES (@id, @name, @timeZone, @availability, @overrides, @isDefault, @ownerId)`,
    ).run({
      id: 2,
      name: "Вечерние консультации",
      timeZone: "Europe/Moscow",
      availability: JSON.stringify([
        {
          days: ["tuesday", "thursday"],
          startTime: "18:00:00",
          endTime: "21:00:00",
        },
      ]),
      overrides: null,
      isDefault: 0,
      ownerId: 1,
    });

    // Синхронизируем автоинкремент расписаний, чтобы новые записи не
    // конфликтовали с явно заданными id сида.
    db.prepare("UPDATE sqlite_sequence SET seq = 100 WHERE name = 'schedules'").run();

    // На боевом стенде демо-контент не создаём — база остаётся чистой.
    if (!SEED_DEMO) return;

    // ── Типы событий (демо) ──
    const insertEvent = db.prepare(
      `INSERT INTO event_types (
        id, title, slug, description, lengthInMinutes, lengthInMinutesOptions, locations,
        bookingFields, hidden, requiresConfirmation, disableGuests, minimumBookingNotice,
        beforeEventBuffer, afterEventBuffer, slotInterval, seatsPerTimeSlot, bookingWindowDays,
        bookingLimits, recurrence, schedulingType, price, scheduleId, ownerId, createdAt, updatedAt
      ) VALUES (
        @id, @title, @slug, @description, @lengthInMinutes, @lengthInMinutesOptions, @locations,
        @bookingFields, @hidden, @requiresConfirmation, @disableGuests, @minimumBookingNotice,
        @beforeEventBuffer, @afterEventBuffer, @slotInterval, @seatsPerTimeSlot, @bookingWindowDays,
        @bookingLimits, @recurrence, @schedulingType, @price, @scheduleId, @ownerId, @createdAt, @updatedAt
      )`,
    );

    insertEvent.run({
      id: 1,
      title: "Интро-звонок",
      slug: "intro",
      description: "Короткое знакомство на 15 минут.",
      lengthInMinutes: 15,
      lengthInMinutesOptions: null,
      locations: JSON.stringify([{ type: "integration", integration: "google-meet" }]),
      bookingFields: null,
      hidden: 0,
      requiresConfirmation: 0,
      disableGuests: 0,
      minimumBookingNotice: 120,
      beforeEventBuffer: 0,
      afterEventBuffer: 0,
      slotInterval: null,
      seatsPerTimeSlot: null,
      bookingWindowDays: 60,
      bookingLimits: null,
      recurrence: null,
      schedulingType: "individual",
      price: null,
      scheduleId: 1,
      ownerId: 1,
      createdAt: now,
      updatedAt: now,
    });

    insertEvent.run({
      id: 2,
      title: "Консультация 30 минут",
      slug: "consult-30",
      description: "Разбор вашей задачи, 30 минут один на один.",
      lengthInMinutes: 30,
      lengthInMinutesOptions: JSON.stringify([30, 45, 60]),
      locations: JSON.stringify([{ type: "integration", integration: "zoom" }]),
      bookingFields: JSON.stringify([
        {
          type: "textarea",
          name: "agenda",
          label: "Что хотите обсудить?",
          required: true,
        },
      ]),
      hidden: 0,
      requiresConfirmation: 1,
      disableGuests: 0,
      minimumBookingNotice: 240,
      beforeEventBuffer: 10,
      afterEventBuffer: 10,
      slotInterval: null,
      seatsPerTimeSlot: null,
      bookingWindowDays: 30,
      bookingLimits: JSON.stringify({ day: 4 }),
      recurrence: null,
      schedulingType: "individual",
      price: JSON.stringify({ amount: 300000, currency: "RUB" }),
      scheduleId: 1,
      ownerId: 1,
      createdAt: now,
      updatedAt: now,
    });

    // ── Бронирования (демо) ──
    const insertBooking = db.prepare(
      `INSERT INTO bookings (
        id, uid, eventTypeId, status, title, start, end, organizerId, attendees, guests,
        location, meetingUrl, bookingFieldsResponses, cancellationReason, rejectionReason,
        createdAt, updatedAt
      ) VALUES (
        @id, @uid, @eventTypeId, @status, @title, @start, @end, @organizerId, @attendees, @guests,
        @location, @meetingUrl, @bookingFieldsResponses, @cancellationReason, @rejectionReason,
        @createdAt, @updatedAt
      )`,
    );

    // Предстоящая подтверждённая (пример из спеки)
    insertBooking.run({
      id: 101,
      uid: "bk_a1b2c3d4",
      eventTypeId: 1,
      status: "accepted",
      title: "Интро-звонок: Nina и Алексей Смирнов",
      start: "2026-07-10T10:00:00Z",
      end: "2026-07-10T10:15:00Z",
      organizerId: 1,
      attendees: JSON.stringify([
        { name: "Алексей Смирнов", email: "aleksey@example.com", timeZone: "Europe/Moscow" },
      ]),
      guests: null,
      location: JSON.stringify({ type: "integration", integration: "google-meet" }),
      meetingUrl: "https://meet.google.com/abc-defg-hij",
      bookingFieldsResponses: null,
      cancellationReason: null,
      rejectionReason: null,
      createdAt: "2026-07-01T12:00:00Z",
      updatedAt: "2026-07-01T12:00:00Z",
    });

    // Неподтверждённая (ожидает подтверждения)
    insertBooking.run({
      id: 102,
      uid: "bk_e5f6g7h8",
      eventTypeId: 2,
      status: "pending",
      title: "Консультация 30 минут: Nina и Мария Иванова",
      start: "2026-07-12T13:00:00Z",
      end: "2026-07-12T13:30:00Z",
      organizerId: 1,
      attendees: JSON.stringify([
        { name: "Мария Иванова", email: "maria@example.com", timeZone: "Europe/Moscow" },
      ]),
      guests: null,
      location: JSON.stringify({ type: "integration", integration: "zoom" }),
      meetingUrl: null,
      bookingFieldsResponses: JSON.stringify({ agenda: "Хочу обсудить карьерный переход в IT." }),
      cancellationReason: null,
      rejectionReason: null,
      createdAt: "2026-07-02T09:30:00Z",
      updatedAt: "2026-07-02T09:30:00Z",
    });

    // Прошедшая
    insertBooking.run({
      id: 103,
      uid: "bk_i9j0k1l2",
      eventTypeId: 1,
      status: "accepted",
      title: "Интро-звонок: Nina и Пётр Кузнецов",
      start: "2026-06-20T08:00:00Z",
      end: "2026-06-20T08:15:00Z",
      organizerId: 1,
      attendees: JSON.stringify([
        { name: "Пётр Кузнецов", email: "petr@example.com", timeZone: "Europe/Moscow" },
      ]),
      guests: null,
      location: JSON.stringify({ type: "integration", integration: "google-meet" }),
      meetingUrl: "https://meet.google.com/xyz-uvwx-yz",
      bookingFieldsResponses: null,
      cancellationReason: null,
      rejectionReason: null,
      createdAt: "2026-06-10T10:00:00Z",
      updatedAt: "2026-06-10T10:00:00Z",
    });

    // Отменённая
    insertBooking.run({
      id: 104,
      uid: "bk_m3n4o5p6",
      eventTypeId: 1,
      status: "cancelled",
      title: "Интро-звонок: Nina и Ольга Соколова",
      start: "2026-06-25T14:00:00Z",
      end: "2026-06-25T14:15:00Z",
      organizerId: 1,
      attendees: JSON.stringify([
        { name: "Ольга Соколова", email: "olga@example.com", timeZone: "Europe/Moscow" },
      ]),
      guests: null,
      location: JSON.stringify({ type: "integration", integration: "google-meet" }),
      meetingUrl: null,
      bookingFieldsResponses: null,
      cancellationReason: "Перенесли на следующий месяц",
      rejectionReason: null,
      createdAt: "2026-06-15T11:00:00Z",
      updatedAt: "2026-06-18T08:00:00Z",
    });

    // Синхронизируем автоинкремент, чтобы новые записи не конфликтовали с сидом.
    db.prepare("UPDATE sqlite_sequence SET seq = 1000 WHERE name = 'bookings'").run();
    db.prepare("UPDATE sqlite_sequence SET seq = 100 WHERE name = 'event_types'").run();
  });

  tx();
  return true;
}

// Позволяет запускать `node src/seed.js` вручную.
if (import.meta.url === `file://${process.argv[1]}`) {
  const created = seed();
  console.log(created ? "✓ База засеяна демо-данными" : "• База уже содержит данные, сид пропущен");
  if (created) console.log(`  Вход: nina@dev.com / ${SEED_PASSWORD}`);
}
