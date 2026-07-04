import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ActionIcon,
  Badge,
  Button,
  Card,
  Group,
  Loader,
  Menu,
  Modal,
  Stack,
  Text,
  TextInput,
  Textarea,
  NumberInput,
  Title,
  CopyButton,
  Tooltip,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { notifications } from "@mantine/notifications";
import {
  IconDotsVertical,
  IconCopy,
  IconTrash,
  IconEye,
  IconEyeOff,
  IconPlus,
  IconLink,
  IconCheck,
} from "@tabler/icons-react";
import { eventTypesApi, meApi, type EventType } from "../api/client";
import { useResource } from "../api/useApi";
import { fmtPrice, slugify } from "../lib/format";

export default function EventTypesPage() {
  const { data, loading, error, reload } = useResource(() => eventTypesApi.list(), []);
  const { data: user } = useResource(() => meApi.get(), []);
  const [createOpen, setCreateOpen] = useState(false);
  const navigate = useNavigate();

  const username = user?.username ?? "nina";
  const bookingUrl = (et: EventType) => `${window.location.origin}/book/${username}/${et.slug}`;

  const notifyMock = () =>
    notifications.show({
      color: "blue",
      title: "Отправлено на mock-сервер",
      message: "Prism не хранит состояние — список вернётся к данным из спеки.",
    });

  const toggleHidden = async (et: EventType) => {
    await eventTypesApi.update(et.id, { hidden: !et.hidden });
    notifyMock();
    reload();
  };

  const duplicate = async (et: EventType) => {
    await eventTypesApi.duplicate(et.id);
    notifyMock();
    reload();
  };

  const remove = async (et: EventType) => {
    if (!window.confirm(`Удалить «${et.title}»?`)) return;
    await eventTypesApi.remove(et.id);
    notifyMock();
    reload();
  };

  return (
    <Stack>
      <Group justify="space-between" align="flex-start">
        <div>
          <Title order={2}>Типы событий</Title>
          <Text c="dimmed">События, которые люди могут у вас забронировать.</Text>
        </div>
        <Button leftSection={<IconPlus size={16} />} onClick={() => setCreateOpen(true)}>
          Создать
        </Button>
      </Group>

      {loading && <Loader />}
      {error && <Text c="red">Ошибка загрузки: {error}</Text>}

      <Stack gap="sm">
        {data?.items.map((et) => (
          <Card key={et.id} withBorder padding="md">
            <Group justify="space-between" wrap="nowrap">
              <div style={{ minWidth: 0 }}>
                <Group gap="xs">
                  <Text fw={600} component={Link} to={`/event-types/${et.id}`} style={{ textDecoration: "none" }}>
                    {et.title}
                  </Text>
                  <Text c="dimmed" size="sm">
                    /{et.slug}
                  </Text>
                </Group>
                {et.description && (
                  <Text c="dimmed" size="sm" lineClamp={1}>
                    {et.description}
                  </Text>
                )}
                <Group gap="xs" mt={6}>
                  <Badge variant="light" color="gray">
                    {et.lengthInMinutes} мин
                  </Badge>
                  {et.hidden && <Badge variant="light" color="gray">Скрыто</Badge>}
                  {et.requiresConfirmation && (
                    <Badge variant="light" color="yellow">
                      Требует подтверждения
                    </Badge>
                  )}
                  {et.price && (
                    <Badge variant="light" color="green">
                      {fmtPrice(et.price.amount, et.price.currency)}
                    </Badge>
                  )}
                </Group>
              </div>

              <Group gap="xs" wrap="nowrap">
                <CopyButton value={bookingUrl(et)}>
                  {({ copied, copy }) => (
                    <Tooltip label={copied ? "Скопировано" : "Копировать ссылку"}>
                      <ActionIcon variant="subtle" color={copied ? "teal" : "gray"} onClick={copy}>
                        {copied ? <IconCheck size={18} /> : <IconLink size={18} />}
                      </ActionIcon>
                    </Tooltip>
                  )}
                </CopyButton>
                <Menu position="bottom-end" withinPortal>
                  <Menu.Target>
                    <ActionIcon variant="subtle" color="gray">
                      <IconDotsVertical size={18} />
                    </ActionIcon>
                  </Menu.Target>
                  <Menu.Dropdown>
                    <Menu.Item
                      leftSection={et.hidden ? <IconEye size={16} /> : <IconEyeOff size={16} />}
                      onClick={() => toggleHidden(et)}
                    >
                      {et.hidden ? "Показать" : "Скрыть"}
                    </Menu.Item>
                    <Menu.Item leftSection={<IconCopy size={16} />} onClick={() => duplicate(et)}>
                      Дублировать
                    </Menu.Item>
                    <Menu.Divider />
                    <Menu.Item color="red" leftSection={<IconTrash size={16} />} onClick={() => remove(et)}>
                      Удалить
                    </Menu.Item>
                  </Menu.Dropdown>
                </Menu>
              </Group>
            </Group>
          </Card>
        ))}
      </Stack>

      <CreateModal
        opened={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={(et) => {
          setCreateOpen(false);
          notifications.show({ color: "teal", title: "Создано", message: et.title });
          navigate(`/event-types/${et.id}`);
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
  onCreated: (et: EventType) => void;
}) {
  const form = useForm({
    initialValues: { title: "", slug: "", lengthInMinutes: 30, description: "" },
    validate: {
      title: (v) => (v.trim() ? null : "Укажите название"),
      slug: (v) => (/^[a-z0-9]+(-[a-z0-9]+)*$/.test(v) ? null : "Латиница, цифры и дефисы"),
    },
  });
  const [saving, setSaving] = useState(false);

  const submit = form.onSubmit(async (values) => {
    setSaving(true);
    try {
      const et = await eventTypesApi.create({
        title: values.title,
        slug: values.slug || slugify(values.title),
        description: values.description || undefined,
        lengthInMinutes: values.lengthInMinutes,
        locations: [{ type: "integration", integration: "google-meet" }],
        hidden: false,
        requiresConfirmation: false,
        disableGuests: false,
        minimumBookingNotice: 120,
        beforeEventBuffer: 0,
        afterEventBuffer: 0,
        bookingWindowDays: 60,
        schedulingType: "individual",
        scheduleId: 1,
      });
      onCreated(et);
      form.reset();
    } catch (e) {
      notifications.show({ color: "red", title: "Ошибка", message: e instanceof Error ? e.message : "" });
    } finally {
      setSaving(false);
    }
  });

  return (
    <Modal opened={opened} onClose={onClose} title="Новый тип события" centered>
      <form onSubmit={submit}>
        <Stack>
          <TextInput
            label="Название"
            placeholder="Например: Экспресс-созвон"
            data-autofocus
            {...form.getInputProps("title")}
            onChange={(e) => {
              form.setFieldValue("title", e.currentTarget.value);
              if (!form.isDirty("slug")) form.setFieldValue("slug", slugify(e.currentTarget.value));
            }}
          />
          <TextInput
            label="Слаг"
            description={`/book/nina/${form.values.slug || "…"}`}
            {...form.getInputProps("slug")}
          />
          <NumberInput
            label="Длительность, мин"
            min={5}
            max={1440}
            {...form.getInputProps("lengthInMinutes")}
          />
          <Textarea label="Описание" autosize minRows={2} {...form.getInputProps("description")} />
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
