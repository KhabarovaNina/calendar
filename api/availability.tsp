import "@typespec/http";
import "../common.tsp";

using Http;

namespace CalendarService;

// ─────────────────────────────────────────────
// Блок /availability — расписания доступности
// ─────────────────────────────────────────────

/** Интервал доступности в конкретные дни недели */
model AvailabilityRule {
  /** Дни недели, к которым применяется интервал */
  days: Weekday[];

  /** Начало интервала (локальное время расписания), например 09:00 */
  startTime: plainTime;

  /** Конец интервала, например 18:00 */
  endTime: plainTime;
}

/** Переопределение доступности на конкретную дату */
model DateOverride {
  date: plainDate;

  /** Интервалы доступности в эту дату; пустой массив — день недоступен */
  intervals: {
    startTime: plainTime;
    endTime: plainTime;
  }[];
}

/** Расписание доступности организатора */
@example(#{
  id: 1,
  name: "Рабочие часы",
  timeZone: "Europe/Moscow",
  availability: #[
    #{
      days: #[Weekday.monday, Weekday.tuesday, Weekday.wednesday, Weekday.thursday, Weekday.friday],
      startTime: plainTime.fromISO("09:00:00"),
      endTime: plainTime.fromISO("18:00:00"),
    }
  ],
  isDefault: true,
  ownerId: 1,
})
model Schedule {
  @visibility(Lifecycle.Read)
  id: int64;

  /** Название, например «Рабочие часы» */
  @minLength(1)
  @maxLength(255)
  name: string;

  timeZone: TimeZone;

  /** Правила еженедельной доступности */
  availability: AvailabilityRule[];

  /** Переопределения на конкретные даты */
  overrides?: DateOverride[];

  /** Использовать как расписание по умолчанию */
  isDefault: boolean = false;

  @visibility(Lifecycle.Read)
  ownerId: int64;
}

@route("/availability")
@tag("Availability")
interface Availability {
  /** Список расписаний текущего пользователя */
  @get list(...PaginationParams): Page<Schedule> | ApiError;

  /** Получить расписание */
  @get get(@path scheduleId: int64): Schedule | ApiError;

  /** Создать расписание */
  @post create(@body body: Schedule): {
    @statusCode statusCode: 201;
    @body body: Schedule;
  } | ApiError;

  /** Частично обновить расписание */
  @patch update(
    @path scheduleId: int64,
    @body body: MergePatchUpdate<Schedule>,
  ): Schedule | ApiError;

  /** Удалить расписание */
  @delete delete(@path scheduleId: int64): {
    @statusCode statusCode: 204;
  } | ApiError;
}
