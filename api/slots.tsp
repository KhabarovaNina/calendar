import "@typespec/http";
import "../common.tsp";

using Http;

namespace CalendarService;

// ─────────────────────────────────────────────
// Блок /slots — расчёт доступных времён для бронирования
// ─────────────────────────────────────────────

/** Свободный слот для бронирования */
model Slot {
  /** Начало доступного слота */
  start: utcDateTime;

  /** Конец слота */
  end: utcDateTime;

  /** Осталось мест — только для групповых событий с `seatsPerTimeSlot` */
  seatsRemaining?: int32;
}

/** Доступные слоты в запрошенном диапазоне, отсортированы по времени начала */
@example(#{
  timeZone: "Europe/Moscow",
  slots: #[
    #{
      start: utcDateTime.fromISO("2026-07-10T09:00:00Z"),
      end: utcDateTime.fromISO("2026-07-10T09:15:00Z"),
    },
    #{
      start: utcDateTime.fromISO("2026-07-10T09:15:00Z"),
      end: utcDateTime.fromISO("2026-07-10T09:30:00Z"),
    },
    #{
      start: utcDateTime.fromISO("2026-07-11T12:00:00Z"),
      end: utcDateTime.fromISO("2026-07-11T12:15:00Z"),
      seatsRemaining: 3,
    },
  ],
})
model SlotsResponse {
  /** Свободные слоты; время в UTC, группировать по дате можно на клиенте */
  slots: Slot[];

  /** Таймзона, в которой рассчитаны слоты (совпадает с запрошенной) */
  timeZone: TimeZone;
}

@route("/slots")
@tag("Slots")
interface Slots {
  /**
   * Рассчитать доступные времена для бронирования события.
   * Публичный эндпоинт страницы бронирования.
   * @param eventTypeId Тип события, для которого считаются слоты
   * @param start Начало диапазона (дата включительно)
   * @param end Конец диапазона (дата включительно)
   * @param timeZone Таймзона участника; по умолчанию — таймзона расписания
   * @param duration Выбранная длительность в минутах для событий с `lengthInMinutesOptions`
   * @param scheduleId Переопределить расписание доступности (для предпросмотра при
   * редактировании типа события); по умолчанию — расписание события
   */
  @get list(
    @query eventTypeId: int64,
    @query start: plainDate,
    @query end: plainDate,
    @query timeZone?: TimeZone,
    @query duration?: int32,
    @query scheduleId?: int64,
  ): SlotsResponse | ApiError;
}
