// HTTP-клиент к mock-серверу Prism. Типы сгенерированы из TypeSpec-спеки
// (`npm run gen:api` → schema.d.ts). Запросы идут на /api, который Vite
// проксирует на Prism (:4010). См. vite.config.ts.

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
export type Booking = components["schemas"]["Booking"];
export type BookingStatus = components["schemas"]["BookingStatus"];
export type Attendee = components["schemas"]["Attendee"];
export type EventLocation = components["schemas"]["EventLocation"];
export type Slot = components["schemas"]["Slot"];
export type SlotsResponse = components["schemas"]["SlotsResponse"];

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
    unwrap(await client.DELETE("/event-types/{eventTypeId}", { params: { path: { eventTypeId } } })),
  duplicate: async (eventTypeId: number) =>
    unwrap(
      await client.POST("/event-types/{eventTypeId}/duplicate", {
        params: { path: { eventTypeId } },
      }),
    ),
};

// ── /availability ──
export const availabilityApi = {
  list: async () => unwrap(await client.GET("/availability")),
  get: async (scheduleId: number) =>
    unwrap(await client.GET("/availability/{scheduleId}", { params: { path: { scheduleId } } })),
  update: async (scheduleId: number, body: Partial<Schedule>) =>
    unwrap(
      await client.PATCH("/availability/{scheduleId}", {
        params: { path: { scheduleId } },
        body,
      }),
    ),
};

// ── /slots ──
export interface SlotsQuery {
  eventTypeId: number;
  start: string;
  end: string;
  timeZone?: string;
  duration?: number;
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
  get: async (bookingUid: string) =>
    unwrap(await client.GET("/bookings/{bookingUid}", { params: { path: { bookingUid } } })),
  cancel: async (bookingUid: string, reason?: string) =>
    unwrap(
      await client.POST("/bookings/{bookingUid}/cancel", {
        params: { path: { bookingUid } },
        body: { reason },
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
