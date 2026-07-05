// Локальная база SQLite (better-sqlite3). Файл data.db создаётся автоматически
// при первом запуске рядом с сервером. Схема создаётся идемпотентно, а сид
// накатывается только в пустую базу (см. seed.js).
//
// Сложные вложенные поля из спеки (locations, availability, attendees и т.п.)
// хранятся как JSON-строки в TEXT-колонках и (де)сериализуются в слое моделей.

import Database from "better-sqlite3";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Путь к файлу БД можно переопределить через переменную окружения (для тестов).
const DB_PATH = process.env.DB_PATH || join(__dirname, "..", "data.db");

export const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

/** Создать таблицы, если их ещё нет. Безопасно вызывать при каждом запуске. */
export function initSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id                 INTEGER PRIMARY KEY AUTOINCREMENT,
      username           TEXT NOT NULL UNIQUE,
      name               TEXT NOT NULL,
      email              TEXT NOT NULL UNIQUE,
      passwordHash       TEXT,
      timeZone           TEXT NOT NULL,
      locale             TEXT,
      avatarUrl          TEXT,
      defaultScheduleId  INTEGER,
      createdAt          TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS schedules (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      name          TEXT NOT NULL,
      timeZone      TEXT NOT NULL,
      availability  TEXT NOT NULL DEFAULT '[]',  -- JSON: AvailabilityRule[]
      overrides     TEXT,                        -- JSON: DateOverride[]
      isDefault     INTEGER NOT NULL DEFAULT 0,
      ownerId       INTEGER NOT NULL REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS event_types (
      id                     INTEGER PRIMARY KEY AUTOINCREMENT,
      title                  TEXT NOT NULL,
      slug                   TEXT NOT NULL,
      description            TEXT,
      lengthInMinutes        INTEGER NOT NULL,
      lengthInMinutesOptions TEXT,               -- JSON: int[]
      locations              TEXT NOT NULL DEFAULT '[]', -- JSON: EventLocation[]
      bookingFields          TEXT,               -- JSON: BookingField[]
      hidden                 INTEGER NOT NULL DEFAULT 0,
      requiresConfirmation   INTEGER NOT NULL DEFAULT 0,
      disableGuests          INTEGER NOT NULL DEFAULT 0,
      minimumBookingNotice   INTEGER NOT NULL DEFAULT 120,
      beforeEventBuffer      INTEGER NOT NULL DEFAULT 0,
      afterEventBuffer       INTEGER NOT NULL DEFAULT 0,
      slotInterval           INTEGER,
      seatsPerTimeSlot       INTEGER,
      bookingWindowDays      INTEGER DEFAULT 60,
      bookingLimits          TEXT,               -- JSON: BookingLimits
      recurrence             TEXT,               -- JSON: Recurrence
      schedulingType         TEXT NOT NULL DEFAULT 'individual',
      price                  TEXT,               -- JSON: EventPrice
      scheduleId             INTEGER,
      ownerId                INTEGER NOT NULL REFERENCES users(id),
      createdAt              TEXT NOT NULL,
      updatedAt              TEXT NOT NULL,
      UNIQUE(ownerId, slug)
    );

    CREATE TABLE IF NOT EXISTS bookings (
      id                     INTEGER PRIMARY KEY AUTOINCREMENT,
      uid                    TEXT NOT NULL UNIQUE,
      eventTypeId            INTEGER NOT NULL REFERENCES event_types(id),
      status                 TEXT NOT NULL DEFAULT 'accepted',
      title                  TEXT NOT NULL,
      start                  TEXT NOT NULL,      -- ISO UTC
      end                    TEXT NOT NULL,      -- ISO UTC
      organizerId            INTEGER NOT NULL REFERENCES users(id),
      attendees              TEXT NOT NULL DEFAULT '[]', -- JSON: Attendee[]
      guests                 TEXT,               -- JSON: string[]
      location               TEXT,               -- JSON: EventLocation
      meetingUrl             TEXT,
      bookingFieldsResponses TEXT,               -- JSON: object
      cancellationReason     TEXT,
      rejectionReason        TEXT,
      createdAt              TEXT NOT NULL,
      updatedAt              TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_event_types_owner ON event_types(ownerId);
    CREATE INDEX IF NOT EXISTS idx_bookings_event    ON bookings(eventTypeId);
    CREATE INDEX IF NOT EXISTS idx_bookings_start    ON bookings(start);
  `);

  migrate();
}

/**
 * Идемпотентные миграции для БД, созданных до появления авторизации.
 * `CREATE TABLE IF NOT EXISTS` не трогает уже существующую таблицу `users`,
 * поэтому колонку паролей и уникальность email добавляем отдельно.
 */
function migrate() {
  const cols = db.prepare("PRAGMA table_info(users)").all().map((c) => c.name);
  if (!cols.includes("passwordHash")) {
    db.exec("ALTER TABLE users ADD COLUMN passwordHash TEXT");
  }
  // UNIQUE-ограничение нельзя добавить через ALTER — заводим уникальный индекс.
  db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email)");
}
