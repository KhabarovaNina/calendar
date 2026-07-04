import { useEffect, useState } from "react";
import {
  Button,
  Card,
  Group,
  Loader,
  Select,
  Stack,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { meApi, type User } from "../api/client";

const TZ = [
  "Europe/Moscow",
  "Europe/Kaliningrad",
  "Asia/Yekaterinburg",
  "Asia/Novosibirsk",
  "Asia/Vladivostok",
  "Europe/London",
  "America/New_York",
  "UTC",
];

export default function ProfilePage() {
  const [user, setUser] = useState<User | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    meApi.get().then(setUser);
  }, []);

  if (!user) return <Loader />;

  const set = <K extends keyof User>(key: K, value: User[K]) => setUser({ ...user, [key]: value });

  const tzData = Array.from(new Set([user.timeZone, ...TZ]));

  const save = async () => {
    setSaving(true);
    try {
      await meApi.update({
        name: user.name,
        email: user.email,
        username: user.username,
        timeZone: user.timeZone,
        locale: user.locale,
      });
      notifications.show({
        color: "teal",
        title: "Сохранено",
        message: "Профиль отправлен на mock-сервер (Prism не персистит).",
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
          <Title order={2}>Профиль</Title>
          <Text c="dimmed">Ваши данные и настройки аккаунта.</Text>
        </div>
        <Button onClick={save} loading={saving}>
          Сохранить
        </Button>
      </Group>

      <Card withBorder padding="lg">
        <Stack>
          <Group grow align="flex-start">
            <TextInput label="Имя" value={user.name} onChange={(e) => set("name", e.currentTarget.value)} />
            <TextInput
              label="Email"
              type="email"
              value={user.email}
              onChange={(e) => set("email", e.currentTarget.value)}
            />
          </Group>
          <TextInput
            label="Username"
            description={`Публичный идентификатор в ссылках: /book/${user.username}`}
            value={user.username}
            onChange={(e) => set("username", e.currentTarget.value)}
          />
          <Group grow align="flex-start">
            <Select
              label="Таймзона"
              data={tzData}
              value={user.timeZone}
              onChange={(v) => set("timeZone", v ?? user.timeZone)}
            />
            <Select
              label="Язык интерфейса"
              data={[
                { value: "ru", label: "Русский" },
                { value: "en", label: "English" },
              ]}
              value={user.locale ?? "ru"}
              onChange={(v) => set("locale", v ?? "ru")}
            />
          </Group>
        </Stack>
      </Card>
    </Stack>
  );
}
