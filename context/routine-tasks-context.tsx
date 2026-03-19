"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

const STORAGE_KEY = "flux_routine_tasks_v1";
const ALERT_TTL_MS = 7000;

export type RoutineType = "daily" | "weekly" | "monthly";

export interface RoutineTask {
  id: string;
  title: string;
  notes: string;
  category: string;
  recurrence: RoutineType;
  time: string;
  weekdays: number[];
  dayOfMonth: number;
  alertBeforeMinutes: number;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  lastCompletedAt: string | null;
  nextDueAt: string;
  lastAlertForDueAt: string | null;
}

export interface RoutineTaskInput {
  title: string;
  notes: string;
  category: string;
  recurrence: RoutineType;
  time: string;
  weekdays: number[];
  dayOfMonth: number;
  alertBeforeMinutes: number;
  active: boolean;
}

export interface TaskAlert {
  id: string;
  taskId: string;
  title: string;
  dueAt: string;
  createdAt: number;
}

interface RoutineTasksContextType {
  tasks: RoutineTask[];
  alerts: TaskAlert[];
  createTask: (input: RoutineTaskInput) => void;
  updateTask: (id: string, input: RoutineTaskInput) => void;
  deleteTask: (id: string) => void;
  toggleTask: (id: string, active: boolean) => void;
  completeTask: (id: string) => void;
  dismissAlert: (alertId: string) => void;
}

const RoutineTasksContext = createContext<RoutineTasksContextType | null>(null);

function parseTime(time: string): { hour: number; minute: number } {
  const [hh, mm] = time.split(":");
  return {
    hour: Number.isFinite(Number(hh)) ? Number(hh) : 9,
    minute: Number.isFinite(Number(mm)) ? Number(mm) : 0,
  };
}

function daysInMonth(year: number, monthZeroBased: number): number {
  return new Date(year, monthZeroBased + 1, 0).getDate();
}

function withHourMinute(date: Date, hour: number, minute: number): Date {
  const next = new Date(date);
  next.setHours(hour, minute, 0, 0);
  return next;
}

function nextWeeklyDue(now: Date, weekdays: number[], hour: number, minute: number): Date {
  const normalized = [...new Set(weekdays)].filter((d) => d >= 0 && d <= 6);
  const candidates = normalized.length > 0 ? normalized : [1];

  for (let offset = 0; offset <= 14; offset += 1) {
    const candidate = new Date(now);
    candidate.setDate(now.getDate() + offset);
    if (!candidates.includes(candidate.getDay())) continue;
    const due = withHourMinute(candidate, hour, minute);
    if (due.getTime() > now.getTime()) return due;
  }

  const fallback = new Date(now);
  fallback.setDate(now.getDate() + 7);
  return withHourMinute(fallback, hour, minute);
}

function nextMonthlyDue(now: Date, dayOfMonth: number, hour: number, minute: number): Date {
  const normalizedDay = Math.max(1, Math.min(31, dayOfMonth || 1));

  const monthDays = daysInMonth(now.getFullYear(), now.getMonth());
  const thisMonthDay = Math.min(normalizedDay, monthDays);
  const thisMonth = new Date(now.getFullYear(), now.getMonth(), thisMonthDay, hour, minute, 0, 0);
  if (thisMonth.getTime() > now.getTime()) return thisMonth;

  const nextMonthDate = new Date(now.getFullYear(), now.getMonth() + 1, 1, hour, minute, 0, 0);
  const nextMonthDays = daysInMonth(nextMonthDate.getFullYear(), nextMonthDate.getMonth());
  const nextMonthDay = Math.min(normalizedDay, nextMonthDays);
  return new Date(nextMonthDate.getFullYear(), nextMonthDate.getMonth(), nextMonthDay, hour, minute, 0, 0);
}

function computeNextDue(input: RoutineTaskInput, now = new Date()): string {
  const { hour, minute } = parseTime(input.time);
  if (input.recurrence === "daily") {
    const today = withHourMinute(now, hour, minute);
    if (today.getTime() > now.getTime()) return today.toISOString();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow.toISOString();
  }
  if (input.recurrence === "weekly") {
    return nextWeeklyDue(now, input.weekdays, hour, minute).toISOString();
  }
  return nextMonthlyDue(now, input.dayOfMonth, hour, minute).toISOString();
}

function toNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function normalizeTask(raw: Partial<RoutineTask>): RoutineTask {
  const nowIso = new Date().toISOString();
  const baseInput: RoutineTaskInput = {
    title: typeof raw.title === "string" ? raw.title : "Nova rotina",
    notes: typeof raw.notes === "string" ? raw.notes : "",
    category: typeof raw.category === "string" ? raw.category : "Geral",
    recurrence: raw.recurrence === "weekly" || raw.recurrence === "monthly" ? raw.recurrence : "daily",
    time: typeof raw.time === "string" && raw.time.includes(":") ? raw.time : "09:00",
    weekdays: Array.isArray(raw.weekdays) ? raw.weekdays.filter((d) => typeof d === "number") : [1],
    dayOfMonth: toNumber(raw.dayOfMonth, 1),
    alertBeforeMinutes: toNumber(raw.alertBeforeMinutes, 15),
    active: raw.active !== false,
  };

  return {
    id: typeof raw.id === "string" ? raw.id : crypto.randomUUID(),
    ...baseInput,
    createdAt: typeof raw.createdAt === "string" ? raw.createdAt : nowIso,
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : nowIso,
    lastCompletedAt: typeof raw.lastCompletedAt === "string" ? raw.lastCompletedAt : null,
    nextDueAt: typeof raw.nextDueAt === "string" ? raw.nextDueAt : computeNextDue(baseInput),
    lastAlertForDueAt: typeof raw.lastAlertForDueAt === "string" ? raw.lastAlertForDueAt : null,
  };
}

function loadStoredTasks(): RoutineTask[] {
  if (typeof window === "undefined") return [];
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((item) => normalizeTask(item));
  } catch {
    return [];
  }
}

export function RoutineTasksProvider({ children }: { children: React.ReactNode }) {
  const [tasks, setTasks] = useState<RoutineTask[]>([]);
  const [alerts, setAlerts] = useState<TaskAlert[]>([]);

  useEffect(() => {
    setTasks(loadStoredTasks());
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
  }, [tasks]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      const nowMs = Date.now();
      const freshAlerts: TaskAlert[] = [];

      setTasks((prev) =>
        prev.map((task) => {
          if (!task.active) return task;
          const dueMs = new Date(task.nextDueAt).getTime();
          if (Number.isNaN(dueMs)) return task;

          const alertMs = dueMs - task.alertBeforeMinutes * 60 * 1000;
          const shouldAlert = nowMs >= alertMs;

          if (shouldAlert && task.lastAlertForDueAt !== task.nextDueAt) {
            freshAlerts.push({
              id: crypto.randomUUID(),
              taskId: task.id,
              title: task.title,
              dueAt: task.nextDueAt,
              createdAt: nowMs,
            });
            return { ...task, lastAlertForDueAt: task.nextDueAt, updatedAt: new Date().toISOString() };
          }
          return task;
        })
      );

      if (freshAlerts.length > 0) {
        setAlerts((prev) => [...freshAlerts, ...prev].slice(0, 6));
      }

      setAlerts((prev) => prev.filter((a) => nowMs - a.createdAt < ALERT_TTL_MS));
    }, 15000);

    return () => window.clearInterval(timer);
  }, []);

  const createTask = useCallback((input: RoutineTaskInput) => {
    const nowIso = new Date().toISOString();
    const task: RoutineTask = {
      id: crypto.randomUUID(),
      ...input,
      createdAt: nowIso,
      updatedAt: nowIso,
      lastCompletedAt: null,
      nextDueAt: computeNextDue(input),
      lastAlertForDueAt: null,
    };
    setTasks((prev) => [task, ...prev]);
  }, []);

  const updateTask = useCallback((id: string, input: RoutineTaskInput) => {
    setTasks((prev) =>
      prev.map((task) =>
        task.id === id
          ? {
              ...task,
              ...input,
              updatedAt: new Date().toISOString(),
              nextDueAt: computeNextDue(input),
              lastAlertForDueAt: null,
            }
          : task
      )
    );
  }, []);

  const deleteTask = useCallback((id: string) => {
    setTasks((prev) => prev.filter((task) => task.id !== id));
    setAlerts((prev) => prev.filter((alert) => alert.taskId !== id));
  }, []);

  const toggleTask = useCallback((id: string, active: boolean) => {
    setTasks((prev) =>
      prev.map((task) =>
        task.id === id
          ? {
              ...task,
              active,
              updatedAt: new Date().toISOString(),
              ...(active ? { nextDueAt: computeNextDue(task), lastAlertForDueAt: null } : {}),
            }
          : task
      )
    );
  }, []);

  const completeTask = useCallback((id: string) => {
    setTasks((prev) =>
      prev.map((task) => {
        if (task.id !== id) return task;
        const nextInput: RoutineTaskInput = {
          title: task.title,
          notes: task.notes,
          category: task.category,
          recurrence: task.recurrence,
          time: task.time,
          weekdays: task.weekdays,
          dayOfMonth: task.dayOfMonth,
          alertBeforeMinutes: task.alertBeforeMinutes,
          active: task.active,
        };
        return {
          ...task,
          lastCompletedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          nextDueAt: computeNextDue(nextInput),
          lastAlertForDueAt: null,
        };
      })
    );
  }, []);

  const dismissAlert = useCallback((alertId: string) => {
    setAlerts((prev) => prev.filter((alert) => alert.id !== alertId));
  }, []);

  const value = useMemo(
    () => ({
      tasks,
      alerts,
      createTask,
      updateTask,
      deleteTask,
      toggleTask,
      completeTask,
      dismissAlert,
    }),
    [tasks, alerts, createTask, updateTask, deleteTask, toggleTask, completeTask, dismissAlert]
  );

  return <RoutineTasksContext.Provider value={value}>{children}</RoutineTasksContext.Provider>;
}

export function useRoutineTasks() {
  const ctx = useContext(RoutineTasksContext);
  if (!ctx) throw new Error("useRoutineTasks must be used within RoutineTasksProvider");
  return ctx;
}
