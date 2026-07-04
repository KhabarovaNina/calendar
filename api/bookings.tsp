import "@typespec/http";
import "../common.tsp";
import "./me.tsp";
import "./event-types.tsp";

using Http;

namespace CalendarService;

// ─────────────────────────────────────────────
// Блок /bookings — управление бронированиями
// ─────────────────────────────────────────────

enum BookingStatus {
  /** Ожидает подтверждения организатором */
  pending,

  /** Подтверждено */
  accepted,

  /** Отклонено организатором */
  rejected,

  /** Отменено */
  cancelled,
}

/** Участник встречи */
model Attendee {
  name: string;

  email: string;

  timeZone: TimeZone;

  /** Язык уведомлений участника */
  locale?: string;

  /** Телефон — обязателен для событий с локацией `phone` */
  phone?: string;
}

model Booking {
  @visibility(Lifecycle.Read)
  id: int64;

  /** Публичный идентификатор брони, используется в ссылках управления */
  @visibility(Lifecycle.Read)
  uid: string;

  @visibility(Lifecycle.Read)
  eventTypeId: int64;

  @visibility(Lifecycle.Read)
  status: BookingStatus;

  /** Заголовок встречи в календаре */
  @visibility(Lifecycle.Read)
  title: string;

  start: utcDateTime;

  @visibility(Lifecycle.Read)
  end: utcDateTime;

  @visibility(Lifecycle.Read)
  organizer: User;

  attendees: Attendee[];

  /** Email-адреса дополнительных гостей */
  guests?: string[];

  /** Выбранное место проведения */
  location: EventLocation;

  /** Ссылка на видеовстречу, если место — интеграция */
  @visibility(Lifecycle.Read)
  meetingUrl?: url;

  /** Ответы на кастомные поля формы: ключ — `name` поля */
  bookingFieldsResponses?: Record<unknown>;

  /** Причина отмены */
  @visibility(Lifecycle.Read)
  cancellationReason?: string;

  /** Причина отклонения организатором */
  @visibility(Lifecycle.Read)
  rejectionReason?: string;

  @visibility(Lifecycle.Read)
  createdAt: utcDateTime;

  @visibility(Lifecycle.Read)
  updatedAt: utcDateTime;
}

/** Запрос на создание брони (публичный, без авторизации) */
model CreateBookingRequest {
  eventTypeId: int64;

  /** Начало слота */
  start: utcDateTime;

  /** Выбранная длительность, если событие поддерживает варианты */
  lengthInMinutes?: int32;

  attendee: Attendee;

  guests?: string[];

  /** Выбранное место из `locations` события */
  location?: EventLocation;

  /** Ответы на кастомные поля формы */
  bookingFieldsResponses?: Record<unknown>;

  /** Метаданные интеграции, до 50 пар ключ-значение */
  metadata?: Record<string>;
}

model CancelBookingRequest {
  reason?: string;
}

model RescheduleBookingRequest {
  /** Новое начало встречи */
  start: utcDateTime;

  reason?: string;
}

model RejectBookingRequest {
  reason?: string;
}

@route("/bookings")
@tag("Bookings")
interface Bookings {
  /** Список бронирований текущего пользователя */
  @get list(
    ...PaginationParams,
    @query status?: BookingStatus,
    @query eventTypeId?: int64,

    /** Брони, начинающиеся не раньше этой даты */
    @query afterStart?: utcDateTime,

    /** Брони, начинающиеся не позже этой даты */
    @query beforeEnd?: utcDateTime,

    /** Поиск по имени или email участника */
    @query attendeeEmail?: string,
  ): Page<Booking> | ApiError;

  /** Получить бронь по публичному uid */
  @get get(@path bookingUid: string): Booking | ApiError;

  /** Создать бронь (публичный эндпоинт страницы бронирования) */
  @post create(@body body: CreateBookingRequest): {
    @statusCode statusCode: 201;
    @body body: Booking;
  } | ApiError;

  /** Отменить бронь */
  @route("{bookingUid}/cancel")
  @post cancel(
    @path bookingUid: string,
    @body body: CancelBookingRequest,
  ): Booking | ApiError;

  /** Перенести бронь на другое время */
  @route("{bookingUid}/reschedule")
  @post reschedule(
    @path bookingUid: string,
    @body body: RescheduleBookingRequest,
  ): Booking | ApiError;

  /** Подтвердить бронь (для событий с requiresConfirmation) */
  @route("{bookingUid}/confirm")
  @post confirm(@path bookingUid: string): Booking | ApiError;

  /** Отклонить бронь */
  @route("{bookingUid}/reject")
  @post reject(
    @path bookingUid: string,
    @body body: RejectBookingRequest,
  ): Booking | ApiError;
}
