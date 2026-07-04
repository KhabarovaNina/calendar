import "@typespec/http";
import "@typespec/rest";
import "@typespec/openapi";

import "./common.tsp";
import "./api/me.tsp";
import "./api/event-types.tsp";
import "./api/availability.tsp";
import "./api/slots.tsp";
import "./api/bookings.tsp";

using Http;

/**
 * Booking platform API — аналог Cal.com.
 *
 * Блоки API (по файлам в ./api):
 * - /me — профиль текущего пользователя
 * - /availability — расписания доступности организатора
 * - /slots — расчёт свободных времён для бронирования
 * - /bookings — управление бронированиями
 * - /event-types — типы событий, которые можно бронировать
 */
@service(#{ title: "Calendar Booking API" })
@server("https://api.calendar.example.com/v1", "Production")
namespace CalendarService;
