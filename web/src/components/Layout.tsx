import { AppShell, Group, Text, NavLink as MantineNavLink, Avatar, Box, UnstyledButton, ActionIcon, Tooltip } from "@mantine/core";
import { IconLink, IconCalendarEvent, IconClock, IconUser, IconLogout } from "@tabler/icons-react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useCurrentUser } from "../api/user";
import { authApi } from "../api/client";
import classes from "./Layout.module.css";

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
  const { data: user, reload } = useCurrentUser();
  const location = useLocation();

  const handleLogout = async () => {
    await authApi.logout();
    reload(); // /me → 401 → AuthGate покажет экран входа
  };

  return (
    <AppShell header={{ height: 0 }} navbar={{ width: 256, breakpoint: "sm" }} padding="xl">
      <AppShell.Navbar p="sm" className={classes.navbar}>
        <AppShell.Section grow>
          {NAV.map(({ to, label, icon: Icon }) => {
            const active = location.pathname.startsWith(to);
            return (
              <MantineNavLink
                key={to}
                component={NavLink}
                to={to}
                label={label}
                leftSection={<Icon size={18} stroke={1.8} />}
                active={active}
                variant="subtle"
                className={`${classes.navItem} ${active ? classes.navItemActive : ""}`}
              />
            );
          })}
        </AppShell.Section>

        <AppShell.Section>
          {user && (
            <UnstyledButton component={NavLink} to="/profile" className={classes.userBlock} p="xs" display="block">
              <Group gap="xs" wrap="nowrap">
                <Avatar radius="xl" size="sm" color="dark">
                  {initials(user.name)}
                </Avatar>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <Text size="sm" fw={500} truncate c="gray.9">
                    {user.name}
                  </Text>
                  <Text size="xs" c="dimmed" truncate>
                    {user.email}
                  </Text>
                </div>
                <Tooltip label="Выйти">
                  <ActionIcon
                    variant="subtle"
                    color="gray"
                    component="div"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      handleLogout();
                    }}
                  >
                    <IconLogout size={18} stroke={1.8} />
                  </ActionIcon>
                </Tooltip>
              </Group>
            </UnstyledButton>
          )}
        </AppShell.Section>
      </AppShell.Navbar>

      <AppShell.Main>
        <Box maw={1100} mx="auto">
          <Outlet />
        </Box>
      </AppShell.Main>
    </AppShell>
  );
}
