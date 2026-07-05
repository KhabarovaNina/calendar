# Как устроен и работает cal.com — принципы платформы бронирования

Исследование основано на **первичных источниках**: исходный код cal.com (github.com/calcom/cal.com), Prisma-схема БД, официальная документация и справка (cal.com/docs, cal.com/help). Ссылки — с указанием файлов и строк там, где читался код. Полный список — в разделе [Источники](#источники).

Терминология проекта (см. `CONTEXT.md`) сопоставлена с сущностями cal.com прямо по тексту. Технические имена полей и моделей оставлены на английском.

Сопоставление ubiquitous language нашего проекта и cal.com:

| Наш термин | cal.com |
| --- | --- |
| `Organizer` | владелец `EventType`, поле `EventType.userId` / relation `owner` ([schema.prisma L174-175](https://github.com/calcom/cal.com/blob/main/packages/prisma/schema.prisma)) |
| `Attendee` | `Attendee` (model) — `email`, `name`, `timeZone` ([schema.prisma L826-841](https://github.com/calcom/cal.com/blob/main/packages/prisma/schema.prisma)) |
| `Event Type` | `EventType` (model) |
| `Booking` | `Booking` (model), публичный адрес через `uid` |
| `Availability` (наш `Schedule`) | `Schedule` (model) + строки `Availability` (model) |
| `Availability Rule` | строка `Availability` с `days[]` + `startTime`/`endTime` |
| `Date Override` | строка `Availability` с непустым полем `date` |
| `Slot` | вычисляемый результат `getSlots()` (нигде не хранится) |
| `Seat` | `EventType.seatsPerTimeSlot` + model `BookingSeat` |

---

## 1. Event Types (типы событий)

**Event Type** — настраиваемый шаблон встречи, который можно забронировать; сам по себе ко времени не привязан. Организатор публикует несколько разных Event Types (30-мин звонок, 60-мин консультация и т.п.), каждый со своими правилами ([cal.com/help/event-types/event-types](https://cal.com/help/event-types/event-types)).

Авторитетный источник конфигурации — модель `EventType` в Prisma-схеме ([packages/prisma/schema.prisma L156-275](https://github.com/calcom/cal.com/blob/main/packages/prisma/schema.prisma)). Ключевые поля:

### Идентификация и публичный URL
- `title` — название; `description` — описание.
- `slug` — часть публичного URL. Публичная страница бронирования имеет вид `/{username}/{slug}` (для командных — `/team/{teamSlug}/{slug}`) ([cal.com/help/event-types/event-types](https://cal.com/help/event-types/event-types)). Это ровно тот формат, что и в нашем `CONTEXT.md`.
- `hidden` — скрыть Event Type из публичного профиля.
- `position` — порядок отображения.

### Длительность
- `length` (`Int`, `@zod.number.min(1)`) — базовая длительность встречи в минутах ([schema.prisma L168](https://github.com/calcom/cal.com/blob/main/packages/prisma/schema.prisma)).
- **Multiple durations** — можно предложить несколько вариантов длительности в одном Event Type (хранится в `metadata`), при этом задаётся default; никакого лимита на число вариантов нет ([cal.com/docs/core-features/event-types/multiple-durations](https://cal.com/docs/core-features/event-types/multiple-durations)). На бронировании выбранная длительность приходит как `input.duration` и переопределяет `length` (см. `getSlots` ниже).
- `slotInterval` (`Int?`) — шаг сетки слотов, независимый от длительности (например, встреча 30 мин, но слоты каждые 60 мин). Если не задан — шаг равен длительности (см. §4).
- `offsetStart` (`Int`, default 0) — сдвиг начала каждого слота на N минут.

### Locations (места проведения)
- `locations` (`Json`) — список предлагаемых способов проведения (адрес, ссылка, звонок, видео-интеграция типа Cal Video/Zoom/Google Meet, «attendee выбирает сам»). `Event Type` предлагает варианты, конкретная `Booking` фиксирует один в `Booking.location` ([schema.prisma L166, L872](https://github.com/calcom/cal.com/blob/main/packages/prisma/schema.prisma)).

### Scheduling type (тип распределения)
- `schedulingType` (`SchedulingType?`) — enum `ROUND_ROBIN` / `COLLECTIVE` / `MANAGED` ([schema.prisma L42-46](https://github.com/calcom/cal.com/blob/main/packages/prisma/schema.prisma)). Индивидуальное событие имеет `schedulingType = null` (один организатор). Значения `collective`/`roundRobin`/`managed` подразумевают команды (`Team`) — в нашем домене вне scope.
- «Групповое событие» (несколько attendee в одном слоте) в cal.com реализуется **не** через `schedulingType`, а через **seats** (см. ниже) — это отдельный механизм.

### Seats (места / групповые брони)
- `seatsPerTimeSlot` (`Int?`) — если задано, один слот может занять несколько независимых `Attendee`. Включается на вкладке Advanced → «Offer Seats»; хорош для групповых классов, экскурсий, ориентаций, open house ([cal.com/help/event-types/offer-seats](https://cal.com/help/event-types/offer-seats)).
- `seatsShowAttendees` (default false) — показывать ли участникам друг друга.
- `seatsShowAvailabilityCount` (default true) — показывать ли число оставшихся мест ([schema.prisma L229-230](https://github.com/calcom/cal.com/blob/main/packages/prisma/schema.prisma)).
- Слот исчезает, когда все места заняты (логика в §4). Это наш `Seat`.

### Buffers и notice (вкладка Limits)
- `beforeEventBuffer`, `afterEventBuffer` (`Int`, default 0) — буфер до/после встречи; блокируют соседнее время ([schema.prisma L220-221](https://github.com/calcom/cal.com/blob/main/packages/prisma/schema.prisma)).
- `minimumBookingNotice` (`Int`, default **120** минут) — минимальный запас времени: нельзя забронировать «прямо сейчас» ([schema.prisma L219](https://github.com/calcom/cal.com/blob/main/packages/prisma/schema.prisma); [cal.com/blog/setting-up-minimum-notice-period-in-scheduling](https://cal.com/blog/setting-up-minimum-notice-period-in-scheduling)).

### Частотные и длительностные лимиты
- `bookingLimits` (`Json`) — лимит на **число** броней за период (в день/неделю/месяц/год), например «не больше 1 раза в день» ([schema.prisma L246](https://github.com/calcom/cal.com/blob/main/packages/prisma/schema.prisma); [cal.com/blog/booking-limits-frequency-duration-future](https://cal.com/blog/booking-limits-frequency-duration-future)).
- `durationLimits` (`Json`) — лимит на суммарную **длительность** броней за период.

### Future limit (окно бронирования в будущее)
Определяется парой `periodType` + связанными полями ([schema.prisma L196-202](https://github.com/calcom/cal.com/blob/main/packages/prisma/schema.prisma)). Enum `PeriodType`: `UNLIMITED` / `ROLLING` / `ROLLING_WINDOW` / `RANGE` ([schema.prisma L48-53](https://github.com/calcom/cal.com/blob/main/packages/prisma/schema.prisma)):
- `UNLIMITED` — без ограничения в будущее.
- `ROLLING` — «всегда доступно N дней вперёд»: скользящее окно, каждый прошедший день открывает новый день в конце ([cal.com/docs/core-features/event-types/limit-future-bookings](https://cal.com/docs/core-features/event-types/limit-future-bookings)).
- `ROLLING_WINDOW` — вариант rolling, где отсчитываются именно **доступные** (bookable) дни (см. §5).
- `RANGE` — фиксированный диапазон дат `periodStartDate`…`periodEndDate`.
- `periodDays` — число дней окна; `periodCountCalendarDays` — считать календарные дни (true) или рабочие/business days (false).

### Прочее, влияющее на бронирование
- `requiresConfirmation` (default false) — бронь создаётся в статусе `PENDING` и ждёт подтверждения организатора; `requiresConfirmationWillBlockSlot` — блокировать ли слот на время ожидания ([schema.prisma L205-206](https://github.com/calcom/cal.com/blob/main/packages/prisma/schema.prisma)).
- `disableGuests` — запретить участнику добавлять `Guest`.
- `bookingFields` (`Json`) — поля формы бронирования (наш `Booking Field`); ответы участника сохраняются в `Booking.responses` ([schema.prisma L193-194, L868](https://github.com/calcom/cal.com/blob/main/packages/prisma/schema.prisma)).
- `recurringEvent` (`Json`) — повторяющиеся встречи.
- `onlyShowFirstAvailableSlot` — показывать только первый свободный слот в дне.
- `showOptimizedSlots` — «оптимизировать» выравнивание слотов по началу часа (см. §4).
- `scheduleId` / `schedule` (`Schedule?`) — привязка к конкретной `Availability` (см. §2).

### Дашборд app.cal.com/event-types
Список Event Types организатора с их публичными ссылками; здесь их создают, редактируют (табы Event Setup / Availability / Limits / Advanced), скрывают, дублируют и сортируют ([cal.com/help/event-types/event-types](https://cal.com/help/event-types/event-types), [cal.com/blog/a-guide-to-cal-com-s-event-settings-and-features](https://cal.com/blog/a-guide-to-cal-com-s-event-settings-and-features)).

---

## 2. Availability / Schedules (доступность)

**Availability** в нашем домене = model `Schedule` в cal.com: именованный набор правил рабочего времени в одной таймзоне ([schema.prisma L945-958](https://github.com/calcom/cal.com/blob/main/packages/prisma/schema.prisma)).

Модель `Schedule`:
- `name` — имя расписания.
- `timeZone` (`String?`) — таймзона организатора для этого расписания.
- `userId` — владелец (`Organizer`).
- `availability` (`Availability[]`) — сами правила.
- Организатор может иметь несколько `Schedule`; один считается дефолтным. Если создано только одно расписание — оно становится дефолтным и применяется ко всем событиям ([cal.com/help/availabilities/set-up-your-availability](https://cal.com/help/availabilities/set-up-your-availability)). У пользователя есть `defaultScheduleId` (упоминается в `util.ts` при обработке travel schedules).

Модель `Availability` (строка расписания) ([schema.prisma L960-976](https://github.com/calcom/cal.com/blob/main/packages/prisma/schema.prisma)) кодирует **два** типа правил одной таблицей:
- **Weekly recurring rule** (наш `Availability Rule`): `days` (`Int[]`, 0=Sun…6=Sat) + `startTime`/`endTime` (`@db.Time`). Например, «Пн–Пт 09:00–17:00». Можно задать несколько интервалов в день (например 09:00–11:00 и 17:00–19:30) и копировать время на другие дни («Copy Times To») ([cal.com/help/availabilities/set-up-your-availability](https://cal.com/help/availabilities/set-up-your-availability)).
- **Date Override** (наш `Date Override`): непустое поле `date` (`@db.Date`) + `startTime`/`endTime`. Заменяет доступность на конкретную дату. Если интервалов на день нет — организатор в этот день недоступен. Прошедшие overrides автоматически архивируются/удаляются ([cal.com/help/availabilities/set-up-your-availability](https://cal.com/help/availabilities/set-up-your-availability); [cal.com/blog/what-are-date-overrides-and-how-do-i-enable-them](https://cal.com/blog/what-are-date-overrides-and-how-do-i-enable-them)). Дефолт нового расписания — 09:00–17:00.

Отличие от Out-of-Office: date override меняет часы конкретного дня, OOO помечает организатора отсутствующим (с переадресацией на замену) — это разные механизмы ([cal.com/blog/mastering-cal-com-date-overrides-vs-out-of-office-settings](https://cal.com/blog/mastering-cal-com-date-overrides-vs-out-of-office-settings)).

**Time zone**: у каждого `Schedule` своя `timeZone`. Есть даже travel schedules — временная смена таймзоны на период поездки (`getAdjustedTimezone` в date-ranges.ts) ([cal.com/blog/you-can-now-schedule-timezone-changes](https://cal.com/blog/you-can-now-schedule-timezone-changes)).

**Привязка к Event Type**: `EventType.scheduleId → Schedule`. Если не задано — используется дефолтное расписание пользователя ([schema.prisma L232-233](https://github.com/calcom/cal.com/blob/main/packages/prisma/schema.prisma)). Это ровно наша модель «Event Type ссылается на конкретную Availability или наследует дефолтную».

---

## 3. От расписания к DateRange (working hours → интервалы времени)

Прежде чем нарезать слоты, cal.com превращает недельные правила и overrides в конкретные интервалы `DateRange = { start, end }` на запрошенном диапазоне дат. Ключевой файл — [packages/features/schedules/lib/date-ranges.ts](https://github.com/calcom/cal.com/blob/main/packages/features/schedules/lib/date-ranges.ts).

`buildDateRanges({ availability, timeZone, dateFrom, dateTo, travelSchedules, outOfOffice })` (L226-330):
1. `processWorkingHours` (L32-173) — для каждого дня в `[dateFrom, dateTo]` проверяет, входит ли `dateInTz.day()` в `item.days`; если да — строит `start`/`end` этого дня, добавляя `startTime`/`endTime` к полуночи в таймзоне организатора. Аккуратно обрабатывает DST (смещение offset) и стыкует/сливает пересекающиеся интервалы.
2. Важный нюанс: доступность можно задать максимум до 23:59, и код специально «дотягивает» такой конец до полуночи следующего дня (`if (endResult.hour() === 23 && endResult.minute() === 59) endResult = endResult.add(1, "minute")`, L79-83).
3. `processDateOverride` (L175-215) — override превращается в один интервал на конкретную дату (пустой = день недоступен).
4. `processOOO` — OOO-даты дают нулевой интервал, чтобы «вычесть» рабочий день.
5. Возвращаются два набора: `dateRanges` (с учётом overrides) и `oooExcludedDateRanges` (дополнительно вычитает OOO). Нулевые интервалы (`start === end`) отфильтровываются (L316-327).

**Таймзоны**: рабочие часы считаются в таймзоне **организатора** (`Schedule.timeZone`), а `dateFrom/dateTo` приходят в таймзоне участника — код явно комментирует `timeZone /* Organizer timeZone */`, `dateFrom /* Attendee dateFrom */` (L227-230).

Для команд (collective/round-robin) индивидуальные `dateRanges` участников агрегируются в `getAggregatedAvailability` (пересечение для collective, объединение для round-robin) — вне нашего scope.

---

## 4. Slots (вычисление свободных слотов)

**Slot** нигде не хранится — он вычисляется. Сердце логики — [packages/features/schedules/lib/slots.ts](https://github.com/calcom/cal.com/blob/main/packages/features/schedules/lib/slots.ts), функция `getSlots` / `buildSlotsWithDateRanges`.

Вход `GetSlots` (L12-22): `inviteeDate`, `frequency`, `dateRanges`, `minimumBookingNotice`, `eventLength`, `offsetStart?`, `datesOutOfOffice?`, `showOptimizedSlots?`.

### 4.1. Определение шага сетки (interval)
Слоты нарезаются не как попало: выбирается «красивый» интервал выравнивания. Из `[60, 30, 20, 15, 10, 5]` берётся первый, на который `frequency` делится нацело (L114-121):
```
for (const int of [60,30,20,15,10,5]) if (frequency % int === 0) { interval = int; break; }
```
Так слоты начинаются на аккуратных отметках (:00, :30 и т.д.).

### 4.2. Нарезка на слоты
Для каждого `DateRange` (L127-227):
1. **Минимальный notice**: старт слота не раньше, чем `now + minimumBookingNotice`:
   `slotStartTime = range.start.isAfter(now.add(minimumBookingNotice, "minute")) ? range.start : startTimeWithMinNotice` (L123, L128-130). Так «слишком скорое» время отсекается сразу на нарезке.
2. Обнуляются секунды/миллисекунды, время переводится в таймзону участника (L133-138) — важно для получасовых оффсетов вроде Asia/Kolkata.
3. Если минута старта не кратна `interval`, старт «доводится» до границы: `getCorrectedSlotStartTime` (L27-69). Без `showOptimizedSlots` — округление вверх до `interval` в пределах часа. С `showOptimizedSlots` — хитрая логика: показать максимум слотов, но при возможности выровнять по началу часа / 15 / 5 мин (примеры в комментариях L49-64).
4. Прибавляется `offsetStart` (L149).
5. Цикл нарезки (L178-226):
   ```
   while (!slotStartTime.add(eventLength, "minutes").subtract(1, "second").isAfter(range.end)) {
     slots.set(key, {...});
     slotStartTime = slotStartTime.add(frequency + offsetStart, "minutes");
   }
   ```
   То есть слот добавляется, только если он **целиком помещается** в `range` (`start + eventLength ≤ range.end`), а следующий стартует через `frequency + offsetStart` минут.
6. `slotBoundaries` не дают слотам из соседних range налезать друг на друга (L151-176). OOO-даты помечаются `away: true` с указанием замены (L187-222).

Ключевое различие: **`eventLength`** — сколько длится встреча (влияет на «влезает ли»); **`frequency`** — шаг между началами слотов (`slotInterval`). При `slotInterval = null` frequency = длительность → слоты идут вплотную.

### 4.3. Что во что подставляется (оркестратор)
В [packages/trpc/server/routers/viewer/slots/util.ts](https://github.com/calcom/cal.com/blob/main/packages/trpc/server/routers/viewer/slots/util.ts) (L1091-1101):
```
getSlots({
  eventLength: input.duration || eventType.length,
  offsetStart: eventType.offsetStart,
  dateRanges: aggregatedAvailability,
  minimumBookingNotice: eventType.minimumBookingNotice,
  frequency: eventType.slotInterval || input.duration || eventType.length,
  ...
})
```
`aggregatedAvailability` — это `dateRanges` из §3 уже **после вычета** занятого времени (busy) и буферов (§4.4).

### 4.4. Вычет существующих броней и буферов
До нарезки из `dateRanges` убирается всё занятое. В [getUserAvailability.ts](https://github.com/calcom/cal.com/blob/main/packages/features/availability/lib/getUserAvailability.ts) (L648-649):
```
const dateRangesInWhichUserIsAvailable = subtract(dateRanges, formattedBusyTimes);
```
`busyTimes` берутся из существующих броней и подключённых календарей через `getBusyTimes`. Буферы применяются именно здесь: каждый занятый интервал **расширяется** на сумму буферов ([getBusyTimes.ts L135-136, L177-178](https://github.com/calcom/cal.com/blob/main/packages/features/busyTimes/services/getBusyTimes.ts)):
```
minutesToBlockBeforeEvent = eventType.beforeEventBuffer + afterEventBuffer;
minutesToBlockAfterEvent  = eventType.afterEventBuffer  + beforeEventBuffer;
start = start.subtract(minutesToBlockBeforeEvent); end = end.add(minutesToBlockAfterEvent);
```
Так учитываются и буфер текущего Event Type, и буфер уже стоящей встречи → между бронями остаётся защитный зазор. Пересечения слота с этими расширенными busy-интервалами делают время недоступным (через `subtract`).

Отдельно `getBusyTimesFromLimits` учитывает `bookingLimits`/`durationLimits`: если лимит на день/неделю исчерпан, соответствующий период целиком становится busy.

### 4.5. Финальная фильтрация по границам будущего/прошлого
После нарезки слоты ещё раз просеиваются в util.ts (L1330-1366): `isTimeViolatingFutureLimit` (окно `periodType`) и `isTimeOutOfBounds` (минимальный notice / прошлое, бросает `BookingDateInPastError`). Вычисление окна — `calculatePeriodLimits` в [packages/lib/isOutOfBounds.tsx](https://github.com/calcom/cal.com/blob/main/packages/lib/isOutOfBounds.tsx) (L26-166):
- `ROLLING` — `now + periodDays` (календарные) либо `businessDaysAdd(periodDays)` (рабочие) в таймзоне участника (L70-82).
- `ROLLING_WINDOW` — `getRollingWindowEndDate` (L168+) идёт по дням вперёд и считает только **bookable** дни, пока не наберёт `periodDays`; ограничен `ROLLING_WINDOW_PERIOD_MAX_DAYS_TO_CHECK`.
- `RANGE` — фиксированные `periodStartDate…periodEndDate` в таймзоне организатора (L111-158).

### 4.6. Seats при вычислении слотов
Если `seatsPerTimeSlot` задан, вместо «слот занят/свободен» считаются оставшиеся места. В util.ts к слотам подмешивается `currentSeats` (существующие брони с числом attendees, L1254-1296), плюс временно зарезервированные слоты (`reservedSlots`, L1166-1244). Слот со свободными местами остаётся видимым; исчезает, когда мест не осталось. При `seatsShowAvailabilityCount` отдаётся число `attendees`. Это реализация нашего `Seat`.

**Итоговый конвейер слота**: `Schedule` (weekly rules + overrides) → `buildDateRanges` (интервалы в TZ организатора) → вычитание busy + буферы → `subtract` → `getSlots` (нарезка по interval/frequency, с учётом minimumBookingNotice) → фильтр future limit / прошлого → корректировка на seats/reserved → сгруппировано по датам в TZ участника.

---

## 5. Bookings (брони) — жизненный цикл и статусы

**Booking** — конкретный экземпляр `EventType` на время с участником(ами), адресуемый через `uid`. Модель `Booking` ([schema.prisma L851-930](https://github.com/calcom/cal.com/blob/main/packages/prisma/schema.prisma)).

### Статусы (`BookingStatus`, L843-849)
- `ACCEPTED` — подтверждена (значение по умолчанию, `@default(ACCEPTED)`).
- `PENDING` — ждёт подтверждения организатора (когда `requiresConfirmation = true`).
- `CANCELLED` — отменена; причина в `cancellationReason` (наш `Cancel`).
- `REJECTED` — организатор отказал в подтверждении; причина в `rejectionReason` (наш `Reject`).
- `AWAITING_HOST` — ждёт хоста.

Отмена (`Cancel`, инициирует участник, `cancellationReason` + `cancelledBy`) и отклонение (`Reject`, инициирует организатор, `rejectionReason`) — разные вещи, как и в нашем `CONTEXT.md` ([schema.prisma L880-881, L905](https://github.com/calcom/cal.com/blob/main/packages/prisma/schema.prisma)).

### Ключевые поля брони
- `uid` (`@unique`) — публичный идентификатор; `idempotencyKey` — защита от дублей по времени+email (L853-855).
- `startTime` / `endTime`, `location`, `title`.
- `attendees` (`Attendee[]`) — участники (см. ниже).
- `responses` (`Json`) — ответы на `bookingFields` (наши `Booking Field`).
- `status`, `paid`, `payment` — оплата.
- **Reschedule** (наш `Reschedule`): `rescheduled` (bool), `fromReschedule` (uid исходной), `rescheduledBy` (L887-888, L907). Перенос — смена времени существующей брони.
- `recurringEventId` — связывает брони повторяющейся серии.
- `seatsReferences` (`BookingSeat[]`) — привязка мест (см. seats).
- `iCalUID` / `iCalSequence` — синхронизация с календарями.

### Attendee и Guest
Model `Attendee` ([schema.prisma L826-841](https://github.com/calcom/cal.com/blob/main/packages/prisma/schema.prisma)): `email`, `name`, `timeZone`, опционально `phoneNumber`, `noShow`. Авторизация участнику не нужна. У обычной брони attendee один; несколько — только у групповых (seated) событий. `Guest` (дополнительный приглашённый по email) добавляется участником, если `disableGuests = false`.

### Групповые (seated) брони
Каждый `Attendee`, занимающий место в одном слоте, связан через `BookingSeat`. Несколько независимых запросов бронирования наполняют одну `Booking` до `seatsPerTimeSlot`. `seatsShowAttendees` управляет видимостью участников друг для друга ([cal.com/help/event-types/offer-seats](https://cal.com/help/event-types/offer-seats)). Это отличается от collective/round-robin (там несколько **организаторов**, а не участников).

Создание брони проходит через большой пайплайн [packages/features/bookings/lib/handleNewBooking](https://github.com/calcom/cal.com/tree/main/packages/features/bookings/lib/handleNewBooking): `getBookingData` → `loadAndValidateUsers` → `ensureAvailableUsers` (перепроверка доступности на стороне сервера, защита от гонок) → `getRequiresConfirmationFlags` (PENDING vs ACCEPTED) → `getSeatedBooking` → `createBooking`.

---

## 6. Публичная страница бронирования `/{username}/{slug}`

Поток бронирования (компоненты `Booker`, [packages/features/bookings/Booker](https://github.com/calcom/cal.com/tree/main/packages/features/bookings/Booker)):
1. Участник открывает `/{username}/{slug}` (командное — `/team/{team}/{slug}`). Данные Event Type грузятся публично, без авторизации ([cal.com/help/event-types/event-types](https://cal.com/help/event-types/event-types)).
2. Показывается календарь; при выборе месяца/даты фронт запрашивает слоты через tRPC `slots.getSchedule` (или публичный REST `GET /slots`) — тот самый `getSlots`-конвейер из §4. Слоты приходят сгруппированными по датам в таймзоне участника; участник может переключить таймзону (если не залочена `lockTimeZoneToggleOnBookingPage`).
3. Участник выбирает слот → заполняет форму (стандартные поля + `bookingFields`, при `disableGuests=false` может добавить гостей).
4. Отправка создаёт `Booking`. Если `requiresConfirmation` — статус `PENDING`, иначе `ACCEPTED`. Возвращается страница подтверждения с `uid`; по нему бронь можно отменить/перенести.
5. Для seated-события форма создаёт/занимает место; при заполнении всех мест слот пропадает.

Публичный REST-эндпоинт слотов документирован в API-референсе (v1 `GET /slots`, v2 `GET /v2/slots`) — принимает `eventTypeId`/(`username`+`eventTypeSlug`), `startTime`, `endTime`, `timeZone` и возвращает доступные слоты ([api.cal.com/docs](https://cal.com/docs/api-reference); исходники контроллеров — [apps/api/v2/src/modules/slots](https://github.com/calcom/cal.com/tree/main/apps/api/v2/src/modules/slots)).

---

## 7. Итоговое сопоставление с нашим проектом

- Наш `Slot` = результат `getSlots`, тоже не хранится — совпадает с cal.com.
- Наш `Availability` (`Schedule`) с `Availability Rule` + `Date Override` = cal.com `Schedule` + строки `Availability` (одна таблица, override отличается непустым `date`).
- Наш `Seat` / `seatsPerTimeSlot` = cal.com seats + `BookingSeat`.
- Наши статусы `Cancel`/`Reject` = cal.com `CANCELLED`/`REJECTED` с `cancellationReason`/`rejectionReason`.
- Отличие от нашего scope: cal.com богаче на командные `schedulingType` (collective/round-robin/managed), travel schedules, restriction schedules, повторяющиеся события, оплату — в нашем домене эти сущности пока отсутствуют.
- Полезное для нашего backend (`server/src/slots.js`): порядок фильтров cal.com — сначала строим рабочие интервалы в TZ организатора, вычитаем busy **с расширением на буферы** (before+after обеих встреч), затем режем по `interval`/`frequency` с уже учтённым `minimumBookingNotice`, и только потом отсекаем по future-limit. `frequency` (= `slotInterval`) отделён от `eventLength` — это два разных параметра.

---

## Источники

Исходный код (github.com/calcom/cal.com, ветка `main`):
- [packages/prisma/schema.prisma](https://github.com/calcom/cal.com/blob/main/packages/prisma/schema.prisma) — модели `EventType`, `Booking`, `Attendee`, `Schedule`, `Availability`, `BookingSeat`; enum `BookingStatus`, `PeriodType`, `SchedulingType`.
- [packages/features/schedules/lib/slots.ts](https://github.com/calcom/cal.com/blob/main/packages/features/schedules/lib/slots.ts) — `getSlots` / `buildSlotsWithDateRanges` (нарезка слотов).
- [packages/features/schedules/lib/date-ranges.ts](https://github.com/calcom/cal.com/blob/main/packages/features/schedules/lib/date-ranges.ts) — `buildDateRanges`, `processWorkingHours`, `processDateOverride`, `subtract`.
- [packages/features/availability/lib/getUserAvailability.ts](https://github.com/calcom/cal.com/blob/main/packages/features/availability/lib/getUserAvailability.ts) — вычет busy из dateRanges.
- [packages/features/busyTimes/services/getBusyTimes.ts](https://github.com/calcom/cal.com/blob/main/packages/features/busyTimes/services/getBusyTimes.ts) — применение буферов.
- [packages/trpc/server/routers/viewer/slots/util.ts](https://github.com/calcom/cal.com/blob/main/packages/trpc/server/routers/viewer/slots/util.ts) — оркестратор getSchedule.
- [packages/lib/isOutOfBounds.tsx](https://github.com/calcom/cal.com/blob/main/packages/lib/isOutOfBounds.tsx) — `calculatePeriodLimits`, future limits, min notice.
- [packages/features/bookings/lib/handleNewBooking](https://github.com/calcom/cal.com/tree/main/packages/features/bookings/lib/handleNewBooking) — пайплайн создания брони.
- [apps/api/v2/src/modules/slots](https://github.com/calcom/cal.com/tree/main/apps/api/v2/src/modules/slots) — REST-контроллеры слотов.

Документация и справка:
- [cal.com/help/event-types/event-types](https://cal.com/help/event-types/event-types)
- [cal.com/docs/core-features/event-types/multiple-durations](https://cal.com/docs/core-features/event-types/multiple-durations)
- [cal.com/docs/core-features/event-types/limit-future-bookings](https://cal.com/docs/core-features/event-types/limit-future-bookings)
- [cal.com/help/event-types/offer-seats](https://cal.com/help/event-types/offer-seats)
- [cal.com/help/availabilities/set-up-your-availability](https://cal.com/help/availabilities/set-up-your-availability)
- [cal.com/blog/booking-limits-frequency-duration-future](https://cal.com/blog/booking-limits-frequency-duration-future)
- [cal.com/blog/setting-up-minimum-notice-period-in-scheduling](https://cal.com/blog/setting-up-minimum-notice-period-in-scheduling)
- [cal.com/blog/what-are-date-overrides-and-how-do-i-enable-them](https://cal.com/blog/what-are-date-overrides-and-how-do-i-enable-them)
- [cal.com/blog/mastering-cal-com-date-overrides-vs-out-of-office-settings](https://cal.com/blog/mastering-cal-com-date-overrides-vs-out-of-office-settings)
- [cal.com/blog/you-can-now-schedule-timezone-changes](https://cal.com/blog/you-can-now-schedule-timezone-changes)
- [cal.com/blog/a-guide-to-cal-com-s-event-settings-and-features](https://cal.com/blog/a-guide-to-cal-com-s-event-settings-and-features)
- [cal.com API reference](https://cal.com/docs/api-reference)
