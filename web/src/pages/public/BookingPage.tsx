import { useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import {
  Anchor,
  Avatar,
  Badge,
  Box,
  Button,
  Card,
  Center,
  Checkbox,
  Container,
  Divider,
  Flex,
  Group,
  Loader,
  MultiSelect,
  NumberInput,
  Radio,
  ScrollArea,
  Select,
  SimpleGrid,
  Stack,
  TagsInput,
  Text,
  Textarea,
  TextInput,
  Title,
} from "@mantine/core";
import { DatePicker } from "@mantine/dates";
import { useForm } from "@mantine/form";
import { notifications } from "@mantine/notifications";
import {
  IconCalendar,
  IconCheck,
  IconClock,
  IconGlobe,
  IconArrowLeft,
} from "@tabler/icons-react";
import dayjs from "dayjs";
import {
  publicApi,
  slotsApi,
  bookingsApi,
  type Booking,
  type BookingField,
  type CreateBookingRequest,
  type EventLocation,
  type EventType,
  type PublicOrganizer,
  type Slot,
} from "../../api/client";
import { useResource } from "../../api/useApi";
import { useCurrentUser } from "../../api/user";
import {
  browserTz,
  dateKeyTz,
  fmtDayLong,
  fmtPrice,
  fmtTimeTz,
  fmtDateTimeTz,
} from "../../lib/format";
import { describeLocation } from "./location";

// Список таймзон для селектора: полный из Intl, с фолбэком на короткий набор.
const TZ_OPTIONS: string[] = (() => {
  try {
    const supported = (Intl as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf;
    const vals = supported?.("timeZone");
    if (vals && vals.length) return vals;
  } catch {
    /* старый браузер — используем фолбэк */
  }
  return [
    "Europe/Moscow",
    "Europe/Kaliningrad",
    "Asia/Yekaterinburg",
    "Asia/Novosibirsk",
    "Asia/Vladivostok",
    "UTC",
    "Europe/London",
    "America/New_York",
  ];
})();

const initials = (name: string) =>
  name
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

export default function BookingPage() {
  const { username = "", slug = "" } = useParams();
  const { data: org, loading, error } = useResource(
    () => publicApi.organizer(username),
    [username],
  );
  const event = org?.eventTypes.find((e) => e.slug === slug);

  if (loading) {
    return (
      <Center mih="100vh">
        <Loader />
      </Center>
    );
  }

  if (error || !org || !event) {
    return (
      <Center mih="100vh">
        <Stack align="center" gap="xs">
          <Title order={3}>Событие не найдено</Title>
          <Text c="dimmed">Возможно, ссылка устарела или событие скрыто.</Text>
        </Stack>
      </Center>
    );
  }

  return <Booker organizer={org} event={event} />;
}

function Booker({ organizer, event }: { organizer: PublicOrganizer; event: EventType }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [tz, setTz] = useState<string>(searchParams.get("cal.tz") || browserTz());
  const [confirmed, setConfirmed] = useState<Booking | null>(null);

  // ── Состояние из URL (deep-linking, как в cal.com) ──
  const monthStr = searchParams.get("month") || dayjs().format("YYYY-MM");
  const monthStart = dayjs(`${monthStr}-01`);
  const selectedDate = searchParams.get("date"); // YYYY-MM-DD или null
  const selectedSlot = searchParams.get("slot"); // ISO datetime или null

  // Выбранная длительность (для событий с вариантами); иначе — базовая.
  const durationOptions = event.lengthInMinutesOptions ?? [];
  const durationParam = Number(searchParams.get("duration")) || undefined;
  const duration =
    durationParam &&
    (durationOptions.includes(durationParam) || durationParam === event.lengthInMinutes)
      ? durationParam
      : event.lengthInMinutes;

  const windowEnd = dayjs().add(event.bookingWindowDays ?? 60, "day");

  // ── Слоты видимого месяца ──
  const { data: slotsData, loading: slotsLoading } = useResource(
    () =>
      slotsApi.list({
        eventTypeId: event.id,
        start: monthStart.format("YYYY-MM-DD"),
        end: monthStart.endOf("month").format("YYYY-MM-DD"),
        timeZone: tz,
        duration: duration !== event.lengthInMinutes ? duration : undefined,
      }),
    [event.id, monthStr, tz, duration],
  );

  const slots = slotsData?.slots ?? [];
  const daysWithSlots = useMemo(() => {
    const s = new Set<string>();
    for (const slot of slots) s.add(dateKeyTz(slot.start, tz));
    return s;
  }, [slots, tz]);

  const daySlots = useMemo(
    () =>
      selectedDate
        ? slots
            .filter((s) => dateKeyTz(s.start, tz) === selectedDate)
            .sort((a, b) => a.start.localeCompare(b.start))
        : [],
    [slots, selectedDate, tz],
  );

  // ── Обновление URL-параметров ──
  const patchParams = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(searchParams);
    for (const [k, v] of Object.entries(patch)) {
      if (v === null) next.delete(k);
      else next.set(k, v);
    }
    setSearchParams(next, { replace: true });
  };

  const pickDate = (d: Date | null) => {
    patchParams({ date: d ? dayjs(d).format("YYYY-MM-DD") : null, slot: null });
  };
  const changeMonth = (d: Date) => patchParams({ month: dayjs(d).format("YYYY-MM") });
  const pickSlot = (iso: string) => patchParams({ slot: iso });
  const clearSlot = () => patchParams({ slot: null });
  const changeDuration = (v: number) => patchParams({ duration: String(v), slot: null });

  const loc = describeLocation(event.locations?.[0]);

  // ── Экран подтверждения ──
  if (confirmed) {
    return (
      <Container size="sm" py={64}>
        <BookingSuccess
          booking={confirmed}
          event={event}
          tz={tz}
          onReset={() => {
            setConfirmed(null);
            patchParams({ slot: null });
          }}
        />
      </Container>
    );
  }

  return (
    <Container size={selectedSlot ? "md" : 960} py={48}>
      <Anchor
        component={Link}
        to={`/book/${organizer.username}`}
        c="dimmed"
        underline="never"
        mb="sm"
        style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: "var(--mantine-font-size-sm)" }}
      >
        <IconArrowLeft size={16} /> Все события
      </Anchor>
      <Card padding={0} withBorder radius="lg" style={{ overflow: "hidden" }}>
        <Flex direction={{ base: "column", sm: "row" }}>
          {/* Левая панель: сведения о событии */}
          <Box
            p="xl"
            style={{ borderRight: "1px solid var(--mantine-color-gray-2)", flex: "0 0 300px" }}
          >
            <Stack gap="sm">
              <Group gap="xs">
                <Avatar src={organizer.avatarUrl} size={36} radius="xl" color="dark">
                  {initials(organizer.name)}
                </Avatar>
                <Text size="sm" c="dimmed">
                  {organizer.name}
                </Text>
              </Group>
              <Title order={3}>{event.title}</Title>
              {event.description && (
                <Text size="sm" c="dimmed">
                  {event.description}
                </Text>
              )}

              <Stack gap={6} mt="xs">
                {durationOptions.length > 0 ? (
                  <Group gap={6}>
                    <IconClock size={16} />
                    <Select
                      size="xs"
                      variant="unstyled"
                      w={110}
                      value={String(duration)}
                      onChange={(v) => v && changeDuration(Number(v))}
                      data={durationOptions.map((o) => ({ value: String(o), label: `${o} мин` }))}
                    />
                  </Group>
                ) : (
                  <InfoRow icon={<IconClock size={16} />}>{event.lengthInMinutes} мин</InfoRow>
                )}
                {loc && <InfoRow icon={<loc.Icon size={16} />}>{loc.label}</InfoRow>}
                {event.price && (
                  <InfoRow icon={<Text size="sm">₽</Text>}>
                    {fmtPrice(event.price.amount, event.price.currency)}
                  </InfoRow>
                )}
                {selectedSlot && (
                  <InfoRow icon={<IconCalendar size={16} />}>
                    {fmtDateTimeTz(selectedSlot, tz)}
                  </InfoRow>
                )}
                <Group gap={6} align="center" wrap="nowrap">
                  <IconGlobe size={16} style={{ flexShrink: 0 }} />
                  <Select
                    size="xs"
                    variant="unstyled"
                    searchable
                    value={tz}
                    onChange={(v) => v && setTz(v)}
                    data={TZ_OPTIONS}
                    comboboxProps={{ withinPortal: true }}
                    styles={{ input: { fontSize: "var(--mantine-font-size-sm)" } }}
                  />
                </Group>
              </Stack>
            </Stack>
          </Box>

          {/* Правая часть: календарь + слоты, либо форма */}
          <Box p="xl" style={{ flex: 1, minWidth: 0 }}>
            {selectedSlot ? (
              <BookingForm
                event={event}
                slotIso={selectedSlot}
                tz={tz}
                duration={duration}
                onBack={clearSlot}
                onConfirmed={setConfirmed}
              />
            ) : (
              <Flex direction={{ base: "column", md: "row" }} gap="lg">
                <Box>
                  <DatePicker
                    value={selectedDate ? dayjs(selectedDate).toDate() : null}
                    onChange={(d) => pickDate(d as unknown as Date | null)}
                    date={monthStart.toDate()}
                    onDateChange={(d) => changeMonth(d as unknown as Date)}
                    minDate={new Date()}
                    maxDate={windowEnd.toDate()}
                    getDayProps={(d) => ({
                      disabled: !daysWithSlots.has(dayjs(d).format("YYYY-MM-DD")),
                    })}
                    hideOutsideDates
                  />
                </Box>

                <Box style={{ flex: 1, minWidth: 0 }}>
                  {!selectedDate ? (
                    <Center h="100%" mih={120}>
                      <Text c="dimmed" size="sm" ta="center">
                        Выберите день, чтобы увидеть свободное время
                      </Text>
                    </Center>
                  ) : (
                    <>
                      <Text fw={600} mb="sm" tt="capitalize">
                        {fmtDayLong(`${selectedDate}T00:00:00`, tz)}
                      </Text>
                      {slotsLoading ? (
                        <Loader size="sm" />
                      ) : daySlots.length === 0 ? (
                        <Text c="dimmed" size="sm">
                          На этот день свободного времени нет.
                        </Text>
                      ) : (
                        <ScrollArea.Autosize mah={360}>
                          <SimpleGrid cols={{ base: 3, md: 2, lg: 3 }} spacing="xs" pr="xs">
                            {daySlots.map((s) => (
                              <SlotButton key={s.start} slot={s} tz={tz} onClick={() => pickSlot(s.start)} />
                            ))}
                          </SimpleGrid>
                        </ScrollArea.Autosize>
                      )}
                    </>
                  )}
                </Box>
              </Flex>
            )}
          </Box>
        </Flex>
      </Card>
    </Container>
  );
}

function InfoRow({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <Group gap={8} align="center" wrap="nowrap" c="dimmed">
      <Box style={{ flexShrink: 0, display: "flex" }}>{icon}</Box>
      <Text size="sm">{children}</Text>
    </Group>
  );
}

function SlotButton({ slot, tz, onClick }: { slot: Slot; tz: string; onClick: () => void }) {
  return (
    <Button variant="default" onClick={onClick} h="auto" py={8} px={4}>
      <Stack gap={0} align="center">
        <Text size="sm" fw={500}>
          {fmtTimeTz(slot.start, tz)}
        </Text>
        {slot.seatsRemaining != null && (
          <Text size="xs" c="dimmed">
            {slot.seatsRemaining} мест
          </Text>
        )}
      </Stack>
    </Button>
  );
}

// ─────────────────────────────────────────────────────────────
//  Форма участника
// ─────────────────────────────────────────────────────────────

type FormValues = {
  name: string;
  email: string;
  phone: string;
  notes: string;
  guests: string[];
  locationIndex: string;
  custom: Record<string, unknown>;
};

const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function defaultForField(f: BookingField): unknown {
  if (f.type === "multiselect") return [];
  if (f.type === "checkbox" || f.type === "boolean") return false;
  return "";
}

function BookingForm({
  event,
  slotIso,
  tz,
  duration,
  onBack,
  onConfirmed,
}: {
  event: EventType;
  slotIso: string;
  tz: string;
  duration: number;
  onBack: () => void;
  onConfirmed: (b: Booking) => void;
}) {
  const [params] = useSearchParams();
  const [submitting, setSubmitting] = useState(false);
  const { data: currentUser } = useCurrentUser();

  const customFields = (event.bookingFields ?? []).filter((f) => !f.hidden);
  const locations = (event.locations ?? []) as EventLocation[];
  const needsPhone = (idx: number) => {
    const l = locations[idx];
    return l?.type === "phone" && !l.phone;
  };

  const form = useForm<FormValues>({
    initialValues: {
      name: params.get("name") ?? currentUser?.name ?? "",
      email: params.get("email") ?? currentUser?.email ?? "",
      phone: "",
      notes: params.get("notes") ?? "",
      guests: params.get("guests") ? params.get("guests")!.split(",").filter(Boolean) : [],
      locationIndex: "0",
      custom: Object.fromEntries(customFields.map((f) => [f.name, defaultForField(f)])),
    },
    validate: {
      name: (v) => (v.trim() ? null : "Укажите имя"),
      email: (v) => (emailRe.test(v) ? null : "Некорректный email"),
      phone: (v, values) =>
        needsPhone(Number(values.locationIndex)) && !v.trim() ? "Укажите телефон" : null,
      guests: (v) => (v.every((g) => emailRe.test(g)) ? null : "Проверьте email гостей"),
      custom: (custom) => {
        for (const f of customFields) {
          if (!f.required) continue;
          const val = custom[f.name];
          const empty =
            val === undefined ||
            val === null ||
            val === "" ||
            val === false ||
            (Array.isArray(val) && val.length === 0);
          if (empty) return `Заполните обязательные поля`;
        }
        return null;
      },
    },
  });

  // Если /me резолвится уже после монтирования формы — подставляем данные
  // пользователя в ещё пустые поля (URL-prefill и введённое вручную не трогаем).
  useEffect(() => {
    if (!currentUser) return;
    if (!params.get("name") && !form.values.name) form.setFieldValue("name", currentUser.name);
    if (!params.get("email") && !form.values.email) form.setFieldValue("email", currentUser.email);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser]);

  const submit = form.onSubmit(async (v) => {
    setSubmitting(true);
    try {
      const selectedLoc = locations[Number(v.locationIndex)] ?? locations[0];
      const customResponses: Record<string, unknown> = {};
      for (const f of customFields) {
        const val = v.custom[f.name];
        if (val !== "" && val !== false && !(Array.isArray(val) && val.length === 0)) {
          customResponses[f.name] = val;
        }
      }
      if (v.notes.trim()) customResponses.notes = v.notes.trim();

      const body: CreateBookingRequest = {
        eventTypeId: event.id,
        start: dayjs(slotIso).toISOString(),
        ...(duration !== event.lengthInMinutes ? { lengthInMinutes: duration } : {}),
        attendee: {
          name: v.name.trim(),
          email: v.email.trim(),
          timeZone: tz,
          locale: "ru",
          ...(v.phone.trim() ? { phone: v.phone.trim() } : {}),
        },
        ...(v.guests.length ? { guests: v.guests } : {}),
        ...(selectedLoc ? { location: selectedLoc } : {}),
        ...(Object.keys(customResponses).length
          ? { bookingFieldsResponses: customResponses as Record<string, never> }
          : {}),
      };

      const booking = await bookingsApi.create(body);
      onConfirmed(booking);
    } catch (e) {
      notifications.show({
        color: "red",
        title: "Не удалось забронировать",
        message: e instanceof Error ? e.message : "Попробуйте ещё раз",
      });
    } finally {
      setSubmitting(false);
    }
  });

  return (
    <form onSubmit={submit}>
      <Stack gap="sm">
        <Group gap="xs">
          <Button variant="subtle" size="compact-sm" color="gray" onClick={onBack} leftSection={<IconArrowLeft size={16} />}>
            Назад
          </Button>
        </Group>
        <Title order={4}>Введите данные</Title>

        <TextInput label="Имя" withAsterisk {...form.getInputProps("name")} />
        <TextInput label="Email" withAsterisk {...form.getInputProps("email")} />

        {locations.length > 1 && (
          <Select
            label="Место встречи"
            data={locations.map((l, i) => ({
              value: String(i),
              label: describeLocation(l)?.label ?? `Вариант ${i + 1}`,
            }))}
            allowDeselect={false}
            {...form.getInputProps("locationIndex")}
          />
        )}

        {needsPhone(Number(form.values.locationIndex)) && (
          <TextInput label="Телефон" withAsterisk {...form.getInputProps("phone")} />
        )}

        {customFields.map((f) => (
          <CustomField key={f.name} field={f} form={form} />
        ))}

        {!event.disableGuests && (
          <TagsInput
            label="Гости"
            description="Email адреса дополнительных участников"
            placeholder="guest@example.com"
            {...form.getInputProps("guests")}
          />
        )}

        <Textarea
          label="Заметка"
          placeholder="Чем поделиться перед встречей?"
          autosize
          minRows={2}
          {...form.getInputProps("notes")}
        />

        <Button type="submit" loading={submitting} mt="xs">
          Подтвердить бронирование
        </Button>
      </Stack>
    </form>
  );
}

function CustomField({
  field,
  form,
}: {
  field: BookingField;
  form: ReturnType<typeof useForm<FormValues>>;
}) {
  const props = form.getInputProps(`custom.${field.name}`);
  const label = field.label;
  const withAsterisk = field.required;
  const options = (field.options ?? []).map((o) => ({ value: o, label: o }));

  switch (field.type) {
    case "textarea":
      return <Textarea label={label} withAsterisk={withAsterisk} placeholder={field.placeholder} autosize minRows={2} {...props} />;
    case "number":
      return <NumberInput label={label} withAsterisk={withAsterisk} placeholder={field.placeholder} {...props} />;
    case "select":
      return (
        <Select label={label} withAsterisk={withAsterisk} placeholder={field.placeholder} data={options} {...props} />
      );
    case "multiselect":
      return (
        <MultiSelect label={label} withAsterisk={withAsterisk} placeholder={field.placeholder} data={options} {...props} />
      );
    case "radio":
      return (
        <Radio.Group label={label} withAsterisk={withAsterisk} {...props}>
          <Stack gap={4} mt={4}>
            {options.map((o) => (
              <Radio key={o.value} value={o.value} label={o.label} />
            ))}
          </Stack>
        </Radio.Group>
      );
    case "checkbox":
    case "boolean":
      return (
        <Checkbox
          label={label}
          checked={!!props.value}
          onChange={(e) => props.onChange(e.currentTarget.checked)}
        />
      );
    default:
      return (
        <TextInput
          label={label}
          withAsterisk={withAsterisk}
          placeholder={field.placeholder}
          type={field.type === "email" ? "email" : field.type === "phone" ? "tel" : "text"}
          {...props}
        />
      );
  }
}

// ─────────────────────────────────────────────────────────────
//  Экран подтверждения
// ─────────────────────────────────────────────────────────────

function BookingSuccess({
  booking,
  event,
  tz,
  onReset,
}: {
  booking: Booking;
  event: EventType;
  tz: string;
  onReset: () => void;
}) {
  const loc = describeLocation(booking.location as EventLocation | undefined);
  const pending = booking.status === "pending";

  return (
    <Card padding="xl" radius="lg">
      <Stack align="center" gap="xs" mb="md">
        <Center
          w={56}
          h={56}
          style={{
            borderRadius: "50%",
            background: pending
              ? "var(--mantine-color-yellow-1)"
              : "var(--mantine-color-teal-1)",
          }}
        >
          <IconCheck size={28} color={`var(--mantine-color-${pending ? "yellow" : "teal"}-7)`} />
        </Center>
        <Title order={3} ta="center">
          {pending ? "Заявка отправлена" : "Встреча забронирована"}
        </Title>
        <Text c="dimmed" ta="center" size="sm">
          {pending
            ? "Организатор подтвердит бронирование — вы получите уведомление на email."
            : "Подтверждение отправлено на ваш email."}
        </Text>
        <Badge color={pending ? "yellow" : "teal"}>
          {pending ? "Ожидает подтверждения" : "Подтверждено"}
        </Badge>
      </Stack>

      <Divider my="sm" />

      <Stack gap="xs">
        <SummaryRow label="Событие" value={event.title} />
        <SummaryRow label="Когда" value={fmtDateTimeTz(booking.start, tz)} />
        <SummaryRow label="Таймзона" value={tz} />
        {loc && <SummaryRow label="Где" value={loc.label} />}
        {booking.attendees[0] && (
          <SummaryRow
            label="Участник"
            value={`${booking.attendees[0].name} (${booking.attendees[0].email})`}
          />
        )}
        {booking.guests && booking.guests.length > 0 && (
          <SummaryRow label="Гости" value={booking.guests.join(", ")} />
        )}
        {booking.meetingUrl && (
          <SummaryRow
            label="Ссылка"
            value={
              <a href={booking.meetingUrl} target="_blank" rel="noreferrer">
                {booking.meetingUrl}
              </a>
            }
          />
        )}
      </Stack>

      <Button variant="light" color="gray" fullWidth mt="lg" onClick={onReset}>
        Забронировать ещё
      </Button>
    </Card>
  );
}

function SummaryRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <Group gap="xs" wrap="nowrap" align="flex-start">
      <Text size="sm" c="dimmed" w={90} style={{ flexShrink: 0 }}>
        {label}
      </Text>
      <Text size="sm" style={{ wordBreak: "break-word" }}>
        {value}
      </Text>
    </Group>
  );
}
