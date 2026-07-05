# Как устроена публичная система бронирования cal.com

> Исследование публичной страницы бронирования cal.com (`/{username}/{slug}`): пользовательский флоу выбора слота, параметры URL для deep-linking, внутренний tRPC-эндпоинт веб-приложения и официальный публичный API v2 (`GET /v2/slots`, `POST /v2/bookings`) — с примерами запросов и ответов.
>
> Дата: 2026-07-05

Примеры страниц, на которых основано исследование:
- https://cal.com/nina-iziumova-9i14p1/30min
- https://cal.com/nina-iziumova-9i14p1/30min?overlayCalendar=true&date=2026-07-13&slot=2026-07-13T06%3A00%3A00.000Z

---

## 1. Флоу выбора слота (публичная страница бронирования)

Публичная страница `/{username}/{slug}` рендерится компонентом **Booker**. Пользовательские шаги:

1. **Выбор даты.** Открывается календарь (month / week / column view). Booker подгружает доступные слоты через tRPC-запрос `slots.getSchedule` (см. §3). Дни без слотов недоступны для выбора.
2. **Выбор временного слота.** После выбора даты справа (или рядом с календарём) появляется список свободных временных слотов на этот день. Слоты приходят из ответа `getSchedule`, сгруппированные по дате.
3. **Ввод данных участника (attendee).** После выбора слота показывается форма бронирования (booking fields): имя, email, часовой пояс, язык, заметки, гости и любые кастомные поля события. Набор полей задаётся `bookingFields` события.
4. **Подтверждение.** Отправка формы вызывает создание бронирования — во внутреннем веб-приложении через обработчик `handleNewBooking`, а в публичном API — через `POST /v2/bookings` (см. §4). После успеха показывается страница подтверждения (booking success).

Внутреннее состояние Booker (свойства стора / `onBookerStateChange`): `username`, `eventSlug`, `eventId`, `month`, `selectedDate`, `selectedTimeslot`, `selectedDuration`, `formValues`, `layout`, `timezone`, `recurringEventCount`.
Источник: https://cal.com/docs/platform/atoms/booker ; `packages/features/bookings/Booker/store.ts` (см. §2).

---

## 2. Параметры URL (deep-linking)

Booker читает состояние из query-параметров URL при инициализации стора (`packages/features/bookings/Booker/store.ts`), используя generic-утилиты `getQueryParam` / `updateQueryParam` / `removeQueryParam` (`packages/features/bookings/Booker/utils/query-param.ts`).

| Параметр | Формат | Что делает |
|---|---|---|
| `month` | `YYYY-MM` (напр. `2026-07`) | Отображаемый месяц календаря. |
| `date` | `YYYY-MM-DD` (напр. `2026-07-13`) | Предвыбор конкретного дня (`selectedDate`); флоу перескакивает через шаг выбора даты. |
| `slot` | ISO-строка datetime (напр. `2026-07-13T06:00:00.000Z`) | Предвыбор конкретного временного слота (`selectedTimeslot`). |
| `duration` | число (минуты) | Длительность для событий с несколькими вариантами длительности. Валидируется по `durationConfig`; невалидное значение удаляется из URL. |
| `layout` | `month_view` \| `week_view` \| `column_view` | Вид календаря. URL — источник истины для выбора вида (можно шарить ссылку с предвыбранным видом). |
| `overlayCalendar` | boolean (`true`) | Включает функцию наложения календарей (overlay) поверх основного, в week/column-раскладках. |
| `recurringEventCount` | число | Количество повторов для рекуррентных событий. |
| `cal.tz` | строка (IANA TZ) | Часовой пояс. |
| `bookingUid` / `rescheduleUid` | строка | Идентификатор бронирования (напр. для seat-reference / переноса). |
| prefill-параметры | строки | `name`, `email`, `guests`, `notes` и кастомные поля — предзаполняют форму бронирования. |

**Каскад вывода месяца** (из `store.ts`): явный `month` → иначе выводится из `date` (`dayjs(date).format("YYYY-MM")`) → иначе текущий месяц.

```javascript
month: getQueryParam("month") ||
  (getQueryParam("date") && dayjs(getQueryParam("date")).isValid()
    ? dayjs(getQueryParam("date")).format("YYYY-MM")
    : null) ||
  dayjs().format("YYYY-MM")

selectedDate: getQueryParam("date") || null
selectedTimeslot: getQueryParam("slot") || null
```

**Поведение deep-linking:**
- `?date=2026-07-13` — открывает календарь на этой дате и предвыбирает день.
- `?date=2026-07-13&slot=2026-07-13T06:00:00.000Z` — дополнительно предвыбирает слот, максимально сокращая флоу (сразу к форме участника).
- `?overlayCalendar=true` — включает overlay-календарь.

Во встраиваемом/платформенном режиме (`isPlatform`) обновление URL зависит от флага `allowUpdatingUrlParams` (read-only режим для эмбедов).

Источники: `store.ts`, `query-param.ts` (пути выше); https://cal.com/docs/platform/atoms/booker

---

## 3. Публичный API получения доступных слотов

### 3a. Внутренний tRPC-эндпоинт веб-приложения

Публичная страница использует tRPC-процедуру **`slots.getSchedule`**, вызываемую хуком `useSchedule()`. HTTP-путь на клиенте:

```
/api/trpc/public/slots.getSchedule
```

Роутер: `packages/trpc/server/routers/viewer/slots/_router.tsx`; обработчик — `getSchedule.handler.ts`; общая логика — `util.ts` (функция `getAvailableSlots` → `IGetAvailableSlots`); схема входа — `getSchedule.schema.ts` / `types.ts`. Процедуры роутера: `getSchedule`, `reserveSlot`, `removeSelectedSlot`, `isAvailable`.

Zod-схема входа `getScheduleSchema` (`types.ts`):

- Обязательные: `startTime` (string, дата), `endTime` (string, дата; должен быть позже `startTime`).
- Опциональные: `eventTypeId` (coerce int), `eventTypeSlug` (string), `usernameList` (string[], min 1), `timeZone`, `duration` (string→int), `rescheduleUid` (string|null), `isTeamEvent` (boolean, default false), `orgSlug` (string|null), `teamMemberEmail`, `routedTeamMemberIds`, `email`, `debug`, плюс внутренние флаги (`_enableTroubleshooter`, `_bypassCalendarBusyTimes` и др.).
- Правило: нужно указать либо `eventTypeId`, либо пару `usernameList` + `eventTypeSlug`.

Источники: результаты поиска по репозиторию `calcom/cal.com` (`packages/trpc/server/routers/viewer/slots/*`), в т.ч. https://github.com/calcom/cal.com/issues/16446 (упоминает `viewer.public.slots.getSchedule`), https://github.com/calcom/cal.com/issues/11372

### 3b. Официальный публичный API v2 — `GET /v2/slots`

**Метод / URL:** `GET https://api.cal.com/v2/slots`
**Заголовок версии:** `cal-api-version: 2024-09-04` (обязателен; иначе endpoint откатывается к старой версии).
Авторизация: `Authorization: Bearer <token>`.

Query-параметры (источник: https://cal.com/docs/api-reference/v2/slots/get-available-time-slots-for-an-event-type):

| Параметр | Обяз. | Тип | Описание |
|---|---|---|---|
| `start` | да | string | ISO 8601 UTC (`2050-09-05` или `2050-09-05T09:00:00Z`). Без времени → начало дня. |
| `end` | да | string | ISO 8601 UTC (`2050-09-06` или `...T18:00:00Z`). Без времени → конец дня. |
| `eventTypeId` | нет* | number | ID типа события. |
| `eventTypeSlug` | нет* | string | Slug события (нужен с `username` или `teamSlug`). |
| `username` | нет* | string | Владелец события. |
| `usernames` | нет* | string | Список имён через запятую для dynamic-событий (min 2). |
| `teamSlug` | нет* | string | Slug команды для командных событий. |
| `organizationSlug` | нет | string | Slug организации, если применимо. |
| `timeZone` | нет | string | ЧП ответа; по умолчанию UTC (напр. `Europe/Rome`). |
| `duration` | нет | number | Длительность слота в минутах (для событий с несколькими длительностями / dynamic). |
| `format` | нет | string | `range` (start+end) или `time` (по умолчанию — только start). |
| `bookingUidToReschedule` | нет | string | UID существующего бронирования, чтобы исключить его время из занятости при переносе. |

\* Способ идентификации события — один из: `eventTypeId`, либо (`eventTypeSlug` + `username`/`teamSlug`), либо `usernames`.

**Форма ответа:** карта слотов, индексированная по дате; каждой дате соответствует массив слотов.

Пример (формат по умолчанию, `format=time`):
```json
{
  "status": "success",
  "data": {
    "2050-09-05": [
      { "start": "2050-09-05T09:00:00.000+02:00" },
      { "start": "2050-09-05T10:00:00.000+02:00" }
    ],
    "2050-09-06": [
      { "start": "2050-09-06T09:00:00.000+02:00" }
    ]
  }
}
```

Пример (`format=range`):
```json
{
  "status": "success",
  "data": {
    "2050-09-05": [
      { "start": "2050-09-05T09:00:00.000+02:00", "end": "2050-09-05T10:00:00.000+02:00" },
      { "start": "2050-09-05T10:00:00.000+02:00", "end": "2050-09-05T11:00:00.000+02:00" }
    ]
  }
}
```

Когда слотов нет: `"data": {}`.

Источник: https://cal.com/docs/api-reference/v2/slots/get-available-time-slots-for-an-event-type

Смежные эндпоинты слотов v2 (для полноты): `POST /v2/slots/reservations` (зарезервировать слот), `GET /v2/slots/reservations/{uid}` (получить резерв), `PATCH .../{uid}` (обновить резерв) — https://cal.com/docs/api-reference/v2/slots/reserve-a-slot

---

## 4. Публичный API создания бронирования — `POST /v2/bookings`

**Метод / URL:** `POST https://api.cal.com/v2/bookings`
**Заголовок версии:** `cal-api-version: 2024-08-13` (для создания бронирований). Авторизация опциональна (Bearer / OAuth).

> Примечание по версии: докстраница отдаёт значение `cal-api-version` в заголовке; каноническое значение для booking-эндпоинтов v2 — `2024-08-13`. Точное значение нужно сверять на живой докстранице (см. §Не подтверждено).

Поля тела запроса (источник: https://cal.com/docs/api-reference/v2/bookings/create-a-booking):

- **Обязательные:**
  - `start` (string, ISO 8601 **UTC**) — время начала. Важно: время в UTC. Для 11:00 по Риму (GMT+2) передавать `09:00Z`.
  - `attendee` (object) — `name`, `email`, `timeZone` (обяз.); опционально `phoneNumber`, `language`.
- **Идентификация события (один из вариантов):**
  - `eventTypeId` (number), либо
  - `eventTypeSlug` + `username` (+ опц. `organizationSlug`), либо
  - `eventTypeSlug` + `teamSlug` (+ опц. `organizationSlug`).
- **Опциональные:**
  - `bookingFieldsResponses` (object) — ответы на кастомные поля.
  - `metadata` (object) — до 50 ключей, ключ ≤ 40 симв., значение ≤ 500 симв.
  - `location` (object) — детали места встречи.
  - `lengthInMinutes` (number) — переопределение длительности события.
  - `guests` (array<string>) — email-адреса доп. участников.
  - `instant` (boolean) — только для командных событий.
  - `recurrenceCount` (number) — число повторов для рекуррентного бронирования.
  - `allowConflicts`, `allowBookingOutOfBounds` (boolean) — host-переопределения.

Пример запроса:
```json
{
  "eventTypeId": 123,
  "start": "2024-08-13T09:00:00Z",
  "attendee": {
    "name": "John Doe",
    "email": "john@example.com",
    "timeZone": "America/New_York",
    "language": "en",
    "phoneNumber": "+19876543210"
  },
  "guests": ["guest1@example.com"],
  "metadata": { "source": "api" },
  "bookingFieldsResponses": { "field1": "response1" }
}
```

Пример ответа:
```json
{
  "status": "success",
  "data": {
    "id": 123,
    "uid": "booking_uid_123",
    "title": "Consultation",
    "description": "Meeting details",
    "start": "2024-08-13T09:00:00Z",
    "end": "2024-08-13T10:00:00Z",
    "duration": 60,
    "status": "accepted",
    "eventType": { "id": 50, "slug": "my-event-type" },
    "location": "https://example.com/meeting",
    "attendees": [
      {
        "name": "John Doe",
        "email": "john@example.com",
        "displayEmail": "john@example.com",
        "timeZone": "America/New_York",
        "absent": false
      }
    ],
    "hosts": [
      {
        "id": 1,
        "name": "Jane Doe",
        "email": "jane@example.com",
        "username": "jane100",
        "timeZone": "America/Los_Angeles"
      }
    ],
    "createdAt": "2024-08-13T15:30:00Z",
    "updatedAt": "2024-08-13T15:30:00Z",
    "bookingFieldsResponses": { "field1": "response1" }
  }
}
```

Источник: https://cal.com/docs/api-reference/v2/bookings/create-a-booking

### Внутренний путь веб-приложения

Публичная страница НЕ вызывает `bookings.create` как tRPC-мутацию напрямую — создание идёт через обработчик **`handleNewBooking`** (`packages/features/bookings/lib/handleNewBooking/`), который принимает тело с полями `eventTypeId`, `start`/`end`, `responses` (внутри которых `name`, `email`, `guests`, `notes` и кастомные поля), `timeZone`, `language`, `metadata` и т.д. Точную Zod-схему тела (`getBookingDataSchema`) не удалось загрузить из raw-исходника (404) — см. §Не подтверждено.

---

## 5. Сводка форматов запрос/ответ

- **Слоты (v2):** запрос — `GET /v2/slots?eventTypeId=100&start=2050-09-05&end=2050-09-06&timeZone=Europe/Rome` c заголовком `cal-api-version: 2024-09-04`; ответ — `{ status, data: { "YYYY-MM-DD": [{ start[, end] }] } }`. Примеры JSON — §3b.
- **Слоты (внутренний):** `GET /api/trpc/public/slots.getSchedule` с входом `getScheduleSchema` (`eventTypeId` либо `usernameList`+`eventTypeSlug`, `startTime`, `endTime`, `timeZone`, `duration`, ...). Форма ответа детально в §3a.
- **Бронирование (v2):** `POST /v2/bookings` c `cal-api-version` заголовком; тело с `eventTypeId`/`start`/`attendee{...}`; ответ `{ status, data: { id, uid, start, end, status, attendees[], hosts[], ... } }`. Примеры JSON — §4.

---

## Не подтверждено первоисточником

- **Детальная форма ответа внутреннего `slots.getSchedule`** (наличие полей типа `away`, `fromReservation`, `attendees`/`spot` в элементах слота): подтверждён путь эндпоинта и входная Zod-схема; точная структура каждого элемента слота не извлечена из исходного `getSchedule.handler.ts` / `util.ts` (не удалось получить raw-файлы напрямую, найдены только упоминания в issues репозитория).
- **Zod-схема тела `handleNewBooking` / наличие мутации `bookings.create`:** raw-файл `getBookingDataSchema.ts` вернул 404. Подтверждено, что веб-приложение использует обработчик `handleNewBooking` (не публичную tRPC-мутацию `bookings.create`), но точный перечень полей схемы взят по общей структуре, а не процитирован построчно.
- **Точное значение `cal-api-version` для `POST /v2/bookings`:** докстраница отдаёт заголовок; каноническое значение для booking-эндпоинтов — `2024-08-13`, но требует сверки на живой докстранице (одна из выборок вернула `2026-02-25`, что похоже на артефакт кэша/версии).

---

## Источники

- https://cal.com/docs/api-reference/v2/slots/get-available-time-slots-for-an-event-type
- https://cal.com/docs/api-reference/v2/slots/reserve-a-slot
- https://cal.com/docs/api-reference/v2/bookings/create-a-booking
- https://cal.com/docs/api-reference/v2/introduction
- https://cal.com/docs/platform/atoms/booker
- `packages/features/bookings/Booker/store.ts` (calcom/cal.com, ветка main)
- `packages/features/bookings/Booker/utils/query-param.ts` (calcom/cal.com, ветка main)
- `packages/trpc/server/routers/viewer/slots/{_router.tsx,getSchedule.handler.ts,getSchedule.schema.ts,types.ts,util.ts}` (calcom/cal.com, ветка main)
- https://github.com/calcom/cal.com/issues/16446 (упоминание `viewer.public.slots.getSchedule`)
- https://github.com/calcom/cal.com/issues/11372 (getSchedule payload)
- https://cal.com/blog/how-custom-booking-links-improve-your-scheduling-process
