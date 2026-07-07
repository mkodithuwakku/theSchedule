"use client";

import {
  AlertTriangle,
  CalendarDays,
  Check,
  Clock,
  Download,
  FileText,
  Mail,
  Plus,
  Printer,
  RefreshCw,
  Repeat2,
  Send,
  Settings,
  ShieldCheck,
  UserPlus,
  Users,
  X
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  type AuditEntry,
  type AvailabilitySubmission,
  type CoverageRequest,
  type Employee,
  type SchedulePeriod,
  type Shift,
  type SwapRequest,
  type Unavailability,
  type UnavailableType,
  availableEmployeesForShift,
  buildHoursCsv,
  calculateHours,
  employees,
  formatTime,
  generateDefaultShifts,
  getDatesInPeriod,
  getDayName,
  initialAuditLog,
  isEmployeeUnavailable,
  schedulePeriod,
  shiftDurationHours,
  shiftTemplates,
  store,
  storeHours,
  type NotificationEntry
} from "@/lib/demo-data";
import { STORAGE_KEY, TEST_TODAY, type StoredTestState } from "@/lib/test-state-shared";

type TabId =
  | "dashboard"
  | "employees"
  | "availability"
  | "builder"
  | "requests"
  | "reports"
  | "settings"
  | "my-shifts"
  | "team"
  | "submit";

type CustomShiftForm = {
  date: string;
  startTime: string;
  endTime: string;
  roleLabel: string;
  notes: string;
};

type PersistenceStatus = "loading" | "saving" | "saved" | "local" | "error";

const buttonBase =
  "inline-flex h-9 items-center justify-center gap-2 rounded-md border px-3 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50";
const inputBase =
  "h-9 w-full rounded-md border border-line bg-white px-3 text-sm text-ink shadow-sm";
const DEFAULT_AUDIT_LOG: AuditEntry[] = [
  {
    ...initialAuditLog[0],
    summary: `Test run opened on ${TEST_TODAY}, before the ${schedulePeriod.releaseDate} release.`
  }
];

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function parseLocalDate(date: string) {
  return new Date(`${date}T12:00:00`);
}

function dateToIso(date: Date) {
  return date.toISOString().slice(0, 10);
}

function shortDayLabel(date: string) {
  return new Intl.DateTimeFormat("en-US", { day: "numeric", month: "short" }).format(parseLocalDate(date));
}

function weekdayLong(date: string) {
  return new Intl.DateTimeFormat("en-US", { weekday: "long" }).format(parseLocalDate(date));
}

function buildCalendarWeeks(
  period: SchedulePeriod,
  shiftsByDate: Array<{ date: string; shifts: Shift[] }>
) {
  const shiftsByDateMap = new Map(shiftsByDate.map((entry) => [entry.date, entry.shifts]));
  const periodStart = parseLocalDate(period.startDate);
  const periodEnd = parseLocalDate(period.endDate);
  const cursor = new Date(periodStart);
  cursor.setDate(cursor.getDate() - cursor.getDay());

  const calendarEnd = new Date(periodEnd);
  calendarEnd.setDate(calendarEnd.getDate() + (6 - calendarEnd.getDay()));

  const weeks: Array<
    Array<{
      date: string;
      inPeriod: boolean;
      shifts: Shift[];
    }>
  > = [];

  while (cursor <= calendarEnd) {
    const week = [];
    for (let index = 0; index < 7; index += 1) {
      const date = dateToIso(cursor);
      week.push({
        date,
        inPeriod: cursor >= periodStart && cursor <= periodEnd,
        shifts: shiftsByDateMap.get(date) ?? []
      });
      cursor.setDate(cursor.getDate() + 1);
    }
    weeks.push(week);
  }

  return weeks;
}

function availabilityConflictDetails(
  employeeId: string,
  shift: Pick<Shift, "date" | "startTime" | "endTime">,
  submissions: AvailabilitySubmission[]
) {
  const submission = submissions.find((item) => item.userId === employeeId);
  if (!submission) return [];

  return submission.unavailable
    .filter((entry) => entry.date === shift.date)
    .filter((entry) => {
      if (entry.allDay || entry.unavailableType === "full_day") return true;
      if (!entry.startTime || !entry.endTime) return false;
      return isEmployeeUnavailable(employeeId, shift, submissions);
    })
    .map((entry) => {
      if (entry.allDay || entry.unavailableType === "full_day") return "Full day unavailable";
      return `Unavailable ${formatTime(entry.startTime ?? "00:00")}-${formatTime(entry.endTime ?? "00:00")}`;
    });
}

function availabilityStatusForShift(
  employee: Employee,
  shift: Pick<Shift, "date" | "startTime" | "endTime">,
  submissions: AvailabilitySubmission[]
) {
  if (!employee.active) return { unavailable: true, reason: "Inactive employee" };

  const details = availabilityConflictDetails(employee.id, shift, submissions);
  return {
    unavailable: details.length > 0,
    reason: details[0] ?? "Available"
  };
}

function Badge({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "neutral" | "good" | "warn" | "danger" }) {
  return (
    <span
      className={cx(
        "inline-flex min-h-6 items-center rounded-md border px-2 text-xs font-semibold",
        tone === "neutral" && "border-line bg-white text-ink",
        tone === "good" && "border-approve/30 bg-approve/10 text-approve",
        tone === "warn" && "border-warn/35 bg-warn/10 text-warn",
        tone === "danger" && "border-red-300 bg-red-50 text-red-700"
      )}
    >
      {children}
    </span>
  );
}

function Button({
  children,
  variant = "primary",
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "danger" | "ghost";
}) {
  return (
    <button
      className={cx(
        buttonBase,
        variant === "primary" && "border-mall bg-mall text-white hover:bg-mall/90",
        variant === "secondary" && "border-line bg-white text-ink hover:bg-paper",
        variant === "danger" && "border-red-600 bg-red-600 text-white hover:bg-red-700",
        variant === "ghost" && "border-transparent bg-transparent text-ink hover:bg-white",
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}

function Field({
  label,
  children
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="grid gap-1 text-xs font-semibold uppercase tracking-normal text-ink/60">
      {label}
      {children}
    </label>
  );
}

function Section({
  title,
  icon,
  action,
  children,
  className
}: {
  title: string;
  icon: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cx("print-surface min-w-0 rounded-lg border border-line bg-white shadow-panel", className)}>
      <div className="flex min-h-14 items-center justify-between gap-3 border-b border-line px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="grid size-8 shrink-0 place-items-center rounded-md bg-paper text-mall">{icon}</span>
          <h2 className="truncate text-base font-bold text-ink">{title}</h2>
        </div>
        {action}
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

function Metric({
  label,
  value,
  detail,
  tone = "neutral"
}: {
  label: string;
  value: string;
  detail: string;
  tone?: "neutral" | "good" | "warn";
}) {
  return (
    <div className="rounded-lg border border-line bg-white p-4">
      <div className="text-xs font-semibold uppercase tracking-normal text-ink/55">{label}</div>
      <div className={cx("mt-2 text-2xl font-bold", tone === "good" && "text-approve", tone === "warn" && "text-warn")}>
        {value}
      </div>
      <div className="mt-1 text-sm text-ink/65">{detail}</div>
    </div>
  );
}

export function TheScheduleApp() {
  const [mode, setMode] = useState<"manager" | "employee">("manager");
  const [activeTab, setActiveTab] = useState<TabId>("dashboard");
  const [activeEmployeeId, setActiveEmployeeId] = useState("emp_avery");
  const [people, setPeople] = useState<Employee[]>(employees);
  const [period, setPeriod] = useState<SchedulePeriod>(schedulePeriod);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [availability, setAvailability] = useState<AvailabilitySubmission[]>([]);
  const [coverage, setCoverage] = useState<CoverageRequest[]>([]);
  const [swaps, setSwaps] = useState<SwapRequest[]>([]);
  const [auditLog, setAuditLog] = useState<AuditEntry[]>(DEFAULT_AUDIT_LOG);
  const [notifications, setNotifications] = useState<NotificationEntry[]>([]);
  const [availabilityDrafts, setAvailabilityDrafts] = useState<Record<string, Unavailability[]>>({});
  const [hasLoadedStoredState, setHasLoadedStoredState] = useState(false);
  const [persistenceStatus, setPersistenceStatus] = useState<PersistenceStatus>("loading");
  const [testEmailStatus, setTestEmailStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [selectedShiftId, setSelectedShiftId] = useState<string | null>(null);
  const [showOnlyUnassigned, setShowOnlyUnassigned] = useState(false);
  const [customShift, setCustomShift] = useState<CustomShiftForm>({
    date: period.startDate,
    startTime: "12:00",
    endTime: "18:00",
    roleLabel: "Sales",
    notes: ""
  });
  const [availabilityForm, setAvailabilityForm] = useState({
    date: period.startDate,
    unavailableType: "full_day" as UnavailableType,
    shiftTemplateId: "tpl_weekday_open",
    startTime: "09:00",
    endTime: "14:00",
    note: ""
  });
  const [swapForm, setSwapForm] = useState({
    requesterShiftId: "",
    targetShiftId: "",
    reason: ""
  });
  const [newEmployee, setNewEmployee] = useState({
    name: "",
    email: "",
    position: "Sales",
    role: "employee" as Employee["role"]
  });

  const nameFor = (id?: string) => people.find((employee) => employee.id === id)?.name ?? "Unassigned";
  const activeEmployee = people.find((employee) => employee.id === activeEmployeeId) ?? people[1];
  const activeEmployees = people.filter((employee) => employee.active && employee.role === "employee");
  const dates = useMemo(() => getDatesInPeriod(period), [period]);
  const shiftsByDate = useMemo(
    () =>
      dates.map((date) => ({
        date,
        shifts: shifts
          .filter((shift) => shift.date === date)
          .sort((a, b) => a.startTime.localeCompare(b.startTime))
      })),
    [dates, shifts]
  );
  const calendarWeeks = useMemo(() => buildCalendarWeeks(period, shiftsByDate), [period, shiftsByDate]);
  const finalHours = useMemo(() => calculateHours(people, shifts, false), [people, shifts]);
  const initialHours = useMemo(() => calculateHours(people, shifts, true), [people, shifts]);
  const activeSubmission = availability.find((submission) => submission.userId === activeEmployee.id);
  const activeAvailabilityDraft = availabilityDrafts[activeEmployee.id] ?? [];
  const submittedIds = new Set(availability.filter((submission) => submission.submittedAt).map((submission) => submission.userId));
  const missingAvailability = activeEmployees.filter((employee) => !submittedIds.has(employee.id));
  const activeEmployeeNeedsAvailability = !submittedIds.has(activeEmployee.id);
  const myShifts = shifts
    .filter((shift) => shift.employeeId === activeEmployee.id)
    .sort((a, b) => `${a.date}${a.startTime}`.localeCompare(`${b.date}${b.startTime}`));
  const openCoverage = coverage.filter((request) => request.status === "open" || request.status === "offered");
  const pendingManagerRequests =
    coverage.filter((request) => request.status === "offered").length +
    swaps.filter((request) => request.status === "pending_manager_approval").length;
  const selectedShift = shifts.find((shift) => shift.id === selectedShiftId) ?? null;
  const unassignedShifts = shifts.filter((shift) => !shift.employeeId);
  const testStep =
    period.status === "published"
      ? "Schedule published"
      : shifts.length > 0
        ? "Manager builds draft"
        : missingAvailability.length < activeEmployees.length
          ? "Collecting availability"
          : "Waiting for employee availability";
  const currentIdentity = mode === "manager" ? people.find((employee) => employee.role === "manager") ?? people[0] : activeEmployee;
  const persistenceLabel =
    persistenceStatus === "loading"
      ? "Loading saved test"
      : persistenceStatus === "saving"
        ? "Saving test"
        : persistenceStatus === "saved"
          ? "Server saved"
          : persistenceStatus === "local"
            ? "Local fallback"
            : "Save error";
  const persistenceTone = persistenceStatus === "saved" ? "good" : persistenceStatus === "error" ? "danger" : "warn";

  useEffect(() => {
    let cancelled = false;

    function applyStoredState(stored: Partial<StoredTestState>) {
      if (stored.people) setPeople(stored.people);
      if (stored.period) setPeriod(stored.period);
      if (stored.shifts) setShifts(stored.shifts);
      if (stored.availability) setAvailability(stored.availability);
      if (stored.coverage) setCoverage(stored.coverage);
      if (stored.swaps) setSwaps(stored.swaps);
      if (stored.auditLog) setAuditLog(stored.auditLog);
      if (stored.notifications) setNotifications(stored.notifications);
      if (stored.availabilityDrafts) setAvailabilityDrafts(stored.availabilityDrafts);
    }

    async function loadSavedState() {
      try {
        const response = await fetch("/api/test-state", { cache: "no-store" });
        if (!response.ok) throw new Error("Unable to load server test state.");
        const stored = (await response.json()) as StoredTestState;
        if (cancelled) return;

        applyStoredState(stored);
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
        setPersistenceStatus("saved");
      } catch {
        const rawState = window.localStorage.getItem(STORAGE_KEY);
        if (rawState) {
          try {
            applyStoredState(JSON.parse(rawState) as Partial<StoredTestState>);
            setPersistenceStatus("local");
          } catch {
            window.localStorage.removeItem(STORAGE_KEY);
            setPersistenceStatus("error");
          }
        } else {
          setPersistenceStatus("local");
        }
      } finally {
        if (!cancelled) setHasLoadedStoredState(true);
      }
    }

    void loadSavedState();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!hasLoadedStoredState) return;

    const snapshot: StoredTestState = {
      people,
      period,
      shifts,
      availability,
      coverage,
      swaps,
      auditLog,
      notifications,
      availabilityDrafts
    };

    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));

    const controller = new AbortController();
    setPersistenceStatus("saving");
    void fetch("/api/test-state", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(snapshot),
      signal: controller.signal
    })
      .then((response) => {
        if (!response.ok) throw new Error("Unable to save server test state.");
        setPersistenceStatus("saved");
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setPersistenceStatus("local");
      });

    return () => controller.abort();
  }, [auditLog, availability, availabilityDrafts, coverage, hasLoadedStoredState, notifications, people, period, shifts, swaps]);

  function addAudit(action: string, entityType: string, entityId: string, summary: string, actorId = "emp_manager") {
    setAuditLog((current) => [
      {
        id: `audit_${Date.now()}`,
        actorId,
        action,
        entityType,
        entityId,
        summary,
        createdAt: new Date().toISOString()
      },
      ...current
    ]);
  }

  function addNotification(type: string, subject: string, userId?: string) {
    setNotifications((current) => [
      {
        id: `note_${Date.now()}`,
        userId,
        type,
        subject,
        status: "queued",
        createdAt: new Date().toISOString()
      },
      ...current
    ]);
  }

  async function sendTestEmail(userId = currentIdentity?.id) {
    if (!userId) return;

    setTestEmailStatus("sending");
    try {
      const response = await fetch("/api/notifications/test-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          subject: `Test notification for ${period.name}`
        })
      });
      if (!response.ok) throw new Error("Unable to send test notification.");

      const result = (await response.json()) as { notification: NotificationEntry };
      setNotifications((current) => [result.notification, ...current.filter((entry) => entry.id !== result.notification.id)]);
      addAudit("test_email_sent", "NotificationLog", result.notification.id, `Test email ${result.notification.status} for ${nameFor(userId)}.`);
      setTestEmailStatus("sent");
    } catch {
      setTestEmailStatus("error");
    }
  }

  function assignShift(shiftId: string, employeeId: string) {
    const target = shifts.find((shift) => shift.id === shiftId);
    if (!target) return;

    if (!employeeId) {
      setShifts((current) => current.map((shift) => (shift.id === shiftId ? { ...shift, employeeId: undefined } : shift)));
      addAudit("shift_unassigned", "Shift", shiftId, `Unassigned ${getDayName(target.date)} ${formatTime(target.startTime)}.`);
      return;
    }

    const selected = people.find((employee) => employee.id === employeeId);
    if (!selected || !selected.active) return;

    const unavailable = isEmployeeUnavailable(employeeId, target, availability);
    const available = availableEmployeesForShift(target, activeEmployees, availability);

    if (unavailable && available.length > 0) {
      window.alert(`${selected.name} is unavailable. Assign ${available[0].name} or another available employee first.`);
      return;
    }

    if (unavailable) {
      const confirmed = window.confirm(
        `${selected.name} is unavailable for this shift. No available employees remain. Confirm an audited override?`
      );
      if (!confirmed) return;
      addAudit(
        "availability_override",
        "Shift",
        shiftId,
        `Override approved for ${selected.name} on ${getDayName(target.date)} ${formatTime(target.startTime)}.`
      );
    }

    setShifts((current) => current.map((shift) => (shift.id === shiftId ? { ...shift, employeeId } : shift)));
    addAudit("shift_assigned", "Shift", shiftId, `Assigned ${selected.name} to ${getDayName(target.date)}.`);
  }

  function generateDraft() {
    const generated = generateDefaultShifts(period);
    setShifts(generated);
    setSelectedShiftId(generated[0]?.id ?? null);
    setPeriod((current) => ({ ...current, status: "draft", publishedAt: undefined }));
    addAudit("default_shifts_generated", "SchedulePeriod", period.id, "Generated draft from configured shift templates.");
  }

  function addCustomShift() {
    if (!customShift.date || !customShift.startTime || !customShift.endTime) return;
    const start = Number(customShift.startTime.replace(":", ""));
    const end = Number(customShift.endTime.replace(":", ""));
    if (end <= start) {
      window.alert("End time must be later than start time.");
      return;
    }

    const shift: Shift = {
      id: `custom_${Date.now()}`,
      schedulePeriodId: period.id,
      date: customShift.date,
      startTime: customShift.startTime,
      endTime: customShift.endTime,
      roleLabel: customShift.roleLabel,
      notes: customShift.notes,
      originalStartTime: customShift.startTime,
      originalEndTime: customShift.endTime
    };

    setShifts((current) => [...current, shift]);
    setSelectedShiftId(shift.id);
    addAudit("custom_shift_added", "Shift", shift.id, `Added ${formatTime(shift.startTime)}-${formatTime(shift.endTime)} on ${getDayName(shift.date)}.`);
  }

  function removeShift(shiftId: string) {
    const target = shifts.find((shift) => shift.id === shiftId);
    setShifts((current) => current.filter((shift) => shift.id !== shiftId));
    setSelectedShiftId((current) => (current === shiftId ? null : current));
    if (target) {
      addAudit("shift_removed", "Shift", shiftId, `Removed ${getDayName(target.date)} ${formatTime(target.startTime)}.`);
    }
  }

  function publishSchedule() {
    if (unassignedShifts.length > 0) {
      const confirmed = window.confirm(
        `${unassignedShifts.length} shift${unassignedShifts.length === 1 ? " is" : "s are"} still unassigned. Publish anyway?`
      );
      if (!confirmed) return;
    }

    setPeriod((current) => ({ ...current, status: "published", publishedAt: new Date().toISOString() }));
    setShifts((current) =>
      current.map((shift) => ({
        ...shift,
        originalEmployeeId: shift.originalEmployeeId ?? shift.employeeId,
        originalStartTime: shift.originalStartTime ?? shift.startTime,
        originalEndTime: shift.originalEndTime ?? shift.endTime
      }))
    );
    shifts
      .filter((shift) => shift.employeeId)
      .forEach((shift) => addNotification("schedule_published", `New schedule published: ${period.name}`, shift.employeeId));
    addAudit("schedule_published", "SchedulePeriod", period.id, `Published ${period.name}.`);
  }

  function buildUnavailableEntry() {
    const template = shiftTemplates.find((item) => item.id === availabilityForm.shiftTemplateId);
    const startTime =
      availabilityForm.unavailableType === "full_day"
        ? undefined
        : availabilityForm.unavailableType === "shift_template"
          ? template?.startTime
          : availabilityForm.startTime;
    const endTime =
      availabilityForm.unavailableType === "full_day"
        ? undefined
        : availabilityForm.unavailableType === "shift_template"
          ? template?.endTime
          : availabilityForm.endTime;

    return {
      id: `unavailable_${Date.now()}`,
      userId: activeEmployee.id,
      date: availabilityForm.date,
      unavailableType: availabilityForm.unavailableType,
      allDay: availabilityForm.unavailableType === "full_day",
      shiftTemplateId: availabilityForm.unavailableType === "shift_template" ? availabilityForm.shiftTemplateId : undefined,
      startTime,
      endTime,
      note: availabilityForm.note
    };
  }

  function addAvailabilityDraftEntry() {
    const entry = buildUnavailableEntry();
    const existingDates = new Set([
      ...(activeSubmission?.unavailable ?? []).map((item) => item.date),
      ...activeAvailabilityDraft.map((item) => item.date)
    ]);

    if (existingDates.has(entry.date)) {
      window.alert("That date is already in this employee's availability submission.");
      return;
    }

    setAvailabilityDrafts((current) => ({
      ...current,
      [activeEmployee.id]: [...(current[activeEmployee.id] ?? []), entry]
    }));

    setAvailabilityForm((current) => ({ ...current, note: "" }));
  }

  function removeAvailabilityDraftEntry(entryId: string) {
    setAvailabilityDrafts((current) => ({
      ...current,
      [activeEmployee.id]: (current[activeEmployee.id] ?? []).filter((entry) => entry.id !== entryId)
    }));
  }

  function finalizeAvailability(submittedUnavailable: Unavailability[], note?: string) {
    setAvailability((current) => {
      const existing = current.find((submission) => submission.userId === activeEmployee.id);
      if (!existing) {
        return [
          ...current,
          {
            id: `availability_${Date.now()}`,
            schedulePeriodId: period.id,
            userId: activeEmployee.id,
            submittedAt: new Date().toISOString(),
            note,
            unavailable: submittedUnavailable
          }
        ];
      }

      return current.map((submission) =>
        submission.userId === activeEmployee.id
          ? {
              ...submission,
              submittedAt: new Date().toISOString(),
              note: note || submission.note,
              unavailable: submittedUnavailable
            }
          : submission
      );
    });

    setAvailabilityDrafts((current) => ({
      ...current,
      [activeEmployee.id]: []
    }));

    const summary =
      submittedUnavailable.length > 0
        ? `${activeEmployee.name} submitted ${submittedUnavailable.length} unavailable day${submittedUnavailable.length === 1 ? "" : "s"}.`
        : `${activeEmployee.name} submitted no unavailable days.`;

    addAudit("availability_submitted", "AvailabilitySubmission", activeEmployee.id, summary, activeEmployee.id);
  }

  function submitAvailability() {
    finalizeAvailability([...(activeSubmission?.unavailable ?? []), ...activeAvailabilityDraft], availabilityForm.note);
  }

  function submitNoUnavailableDays() {
    finalizeAvailability([], "Fully available");
  }

  function requestCoverage(shiftId: string) {
    if (coverage.some((request) => request.shiftId === shiftId && request.status !== "cancelled")) return;

    const request: CoverageRequest = {
      id: `coverage_${Date.now()}`,
      shiftId,
      requestedById: activeEmployee.id,
      status: "open",
      reason: "Employee requested coverage."
    };
    setCoverage((current) => [request, ...current]);
    activeEmployees
      .filter((employee) => employee.id !== activeEmployee.id)
      .forEach((employee) => addNotification("coverage_opened", "A shift is open for coverage", employee.id));
    addAudit("coverage_requested", "CoverageRequest", request.id, `${activeEmployee.name} opened a shift for coverage.`, activeEmployee.id);
  }

  function offerCoverage(requestId: string) {
    setCoverage((current) =>
      current.map((request) =>
        request.id === requestId ? { ...request, claimedById: activeEmployee.id, status: "offered" } : request
      )
    );
    addNotification("coverage_offer", `${activeEmployee.name} offered to cover a shift`, "emp_manager");
    addAudit("coverage_offered", "CoverageRequest", requestId, `${activeEmployee.name} offered to cover.`, activeEmployee.id);
  }

  function approveCoverage(requestId: string, approved: boolean) {
    const request = coverage.find((item) => item.id === requestId);
    if (!request) return;

    setCoverage((current) =>
      current.map((item) =>
        item.id === requestId
          ? {
              ...item,
              status: approved ? "approved" : "rejected",
              managerNote: approved ? "Approved by manager." : "Rejected by manager."
            }
          : item
      )
    );

    if (approved && request.claimedById) {
      setShifts((current) =>
        current.map((shift) => (shift.id === request.shiftId ? { ...shift, employeeId: request.claimedById } : shift))
      );
      addNotification("coverage_approved", "Coverage change approved", request.requestedById);
      addNotification("coverage_approved", "Coverage change approved", request.claimedById);
    }

    addAudit(
      approved ? "coverage_approved" : "coverage_rejected",
      "CoverageRequest",
      requestId,
      approved ? "Manager approved a coverage offer." : "Manager rejected a coverage offer."
    );
  }

  function requestSwap() {
    const requesterShift = shifts.find((shift) => shift.id === swapForm.requesterShiftId);
    const targetShift = shifts.find((shift) => shift.id === swapForm.targetShiftId);
    if (!requesterShift || !targetShift || !targetShift.employeeId) return;

    const request: SwapRequest = {
      id: `swap_${Date.now()}`,
      requesterId: activeEmployee.id,
      targetEmployeeId: targetShift.employeeId,
      requesterShiftId: requesterShift.id,
      targetShiftId: targetShift.id,
      status: "pending_employee_response",
      reason: swapForm.reason || "Swap requested."
    };

    setSwaps((current) => [request, ...current]);
    addNotification("swap_requested", `${activeEmployee.name} requested a shift swap`, targetShift.employeeId);
    addAudit("swap_requested", "SwapRequest", request.id, `${activeEmployee.name} requested a shift swap.`, activeEmployee.id);
  }

  function acceptSwap(requestId: string, accepted: boolean) {
    setSwaps((current) =>
      current.map((request) =>
        request.id === requestId
          ? { ...request, status: accepted ? "pending_manager_approval" : "declined_by_employee" }
          : request
      )
    );
    addNotification("swap_response", accepted ? "A swap is ready for manager approval" : "A swap was declined", "emp_manager");
    addAudit(accepted ? "swap_employee_accepted" : "swap_employee_declined", "SwapRequest", requestId, "Employee responded to swap.", activeEmployee.id);
  }

  function approveSwap(requestId: string, approved: boolean) {
    const request = swaps.find((item) => item.id === requestId);
    if (!request || !request.targetShiftId) return;

    setSwaps((current) =>
      current.map((item) => (item.id === requestId ? { ...item, status: approved ? "approved" : "rejected_by_manager" } : item))
    );

    if (approved) {
      setShifts((current) => {
        const requesterShift = current.find((shift) => shift.id === request.requesterShiftId);
        const targetShift = current.find((shift) => shift.id === request.targetShiftId);
        if (!requesterShift || !targetShift) return current;

        return current.map((shift) => {
          if (shift.id === requesterShift.id) return { ...shift, employeeId: targetShift.employeeId };
          if (shift.id === targetShift.id) return { ...shift, employeeId: requesterShift.employeeId };
          return shift;
        });
      });
      addNotification("swap_approved", "Shift swap approved", request.requesterId);
      addNotification("swap_approved", "Shift swap approved", request.targetEmployeeId);
    }

    addAudit(approved ? "swap_approved" : "swap_rejected", "SwapRequest", requestId, approved ? "Manager approved a swap." : "Manager rejected a swap.");
  }

  function exportCsv() {
    const csv = buildHoursCsv(people, shifts);
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "the-schedule-hours.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  function addEmployee() {
    const email = newEmployee.email.trim().toLowerCase();
    const name = newEmployee.name.trim();
    if (!email || !name) return;
    if (people.some((employee) => employee.email.toLowerCase() === email)) {
      window.alert("That Gmail account is already approved.");
      return;
    }

    const employee: Employee = {
      id: `emp_${Date.now()}`,
      name,
      email,
      role: newEmployee.role,
      active: true,
      position: newEmployee.position.trim() || "Sales"
    };

    setPeople((current) => [...current, employee]);
    setNewEmployee({ name: "", email: "", position: "Sales", role: "employee" });
    addAudit("employee_approved", "User", employee.id, `Approved ${employee.email} for ${store.name}.`);
  }

  function quickAssignSelectedShift() {
    if (!selectedShift) return;

    const available = activeEmployees
      .filter((employee) => !isEmployeeUnavailable(employee.id, selectedShift, availability))
      .map((employee) => {
        const total = finalHours.find((item) => item.employeeId === employee.id);
        return {
          employee,
          hours: total?.hours ?? 0,
          shifts: total?.shifts ?? 0
        };
      })
      .sort((a, b) => a.hours - b.hours || a.shifts - b.shifts || a.employee.name.localeCompare(b.employee.name));

    if (!available[0]) {
      window.alert("No available employees for this shift. Use an override only if you really need to.");
      return;
    }

    assignShift(selectedShift.id, available[0].employee.id);
  }

  function resetTestRun() {
    setMode("manager");
    setActiveTab("dashboard");
    setActiveEmployeeId("emp_avery");
    setPeople(employees);
    setPeriod(schedulePeriod);
    setShifts([]);
    setAvailability([]);
    setCoverage([]);
    setSwaps([]);
    setAuditLog(DEFAULT_AUDIT_LOG);
    setNotifications([]);
    setAvailabilityDrafts({});
    setSelectedShiftId(null);
    setShowOnlyUnassigned(false);
    window.localStorage.removeItem(STORAGE_KEY);
    setPersistenceStatus("saving");
    void fetch("/api/test-state", { method: "DELETE" })
      .then((response) => {
        if (!response.ok) throw new Error("Unable to reset server test state.");
        setPersistenceStatus("saved");
      })
      .catch(() => setPersistenceStatus("local"));
  }

  const managerTabs: Array<{ id: TabId; label: string; icon: React.ReactNode }> = [
    { id: "dashboard", label: "Dashboard", icon: <CalendarDays size={16} /> },
    { id: "employees", label: "Employees", icon: <Users size={16} /> },
    { id: "availability", label: "Availability", icon: <Clock size={16} /> },
    { id: "builder", label: "Builder", icon: <Plus size={16} /> },
    { id: "requests", label: "Requests", icon: <Repeat2 size={16} /> },
    { id: "reports", label: "Reports", icon: <FileText size={16} /> },
    { id: "settings", label: "Settings", icon: <Settings size={16} /> }
  ];

  const employeeTabs: Array<{ id: TabId; label: string; icon: React.ReactNode }> = [
    { id: "dashboard", label: "Dashboard", icon: <CalendarDays size={16} /> },
    { id: "my-shifts", label: "My shifts", icon: <Clock size={16} /> },
    { id: "submit", label: "Availability", icon: <Send size={16} /> },
    { id: "team", label: "Team schedule", icon: <Users size={16} /> },
    { id: "requests", label: "Coverage", icon: <Repeat2 size={16} /> }
  ];

  const tabs = mode === "manager" ? managerTabs : employeeTabs;

  return (
    <main className="min-h-screen bg-paper text-ink">
      <header className="no-print sticky top-0 z-30 border-b border-line bg-paper/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1800px] flex-col gap-3 px-4 py-3 xl:px-6 2xl:px-8 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <div className="grid size-10 shrink-0 place-items-center rounded-lg bg-mall text-white">
              <CalendarDays size={22} />
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-xl font-black">The Schedule</h1>
              <p className="truncate text-sm text-ink/65">
                {store.name} - {period.name}
              </p>
            </div>
            <Badge tone={period.status === "published" ? "good" : "warn"}>{period.status}</Badge>
            <Badge tone={persistenceTone}>{persistenceLabel}</Badge>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="hidden max-w-[340px] items-center gap-2 rounded-lg border border-line bg-white px-3 py-2 text-sm md:flex">
              <ShieldCheck size={16} className="shrink-0 text-mall" />
              <span className="truncate">
                Acting as <strong>{currentIdentity?.name ?? "Test user"}</strong>
                {currentIdentity?.email ? ` - ${currentIdentity.email}` : ""}
              </span>
            </div>
            <div className="inline-flex rounded-lg border border-line bg-white p-1">
              <button
                className={cx("h-8 rounded-md px-3 text-sm font-semibold", mode === "manager" && "bg-ink text-white")}
                onClick={() => {
                  setMode("manager");
                  setActiveTab("dashboard");
                }}
              >
                Manager
              </button>
              <button
                className={cx("h-8 rounded-md px-3 text-sm font-semibold", mode === "employee" && "bg-ink text-white")}
                onClick={() => {
                  setMode("employee");
                  setActiveTab("dashboard");
                }}
              >
                Employee
              </button>
            </div>

            {mode === "employee" && (
              <select className={cx(inputBase, "w-48")} value={activeEmployeeId} onChange={(event) => setActiveEmployeeId(event.target.value)}>
                {activeEmployees.map((employee) => (
                  <option key={employee.id} value={employee.id}>
                    {employee.name}
                  </option>
                ))}
              </select>
            )}

            <Button variant="secondary" onClick={() => void sendTestEmail()} disabled={testEmailStatus === "sending"}>
              <Mail size={16} />
              {testEmailStatus === "sending" ? "Sending" : "Test email"}
            </Button>
            <Button variant="secondary" onClick={resetTestRun}>
              <RefreshCw size={16} />
              Reset test
            </Button>
          </div>
        </div>
        <nav className="mx-auto flex max-w-[1800px] gap-2 overflow-x-auto px-4 pb-3 xl:px-6 2xl:px-8">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              className={cx(
                "inline-flex h-9 shrink-0 items-center gap-2 rounded-md border px-3 text-sm font-semibold",
                activeTab === tab.id ? "border-ink bg-ink text-white" : "border-line bg-white text-ink hover:bg-paper",
                mode === "employee" && tab.id === "submit" && activeEmployeeNeedsAvailability && activeTab !== tab.id && "border-warn bg-warn/10 text-warn"
              )}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.icon}
              {tab.label}
              {mode === "employee" && tab.id === "submit" && activeEmployeeNeedsAvailability && (
                <span className={cx("grid size-5 place-items-center rounded-full text-[11px]", activeTab === tab.id ? "bg-white text-warn" : "bg-warn text-white")}>
                  !
                </span>
              )}
              {mode === "manager" && tab.id === "availability" && missingAvailability.length > 0 && (
                <span className={cx("grid min-w-5 place-items-center rounded-full px-1 text-[11px]", activeTab === tab.id ? "bg-white text-warn" : "bg-warn text-white")}>
                  {missingAvailability.length}
                </span>
              )}
            </button>
          ))}
        </nav>
      </header>

      <div className="mx-auto grid max-w-[1800px] gap-4 px-4 py-4 pb-24 xl:px-6 2xl:px-8 md:pb-4">
        {activeTab === "dashboard" && mode === "employee" && (
          <div className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
            <Section title={`${activeEmployee.name}'s Test Workspace`} icon={<CalendarDays size={18} />}>
              <div className="grid gap-3">
                <div
                  className={cx(
                    "rounded-lg border p-4",
                    activeEmployeeNeedsAvailability ? "border-warn bg-warn/10" : "border-approve/30 bg-approve/10"
                  )}
                >
                  <div className="flex items-start gap-3">
                    <span className={cx("mt-0.5", activeEmployeeNeedsAvailability ? "text-warn" : "text-approve")}>
                      {activeEmployeeNeedsAvailability ? <AlertTriangle size={20} /> : <Check size={20} />}
                    </span>
                    <div>
                      <div className="font-black">
                        {activeEmployeeNeedsAvailability ? "Availability still needed" : "Availability submitted"}
                      </div>
                      <p className="mt-1 text-sm text-ink/70">
                        Test date is {TEST_TODAY}. The release is {period.releaseDate}, so this is the employee submission window.
                      </p>
                    </div>
                  </div>
                  {activeEmployeeNeedsAvailability && (
                    <Button className="mt-3" onClick={() => setActiveTab("submit")}>
                      <Send size={16} />
                      Submit availability
                    </Button>
                  )}
                </div>
                <div className="grid gap-2 rounded-lg border border-line p-4">
                  <div className="text-xs font-semibold uppercase tracking-normal text-ink/55">Test flow</div>
                  <div className="grid gap-2 text-sm">
                    <div className="flex items-center gap-2">
                      <Badge tone={activeEmployeeNeedsAvailability ? "warn" : "good"}>1</Badge>
                      Submit unavailable days as a few employees.
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge tone={shifts.length > 0 ? "good" : "neutral"}>2</Badge>
                      Switch to manager, generate shifts, and assign names.
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge tone={period.status === "published" ? "good" : "neutral"}>3</Badge>
                      Publish the schedule and review employee schedule views.
                    </div>
                  </div>
                </div>
              </div>
            </Section>
            <Section title="My Upcoming Shifts" icon={<Clock size={18} />}>
              <ShiftList shifts={myShifts} onRequestCoverage={requestCoverage} />
            </Section>
          </div>
        )}

        {activeTab === "dashboard" && mode === "manager" && (
          <div className="grid gap-4">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <Metric label="Test date" value={TEST_TODAY} detail={`Current step: ${testStep}`} tone={period.status === "published" ? "good" : "warn"} />
              <Metric label="Availability" value={`${submittedIds.size}/${activeEmployees.length}`} detail={`${missingAvailability.length} still missing`} tone={submittedIds.size === activeEmployees.length ? "good" : "warn"} />
              <Metric label="Open requests" value={String(pendingManagerRequests)} detail="Need manager action" tone={pendingManagerRequests ? "warn" : "good"} />
              <Metric label="Draft shifts" value={String(shifts.length)} detail={shifts.length ? "Ready for assignment" : "Generate from templates"} />
            </div>

            <ScheduleGrid
              people={people}
              calendarWeeks={calendarWeeks}
              availability={availability}
              showAssignments
            />
            <Section title="Activity" icon={<ShieldCheck size={18} />}>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {missingAvailability.length > 0 && (
                  <div className="rounded-lg border border-warn bg-warn/10 p-3">
                    <div className="flex items-center gap-2 font-bold text-warn">
                      <AlertTriangle size={16} />
                      Availability missing
                    </div>
                    <p className="mt-1 text-sm text-ink/70">
                      {missingAvailability.map((employee) => employee.name).join(", ")}
                    </p>
                  </div>
                )}
                {notifications.slice(0, 3).map((entry) => (
                  <div key={entry.id} className="rounded-lg border border-line bg-paper p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-bold">{entry.subject}</span>
                      <Badge tone={entry.status === "failed" ? "danger" : entry.status === "sent" ? "good" : "neutral"}>{entry.status}</Badge>
                    </div>
                    <p className="mt-1 text-sm text-ink/65">
                      {entry.type.replaceAll("_", " ")}
                      {entry.userId ? ` - ${nameFor(entry.userId)}` : ""}
                    </p>
                  </div>
                ))}
                {auditLog.slice(0, 6).map((entry) => (
                  <div key={entry.id} className="rounded-lg border border-line p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-bold">{entry.action.replaceAll("_", " ")}</span>
                      <span className="text-xs text-ink/55">{new Date(entry.createdAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</span>
                    </div>
                    <p className="mt-1 text-sm text-ink/65">{entry.summary}</p>
                  </div>
                ))}
              </div>
            </Section>
          </div>
        )}

        {activeTab === "employees" && mode === "manager" && (
          <Section title="Employees" icon={<Users size={18} />}>
            <div className="mb-4 grid gap-3 rounded-lg border border-line p-4 lg:grid-cols-[1fr_1fr_180px_150px_auto]">
              <Field label="Name">
                <input className={inputBase} value={newEmployee.name} onChange={(event) => setNewEmployee({ ...newEmployee, name: event.target.value })} />
              </Field>
              <Field label="Approved Gmail">
                <input className={inputBase} type="email" value={newEmployee.email} onChange={(event) => setNewEmployee({ ...newEmployee, email: event.target.value })} />
              </Field>
              <Field label="Position">
                <input className={inputBase} value={newEmployee.position} onChange={(event) => setNewEmployee({ ...newEmployee, position: event.target.value })} />
              </Field>
              <Field label="Role">
                <select className={inputBase} value={newEmployee.role} onChange={(event) => setNewEmployee({ ...newEmployee, role: event.target.value as Employee["role"] })}>
                  <option value="employee">Employee</option>
                  <option value="manager">Manager</option>
                </select>
              </Field>
              <div className="flex items-end">
                <Button className="w-full" onClick={addEmployee}>
                  <UserPlus size={16} />
                  Add
                </Button>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] border-separate border-spacing-0 text-left text-sm">
                <thead>
                  <tr className="text-xs uppercase tracking-normal text-ink/55">
                    <th className="border-b border-line pb-2">Name</th>
                    <th className="border-b border-line pb-2">Approved Gmail</th>
                    <th className="border-b border-line pb-2">Role</th>
                    <th className="border-b border-line pb-2">Position</th>
                    <th className="border-b border-line pb-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {people.map((employee) => (
                    <tr key={employee.id}>
                      <td className="border-b border-line py-3 font-semibold">{employee.name}</td>
                      <td className="border-b border-line py-3">{employee.email}</td>
                      <td className="border-b border-line py-3 capitalize">{employee.role}</td>
                      <td className="border-b border-line py-3">{employee.position}</td>
                      <td className="border-b border-line py-3">
                        <Badge tone={employee.active ? "good" : "neutral"}>{employee.active ? "Active" : "Inactive"}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>
        )}

        {activeTab === "availability" && mode === "manager" && (
          <Section title="Availability Tracker" icon={<Clock size={18} />}>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {activeEmployees.map((employee) => {
                const submission = availability.find((item) => item.userId === employee.id);
                return (
                  <div key={employee.id} className="rounded-lg border border-line p-4">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <div className="font-bold">{employee.name}</div>
                        <div className="text-sm text-ink/60">{employee.email}</div>
                      </div>
                      <Badge tone={submission?.submittedAt ? "good" : "warn"}>{submission?.submittedAt ? "Submitted" : "Missing"}</Badge>
                    </div>
                    <div className="mt-3 grid gap-2">
                      {submission?.submittedAt && submission.unavailable.length === 0 && (
                        <div className="rounded-md border border-approve/30 bg-approve/10 p-2 text-sm font-semibold text-approve">
                          Fully available
                        </div>
                      )}
                      {(submission?.unavailable ?? []).map((entry) => (
                        <div key={entry.id} className="rounded-md bg-paper p-2 text-sm">
                          <span className="font-semibold">{getDayName(entry.date)}</span>{" "}
                          {entry.allDay ? "Full day" : `${formatTime(entry.startTime ?? "00:00")}-${formatTime(entry.endTime ?? "00:00")}`}
                          {entry.note ? <span className="text-ink/60"> - {entry.note}</span> : null}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </Section>
        )}

        {activeTab === "builder" && mode === "manager" && (
          <div className="grid gap-4">
            <div className="grid gap-3 md:grid-cols-4">
              <Metric label="Unassigned" value={String(unassignedShifts.length)} detail={`${shifts.length} total shifts`} tone={unassignedShifts.length ? "warn" : "good"} />
              <Metric label="Assigned" value={String(shifts.length - unassignedShifts.length)} detail="Ready for publishing" />
              <Metric label="Availability" value={`${submittedIds.size}/${activeEmployees.length}`} detail={`${missingAvailability.length} missing`} tone={missingAvailability.length ? "warn" : "good"} />
              <Metric label="Selected" value={selectedShift ? shortDayLabel(selectedShift.date) : "-"} detail={selectedShift ? `${formatTime(selectedShift.startTime)}-${formatTime(selectedShift.endTime)}` : "Choose a shift"} />
            </div>
            <div className="grid min-w-0 gap-4">
              <ScheduleGrid
                people={people}
                title="Schedule Builder"
                calendarWeeks={calendarWeeks}
                availability={availability}
                showAssignments
                onRemove={removeShift}
                selectedShiftId={selectedShiftId}
                onSelectShift={setSelectedShiftId}
                showOnlyUnassigned={showOnlyUnassigned}
                action={
                  <div className="flex flex-wrap gap-2">
                    <Button variant={showOnlyUnassigned ? "primary" : "secondary"} onClick={() => setShowOnlyUnassigned((current) => !current)}>
                      <AlertTriangle size={16} />
                      Unassigned
                    </Button>
                    <Button variant="secondary" onClick={generateDraft}>
                      <RefreshCw size={16} />
                      Generate
                    </Button>
                    <Button onClick={publishSchedule} disabled={period.status === "published"}>
                      <Send size={16} />
                      Publish
                    </Button>
                  </div>
                }
              />

              <AssignmentPanel
                people={people}
                shift={selectedShift}
                availability={availability}
                hours={finalHours}
                onAssign={(employeeId) => selectedShift && assignShift(selectedShift.id, employeeId)}
                onQuickAssign={quickAssignSelectedShift}
                onClear={() => selectedShift && assignShift(selectedShift.id, "")}
              />

              <Section title="Custom Shift" icon={<Plus size={18} />}>
                <div className="grid gap-3 md:grid-cols-5">
                  <Field label="Date">
                    <select className={inputBase} value={customShift.date} onChange={(event) => setCustomShift({ ...customShift, date: event.target.value })}>
                      {dates.map((date) => (
                        <option key={date} value={date}>
                          {getDayName(date)}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Start">
                    <input className={inputBase} type="time" value={customShift.startTime} onChange={(event) => setCustomShift({ ...customShift, startTime: event.target.value })} />
                  </Field>
                  <Field label="End">
                    <input className={inputBase} type="time" value={customShift.endTime} onChange={(event) => setCustomShift({ ...customShift, endTime: event.target.value })} />
                  </Field>
                  <Field label="Role">
                    <input className={inputBase} value={customShift.roleLabel} onChange={(event) => setCustomShift({ ...customShift, roleLabel: event.target.value })} />
                  </Field>
                  <div className="flex items-end">
                    <Button className="w-full" onClick={addCustomShift}>
                      <Plus size={16} />
                      Add
                    </Button>
                  </div>
                </div>
              </Section>
            </div>

            <Section title="Hours" icon={<Clock size={18} />}>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
                {finalHours
                  .filter((item) => item.shifts > 0 || people.find((employee) => employee.id === item.employeeId)?.active)
                  .map((item) => (
                    <div key={item.employeeId} className="rounded-lg border border-line bg-paper p-4">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-bold">{item.name}</span>
                        <span className="text-lg font-black">{item.hours.toFixed(1)}h</span>
                      </div>
                      <div className="mt-2 flex items-center justify-between text-sm text-ink/65">
                        <span>{item.shifts} shifts</span>
                        <Badge tone={Math.abs(item.averageDelta) > 5 ? "warn" : "neutral"}>
                          {item.averageDelta >= 0 ? "+" : ""}
                          {item.averageDelta.toFixed(1)} vs avg
                        </Badge>
                      </div>
                    </div>
                  ))}
              </div>
            </Section>
          </div>
        )}

        {activeTab === "my-shifts" && mode === "employee" && (
          <Section title="My Shifts" icon={<Clock size={18} />}>
            <ShiftList shifts={myShifts} onRequestCoverage={requestCoverage} />
          </Section>
        )}

        {activeTab === "submit" && mode === "employee" && (
          <Section title="Submit Availability" icon={<Send size={18} />}>
            <div className="grid gap-4 lg:grid-cols-[0.8fr_1.2fr]">
              <div className="grid gap-3 rounded-lg border border-line p-4">
                <div
                  className={cx(
                    "rounded-lg border p-3 text-sm",
                    activeEmployeeNeedsAvailability ? "border-warn bg-warn/10 text-ink" : "border-approve/30 bg-approve/10 text-ink"
                  )}
                >
                  <div className="font-black">
                    {activeEmployeeNeedsAvailability ? "Build your unavailable-days list before submitting." : "Availability has been submitted."}
                  </div>
                  <p className="mt-1 text-ink/70">
                    Adding a day below does not submit it yet. Submit when the list is complete, or submit with no unavailable days.
                  </p>
                </div>
                <Field label="Date">
                  <select className={inputBase} value={availabilityForm.date} onChange={(event) => setAvailabilityForm({ ...availabilityForm, date: event.target.value })}>
                    {dates.map((date) => (
                      <option key={date} value={date}>
                        {getDayName(date)}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Unavailable type">
                  <select
                    className={inputBase}
                    value={availabilityForm.unavailableType}
                    onChange={(event) => setAvailabilityForm({ ...availabilityForm, unavailableType: event.target.value as UnavailableType })}
                  >
                    <option value="full_day">Full day</option>
                    <option value="shift_template">Shift-specific</option>
                    <option value="custom_time_range">Custom time range</option>
                  </select>
                </Field>
                {availabilityForm.unavailableType === "shift_template" && (
                  <Field label="Shift template">
                    <select className={inputBase} value={availabilityForm.shiftTemplateId} onChange={(event) => setAvailabilityForm({ ...availabilityForm, shiftTemplateId: event.target.value })}>
                      {shiftTemplates.map((template) => (
                        <option key={template.id} value={template.id}>
                          {template.name} {formatTime(template.startTime)}-{formatTime(template.endTime)}
                        </option>
                      ))}
                    </select>
                  </Field>
                )}
                {availabilityForm.unavailableType === "custom_time_range" && (
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Start">
                      <input className={inputBase} type="time" value={availabilityForm.startTime} onChange={(event) => setAvailabilityForm({ ...availabilityForm, startTime: event.target.value })} />
                    </Field>
                    <Field label="End">
                      <input className={inputBase} type="time" value={availabilityForm.endTime} onChange={(event) => setAvailabilityForm({ ...availabilityForm, endTime: event.target.value })} />
                    </Field>
                  </div>
                )}
                <Field label="Note">
                  <input className={inputBase} value={availabilityForm.note} onChange={(event) => setAvailabilityForm({ ...availabilityForm, note: event.target.value })} />
                </Field>
                <Button variant="secondary" onClick={addAvailabilityDraftEntry}>
                  <Plus size={16} />
                  Add unavailable day
                </Button>
                <Button onClick={submitAvailability}>
                  <Check size={16} />
                  Submit availability
                </Button>
                <Button variant="ghost" onClick={submitNoUnavailableDays}>
                  <Check size={16} />
                  Submit no unavailable days
                </Button>
              </div>
              <div className="grid content-start gap-4">
                <div className="rounded-lg border border-line p-4">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="font-black">Draft days</h3>
                    <Badge tone={activeAvailabilityDraft.length ? "warn" : "neutral"}>{activeAvailabilityDraft.length}</Badge>
                  </div>
                  <div className="mt-3 grid gap-2">
                    {activeAvailabilityDraft.length === 0 && (
                      <div className="rounded-md border border-dashed border-line p-3 text-sm text-ink/55">
                        No draft days added yet.
                      </div>
                    )}
                    {activeAvailabilityDraft.map((entry) => (
                      <AvailabilityEntryCard key={entry.id} entry={entry} onRemove={() => removeAvailabilityDraftEntry(entry.id)} />
                    ))}
                  </div>
                </div>

                <div className="rounded-lg border border-line p-4">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="font-black">Submitted availability</h3>
                    <Badge tone={activeSubmission?.submittedAt ? "good" : "warn"}>
                      {activeSubmission?.submittedAt ? "Submitted" : "Not submitted"}
                    </Badge>
                  </div>
                  <div className="mt-3 grid gap-2">
                    {!activeSubmission?.submittedAt && (
                      <div className="rounded-md border border-dashed border-line p-3 text-sm text-ink/55">
                        Final submission not sent yet.
                      </div>
                    )}
                    {activeSubmission?.submittedAt && activeSubmission.unavailable.length === 0 && (
                      <div className="rounded-md border border-approve/30 bg-approve/10 p-3 text-sm font-semibold text-approve">
                        No unavailable days submitted.
                      </div>
                    )}
                    {(activeSubmission?.unavailable ?? []).map((entry) => (
                      <AvailabilityEntryCard key={entry.id} entry={entry} />
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </Section>
        )}

        {activeTab === "team" && mode === "employee" && <ScheduleGrid people={people} calendarWeeks={calendarWeeks} availability={availability} showAssignments />}

        {activeTab === "requests" && (
          <div className="grid gap-4 lg:grid-cols-2">
            <Section title="Coverage Requests" icon={<Repeat2 size={18} />}>
              <div className="grid gap-3">
                {openCoverage.map((request) => {
                  const shift = shifts.find((item) => item.id === request.shiftId);
                  if (!shift) return null;
                  const isMine = shift.employeeId === activeEmployee.id;
                  const canOffer = mode === "employee" && !isMine && request.requestedById !== activeEmployee.id && request.status === "open";

                  return (
                    <div key={request.id} className="rounded-lg border border-line p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <div className="font-bold">{getDayName(shift.date)}</div>
                          <div className="text-sm text-ink/65">
                            {formatTime(shift.startTime)}-{formatTime(shift.endTime)} - {nameFor(request.requestedById)}
                          </div>
                        </div>
                        <Badge tone={request.status === "offered" ? "warn" : "neutral"}>{request.status}</Badge>
                      </div>
                      <p className="mt-2 text-sm text-ink/65">{request.reason}</p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {canOffer && (
                          <Button variant="secondary" onClick={() => offerCoverage(request.id)}>
                            <Check size={16} />
                            Offer
                          </Button>
                        )}
                        {mode === "manager" && request.status === "offered" && (
                          <>
                            <Button onClick={() => approveCoverage(request.id, true)}>
                              <Check size={16} />
                              Approve
                            </Button>
                            <Button variant="danger" onClick={() => approveCoverage(request.id, false)}>
                              <X size={16} />
                              Reject
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </Section>

            <Section title="Shift Swaps" icon={<Repeat2 size={18} />}>
              {mode === "employee" && (
                <div className="mb-4 grid gap-3 rounded-lg border border-line p-4">
                  <Field label="Your shift">
                    <select className={inputBase} value={swapForm.requesterShiftId} onChange={(event) => setSwapForm({ ...swapForm, requesterShiftId: event.target.value })}>
                      <option value="">Select shift</option>
                      {myShifts.map((shift) => (
                        <option key={shift.id} value={shift.id}>
                          {getDayName(shift.date)} {formatTime(shift.startTime)}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Swap with">
                    <select className={inputBase} value={swapForm.targetShiftId} onChange={(event) => setSwapForm({ ...swapForm, targetShiftId: event.target.value })}>
                      <option value="">Select shift</option>
                      {shifts
                        .filter((shift) => shift.employeeId && shift.employeeId !== activeEmployee.id)
                        .map((shift) => (
                          <option key={shift.id} value={shift.id}>
                            {nameFor(shift.employeeId)} - {getDayName(shift.date)} {formatTime(shift.startTime)}
                          </option>
                        ))}
                    </select>
                  </Field>
                  <Field label="Reason">
                    <input className={inputBase} value={swapForm.reason} onChange={(event) => setSwapForm({ ...swapForm, reason: event.target.value })} />
                  </Field>
                  <Button onClick={requestSwap}>
                    <Repeat2 size={16} />
                    Request swap
                  </Button>
                </div>
              )}

              <div className="grid gap-3">
                {swaps.map((request) => {
                  const requesterShift = shifts.find((shift) => shift.id === request.requesterShiftId);
                  const targetShift = shifts.find((shift) => shift.id === request.targetShiftId);
                  const targetCanRespond = mode === "employee" && request.targetEmployeeId === activeEmployee.id && request.status === "pending_employee_response";
                  return (
                    <div key={request.id} className="rounded-lg border border-line p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="font-bold">
                          {nameFor(request.requesterId)} with {nameFor(request.targetEmployeeId)}
                        </div>
                        <Badge tone={request.status.includes("approved") ? "good" : request.status.includes("rejected") || request.status.includes("declined") ? "danger" : "warn"}>
                          {request.status.replaceAll("_", " ")}
                        </Badge>
                      </div>
                      <div className="mt-2 text-sm text-ink/65">
                        {requesterShift ? `${getDayName(requesterShift.date)} ${formatTime(requesterShift.startTime)}` : "Requester shift"} for{" "}
                        {targetShift ? `${getDayName(targetShift.date)} ${formatTime(targetShift.startTime)}` : "open swap"}
                      </div>
                      <p className="mt-1 text-sm text-ink/65">{request.reason}</p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {targetCanRespond && (
                          <>
                            <Button onClick={() => acceptSwap(request.id, true)}>
                              <Check size={16} />
                              Accept
                            </Button>
                            <Button variant="danger" onClick={() => acceptSwap(request.id, false)}>
                              <X size={16} />
                              Decline
                            </Button>
                          </>
                        )}
                        {mode === "manager" && request.status === "pending_manager_approval" && (
                          <>
                            <Button onClick={() => approveSwap(request.id, true)}>
                              <Check size={16} />
                              Approve
                            </Button>
                            <Button variant="danger" onClick={() => approveSwap(request.id, false)}>
                              <X size={16} />
                              Reject
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </Section>
          </div>
        )}

        {activeTab === "reports" && mode === "manager" && (
          <Section
            title="Hours Report"
            icon={<FileText size={18} />}
            action={
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" onClick={exportCsv}>
                  <Download size={16} />
                  CSV
                </Button>
                <Button variant="secondary" onClick={() => window.print()}>
                  <Printer size={16} />
                  Print
                </Button>
              </div>
            }
          >
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] border-separate border-spacing-0 text-left text-sm">
                <thead>
                  <tr className="text-xs uppercase tracking-normal text-ink/55">
                    <th className="border-b border-line pb-2">Employee</th>
                    <th className="border-b border-line pb-2">Initial published</th>
                    <th className="border-b border-line pb-2">Final worked</th>
                    <th className="border-b border-line pb-2">Final shifts</th>
                    <th className="border-b border-line pb-2">Delta</th>
                  </tr>
                </thead>
                <tbody>
                  {finalHours.map((final) => {
                    const initial = initialHours.find((item) => item.employeeId === final.employeeId);
                    const delta = final.hours - (initial?.hours ?? 0);
                    return (
                      <tr key={final.employeeId}>
                        <td className="border-b border-line py-3 font-semibold">{final.name}</td>
                        <td className="border-b border-line py-3">{(initial?.hours ?? 0).toFixed(1)}h</td>
                        <td className="border-b border-line py-3">{final.hours.toFixed(1)}h</td>
                        <td className="border-b border-line py-3">{final.shifts}</td>
                        <td className="border-b border-line py-3">
                          <Badge tone={Math.abs(delta) > 0 ? "warn" : "neutral"}>
                            {delta >= 0 ? "+" : ""}
                            {delta.toFixed(1)}h
                          </Badge>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Section>
        )}

        {activeTab === "settings" && mode === "manager" && (
          <div className="grid gap-4 xl:grid-cols-3">
            <Section title="Store Hours" icon={<Settings size={18} />}>
              <div className="grid gap-2">
                {storeHours.map((hours) => (
                  <div key={hours.dayOfWeek} className="grid grid-cols-[1fr_auto] items-center gap-3 rounded-lg border border-line p-3">
                    <div>
                      <div className="font-bold">{hours.day}</div>
                      <div className="text-sm text-ink/65">{hours.label}</div>
                    </div>
                    <div className="text-sm font-semibold">
                      {formatTime(hours.openTime)}-{formatTime(hours.closeTime)}
                    </div>
                  </div>
                ))}
              </div>
            </Section>
            <Section title="Default Shift Templates" icon={<Clock size={18} />}>
              <div className="grid gap-2">
                {shiftTemplates.map((template) => (
                  <div key={template.id} className="grid grid-cols-[1fr_auto] items-center gap-3 rounded-lg border border-line p-3">
                    <div>
                      <div className="font-bold">{template.name}</div>
                      <div className="text-sm capitalize text-ink/65">{template.dayPattern}</div>
                    </div>
                    <div className="text-sm font-semibold">
                      {formatTime(template.startTime)}-{formatTime(template.endTime)}
                    </div>
                  </div>
                ))}
              </div>
            </Section>
            <Section title="Auth & Notifications" icon={<ShieldCheck size={18} />}>
              <div className="grid gap-3">
                <div className="rounded-lg border border-line p-3">
                  <div className="text-xs font-semibold uppercase tracking-normal text-ink/55">Approved access</div>
                  <div className="mt-2 font-black">{people.filter((person) => person.active).length} active Gmail accounts</div>
                  <p className="mt-1 text-sm text-ink/65">
                    Google sign-in checks the active store membership before allowing access.
                  </p>
                  <Link className={cx(buttonBase, "mt-3 border-line bg-white text-ink hover:bg-paper")} href="/api/auth/signin">
                    <ShieldCheck size={16} />
                    Google sign-in
                  </Link>
                </div>
                <div className="rounded-lg border border-line p-3">
                  <div className="text-xs font-semibold uppercase tracking-normal text-ink/55">Test notification</div>
                  <div className="mt-2 font-black">{currentIdentity?.email ?? "No recipient"}</div>
                  <p className="mt-1 text-sm text-ink/65">
                    Sends through Resend when configured; otherwise logs as queued.
                  </p>
                  <Button className="mt-3 w-full" onClick={() => void sendTestEmail()} disabled={testEmailStatus === "sending"}>
                    <Mail size={16} />
                    {testEmailStatus === "sending" ? "Sending" : "Send test email"}
                  </Button>
                  {testEmailStatus === "sent" && <div className="mt-2 text-sm font-semibold text-approve">Notification logged.</div>}
                  {testEmailStatus === "error" && <div className="mt-2 text-sm font-semibold text-red-700">Notification failed.</div>}
                </div>
              </div>
            </Section>
          </div>
        )}
      </div>
      {mode === "employee" && (
        <nav className="no-print fixed inset-x-0 bottom-0 z-40 border-t border-line bg-white px-2 py-2 shadow-panel md:hidden">
          <div className="grid grid-cols-5 gap-1">
            {employeeTabs.map((tab) => (
              <button
                key={tab.id}
                className={cx(
                  "relative grid min-h-14 place-items-center rounded-md px-1 text-[11px] font-bold leading-tight",
                  activeTab === tab.id ? "bg-ink text-white" : "bg-paper text-ink",
                  tab.id === "submit" && activeEmployeeNeedsAvailability && activeTab !== tab.id && "text-warn"
                )}
                onClick={() => setActiveTab(tab.id)}
                type="button"
              >
                {tab.icon}
                <span className="mt-1">{tab.label.replace("Team schedule", "Team")}</span>
                {tab.id === "submit" && activeEmployeeNeedsAvailability && (
                  <span
                    className={cx(
                      "absolute right-1 top-1 grid size-4 place-items-center rounded-full text-[10px]",
                      activeTab === tab.id ? "bg-white text-warn" : "bg-warn text-white"
                    )}
                  >
                    !
                  </span>
                )}
              </button>
            ))}
          </div>
        </nav>
      )}
    </main>
  );
}

function ScheduleGrid({
  people,
  title = "Team Schedule",
  action,
  calendarWeeks,
  availability,
  showAssignments,
  onRemove,
  selectedShiftId,
  onSelectShift,
  showOnlyUnassigned = false
}: {
  people: Employee[];
  title?: string;
  action?: React.ReactNode;
  calendarWeeks: ReturnType<typeof buildCalendarWeeks>;
  availability: AvailabilitySubmission[];
  showAssignments?: boolean;
  onRemove?: (shiftId: string) => void;
  selectedShiftId?: string | null;
  onSelectShift?: (shiftId: string) => void;
  showOnlyUnassigned?: boolean;
}) {
  const weekDayLabels = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

  return (
    <Section
      title={title}
      icon={<CalendarDays size={18} />}
      action={
        action ?? (
          <Button variant="secondary" onClick={() => window.print()}>
            <Printer size={16} />
            Print
          </Button>
        )
      }
    >
      <div className="-mx-2 overflow-x-auto px-2 pb-2">
        <div className="min-w-[1050px] overflow-hidden rounded-lg border border-line bg-white">
          <div className="grid grid-cols-7 border-b border-line bg-ink text-white">
            {weekDayLabels.map((label) => (
              <div key={label} className="px-4 py-3 text-sm font-black">
                {label}
              </div>
            ))}
          </div>
          <div className="grid">
            {calendarWeeks.map((week, weekIndex) => (
              <div key={`week-${weekIndex}`} className="grid grid-cols-7 border-b border-line last:border-b-0">
                {week.map(({ date, inPeriod, shifts }) => {
                  const hours = storeHours.find((entry) => entry.dayOfWeek === parseLocalDate(date).getDay());
                  const visibleShifts = showOnlyUnassigned ? shifts.filter((shift) => !shift.employeeId) : shifts;

                  return (
                    <div
                      key={date}
                      className={cx(
                        "min-h-[230px] border-r border-line p-3 last:border-r-0",
                        inPeriod ? "bg-white" : "bg-paper/60 text-ink/35"
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className={cx("text-lg font-black leading-tight", !inPeriod && "text-ink/35")}>
                            {shortDayLabel(date)}
                          </div>
                          <div className={cx("mt-1 text-xs font-semibold", inPeriod ? "text-ink/55" : "text-ink/30")}>
                            {hours && inPeriod ? `${formatTime(hours.openTime)}-${formatTime(hours.closeTime)}` : weekdayLong(date)}
                          </div>
                        </div>
                        {inPeriod && shifts.length > 0 && <Badge>{showOnlyUnassigned ? `${visibleShifts.length}/${shifts.length}` : shifts.length}</Badge>}
                      </div>

                      <div className="mt-3 grid gap-2">
                        {!inPeriod && <div className="h-16" />}
                        {inPeriod && visibleShifts.length === 0 && (
                          <div className="rounded-md border border-dashed border-line bg-paper/70 p-3 text-sm font-semibold text-ink/45">
                            {shifts.length === 0 ? "No shifts" : "No unassigned shifts"}
                          </div>
                        )}
                        {inPeriod &&
                          visibleShifts.map((shift) => {
                            const assignedEmployee = people.find((employee) => employee.id === shift.employeeId);
                            const assignedUnavailable = shift.employeeId ? isEmployeeUnavailable(shift.employeeId, shift, availability) : false;
                            const isSelected = selectedShiftId === shift.id;
                            return (
                              <div
                                key={shift.id}
                                className={cx(
                                  "cursor-pointer rounded-md border bg-paper p-2.5 shadow-sm transition hover:border-mall hover:bg-white",
                                  isSelected ? "border-mall ring-2 ring-mall/20" : "border-line"
                                )}
                                onClick={() => onSelectShift?.(shift.id)}
                                onKeyDown={(event) => {
                                  if (event.key === "Enter" || event.key === " ") onSelectShift?.(shift.id);
                                }}
                                role={onSelectShift ? "button" : undefined}
                                tabIndex={onSelectShift ? 0 : undefined}
                              >
                                <div className="flex items-start justify-between gap-2">
                                  <div className="min-w-0">
                                    <div className="text-sm font-black leading-tight">
                                      {formatTime(shift.startTime)}-{formatTime(shift.endTime)}
                                    </div>
                                    <div className="mt-1 text-xs font-semibold text-ink/55">
                                      {shiftDurationHours(shift).toFixed(1)}h - {shift.roleLabel}
                                    </div>
                                  </div>
                                  {onRemove && (
                                    <button
                                      className="grid size-7 shrink-0 place-items-center rounded-md text-ink/55 hover:bg-white hover:text-ink"
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        onRemove(shift.id);
                                      }}
                                      title="Remove shift"
                                    >
                                      <X size={14} />
                                    </button>
                                  )}
                                </div>
                                {showAssignments && (
                                  <div className="mt-2 grid gap-2">
                                    <div
                                      className={cx(
                                        "rounded-md border bg-white px-2 py-2",
                                        assignedUnavailable ? "border-warn" : "border-line"
                                      )}
                                    >
                                      <div className="text-sm font-bold leading-tight break-words">
                                        {assignedEmployee?.name ?? "Unassigned"}
                                      </div>
                                      {assignedUnavailable && (
                                        <div className="mt-1 flex items-center gap-1 text-xs font-semibold text-warn">
                                          <AlertTriangle size={14} />
                                          Conflict
                                        </div>
                                      )}
                                    </div>
                                    {onSelectShift && (
                                      <div className="text-xs font-semibold text-mall">
                                        Click to assign
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
    </Section>
  );
}

function AssignmentPanel({
  people,
  shift,
  availability,
  hours,
  onAssign,
  onQuickAssign,
  onClear
}: {
  people: Employee[];
  shift: Shift | null;
  availability: AvailabilitySubmission[];
  hours: ReturnType<typeof calculateHours>;
  onAssign: (employeeId: string) => void;
  onQuickAssign: () => void;
  onClear: () => void;
}) {
  const employeesForAssignment = people.filter((employee) => employee.role === "employee");

  if (!shift) {
    return (
      <Section title="Assign Shift" icon={<Users size={18} />}>
        <div className="rounded-lg border border-dashed border-line p-6 text-sm font-semibold text-ink/55">
          Select a shift on the calendar to assign an employee.
        </div>
      </Section>
    );
  }

  const availableEmployees = employeesForAssignment.filter(
    (employee) => employee.active && !availabilityStatusForShift(employee, shift, availability).unavailable
  );
  const unavailableEmployees = employeesForAssignment.filter(
    (employee) => !employee.active || availabilityStatusForShift(employee, shift, availability).unavailable
  );

  function employeeHours(employeeId: string) {
    return hours.find((item) => item.employeeId === employeeId);
  }

  return (
    <Section
      title="Assign Shift"
      icon={<Users size={18} />}
      action={
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={onQuickAssign} disabled={availableEmployees.length === 0}>
            <Check size={16} />
            Quick assign
          </Button>
          <Button variant="ghost" onClick={onClear} disabled={!shift.employeeId}>
            <X size={16} />
            Clear
          </Button>
        </div>
      }
    >
      <div className="grid gap-4 xl:grid-cols-[320px_1fr]">
        <div className="rounded-lg border border-line bg-paper p-4">
          <div className="text-xs font-semibold uppercase tracking-normal text-ink/55">Selected shift</div>
          <div className="mt-2 text-xl font-black">{getDayName(shift.date)}</div>
          <div className="mt-1 text-sm font-semibold text-ink/70">
            {formatTime(shift.startTime)}-{formatTime(shift.endTime)} - {shiftDurationHours(shift).toFixed(1)}h
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Badge>{shift.roleLabel}</Badge>
            <Badge tone={shift.employeeId ? "good" : "warn"}>{shift.employeeId ? "Assigned" : "Unassigned"}</Badge>
          </div>
          <div className="mt-4 rounded-md bg-white p-3">
            <div className="text-xs font-semibold uppercase tracking-normal text-ink/55">Current employee</div>
            <div className="mt-1 font-black">{people.find((employee) => employee.id === shift.employeeId)?.name ?? "Unassigned"}</div>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-lg border border-line p-4">
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-black">Available</h3>
              <Badge tone={availableEmployees.length ? "good" : "warn"}>{availableEmployees.length}</Badge>
            </div>
            <div className="mt-3 grid gap-2">
              {availableEmployees.length === 0 && (
                <div className="rounded-md border border-dashed border-line p-3 text-sm text-ink/55">
                  No available employees. Overrides are enabled below.
                </div>
              )}
              {availableEmployees.map((employee) => {
                const total = employeeHours(employee.id);
                const isCurrent = employee.id === shift.employeeId;
                return (
                  <button
                    key={employee.id}
                    className={cx(
                      "rounded-md border p-3 text-left transition hover:border-mall hover:bg-paper",
                      isCurrent ? "border-mall bg-mall/10" : "border-line bg-white"
                    )}
                    onClick={() => onAssign(employee.id)}
                    type="button"
                  >
                    <span className="block font-black">{employee.name}</span>
                    <span className="mt-1 block text-sm text-ink/65">
                      {employee.position} - {(total?.hours ?? 0).toFixed(1)}h, {total?.shifts ?? 0} shifts
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="rounded-lg border border-line p-4">
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-black">Unavailable</h3>
              <Badge tone={unavailableEmployees.length ? "warn" : "neutral"}>{unavailableEmployees.length}</Badge>
            </div>
            <div className="mt-3 grid gap-2">
              {unavailableEmployees.length === 0 && (
                <div className="rounded-md border border-dashed border-line p-3 text-sm text-ink/55">
                  No conflicts for this shift.
                </div>
              )}
              {unavailableEmployees.map((employee) => {
                const status = availabilityStatusForShift(employee, shift, availability);
                const overrideAllowed = employee.active && availableEmployees.length === 0;
                return (
                  <button
                    key={employee.id}
                    className={cx(
                      "rounded-md border p-3 text-left transition disabled:cursor-not-allowed disabled:opacity-50",
                      overrideAllowed ? "border-warn bg-warn/10 hover:bg-warn/15" : "border-line bg-paper"
                    )}
                    disabled={!overrideAllowed}
                    onClick={() => onAssign(employee.id)}
                    type="button"
                  >
                    <span className="block font-black">{employee.name}</span>
                    <span className="mt-1 block text-sm text-ink/65">{status.reason}</span>
                    {overrideAllowed && <span className="mt-2 block text-xs font-bold text-warn">Override allowed because nobody is available</span>}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </Section>
  );
}

function AvailabilityEntryCard({
  entry,
  onRemove
}: {
  entry: Unavailability;
  onRemove?: () => void;
}) {
  return (
    <div className="rounded-lg border border-line bg-paper p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-bold">{getDayName(entry.date)}</div>
          <div className="mt-1 text-sm text-ink/65">
            {entry.allDay ? "Full day unavailable" : `${formatTime(entry.startTime ?? "00:00")}-${formatTime(entry.endTime ?? "00:00")}`}
          </div>
          {entry.note ? <div className="mt-1 text-sm text-ink/60">{entry.note}</div> : null}
        </div>
        {onRemove && (
          <button
            className="grid size-8 shrink-0 place-items-center rounded-md text-ink/55 hover:bg-white hover:text-ink"
            onClick={onRemove}
            title="Remove unavailable day"
            type="button"
          >
            <X size={15} />
          </button>
        )}
      </div>
    </div>
  );
}

function ShiftList({
  shifts,
  onRequestCoverage
}: {
  shifts: Shift[];
  onRequestCoverage: (shiftId: string) => void;
}) {
  if (shifts.length === 0) {
    return <div className="rounded-lg border border-dashed border-line p-6 text-sm text-ink/60">No assigned shifts for this period.</div>;
  }

  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {shifts.map((shift) => (
        <div key={shift.id} className="rounded-lg border border-line p-4">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="font-black">{getDayName(shift.date)}</div>
              <div className="text-sm text-ink/65">
                {formatTime(shift.startTime)}-{formatTime(shift.endTime)}
              </div>
            </div>
            <Badge>{shiftDurationHours(shift).toFixed(1)}h</Badge>
          </div>
          <div className="mt-3 text-sm text-ink/65">{shift.roleLabel}</div>
          <Button variant="secondary" className="mt-3 w-full" onClick={() => onRequestCoverage(shift.id)}>
            <Mail size={16} />
            Request coverage
          </Button>
        </div>
      ))}
    </div>
  );
}
