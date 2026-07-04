import { useCallback, useEffect, useState } from "react";
import { bookings, upcoming, type Booking, type BookingStatus } from "../api";
import { fmtDate, fmtTime } from "../lib/dates";

type Tab = "upcoming" | "pending" | "past" | "cancelled";

const TABS: { key: Tab; label: string }[] = [
  { key: "upcoming", label: "Предстоящие" },
  { key: "pending", label: "Неподтверждённые" },
  { key: "past", label: "Прошедшие" },
  { key: "cancelled", label: "Отменённые" },
];

const STATUS_BADGE: Record<BookingStatus, { text: string; cls: string }> = {
  accepted: { text: "Подтверждено", cls: "green" },
  pending: { text: "Ожидает", cls: "yellow" },
  rejected: { text: "Отклонено", cls: "red" },
  cancelled: { text: "Отменено", cls: "red" },
};

export default function BookingsPage() {
  const [tab, setTab] = useState<Tab>("upcoming");
  const [items, setItems] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    const nowIso = new Date().toISOString();
    let result: Booking[];
    if (tab === "upcoming") {
      result = (await upcoming.list()).items;
    } else if (tab === "pending") {
      result = (await bookings.list({ status: "pending" })).items;
    } else if (tab === "cancelled") {
      const [cancelled, rejected] = await Promise.all([
        bookings.list({ status: "cancelled" }),
        bookings.list({ status: "rejected" }),
      ]);
      result = [...cancelled.items, ...rejected.items].sort((a, b) =>
        b.start.localeCompare(a.start),
      );
    } else {
      const all = await bookings.list({ beforeEnd: nowIso });
      result = all.items
        .filter((b) => b.status === "accepted")
        .sort((a, b) => b.start.localeCompare(a.start));
    }
    setItems(result);
    setLoading(false);
  }, [tab]);

  useEffect(() => {
    reload();
  }, [reload]);

  const cancel = async (b: Booking) => {
    const reason = window.prompt("Причина отмены (необязательно):") ?? undefined;
    await bookings.cancel(b.uid, reason || undefined);
    reload();
  };

  const confirm = async (b: Booking) => {
    await bookings.confirm(b.uid);
    reload();
  };

  const reject = async (b: Booking) => {
    const reason = window.prompt("Причина отклонения (необязательно):") ?? undefined;
    await bookings.reject(b.uid, reason || undefined);
    reload();
  };

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Бронирования</h1>
          <p className="subtitle">Все встречи, забронированные через ваши типы событий.</p>
        </div>
      </div>

      <div className="tabs">
        {TABS.map((t) => (
          <button key={t.key} className={tab === t.key ? "active" : ""} onClick={() => setTab(t.key)}>
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="loading">Загрузка…</div>
      ) : items.length === 0 ? (
        <div className="card empty-state">
          <div className="big">📭</div>
          <p>Здесь пока пусто.</p>
        </div>
      ) : (
        <div className="list">
          {items.map((b) => {
            const badge = STATUS_BADGE[b.status];
            const attendee = b.attendees[0];
            return (
              <div className="card" key={b.uid}>
                <div className="row">
                  <div className="info">
                    <p className="title">{b.title}</p>
                    <p className="desc">
                      {fmtDate(b.start)}, {fmtTime(b.start)} – {fmtTime(b.end)}
                      {attendee && (
                        <>
                          {" · "}
                          {attendee.name} ({attendee.email})
                        </>
                      )}
                    </p>
                    <div className="badges">
                      <span className={`badge ${badge.cls}`}>{badge.text}</span>
                      {b.meetingUrl && (
                        <a
                          className="badge"
                          href={b.meetingUrl}
                          target="_blank"
                          rel="noreferrer"
                          style={{ textDecoration: "none" }}
                        >
                          🎥 Ссылка на встречу
                        </a>
                      )}
                      {b.cancellationReason && (
                        <span className="badge">Причина: {b.cancellationReason}</span>
                      )}
                      {b.rejectionReason && (
                        <span className="badge">Причина: {b.rejectionReason}</span>
                      )}
                    </div>
                  </div>
                  <div className="actions">
                    {b.status === "pending" && (
                      <>
                        <button className="btn small primary" onClick={() => confirm(b)}>
                          Подтвердить
                        </button>
                        <button className="btn small danger" onClick={() => reject(b)}>
                          Отклонить
                        </button>
                      </>
                    )}
                    {(b.status === "accepted" || b.status === "pending") &&
                      new Date(b.start) > new Date() && (
                        <button className="btn small danger" onClick={() => cancel(b)}>
                          Отменить
                        </button>
                      )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
