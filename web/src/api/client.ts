// HTTP-клиент к бэкенду. Типы сгенерированы из TypeSpec-спеки
// (`npm run gen:api` → schema.d.ts). Запросы идут на /api, который Vite
// проксирует на бэкенд (:4010). См. vite.config.ts.
// Бэкенд — реальный сервер на Express + SQLite (../server), данные персистятся.

import createClient from "openapi-fetch";
import type { components, paths } from "./schema";

export const client = createClient<paths>({ baseUrl: "/api" });

// ── Типы моделей (реэкспорт из сгенерированной схемы) ──
export type User = components["schemas"]["User"];
export type EventType = components["schemas"]["EventType"];
/** Поля для создания типа события (без серверных readonly-полей) */
export type EventTypeInput = Omit<
  EventType,
  "id" | "ownerId" | "createdAt" | "updatedAt"
>;
export type Schedule = components["schemas"]["Schedule"];
export type AvailabilityRule = components["schemas"]["AvailabilityRule"];
export type DateOverride = components["schemas"]["DateOverride"];
export type Booking = components["schemas"]["Booking"];
export type BookingStatus = components["schemas"]["BookingStatus"];
export type Attendee = components["schemas"]["Attendee"];
export type EventLocation = components["schemas"]["EventLocation"];
export type Slot = components["schemas"]["Slot"];
export type SlotsResponse = components["schemas"]["SlotsResponse"];
export type PublicOrganizer = components["schemas"]["PublicOrganizer"];
export type BookingField = components["schemas"]["BookingField"];
export type CreateBookingRequest = components["schemas"]["CreateBookingRequest"];

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Достаёт data или бросает ApiError — удобно для async-обработчиков. */
function unwrap<T>(res: { data?: T; error?: unknown; response: Response }): T {
  if (res.error !== undefined || res.data === undefined) {
    const err = res.error as { message?: string } | undefined;
    throw new ApiError(res.response.status, err?.message ?? `HTTP ${res.response.status}`);
  }
  return res.data;
}

/** Для ответов без тела (204 No Content): бросает ApiError только на реальной ошибке. */
function unwrapVoid(res: { error?: unknown; response: Response }): void {
  if (!res.response.ok) {
    const err = res.error as { message?: string } | undefined;
    throw new ApiError(res.response.status, err?.message ?? `HTTP ${res.response.status}`);
  }
}

// ── /auth ──
export type LoginRequest = components["schemas"]["LoginRequest"];
export type RegisterRequest = components["schemas"]["RegisterRequest"];

export const authApi = {
  login: async (body: LoginRequest) =>
    unwrap(await client.POST("/auth/login", { body })),
  register: async (body: RegisterRequest) =>
    unwrap(await client.POST("/auth/register", { body })),
  logout: async () => {
    await client.POST("/auth/logout");
  },
};

// ── /me ──
export const meApi = {
  get: async () => unwrap(await client.GET("/me")),
  update: async (body: Partial<User>) =>
    unwrap(await client.PATCH("/me", { body })),
};

// ── /event-types ──
export const eventTypesApi = {
  list: async () => unwrap(await client.GET("/event-types")),
  get: async (eventTypeId: number) =>
    unwrap(await client.GET("/event-types/{eventTypeId}", { params: { path: { eventTypeId } } })),
  create: async (body: EventTypeInput) =>
    unwrap(await client.POST("/event-types", { body: body as EventType })),
  update: async (eventTypeId: number, body: Partial<EventType>) =>
    unwrap(
      await client.PATCH("/event-types/{eventTypeId}", {
        params: { path: { eventTypeId } },
        body,
      }),
    ),
  remove: async (eventTypeId: number) =>
    unwrapVoid(await client.DELETE("/event-types/{eventTypeId}", { params: { path: { eventTypeId } } })),
  duplicate: async (eventTypeId: number) =>
    unwrap(
      await client.POST("/event-types/{eventTypeId}/duplicate", {
        params: { path: { eventTypeId } },
      }),
    ),
};

// ── /availability ──
/** Поля для создания расписания (без серверных readonly-полей) */
export type ScheduleInput = Omit<Schedule, "id" | "ownerId">;

export const availabilityApi = {
  list: async () => unwrap(await client.GET("/availability")),
  get: async (scheduleId: number) =>
    unwrap(await client.GET("/availability/{scheduleId}", { params: { path: { scheduleId } } })),
  create: async (body: ScheduleInput) =>
    unwrap(await client.POST("/availability", { body: body as Schedule })),
  update: async (scheduleId: number, body: Partial<Schedule>) =>
    unwrap(
      await client.PATCH("/availability/{scheduleId}", {
        params: { path: { scheduleId } },
        body,
      }),
    ),
  remove: async (scheduleId: number) =>
    unwrapVoid(await client.DELETE("/availability/{scheduleId}", { params: { path: { scheduleId } } })),
};

// ── /public (страница бронирования, без авторизации) ──
export const publicApi = {
  organizer: async (username: string) =>
    unwrap(await client.GET("/public/{username}", { params: { path: { username } } })),
  eventType: async (username: string, slug: string) =>
    unwrap(await client.GET("/public/{username}/{slug}", { params: { path: { username, slug } } })),
};

// ── /slots ──
export interface SlotsQuery {
  eventTypeId: number;
  start: string;
  end: string;
  timeZone?: string;
  duration?: number;
  /** Переопределить расписание (предпросмотр при редактировании типа события) */
  scheduleId?: number;
}

export const slotsApi = {
  list: async (query: SlotsQuery) =>
    unwrap(await client.GET("/slots", { params: { query } })),
};

// ── /bookings ──
export interface BookingFilters {
  status?: BookingStatus;
  eventTypeId?: number;
  afterStart?: string;
  beforeEnd?: string;
  attendeeEmail?: string;
}

export const bookingsApi = {
  list: async (query: BookingFilters = {}) =>
    unwrap(await client.GET("/bookings", { params: { query } })),
  create: async (body: CreateBookingRequest) =>
    unwrap(await client.POST("/bookings", { body })),
  get: async (bookingUid: string) =>
    unwrap(await client.GET("/bookings/{bookingUid}", { params: { path: { bookingUid } } })),
  cancel: async (bookingUid: string, reason?: string) =>
    unwrap(
      await client.POST("/bookings/{bookingUid}/cancel", {
        params: { path: { bookingUid } },
        body: { reason },
      }),
    ),
  reschedule: async (bookingUid: string, start: string, reason?: string) =>
    unwrap(
      await client.POST("/bookings/{bookingUid}/reschedule", {
        params: { path: { bookingUid } },
        body: { start, reason },
      }),
    ),
  confirm: async (bookingUid: string) =>
    unwrap(
      await client.POST("/bookings/{bookingUid}/confirm", { params: { path: { bookingUid } } }),
    ),
  reject: async (bookingUid: string, reason?: string) =>
    unwrap(
      await client.POST("/bookings/{bookingUid}/reject", {
        params: { path: { bookingUid } },
        body: { reason },
      }),
    ),
};
