import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  Anchor,
  Button,
  Card,
  Group,
  Loader,
  NumberInput,
  Select,
  Stack,
  Switch,
  Text,
  Textarea,
  TextInput,
  Title,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconArrowLeft } from "@tabler/icons-react";
import { eventTypesApi, type EventLocation, type EventType } from "../api/client";

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

export default function EventTypeEditPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [et, setEt] = useState<EventType | null>(null);
  const [locKind, setLocKind] = useState<LocationKind>("google-meet");
  const [locValue, setLocValue] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    eventTypesApi.get(Number(id)).then((data) => {
      setEt(data);
      const loc = data.locations[0];
      setLocKind(toKind(loc));
      if (loc?.type === "link") setLocValue(loc.link);
      else if (loc?.type === "address") setLocValue(loc.address);
      else if (loc?.type === "phone") setLocValue(loc.phone ?? "");
    });
  }, [id]);

  if (!et) return <Loader />;

  const set = <K extends keyof EventType>(key: K, value: EventType[K]) => setEt({ ...et, [key]: value });

  const save = async () => {
    setSaving(true);
    try {
      await eventTypesApi.update(et.id, {
        title: et.title,
        slug: et.slug,
        description: et.description,
        lengthInMinutes: et.lengthInMinutes,
        locations: [buildLocation(locKind, locValue)],
        hidden: et.hidden,
        requiresConfirmation: et.requiresConfirmation,
        disableGuests: et.disableGuests,
        minimumBookingNotice: et.minimumBookingNotice,
        beforeEventBuffer: et.beforeEventBuffer,
        afterEventBuffer: et.afterEventBuffer,
        bookingWindowDays: et.bookingWindowDays,
      });
      notifications.show({
        color: "teal",
        title: "Сохранено",
        message: "Изменения отправлены на mock-сервер (Prism не персистит).",
      });
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
        </div>
        <Button onClick={save} loading={saving}>
          Сохранить
        </Button>
      </Group>

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

          <Group grow align="flex-start">
            <NumberInput
              label="Мин. время до брони, мин"
              min={0}
              value={et.minimumBookingNotice}
              onChange={(v) => set("minimumBookingNotice", Number(v) || 0)}
            />
            <NumberInput
              label="Окно бронирования, дней"
              min={1}
              value={et.bookingWindowDays ?? 60}
              onChange={(v) => set("bookingWindowDays", Number(v) || 60)}
            />
          </Group>

          <Group grow align="flex-start">
            <NumberInput
              label="Буфер до, мин"
              min={0}
              value={et.beforeEventBuffer}
              onChange={(v) => set("beforeEventBuffer", Number(v) || 0)}
            />
            <NumberInput
              label="Буфер после, мин"
              min={0}
              value={et.afterEventBuffer}
              onChange={(v) => set("afterEventBuffer", Number(v) || 0)}
            />
          </Group>

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

          <Group>
            <Button
              color="red"
              variant="light"
              onClick={async () => {
                if (!window.confirm(`Удалить «${et.title}»?`)) return;
                await eventTypesApi.remove(et.id);
                notifications.show({ color: "blue", title: "Удалено", message: et.title });
                navigate("/event-types");
              }}
            >
              Удалить тип события
            </Button>
          </Group>
        </Stack>
      </Card>
    </Stack>
  );
}
