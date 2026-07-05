import { Link, useParams } from "react-router-dom";
import {
  Avatar,
  Badge,
  Card,
  Center,
  Container,
  Group,
  Loader,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import { IconClock } from "@tabler/icons-react";
import { publicApi, type EventType } from "../../api/client";
import { useResource } from "../../api/useApi";
import { fmtPrice } from "../../lib/format";
import { describeLocation } from "./location";

const initials = (name: string) =>
  name
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

export default function OrganizerPage() {
  const { username = "" } = useParams();
  const { data, loading, error } = useResource(() => publicApi.organizer(username), [username]);

  if (loading) {
    return (
      <Center mih="100vh">
        <Loader />
      </Center>
    );
  }

  if (error || !data) {
    return (
      <Center mih="100vh">
        <Stack align="center" gap="xs">
          <Title order={3}>Организатор не найден</Title>
          <Text c="dimmed">Проверьте ссылку — возможно, в ней опечатка.</Text>
        </Stack>
      </Center>
    );
  }

  return (
    <Container size="sm" py={64}>
      <Stack align="center" gap="xs" mb="xl">
        <Avatar src={data.avatarUrl} size={80} radius="xl" color="dark">
          {initials(data.name)}
        </Avatar>
        <Title order={2}>{data.name}</Title>
        <Text c="dimmed">@{data.username}</Text>
      </Stack>

      {data.eventTypes.length === 0 ? (
        <Text c="dimmed" ta="center">
          У организатора пока нет доступных событий для бронирования.
        </Text>
      ) : (
        <Stack gap="sm">
          {data.eventTypes.map((et) => (
            <EventTypeCard key={et.id} username={data.username} event={et} />
          ))}
        </Stack>
      )}
    </Container>
  );
}

function EventTypeCard({ username, event }: { username: string; event: EventType }) {
  const loc = describeLocation(event.locations?.[0]);
  return (
    <Card
      component={Link}
      to={`/book/${username}/${event.slug}`}
      padding="md"
      style={{ transition: "border-color 120ms", textDecoration: "none", color: "inherit" }}
    >
      <Group justify="space-between" wrap="nowrap" align="flex-start">
        <div style={{ minWidth: 0 }}>
          <Text fw={600}>{event.title}</Text>
          {event.description && (
            <Text c="dimmed" size="sm" lineClamp={2} mt={2}>
              {event.description}
            </Text>
          )}
          <Group gap="xs" mt="xs" c="dimmed">
            <Group gap={4}>
              <IconClock size={14} />
              <Text size="sm">{event.lengthInMinutes} мин</Text>
            </Group>
            {loc && (
              <Group gap={4}>
                <loc.Icon size={14} />
                <Text size="sm">{loc.label}</Text>
              </Group>
            )}
          </Group>
        </div>
        {event.price && (
          <Badge variant="light" color="gray">
            {fmtPrice(event.price.amount, event.price.currency)}
          </Badge>
        )}
      </Group>
    </Card>
  );
}
