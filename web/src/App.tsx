import { Navigate, Route, Routes } from "react-router-dom";
import Layout from "./components/Layout";
import EventTypesPage from "./pages/EventTypesPage";
import EventTypeEditPage from "./pages/EventTypeEditPage";
import BookingsPage from "./pages/BookingsPage";
import AvailabilityPage from "./pages/AvailabilityPage";
import ProfilePage from "./pages/ProfilePage";

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Navigate to="/event-types" replace />} />
        <Route path="/event-types" element={<EventTypesPage />} />
        <Route path="/event-types/:id" element={<EventTypeEditPage />} />
        <Route path="/bookings" element={<BookingsPage />} />
        <Route path="/availability" element={<AvailabilityPage />} />
        <Route path="/profile" element={<ProfilePage />} />
      </Route>

      <Route path="*" element={<Navigate to="/event-types" replace />} />
    </Routes>
  );
}
