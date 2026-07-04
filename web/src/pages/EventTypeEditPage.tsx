import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { eventTypes, type EventLocation, type EventType } from "../api";

type LocationKind = "google-meet" | "zoom" | "ms-teams" | "link" | "address" | "phone";

function locationKind(loc: EventLocation | undefined): LocationKind {
  if (!loc) return "google-meet";
  if (loc.type === "integration") return loc.integration === "daily" ? "google-meet" : loc.integration;
  if (loc.type === "link") return "link";
  if (loc.type === "address") return "address";
  return loc.type === "phone" ? "phone" : "google-meet";
}

function buildLocation(kind: LocationKind, value: string): EventLocation {
  switch (kind) {
    case "link":
      return { type: "link", link: value || "https://example.com" };
    case "address":
      return { type: "address", address: value };
    case "phone":
      return { type: "phone", phone: value || undefined };
    default:
      return { type: "integration", integration: kind };
  }
}

export default function EventTypeEditPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [et, setEt] = useState<EventType | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  const [locKind, setLocKind] = useState<LocationKind>("google-meet");
  const [locValue, setLocValue] = useState("");

  useEffect(() => {
    eventTypes.get(Number(id)).then((data) => {
      setEt(data);
      const loc = data.locations[0];
      setLocKind(locationKind(loc));
      if (loc?.type === "link") setLocValue(loc.link);
      else if (loc?.type === "address") setLocValue(loc.address);
      else if (loc?.type === "phone") setLocValue(loc.phone ?? "");
    });
  }, [id]);

  if (!et) return <div className="loading">Загрузка…</div>;

  const set = <K extends keyof EventType>(key: K, value: EventType[K]) =>
    setEt({ ...et, [key]: value });

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      await eventTypes.update(et.id, {
        title: et.title,
        slug: et.slug,
        description: et.description,
        lengthInMinutes: et.lengthInMinutes,
        locations: [buildLocation(locKind, locValue)],
        hidden: et.hidden,
        requiresConfirmation: et.requiresConfirmation,
        disableGuests: et.disableGuests,
        minimumBookingNotice: et.minimumBookingNotice,
        beforeEventBuffer: et.beforeEventBuffer,
        afterEventBuffer: et.afterEventBuffer,
        bookingWindowDays: et.bookingWindowDays,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось сохранить");
    } finally {
      setSaving(false);
    }
  };

  const needsLocValue = locKind === "link" || locKind === "address" || locKind === "phone";

  return (
    <>
      <div className="page-header">
        <div>
          <p className="subtitle">
            <Link to="/event-types">← Типы событий</Link>
          </p>
          <h1>{et.title}</h1>
        </div>
        <button className="btn primary" onClick={save} disabled={saving}>
          {saving ? "Сохранение…" : saved ? "✓ Сохранено" : "Сохранить"}
        </button>
      </div>

      {error && <div className="error-banner">{error}</div>}

      <form className="card" style={{ padding: 24 }} onSubmit={save}>
        <div className="form-grid">
          <div className="field">
            <label>Название</label>
            <input required value={et.title} onChange={(e) => set("title", e.target.value)} />
          </div>

          <div className="field">
            <label>Слаг</label>
            <input
              required
              pattern="[a-z0-9]+(-[a-z0-9]+)*"
              value={et.slug}
              onChange={(e) => set("slug", e.target.value)}
            />
            <div className="hint">/book/nina/{et.slug}</div>
          </div>

          <div className="field">
            <label>Описание</label>
            <textarea
              rows={3}
              value={et.description ?? ""}
              onChange={(e) => set("description", e.target.value || undefined)}
            />
          </div>

          <div className="field-row">
            <div className="field">
              <label>Длительность, мин</label>
              <input
                type="number"
                min={5}
                max={1440}
                required
                value={et.lengthInMinutes}
                onChange={(e) => set("lengthInMinutes", Number(e.target.value))}
              />
            </div>
            <div className="field">
              <label>Место проведения</label>
              <select value={locKind} onChange={(e) => setLocKind(e.target.value as LocationKind)}>
                <option value="google-meet">Google Meet</option>
                <option value="zoom">Zoom</option>
                <option value="ms-teams">Microsoft Teams</option>
                <option value="link">Своя ссылка</option>
                <option value="address">Личная встреча (адрес)</option>
                <option value="phone">Телефонный звонок</option>
              </select>
            </div>
          </div>

          {needsLocValue && (
            <div className="field">
              <label>
                {locKind === "link" ? "Ссылка" : locKind === "address" ? "Адрес" : "Телефон"}
              </label>
              <input value={locValue} onChange={(e) => setLocValue(e.target.value)} />
            </div>
          )}

          <div className="field-row">
            <div className="field">
              <label>Мин. время до брони, мин</label>
              <input
                type="number"
                min={0}
                value={et.minimumBookingNotice}
                onChange={(e) => set("minimumBookingNotice", Number(e.target.value))}
              />
              <div className="hint">Раньше этого срока слот забронировать нельзя</div>
            </div>
            <div className="field">
              <label>Окно бронирования, дней</label>
              <input
                type="number"
                min={1}
                value={et.bookingWindowDays ?? 60}
                onChange={(e) => set("bookingWindowDays", Number(e.target.value))}
              />
            </div>
          </div>

          <div className="field-row">
            <div className="field">
              <label>Буфер до, мин</label>
              <input
                type="number"
                min={0}
                value={et.beforeEventBuffer}
                onChange={(e) => set("beforeEventBuffer", Number(e.target.value))}
              />
            </div>
            <div className="field">
              <label>Буфер после, мин</label>
              <input
                type="number"
                min={0}
                value={et.afterEventBuffer}
                onChange={(e) => set("afterEventBuffer", Number(e.target.value))}
              />
            </div>
          </div>

          <label className="checkbox-field">
            <input
              type="checkbox"
              checked={et.requiresConfirmation}
              onChange={(e) => set("requiresConfirmation", e.target.checked)}
            />
            <span>
              <span className="label">Требует подтверждения</span>
              <br />
              <span className="hint">Бронь попадает в «Неподтверждённые», пока вы её не одобрите</span>
            </span>
          </label>

          <label className="checkbox-field">
            <input
              type="checkbox"
              checked={et.disableGuests}
              onChange={(e) => set("disableGuests", e.target.checked)}
            />
            <span>
              <span className="label">Запретить гостей</span>
              <br />
              <span className="hint">Участник не сможет добавить дополнительные email</span>
            </span>
          </label>

          <label className="checkbox-field">
            <input
              type="checkbox"
              checked={et.hidden}
              onChange={(e) => set("hidden", e.target.checked)}
            />
            <span>
              <span className="label">Скрыть с публичной страницы</span>
              <br />
              <span className="hint">Событие останется доступно по прямой ссылке</span>
            </span>
          </label>

          <div>
            <button
              type="button"
              className="btn danger"
              onClick={async () => {
                if (!window.confirm(`Удалить «${et.title}»?`)) return;
                await eventTypes.remove(et.id);
                navigate("/event-types");
              }}
            >
              Удалить тип события
            </button>
          </div>
        </div>
      </form>
    </>
  );
}
