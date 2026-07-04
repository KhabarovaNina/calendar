import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { eventTypes, me, type EventType, type User } from "../api";

function slugify(s: string): string {
  const map: Record<string, string> = {
    а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh", з: "z",
    и: "i", й: "y", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r",
    с: "s", т: "t", у: "u", ф: "f", х: "h", ц: "ts", ч: "ch", ш: "sh",
    щ: "sch", ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya",
  };
  return s
    .toLowerCase()
    .split("")
    .map((ch) => map[ch] ?? ch)
    .join("")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function fmtPrice(amount: number, currency: string): string {
  return new Intl.NumberFormat("ru-RU", { style: "currency", currency, maximumFractionDigits: 0 }).format(
    amount / 100,
  );
}

export default function EventTypesPage() {
  const [items, setItems] = useState<EventType[]>([]);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const navigate = useNavigate();

  const reload = () =>
    eventTypes.list().then((page) => {
      setItems(page.items);
      setLoading(false);
    });

  useEffect(() => {
    reload();
    me.get().then(setUser);
  }, []);

  const bookingUrl = (et: EventType) =>
    `${window.location.origin}/book/${user?.username ?? "nina"}/${et.slug}`;

  const copyLink = async (et: EventType) => {
    await navigator.clipboard.writeText(bookingUrl(et));
    setCopiedId(et.id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  const toggleHidden = async (et: EventType) => {
    await eventTypes.update(et.id, { hidden: !et.hidden });
    reload();
  };

  const duplicate = async (et: EventType) => {
    await eventTypes.duplicate(et.id);
    reload();
  };

  const remove = async (et: EventType) => {
    if (!window.confirm(`Удалить «${et.title}»? Это действие необратимо.`)) return;
    await eventTypes.remove(et.id);
    reload();
  };

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Типы событий</h1>
          <p className="subtitle">События, которые люди могут у вас забронировать.</p>
        </div>
        <button className="btn primary" onClick={() => setShowCreate(true)}>
          + Создать
        </button>
      </div>

      {loading ? (
        <div className="loading">Загрузка…</div>
      ) : items.length === 0 ? (
        <div className="card empty-state">
          <div className="big">🗓️</div>
          <p>Пока нет ни одного типа события. Создайте первый!</p>
        </div>
      ) : (
        <div className="list">
          {items.map((et) => (
            <div className="card" key={et.id}>
              <div className="row">
                <div className="info">
                  <p className="title">
                    <Link to={`/event-types/${et.id}`} style={{ textDecoration: "none" }}>
                      {et.title}
                    </Link>{" "}
                    <span className="muted">/{et.slug}</span>
                  </p>
                  {et.description && <p className="desc">{et.description}</p>}
                  <div className="badges">
                    <span className="badge">⏱ {et.lengthInMinutes} мин</span>
                    {et.hidden && <span className="badge">🙈 Скрыто</span>}
                    {et.requiresConfirmation && (
                      <span className="badge yellow">✋ Требует подтверждения</span>
                    )}
                    {et.price && (
                      <span className="badge green">
                        💳 {fmtPrice(et.price.amount, et.price.currency)}
                      </span>
                    )}
                    {et.seatsPerTimeSlot && (
                      <span className="badge">👥 {et.seatsPerTimeSlot} мест</span>
                    )}
                  </div>
                </div>
                <div className="actions">
                  <button className="btn small" onClick={() => copyLink(et)}>
                    {copiedId === et.id ? "✓ Скопировано" : "🔗 Ссылка"}
                  </button>
                  <button className="btn small" onClick={() => toggleHidden(et)}>
                    {et.hidden ? "Показать" : "Скрыть"}
                  </button>
                  <button className="btn small" onClick={() => duplicate(et)}>
                    Дублировать
                  </button>
                  <button className="btn small danger" onClick={() => remove(et)}>
                    Удалить
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showCreate && (
        <CreateModal
          onClose={() => setShowCreate(false)}
          onCreated={(et) => {
            setShowCreate(false);
            navigate(`/event-types/${et.id}`);
          }}
        />
      )}
    </>
  );
}

function CreateModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (et: EventType) => void;
}) {
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [length, setLength] = useState(30);
  const [description, setDescription] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const et = await eventTypes.create({
        title,
        slug: slug || slugify(title),
        description: description || undefined,
        lengthInMinutes: length,
        locations: [{ type: "integration", integration: "google-meet" }],
        hidden: false,
        requiresConfirmation: false,
        disableGuests: false,
        minimumBookingNotice: 120,
        beforeEventBuffer: 0,
        afterEventBuffer: 0,
        bookingWindowDays: 60,
        schedulingType: "individual",
        scheduleId: 1,
      });
      onCreated(et);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось создать");
      setSaving(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Новый тип события</h2>
        {error && <div className="error-banner">{error}</div>}
        <form className="form-grid" onSubmit={submit}>
          <div className="field">
            <label>Название</label>
            <input
              autoFocus
              required
              value={title}
              placeholder="Например: Экспресс-созвон"
              onChange={(e) => {
                setTitle(e.target.value);
                if (!slugTouched) setSlug(slugify(e.target.value));
              }}
            />
          </div>
          <div className="field">
            <label>Слаг (ссылка)</label>
            <input
              required
              value={slug}
              pattern="[a-z0-9]+(-[a-z0-9]+)*"
              onChange={(e) => {
                setSlugTouched(true);
                setSlug(e.target.value);
              }}
            />
            <div className="hint">/book/nina/{slug || "…"}</div>
          </div>
          <div className="field">
            <label>Длительность, мин</label>
            <input
              type="number"
              min={5}
              max={1440}
              required
              value={length}
              onChange={(e) => setLength(Number(e.target.value))}
            />
          </div>
          <div className="field">
            <label>Описание</label>
            <textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div className="modal-actions">
            <button type="button" className="btn" onClick={onClose}>
              Отмена
            </button>
            <button type="submit" className="btn primary" disabled={saving}>
              {saving ? "Создание…" : "Создать"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
