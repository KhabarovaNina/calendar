import { useEffect, useState } from "react";
import {
  Button,
  Card,
  Group,
  Loader,
  Select,
  Stack,
  Switch,
  Text,
  Title,
} from "@mantine/core";
import { TimeInput } from "@mantine/dates";
import { notifications } from "@mantine/notifications";
import { availabilityApi, type AvailabilityRule, type Schedule } from "../api/client";

type Weekday = AvailabilityRule["days"][number];

const DAYS: { key: Weekday; label: string }[] = [
  { key: "monday", label: "Понедельник" },
  { key: "tuesday", label: "Вторник" },
  { key: "wednesday", label: "Среда" },
  { key: "thursday", label: "Четверг" },
  { key: "friday", label: "Пятница" },
  { key: "saturday", label: "Суббота" },
  { key: "sunday", label: "Воскресенье" },
];

const TZ = [
  "Europe/Moscow",
  "Europe/Kaliningrad",
  "Asia/Yekaterinburg",
  "Asia/Novosibirsk",
  "Asia/Vladivostok",
  "Europe/London",
  "UTC",
];

interface DayState {
  enabled: boolean;
  start: string;
  end: string;
}

const hhmm = (t: string) => t.slice(0, 5); // "09:00:00" → "09:00"

function scheduleToDays(schedule: Schedule): Record<Weekday, DayState> {
  const result = {} as Record<Weekday, DayState>;
  for (const { key } of DAYS) result[key] = { enabled: false, start: "09:00", end: "18:00" };
  for (const rule of schedule.availability) {
    for (const day of rule.days) {
      result[day] = { enabled: true, start: hhmm(rule.startTime), end: hhmm(rule.endTime) };
    }
  }
  return result;
}

/** Группируем дни с одинаковым интервалом в правила AvailabilityRule[] */
function daysToRules(days: Record<Weekday, DayState>): AvailabilityRule[] {
  const byInterval = new Map<string, Weekday[]>();
  for (const { key } of DAYS) {
    const d = days[key];
    if (!d.enabled) continue;
    const k = `${d.start}-${d.end}`;
    if (!byInterval.has(k)) byInterval.set(k, []);
    byInterval.get(k)!.push(key);
  }
  return [...byInterval.entries()].map(([k, dayList]) => {
    const [start, end] = k.split("-");
    return { days: dayList, startTime: `${start}:00`, endTime: `${end}:00` };
  });
}

export default function AvailabilityPage() {
  const [schedule, setSchedule] = useState<Schedule | null>(null);
  const [days, setDays] = useState<Record<Weekday, DayState> | null>(null);
  const [tz, setTz] = useState("Europe/Moscow");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    availabilityApi.list().then((page) => {
      const s = page.items[0];
      if (s) {
        setSchedule(s);
        setDays(scheduleToDays(s));
        setTz(s.timeZone);
      }
    });
  }, []);

  if (!schedule || !days) return <Loader />;

  const setDay = (key: Weekday, patch: Partial<DayState>) =>
    setDays({ ...days, [key]: { ...days[key], ...patch } });

  const save = async () => {
    setSaving(true);
    try {
      await availabilityApi.update(schedule.id, {
        name: schedule.name,
        timeZone: tz,
        availability: daysToRules(days),
        isDefault: schedule.isDefault,
      });
      notifications.show({
        color: "teal",
        title: "Сохранено",
        message: "Расписание отправлено на mock-сервер (Prism не персистит).",
      });
    } catch (e) {
      notifications.show({ color: "red", title: "Ошибка", message: e instanceof Error ? e.message : "" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Stack>
      <Group justify="space-between" align="flex-start">
        <div>
          <Title order={2}>Доступность</Title>
          <Text c="dimmed">Часы, в которые вас можно забронировать · {schedule.name}</Text>
        </div>
        <Button onClick={save} loading={saving}>
          Сохранить
        </Button>
      </Group>

      <Card withBorder padding="lg">
        <Select
          label="Таймзона"
          data={TZ}
          value={tz}
          onChange={(v) => setTz(v ?? tz)}
          mb="md"
          maw={280}
        />

        <Stack gap="xs">
          {DAYS.map(({ key, label }) => {
            const d = days[key];
            return (
              <Group key={key} gap="md" wrap="nowrap">
                <Switch
                  label={label}
                  checked={d.enabled}
                  onChange={(e) => setDay(key, { enabled: e.currentTarget.checked })}
                  styles={{ body: { width: 160 } }}
                />
                {d.enabled ? (
                  <Group gap="xs" wrap="nowrap">
                    <TimeInput
                      value={d.start}
                      onChange={(e) => setDay(key, { start: e.currentTarget.value })}
                      w={110}
                    />
                    <Text c="dimmed">—</Text>
                    <TimeInput
                      value={d.end}
                      onChange={(e) => setDay(key, { end: e.currentTarget.value })}
                      w={110}
                    />
                  </Group>
                ) : (
                  <Text c="dimmed" size="sm">
                    Недоступно
                  </Text>
                )}
              </Group>
            );
          })}
        </Stack>
      </Card>
    </Stack>
  );
}
