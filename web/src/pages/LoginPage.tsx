// Экран входа/регистрации организатора. Показывается, пока нет активной сессии
// (см. AuthGate в App.tsx). После успеха вызывает onSuccess → перезапрос /me.

import { useState } from "react";
import {
  Button,
  Center,
  Paper,
  PasswordInput,
  SegmentedControl,
  Stack,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { authApi, ApiError } from "../api/client";

type Mode = "login" | "register";

const GUESS_TZ =
  Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/Moscow";

export default function LoginPage({ onSuccess }: { onSuccess: () => void }) {
  const [mode, setMode] = useState<Mode>("login");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string>();

  const form = useForm({
    initialValues: { name: "", username: "", email: "", password: "" },
    validate: {
      email: (v) => (/^\S+@\S+$/.test(v) ? null : "Некорректный email"),
      password: (v) => (v.length >= 8 ? null : "Минимум 8 символов"),
      name: (v) => (mode === "register" && !v.trim() ? "Укажите имя" : null),
      username: (v) =>
        mode === "register" && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(v)
          ? "Строчные латинские буквы, цифры и дефисы"
          : null,
    },
  });

  const submit = form.onSubmit(async (values) => {
    setSubmitting(true);
    setError(undefined);
    try {
      if (mode === "login") {
        await authApi.login({ email: values.email, password: values.password });
      } else {
        await authApi.register({
          name: values.name,
          username: values.username,
          email: values.email,
          password: values.password,
          timeZone: GUESS_TZ,
        });
      }
      onSuccess();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Не удалось войти");
      setSubmitting(false);
    }
  });

  return (
    <Center mih="100vh" bg="gray.0">
      <Paper withBorder shadow="sm" radius="md" p="xl" w={380}>
        <Stack gap="md">
          <div>
            <Title order={3}>Calendar</Title>
            <Text size="sm" c="dimmed">
              {mode === "login" ? "Вход для организатора" : "Регистрация организатора"}
            </Text>
          </div>

          <SegmentedControl
            fullWidth
            value={mode}
            onChange={(v) => {
              setMode(v as Mode);
              setError(undefined);
            }}
            data={[
              { label: "Вход", value: "login" },
              { label: "Регистрация", value: "register" },
            ]}
          />

          <form onSubmit={submit}>
            <Stack gap="sm">
              {mode === "register" && (
                <>
                  <TextInput label="Имя" {...form.getInputProps("name")} />
                  <TextInput
                    label="Username"
                    description="Часть публичной ссылки: /{username}/{событие}"
                    {...form.getInputProps("username")}
                  />
                </>
              )}
              <TextInput label="Email" {...form.getInputProps("email")} />
              <PasswordInput label="Пароль" {...form.getInputProps("password")} />

              {error && (
                <Text size="sm" c="red">
                  {error}
                </Text>
              )}

              <Button type="submit" loading={submitting} fullWidth mt="xs">
                {mode === "login" ? "Войти" : "Зарегистрироваться"}
              </Button>
            </Stack>
          </form>
        </Stack>
      </Paper>
    </Center>
  );
}
