// Помощники аутентификации по серверным сессиям (см. docs/adr/0001).
// Пароли — bcrypt (через bcryptjs, чистый JS без нативной сборки), cost 12.

import bcrypt from "bcryptjs";
import { DateTime } from "luxon";
import { db } from "./db.js";

const BCRYPT_COST = 12;

export const hashPassword = (plain) => bcrypt.hashSync(plain, BCRYPT_COST);

export function verifyPassword(plain, hash) {
  if (!hash) return false;
  return bcrypt.compareSync(plain, hash);
}

/**
 * Создать пользователя и сразу дефолтное расписание в его таймзоне
 * (без расписания `/slots` для нового организатора не работал бы).
 * Возвращает строку users. Уникальность email/username проверяет вызывающий.
 */
export function createOrganizer({ name, email, password, timeZone, username, locale }) {
  const now = DateTime.utc().toISO({ suppressMilliseconds: true });
  const passwordHash = hashPassword(password);

  const tx = db.transaction(() => {
    const userInfo = db
      .prepare(
        `INSERT INTO users (username, name, email, passwordHash, timeZone, locale, createdAt)
         VALUES (@username, @name, @email, @passwordHash, @timeZone, @locale, @createdAt)`,
      )
      .run({ username, name, email, passwordHash, timeZone, locale: locale ?? null, createdAt: now });
    const userId = userInfo.lastInsertRowid;

    const schedInfo = db
      .prepare(
        `INSERT INTO schedules (name, timeZone, availability, overrides, isDefault, ownerId)
         VALUES (@name, @timeZone, @availability, @overrides, @isDefault, @ownerId)`,
      )
      .run({
        name: "Рабочие часы",
        timeZone,
        availability: JSON.stringify([
          {
            days: ["monday", "tuesday", "wednesday", "thursday", "friday"],
            startTime: "09:00:00",
            endTime: "18:00:00",
          },
        ]),
        overrides: null,
        isDefault: 1,
        ownerId: userId,
      });

    db.prepare("UPDATE users SET defaultScheduleId = ? WHERE id = ?").run(
      schedInfo.lastInsertRowid,
      userId,
    );
    return userId;
  });

  const userId = tx();
  return db.prepare("SELECT * FROM users WHERE id = ?").get(userId);
}
