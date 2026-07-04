import { useEffect, useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { me, type User } from "../api";

const initials = (name: string) =>
  name
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

export default function Layout() {
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    me.get().then(setUser);
  }, []);

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="logo">📅 Calendar</div>
        <nav>
          <NavLink to="/event-types">
            🔗 <span>Типы событий</span>
          </NavLink>
          <NavLink to="/bookings">
            📆 <span>Бронирования</span>
          </NavLink>
          <NavLink to="/availability">
            🕘 <span>Доступность</span>
          </NavLink>
          <NavLink to="/profile">
            👤 <span>Профиль</span>
          </NavLink>
        </nav>
        <div className="spacer" />
        {user && (
          <NavLink to="/profile" className="user-card" style={{ textDecoration: "none", color: "inherit" }}>
            <div className="avatar">{initials(user.name)}</div>
            <div className="meta">
              <div className="name">{user.name}</div>
              <div className="email">{user.email}</div>
            </div>
          </NavLink>
        )}
      </aside>
      <main className="main">
        <Outlet />
      </main>
    </div>
  );
}
