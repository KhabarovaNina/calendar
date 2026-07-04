import { useEffect, useState } from "react";
import { availability, type AvailabilityRule, type Schedule, type Weekday } from "../api";

const DAYS: { key: Weekday; label: string }[] = [
  { key: "monday", label: "Понедельник" },
  { key: "tuesday", label: "Вторник" },
  { key: "wednesday", label: "Среда" },
  { key: "thursday", label: "Четверг" },
  { key: "friday", label: "Пятница" },
  { key: "saturday", label: "Суббота" },
  { key: "sunday", label: "Воскресенье" },
];

interface DayState {
  enabled: boolean;
  startTime: string;
  endTime: string;
}

type WeekState = Record<Weekday, DayState>;

function rulesToWeek(rules: AvailabilityRule[]): WeekState {
  const week = {} as WeekState;
  for (const { key } of DAYS) {
    const rule = rules.find((r) => r.days.includes(key));
    week[key] = rule
      ? { enabled: true, startTime: rule.startTime, endTime: rule.endTime }
      : { enabled: false, startTime: "09:00", endTime: "18:00" };
  }
  return week;
}

function weekToRules(week: WeekState): AvailabilityRule[] {
  // Дни с одинаковым интервалом группируются в одно правило
  const groups = new Map<string, Weekday[]>();
  for (const { key } of DAYS) {
    const d = week[key];
    if (!d.enabled) continue;
    const groupKey = `${d.startTime}-${d.endTime}`;
    groups.set(groupKey, [...(groups.get(groupKey) ?? []), key]);
  }
  return [...groups.entries()].map(([groupKey, days]) => {
    const [startTime, endTime] = groupKey.split("-");
    return { days, startTime, endTime };
  });
}

export default function AvailabilityPage() {
  const [schedule, setSchedule] = useState<Schedule | null>(null);
  const [week, setWeek] = useState<WeekState | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    availability.list().then((page) => {
      const s = page.items.find((x) => x.isDefault) ?? page.items[0];
      if (s) {
        setSchedule(s);
        setWeek(rulesToWeek(s.availability));
      }
    });
  }, []);

  if (!schedule || !week) return <div className="loading">Загрузка…</div>;

  const setDay = (day: Weekday, patch: Partial<DayState>) =>
    setWeek({ ...week, [day]: { ...week[day], ...patch } });

  const save = async () => {
    setSaving(true);
    await availability.update(schedule.id, { availability: weekToRules(week) });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Доступность</h1>
          <p className="subtitle">
            {schedule.name} · Таймзона: {schedule.timeZone}
          </p>
        </div>
        <button className="btn primary" onClick={save} disabled={saving}>
          {saving ? "Сохранение…" : saved ? "✓ Сохранено" : "Сохранить"}
        </button>
      </div>

      <div className="card" style={{ padding: "8px 24px" }}>
        {DAYS.map(({ key, label }) => {
          const d = week[key];
          return (
            <div className="day-row" key={key}>
              <label className="day-name">
                <input
                  type="checkbox"
                  checked={d.enabled}
                  onChange={(e) => setDay(key, { enabled: e.target.checked })}
                />
                {label}
              </label>
              {d.enabled ? (
                <>
                  <input
                    type="time"
                    value={d.startTime}
                    onChange={(e) => setDay(key, { startTime: e.target.value })}
                  />
                  <span className="muted">—</span>
                  <input
                    type="time"
                    value={d.endTime}
                    onChange={(e) => setDay(key, { endTime: e.target.value })}
                  />
                </>
              ) : (
                <span className="off">Недоступно</span>
              )}
            </div>
          );
        })}
      </div>

      <p className="muted" style={{ marginTop: 16 }}>
        Слоты на публичной странице бронирования рассчитываются из этого расписания с учётом
        существующих броней, буферов и минимального времени до брони.
      </p>
    </>
  );
}
