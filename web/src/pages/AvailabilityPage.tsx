import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ActionIcon,
  Badge,
  Button,
  Group,
  Loader,
  Menu,
  Modal,
  Stack,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { notifications } from "@mantine/notifications";
import {
  IconDotsVertical,
  IconCopy,
  IconTrash,
  IconPlus,
  IconStar,
} from "@tabler/icons-react";
import { availabilityApi, type AvailabilityRule, type Schedule } from "../api/client";
import { confirm } from "../components/confirm";
import { useResource } from "../api/useApi";
import classes from "./EventTypesPage.module.css";

type Weekday = AvailabilityRule["days"][number];

const SHORT: Record<Weekday, string> = {
  monday: "Пн",
  tuesday: "Вт",
  wednesday: "Ср",
  thursday: "Чт",
  friday: "Пт",
  saturday: "Сб",
  sunday: "Вс",
};
const ORDER: Weekday[] = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
];

const hhmm = (t: string) => t.slice(0, 5);

/** Короткая сводка расписания: «Пн–Пт · 09:00–18:00». */
function summarize(s: Schedule): string {
  const active = ORDER.filter((d) => s.availability?.some((r) => r.days.includes(d)));
  if (active.length === 0) return "Нет рабочих часов";

  // Свернём подряд идущие дни в диапазоны.
  const groups: string[] = [];
  let runStart = active[0];
  let prev = active[0];
  for (let i = 1; i <= active.length; i++) {
    const cur = active[i];
    const contiguous = cur && ORDER.indexOf(cur) === ORDER.indexOf(prev) + 1;
    if (!contiguous) {
      groups.push(runStart === prev ? SHORT[runStart] : `${SHORT[runStart]}–${SHORT[prev]}`);
      if (cur) runStart = cur;
    }
    if (cur) prev = cur;
  }

  const first = s.availability?.[0];
  const time = first ? `${hhmm(first.startTime)}–${hhmm(first.endTime)}` : "";
  return `${groups.join(", ")}${time ? ` · ${time}` : ""}`;
}

export default function AvailabilityPage() {
  const { data, loading, error, reload } = useResource(() => availabilityApi.list(), []);
  const [createOpen, setCreateOpen] = useState(false);
  const navigate = useNavigate();

  const setDefault = async (s: Schedule) => {
    const others = (data?.items ?? []).filter((x) => x.id !== s.id && x.isDefault);
    await Promise.all(others.map((x) => availabilityApi.update(x.id, { isDefault: false })));
    await availabilityApi.update(s.id, { isDefault: true });
    notifications.show({ color: "teal", title: "Расписание по умолчанию", message: s.name });
    reload();
  };

  const duplicate = async (s: Schedule) => {
    await availabilityApi.create({
      name: `${s.name} (копия)`,
      timeZone: s.timeZone,
      availability: s.availability,
      overrides: s.overrides,
      isDefault: false,
    });
    notifications.show({ color: "blue", title: "Скопировано", message: s.name });
    reload();
  };

  const remove = async (s: Schedule) => {
    if (s.isDefault) {
      notifications.show({ color: "red", title: "Нельзя удалить", message: "Это расписание по умолчанию." });
      return;
    }
    const ok = await confirm({
      title: "Удалить расписание?",
      message: `Расписание «${s.name}» будет удалено безвозвратно.`,
      confirmLabel: "Удалить",
      danger: true,
    });
    if (!ok) return;
    await availabilityApi.remove(s.id);
    notifications.show({ color: "blue", title: "Удалено", message: s.name });
    reload();
  };

  return (
    <Stack>
      <Group justify="space-between" align="flex-start">
        <div>
          <Title order={2}>Доступность</Title>
          <Text c="dimmed">Расписания часов, в которые вас можно забронировать.</Text>
        </div>
        <Button leftSection={<IconPlus size={16} />} onClick={() => setCreateOpen(true)}>
          Создать
        </Button>
      </Group>

      {loading && <Loader />}
      {error && <Text c="red">Ошибка загрузки: {error}</Text>}

      {data && (
        <div className={classes.list}>
          {data.items.length === 0 && <div className={classes.empty}>Пока нет ни одного расписания.</div>}
          {data.items.map((s) => (
            <div key={s.id} className={classes.row}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <Group gap={8} wrap="nowrap">
                  <Text fw={600} component={Link} to={`/availability/${s.id}`} className={classes.title} truncate>
                    {s.name}
                  </Text>
                  {s.isDefault && (
                    <Badge size="sm" variant="light" color="teal">
                      По умолчанию
                    </Badge>
                  )}
                </Group>
                <Text c="dimmed" size="sm" mt={2}>
                  {summarize(s)}
                </Text>
                <Text c="dimmed" size="xs" mt={2}>
                  {s.timeZone}
                </Text>
              </div>

              <Menu position="bottom-end" withinPortal>
                <Menu.Target>
                  <ActionIcon variant="subtle" color="gray">
                    <IconDotsVertical size={18} />
                  </ActionIcon>
                </Menu.Target>
                <Menu.Dropdown>
                  {!s.isDefault && (
                    <Menu.Item leftSection={<IconStar size={16} />} onClick={() => setDefault(s)}>
                      Сделать по умолчанию
                    </Menu.Item>
                  )}
                  <Menu.Item leftSection={<IconCopy size={16} />} onClick={() => duplicate(s)}>
                    Дублировать
                  </Menu.Item>
                  <Menu.Divider />
                  <Menu.Item color="red" leftSection={<IconTrash size={16} />} onClick={() => remove(s)}>
                    Удалить
                  </Menu.Item>
                </Menu.Dropdown>
              </Menu>
            </div>
          ))}
        </div>
      )}

      <CreateModal
        opened={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={(s) => {
          setCreateOpen(false);
          notifications.show({ color: "teal", title: "Создано", message: s.name });
          navigate(`/availability/${s.id}`);
        }}
      />
    </Stack>
  );
}

function CreateModal({
  opened,
  onClose,
  onCreated,
}: {
  opened: boolean;
  onClose: () => void;
  onCreated: (s: Schedule) => void;
}) {
  const form = useForm({
    initialValues: { name: "" },
    validate: { name: (v) => (v.trim() ? null : "Укажите название") },
  });
  const [saving, setSaving] = useState(false);

  const submit = form.onSubmit(async (values) => {
    setSaving(true);
    try {
      const s = await availabilityApi.create({
        name: values.name,
        timeZone: "Europe/Moscow",
        availability: [
          {
            days: ["monday", "tuesday", "wednesday", "thursday", "friday"],
            startTime: "09:00:00",
            endTime: "18:00:00",
          },
        ],
        isDefault: false,
      });
      onCreated(s);
      form.reset();
    } catch (e) {
      notifications.show({ color: "red", title: "Ошибка", message: e instanceof Error ? e.message : "" });
    } finally {
      setSaving(false);
    }
  });

  return (
    <Modal opened={opened} onClose={onClose} title="Новое расписание" centered>
      <form onSubmit={submit}>
        <Stack>
          <TextInput
            label="Название"
            placeholder="Например: Рабочие часы"
            data-autofocus
            {...form.getInputProps("name")}
          />
          <Group justify="flex-end">
            <Button variant="default" onClick={onClose}>
              Отмена
            </Button>
            <Button type="submit" loading={saving}>
              Создать
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}
