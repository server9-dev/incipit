import { useEffect, useRef, useState } from "react";
import * as api from "../api.js";
import type { SprintRow } from "../store/db.js";

/* A writing sprint: pick a duration and/or word goal, then keep writing in the
   editor underneath while this floating card tracks your live word count and
   words-per-minute. Net words come from the project's live word total at start
   vs. now, so there's no per-keystroke bookkeeping.

   Survives a reload: the running sprint is mirrored to localStorage and resumed
   on mount (see `hasActiveSprint`, used by Workspace to auto-open the card). */

const DURATIONS = [
  { label: "5 min", sec: 300 },
  { label: "10 min", sec: 600 },
  { label: "15 min", sec: 900 },
  { label: "25 min", sec: 1500 },
  { label: "∞ Open", sec: 0 },
];

type Active = { startEpoch: number; startTs: string; plannedSec: number; wordGoal: number; startWords: number };

const keyFor = (projectId: string) => `incipit-sprint-${projectId}`;

function readActive(projectId: string): Active | null {
  try {
    const raw = localStorage.getItem(keyFor(projectId));
    if (!raw) return null;
    const a = JSON.parse(raw) as Active;
    // a finished-but-not-cleared timed sprint shouldn't resume forever
    if (a.plannedSec > 0 && Date.now() > a.startEpoch + a.plannedSec * 1000 + 5 * 60_000) return null;
    return a;
  } catch {
    return null;
  }
}

/** Whether a sprint is mid-flight for this project (used to auto-open the card). */
export function hasActiveSprint(projectId: string): boolean {
  return readActive(projectId) !== null;
}

const mmss = (s: number) => `${Math.floor(s / 60)}:${`${Math.floor(s % 60)}`.padStart(2, "0")}`;

type Phase = "setup" | "running" | "done";
type Result = { words: number; elapsedSec: number; plannedSec: number; wordGoal: number };

export function Sprint({ projectId, liveWords, onClose }: { projectId: string; liveWords: number; onClose: () => void }) {
  const resumed = useRef<Active | null>(readActive(projectId)).current;
  const [phase, setPhase] = useState<Phase>(resumed ? "running" : "setup");
  const [plannedSec, setPlannedSec] = useState(resumed?.plannedSec ?? 900);
  const [wordGoal, setWordGoal] = useState(resumed?.wordGoal ?? 0);
  const [elapsed, setElapsed] = useState(0); // seconds since start
  const [result, setResult] = useState<Result | null>(null);
  const [today, setToday] = useState<number | null>(null);
  const [history, setHistory] = useState<SprintRow[]>([]);

  // live values the timer closure needs to read without going stale
  const active = useRef<Active | null>(resumed);
  const liveWordsRef = useRef(liveWords);
  liveWordsRef.current = liveWords;
  const savedRef = useRef(false);

  const refreshMeta = () => {
    api.writingToday(projectId).then(setToday);
    api.listSprints(projectId, 8).then(setHistory);
  };
  useEffect(refreshMeta, [projectId]);

  /* tick while running; finish automatically when a timed sprint runs out */
  useEffect(() => {
    if (phase !== "running" || !active.current) return;
    const a = active.current;
    const tick = () => {
      const e = (Date.now() - a.startEpoch) / 1000;
      setElapsed(e);
      if (a.plannedSec > 0 && e >= a.plannedSec) finish();
    };
    tick();
    const iv = setInterval(tick, 250);
    return () => clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  function start(sec: number, goal: number) {
    const a: Active = {
      startEpoch: Date.now(),
      startTs: new Date().toISOString(),
      plannedSec: sec,
      wordGoal: goal,
      startWords: liveWordsRef.current,
    };
    active.current = a;
    savedRef.current = false;
    localStorage.setItem(keyFor(projectId), JSON.stringify(a));
    setPlannedSec(sec);
    setWordGoal(goal);
    setElapsed(0);
    setPhase("running");
  }

  function finish() {
    const a = active.current;
    if (!a || savedRef.current) return;
    savedRef.current = true;
    localStorage.removeItem(keyFor(projectId));
    const words = Math.max(0, liveWordsRef.current - a.startWords);
    const elapsedSec = Math.round((Date.now() - a.startEpoch) / 1000);
    setResult({ words, elapsedSec, plannedSec: a.plannedSec, wordGoal: a.wordGoal });
    setPhase("done");
    api
      .saveSprint({ projectId, startTs: a.startTs, endTs: new Date().toISOString(), plannedSec: a.plannedSec, wordGoal: a.wordGoal, words })
      .then(refreshMeta);
  }

  const words = active.current ? Math.max(0, liveWords - active.current.startWords) : 0;
  const wpm = elapsed > 5 ? Math.round((words / elapsed) * 60) : 0;
  const remaining = plannedSec > 0 ? Math.max(0, plannedSec - elapsed) : elapsed;
  const timeFrac = plannedSec > 0 ? Math.min(1, elapsed / plannedSec) : 0;
  const goalFrac = wordGoal > 0 ? Math.min(1, words / wordGoal) : 0;

  return (
    <div className="fixed bottom-4 right-4 z-40 w-72 rounded-xl border border-line bg-surface2 shadow-2xl">
      <div className="flex items-center justify-between border-b border-linesoft px-3 py-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-brand">
          {phase === "running" ? "Sprint in progress" : phase === "done" ? "Sprint complete" : "Writing sprint"}
        </span>
        <button onClick={onClose} title="Close" className="text-mute hover:text-fg">
          ✕
        </button>
      </div>

      {phase === "setup" && (
        <div className="space-y-3 px-3 py-3">
          <div>
            <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-mute">Duration</div>
            <div className="flex flex-wrap gap-1.5">
              {DURATIONS.map((d) => (
                <button
                  key={d.sec}
                  onClick={() => setPlannedSec(d.sec)}
                  className={`rounded-md border px-2 py-1 text-xs ${
                    plannedSec === d.sec ? "border-brand bg-brand/10 text-brand" : "border-line text-dim hover:bg-elevated"
                  }`}
                >
                  {d.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-mute">Word goal (optional)</div>
            <input
              type="number"
              min={0}
              step={50}
              value={wordGoal || ""}
              onChange={(e) => setWordGoal(Math.max(0, Math.floor(+e.target.value || 0)))}
              placeholder="e.g. 250"
              className="w-full rounded-md bg-surface px-2 py-1.5 text-sm text-fg outline-none focus:bg-elevated"
            />
          </div>
          <button
            onClick={() => start(plannedSec, wordGoal)}
            className="w-full rounded-md bg-brand py-2 text-sm font-semibold text-ink hover:bg-brand-dark"
          >
            Start sprint
          </button>
          {today !== null && (
            <div className="text-center text-xs text-mute">
              <span className="text-dim">{today.toLocaleString()}</span> words written today
            </div>
          )}
          {history.length > 0 && (
            <div className="border-t border-linesoft pt-2">
              <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-mute">Recent sprints</div>
              <ul className="space-y-1">
                {history.map((s) => (
                  <li key={s.id} className="flex items-center justify-between text-xs text-dim">
                    <span>{s.words.toLocaleString()}w</span>
                    <span className="text-mute">
                      {s.plannedSec ? `${Math.round(s.plannedSec / 60)}m` : "open"} ·{" "}
                      {s.words && s.endTs && s.startTs
                        ? `${Math.round((s.words / Math.max(1, (Date.parse(s.endTs) - Date.parse(s.startTs)) / 1000)) * 60)} wpm`
                        : "—"}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {phase === "running" && (
        <div className="space-y-3 px-3 py-3">
          <div className="text-center">
            <div className="font-mono text-4xl font-bold tabular-nums text-fg">{mmss(remaining)}</div>
            <div className="text-[10px] uppercase tracking-wide text-mute">{plannedSec > 0 ? "remaining" : "elapsed"}</div>
          </div>
          <div className="flex justify-around text-center">
            <div>
              <div className="text-xl font-bold text-brand">{words.toLocaleString()}</div>
              <div className="text-[10px] uppercase tracking-wide text-mute">words</div>
            </div>
            <div>
              <div className="text-xl font-bold text-purple">{wpm}</div>
              <div className="text-[10px] uppercase tracking-wide text-mute">wpm</div>
            </div>
            {wordGoal > 0 && (
              <div>
                <div className="text-xl font-bold text-accent">{Math.round(goalFrac * 100)}%</div>
                <div className="text-[10px] uppercase tracking-wide text-mute">of goal</div>
              </div>
            )}
          </div>
          {/* progress: word goal if one is set, otherwise time */}
          <div className="h-1.5 overflow-hidden rounded-full bg-elevated">
            <div
              className="h-full rounded-full bg-gradient-to-r from-brand to-accent transition-[width] duration-300"
              style={{ width: `${(wordGoal > 0 ? goalFrac : timeFrac) * 100}%` }}
            />
          </div>
          <button
            onClick={finish}
            className="w-full rounded-md border border-line py-1.5 text-sm font-medium text-dim hover:bg-elevated"
          >
            Finish now
          </button>
        </div>
      )}

      {phase === "done" && result && (
        <div className="space-y-3 px-3 py-4 text-center">
          <div>
            <div className="text-4xl font-bold text-brand">{result.words.toLocaleString()}</div>
            <div className="text-[10px] uppercase tracking-wide text-mute">words written</div>
          </div>
          <div className="flex justify-around text-sm text-dim">
            <span>{mmss(result.elapsedSec)} elapsed</span>
            <span>{result.elapsedSec > 5 ? Math.round((result.words / result.elapsedSec) * 60) : 0} wpm</span>
          </div>
          {result.wordGoal > 0 && (
            <div className={`text-sm font-semibold ${result.words >= result.wordGoal ? "text-brand" : "text-mute"}`}>
              {result.words >= result.wordGoal ? "🎯 Goal reached!" : `${result.wordGoal - result.words} words short of goal`}
            </div>
          )}
          <div className="flex gap-2">
            <button
              onClick={() => setPhase("setup")}
              className="flex-1 rounded-md bg-brand py-1.5 text-sm font-semibold text-ink hover:bg-brand-dark"
            >
              New sprint
            </button>
            <button onClick={onClose} className="flex-1 rounded-md border border-line py-1.5 text-sm font-medium text-dim hover:bg-elevated">
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
