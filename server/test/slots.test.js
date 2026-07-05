// UNIT-тесты чистой логики расчёта слотов (src/slots.js).
//
// В отличие от эталонного booking-flow.test.js (интеграционный e2e через HTTP),
// здесь мы проверяем ДВЕ экспортируемые чистые функции напрямую — без сервера и
// без БД. Это сеймы (публичные границы) модуля:
//
//   computeSlots(eventType, schedule, opts)  — нарезка свободных Slot из правил
//                                              Availability расписания;
//   isTimeAvailable(eventType, schedule, opts) — допустима ли бронь на момент.
//
// Ожидаемые значения берём из НЕЗАВИСИМЫХ фактов, а не пересчётом той же формулой:
//   • Europe/Moscow = UTC+3 круглый год (в РФ нет перехода на летнее время),
//     поэтому 09:00 по Москве всегда = 06:00:00Z;
//   • арифметика слотов посчитана вручную в комментариях к каждому кейсу.
//
// computeSlots зависит от «сейчас» (DateTime.utc()) для minimumBookingNotice,
// окна bookingWindowDays и отсечения прошлого. Инъекции времени нет, поэтому
// тестовые даты строим ОТНОСИТЕЛЬНО текущего момента (на N дней вперёд) — так
// тесты не «протухают» со временем. День берём вместе с его днём недели и под
// него же формируем правило доступности, чтобы правило гарантированно применялось.
//
// Запуск:  cd server && node --test   (или npm test)

import { test } from "node:test";
import assert from "node:assert/strict";
import { DateTime } from "luxon";

import { computeSlots, isTimeAvailable } from "../src/slots.js";

const ZONE = "Europe/Moscow"; // UTC+3, без DST — независимый факт для ожиданий.

const WEEKDAY_NAME = {
  1: "monday",
  2: "tuesday",
  3: "wednesday",
  4: "thursday",
  5: "friday",
  6: "saturday",
  7: "sunday",
};

/**
 * Календарный день на `daysAhead` дней вперёд (в таймзоне расписания) вместе с
 * его именем дня недели. Возвращает { date: "YYYY-MM-DD", weekday, next }.
 * `next` — имя СЛЕДУЮЩЕГО дня недели (для кейса «правило не на этот день»).
 */
function dayFixture(daysAhead) {
  const day = DateTime.utc().plus({ days: daysAhead }).setZone(ZONE).startOf("day");
  return {
    date: day.toFormat("yyyy-MM-dd"),
    weekday: WEEKDAY_NAME[day.weekday],
    next: WEEKDAY_NAME[(day.weekday % 7) + 1],
  };
}

/**
 * UTC-ISO настенного времени по Москве на дату `date`.
 * Москва = UTC+3 (независимый факт), поэтому час UTC = hh - 3. Формат "…Z"
 * подтверждён поведением luxon. Используем только для hh ≥ 9 (uh ≥ 6, без
 * перехода через полночь).
 */
function utcOf(date, hh, mm = 0) {
  const uh = String(hh - 3).padStart(2, "0");
  const um = String(mm).padStart(2, "0");
  return `${date}T${uh}:${um}:00Z`;
}

/** Тип события с разумными нейтральными значениями (переопределяемыми). */
function makeEventType(over = {}) {
  return {
    lengthInMinutes: 60,
    slotInterval: null,
    beforeEventBuffer: 0,
    afterEventBuffer: 0,
    minimumBookingNotice: 0,
    bookingWindowDays: 60,
    seatsPerTimeSlot: null,
    ...over,
  };
}

/** Расписание с одним недельным правилом на указанный день недели. */
function makeSchedule(weekday, over = {}) {
  return {
    timeZone: ZONE,
    availability: [{ days: [weekday], startTime: "09:00:00", endTime: "12:00:00" }],
    overrides: [],
    ...over,
  };
}

// ── Базовая нарезка ────────────────────────────────────────────────────────

test("окно 09:00–12:00 при 60-минутном событии даёт слоты 09:00, 10:00, 11:00", () => {
  const { date, weekday } = dayFixture(14);
  const { slots } = computeSlots(makeEventType(), makeSchedule(weekday), {
    start: date,
    end: date,
  });

  // 12:00 не входит: слот 11:00–12:00 — последний, помещающийся в окно.
  assert.deepEqual(slots, [
    { start: utcOf(date, 9), end: utcOf(date, 10) },
    { start: utcOf(date, 10), end: utcOf(date, 11) },
    { start: utcOf(date, 11), end: utcOf(date, 12) },
  ]);
});

test("slotInterval=30 даёт перекрывающиеся старты 09:00, 09:30 … 11:00", () => {
  const { date, weekday } = dayFixture(14);
  const { slots } = computeSlots(makeEventType({ slotInterval: 30 }), makeSchedule(weekday), {
    start: date,
    end: date,
  });

  // Шаг 30 мин, длина 60 мин. Последний влезающий старт — 11:00 (→ 12:00).
  assert.deepEqual(
    slots.map((s) => s.start),
    [utcOf(date, 9), utcOf(date, 9, 30), utcOf(date, 10), utcOf(date, 10, 30), utcOf(date, 11)],
  );
});

test("частичный слот в конце окна не выдаётся", () => {
  const { date, weekday } = dayFixture(14);
  const schedule = makeSchedule(weekday, {
    availability: [{ days: [weekday], startTime: "09:00:00", endTime: "10:30:00" }],
  });
  const { slots } = computeSlots(makeEventType(), schedule, { start: date, end: date });

  // 60-минутный слот 10:00–11:00 вышел бы за 10:30 — остаётся только 09:00.
  assert.deepEqual(
    slots.map((s) => s.start),
    [utcOf(date, 9)],
  );
});

test("duration в opts переопределяет lengthInMinutes события", () => {
  const { date, weekday } = dayFixture(14);
  const schedule = makeSchedule(weekday, {
    availability: [{ days: [weekday], startTime: "09:00:00", endTime: "10:00:00" }],
  });
  const { slots } = computeSlots(makeEventType({ lengthInMinutes: 60 }), schedule, {
    start: date,
    end: date,
    duration: 30,
  });

  // При duration=30 в окне 09:00–10:00 помещаются два слота.
  assert.deepEqual(slots, [
    { start: utcOf(date, 9), end: utcOf(date, 9, 30) },
    { start: utcOf(date, 9, 30), end: utcOf(date, 10) },
  ]);
});

// ── Дни недели и переопределения дат ─────────────────────────────────────────

test("если правило не покрывает этот день недели — слотов нет", () => {
  const { date, next } = dayFixture(14);
  const { slots } = computeSlots(makeEventType(), makeSchedule(next), {
    start: date,
    end: date,
  });
  assert.deepEqual(slots, []);
});

test("override с пустым списком интервалов делает день недоступным", () => {
  const { date, weekday } = dayFixture(14);
  const schedule = makeSchedule(weekday, { overrides: [{ date, intervals: [] }] });
  const { slots } = computeSlots(makeEventType(), schedule, { start: date, end: date });

  // Правило на этот день недели есть, но override его перекрывает пустотой.
  assert.deepEqual(slots, []);
});

test("override со своим интервалом заменяет недельное правило", () => {
  const { date, weekday } = dayFixture(14);
  const schedule = makeSchedule(weekday, {
    overrides: [{ date, intervals: [{ startTime: "14:00:00", endTime: "15:00:00" }] }],
  });
  const { slots } = computeSlots(makeEventType(), schedule, { start: date, end: date });

  // Ни один слот 09:00–12:00 не выдаётся — только окно override 14:00–15:00.
  assert.deepEqual(slots, [{ start: utcOf(date, 14), end: utcOf(date, 15) }]);
});

// ── Таймзона вывода ──────────────────────────────────────────────────────────

test("timeZone результата: по умолчанию зона расписания, иначе opts.timeZone", () => {
  const { date, weekday } = dayFixture(14);
  const et = makeEventType();
  const sch = makeSchedule(weekday);

  const def = computeSlots(et, sch, { start: date, end: date });
  assert.equal(def.timeZone, ZONE);

  const explicit = computeSlots(et, sch, { start: date, end: date, timeZone: "Asia/Tokyo" });
  assert.equal(explicit.timeZone, "Asia/Tokyo");
  // Значения самих слотов остаются в UTC независимо от зоны вывода.
  assert.equal(explicit.slots[0].start, utcOf(date, 9));
});

// ── Пересечения с существующими бронями ──────────────────────────────────────

test("бронь на 10:00–11:00 убирает только пересекающийся слот", () => {
  const { date, weekday } = dayFixture(14);
  const bookings = [{ start: utcOf(date, 10), end: utcOf(date, 11) }];
  const { slots } = computeSlots(makeEventType(), makeSchedule(weekday), {
    start: date,
    end: date,
    bookings,
  });

  assert.deepEqual(
    slots.map((s) => s.start),
    [utcOf(date, 9), utcOf(date, 11)],
  );
});

test("буферы расширяют занятость и блокируют соседние слоты", () => {
  const { date, weekday } = dayFixture(14);
  // Окно 09:00–13:00 → слоты 09,10,11,12. Бронь 10:00–11:00.
  const schedule = makeSchedule(weekday, {
    availability: [{ days: [weekday], startTime: "09:00:00", endTime: "13:00:00" }],
  });
  const bookings = [{ start: utcOf(date, 10), end: utcOf(date, 11) }];

  // Без буферов занята только 10:00 → остаются 09:00, 11:00, 12:00.
  const noBuf = computeSlots(makeEventType(), schedule, { start: date, end: date, bookings });
  assert.deepEqual(
    noBuf.slots.map((s) => s.start),
    [utcOf(date, 9), utcOf(date, 11), utcOf(date, 12)],
  );

  // С буферами 10 мин занятость 09:50–11:10 задевает слоты 09:00 (кончается
  // в 10:00 > 09:50) и 11:00 (начинается в 11:00 < 11:10). Свободен только 12:00.
  const withBuf = computeSlots(
    makeEventType({ beforeEventBuffer: 10, afterEventBuffer: 10 }),
    schedule,
    { start: date, end: date, bookings },
  );
  assert.deepEqual(
    withBuf.slots.map((s) => s.start),
    [utcOf(date, 12)],
  );
});

// ── Групповые события (seatsPerTimeSlot) ─────────────────────────────────────

test("групповой слот не исчезает, а уменьшает число свободных мест", () => {
  const { date, weekday } = dayFixture(14);
  const schedule = makeSchedule(weekday, {
    availability: [{ days: [weekday], startTime: "09:00:00", endTime: "10:00:00" }],
  });
  const et = makeEventType({ seatsPerTimeSlot: 3 });
  const bookings = [{ start: utcOf(date, 9), end: utcOf(date, 10) }];

  const { slots } = computeSlots(et, schedule, { start: date, end: date, bookings });
  assert.deepEqual(slots, [
    { start: utcOf(date, 9), end: utcOf(date, 10), seatsRemaining: 2 },
  ]);
});

test("групповой слот исчезает, когда все места заняты", () => {
  const { date, weekday } = dayFixture(14);
  const schedule = makeSchedule(weekday, {
    availability: [{ days: [weekday], startTime: "09:00:00", endTime: "10:00:00" }],
  });
  const et = makeEventType({ seatsPerTimeSlot: 2 });
  const bookings = [
    { start: utcOf(date, 9), end: utcOf(date, 10) },
    { start: utcOf(date, 9), end: utcOf(date, 10) },
  ];

  const { slots } = computeSlots(et, schedule, { start: date, end: date, bookings });
  assert.deepEqual(slots, []);
});

// ── Окна времени (зависят от «сейчас») ───────────────────────────────────────

test("minimumBookingNotice отсекает слишком близкие слоты", () => {
  const { date, weekday } = dayFixture(3);
  const sch = makeSchedule(weekday);

  const open = computeSlots(makeEventType({ minimumBookingNotice: 0 }), sch, {
    start: date,
    end: date,
  });
  assert.ok(open.slots.length > 0, "без запаса слоты через 3 дня доступны");

  // Запас в год отсекает всё в пределах ближайших дней.
  const blocked = computeSlots(makeEventType({ minimumBookingNotice: 60 * 24 * 365 }), sch, {
    start: date,
    end: date,
  });
  assert.equal(blocked.slots.length, 0);
});

test("bookingWindowDays отсекает слоты за пределами окна бронирования", () => {
  const { date, weekday } = dayFixture(40);
  const sch = makeSchedule(weekday);

  const inside = computeSlots(makeEventType({ bookingWindowDays: 60 }), sch, {
    start: date,
    end: date,
  });
  assert.ok(inside.slots.length > 0, "40 дней попадает в окно 60 дней");

  const outside = computeSlots(makeEventType({ bookingWindowDays: 7 }), sch, {
    start: date,
    end: date,
  });
  assert.equal(outside.slots.length, 0, "40 дней за пределами окна 7 дней");
});

// ── isTimeAvailable ──────────────────────────────────────────────────────────

test("isTimeAvailable: свободный слот на границе → true", () => {
  const { date, weekday } = dayFixture(14);
  const ok = isTimeAvailable(makeEventType(), makeSchedule(weekday), {
    start: utcOf(date, 9),
    length: 60,
  });
  assert.equal(ok, true);
});

test("isTimeAvailable: момент не на границе слота → false", () => {
  const { date, weekday } = dayFixture(14);
  const ok = isTimeAvailable(makeEventType(), makeSchedule(weekday), {
    start: utcOf(date, 9, 15), // 09:15 — не кратно шагу слота
    length: 60,
  });
  assert.equal(ok, false);
});

test("isTimeAvailable: момент занят существующей бронью → false", () => {
  const { date, weekday } = dayFixture(14);
  const ok = isTimeAvailable(makeEventType(), makeSchedule(weekday), {
    start: utcOf(date, 9),
    length: 60,
    bookings: [{ start: utcOf(date, 9), end: utcOf(date, 10) }],
  });
  assert.equal(ok, false);
});

test("isTimeAvailable: некорректная ISO-дата → false", () => {
  const { weekday } = dayFixture(14);
  const ok = isTimeAvailable(makeEventType(), makeSchedule(weekday), {
    start: "не-дата",
    length: 60,
  });
  assert.equal(ok, false);
});
