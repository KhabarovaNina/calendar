// Преобразование строк SQLite ↔ модели API (как в OpenAPI-схеме).
// JSON-поля разворачиваются, boolean хранятся как 0/1, необязательные пустые
// поля не попадают в ответ (чтобы совпадать с формой из спеки).

const parse = (v, fallback) => (v == null ? fallback : JSON.parse(v));
const str = (v) => (v == null ? null : JSON.stringify(v));

/** Убрать ключи со значением undefined (для чистого JSON-ответа). */
function clean(obj) {
  for (const k of Object.keys(obj)) if (obj[k] === undefined) delete obj[k];
  return obj;
}

// ── User ──
export function userToApi(r) {
  return clean({
    id: r.id,
    username: r.username,
    name: r.name,
    email: r.email,
    timeZone: r.timeZone,
    locale: r.locale ?? undefined,
    avatarUrl: r.avatarUrl ?? undefined,
    defaultScheduleId: r.defaultScheduleId ?? undefined,
    createdAt: r.createdAt,
  });
}

// ── Schedule ──
export function scheduleToApi(r) {
  return clean({
    id: r.id,
    name: r.name,
    timeZone: r.timeZone,
    availability: parse(r.availability, []),
    overrides: r.overrides ? parse(r.overrides, []) : undefined,
    isDefault: !!r.isDefault,
    ownerId: r.ownerId,
  });
}

// ── EventType ──
export function eventTypeToApi(r) {
  return clean({
    id: r.id,
    title: r.title,
    slug: r.slug,
    description: r.description ?? undefined,
    lengthInMinutes: r.lengthInMinutes,
    lengthInMinutesOptions: r.lengthInMinutesOptions
      ? parse(r.lengthInMinutesOptions, [])
      : undefined,
    locations: parse(r.locations, []),
    bookingFields: r.bookingFields ? parse(r.bookingFields, []) : undefined,
    hidden: !!r.hidden,
    requiresConfirmation: !!r.requiresConfirmation,
    disableGuests: !!r.disableGuests,
    minimumBookingNotice: r.minimumBookingNotice,
    beforeEventBuffer: r.beforeEventBuffer,
    afterEventBuffer: r.afterEventBuffer,
    slotInterval: r.slotInterval ?? undefined,
    seatsPerTimeSlot: r.seatsPerTimeSlot ?? undefined,
    bookingWindowDays: r.bookingWindowDays ?? undefined,
    bookingLimits: r.bookingLimits ? parse(r.bookingLimits, {}) : undefined,
    recurrence: r.recurrence ? parse(r.recurrence, {}) : undefined,
    schedulingType: r.schedulingType,
    price: r.price ? parse(r.price, {}) : undefined,
    scheduleId: r.scheduleId ?? undefined,
    ownerId: r.ownerId,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  });
}

// ── Booking ──
export function bookingToApi(r, organizerRow) {
  return clean({
    id: r.id,
    uid: r.uid,
    eventTypeId: r.eventTypeId,
    status: r.status,
    title: r.title,
    start: r.start,
    end: r.end,
    organizer: userToApi(organizerRow),
    attendees: parse(r.attendees, []),
    guests: r.guests ? parse(r.guests, []) : undefined,
    location: r.location ? parse(r.location, null) : undefined,
    meetingUrl: r.meetingUrl ?? undefined,
    bookingFieldsResponses: r.bookingFieldsResponses
      ? parse(r.bookingFieldsResponses, {})
      : undefined,
    cancellationReason: r.cancellationReason ?? undefined,
    rejectionReason: r.rejectionReason ?? undefined,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  });
}

export const json = { parse, str };
