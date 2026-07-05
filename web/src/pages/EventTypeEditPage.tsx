import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  Anchor,
  Badge,
  Button,
  Card,
  Divider,
  Group,
  Loader,
  MultiSelect,
  NumberInput,
  Select,
  Stack,
  Switch,
  Tabs,
  Text,
  Textarea,
  TextInput,
  Title,
} from "@mantine/core";
import { DatePicker } from "@mantine/dates";
import { notifications } from "@mantine/notifications";
import {
  IconArrowLeft,
  IconAdjustments,
  IconSettings,
  IconClock,
} from "@tabler/icons-react";
import {
  availabilityApi,
  eventTypesApi,
  slotsApi,
  type EventLocation,
  type EventType,
  type Schedule,
  type Slot,
} from "../api/client";
import { confirm } from "../components/confirm";

type LocationKind = "google-meet" | "zoom" | "ms-teams" | "link" | "address" | "phone";

function toKind(loc: EventLocation | undefined): LocationKind {
  if (!loc) return "google-meet";
  if (loc.type === "integration") return loc.integration === "daily" ? "google-meet" : loc.integration;
  if (loc.type === "link") return "link";
  if (loc.type === "address") return "address";
  if (loc.type === "phone") return "phone";
  return "google-meet";
}

function buildLocation(kind: LocationKind, value: string): EventLocation {
  if (kind === "link") return { type: "link", link: value || "https://example.com" };
  if (kind === "address") return { type: "address", address: value, displayPublicly: true };
  if (kind === "phone") return { type: "phone", phone: value || undefined };
  return { type: "integration", integration: kind };
}

const DURATION_OPTIONS = ["15", "30", "45", "60", "90", "120"];
const CURRENCIES = ["RUB", "USD", "EUR"];

export default function EventTypeEditPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [et, setEt] = useState<EventType | null>(null);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [locKind, setLocKind] = useState<LocationKind>("google-meet");
  const [locValue, setLocValue] = useState("");
  const [saving, setSaving] = useState(false);
  // Инкрементируется после сохранения — по нему календарь доступности перезапрашивает слоты.
  const [savedTick, setSavedTick] = useState(0);

  useEffect(() => {
    eventTypesApi.get(Number(id)).then((data) => {
      setEt(data);
      const loc = data.locations[0];
      setLocKind(toKind(loc));
      if (loc?.type === "link") setLocValue(loc.link);
      else if (loc?.type === "address") setLocValue(loc.address);
      else if (loc?.type === "phone") setLocValue(loc.phone ?? "");
    });
    availabilityApi.list().then((page) => setSchedules(page.items));
  }, [id]);

  if (!et) return <Loader />;

  const set = <K extends keyof EventType>(key: K, value: EventType[K]) => setEt({ ...et, [key]: value });

  // Расписание, по которому реально считаются слоты: явно назначенное или по умолчанию.
  const activeSchedule = et.scheduleId
    ? schedules.find((s) => s.id === et.scheduleId)
    : schedules.find((s) => s.isDefault) ?? schedules[0];

  // ── Помощники для вложенных полей ──
  const priceEnabled = !!et.price;
  const priceMajor = et.price ? et.price.amount / 100 : 0;
  const setPrice = (patch: Partial<NonNullable<EventType["price"]>>) =>
    set("price", { amount: et.price?.amount ?? 0, currency: et.price?.currency ?? "RUB", ...patch });

  const recur = et.recurrence;
  const setRecur = (patch: Partial<NonNullable<EventType["recurrence"]>> | null) => {
    if (patch === null) return set("recurrence", undefined);
    set("recurrence", {
      frequency: recur?.frequency ?? "weekly",
      interval: recur?.interval ?? 1,
      count: recur?.count ?? 4,
      ...patch,
    });
  };

  const save = async () => {
    setSaving(true);
    try {
      await eventTypesApi.update(et.id, {
        title: et.title,
        slug: et.slug,
        description: et.description,
        lengthInMinutes: et.lengthInMinutes,
        lengthInMinutesOptions: et.lengthInMinutesOptions?.length ? et.lengthInMinutesOptions : undefined,
        locations: [buildLocation(locKind, locValue)],
        hidden: et.hidden,
        requiresConfirmation: et.requiresConfirmation,
        disableGuests: et.disableGuests,
        minimumBookingNotice: et.minimumBookingNotice,
        beforeEventBuffer: et.beforeEventBuffer,
        afterEventBuffer: et.afterEventBuffer,
        bookingWindowDays: et.bookingWindowDays,
        slotInterval: et.slotInterval,
        seatsPerTimeSlot: et.seatsPerTimeSlot,
        bookingLimits: et.bookingLimits,
        recurrence: et.recurrence,
        price: et.price,
        scheduleId: et.scheduleId,
      });
      notifications.show({ color: "teal", title: "Сохранено", message: `«${et.title}» обновлён.` });
      setSavedTick((t) => t + 1);
    } catch (e) {
      notifications.show({ color: "red", title: "Ошибка", message: e instanceof Error ? e.message : "" });
    } finally {
      setSaving(false);
    }
  };

  const needsValue = locKind === "link" || locKind === "address" || locKind === "phone";

  return (
    <Stack>
      <Group justify="space-between" align="flex-start">
        <div>
          <Anchor component={Link} to="/event-types" size="sm">
            <Group gap={4}>
              <IconArrowLeft size={14} /> Типы событий
            </Group>
          </Anchor>
          <Title order={2} mt={4}>
            {et.title}
          </Title>
          <Text c="dimmed" size="sm">
            /book/nina/{et.slug}
          </Text>
        </div>
        <Button onClick={save} loading={saving}>
          Сохранить
        </Button>
      </Group>

      <Tabs defaultValue="setup">
        <Tabs.List mb="md">
          <Tabs.Tab value="setup" leftSection={<IconSettings size={16} />}>
            Основное
          </Tabs.Tab>
          <Tabs.Tab value="availability" leftSection={<IconClock size={16} />}>
            Доступность
          </Tabs.Tab>
          <Tabs.Tab value="advanced" leftSection={<IconAdjustments size={16} />}>
            Дополнительно
          </Tabs.Tab>
        </Tabs.List>

        {/* ── Основное ── */}
        <Tabs.Panel value="setup">
          <Card withBorder padding="lg">
            <Stack>
              <TextInput label="Название" value={et.title} onChange={(e) => set("title", e.currentTarget.value)} />
              <TextInput
                label="Слаг"
                description={`/book/nina/${et.slug}`}
                value={et.slug}
                onChange={(e) => set("slug", e.currentTarget.value)}
              />
              <Textarea
                label="Описание"
                autosize
                minRows={2}
                value={et.description ?? ""}
                onChange={(e) => set("description", e.currentTarget.value || undefined)}
              />

              <Group grow align="flex-start">
                <NumberInput
                  label="Длительность, мин"
                  min={5}
                  max={1440}
                  value={et.lengthInMinutes}
                  onChange={(v) => set("lengthInMinutes", Number(v) || 0)}
                />
                <Select
                  label="Место проведения"
                  value={locKind}
                  onChange={(v) => setLocKind((v as LocationKind) ?? "google-meet")}
                  data={[
                    { value: "google-meet", label: "Google Meet" },
                    { value: "zoom", label: "Zoom" },
                    { value: "ms-teams", label: "Microsoft Teams" },
                    { value: "link", label: "Своя ссылка" },
                    { value: "address", label: "Личная встреча (адрес)" },
                    { value: "phone", label: "Телефонный звонок" },
                  ]}
                />
              </Group>

              {needsValue && (
                <TextInput
                  label={locKind === "link" ? "Ссылка" : locKind === "address" ? "Адрес" : "Телефон"}
                  value={locValue}
                  onChange={(e) => setLocValue(e.currentTarget.value)}
                />
              )}
            </Stack>
          </Card>
        </Tabs.Panel>

        {/* ── Доступность ── */}
        <Tabs.Panel value="availability">
          <Group align="flex-start" wrap="wrap">
            <Card withBorder padding="lg" style={{ flex: 1, minWidth: 300 }}>
              <Stack>
                <Select
                  label="Расписание доступности"
                  description="По какому расписанию считать свободные слоты"
                  value={et.scheduleId ? String(et.scheduleId) : ""}
                  onChange={(v) => set("scheduleId", v ? Number(v) : undefined)}
                  data={[
                    { value: "", label: "Расписание владельца по умолчанию" },
                    ...schedules.map((s) => ({ value: String(s.id), label: s.name })),
                  ]}
                />
                <SchedulePreview schedule={activeSchedule} />
                <Text size="xs" c="dimmed">
                  Календарь справа сразу показывает свободные слоты по выбранному расписанию с учётом
                  длительности ({et.lengthInMinutes} мин), буферов, окна бронирования и уже занятых
                  времён. Прочие изменения (длительность, буферы) применяются к календарю после
                  сохранения.
                </Text>
              </Stack>
            </Card>

            <Card withBorder padding="lg" style={{ flex: 1, minWidth: 320 }}>
              <Text fw={600} mb="sm">
                Календарь доступности
              </Text>
              <AvailabilityCalendar
                eventTypeId={et.id}
                scheduleId={activeSchedule?.id}
                timeZone={activeSchedule?.timeZone ?? "Europe/Moscow"}
                windowDays={et.bookingWindowDays ?? 60}
                refreshKey={savedTick}
              />
            </Card>
          </Group>
        </Tabs.Panel>

        {/* ── Дополнительно ── */}
        <Tabs.Panel value="advanced">
          <Card withBorder padding="lg">
            <Stack>
              <MultiSelect
                label="Варианты длительности, мин"
                description="Участник сам выбирает длительность на странице бронирования"
                data={DURATION_OPTIONS}
                value={(et.lengthInMinutesOptions ?? []).map(String)}
                onChange={(vals) =>
                  set(
                    "lengthInMinutesOptions",
                    vals.map(Number).sort((a, b) => a - b),
                  )
                }
                searchable
              />

              <Divider label="Оплата" labelPosition="left" />
              <Switch
                label="Платное событие"
                checked={priceEnabled}
                onChange={(e) =>
                  e.currentTarget.checked ? setPrice({}) : set("price", undefined)
                }
              />
              {priceEnabled && (
                <Group grow align="flex-start">
                  <NumberInput
                    label="Цена"
                    min={0}
                    value={priceMajor}
                    onChange={(v) => setPrice({ amount: Math.round((Number(v) || 0) * 100) })}
                  />
                  <Select
                    label="Валюта"
                    data={CURRENCIES}
                    value={et.price?.currency ?? "RUB"}
                    onChange={(v) => setPrice({ currency: v ?? "RUB" })}
                  />
                </Group>
              )}

              <Divider label="Повторение" labelPosition="left" />
              <Switch
                label="Повторяющееся событие"
                checked={!!recur}
                onChange={(e) => (e.currentTarget.checked ? setRecur({}) : setRecur(null))}
              />
              {recur && (
                <Group grow align="flex-start">
                  <Select
                    label="Частота"
                    data={[
                      { value: "daily", label: "Ежедневно" },
                      { value: "weekly", label: "Еженедельно" },
                      { value: "monthly", label: "Ежемесячно" },
                    ]}
                    value={recur.frequency}
                    onChange={(v) => setRecur({ frequency: (v as typeof recur.frequency) ?? "weekly" })}
                  />
                  <NumberInput
                    label="Каждые, N"
                    min={1}
                    value={recur.interval}
                    onChange={(v) => setRecur({ interval: Number(v) || 1 })}
                  />
                  <NumberInput
                    label="Кол-во повторений"
                    min={1}
                    max={730}
                    value={recur.count}
                    onChange={(v) => setRecur({ count: Number(v) || 1 })}
                  />
                </Group>
              )}

              <Divider label="Прочее" labelPosition="left" />
              <Switch
                label="Требует подтверждения"
                description="Бронь ожидает одобрения организатором"
                checked={et.requiresConfirmation}
                onChange={(e) => set("requiresConfirmation", e.currentTarget.checked)}
              />
              <Switch
                label="Запретить гостей"
                description="Участник не сможет добавить дополнительные email"
                checked={et.disableGuests}
                onChange={(e) => set("disableGuests", e.currentTarget.checked)}
              />
              <Switch
                label="Скрыть с публичной страницы"
                description="Событие останется доступно по прямой ссылке"
                checked={et.hidden}
                onChange={(e) => set("hidden", e.currentTarget.checked)}
              />
            </Stack>
          </Card>
        </Tabs.Panel>
      </Tabs>

      <Group>
        <Button
          color="red"
          variant="light"
          onClick={async () => {
            const ok = await confirm({
              title: "Удалить тип события?",
              message: `«${et.title}» будет удалён безвозвратно. Связанные брони тоже будут удалены.`,
              confirmLabel: "Удалить",
              danger: true,
            });
            if (!ok) return;
            try {
              await eventTypesApi.remove(et.id);
              notifications.show({ color: "blue", title: "Удалено", message: et.title });
              navigate("/event-types");
            } catch (e) {
              notifications.show({ color: "red", title: "Не удалось удалить", message: e instanceof Error ? e.message : "" });
            }
          }}
        >
          Удалить тип события
        </Button>
      </Group>
    </Stack>
  );
}

// ── Превью недельных часов выбранного расписания (read-only) ──
const PREVIEW_DAYS: { key: string; label: string }[] = [
  { key: "monday", label: "Пн" },
  { key: "tuesday", label: "Вт" },
  { key: "wednesday", label: "Ср" },
  { key: "thursday", label: "Чт" },
  { key: "friday", label: "Пт" },
  { key: "saturday", label: "Сб" },
  { key: "sunday", label: "Вс" },
];
const hhmm = (t: string) => t.slice(0, 5);

function SchedulePreview({ schedule }: { schedule: Schedule | undefined }) {
  if (!schedule) return null;
  return (
    <div>
      <Text size="sm" fw={500} mb={4}>
        {schedule.name} · {schedule.timeZone}
      </Text>
      <Stack gap={2}>
        {PREVIEW_DAYS.map(({ key, label }) => {
          const ranges = (schedule.availability ?? [])
            .filter((r) => r.days.includes(key as never))
            .map((r) => `${hhmm(r.startTime)}–${hhmm(r.endTime)}`);
          return (
            <Group key={key} gap="xs" wrap="nowrap">
              <Text size="sm" w={28} c="dimmed">
                {label}
              </Text>
              <Text size="sm" c={ranges.length ? undefined : "dimmed"}>
                {ranges.length ? ranges.join(", ") : "Недоступно"}
              </Text>
            </Group>
          );
        })}
      </Stack>
    </div>
  );
}

// ── Календарь: подсвечивает дни со свободными слотами, показывает времена дня ──
const toISODate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

function AvailabilityCalendar({
  eventTypeId,
  scheduleId,
  timeZone,
  windowDays,
  refreshKey,
}: {
  eventTypeId: number;
  scheduleId: number | undefined;
  timeZone: string;
  windowDays: number;
  refreshKey: number;
}) {
  const [byDate, setByDate] = useState<Map<string, Slot[]>>(new Map());
  const [selected, setSelected] = useState<Date | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const today = new Date();
    const end = new Date();
    end.setDate(end.getDate() + Math.min(windowDays, 60));
    slotsApi
      .list({ eventTypeId, scheduleId, start: toISODate(today), end: toISODate(end), timeZone })
      .then((res) => {
        const map = new Map<string, Slot[]>();
        const fmt = new Intl.DateTimeFormat("en-CA", {
          timeZone,
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        });
        for (const slot of res.slots) {
          const key = fmt.format(new Date(slot.start));
          if (!map.has(key)) map.set(key, []);
          map.get(key)!.push(slot);
        }
        setByDate(map);
        setSelected(null);
      })
      .finally(() => setLoading(false));
  }, [eventTypeId, scheduleId, timeZone, windowDays, refreshKey]);

  const fmtTime = (iso: string) =>
    new Intl.DateTimeFormat("ru-RU", { hour: "2-digit", minute: "2-digit", timeZone }).format(
      new Date(iso),
    );

  if (loading) return <Loader size="sm" />;

  const selectedKey = selected ? toISODate(selected) : null;
  const daySlots = selectedKey ? byDate.get(selectedKey) ?? [] : [];

  return (
    <Stack align="center" gap="sm">
      {byDate.size === 0 ? (
        <Text size="sm" c="dimmed" ta="center">
          Нет свободных слотов в ближайшие {Math.min(windowDays, 60)} дн. Проверьте расписание и
          ограничения.
        </Text>
      ) : (
        <DatePicker
          value={selected}
          onChange={(v) => setSelected(v as unknown as Date | null)}
          getDayProps={(date) => ({
            disabled: !byDate.has(toISODate(date as unknown as Date)),
          })}
        />
      )}

      {selected && (
        <div style={{ width: "100%" }}>
          <Text size="sm" fw={500} mb={6}>
            Свободные слоты · {selected.toLocaleDateString("ru-RU", { day: "numeric", month: "long" })}
          </Text>
          {daySlots.length === 0 ? (
            <Text size="sm" c="dimmed">
              В этот день слотов нет.
            </Text>
          ) : (
            <Group gap={6}>
              {daySlots.map((s) => (
                <Badge key={s.start} variant="light" size="lg" style={{ textTransform: "none" }}>
                  {fmtTime(s.start)}
                </Badge>
              ))}
            </Group>
          )}
        </div>
      )}
    </Stack>
  );
}
