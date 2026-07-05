import "@typespec/http";
import "../common.tsp";
import "./event-types.tsp";

using Http;

namespace CalendarService;

// ─────────────────────────────────────────────
// Блок /public — данные организатора для публичной страницы бронирования.
// Доступен без авторизации (см. docs/adr/0001). Приватные поля профиля
// (например email) не раскрываются.
// ─────────────────────────────────────────────

/** Публичный профиль организатора и его открытые события */
@example(#{
  id: 1,
  username: "nina",
  name: "Nina",
  timeZone: "Europe/Moscow",
  eventTypes: #[],
})
model PublicOrganizer {
  id: int64;

  /** Публичный username из ссылки бронирования */
  username: Slug;

  name: string;

  timeZone: TimeZone;

  avatarUrl?: url;

  /** Видимые (не скрытые) типы событий организатора */
  eventTypes: EventType[];
}

@route("/public")
@tag("Public")
interface Public {
  /** Публичный профиль организатора по username + его открытые события */
  @route("{username}")
  @get organizer(@path username: string): PublicOrganizer | ApiError;

  /** Один видимый тип события организатора по слагу (для страницы бронирования) */
  @route("{username}/{slug}")
  @get eventType(@path username: string, @path slug: Slug): EventType | ApiError;
}
