import "@typespec/http";
import "../common.tsp";
import "./me.tsp";

using Http;

namespace CalendarService;

// ─────────────────────────────────────────────
// Блок /auth — вход, выход, самостоятельная регистрация организатора.
// Серверные сессии + httpOnly-cookie (см. docs/adr/0001). Публичный блок.
// ─────────────────────────────────────────────

/** Вход по email и паролю */
model LoginRequest {
  email: string;

  @minLength(8)
  password: string;
}

/** Регистрация нового организатора */
model RegisterRequest {
  name: string;

  email: string;

  @minLength(8)
  password: string;

  timeZone: TimeZone;

  /** Публичный username из ссылки бронирования */
  username: Slug;

  /** Локаль интерфейса, например `ru` */
  locale?: string;
}

@route("/auth")
@tag("Auth")
interface Auth {
  /** Войти: создаёт сессию и ставит httpOnly-cookie */
  @route("login")
  @post
  login(@body body: LoginRequest): User | ApiError;

  /** Выйти: уничтожает сессию */
  @route("logout")
  @post
  logout(): {
    @statusCode statusCode: 204;
  } | ApiError;

  /** Зарегистрироваться: создаёт пользователя, дефолтное расписание и сессию */
  @route("register")
  @post
  register(@body body: RegisterRequest): {
    @statusCode statusCode: 201;
    @body body: User;
  } | ApiError;
}
