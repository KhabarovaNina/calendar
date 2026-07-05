import { useState } from "react";
import {
  Anchor,
  Badge,
  Button,
  Card,
  Group,
  Loader,
  Modal,
  Stack,
  Tabs,
  Text,
  Title,
} from "@mantine/core";
import { DateTimePicker } from "@mantine/dates";
import { notifications } from "@mantine/notifications";
import { IconVideo, IconMapPin, IconUsers } from "@tabler/icons-react";
import { bookingsApi, type Booking, type BookingStatus, type EventLocation } from "../api/client";
import { useResource } from "../api/useApi";
import { fmtDateTime } from "../lib/format";

type Tab = "upcoming" | "pending" | "past" | "cancelled";

const STATUS: Record<BookingStatus, { label: string; color: string }> = {
  accepted: { label: "Подтверждено", color: "teal" },
  pending: { label: "Ожидает", color: "yellow" },
  rejected: { label: "Отклонено", color: "red" },
  cancelled: { label: "Отменено", color: "gray" },
};

const INTEGRATION_LABEL: Record<string, string> = {
  "google-meet": "Google Meet",
  zoom: "Zoom",
  "ms-teams": "Microsoft Teams",
  daily: "Daily",
};

function locationLabel(b: Booking): string | null {
  // Booking.location в сгенерированной схеме — Omit<EventLocation,"type">
  // (особенность эмиттера для дискриминированных union), приводим к union.
  const l = b.location as EventLocation | undefined;
  if (!l) return null;
  if (l.type === "integration") return INTEGRATION_LABEL[l.integration] ?? l.integration;
  if (l.type === "link") return "Ссылка";
  if (l.type === "address") return l.address;
  if (l.type === "phone") return "Телефонный звонок";
  if (l.type === "attendeeDefined") return "На выбор участника";
  return null;
}

function fetchFor(tab: Tab): Promise<{ items: Booking[] }> {
  const now = new Date().toISOString();
  if (tab === "upcoming") return bookingsApi.list({ afterStart: now, status: "accepted" });
  if (tab === "pending") return bookingsApi.list({ status: "pending" });
  if (tab === "cancelled") return bookingsApi.list({ status: "cancelled" });
  return bookingsApi.list({ beforeEnd: now });
}

export default function BookingsPage() {
  const [tab, setTab] = useState<Tab>("upcoming");
  const { data, loading, error, reload } = useResource(() => fetchFor(tab), [tab]);
  const [rescheduling, setRescheduling] = useState<Booking | null>(null);

  const act = async (fn: () => Promise<unknown>, msg: string) => {
    await fn();
    notifications.show({ color: "blue", title: msg, message: "Изменения сохранены." });
    reload();
  };

  return (
    <Stack>
      <div>
        <Title order={2}>Бронирования</Title>
        <Text c="dimmed">Все встречи, забронированные через ваши типы событий.</Text>
      </div>

      <Tabs value={tab} onChange={(v) => setTab((v as Tab) ?? "upcoming")}>
        <Tabs.List mb="md">
          <Tabs.Tab value="upcoming">Предстоящие</Tabs.Tab>
          <Tabs.Tab value="pending">Неподтверждённые</Tabs.Tab>
          <Tabs.Tab value="past">Прошедшие</Tabs.Tab>
          <Tabs.Tab value="cancelled">Отменённые</Tabs.Tab>
        </Tabs.List>
      </Tabs>

      {loading && <Loader />}
      {error && <Text c="red">Ошибка загрузки: {error}</Text>}
      {data && data.items.length === 0 && <Text c="dimmed">Здесь пока пусто.</Text>}

      <Stack gap="sm">
        {data?.items.map((b) => {
          const badge = STATUS[b.status];
          const attendee = b.attendees[0];
          return (
            <Card key={b.uid} withBorder padding="md">
              <Group justify="space-between" wrap="nowrap" align="flex-start">
                <div style={{ minWidth: 0 }}>
                  <Text fw={600}>{b.title}</Text>
                  <Text c="dimmed" size="sm">
                    {fmtDateTime(b.start)}
                    {attendee && ` · ${attendee.name} (${attendee.email})`}
                  </Text>
                  <Group gap="xs" mt={6}>
                    <Badge variant="light" color={badge.color}>
                      {badge.label}
                    </Badge>
                    {locationLabel(b) && (
                      <Group gap={4} c="dimmed">
                        <IconMapPin size={14} />
                        <Text size="sm">{locationLabel(b)}</Text>
                      </Group>
                    )}
                    {b.guests && b.guests.length > 0 && (
                      <Group gap={4} c="dimmed">
                        <IconUsers size={14} />
                        <Text size="sm">+{b.guests.length} гость(ей)</Text>
                      </Group>
                    )}
                    {b.meetingUrl && (
                      <Anchor href={b.meetingUrl} target="_blank" size="sm">
                        <Group gap={4}>
                          <IconVideo size={14} /> Ссылка на встречу
                        </Group>
                      </Anchor>
                    )}
                    {b.cancellationReason && (
                      <Text c="dimmed" size="sm">
                        Причина: {b.cancellationReason}
                      </Text>
                    )}
                  </Group>
                </div>

                <Group gap="xs" wrap="nowrap">
                  {b.status === "pending" && (
                    <>
                      <Button size="xs" onClick={() => act(() => bookingsApi.confirm(b.uid), "Подтверждено")}>
                        Подтвердить
                      </Button>
                      <Button
                        size="xs"
                        variant="light"
                        color="red"
                        onClick={() => act(() => bookingsApi.reject(b.uid), "Отклонено")}
                      >
                        Отклонить
                      </Button>
                    </>
                  )}
                  {(b.status === "accepted" || b.status === "pending") && (
                    <>
                      <Button size="xs" variant="light" onClick={() => setRescheduling(b)}>
                        Перенести
                      </Button>
                      <Button
                        size="xs"
                        variant="light"
                        color="red"
                        onClick={() => act(() => bookingsApi.cancel(b.uid), "Отменено")}
                      >
                        Отменить
                      </Button>
                    </>
                  )}
                </Group>
              </Group>
            </Card>
          );
        })}
      </Stack>

      <RescheduleModal
        booking={rescheduling}
        onClose={() => setRescheduling(null)}
        onDone={() => {
          setRescheduling(null);
          notifications.show({ color: "blue", title: "Перенесено", message: "Новое время сохранено." });
          reload();
        }}
      />
    </Stack>
  );
}

function RescheduleModal({
  booking,
  onClose,
  onDone,
}: {
  booking: Booking | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const [value, setValue] = useState<Date | null>(null);
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!booking || !value) return;
    setSaving(true);
    try {
      await bookingsApi.reschedule(booking.uid, value.toISOString());
      onDone();
      setValue(null);
    } catch (e) {
      notifications.show({ color: "red", title: "Ошибка", message: e instanceof Error ? e.message : "" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal opened={!!booking} onClose={onClose} title="Перенести бронирование" centered>
      {booking && (
        <Stack>
          <Text size="sm" c="dimmed">
            {booking.title}
          </Text>
          <Text size="sm">Сейчас: {fmtDateTime(booking.start)}</Text>
          <DateTimePicker
            label="Новое время"
            placeholder="Выберите дату и время"
            value={value}
            onChange={(v) => setValue(v as unknown as Date | null)}
            valueFormat="D MMMM YYYY, HH:mm"
            popoverProps={{ withinPortal: true }}
            data-autofocus
          />
          <Group justify="flex-end">
            <Button variant="default" onClick={onClose}>
              Отмена
            </Button>
            <Button onClick={submit} loading={saving} disabled={!value}>
              Перенести
            </Button>
          </Group>
        </Stack>
      )}
    </Modal>
  );
}
