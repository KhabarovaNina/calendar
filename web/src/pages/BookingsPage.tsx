import { useEffect, useMemo, useState } from "react";
import {
  Anchor,
  Badge,
  Box,
  Button,
  Card,
  Center,
  Flex,
  Group,
  Loader,
  Modal,
  ScrollArea,
  SimpleGrid,
  Stack,
  Tabs,
  Text,
  Title,
} from "@mantine/core";
import { DatePicker } from "@mantine/dates";
import { notifications } from "@mantine/notifications";
import dayjs from "dayjs";
import { IconVideo, IconMapPin, IconUsers } from "@tabler/icons-react";
import {
  bookingsApi,
  slotsApi,
  type Booking,
  type BookingStatus,
  type EventLocation,
  type Slot,
} from "../api/client";
import { useResource } from "../api/useApi";
import { confirm } from "../components/confirm";
import { browserTz, dateKeyTz, fmtDateTime, fmtDayLong, fmtTimeTz } from "../lib/format";

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
                        onClick={async () => {
                          const ok = await confirm({
                            title: "Отменить бронирование?",
                            message: `Бронь «${b.title}» будет отменена. Участник получит уведомление.`,
                            confirmLabel: "Отменить бронь",
                            cancelLabel: "Назад",
                            danger: true,
                          });
                          if (ok) act(() => bookingsApi.cancel(b.uid), "Отменено");
                        }}
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

// Перенос: выбираем реальный свободный слот события (как на публичной странице),
// а не произвольную дату/время. Так гарантируем, что отправленное `start` точно
// совпадает с сеткой слотов, которую сервер считает допустимой (иначе он вернёт
// «время недоступно», даже если по рабочим часам оно вроде бы свободно).
function RescheduleModal({
  booking,
  onClose,
  onDone,
}: {
  booking: Booking | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const tz = browserTz();
  const [month, setMonth] = useState<Date>(() => new Date());
  const [date, setDate] = useState<string | null>(null);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [saving, setSaving] = useState(false);

  // При открытии модалки для новой брони — начинаем с её месяца.
  useEffect(() => {
    if (!booking) return;
    setMonth(dayjs(booking.start).toDate());
    setDate(null);
    setSlots([]);
  }, [booking]);

  // Слоты видимого месяца этого события.
  useEffect(() => {
    if (!booking) return;
    let cancelled = false;
    setLoadingSlots(true);
    slotsApi
      .list({
        eventTypeId: booking.eventTypeId,
        start: dayjs(month).startOf("month").format("YYYY-MM-DD"),
        end: dayjs(month).endOf("month").format("YYYY-MM-DD"),
        timeZone: tz,
      })
      .then((r) => {
        if (!cancelled) setSlots(r.slots ?? []);
      })
      .catch(() => {
        if (!cancelled) setSlots([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingSlots(false);
      });
    return () => {
      cancelled = true;
    };
  }, [booking, month, tz]);

  const daysWithSlots = useMemo(() => {
    const s = new Set<string>();
    for (const slot of slots) s.add(dateKeyTz(slot.start, tz));
    return s;
  }, [slots, tz]);

  const daySlots = useMemo(
    () =>
      date
        ? slots
            .filter((s) => dateKeyTz(s.start, tz) === date)
            .sort((a, b) => a.start.localeCompare(b.start))
        : [],
    [slots, date, tz],
  );

  const pick = async (slotIso: string) => {
    if (!booking) return;
    setSaving(true);
    try {
      await bookingsApi.reschedule(booking.uid, slotIso);
      onDone();
    } catch (e) {
      notifications.show({ color: "red", title: "Ошибка", message: e instanceof Error ? e.message : "" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal opened={!!booking} onClose={onClose} title="Перенести бронирование" centered size="lg">
      {booking && (
        <Stack>
          <div>
            <Text size="sm" c="dimmed">
              {booking.title}
            </Text>
            <Text size="sm">Сейчас: {fmtDateTime(booking.start)}</Text>
          </div>
          <Flex direction={{ base: "column", sm: "row" }} gap="lg">
            <Box>
              <DatePicker
                value={date ? dayjs(date).toDate() : null}
                onChange={(d) => setDate(d ? dayjs(d as unknown as Date).format("YYYY-MM-DD") : null)}
                date={month}
                onDateChange={(d) => setMonth(d as unknown as Date)}
                minDate={new Date()}
                getDayProps={(d) => ({
                  disabled: !daysWithSlots.has(dayjs(d).format("YYYY-MM-DD")),
                })}
                hideOutsideDates
              />
            </Box>
            <Box style={{ flex: 1, minWidth: 0 }}>
              {loadingSlots ? (
                <Center mih={120}>
                  <Loader size="sm" />
                </Center>
              ) : !date ? (
                <Center h="100%" mih={120}>
                  <Text c="dimmed" size="sm" ta="center">
                    Выберите день, чтобы увидеть свободное время
                  </Text>
                </Center>
              ) : daySlots.length === 0 ? (
                <Text c="dimmed" size="sm">
                  На этот день свободного времени нет.
                </Text>
              ) : (
                <>
                  <Text fw={600} mb="sm" tt="capitalize">
                    {fmtDayLong(`${date}T00:00:00`, tz)}
                  </Text>
                  <ScrollArea.Autosize mah={300}>
                    <SimpleGrid cols={3} spacing="xs" pr="xs">
                      {daySlots.map((s) => (
                        <Button
                          key={s.start}
                          variant="default"
                          size="sm"
                          disabled={saving}
                          onClick={() => pick(s.start)}
                        >
                          {fmtTimeTz(s.start, tz)}
                        </Button>
                      ))}
                    </SimpleGrid>
                  </ScrollArea.Autosize>
                </>
              )}
            </Box>
          </Flex>
        </Stack>
      )}
    </Modal>
  );
}
