import type { Booking, EventType, Schedule, User } from "../types";

export interface MockDb {
  user: User;
  eventTypes: EventType[];
  schedules: Schedule[];
  bookings: Booking[];
  counters: { eventType: number; schedule: number; booking: number };
}

const STORAGE_KEY = "calendar-mock-db-v1";

function iso(daysFromNow: number, hours: number, minutes = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  d.setHours(hours, minutes, 0, 0);
  return d.toISOString();
}

function seed(): MockDb {
  const user: User = {
    id: 1,
    username: "nina",
    name: "Нина Хабарова",
    email: "khabarova.ninaa@gmail.com",
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    locale: "ru",
    defaultScheduleId: 1,
    createdAt: new Date().toISOString(),
  };

  const schedules: Schedule[] = [
    {
      id: 1,
      name: "Рабочие часы",
      timeZone: user.timeZone,
      availability: [
        {
          days: ["monday", "tuesday", "wednesday", "thursday", "friday"],
          startTime: "09:00",
          endTime: "18:00",
        },
      ],
      overrides: [],
      isDefault: true,
      ownerId: 1,
    },
  ];

  const now = new Date().toISOString();
  const eventTypes: EventType[] = [
    {
      id: 1,
      title: "Интро-звонок",
      slug: "intro",
      description: "Короткое знакомство. Расскажите о своей задаче — обсудим, чем я могу помочь.",
      lengthInMinutes: 15,
      locations: [{ type: "integration", integration: "google-meet" }],
      hidden: false,
      requiresConfirmation: false,
      disableGuests: false,
      minimumBookingNotice: 120,
      beforeEventBuffer: 0,
      afterEventBuffer: 0,
      bookingWindowDays: 60,
      schedulingType: "individual",
      scheduleId: 1,
      ownerId: 1,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 2,
      title: "Консультация",
      slug: "consult",
      description: "Разбор вашего проекта: архитектура, API, процессы. Приходите с конкретными вопросами.",
      lengthInMinutes: 30,
      lengthInMinutesOptions: [30, 45],
      locations: [
        { type: "integration", integration: "google-meet" },
        { type: "integration", integration: "zoom" },
      ],
      hidden: false,
      requiresConfirmation: false,
      disableGuests: false,
      minimumBookingNotice: 240,
      beforeEventBuffer: 5,
      afterEventBuffer: 5,
      bookingWindowDays: 60,
      schedulingType: "individual",
      scheduleId: 1,
      ownerId: 1,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 3,
      title: "Стратегическая сессия",
      slug: "strategy",
      description: "Глубокая проработка продукта или процесса. Требует подтверждения.",
      lengthInMinutes: 60,
      locations: [{ type: "integration", integration: "zoom" }],
      hidden: false,
      requiresConfirmation: true,
      disableGuests: false,
      minimumBookingNotice: 1440,
      beforeEventBuffer: 10,
      afterEventBuffer: 10,
      bookingWindowDays: 30,
      schedulingType: "individual",
      price: { amount: 500000, currency: "RUB" },
      scheduleId: 1,
      ownerId: 1,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 4,
      title: "Секретная встреча",
      slug: "secret",
      description: "Скрыта с публичной страницы — доступна только по прямой ссылке.",
      lengthInMinutes: 30,
      locations: [{ type: "link", link: "https://meet.example.com/secret" }],
      hidden: true,
      requiresConfirmation: false,
      disableGuests: true,
      minimumBookingNotice: 60,
      beforeEventBuffer: 0,
      afterEventBuffer: 0,
      bookingWindowDays: 60,
      schedulingType: "individual",
      scheduleId: 1,
      ownerId: 1,
      createdAt: now,
      updatedAt: now,
    },
  ];

  const bookings: Booking[] = [
    {
      id: 1,
      uid: "bk_seed_001",
      eventTypeId: 1,
      status: "accepted",
      title: "Интро-звонок: Нина Хабарова и Алексей Смирнов",
      start: iso(1, 10, 0),
      end: iso(1, 10, 15),
      organizer: user,
      attendees: [{ name: "Алексей Смирнов", email: "aleksey@example.com", timeZone: user.timeZone }],
      location: { type: "integration", integration: "google-meet" },
      meetingUrl: "https://meet.google.com/abc-defg-hij",
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 2,
      uid: "bk_seed_002",
      eventTypeId: 2,
      status: "accepted",
      title: "Консультация: Нина Хабарова и Мария Петрова",
      start: iso(2, 14, 0),
      end: iso(2, 14, 30),
      organizer: user,
      attendees: [{ name: "Мария Петрова", email: "maria@example.com", timeZone: user.timeZone }],
      location: { type: "integration", integration: "zoom" },
      meetingUrl: "https://zoom.us/j/123456789",
      bookingFieldsResponses: { notes: "Хочу обсудить структуру API" },
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 3,
      uid: "bk_seed_003",
      eventTypeId: 3,
      status: "pending",
      title: "Стратегическая сессия: Нина Хабарова и Дмитрий Козлов",
      start: iso(4, 11, 0),
      end: iso(4, 12, 0),
      organizer: user,
      attendees: [{ name: "Дмитрий Козлов", email: "dmitry@example.com", timeZone: user.timeZone }],
      location: { type: "integration", integration: "zoom" },
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 4,
      uid: "bk_seed_004",
      eventTypeId: 1,
      status: "cancelled",
      title: "Интро-звонок: Нина Хабарова и Ольга Иванова",
      start: iso(-2, 16, 0),
      end: iso(-2, 16, 15),
      organizer: user,
      attendees: [{ name: "Ольга Иванова", email: "olga@example.com", timeZone: user.timeZone }],
      location: { type: "integration", integration: "google-meet" },
      cancellationReason: "Не смогу в это время",
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 5,
      uid: "bk_seed_005",
      eventTypeId: 2,
      status: "accepted",
      title: "Консультация: Нина Хабарова и Павел Соколов",
      start: iso(-7, 12, 0),
      end: iso(-7, 12, 30),
      organizer: user,
      attendees: [{ name: "Павел Соколов", email: "pavel@example.com", timeZone: user.timeZone }],
      location: { type: "integration", integration: "google-meet" },
      meetingUrl: "https://meet.google.com/xyz-uvwq-rst",
      createdAt: now,
      updatedAt: now,
    },
  ];

  return {
    user,
    eventTypes,
    schedules,
    bookings,
    counters: { eventType: 5, schedule: 2, booking: 6 },
  };
}

export function loadDb(): MockDb {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as MockDb;
  } catch {
    // повреждённые данные — пересеиваем
  }
  const db = seed();
  saveDb(db);
  return db;
}

export function saveDb(db: MockDb): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
}

export function resetDb(): MockDb {
  localStorage.removeItem(STORAGE_KEY);
  return loadDb();
}
