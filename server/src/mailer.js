// Отправка email-уведомлений (nodemailer + SMTP).
//
// Транспорт настраивается через переменные окружения (см. server/.env.example):
//   SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASS, MAIL_FROM
// Если SMTP_HOST не задан — используется dev-заглушка: письма НЕ уходят наружу,
// а только логируются в консоль (удобно для учебного окружения).
//
// Все функции безопасны к ошибкам: сбой почты логируется, но не роняет запрос —
// письмо отправляется уже после успешной записи брони.

import nodemailer from "nodemailer";
import { DateTime } from "luxon";

let cached;

function getTransport() {
  if (cached) return cached;
  const host = process.env.SMTP_HOST;
  if (host) {
    cached = nodemailer.createTransport({
      host,
      port: Number(process.env.SMTP_PORT || 587),
      secure: process.env.SMTP_SECURE === "true",
      auth: process.env.SMTP_USER
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
        : undefined,
    });
    cached._real = true;
  } else {
    // Ничего не отправляет наружу — сериализует письмо в JSON.
    cached = nodemailer.createTransport({ jsonTransport: true });
    cached._real = false;
  }
  return cached;
}

const FROM = () => process.env.MAIL_FROM || "Calendar <no-reply@calendar.local>";

/** Экранирование пользовательских данных в HTML-письме. */
function esc(v) {
  return String(v ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
  );
}

/** Дата брони в таймзоне получателя, человекочитаемо. */
function fmt(iso, zone) {
  return DateTime.fromISO(iso, { zone: "utc" })
    .setZone(zone || "UTC")
    .setLocale("ru")
    .toFormat("dd.MM.yyyy HH:mm (ZZZZ)");
}

async function sendMail({ to, subject, html }) {
  if (!to) return;
  const t = getTransport();
  try {
    const info = await t.sendMail({ from: FROM(), to, subject, html });
    if (t._real) {
      console.log(`✉️  Отправлено: ${to} | ${subject} | id=${info.messageId}`);
    } else {
      console.log(`✉️  [dev, не отправлено — нет SMTP] To: ${to} | Тема: ${subject}`);
    }
  } catch (e) {
    console.error(`✉️  Ошибка отправки на ${to}: ${e.message}`);
  }
}

function meetingBlock(b) {
  return b.meetingUrl
    ? `<p>Ссылка на встречу: <a href="${esc(b.meetingUrl)}">${esc(b.meetingUrl)}</a></p>`
    : "";
}

/** Письма при создании брони — участнику и организатору. */
export async function notifyBookingCreated(b) {
  const attendee = b.attendees?.[0];
  const org = b.organizer;
  const pending = b.status === "pending";

  if (attendee?.email) {
    await sendMail({
      to: attendee.email,
      subject: `${pending ? "Заявка на встречу принята" : "Встреча забронирована"}: ${esc(b.title)}`,
      html: `<p>Здравствуйте, ${esc(attendee.name)}!</p>
        <p>${pending
          ? "Ваша заявка принята и ожидает подтверждения организатором."
          : "Ваша встреча забронирована."}</p>
        <p><b>${esc(b.title)}</b><br>
        Когда: ${fmt(b.start, attendee.timeZone)}<br>
        Организатор: ${esc(org?.name)}</p>
        ${meetingBlock(b)}
        <p style="color:#888">Идентификатор брони: ${esc(b.uid)}</p>`,
    });
  }

  if (org?.email) {
    await sendMail({
      to: org.email,
      subject: `Новая бронь${pending ? " (ожидает подтверждения)" : ""}: ${esc(b.title)}`,
      html: `<p>Новая бронь${pending ? ", требуется подтверждение." : "."}</p>
        <p><b>${esc(b.title)}</b><br>
        Когда: ${fmt(b.start, org.timeZone)}<br>
        Участник: ${esc(attendee?.name)} &lt;${esc(attendee?.email)}&gt;</p>
        ${meetingBlock(b)}
        <p style="color:#888">Идентификатор брони: ${esc(b.uid)}</p>`,
    });
  }
}

/** Письма при отмене брони — участнику и организатору. */
export async function notifyBookingCancelled(b) {
  const attendee = b.attendees?.[0];
  const org = b.organizer;
  const reason = b.cancellationReason
    ? `<p>Причина: ${esc(b.cancellationReason)}</p>`
    : "";

  if (attendee?.email) {
    await sendMail({
      to: attendee.email,
      subject: `Встреча отменена: ${esc(b.title)}`,
      html: `<p>Здравствуйте, ${esc(attendee.name)}!</p>
        <p>Встреча отменена.</p>
        <p><b>${esc(b.title)}</b><br>Была назначена на: ${fmt(b.start, attendee.timeZone)}</p>
        ${reason}`,
    });
  }

  if (org?.email) {
    await sendMail({
      to: org.email,
      subject: `Бронь отменена: ${esc(b.title)}`,
      html: `<p>Бронь отменена.</p>
        <p><b>${esc(b.title)}</b><br>
        Была назначена на: ${fmt(b.start, org.timeZone)}<br>
        Участник: ${esc(attendee?.name)}</p>
        ${reason}`,
    });
  }
}
