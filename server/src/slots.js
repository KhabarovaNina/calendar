// Расчёт свободных слотов для бронирования.
//
// Берём правила еженедельной доступности расписания (в его таймзоне), применяем
// переопределения дат, нарезаем интервалы на слоты нужной длины и шага, затем
// отсекаем: прошедшее время + minimumBookingNotice, окно bookingWindowDays и
// пересечения с уже существующими бронями (с учётом буферов). Для групповых
// событий (seatsPerTimeSlot) слот не убирается, а уменьшается число мест.

import { DateTime, Interval } from "luxon";

const WEEKDAY_INDEX = {
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
  sunday: 7,
};

/** Перебор дат [startDate, endDate] включительно в заданной таймзоне. */
function* eachDate(startDate, endDate, zone) {
  let d = DateTime.fromISO(startDate, { zone }).startOf("day");
  const last = DateTime.fromISO(endDate, { zone }).startOf("day");
  while (d <= last) {
    yield d;
    d = d.plus({ days: 1 });
  }
}

/**
 * @param eventType модель типа события (уже развёрнутая из БД)
 * @param schedule  расписание доступности владельца
 * @param opts { start, end, timeZone, duration, bookings }
 *   bookings — активные брони этого события (accepted|pending) для проверки пересечений
 */
export function computeSlots(eventType, schedule, opts) {
  const scheduleZone = schedule.timeZone;
  const outZone = opts.timeZone || scheduleZone;

  const slotLength = opts.duration || eventType.lengthInMinutes;
  const step = eventType.slotInterval || slotLength;
  const beforeBuf = eventType.beforeEventBuffer || 0;
  const afterBuf = eventType.afterEventBuffer || 0;

  const now = DateTime.utc();
  const earliest = now.plus({ minutes: eventType.minimumBookingNotice || 0 });
  const windowDays = eventType.bookingWindowDays ?? 60;
  const latest = now.plus({ days: windowDays });

  // Занятые интервалы (с буферами) из существующих броней.
  const busy = (opts.bookings || []).map((b) =>
    Interval.fromDateTimes(
      DateTime.fromISO(b.start, { zone: "utc" }).minus({ minutes: beforeBuf }),
      DateTime.fromISO(b.end, { zone: "utc" }).plus({ minutes: afterBuf }),
    ),
  );

  // Быстрый доступ к override по дате (YYYY-MM-DD).
  const overrides = new Map();
  for (const o of schedule.overrides || []) overrides.set(o.date, o.intervals || []);

  const seats = eventType.seatsPerTimeSlot;
  const result = [];

  for (const day of eachDate(opts.start, opts.end, scheduleZone)) {
    const isoDate = day.toFormat("yyyy-MM-dd");

    // Интервалы доступности на этот день (в таймзоне расписания).
    let intervals;
    if (overrides.has(isoDate)) {
      intervals = overrides.get(isoDate); // пустой массив = день недоступен
    } else {
      const weekdayName = Object.keys(WEEKDAY_INDEX).find(
        (k) => WEEKDAY_INDEX[k] === day.weekday,
      );
      intervals = [];
      for (const rule of schedule.availability || []) {
        if (rule.days.includes(weekdayName)) {
          intervals.push({ startTime: rule.startTime, endTime: rule.endTime });
        }
      }
    }

    for (const iv of intervals) {
      const winStart = DateTime.fromISO(`${isoDate}T${iv.startTime}`, { zone: scheduleZone });
      const winEnd = DateTime.fromISO(`${isoDate}T${iv.endTime}`, { zone: scheduleZone });

      let cursor = winStart;
      while (cursor.plus({ minutes: slotLength }) <= winEnd) {
        const slotStart = cursor.toUTC();
        const slotEnd = cursor.plus({ minutes: slotLength }).toUTC();

        const inWindow = slotStart >= earliest && slotStart <= latest;
        if (inWindow) {
          const slotIv = Interval.fromDateTimes(slotStart, slotEnd);
          const overlaps = busy.filter((b) => b.overlaps(slotIv));

          const slot = {
            start: slotStart.toISO({ suppressMilliseconds: true }),
            end: slotEnd.toISO({ suppressMilliseconds: true }),
          };
          if (seats) {
            const remaining = seats - overlaps.length;
            if (remaining > 0) result.push({ ...slot, seatsRemaining: remaining });
          } else if (overlaps.length === 0) {
            result.push(slot);
          }
        }
        cursor = cursor.plus({ minutes: step });
      }
    }
  }

  result.sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0));
  return { slots: result, timeZone: outZone };
}

/**
 * Допустима ли бронь на момент `start` длительностью `length` минут?
 * Переиспользует computeSlots: считает свободные слоты на локальный день
 * этого момента и проверяет, что запрошенное начало совпадает с реальным
 * свободным слотом. Тем самым разом покрывает: рабочие часы расписания,
 * minimumBookingNotice, окно bookingWindowDays, прошедшее время, двойное
 * бронирование и остаток мест групповых событий.
 *
 * @param opts { start (ISO UTC), length (мин), bookings (активные брони события) }
 */
export function isTimeAvailable(eventType, schedule, opts) {
  const startDt = DateTime.fromISO(opts.start, { zone: "utc" });
  if (!startDt.isValid) return false;

  const localDate = startDt.setZone(schedule.timeZone).toFormat("yyyy-MM-dd");
  const { slots } = computeSlots(eventType, schedule, {
    start: localDate,
    end: localDate,
    duration: opts.length,
    bookings: opts.bookings || [],
  });

  const target = startDt.toMillis();
  return slots.some(
    (s) => DateTime.fromISO(s.start, { zone: "utc" }).toMillis() === target,
  );
}
