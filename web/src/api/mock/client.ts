// Мок-реализация API по контракту TypeSpec-спеки.
// Данные живут в памяти + localStorage; все методы асинхронные
// с небольшой задержкой, чтобы поведение было похоже на сеть.

import type {
  Booking,
  BookingStatus,
  CreateBookingRequest,
  EventType,
  Page,
  Schedule,
  Slot,
  SlotsResponse,
  User,
  Weekday,
} from "../types";
import { loadDb, resetDb, saveDb, type MockDb } from "./db";

let db: MockDb = loadDb();

const LATENCY_MS = 200;

function delay(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, LATENCY_MS));
}

function commit(): void {
  saveDb(db);
}

export class MockApiError extends Error {
  constructor(
    public code: number,
    public errorCode: string,
    message: string,
  ) {
    super(message);
  }
}

function notFound(what: string): never {
  throw new MockApiError(404, `${what}_not_found`, `Не найдено: ${what}`);
}

function paginate<T>(items: T[], skip = 0, take = 20): Page<T> {
  return { items: items.slice(skip, skip + take), totalCount: items.length };
}

const WEEKDAYS: Weekday[] = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
];

function dateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function atTime(date: Date, hhmm: string): Date {
  const [h, m] = hhmm.split(":").map(Number);
  const d = new Date(date);
  d.setHours(h, m, 0, 0);
  return d;
}

function overlaps(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return aStart < bEnd && bStart < aEnd;
}

// ── /me ──────────────────────────────────────

export const me = {
  async get(): Promise<User> {
    await delay();
    return { ...db.user };
  },

  async update(patch: Partial<User>): Promise<User> {
    await delay();
    db.user = { ...db.user, ...patch, id: db.user.id };
    commit();
    return { ...db.user };
  },
};

// ── /event-types ─────────────────────────────

export const eventTypes = {
  async list(skip = 0, take = 50): Promise<Page<EventType>> {
    await delay();
    return paginate([...db.eventTypes], skip, take);
  },

  async get(eventTypeId: number): Promise<EventType> {
    await delay();
    const et = db.eventTypes.find((e) => e.id === eventTypeId);
    if (!et) notFound("event_type");
    return { ...et };
  },

  async create(
    input: Omit<EventType, "id" | "ownerId" | "createdAt" | "updatedAt">,
  ): Promise<EventType> {
    await delay();
    if (db.eventTypes.some((e) => e.slug === input.slug)) {
      throw new MockApiError(409, "slug_taken", "Слаг уже используется");
    }
    const now = new Date().toISOString();
    const et: EventType = {
      ...input,
      id: db.counters.eventType++,
      ownerId: db.user.id,
      createdAt: now,
      updatedAt: now,
    };
    db.eventTypes.push(et);
    commit();
    return { ...et };
  },

  async update(eventTypeId: number, patch: Partial<EventType>): Promise<EventType> {
    await delay();
    const idx = db.eventTypes.findIndex((e) => e.id === eventTypeId);
    if (idx === -1) notFound("event_type");
    const updated: EventType = {
      ...db.eventTypes[idx],
      ...patch,
      id: eventTypeId,
      updatedAt: new Date().toISOString(),
    };
    db.eventTypes[idx] = updated;
    commit();
    return { ...updated };
  },

  async remove(eventTypeId: number): Promise<void> {
    await delay();
    db.eventTypes = db.eventTypes.filter((e) => e.id !== eventTypeId);
    commit();
  },

  async duplicate(eventTypeId: number): Promise<EventType> {
    await delay();
    const src = db.eventTypes.find((e) => e.id === eventTypeId);
    if (!src) notFound("event_type");
    const now = new Date().toISOString();
    let slug = `${src.slug}-copy`;
    let n = 2;
    while (db.eventTypes.some((e) => e.slug === slug)) slug = `${src.slug}-copy-${n++}`;
    const copy: EventType = {
      ...src,
      id: db.counters.eventType++,
      title: `${src.title} (копия)`,
      slug,
      hidden: true,
      createdAt: now,
      updatedAt: now,
    };
    db.eventTypes.push(copy);
    commit();
    return { ...copy };
  },
};

// ── /availability ────────────────────────────

export const availability = {
  async list(): Promise<Page<Schedule>> {
    await delay();
    return paginate([...db.schedules]);
  },

  async get(scheduleId: number): Promise<Schedule> {
    await delay();
    const s = db.schedules.find((x) => x.id === scheduleId);
    if (!s) notFound("schedule");
    return { ...s };
  },

  async create(input: Omit<Schedule, "id" | "ownerId">): Promise<Schedule> {
    await delay();
    const s: Schedule = { ...input, id: db.counters.schedule++, ownerId: db.user.id };
    db.schedules.push(s);
    commit();
    return { ...s };
  },

  async update(scheduleId: number, patch: Partial<Schedule>): Promise<Schedule> {
    await delay();
    const idx = db.schedules.findIndex((x) => x.id === scheduleId);
    if (idx === -1) notFound("schedule");
    db.schedules[idx] = { ...db.schedules[idx], ...patch, id: scheduleId };
    commit();
    return { ...db.schedules[idx] };
  },

  async remove(scheduleId: number): Promise<void> {
    await delay();
    db.schedules = db.schedules.filter((x) => x.id !== scheduleId);
    commit();
  },
};

// ── /slots ───────────────────────────────────

export const slots = {
  /**
   * Расчёт свободных слотов: расписание доступности + переопределения дат,
   * минус существующие брони (с буферами), минимальный notice и окно бронирования.
   */
  async list(params: {
    eventTypeId: number;
    start: string; // YYYY-MM-DD
    end: string; // YYYY-MM-DD
    lengthInMinutes?: number;
  }): Promise<SlotsResponse> {
    await delay();
    const et = db.eventTypes.find((e) => e.id === params.eventTypeId);
    if (!et) notFound("event_type");

    const schedule =
      db.schedules.find((s) => s.id === et.scheduleId) ??
      db.schedules.find((s) => s.isDefault) ??
      db.schedules[0];
    if (!schedule) return { slots: {} };

    const length = params.lengthInMinutes ?? et.lengthInMinutes;
    const step = et.slotInterval ?? length;
    const now = new Date();
    const earliestStart = new Date(now.getTime() + et.minimumBookingNotice * 60_000);
    const windowEnd = new Date(now);
    windowEnd.setDate(windowEnd.getDate() + (et.bookingWindowDays ?? 60));

    const busy = db.bookings
      .filter((b) => b.status === "accepted" || b.status === "pending")
      .map((b) => ({
        start: new Date(new Date(b.start).getTime() - et.beforeEventBuffer * 60_000),
        end: new Date(new Date(b.end).getTime() + et.afterEventBuffer * 60_000),
      }));

    const result: Record<string, Slot[]> = {};
    const cursor = new Date(`${params.start}T00:00:00`);
    const rangeEnd = new Date(`${params.end}T23:59:59`);

    while (cursor <= rangeEnd) {
      if (cursor > windowEnd) break;

      const key = dateKey(cursor);
      const override = schedule.overrides?.find((o) => o.date === key);
      const weekday = WEEKDAYS[cursor.getDay()];

      const intervals = override
        ? override.intervals
        : schedule.availability
            .filter((rule) => rule.days.includes(weekday))
            .map((rule) => ({ startTime: rule.startTime, endTime: rule.endTime }));

      const daySlots: Slot[] = [];
      for (const interval of intervals) {
        let t = atTime(cursor, interval.startTime);
        const intervalEnd = atTime(cursor, interval.endTime);
        while (new Date(t.getTime() + length * 60_000) <= intervalEnd) {
          const slotEnd = new Date(t.getTime() + length * 60_000);
          const isBusy = busy.some((b) => overlaps(t, slotEnd, b.start, b.end));
          if (t >= earliestStart && !isBusy) {
            daySlots.push({ start: t.toISOString(), end: slotEnd.toISOString() });
          }
          t = new Date(t.getTime() + step * 60_000);
        }
      }
      if (daySlots.length > 0) result[key] = daySlots;

      cursor.setDate(cursor.getDate() + 1);
    }

    return { slots: result };
  },
};

// ── /bookings, /upcoming ─────────────────────

export interface BookingListFilters {
  skip?: number;
  take?: number;
  status?: BookingStatus;
  eventTypeId?: number;
  afterStart?: string;
  beforeEnd?: string;
  attendeeEmail?: string;
}

function getBooking(uid: string): Booking {
  const b = db.bookings.find((x) => x.uid === uid);
  if (!b) notFound("booking");
  return b;
}

export const bookings = {
  async list(filters: BookingListFilters = {}): Promise<Page<Booking>> {
    await delay();
    let items = [...db.bookings];
    if (filters.status) items = items.filter((b) => b.status === filters.status);
    if (filters.eventTypeId) items = items.filter((b) => b.eventTypeId === filters.eventTypeId);
    if (filters.afterStart) items = items.filter((b) => b.start >= filters.afterStart!);
    if (filters.beforeEnd) items = items.filter((b) => b.start <= filters.beforeEnd!);
    if (filters.attendeeEmail) {
      const q = filters.attendeeEmail.toLowerCase();
      items = items.filter((b) =>
        b.attendees.some(
          (a) => a.email.toLowerCase().includes(q) || a.name.toLowerCase().includes(q),
        ),
      );
    }
    items.sort((a, b) => a.start.localeCompare(b.start));
    return paginate(items, filters.skip, filters.take ?? 100);
  },

  async get(uid: string): Promise<Booking> {
    await delay();
    return { ...getBooking(uid) };
  },

  async create(req: CreateBookingRequest): Promise<Booking> {
    await delay();
    const et = db.eventTypes.find((e) => e.id === req.eventTypeId);
    if (!et) notFound("event_type");

    const length = req.lengthInMinutes ?? et.lengthInMinutes;
    const start = new Date(req.start);
    const end = new Date(start.getTime() + length * 60_000);

    const conflict = db.bookings.some(
      (b) =>
        (b.status === "accepted" || b.status === "pending") &&
        overlaps(start, end, new Date(b.start), new Date(b.end)),
    );
    if (conflict) {
      throw new MockApiError(409, "slot_taken", "Этот слот уже занят — выберите другой");
    }

    const location = req.location ?? et.locations[0] ?? { type: "attendeeDefined" as const };
    const meetingUrl =
      location.type === "integration"
        ? location.integration === "zoom"
          ? `https://zoom.us/j/${Math.floor(100000000 + Math.random() * 900000000)}`
          : `https://meet.google.com/${Math.random().toString(36).slice(2, 5)}-${Math.random().toString(36).slice(2, 6)}-${Math.random().toString(36).slice(2, 5)}`
        : undefined;

    const now = new Date().toISOString();
    const booking: Booking = {
      id: db.counters.booking++,
      uid: `bk_${Math.random().toString(36).slice(2, 10)}`,
      eventTypeId: et.id,
      status: et.requiresConfirmation ? "pending" : "accepted",
      title: `${et.title}: ${db.user.name} и ${req.attendee.name}`,
      start: start.toISOString(),
      end: end.toISOString(),
      organizer: { ...db.user },
      attendees: [req.attendee],
      guests: req.guests,
      location,
      meetingUrl,
      bookingFieldsResponses: req.bookingFieldsResponses,
      createdAt: now,
      updatedAt: now,
    };
    db.bookings.push(booking);
    commit();
    return { ...booking };
  },

  async cancel(uid: string, reason?: string): Promise<Booking> {
    await delay();
    const b = getBooking(uid);
    b.status = "cancelled";
    b.cancellationReason = reason;
    b.updatedAt = new Date().toISOString();
    commit();
    return { ...b };
  },

  async reschedule(uid: string, start: string, _reason?: string): Promise<Booking> {
    await delay();
    const b = getBooking(uid);
    const durationMs = new Date(b.end).getTime() - new Date(b.start).getTime();
    b.start = new Date(start).toISOString();
    b.end = new Date(new Date(start).getTime() + durationMs).toISOString();
    b.updatedAt = new Date().toISOString();
    commit();
    return { ...b };
  },

  async confirm(uid: string): Promise<Booking> {
    await delay();
    const b = getBooking(uid);
    b.status = "accepted";
    b.updatedAt = new Date().toISOString();
    commit();
    return { ...b };
  },

  async reject(uid: string, reason?: string): Promise<Booking> {
    await delay();
    const b = getBooking(uid);
    b.status = "rejected";
    b.rejectionReason = reason;
    b.updatedAt = new Date().toISOString();
    commit();
    return { ...b };
  },
};

export const upcoming = {
  async list(includePending = true): Promise<Page<Booking>> {
    await delay();
    const nowIso = new Date().toISOString();
    const items = db.bookings
      .filter(
        (b) =>
          b.start >= nowIso &&
          (b.status === "accepted" || (includePending && b.status === "pending")),
      )
      .sort((a, b) => a.start.localeCompare(b.start));
    return paginate(items, 0, 100);
  },
};

// ── /public ──────────────────────────────────

export const publicPages = {
  async listEventTypes(username: string): Promise<EventType[]> {
    await delay();
    if (username !== db.user.username) notFound("user");
    return db.eventTypes.filter((e) => !e.hidden).map((e) => ({ ...e }));
  },

  async getEventType(username: string, slug: string): Promise<EventType> {
    await delay();
    if (username !== db.user.username) notFound("user");
    const et = db.eventTypes.find((e) => e.slug === slug);
    if (!et) notFound("event_type");
    return { ...et };
  },
};

export function resetMockData(): void {
  db = resetDb();
}
