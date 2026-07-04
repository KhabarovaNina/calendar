import "@typespec/http";
import "../common.tsp";

using Http;

namespace CalendarService;

// ─────────────────────────────────────────────
// Блок /event-types — типы событий
// ─────────────────────────────────────────────

/** Способ проведения встречи */
@discriminated(#{ envelope: "none", discriminatorPropertyName: "type" })
union EventLocation {
  address: AddressLocation,
  link: LinkLocation,
  phone: PhoneLocation,
  integration: IntegrationLocation,
  attendeeDefined: AttendeeDefinedLocation,
}

/** Личная встреча по адресу */
model AddressLocation {
  type: "address";
  address: string;

  /** Показывать адрес только после подтверждения брони */
  displayPublicly?: boolean = true;
}

/** Встреча по произвольной ссылке */
model LinkLocation {
  type: "link";
  link: url;
}

/** Телефонный звонок: организатор звонит участнику */
model PhoneLocation {
  type: "phone";

  /** Номер организатора; если не задан — берётся номер участника */
  phone?: string;
}

/** Видеовстреча через интеграцию */
model IntegrationLocation {
  type: "integration";
  integration: "google-meet" | "zoom" | "ms-teams" | "daily";
}

/** Участник сам выбирает место при бронировании */
model AttendeeDefinedLocation {
  type: "attendeeDefined";
}

enum BookingFieldType {
  text,
  textarea,
  number,
  email,
  phone,
  select,
  multiselect,
  checkbox,
  radio,
  boolean,
}

/** Дополнительное поле формы бронирования */
model BookingField {
  type: BookingFieldType;

  /** Ключ поля в ответах участника */
  name: Slug;

  /** Подпись поля в форме */
  label: string;

  required: boolean = false;

  placeholder?: string;

  /** Варианты для select / multiselect / radio */
  options?: string[];

  /** Скрытое поле, заполняется через query-параметры ссылки */
  hidden?: boolean = false;
}

/** Как распределяются брони между участниками команды */
enum SchedulingType {
  /** Один организатор */
  individual,

  /** Все участники команды присутствуют на встрече */
  collective,

  /** Бронь достаётся наименее загруженному участнику */
  roundRobin,
}

/** Периодичность повторяющегося события */
model Recurrence {
  frequency: "daily" | "weekly" | "monthly";

  /** Интервал повторения: каждые N периодов */
  @minValue(1)
  interval: int32 = 1;

  /** Максимальное число повторений */
  @minValue(1)
  @maxValue(730)
  count: int32;
}

/** Ограничение плотности бронирований */
model BookingLimits {
  /** Максимум броней в день */
  day?: int32;

  /** Максимум броней в неделю */
  week?: int32;

  /** Максимум броней в месяц */
  month?: int32;

  /** Максимум броней в год */
  year?: int32;
}

/** Оплата за бронирование */
model EventPrice {
  /** Сумма в минимальных единицах валюты (копейки, центы) */
  @minValue(0)
  amount: int64;

  /** Код валюты ISO 4217, например `RUB`, `USD` */
  @pattern("^[A-Z]{3}$")
  currency: string;
}

/** Тип события — то, что участники могут забронировать */
model EventType {
  @visibility(Lifecycle.Read)
  id: int64;

  /** Название, например «Интро-звонок 30 минут» */
  @minLength(1)
  @maxLength(255)
  title: string;

  /** Слаг в ссылке бронирования: /{username}/{slug} */
  slug: Slug;

  /** Описание, показывается на странице бронирования (поддерживает Markdown) */
  description?: string;

  /** Длительность встречи в минутах */
  @minValue(1)
  @maxValue(1440)
  lengthInMinutes: int32;

  /** Альтернативные длительности, из которых выбирает участник */
  lengthInMinutesOptions?: int32[];

  /** Где проходит встреча; участник выбирает один из вариантов */
  locations: EventLocation[];

  /** Дополнительные поля формы бронирования */
  bookingFields?: BookingField[];

  /** Скрыть событие с публичной страницы профиля */
  hidden: boolean = false;

  /** Требуется ручное подтверждение брони организатором */
  requiresConfirmation: boolean = false;

  /** Запретить участнику добавлять гостей */
  disableGuests: boolean = false;

  /** Минимальный интервал до начала встречи, за который можно бронировать (в минутах) */
  @minValue(0)
  minimumBookingNotice: int32 = 120;

  /** Буфер до встречи в минутах */
  @minValue(0)
  beforeEventBuffer: int32 = 0;

  /** Буфер после встречи в минутах */
  @minValue(0)
  afterEventBuffer: int32 = 0;

  /** Шаг сетки слотов в минутах; по умолчанию равен длительности */
  slotInterval?: int32;

  /** Количество мест в одном слоте (групповые события) */
  @minValue(1)
  seatsPerTimeSlot?: int32;

  /** На сколько дней вперёд открыто бронирование */
  @minValue(1)
  bookingWindowDays?: int32 = 60;

  /** Лимиты на количество броней */
  bookingLimits?: BookingLimits;

  /** Настройки повторяющегося события */
  recurrence?: Recurrence;

  /** Тип распределения для командных событий */
  schedulingType: SchedulingType = SchedulingType.individual;

  /** Платное событие */
  price?: EventPrice;

  /** Расписание доступности; если не задано — расписание владельца по умолчанию */
  scheduleId?: int64;

  /** Владелец события */
  @visibility(Lifecycle.Read)
  ownerId: int64;

  @visibility(Lifecycle.Read)
  createdAt: utcDateTime;

  @visibility(Lifecycle.Read)
  updatedAt: utcDateTime;
}

@route("/event-types")
@tag("Event Types")
interface EventTypes {
  /** Список типов событий текущего пользователя */
  @get list(...PaginationParams): Page<EventType> | ApiError;

  /** Получить тип события по id */
  @get get(@path eventTypeId: int64): EventType | ApiError;

  /** Создать тип события */
  @post create(@body body: EventType): {
    @statusCode statusCode: 201;
    @body body: EventType;
  } | ApiError;

  /** Частично обновить тип события */
  @patch update(
    @path eventTypeId: int64,
    @body body: MergePatchUpdate<EventType>,
  ): EventType | ApiError;

  /** Удалить тип события */
  @delete delete(@path eventTypeId: int64): {
    @statusCode statusCode: 204;
  } | ApiError;

  /** Скопировать тип события (создаёт копию со слагом `-copy`) */
  @route("{eventTypeId}/duplicate")
  @post duplicate(@path eventTypeId: int64): {
    @statusCode statusCode: 201;
    @body body: EventType;
  } | ApiError;
}
