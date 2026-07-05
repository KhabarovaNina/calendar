import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  ActionIcon,
  Anchor,
  Button,
  Card,
  Checkbox,
  Divider,
  Group,
  Loader,
  Menu,
  Popover,
  Select,
  Stack,
  Switch,
  Text,
  TextInput,
  Title,
  Tooltip,
} from "@mantine/core";
import { TimeInput, DatePickerInput } from "@mantine/dates";
import { notifications } from "@mantine/notifications";
import {
  IconArrowLeft,
  IconCopy,
  IconPlus,
  IconTrash,
  IconCalendarPlus,
} from "@tabler/icons-react";
import {
  availabilityApi,
  type AvailabilityRule,
  type DateOverride,
  type Schedule,
} from "../api/client";
import { confirm } from "../components/confirm";

type Weekday = AvailabilityRule["days"][number];

const DAYS: { key: Weekday; label: string; short: string }[] = [
  { key: "monday", label: "Понедельник", short: "Пн" },
  { key: "tuesday", label: "Вторник", short: "Вт" },
  { key: "wednesday", label: "Среда", short: "Ср" },
  { key: "thursday", label: "Четверг", short: "Чт" },
  { key: "friday", label: "Пятница", short: "Пт" },
  { key: "saturday", label: "Суббота", short: "Сб" },
  { key: "sunday", label: "Воскресенье", short: "Вс" },
];

const TZ = [
  "Europe/Moscow",
  "Europe/Kaliningrad",
  "Asia/Yekaterinburg",
  "Asia/Novosibirsk",
  "Asia/Krasnoyarsk",
  "Asia/Vladivostok",
  "Europe/London",
  "Europe/Berlin",
  "America/New_York",
  "UTC",
];

interface Range {
  start: string; // "HH:mm"
  end: string;
}
type Days = Record<Weekday, { enabled: boolean; ranges: Range[] }>;

const hhmm = (t: string) => t.slice(0, 5);
const toApiTime = (t: string) => (t.length === 5 ? `${t}:00` : t);
const DEFAULT_RANGE: Range = { start: "09:00", end: "18:00" };

function scheduleToDays(schedule: Schedule): Days {
  const days = {} as Days;
  for (const { key } of DAYS) days[key] = { enabled: false, ranges: [] };
  for (const rule of schedule.availability ?? []) {
    for (const day of rule.days) {
      days[day].enabled = true;
      days[day].ranges.push({ start: hhmm(rule.startTime), end: hhmm(rule.endTime) });
    }
  }
  // У включённого дня без интервалов ставим значение по умолчанию.
  for (const { key } of DAYS) {
    if (days[key].enabled && days[key].ranges.length === 0) days[key].ranges = [{ ...DEFAULT_RANGE }];
  }
  return days;
}

/** Каждый интервал каждого дня → отдельное правило AvailabilityRule. */
function daysToRules(days: Days): AvailabilityRule[] {
  const rules: AvailabilityRule[] = [];
  for (const { key } of DAYS) {
    if (!days[key].enabled) continue;
    for (const r of days[key].ranges) {
      rules.push({ days: [key], startTime: toApiTime(r.start), endTime: toApiTime(r.end) });
    }
  }
  return rules;
}

const toISODate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const fmtOverrideDate = (iso: string) =>
  new Date(iso + "T00:00:00").toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

export default function AvailabilityEditPage() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [schedule, setSchedule] = useState<Schedule | null>(null);
  const [name, setName] = useState("");
  const [tz, setTz] = useState("Europe/Moscow");
  const [isDefault, setIsDefault] = useState(false);
  const [days, setDays] = useState<Days | null>(null);
  const [overrides, setOverrides] = useState<DateOverride[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    availabilityApi.get(Number(id)).then((s) => {
      setSchedule(s);
      setName(s.name);
      setTz(s.timeZone);
      setIsDefault(!!s.isDefault);
      setDays(scheduleToDays(s));
      setOverrides(s.overrides ?? []);
    });
  }, [id]);

  if (!schedule || !days) return <Loader />;

  const patchDay = (key: Weekday, patch: Partial<Days[Weekday]>) =>
    setDays({ ...days, [key]: { ...days[key], ...patch } });

  const setRange = (key: Weekday, i: number, patch: Partial<Range>) => {
    const ranges = days[key].ranges.map((r, idx) => (idx === i ? { ...r, ...patch } : r));
    patchDay(key, { ranges });
  };

  const addRange = (key: Weekday) => {
    const last = days[key].ranges[days[key].ranges.length - 1];
    const next: Range = last ? { start: last.end, end: last.end } : { ...DEFAULT_RANGE };
    patchDay(key, { ranges: [...days[key].ranges, next] });
  };

  const removeRange = (key: Weekday, i: number) => {
    const ranges = days[key].ranges.filter((_, idx) => idx !== i);
    patchDay(key, ranges.length ? { ranges } : { enabled: false, ranges: [] });
  };

  const toggleDay = (key: Weekday, enabled: boolean) =>
    patchDay(key, enabled ? { enabled, ranges: days[key].ranges.length ? days[key].ranges : [{ ...DEFAULT_RANGE }] } : { enabled: false });

  const copyToDays = (from: Weekday, targets: Weekday[]) => {
    const src = days[from].ranges.map((r) => ({ ...r }));
    const next = { ...days };
    for (const t of targets) next[t] = { enabled: true, ranges: src.map((r) => ({ ...r })) };
    setDays(next);
  };

  const save = async () => {
    setSaving(true);
    try {
      const updated = await availabilityApi.update(schedule.id, {
        name,
        timeZone: tz,
        availability: daysToRules(days),
        overrides,
        isDefault,
      });
      setSchedule(updated);
      notifications.show({ color: "teal", title: "Сохранено", message: `Расписание «${name}» обновлено.` });
    } catch (e) {
      notifications.show({ color: "red", title: "Ошибка", message: e instanceof Error ? e.message : "" });
    } finally {
      setSaving(false);
    }
  };

  const removeSchedule = async () => {
    const ok = await confirm({
      title: "Удалить расписание?",
      message: `Расписание «${name}» будет удалено безвозвратно.`,
      confirmLabel: "Удалить",
      danger: true,
    });
    if (!ok) return;
    await availabilityApi.remove(schedule.id);
    notifications.show({ color: "blue", title: "Удалено", message: name });
    navigate("/availability");
  };

  return (
    <Stack>
      <Group justify="space-between" align="flex-start" wrap="nowrap">
        <div style={{ minWidth: 0 }}>
          <Anchor component={Link} to="/availability" size="sm">
            <Group gap={4}>
              <IconArrowLeft size={14} /> Доступность
            </Group>
          </Anchor>
          <TextInput
            mt={6}
            size="md"
            variant="unstyled"
            value={name}
            onChange={(e) => setName(e.currentTarget.value)}
            styles={{ input: { fontSize: 24, fontWeight: 700 } }}
            placeholder="Название расписания"
          />
        </div>
        <Group gap="sm" wrap="nowrap">
          <Switch
            label="По умолчанию"
            checked={isDefault}
            onChange={(e) => setIsDefault(e.currentTarget.checked)}
          />
          <Button onClick={save} loading={saving}>
            Сохранить
          </Button>
        </Group>
      </Group>

      <Group align="flex-start" grow={false} wrap="wrap">
        {/* Недельные часы */}
        <Card withBorder padding="lg" style={{ flex: 2, minWidth: 320 }}>
          <Text fw={600} mb="md">
            Рабочие часы
          </Text>
          <Stack gap="sm">
            {DAYS.map(({ key, label }) => {
              const d = days[key];
              return (
                <Group key={key} align="flex-start" wrap="nowrap" gap="md">
                  <Switch
                    checked={d.enabled}
                    onChange={(e) => toggleDay(key, e.currentTarget.checked)}
                    label={label}
                    styles={{ root: { width: 150, paddingTop: 6 }, body: { alignItems: "center" } }}
                  />

                  {d.enabled ? (
                    <Stack gap={6} style={{ flex: 1 }}>
                      {d.ranges.map((r, i) => (
                        <Group key={i} gap="xs" wrap="nowrap">
                          <TimeInput
                            value={r.start}
                            onChange={(e) => setRange(key, i, { start: e.currentTarget.value })}
                            w={110}
                          />
                          <Text c="dimmed">—</Text>
                          <TimeInput
                            value={r.end}
                            onChange={(e) => setRange(key, i, { end: e.currentTarget.value })}
                            w={110}
                          />
                          <ActionIcon
                            variant="subtle"
                            color="gray"
                            onClick={() => removeRange(key, i)}
                            aria-label="Удалить интервал"
                          >
                            <IconTrash size={16} />
                          </ActionIcon>
                          {i === d.ranges.length - 1 && (
                            <>
                              <Tooltip label="Добавить интервал">
                                <ActionIcon variant="subtle" color="gray" onClick={() => addRange(key)}>
                                  <IconPlus size={16} />
                                </ActionIcon>
                              </Tooltip>
                              <CopyDayMenu from={key} onCopy={copyToDays} />
                            </>
                          )}
                        </Group>
                      ))}
                    </Stack>
                  ) : (
                    <Text c="dimmed" size="sm" pt={6}>
                      Недоступно
                    </Text>
                  )}
                </Group>
              );
            })}
          </Stack>
        </Card>

        {/* Настройки + переопределения */}
        <Stack style={{ flex: 1, minWidth: 280 }}>
          <Card withBorder padding="lg">
            <Select
              label="Таймзона"
              data={TZ}
              value={tz}
              onChange={(v) => setTz(v ?? tz)}
              searchable
            />
          </Card>

          <Card withBorder padding="lg">
            <Group justify="space-between" mb={4}>
              <Text fw={600}>Переопределения дат</Text>
            </Group>
            <Text c="dimmed" size="sm" mb="md">
              Задайте особые часы или выходной на конкретную дату.
            </Text>

            <Stack gap="xs" mb="md">
              {overrides.length === 0 && (
                <Text c="dimmed" size="sm">
                  Переопределений пока нет.
                </Text>
              )}
              {overrides
                .slice()
                .sort((a, b) => (a.date < b.date ? -1 : 1))
                .map((o) => (
                  <Group key={o.date} justify="space-between" wrap="nowrap">
                    <div>
                      <Text size="sm" fw={500}>
                        {fmtOverrideDate(o.date)}
                      </Text>
                      <Text size="xs" c={o.intervals.length ? "dimmed" : "red"}>
                        {o.intervals.length
                          ? o.intervals.map((iv) => `${hhmm(iv.startTime)}–${hhmm(iv.endTime)}`).join(", ")
                          : "Недоступно"}
                      </Text>
                    </div>
                    <ActionIcon
                      variant="subtle"
                      color="gray"
                      onClick={() => setOverrides(overrides.filter((x) => x.date !== o.date))}
                      aria-label="Удалить переопределение"
                    >
                      <IconTrash size={16} />
                    </ActionIcon>
                  </Group>
                ))}
            </Stack>

            <AddOverride
              existing={overrides.map((o) => o.date)}
              onAdd={(o) => setOverrides([...overrides.filter((x) => x.date !== o.date), o])}
            />
          </Card>

          <Button variant="light" color="red" onClick={removeSchedule}>
            Удалить расписание
          </Button>
        </Stack>
      </Group>
    </Stack>
  );
}

/** Меню «копировать часы дня на другие дни». */
function CopyDayMenu({
  from,
  onCopy,
}: {
  from: Weekday;
  onCopy: (from: Weekday, targets: Weekday[]) => void;
}) {
  const [opened, setOpened] = useState(false);
  const [sel, setSel] = useState<Weekday[]>([]);

  return (
    <Popover opened={opened} onChange={setOpened} position="bottom-end" withinPortal shadow="md">
      <Popover.Target>
        <Tooltip label="Копировать на другие дни">
          <ActionIcon variant="subtle" color="gray" onClick={() => setOpened((o) => !o)}>
            <IconCopy size={16} />
          </ActionIcon>
        </Tooltip>
      </Popover.Target>
      <Popover.Dropdown>
        <Stack gap="xs">
          <Text size="sm" fw={500}>
            Скопировать часы на:
          </Text>
          {DAYS.filter((d) => d.key !== from).map((d) => (
            <Checkbox
              key={d.key}
              label={d.label}
              checked={sel.includes(d.key)}
              onChange={(e) =>
                setSel(e.currentTarget.checked ? [...sel, d.key] : sel.filter((x) => x !== d.key))
              }
            />
          ))}
          <Button
            size="xs"
            disabled={sel.length === 0}
            onClick={() => {
              onCopy(from, sel);
              setSel([]);
              setOpened(false);
            }}
          >
            Применить
          </Button>
        </Stack>
      </Popover.Dropdown>
    </Popover>
  );
}

/** Форма добавления переопределения даты. */
function AddOverride({
  existing,
  onAdd,
}: {
  existing: string[];
  onAdd: (o: DateOverride) => void;
}) {
  const [opened, setOpened] = useState(false);
  const [date, setDate] = useState<Date | null>(null);
  const [available, setAvailable] = useState(true);
  const [start, setStart] = useState("09:00");
  const [end, setEnd] = useState("18:00");

  const excluded = useMemo(() => new Set(existing), [existing]);

  const submit = () => {
    if (!date) return;
    const iso = toISODate(date);
    onAdd({
      date: iso,
      intervals: available ? [{ startTime: toApiTime(start), endTime: toApiTime(end) }] : [],
    });
    setOpened(false);
    setDate(null);
    setAvailable(true);
  };

  return (
    <Popover opened={opened} onChange={setOpened} position="bottom" withinPortal shadow="md">
      <Popover.Target>
        <Button
          variant="light"
          leftSection={<IconCalendarPlus size={16} />}
          onClick={() => setOpened((o) => !o)}
          fullWidth
        >
          Добавить переопределение
        </Button>
      </Popover.Target>
      <Popover.Dropdown>
        <Stack gap="sm" w={260}>
          <DatePickerInput
            label="Дата"
            placeholder="Выберите дату"
            value={date}
            onChange={(v) => setDate(v as unknown as Date | null)}
            excludeDate={(d) => excluded.has(toISODate(d as unknown as Date))}
            valueFormat="D MMMM YYYY"
            popoverProps={{ withinPortal: true }}
          />
          <Switch
            label={available ? "Доступно в этот день" : "Выходной (недоступно)"}
            checked={available}
            onChange={(e) => setAvailable(e.currentTarget.checked)}
          />
          {available && (
            <Group gap="xs" wrap="nowrap">
              <TimeInput value={start} onChange={(e) => setStart(e.currentTarget.value)} w={110} />
              <Text c="dimmed">—</Text>
              <TimeInput value={end} onChange={(e) => setEnd(e.currentTarget.value)} w={110} />
            </Group>
          )}
          <Divider />
          <Group justify="flex-end" gap="xs">
            <Button variant="default" size="xs" onClick={() => setOpened(false)}>
              Отмена
            </Button>
            <Button size="xs" disabled={!date} onClick={submit}>
              Добавить
            </Button>
          </Group>
        </Stack>
      </Popover.Dropdown>
    </Popover>
  );
}
