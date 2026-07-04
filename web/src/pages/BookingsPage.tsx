import { useState } from "react";
import {
  Anchor,
  Badge,
  Button,
  Card,
  Group,
  Loader,
  Stack,
  Tabs,
  Text,
  Title,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconVideo } from "@tabler/icons-react";
import { bookingsApi, type Booking, type BookingStatus } from "../api/client";
import { useResource } from "../api/useApi";
import { fmtDateTime } from "../lib/format";

type Tab = "upcoming" | "pending" | "past" | "cancelled";

const STATUS: Record<BookingStatus, { label: string; color: string }> = {
  accepted: { label: "Подтверждено", color: "teal" },
  pending: { label: "Ожидает", color: "yellow" },
  rejected: { label: "Отклонено", color: "red" },
  cancelled: { label: "Отменено", color: "gray" },
};

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

  const act = async (fn: () => Promise<unknown>, msg: string) => {
    await fn();
    notifications.show({ color: "blue", title: msg, message: "Отправлено на mock-сервер (Prism не персистит)." });
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
                    <Button
                      size="xs"
                      variant="light"
                      color="red"
                      onClick={() => act(() => bookingsApi.cancel(b.uid), "Отменено")}
                    >
                      Отменить
                    </Button>
                  )}
                </Group>
              </Group>
            </Card>
          );
        })}
      </Stack>
    </Stack>
  );
}
