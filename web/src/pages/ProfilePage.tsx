import { useEffect, useState } from "react";
import { me, type User } from "../api";

// Небольшой набор частых таймзон + текущая системная
const COMMON_TZ = [
  "Europe/Moscow",
  "Europe/Kaliningrad",
  "Europe/Samara",
  "Asia/Yekaterinburg",
  "Asia/Novosibirsk",
  "Asia/Krasnoyarsk",
  "Asia/Irkutsk",
  "Asia/Vladivostok",
  "Europe/London",
  "Europe/Berlin",
  "America/New_York",
  "America/Los_Angeles",
  "UTC",
];

export default function ProfilePage() {
  const [user, setUser] = useState<User | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    me.get().then(setUser);
  }, []);

  if (!user) return <div className="loading">Загрузка…</div>;

  const set = <K extends keyof User>(key: K, value: User[K]) =>
    setUser({ ...user, [key]: value });

  const tzOptions = Array.from(new Set([user.timeZone, ...COMMON_TZ]));

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const updated = await me.update({
        name: user.name,
        email: user.email,
        username: user.username,
        timeZone: user.timeZone,
        locale: user.locale,
      });
      setUser(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось сохранить");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Профиль</h1>
          <p className="subtitle">Ваши данные и настройки аккаунта.</p>
        </div>
        <button className="btn primary" onClick={save} disabled={saving}>
          {saving ? "Сохранение…" : saved ? "✓ Сохранено" : "Сохранить"}
        </button>
      </div>

      {error && <div className="error-banner">{error}</div>}

      <form className="card" style={{ padding: 24 }} onSubmit={save}>
        <div className="form-grid">
          <div className="field-row">
            <div className="field">
              <label>Имя</label>
              <input required value={user.name} onChange={(e) => set("name", e.target.value)} />
            </div>
            <div className="field">
              <label>Email</label>
              <input
                type="email"
                required
                value={user.email}
                onChange={(e) => set("email", e.target.value)}
              />
            </div>
          </div>

          <div className="field">
            <label>Username</label>
            <input
              required
              pattern="[a-z0-9]+(-[a-z0-9]+)*"
              value={user.username}
              onChange={(e) => set("username", e.target.value)}
            />
            <div className="hint">Публичный идентификатор в ссылках бронирования: /book/{user.username}</div>
          </div>

          <div className="field-row">
            <div className="field">
              <label>Таймзона</label>
              <select value={user.timeZone} onChange={(e) => set("timeZone", e.target.value)}>
                {tzOptions.map((tz) => (
                  <option key={tz} value={tz}>
                    {tz}
                  </option>
                ))}
              </select>
              <div className="hint">Используется для расчёта слотов и времени встреч</div>
            </div>
            <div className="field">
              <label>Язык интерфейса</label>
              <select
                value={user.locale ?? "ru"}
                onChange={(e) => set("locale", e.target.value)}
              >
                <option value="ru">Русский</option>
                <option value="en">English</option>
              </select>
            </div>
          </div>
        </div>
      </form>
    </>
  );
}
