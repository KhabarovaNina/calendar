import "@typespec/http";
import "../common.tsp";

using Http;

namespace CalendarService;

// ─────────────────────────────────────────────
// Блок /me — профиль текущего пользователя
// ─────────────────────────────────────────────

model User {
  @visibility(Lifecycle.Read)
  id: int64;

  /** Публичный username, входит в ссылку бронирования: /{username}/{eventSlug} */
  username: Slug;

  name: string;

  email: string;

  timeZone: TimeZone;

  /** Локаль интерфейса, например `ru` или `en` */
  locale?: string;

  avatarUrl?: url;

  /** Расписание доступности по умолчанию */
  defaultScheduleId?: int64;

  @visibility(Lifecycle.Read)
  createdAt: utcDateTime;
}

@route("/me")
@tag("Me")
interface Me {
  /** Получить профиль */
  @get get(): User | ApiError;

  /** Обновить профиль */
  @patch update(@body body: MergePatchUpdate<User>): User | ApiError;
}
