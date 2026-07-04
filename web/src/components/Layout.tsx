import { AppShell, Group, Text, NavLink as MantineNavLink, Avatar, Box } from "@mantine/core";
import { IconLink, IconCalendarEvent, IconClock, IconUser } from "@tabler/icons-react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { meApi } from "../api/client";
import { useResource } from "../api/useApi";

const NAV = [
  { to: "/event-types", label: "Типы событий", icon: IconLink },
  { to: "/bookings", label: "Бронирования", icon: IconCalendarEvent },
  { to: "/availability", label: "Доступность", icon: IconClock },
  { to: "/profile", label: "Профиль", icon: IconUser },
];

const initials = (name: string) =>
  name
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

export default function Layout() {
  const { data: user } = useResource(() => meApi.get(), []);
  const location = useLocation();

  return (
    <AppShell header={{ height: 0 }} navbar={{ width: 250, breakpoint: "sm" }} padding="lg">
      <AppShell.Navbar p="md">
        <AppShell.Section>
          <Group gap="xs" mb="md" px="xs">
            <Text size="xl">📅</Text>
            <Text fw={700} size="lg">
              Calendar
            </Text>
          </Group>
        </AppShell.Section>

        <AppShell.Section grow>
          {NAV.map(({ to, label, icon: Icon }) => (
            <MantineNavLink
              key={to}
              component={NavLink}
              to={to}
              label={label}
              leftSection={<Icon size={18} />}
              active={location.pathname.startsWith(to)}
              variant="light"
            />
          ))}
        </AppShell.Section>

        <AppShell.Section>
          {user && (
            <MantineNavLink
              component={NavLink}
              to="/profile"
              label={user.name}
              description={user.email}
              leftSection={<Avatar radius="xl" size="sm" color="dark">{initials(user.name)}</Avatar>}
            />
          )}
        </AppShell.Section>
      </AppShell.Navbar>

      <AppShell.Main>
        <Box maw={900} mx="auto">
          <Outlet />
        </Box>
      </AppShell.Main>
    </AppShell>
  );
}
