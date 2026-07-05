import { Navigate, Outlet, Route, Routes } from "react-router-dom";
import { Center, Loader } from "@mantine/core";
import Layout from "./components/Layout";
import EventTypesPage from "./pages/EventTypesPage";
import EventTypeEditPage from "./pages/EventTypeEditPage";
import BookingsPage from "./pages/BookingsPage";
import AvailabilityPage from "./pages/AvailabilityPage";
import AvailabilityEditPage from "./pages/AvailabilityEditPage";
import ProfilePage from "./pages/ProfilePage";
import LoginPage from "./pages/LoginPage";
import OrganizerPage from "./pages/public/OrganizerPage";
import BookingPage from "./pages/public/BookingPage";
import { UserProvider, useCurrentUser } from "./api/user";

/** Guard кабинета организатора: без активной сессии — экран входа. */
function RequireAuth() {
  const { data: user, loading, error, reload } = useCurrentUser();

  if (loading) {
    return (
      <Center mih="100vh">
        <Loader />
      </Center>
    );
  }

  // Нет пользователя или /me вернул ошибку (401 после logout) → экран входа.
  if (!user || error) {
    return <LoginPage onSuccess={reload} />;
  }

  return <Outlet />;
}

export default function App() {
  return (
    <UserProvider>
      <Routes>
        {/* Публичные страницы бронирования — без авторизации (см. docs/adr/0001). */}
        <Route path="/book/:username" element={<OrganizerPage />} />
        <Route path="/book/:username/:slug" element={<BookingPage />} />

        {/* Кабинет организатора — за авторизацией. */}
        <Route element={<RequireAuth />}>
          <Route element={<Layout />}>
            <Route path="/" element={<Navigate to="/event-types" replace />} />
            <Route path="/event-types" element={<EventTypesPage />} />
            <Route path="/event-types/:id" element={<EventTypeEditPage />} />
            <Route path="/bookings" element={<BookingsPage />} />
            <Route path="/availability" element={<AvailabilityPage />} />
            <Route path="/availability/:id" element={<AvailabilityEditPage />} />
            <Route path="/profile" element={<ProfilePage />} />
          </Route>
        </Route>

        <Route path="*" element={<Navigate to="/event-types" replace />} />
      </Routes>
    </UserProvider>
  );
}
