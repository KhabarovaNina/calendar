import "@typespec/http";

using Http;

namespace CalendarService;

// ─────────────────────────────────────────────
// Общие модели, скаляры и перечисления
// ─────────────────────────────────────────────

@error
model ApiError {
  /** HTTP-код ошибки */
  code: int32;

  /** Машиночитаемый код, например `event_type_not_found` */
  errorCode: string;

  /** Человекочитаемое описание */
  message: string;
}

/** Параметры постраничной выдачи */
model PaginationParams {
  @query
  @minValue(0)
  skip?: int32 = 0;

  @query
  @minValue(1)
  @maxValue(100)
  take?: int32 = 20;
}

model Page<T> {
  items: T[];

  /** Общее количество записей */
  @example(1)
  totalCount: int32;
}

/** IANA-таймзона, например `Europe/Moscow` */
scalar TimeZone extends string;

/** URL-слаг: строчные буквы, цифры и дефисы */
@pattern("^[a-z0-9]+(?:-[a-z0-9]+)*$")
scalar Slug extends string;

enum Weekday {
  monday,
  tuesday,
  wednesday,
  thursday,
  friday,
  saturday,
  sunday,
}
