import { useEffect, useMemo, useRef, useState } from "react";
import * as api from "../api.js";
import type { DayPoint, WritingSummary, GoalRow } from "../store/db.js";

/* Analytics + goals for a project, all read from the writingLog time series.
   Goals are editable inline; everything else is derived (streaks, totals,
   daily chart, and deadline pacing). */

const RANGES = [
  { label: "7d", days: 7 },
  { label: "30d", days: 30 },
  { label: "90d", days: 90 },
];

const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${`${d.getMonth() + 1}`.padStart(2, "0")}-${`${d.getDate()}`.padStart(2, "0")}`;
};

/** Whole-day difference b − a for two YYYY-MM-DD strings (local). */
function daysBetween(a: string, b: string): number {
  const [ay, am, ad] = a.split("-").map(Number);
  const [by, bm, bd] = b.split("-").map(Number);
  return Math.round((Date.UTC(by!, bm! - 1, bd!) - Date.UTC(ay!, am! - 1, ad!)) / 86_400_000);
}

function addDays(a: string, n: number): string {
  const [y, m, d] = a.split("-").map(Number);
  const dt = new Date(y!, m! - 1, d! + n);
  return `${dt.getFullYear()}-${`${dt.getMonth() + 1}`.padStart(2, "0")}-${`${dt.getDate()}`.padStart(2, "0")}`;
}

const fmtDate = (s: string) => {
  const [, m, d] = s.split("-").map(Number);
  return `${m}/${d}`;
};

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border border-linesoft bg-surface px-4 py-3">
      <div className="text-2xl font-bold text-fg">{value}</div>
      <div className="text-[11px] uppercase tracking-wide text-mute">{label}</div>
      {sub && <div className="mt-0.5 text-xs text-dim">{sub}</div>}
    </div>
  );
}

export function Stats({ projectId, totalWords, onClose }: { projectId: string; totalWords: number; onClose: () => void }) {
  const [goal, setGoal] = useState<GoalRow | null>(null);
  const [summary, setSummary] = useState<WritingSummary | null>(null);
  const [series, setSeries] = useState<DayPoint[]>([]);
  const [streakToGoal, setStreakToGoal] = useState(0);
  const [days, setDays] = useState(30);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    api.getGoal(projectId).then(setGoal);
    api.writingSummary(projectId).then(setSummary);
  }, [projectId]);

  useEffect(() => {
    api.writingSeries(projectId, days).then(setSeries);
  }, [projectId, days]);

  useEffect(() => {
    if (goal) api.targetStreak(projectId, goal.dailyTarget).then(setStreakToGoal);
  }, [projectId, goal?.dailyTarget]);

  function patchGoal(patch: Partial<Omit<GoalRow, "projectId" | "updatedAt">>) {
    setGoal((g) => (g ? { ...g, ...patch } : g));
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => void api.setGoal(projectId, patch), 400);
  }

  const today = todayStr();
  const dailyTarget = goal?.dailyTarget ?? 0;
  const todayWords = summary?.today ?? 0;
  const todayFrac = dailyTarget > 0 ? Math.min(1, todayWords / dailyTarget) : 0;

  // chart scale: tallest of the visible bars and the target line
  const maxBar = useMemo(() => Math.max(1, dailyTarget, ...series.map((p) => p.words)), [series, dailyTarget]);
  const recentAvg = series.length ? Math.round(series.reduce((s, p) => s + p.words, 0) / series.length) : 0;

  // deadline pacing
  const totalTarget = goal?.totalTarget ?? 0;
  const deadline = goal?.deadline ?? "";
  const remaining = Math.max(0, totalTarget - totalWords);
  const daysLeft = deadline ? Math.max(0, daysBetween(today, deadline) + 1) : null;
  const neededPerDay = totalTarget > 0 && daysLeft ? Math.ceil(remaining / Math.max(1, daysLeft)) : null;
  const projectedDate = totalTarget > 0 && remaining > 0 && recentAvg > 0 ? addDays(today, Math.ceil(remaining / recentAvg)) : null;
  const onTrack = projectedDate && deadline ? daysBetween(projectedDate, deadline) >= 0 : null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-void">
      <div className="flex items-center justify-between border-b border-linesoft bg-surface px-4 py-2">
        <span className="font-semibold text-fg">Statistics &amp; goals</span>
        <button onClick={onClose} className="text-sm text-dim hover:text-fg">
          Close ✕
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-6">
        <div className="mx-auto max-w-3xl space-y-6">
          {/* ---- goals editor ---- */}
          <section className="rounded-xl border border-line bg-surface p-4">
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-mute">Goals</h3>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <label className="block">
                <span className="text-[11px] uppercase tracking-wide text-mute">Daily word goal</span>
                <input
                  type="number"
                  min={0}
                  step={50}
                  value={goal?.dailyTarget || ""}
                  onChange={(e) => patchGoal({ dailyTarget: Math.max(0, Math.floor(+e.target.value || 0)) })}
                  placeholder="e.g. 500"
                  className="mt-1 w-full rounded-md bg-surface2 px-2 py-1.5 text-sm text-fg outline-none focus:bg-elevated"
                />
              </label>
              <label className="block">
                <span className="text-[11px] uppercase tracking-wide text-mute">Manuscript target</span>
                <input
                  type="number"
                  min={0}
                  step={1000}
                  value={goal?.totalTarget || ""}
                  onChange={(e) => patchGoal({ totalTarget: Math.max(0, Math.floor(+e.target.value || 0)) })}
                  placeholder="e.g. 80000"
                  className="mt-1 w-full rounded-md bg-surface2 px-2 py-1.5 text-sm text-fg outline-none focus:bg-elevated"
                />
              </label>
              <label className="block">
                <span className="text-[11px] uppercase tracking-wide text-mute">Deadline</span>
                <input
                  type="date"
                  value={goal?.deadline || ""}
                  onChange={(e) => patchGoal({ deadline: e.target.value })}
                  className="mt-1 w-full rounded-md bg-surface2 px-2 py-1.5 text-sm text-fg outline-none focus:bg-elevated"
                />
              </label>
            </div>

            {/* today vs daily goal */}
            <div className="mt-4">
              <div className="mb-1 flex items-baseline justify-between text-sm">
                <span className="text-dim">Today</span>
                <span className="text-fg">
                  <span className="font-semibold">{todayWords.toLocaleString()}</span>
                  {dailyTarget > 0 && <span className="text-mute"> / {dailyTarget.toLocaleString()}</span>} words
                </span>
              </div>
              {dailyTarget > 0 && (
                <div className="h-2 overflow-hidden rounded-full bg-elevated">
                  <div
                    className={`h-full rounded-full transition-[width] duration-500 ${todayFrac >= 1 ? "bg-brand" : "bg-gradient-to-r from-brand to-accent"}`}
                    style={{ width: `${todayFrac * 100}%` }}
                  />
                </div>
              )}
              {dailyTarget > 0 && todayFrac >= 1 && <div className="mt-1 text-xs font-medium text-brand">🎯 Daily goal reached!</div>}
            </div>
          </section>

          {/* ---- stat cards ---- */}
          {summary && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat
                label="Current streak"
                value={`${dailyTarget > 0 ? streakToGoal : summary.streakDays}d`}
                sub={dailyTarget > 0 ? "days hitting goal" : "days with writing"}
              />
              <Stat label="Longest streak" value={`${summary.longestStreak}d`} />
              <Stat label="Total written" value={summary.total.toLocaleString()} sub={`over ${summary.daysWritten} days`} />
              <Stat
                label="Best day"
                value={summary.bestDay ? summary.bestDay.words.toLocaleString() : "—"}
                sub={summary.bestDay ? fmtDate(summary.bestDay.day) : undefined}
              />
            </div>
          )}

          {/* ---- pace toward deadline ---- */}
          {totalTarget > 0 && (
            <section className="rounded-xl border border-line bg-surface p-4">
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-mute">Pace</h3>
              <div className="mb-3 h-2 overflow-hidden rounded-full bg-elevated">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-purple to-brand"
                  style={{ width: `${Math.min(100, (totalWords / totalTarget) * 100)}%` }}
                />
              </div>
              <div className="flex flex-wrap gap-x-8 gap-y-1 text-sm">
                <span className="text-dim">
                  {totalWords.toLocaleString()} / {totalTarget.toLocaleString()} words ·{" "}
                  <span className="text-mute">{remaining.toLocaleString()} to go</span>
                </span>
                {daysLeft !== null && <span className="text-dim">{daysLeft} days left</span>}
                {neededPerDay !== null && remaining > 0 && (
                  <span className="text-dim">
                    Need <span className="font-semibold text-fg">{neededPerDay.toLocaleString()}</span>/day
                  </span>
                )}
              </div>
              {remaining === 0 ? (
                <div className="mt-2 text-sm font-medium text-brand">🎉 Manuscript target reached!</div>
              ) : projectedDate ? (
                <div className={`mt-2 text-sm ${onTrack ? "text-brand" : "text-accent"}`}>
                  At your recent pace ({recentAvg.toLocaleString()}/day) you’ll finish around{" "}
                  <span className="font-semibold">{fmtDate(projectedDate)}</span>
                  {deadline && (onTrack ? " — on track ✓" : " — behind deadline")}
                </div>
              ) : (
                <div className="mt-2 text-xs text-mute">Write a few days to project a finish date.</div>
              )}
            </section>
          )}

          {/* ---- daily chart ---- */}
          <section className="rounded-xl border border-line bg-surface p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-mute">Words per day</h3>
              <div className="flex gap-1">
                {RANGES.map((r) => (
                  <button
                    key={r.days}
                    onClick={() => setDays(r.days)}
                    className={`rounded-md px-2 py-0.5 text-xs ${days === r.days ? "bg-brand/10 text-brand" : "text-mute hover:text-dim"}`}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="relative flex h-40 items-end gap-px">
              {/* target line */}
              {dailyTarget > 0 && (
                <div
                  className="pointer-events-none absolute inset-x-0 border-t border-dashed border-brand/40"
                  style={{ bottom: `${(dailyTarget / maxBar) * 100}%` }}
                  title={`Daily goal: ${dailyTarget}`}
                />
              )}
              {series.map((p) => (
                <div key={p.day} className="group relative flex-1" style={{ height: "100%" }}>
                  <div className="absolute inset-x-0 bottom-0 flex flex-col justify-end" style={{ height: "100%" }}>
                    <div
                      className={`rounded-t-sm ${dailyTarget > 0 && p.words >= dailyTarget ? "bg-brand" : "bg-purple/70"} group-hover:opacity-80`}
                      style={{ height: `${(p.words / maxBar) * 100}%` }}
                    />
                  </div>
                  <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden -translate-x-1/2 whitespace-nowrap rounded bg-elevated px-1.5 py-0.5 text-[10px] text-fg group-hover:block">
                    {fmtDate(p.day)}: {p.words.toLocaleString()}w
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-1 flex justify-between text-[10px] text-mute">
              <span>{series[0] ? fmtDate(series[0].day) : ""}</span>
              <span>{series.length ? fmtDate(series[series.length - 1]!.day) : ""}</span>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
