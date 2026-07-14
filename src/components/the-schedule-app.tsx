"use client";

import {
  AlertTriangle,
  CalendarDays,
  Check,
  ClipboardList,
  Clock,
  Download,
  FileText,
  Mail,
  Moon,
  Plus,
  Printer,
  RefreshCw,
  Repeat2,
  Send,
  Settings,
  ShieldCheck,
  Sun,
  UserPlus,
  Users,
  X
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
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
  availabilitySubmissions,
  coverageRequests,
  employees,
  formatTime,
  generateDefaultShifts,
  getDatesInPeriod,
  getDayName,
  initialAuditLog,
  initialShifts,
  isEmployeeUnavailable,
  schedulePeriod,
  shiftDurationHours,
  shiftTemplates,
  swapRequests,
  store,
  storeHours,
  templatePatternForDate,
  toMinutes,
  type NotificationEntry
} from "@/lib/demo-data";
import {
  STORAGE_KEY,
  TEST_TODAY,
  type InviteAcceptance,
  type StoredTestState,
  type ThemePreference,
  type UatIssue,
  type UatIssueCategory,
  type UserPreference
} from "@/lib/test-state-shared";

type TabId =
  | "dashboard"
  | "employees"
  | "availability"
  | "builder"
  | "requests"
  | "reports"
  | "settings"
  | "issues"
  | "notifications"
  | "my-shifts"
  | "team"
  | "submit";

type EmployeeForm = {
  firstName: string;
  lastName: string;
  email: string;
};

type PersistenceStatus = "loading" | "saving" | "saved" | "local" | "error";
type ScenarioPreset = "fresh" | "availability" | "draft" | "published";

const issueCategories: Array<{ id: UatIssueCategory; label: string }> = [
  { id: "ui", label: "UI" },
  { id: "calendar", label: "Calendar" },
  { id: "availability", label: "Availability" },
  { id: "schedule_builder", label: "Schedule builder" },
  { id: "notifications", label: "Notifications" },
  { id: "employee_invite", label: "Employee invite" },
  { id: "mobile", label: "Mobile" },
  { id: "other", label: "Other" }
];

const buttonBase =
  "inline-flex h-9 items-center justify-center gap-2 rounded-md border px-3 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50";
const inputBase =
  "h-9 w-full rounded-md border border-line bg-white px-3 text-sm text-ink shadow-sm placeholder:text-ink/35";
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

function employeeNameParts(name: string): Pick<EmployeeForm, "firstName" | "lastName"> {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return { firstName: parts[0] ?? "", lastName: "" };
  return {
    firstName: parts.slice(0, -1).join(" "),
    lastName: parts.at(-1) ?? ""
  };
}

function employeeFullName(form: EmployeeForm) {
  return `${form.firstName.trim()} ${form.lastName.trim()}`.trim();
}

function isValidTimeRange(startTime?: string, endTime?: string) {
  if (!startTime || !endTime) return false;
  return toMinutes(endTime) > toMinutes(startTime);
}

function sortUnavailableEntries(entries: Unavailability[]) {
  return [...entries].sort((a, b) => `${a.date}${a.startTime ?? ""}`.localeCompare(`${b.date}${b.startTime ?? ""}`));
}

function addDays(date: string, days: number) {
  const next = parseLocalDate(date);
  next.setDate(next.getDate() + days);
  return dateToIso(next);
}

function availabilityDeadlineForReleaseDate(releaseDate: string) {
  return addDays(releaseDate, -2);
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

function sanitizeFilename(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "schedule";
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function bytesFromString(value: string) {
  return Uint8Array.from(value, (char) => char.charCodeAt(0));
}

function bytesFromDataUrl(dataUrl: string) {
  const base64 = dataUrl.split(",")[1] ?? "";
  const binary = window.atob(base64);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function concatBytes(chunks: Uint8Array[]) {
  const length = chunks.reduce((total, chunk) => total + chunk.length, 0);
  const output = new Uint8Array(length);
  let offset = 0;
  chunks.forEach((chunk) => {
    output.set(chunk, offset);
    offset += chunk.length;
  });
  return output;
}

function buildPdfFromJpeg(jpegBytes: Uint8Array, widthPx: number, heightPx: number) {
  const widthPt = Math.max(1, Math.round(widthPx * 0.75));
  const heightPt = Math.max(1, Math.round(heightPx * 0.75));
  const objects: Uint8Array[] = [];

  const content = `q\n${widthPt} 0 0 ${heightPt} 0 0 cm\n/Im0 Do\nQ\n`;
  objects.push(bytesFromString("1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n"));
  objects.push(bytesFromString("2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n"));
  objects.push(bytesFromString(`3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${widthPt} ${heightPt}] /Resources << /XObject << /Im0 5 0 R >> >> /Contents 4 0 R >>\nendobj\n`));
  objects.push(bytesFromString(`4 0 obj\n<< /Length ${content.length} >>\nstream\n${content}endstream\nendobj\n`));
  objects.push(concatBytes([
    bytesFromString(`5 0 obj\n<< /Type /XObject /Subtype /Image /Width ${widthPx} /Height ${heightPx} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpegBytes.length} >>\nstream\n`),
    jpegBytes,
    bytesFromString("\nendstream\nendobj\n")
  ]));

  const chunks: Uint8Array[] = [bytesFromString("%PDF-1.4\n")];
  const offsets = [0];
  objects.forEach((object) => {
    offsets.push(chunks.reduce((total, chunk) => total + chunk.length, 0));
    chunks.push(object);
  });
  const xrefOffset = chunks.reduce((total, chunk) => total + chunk.length, 0);
  const xrefRows = offsets
    .map((offset, index) => (index === 0 ? "0000000000 65535 f \n" : `${String(offset).padStart(10, "0")} 00000 n \n`))
    .join("");
  chunks.push(bytesFromString(`xref\n0 ${objects.length + 1}\n${xrefRows}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`));

  return new Blob([concatBytes(chunks)], { type: "application/pdf" });
}

function shiftAssigneeLabel(shift: Shift, people: Employee[]) {
  return shift.externalAssigneeName?.trim() || people.find((employee) => employee.id === shift.employeeId)?.name || "Unassigned";
}

function drawRoundedRect(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  context.beginPath();
  context.moveTo(x + radius, y);
  context.lineTo(x + width - radius, y);
  context.quadraticCurveTo(x + width, y, x + width, y + radius);
  context.lineTo(x + width, y + height - radius);
  context.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  context.lineTo(x + radius, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - radius);
  context.lineTo(x, y + radius);
  context.quadraticCurveTo(x, y, x + radius, y);
  context.closePath();
}

function drawText(context: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number) {
  const trimmed = text.length > 42 ? `${text.slice(0, 39)}...` : text;
  context.fillText(trimmed, x, y, maxWidth);
}

function renderScheduleCanvas(title: string, calendarWeeks: ReturnType<typeof buildCalendarWeeks>, people: Employee[]) {
  const scale = Math.min(2, window.devicePixelRatio || 1);
  const width = 1400;
  const headerHeight = 92;
  const dayHeaderHeight = 34;
  const cellWidth = width / 7;
  const cellHeight = 190;
  const height = headerHeight + dayHeaderHeight + calendarWeeks.length * cellHeight + 28;
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Unable to create schedule export.");
  context.scale(scale, scale);

  context.fillStyle = "#f6f8fc";
  context.fillRect(0, 0, width, height);
  context.fillStyle = "#ffffff";
  drawRoundedRect(context, 18, 18, width - 36, height - 36, 8);
  context.fill();
  context.strokeStyle = "#d7dee8";
  context.lineWidth = 1;
  context.stroke();

  context.fillStyle = "#141822";
  context.font = "800 26px Arial, sans-serif";
  context.fillText(title, 42, 54);
  context.font = "600 14px Arial, sans-serif";
  context.fillStyle = "#667085";
  context.fillText("The Schedule", 42, 78);

  const weekdayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  context.fillStyle = "#0f62a3";
  context.fillRect(18, headerHeight, width - 36, dayHeaderHeight);
  weekdayLabels.forEach((label, index) => {
    context.fillStyle = "#ffffff";
    context.font = "800 13px Arial, sans-serif";
    context.fillText(label.toUpperCase(), 34 + index * cellWidth, headerHeight + 22);
  });

  calendarWeeks.forEach((week, weekIndex) => {
    week.forEach((day, dayIndex) => {
      const x = 18 + dayIndex * cellWidth;
      const y = headerHeight + dayHeaderHeight + weekIndex * cellHeight;
      context.fillStyle = day.inPeriod ? "#ffffff" : "#f1f4f8";
      context.fillRect(x, y, cellWidth, cellHeight);
      context.strokeStyle = "#d7dee8";
      context.strokeRect(x, y, cellWidth, cellHeight);

      context.fillStyle = day.inPeriod ? "#141822" : "#98a2b3";
      context.font = "800 16px Arial, sans-serif";
      context.fillText(shortDayLabel(day.date), x + 12, y + 24);

      day.shifts.slice(0, 4).forEach((shift, shiftIndex) => {
        const chipY = y + 42 + shiftIndex * 33;
        context.fillStyle = shift.employeeId || shift.externalAssigneeName ? "#e9f8f5" : "#f6f8fc";
        drawRoundedRect(context, x + 10, chipY, cellWidth - 20, 27, 6);
        context.fill();
        context.strokeStyle = shift.externalAssigneeName ? "#f5ab45" : shift.employeeId ? "#6dd78d" : "#d7dee8";
        context.stroke();

        context.fillStyle = "#141822";
        context.font = "800 11px Arial, sans-serif";
        drawText(context, `${formatTime(shift.startTime)}-${formatTime(shift.endTime)}`, x + 18, chipY + 11, cellWidth - 36);
        context.fillStyle = "#475467";
        context.font = "600 11px Arial, sans-serif";
        drawText(context, shiftAssigneeLabel(shift, people), x + 18, chipY + 23, cellWidth - 36);
      });

      if (day.shifts.length > 4) {
        context.fillStyle = "#667085";
        context.font = "700 11px Arial, sans-serif";
        context.fillText(`+${day.shifts.length - 4} more`, x + 14, y + 180);
      }
    });
  });

  return canvas;
}

async function downloadScheduleSnapshot(title: string, calendarWeeks: ReturnType<typeof buildCalendarWeeks>, people: Employee[], format: "png" | "pdf") {
  await document.fonts?.ready;
  const canvas = renderScheduleCanvas(title, calendarWeeks, people);
  const filename = sanitizeFilename(title);

  if (format === "png") {
    canvas.toBlob((blob) => {
      if (blob) downloadBlob(blob, `${filename}.png`);
    }, "image/png");
    return;
  }

  const jpegUrl = canvas.toDataURL("image/jpeg", 0.94);
  downloadBlob(buildPdfFromJpeg(bytesFromDataUrl(jpegUrl), canvas.width, canvas.height), `${filename}.pdf`);
}

function Badge({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "neutral" | "good" | "warn" | "danger" }) {
  return (
    <span
      className={cx(
        "inline-flex min-h-6 items-center rounded-md border px-2 text-xs font-semibold",
        tone === "neutral" && "border-line bg-white text-ink",
        tone === "good" && "border-approve/30 bg-approve/10 text-approve",
        tone === "warn" && "border-warn/35 bg-warn/10 text-warn",
        tone === "danger" && "border-red-500/40 bg-red-500/10 text-red-600"
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
        variant === "ghost" && "border-transparent bg-transparent text-ink hover:bg-paper",
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
  className,
  captureRef
}: {
  title: string;
  icon: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  captureRef?: React.RefObject<HTMLElement | null>;
}) {
  return (
    <section ref={captureRef} className={cx("print-surface min-w-0 rounded-lg border border-line bg-white shadow-panel", className)}>
      <div className="flex min-h-12 items-center justify-between gap-3 border-b border-line px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="grid size-8 shrink-0 place-items-center rounded-md bg-mall/10 text-mall">{icon}</span>
          <h2 className="truncate text-base font-bold text-ink">{title}</h2>
        </div>
        {action ? <div className="no-export">{action}</div> : null}
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
    <div className="rounded-lg border border-line bg-white p-4 shadow-panel">
      <div className="text-xs font-semibold uppercase tracking-normal text-ink/55">{label}</div>
      <div className={cx("mt-2 text-2xl font-black", tone === "good" && "text-approve", tone === "warn" && "text-warn")}>
        {value}
      </div>
      <div className="mt-1 text-sm text-ink/65">{detail}</div>
    </div>
  );
}

function ScheduleExportButtons({
  title,
  calendarWeeks,
  people
}: {
  title: string;
  calendarWeeks: ReturnType<typeof buildCalendarWeeks>;
  people: Employee[];
}) {
  const [exporting, setExporting] = useState<"png" | "pdf" | null>(null);

  async function exportSchedule(format: "png" | "pdf") {
    setExporting(format);
    try {
      await downloadScheduleSnapshot(title, calendarWeeks, people, format);
    } catch {
      window.alert("The schedule export could not be created. Try again after the schedule finishes rendering.");
    } finally {
      setExporting(null);
    }
  }

  return (
    <div className="flex flex-wrap gap-2">
      <Button variant="secondary" onClick={() => void exportSchedule("png")} disabled={exporting !== null}>
        <Download size={16} />
        {exporting === "png" ? "Exporting" : "Image"}
      </Button>
      <Button variant="secondary" onClick={() => void exportSchedule("pdf")} disabled={exporting !== null}>
        <FileText size={16} />
        {exporting === "pdf" ? "Exporting" : "PDF"}
      </Button>
    </div>
  );
}

export function TheScheduleApp() {
  const [mode, setMode] = useState<"manager" | "employee">("manager");
  const [activeTab, setActiveTab] = useState<TabId>("dashboard");
  const [activeEmployeeId, setActiveEmployeeId] = useState("emp_manager");
  const [people, setPeople] = useState<Employee[]>(employees);
  const [period, setPeriod] = useState<SchedulePeriod>(schedulePeriod);
  const [shifts, setShifts] = useState<Shift[]>(() => generateDefaultShifts(schedulePeriod));
  const [availability, setAvailability] = useState<AvailabilitySubmission[]>([]);
  const [coverage, setCoverage] = useState<CoverageRequest[]>([]);
  const [swaps, setSwaps] = useState<SwapRequest[]>([]);
  const [auditLog, setAuditLog] = useState<AuditEntry[]>(DEFAULT_AUDIT_LOG);
  const [notifications, setNotifications] = useState<NotificationEntry[]>([]);
  const [availabilityDrafts, setAvailabilityDrafts] = useState<Record<string, Unavailability[]>>({});
  const [preferences, setPreferences] = useState<Record<string, UserPreference>>({});
  const [uatIssues, setUatIssues] = useState<UatIssue[]>([]);
  const [inviteAcceptances, setInviteAcceptances] = useState<InviteAcceptance[]>([]);
  const [hasLoadedStoredState, setHasLoadedStoredState] = useState(false);
  const [persistenceStatus, setPersistenceStatus] = useState<PersistenceStatus>("loading");
  const [testEmailStatus, setTestEmailStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [selectedShiftId, setSelectedShiftId] = useState<string | null>(null);
  const [showOnlyUnassigned, setShowOnlyUnassigned] = useState(false);
  const [showIssueReporter, setShowIssueReporter] = useState(false);
  const [showPublishReview, setShowPublishReview] = useState(false);
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
  const [newEmployee, setNewEmployee] = useState<EmployeeForm>({
    firstName: "",
    lastName: "",
    email: ""
  });
  const [editingEmployeeId, setEditingEmployeeId] = useState<string | null>(null);
  const [employeeEdit, setEmployeeEdit] = useState<EmployeeForm>({
    firstName: "",
    lastName: "",
    email: ""
  });
  const [issueForm, setIssueForm] = useState({
    category: "ui" as UatIssueCategory,
    note: ""
  });

  const nameFor = (id?: string) => id === "owner_alert" ? "Application Owner" : people.find((employee) => employee.id === id)?.name ?? "Unassigned";
  const managerIdentity = people.find((employee) => employee.role === "manager") ?? people[0];
  const activeEmployee = people.find((employee) => employee.id === activeEmployeeId) ?? managerIdentity;
  const activeEmployees = people.filter((employee) => employee.active);
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
  const activeAvailabilityDraft = sortUnavailableEntries(availabilityDrafts[activeEmployee.id] ?? []);
  const submittedIds = new Set(availability.filter((submission) => submission.submittedAt).map((submission) => submission.userId));
  const invitedEmployees = notifications.filter((entry) => entry.type === "employee_invited").length;
  const hasAcceptedInvite = (employeeId: string) => inviteAcceptances.some((acceptance) => acceptance.employeeId === employeeId);
  const hasInviteSent = (employeeId: string) =>
    notifications.some((entry) => entry.type === "employee_invited" && entry.userId === employeeId);
  const inviteStatusFor = (employee: Employee) => {
    if (employee.role === "manager" || hasAcceptedInvite(employee.id)) return "active" as const;
    if (hasInviteSent(employee.id) || employee.active) return "invited" as const;
    return "inactive" as const;
  };
  const activeInviteStatus = inviteStatusFor(activeEmployee);
  const activeInviteAccepted = activeInviteStatus === "active";
  const schedulableEmployees = activeEmployees.filter((employee) => inviteStatusFor(employee) === "active");
  const schedulableSubmittedIds = new Set(
    availability
      .filter((submission) => submission.submittedAt && schedulableEmployees.some((employee) => employee.id === submission.userId))
      .map((submission) => submission.userId)
  );
  const missingAvailability = schedulableEmployees.filter((employee) => !submittedIds.has(employee.id));
  const activeEmployeeNeedsAvailability = activeInviteAccepted && !submittedIds.has(activeEmployee.id);
  const myShifts = shifts
    .filter((shift) => shift.employeeId === activeEmployee.id)
    .sort((a, b) => `${a.date}${a.startTime}`.localeCompare(`${b.date}${b.startTime}`));
  const openCoverage = coverage.filter((request) => request.status === "open" || request.status === "offered");
  const pendingManagerRequests =
    coverage.filter((request) => request.status === "offered").length +
    swaps.filter((request) => request.status === "pending_manager_approval").length;
  const employeeCoverageAlerts = openCoverage.filter((request) => {
    const shift = shifts.find((item) => item.id === request.shiftId);
    return shift && request.requestedById !== activeEmployee.id && shift.employeeId !== activeEmployee.id;
  });
  const employeeSwapAlerts = swaps.filter(
    (request) => request.targetEmployeeId === activeEmployee.id && request.status === "pending_employee_response"
  );
  const activeEmployeeRequestCount = employeeCoverageAlerts.length + employeeSwapAlerts.length;
  const selectedShift = shifts.find((shift) => shift.id === selectedShiftId) ?? null;
  const unassignedShifts = shifts.filter((shift) => !shift.employeeId);
  const assignedPendingInviteShifts = shifts.filter((shift) => {
    const employee = shift.employeeId ? people.find((person) => person.id === shift.employeeId) : undefined;
    return employee ? inviteStatusFor(employee) !== "active" : false;
  });
  const assignedConflictShifts = shifts.filter((shift) =>
    shift.employeeId ? isEmployeeUnavailable(shift.employeeId, shift, availability) : false
  );
  const openUatIssues = uatIssues.filter((issue) => issue.status === "open");
  const resolvedUatIssues = uatIssues.filter((issue) => issue.status === "resolved");
  const availableShiftTemplates = useMemo(
    () => shiftTemplates.filter((template) => template.dayPattern === templatePatternForDate(availabilityForm.date) && template.active),
    [availabilityForm.date]
  );
  const testTodayIso = dateToIso(new Date(TEST_TODAY));
  const canChangeAvailability = parseLocalDate(testTodayIso) <= parseLocalDate(period.availabilityDeadlineAt);
  const canAutoAssignSchedule = schedulableEmployees.length > 0 && missingAvailability.length === 0;
  const publishWarnings = [
    shifts.length === 0 ? "Generate or add at least one shift before publishing." : "",
    missingAvailability.length > 0 ? `${missingAvailability.length} employee${missingAvailability.length === 1 ? " has" : "s have"} not submitted availability.` : "",
    unassignedShifts.length > 0 ? `${unassignedShifts.length} shift${unassignedShifts.length === 1 ? " is" : "s are"} unassigned.` : "",
    assignedPendingInviteShifts.length > 0 ? `${assignedPendingInviteShifts.length} shift${assignedPendingInviteShifts.length === 1 ? " is" : "s are"} assigned to invited employees.` : "",
    assignedConflictShifts.length > 0 ? `${assignedConflictShifts.length} assigned shift${assignedConflictShifts.length === 1 ? " conflicts" : "s conflict"} with submitted availability.` : ""
  ].filter(Boolean);
  const uatItems = [
    { label: "Invite employee", done: invitedEmployees > 0 },
    { label: "Submit availability", done: schedulableSubmittedIds.size > 0 },
    { label: "Submit no days", done: availability.some((submission) => submission.submittedAt && submission.unavailable.length === 0) },
    { label: "Auto complete names", done: shifts.length > 0 && unassignedShifts.length === 0 },
    { label: "Assign shifts", done: shifts.length > 0 && unassignedShifts.length === 0 },
    { label: "Publish schedule", done: period.status === "published" },
    { label: "Request coverage", done: coverage.length > 0 },
    { label: "Test swap", done: swaps.length > 0 || swaps.some((swap) => swap.status === "approved") },
    { label: "Accept invite", done: inviteAcceptances.length > 0 },
    { label: "Resolve issue", done: uatIssues.length > 0 && resolvedUatIssues.length > 0 }
  ];
  const completedUatItems = uatItems.filter((item) => item.done).length;
  const currentIdentity = mode === "manager" ? managerIdentity : activeEmployee;
  const currentTheme: ThemePreference = preferences[currentIdentity?.id ?? "default"]?.theme ?? "light";
  const notificationPreviews = [
    {
      type: "employee_invited",
      subject: `Join ${store.name} on The Schedule`,
      recipient: "New employee",
      body: `Invite link for ${store.name}.`
    },
    {
      type: "availability_submitted",
      subject: `${activeEmployee.name} submitted availability`,
      recipient: "Manager",
      body: "Submission alert."
    },
    {
      type: "availability_reminder",
      subject: `Availability due ${period.availabilityDeadlineAt}`,
      recipient: "Employees",
      body: `Reminder before the ${period.releaseDate} schedule due date.`
    },
    {
      type: "schedule_published",
      subject: `New schedule published: ${period.name}`,
      recipient: "Assigned employees",
      body: "Schedule and shift details."
    },
    {
      type: "coverage_opened",
      subject: "A shift is open for coverage",
      recipient: "Other employees",
      body: "Open coverage alert."
    },
    {
      type: "swap_requested",
      subject: `${activeEmployee.name} requested a shift swap`,
      recipient: "Target employee",
      body: "Accept or decline request."
    },
    {
      type: "manager_review",
      subject: "A request needs manager review",
      recipient: "Manager",
      body: "Approval needed."
    },
    {
      type: "uat_issue_reported",
      subject: "[The Schedule] UAT issue reported",
      recipient: "Application owner",
      body: "Owner alert."
    },
    {
      type: "software_outage",
      subject: "[The Schedule] Software needs attention",
      recipient: "Application owner",
      body: "Delivery failure alert."
    }
  ];
  const testStep =
    period.status === "published"
      ? "Schedule published"
      : shifts.length > 0
        ? "Manager builds draft"
        : missingAvailability.length < schedulableEmployees.length
          ? "Collecting availability"
          : "Waiting for employee availability";
  const persistenceLabel =
    persistenceStatus === "loading"
      ? "Loading"
      : persistenceStatus === "saving"
        ? "Saving"
        : persistenceStatus === "saved"
          ? "Saved"
          : persistenceStatus === "local"
            ? "Local"
            : "Error";
  const persistenceTone = persistenceStatus === "saved" ? "good" : persistenceStatus === "error" ? "danger" : "warn";

  useEffect(() => {
    if (availabilityForm.unavailableType !== "shift_template") return;
    if (availableShiftTemplates.some((template) => template.id === availabilityForm.shiftTemplateId)) return;
    setAvailabilityForm((current) => ({
      ...current,
      shiftTemplateId: availableShiftTemplates[0]?.id ?? current.shiftTemplateId
    }));
  }, [availabilityForm.shiftTemplateId, availabilityForm.unavailableType, availableShiftTemplates]);

  useEffect(() => {
    setSwapForm({ requesterShiftId: "", targetShiftId: "", reason: "" });
  }, [activeEmployee.id]);

  useEffect(() => {
    let cancelled = false;

    function applyStoredState(stored: Partial<StoredTestState>) {
      const storedPeriod = stored.period ?? schedulePeriod;
      if (stored.people) setPeople(stored.people);
      if (stored.period) setPeriod(stored.period);
      if (stored.shifts) {
        setShifts(stored.shifts.length > 0 ? stored.shifts : generateDefaultShifts(storedPeriod));
      }
      if (stored.availability) setAvailability(stored.availability);
      if (stored.coverage) setCoverage(stored.coverage);
      if (stored.swaps) setSwaps(stored.swaps);
      if (stored.auditLog) setAuditLog(stored.auditLog);
      if (stored.notifications) setNotifications(stored.notifications);
      if (stored.availabilityDrafts) setAvailabilityDrafts(stored.availabilityDrafts);
      if (stored.preferences) setPreferences(stored.preferences);
      if (stored.uatIssues) setUatIssues(stored.uatIssues);
      if (stored.inviteAcceptances) setInviteAcceptances(stored.inviteAcceptances);
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
      availabilityDrafts,
      preferences,
      uatIssues,
      inviteAcceptances
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
        setPersistenceStatus(response.headers.get("X-Test-State-Persisted") === "false" ? "local" : "saved");
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setPersistenceStatus("local");
      });

    return () => controller.abort();
  }, [auditLog, availability, availabilityDrafts, coverage, hasLoadedStoredState, inviteAcceptances, notifications, people, period, preferences, shifts, swaps, uatIssues]);

  useEffect(() => {
    document.documentElement.dataset.theme = currentTheme;
    window.localStorage.setItem("the-schedule-theme", currentTheme);
  }, [currentTheme]);

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

  function setThemePreference(theme: ThemePreference) {
    const identityId = currentIdentity?.id ?? "default";
    setPreferences((current) => ({
      ...current,
      [identityId]: {
        ...(current[identityId] ?? {}),
        theme
      }
    }));
  }

  function submitUatIssue() {
    const note = issueForm.note.trim();
    if (!note) return;

    const issue: UatIssue = {
      id: `uat_${Date.now()}`,
      category: issueForm.category,
      note,
      status: "open",
      reportedById: currentIdentity?.id,
      role: mode,
      activeEmployeeId: mode === "employee" ? activeEmployee.id : undefined,
      activeTab,
      storeName: store.name,
      theme: currentTheme,
      createdAt: new Date().toISOString()
    };

    setUatIssues((current) => [issue, ...current]);
    setIssueForm({ category: "ui", note: "" });
    setShowIssueReporter(false);
    addAudit("uat_issue_reported", "UatIssue", issue.id, `Reported ${issueCategories.find((item) => item.id === issue.category)?.label ?? issue.category} issue.`);
    sendOwnerAlert(
      "uat_issue_reported",
      "UAT issue reported",
      [
        { label: "Category", value: issueCategories.find((item) => item.id === issue.category)?.label ?? issue.category },
        { label: "Reporter", value: currentIdentity?.name ?? "Unknown user" },
        { label: "Mode", value: mode },
        { label: "Employee", value: issue.activeEmployeeId ? nameFor(issue.activeEmployeeId) : "Manager" },
        { label: "Active tab", value: issue.activeTab },
        { label: "Theme", value: issue.theme },
        { label: "Store", value: issue.storeName },
        { label: "Issue", value: issue.note },
        { label: "Reported at", value: issue.createdAt }
      ]
    );
  }

  function setUatIssueStatus(issueId: string, status: UatIssue["status"]) {
    setUatIssues((current) =>
      current.map((issue) =>
        issue.id === issueId
          ? {
              ...issue,
              status,
              resolvedAt: status === "resolved" ? new Date().toISOString() : undefined
            }
          : issue
      )
    );
  }

  function exportUatIssues(format: "csv" | "json") {
    const filename = `the-schedule-uat-issues.${format}`;
    const content =
      format === "json"
        ? JSON.stringify(uatIssues, null, 2)
        : [
            ["Status", "Category", "Note", "Role", "Active employee", "Tab", "Theme", "Created", "Resolved"],
            ...uatIssues.map((issue) => [
              issue.status,
              issue.category,
              issue.note,
              issue.role,
              issue.activeEmployeeId ? nameFor(issue.activeEmployeeId) : "",
              issue.activeTab,
              issue.theme,
              issue.createdAt,
              issue.resolvedAt ?? ""
            ])
          ]
            .map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(","))
            .join("\n");
    const url = URL.createObjectURL(new Blob([content], { type: format === "json" ? "application/json" : "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  }

  function acceptInviteForActiveEmployee() {
    if (activeInviteAccepted) return;

    const acceptance: InviteAcceptance = {
      id: `invite_acceptance_${Date.now()}`,
      employeeId: activeEmployee.id,
      acceptedAt: new Date().toISOString(),
      email: activeEmployee.email,
      name: activeEmployee.name
    };

    setInviteAcceptances((current) => [acceptance, ...current]);
    addNotification(
      "employee_invite_accepted",
      `${activeEmployee.name} accepted the invite`,
      "emp_manager",
      buildNotificationHtml(`${activeEmployee.name} accepted the invite`, `${activeEmployee.name} confirmed access to ${store.name}.`)
    );
    addAudit("employee_invite_accepted", "User", activeEmployee.id, `${activeEmployee.name} accepted the employee invite.`, activeEmployee.id);
  }

  function buildNotificationHtml(subject: string, detail: string, actionLabel = "Open The Schedule") {
    return `
      <h1>${subject}</h1>
      <p>${detail}</p>
      <p><a href="${window.location.origin}">${actionLabel}</a></p>
    `;
  }

  function escapeHtml(value: string) {
    return value
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function buildOwnerAlertHtml(title: string, rows: Array<{ label: string; value: string }>) {
    return `
      <h1>${escapeHtml(title)}</h1>
      <p>The Schedule needs attention.</p>
      <table cellpadding="6" cellspacing="0" style="border-collapse: collapse;">
        ${rows
          .map(
            (row) => `
              <tr>
                <td style="font-weight: 700; border-bottom: 1px solid #ddd;">${escapeHtml(row.label)}</td>
                <td style="border-bottom: 1px solid #ddd;">${escapeHtml(row.value)}</td>
              </tr>
            `
          )
          .join("")}
        <tr>
          <td style="font-weight: 700; border-bottom: 1px solid #ddd;">App URL</td>
          <td style="border-bottom: 1px solid #ddd;"><a href="${window.location.origin}">${window.location.origin}</a></td>
        </tr>
      </table>
    `;
  }

  function sendOwnerAlert(type: string, title: string, rows: Array<{ label: string; value: string }>) {
    const id = `owner_alert_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    const subject = `[The Schedule] ${title}`;

    setNotifications((current) => [
      {
        id,
        userId: "owner_alert",
        type,
        subject,
        status: "queued",
        createdAt: new Date().toISOString()
      },
      ...current
    ]);

    void fetch("/api/notifications/test-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id,
        ownerAlert: true,
        type,
        subject,
        html: buildOwnerAlertHtml(title, rows),
        skipLog: true
      })
    })
      .then((response) => {
        if (!response.ok) throw new Error("Unable to queue owner alert.");
        return response.json() as Promise<{ notification: NotificationEntry }>;
      })
      .then((result) => {
        setNotifications((current) =>
          current.map((entry) => (entry.id === id ? { ...entry, status: result.notification.status } : entry))
        );
      })
      .catch(() => {
        setNotifications((current) => current.map((entry) => (entry.id === id ? { ...entry, status: "failed" } : entry)));
      });
  }

  function addNotification(
    type: string,
    subject: string,
    userId?: string,
    html?: string,
    directRecipient?: { to: string; recipientName: string },
    sendEmail = true
  ) {
    const id = `note_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    setNotifications((current) => [
      {
        id,
        userId,
        type,
        subject,
        status: "queued",
        createdAt: new Date().toISOString()
      },
      ...current
    ]);

    if (!sendEmail) return id;

    void fetch("/api/notifications/test-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id,
        userId,
        to: directRecipient?.to,
        recipientName: directRecipient?.recipientName,
        type,
        subject,
        html:
          html ??
          buildNotificationHtml(
            subject,
            `${currentIdentity?.name ?? "The manager"} sent this ${type.replaceAll("_", " ")} notification for ${period.name}.`
          ),
        skipLog: true
      })
    })
      .then((response) => {
        if (!response.ok) throw new Error("Unable to queue Gmail notification.");
        return response.json() as Promise<{ notification: NotificationEntry }>;
      })
      .then((result) => {
        setNotifications((current) =>
          current.map((entry) => (entry.id === id ? { ...entry, status: result.notification.status } : entry))
        );
      })
      .catch(() => {
        setNotifications((current) => current.map((entry) => (entry.id === id ? { ...entry, status: "failed" } : entry)));
        sendOwnerAlert("software_outage", "Notification API unavailable", [
          { label: "Notification type", value: type },
          { label: "Subject", value: subject },
          { label: "Recipient", value: directRecipient ? directRecipient.to : userId ? nameFor(userId) : currentIdentity?.name ?? "Unknown recipient" },
          { label: "Schedule period", value: period.name },
          { label: "Detected at", value: new Date().toISOString() }
        ]);
      });

    return id;
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
      sendOwnerAlert("software_outage", "Test notification failed", [
        { label: "Recipient", value: userId ? nameFor(userId) : "Unknown recipient" },
        { label: "Schedule period", value: period.name },
        { label: "Detected at", value: new Date().toISOString() }
      ]);
    }
  }

  function assignShift(shiftId: string, employeeId: string) {
    const target = shifts.find((shift) => shift.id === shiftId);
    if (!target) return;

    if (!employeeId) {
      setShifts((current) => current.map((shift) => (shift.id === shiftId ? { ...shift, employeeId: undefined, externalAssigneeName: undefined } : shift)));
      addAudit("shift_unassigned", "Shift", shiftId, `Unassigned ${getDayName(target.date)} ${formatTime(target.startTime)}.`);
      if (target.employeeId) {
        addNotification(
          "shift_unassigned",
          `Shift removed: ${getDayName(target.date)}`,
          target.employeeId,
          buildNotificationHtml(
            `Shift removed: ${getDayName(target.date)}`,
            `Your ${formatTime(target.startTime)}-${formatTime(target.endTime)} shift was removed from ${period.name}.`
          )
        );
      }
      return;
    }

    const selected = schedulableEmployees.find((employee) => employee.id === employeeId);
    if (!selected || !selected.active) return;

    const unavailable = isEmployeeUnavailable(employeeId, target, availability);
    const available = availableEmployeesForShift(target, schedulableEmployees, availability);

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

    setShifts((current) => current.map((shift) => (shift.id === shiftId ? { ...shift, employeeId, externalAssigneeName: undefined } : shift)));
    addNotification(
      "shift_assigned",
      `Shift assigned: ${getDayName(target.date)}`,
      employeeId,
      buildNotificationHtml(
        `Shift assigned: ${getDayName(target.date)}`,
        `You were assigned ${formatTime(target.startTime)}-${formatTime(target.endTime)} on ${getDayName(target.date)}.`
      )
    );
    addAudit("shift_assigned", "Shift", shiftId, `Assigned ${selected.name} to ${getDayName(target.date)}.`);
  }

  function autoAssignDraft(
    generated: Shift[],
    sourcePeople = schedulableEmployees,
    sourceAvailability = availability
  ) {
    const totals = new Map(sourcePeople.map((employee) => [employee.id, { shifts: 0, hours: 0 }]));
    generated.forEach((shift) => {
      if (!shift.employeeId || !totals.has(shift.employeeId)) return;
      const current = totals.get(shift.employeeId) ?? { shifts: 0, hours: 0 };
      totals.set(shift.employeeId, {
        shifts: current.shifts + 1,
        hours: current.hours + shiftDurationHours(shift)
      });
    });

    return generated.map((shift) => {
      if (shift.employeeId || shift.externalAssigneeName) return shift;

      const candidates = sourcePeople
        .filter((employee) => employee.active && !isEmployeeUnavailable(employee.id, shift, sourceAvailability))
        .map((employee) => {
          const total = totals.get(employee.id) ?? { shifts: 0, hours: 0 };
          return {
            employee,
            shifts: total.shifts,
            hours: total.hours,
            tieBreaker: Math.random()
          };
        })
        .sort((a, b) => a.shifts - b.shifts || a.hours - b.hours || a.tieBreaker - b.tieBreaker);

      const selected = candidates[0]?.employee;
      if (!selected) return shift;

      const current = totals.get(selected.id) ?? { shifts: 0, hours: 0 };
      totals.set(selected.id, {
        shifts: current.shifts + 1,
        hours: current.hours + shiftDurationHours(shift)
      });

      return {
        ...shift,
        employeeId: selected.id
      };
    });
  }

  function generateDraft() {
    const existingBlocks = shifts.length > 0 ? shifts : generateDefaultShifts(period);
    const generated = canAutoAssignSchedule ? autoAssignDraft(existingBlocks) : existingBlocks;
    setShifts(generated);
    setSelectedShiftId(generated[0]?.id ?? null);
    setPeriod((current) => ({ ...current, status: "draft", publishedAt: undefined }));
    addNotification(
      "draft_generated",
      `Draft generated: ${period.name}`,
      "emp_manager",
      buildNotificationHtml(
        `Draft generated: ${period.name}`,
        canAutoAssignSchedule
          ? `${generated.length} shift slots kept their times and empty names were filled against availability.`
          : `${generated.length} shift slots are ready without names. Collect availability before auto-completing.`
      )
    );
    addAudit(
      "default_shifts_generated",
      "SchedulePeriod",
      period.id,
      canAutoAssignSchedule
        ? "Auto-completed employee names into the current shift slots."
        : "Kept shift slots unassigned because accepted employees have not all submitted availability."
    );
  }

  function updateScheduleReleaseDate(releaseDate: string) {
    if (!releaseDate) return;
    const availabilityDeadlineAt = availabilityDeadlineForReleaseDate(releaseDate);
    const availabilityOpenAt = addDays(availabilityDeadlineAt, -6);
    setPeriod((current) => ({
      ...current,
      releaseDate,
      availabilityDeadlineAt,
      availabilityOpenAt
    }));
    schedulableEmployees.forEach((employee) =>
      addNotification(
        "availability_reminder",
        "Availability due date updated",
        employee.id,
        buildNotificationHtml(
          "Availability due date updated",
          `Please submit availability by ${availabilityDeadlineAt}. The schedule is due ${releaseDate}.`
        )
      )
    );
    addAudit(
      "schedule_due_date_updated",
      "SchedulePeriod",
      period.id,
      `Schedule due date changed to ${releaseDate}; availability deadline changed to ${availabilityDeadlineAt}.`
    );
  }

  function addShiftForDate(date: string) {
    const template = shiftTemplates.find((item) => item.dayPattern === templatePatternForDate(date) && item.active);
    const shift: Shift = {
      id: `calendar_${date}_${Date.now()}`,
      schedulePeriodId: period.id,
      date,
      startTime: template?.startTime ?? "12:00",
      endTime: template?.endTime ?? "18:00",
      originalStartTime: template?.startTime ?? "12:00",
      originalEndTime: template?.endTime ?? "18:00"
    };

    setShifts((current) => [...current, shift].sort((a, b) => `${a.date}${a.startTime}`.localeCompare(`${b.date}${b.startTime}`)));
    setSelectedShiftId(shift.id);
    addAudit("calendar_shift_added", "Shift", shift.id, `Added shift on ${getDayName(date)}.`);
  }

  function updateShift(shiftId: string, updates: Partial<Pick<Shift, "date" | "startTime" | "endTime" | "employeeId" | "externalAssigneeName">>) {
    const target = shifts.find((shift) => shift.id === shiftId);
    if (!target) return;

    const nextStart = updates.startTime ?? target.startTime;
    const nextEnd = updates.endTime ?? target.endTime;
    if (!isValidTimeRange(nextStart, nextEnd)) {
      window.alert("End time must be later than start time.");
      return;
    }

    if (updates.employeeId !== undefined) {
      assignShift(shiftId, updates.employeeId);
    }

    if (updates.externalAssigneeName !== undefined) {
      const externalName = updates.externalAssigneeName.trim();
      setShifts((current) =>
        current.map((shift) =>
          shift.id === shiftId
            ? {
                ...shift,
                employeeId: undefined,
                externalAssigneeName: externalName || undefined
              }
            : shift
        )
      );
      if (target.employeeId && period.status === "published") {
        addNotification(
          "shift_unassigned",
          `Shift reassigned: ${getDayName(target.date)}`,
          target.employeeId,
          buildNotificationHtml(
            `Shift reassigned: ${getDayName(target.date)}`,
            `Your ${formatTime(target.startTime)}-${formatTime(target.endTime)} shift was reassigned to ${externalName || "an external helper"}.`
          )
        );
      }
      addAudit(
        "external_shift_assigned",
        "Shift",
        shiftId,
        externalName
          ? `Assigned ${externalName} as an external helper for ${getDayName(target.date)} ${formatTime(target.startTime)}.`
          : `Removed external helper from ${getDayName(target.date)} ${formatTime(target.startTime)}.`
      );
    }

    const timeOrDateChanged = updates.date !== undefined || updates.startTime !== undefined || updates.endTime !== undefined;
    if (!timeOrDateChanged) return;

    setShifts((current) =>
      current
        .map((shift) =>
          shift.id === shiftId
            ? {
                ...shift,
                date: updates.date ?? shift.date,
                startTime: nextStart,
                endTime: nextEnd
              }
            : shift
        )
        .sort((a, b) => `${a.date}${a.startTime}`.localeCompare(`${b.date}${b.startTime}`))
    );
    addAudit("shift_time_updated", "Shift", shiftId, `Updated ${getDayName(updates.date ?? target.date)} shift time.`);
    if (period.status === "published" && target.employeeId) {
      addNotification(
        "shift_updated",
        `Shift updated: ${getDayName(updates.date ?? target.date)}`,
        target.employeeId,
        buildNotificationHtml(
          `Shift updated: ${getDayName(updates.date ?? target.date)}`,
          `Your shift is now ${formatTime(nextStart)}-${formatTime(nextEnd)} on ${getDayName(updates.date ?? target.date)}.`
        )
      );
    }
  }

  function clearShiftAssignments() {
    const assignedCount = shifts.filter((shift) => shift.employeeId || shift.externalAssigneeName).length;
    if (assignedCount === 0) return;
    const confirmed = window.confirm("Clear all employee names from this draft? Shift slots will stay on the calendar.");
    if (!confirmed) return;
    setShifts((current) =>
      current.map((shift) => ({
        ...shift,
        employeeId: undefined,
        externalAssigneeName: undefined,
        originalEmployeeId: undefined
      }))
    );
    setCoverage([]);
    setSwaps([]);
    setSelectedShiftId(null);
    setShowPublishReview(false);
    addAudit("shift_assignments_cleared", "SchedulePeriod", period.id, `Cleared ${assignedCount} employee assignments. Shift slots stayed on the calendar.`);
  }

  function removeShift(shiftId: string) {
    const target = shifts.find((shift) => shift.id === shiftId);
    setShifts((current) => current.filter((shift) => shift.id !== shiftId));
    setSelectedShiftId((current) => (current === shiftId ? null : current));
    if (target) {
      if (target.employeeId) {
        addNotification(
          "shift_removed",
          `Shift removed: ${getDayName(target.date)}`,
          target.employeeId,
          buildNotificationHtml(
            `Shift removed: ${getDayName(target.date)}`,
            `Your ${formatTime(target.startTime)}-${formatTime(target.endTime)} shift was removed from ${period.name}.`
          )
        );
      }
      addAudit("shift_removed", "Shift", shiftId, `Removed ${getDayName(target.date)} ${formatTime(target.startTime)}.`);
    }
  }

  function publishSchedule() {
    if (shifts.length === 0) {
      window.alert("Generate or add shifts before publishing.");
      return;
    }

    setShowPublishReview(true);
  }

  function confirmPublishSchedule() {
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
      .forEach((shift) =>
        addNotification(
          "schedule_published",
          `New schedule published: ${period.name}`,
          shift.employeeId,
          buildNotificationHtml(
            `New schedule published: ${period.name}`,
            `Your schedule includes ${getDayName(shift.date)} ${formatTime(shift.startTime)}-${formatTime(shift.endTime)}.`
          )
        )
      );
    addAudit("schedule_published", "SchedulePeriod", period.id, `Published ${period.name}.`);
    setShowPublishReview(false);
  }

  function buildUnavailableEntry() {
    const template = shiftTemplates.find((item) => item.id === availabilityForm.shiftTemplateId);
    if (availabilityForm.unavailableType === "shift_template" && !template) {
      window.alert("Choose a shift template for that day.");
      return null;
    }
    if (
      availabilityForm.unavailableType === "custom_time_range" &&
      !isValidTimeRange(availabilityForm.startTime, availabilityForm.endTime)
    ) {
      window.alert("End time must be later than start time.");
      return null;
    }
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
    if (!activeInviteAccepted) {
      window.alert("Accept the invite before submitting availability.");
      return;
    }
    if (!canChangeAvailability) {
      window.alert("Availability changes are closed for this schedule period.");
      return;
    }
    const entry = buildUnavailableEntry();
    if (!entry) return;
    const existingDates = new Set([
      ...(activeSubmission?.unavailable ?? []).map((item) => item.date),
      ...activeAvailabilityDraft.map((item) => item.date)
    ]);

    if (existingDates.has(entry.date)) {
      window.alert("That date is already in this employee's availability submission.");
      return;
    }

    const existingSubmitted = activeSubmission?.submittedAt ? activeSubmission.unavailable : [];
    setAvailabilityDrafts((current) => ({
      ...current,
      [activeEmployee.id]: sortUnavailableEntries([...existingSubmitted, ...(current[activeEmployee.id] ?? []), entry])
    }));
    if (activeSubmission?.submittedAt) {
      setAvailability((current) => current.filter((submission) => submission.userId !== activeEmployee.id));
      addAudit("availability_unsubmitted", "AvailabilitySubmission", activeEmployee.id, `${activeEmployee.name} reopened availability.`, activeEmployee.id);
    }

    setAvailabilityForm((current) => ({ ...current, note: "" }));
  }

  function removeAvailabilityDraftEntry(entryId: string) {
    setAvailabilityDrafts((current) => ({
      ...current,
      [activeEmployee.id]: (current[activeEmployee.id] ?? []).filter((entry) => entry.id !== entryId)
    }));
  }

  function finalizeAvailability(submittedUnavailable: Unavailability[], note?: string) {
    if (!activeInviteAccepted) {
      window.alert("Accept the invite before submitting availability.");
      return;
    }
    if (!canChangeAvailability) {
      window.alert("Availability submissions are closed for this schedule period.");
      return;
    }
    const invalid = submittedUnavailable.find(
      (entry) => entry.unavailableType === "custom_time_range" && !isValidTimeRange(entry.startTime, entry.endTime)
    );
    if (invalid) {
      window.alert(`Fix the time range on ${getDayName(invalid.date)} before submitting.`);
      return;
    }

    const sortedUnavailable = sortUnavailableEntries(submittedUnavailable);

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
            unavailable: sortedUnavailable
          }
        ];
      }

      return current.map((submission) =>
        submission.userId === activeEmployee.id
          ? {
              ...submission,
              submittedAt: new Date().toISOString(),
              note: note || submission.note,
              unavailable: sortedUnavailable
            }
          : submission
      );
    });

    setAvailabilityDrafts((current) => ({
      ...current,
      [activeEmployee.id]: []
    }));

    const summary =
      sortedUnavailable.length > 0
        ? `${activeEmployee.name} submitted ${sortedUnavailable.length} unavailable day${sortedUnavailable.length === 1 ? "" : "s"}.`
        : `${activeEmployee.name} submitted no unavailable days.`;

    addAudit("availability_submitted", "AvailabilitySubmission", activeEmployee.id, summary, activeEmployee.id);
    addNotification(
      "availability_submitted",
      `${activeEmployee.name} submitted availability`,
      "emp_manager",
      buildNotificationHtml(`${activeEmployee.name} submitted availability`, summary)
    );
  }

  function unsubmitAvailability() {
    if (!activeSubmission?.submittedAt) return;
    if (!activeInviteAccepted) return;
    if (!canChangeAvailability) {
      window.alert("Availability changes are closed for this schedule period.");
      return;
    }

    setAvailabilityDrafts((current) => ({
      ...current,
      [activeEmployee.id]: sortUnavailableEntries(activeSubmission.unavailable.map((entry) => ({ ...entry, id: `draft_${entry.id}_${Date.now()}` })))
    }));
    setAvailability((current) => current.filter((submission) => submission.userId !== activeEmployee.id));
    addAudit("availability_unsubmitted", "AvailabilitySubmission", activeEmployee.id, `${activeEmployee.name} unsubmitted availability.`, activeEmployee.id);
  }

  function submitAvailability() {
    finalizeAvailability([...(activeSubmission?.unavailable ?? []), ...activeAvailabilityDraft], availabilityForm.note);
  }

  function beginEditAvailability() {
    if (!activeSubmission?.submittedAt) return;

    unsubmitAvailability();
  }

  function employeeHasShiftOnDate(employeeId: string, date: string, ignoredShiftIds: string[] = []) {
    return shifts.some((shift) => shift.employeeId === employeeId && shift.date === date && !ignoredShiftIds.includes(shift.id));
  }

  function coverageBlockReason(request: CoverageRequest, employeeId: string) {
    const shift = shifts.find((item) => item.id === request.shiftId);
    if (!shift) return "Shift not found.";
    if (shift.employeeId === employeeId || request.requestedById === employeeId) return "This is already your shift.";
    if (employeeHasShiftOnDate(employeeId, shift.date)) return "You already work that day.";
    if (isEmployeeUnavailable(employeeId, shift, availability)) return "You are unavailable for that shift.";
    return "";
  }

  function swapBlockReason(requesterShift: Shift, targetShift: Shift) {
    if (!targetShift.employeeId) return "Target shift is unassigned.";
    if (requesterShift.employeeId !== activeEmployee.id) return "Select one of your own shifts.";
    if (targetShift.employeeId === activeEmployee.id) return "Select another employee's shift.";
    if (employeeHasShiftOnDate(activeEmployee.id, targetShift.date, [requesterShift.id])) {
      return "You already work on the day you would receive.";
    }
    if (employeeHasShiftOnDate(targetShift.employeeId, requesterShift.date, [targetShift.id])) {
      return `${nameFor(targetShift.employeeId)} already works on the day they would receive.`;
    }
    if (isEmployeeUnavailable(activeEmployee.id, targetShift, availability)) {
      return "You are unavailable for the shift you would receive.";
    }
    if (isEmployeeUnavailable(targetShift.employeeId, requesterShift, availability)) {
      return `${nameFor(targetShift.employeeId)} is unavailable for the shift they would receive.`;
    }
    return "";
  }

  function swapApprovalBlockReason(request: SwapRequest) {
    const requesterShift = shifts.find((shift) => shift.id === request.requesterShiftId);
    const targetShift = shifts.find((shift) => shift.id === request.targetShiftId);
    if (!requesterShift || !targetShift || !targetShift.employeeId) return "Swap shifts are no longer valid.";
    if (employeeHasShiftOnDate(request.requesterId, targetShift.date, [requesterShift.id])) {
      return `${nameFor(request.requesterId)} already works on the day they would receive.`;
    }
    if (employeeHasShiftOnDate(targetShift.employeeId, requesterShift.date, [targetShift.id])) {
      return `${nameFor(targetShift.employeeId)} already works on the day they would receive.`;
    }
    if (isEmployeeUnavailable(request.requesterId, targetShift, availability)) {
      return `${nameFor(request.requesterId)} is unavailable for the shift they would receive.`;
    }
    if (isEmployeeUnavailable(targetShift.employeeId, requesterShift, availability)) {
      return `${nameFor(targetShift.employeeId)} is unavailable for the shift they would receive.`;
    }
    return "";
  }

  function currentSwapBlockReason() {
    const requesterShift = shifts.find((shift) => shift.id === swapForm.requesterShiftId);
    const targetShift = shifts.find((shift) => shift.id === swapForm.targetShiftId);
    if (!requesterShift || !targetShift) return "";
    return swapBlockReason(requesterShift, targetShift);
  }

  function requestCoverage(shiftId: string) {
    if (!activeInviteAccepted) {
      window.alert("Accept the invite before requesting coverage.");
      return;
    }
    if (coverage.some((request) => request.shiftId === shiftId && request.status !== "cancelled")) return;
    const shift = shifts.find((item) => item.id === shiftId);
    if (!shift) return;

    const request: CoverageRequest = {
      id: `coverage_${Date.now()}`,
      shiftId,
      requestedById: activeEmployee.id,
      status: "open",
      reason: "Employee requested coverage."
    };
    setCoverage((current) => [request, ...current]);
    addNotification(
      "coverage_requested",
      `${activeEmployee.name} requested coverage`,
      "emp_manager",
      buildNotificationHtml(
        `${activeEmployee.name} requested coverage`,
        `${activeEmployee.name} is asking for ${getDayName(shift.date)} ${formatTime(shift.startTime)}-${formatTime(shift.endTime)} to be covered.`
      )
    );
    schedulableEmployees
      .filter((employee) => employee.id !== activeEmployee.id)
      .forEach((employee) =>
        addNotification(
          "coverage_opened",
          "A shift is open for coverage",
          employee.id,
          buildNotificationHtml(
            "A shift is open for coverage",
            `${activeEmployee.name} opened ${getDayName(shift.date)} ${formatTime(shift.startTime)}-${formatTime(shift.endTime)} for coverage.`
          )
        )
      );
    addAudit(
      "coverage_requested",
      "CoverageRequest",
      request.id,
      `${activeEmployee.name} opened ${getDayName(shift.date)} ${formatTime(shift.startTime)}-${formatTime(shift.endTime)} for coverage.`,
      activeEmployee.id
    );
  }

  function offerCoverage(requestId: string) {
    if (!activeInviteAccepted) {
      window.alert("Accept the invite before offering coverage.");
      return;
    }
    const request = coverage.find((item) => item.id === requestId);
    if (!request) return;
    const blocked = coverageBlockReason(request, activeEmployee.id);
    if (blocked) {
      window.alert(blocked);
      return;
    }
    const shift = shifts.find((item) => item.id === request.shiftId);
    setCoverage((current) =>
      current.map((request) =>
        request.id === requestId ? { ...request, claimedById: activeEmployee.id, status: "offered" } : request
      )
    );
    addNotification(
      "coverage_offer",
      `${activeEmployee.name} offered to cover a shift`,
      "emp_manager",
      buildNotificationHtml(
        `${activeEmployee.name} offered to cover a shift`,
        shift
          ? `${activeEmployee.name} offered to cover ${nameFor(request.requestedById)}'s ${getDayName(shift.date)} ${formatTime(shift.startTime)}-${formatTime(shift.endTime)} shift.`
          : "Review the offer in manager requests."
      )
    );
    addNotification(
      "coverage_offer",
      `${activeEmployee.name} offered to cover your shift`,
      request.requestedById,
      buildNotificationHtml(`${activeEmployee.name} offered to cover your shift`, "A manager still needs to approve the coverage change.")
    );
    addAudit("coverage_offered", "CoverageRequest", requestId, `${activeEmployee.name} offered to cover.`, activeEmployee.id);
  }

  function approveCoverage(requestId: string, approved: boolean) {
    const request = coverage.find((item) => item.id === requestId);
    if (!request) return;
    if (approved && request.claimedById) {
      const blocked = coverageBlockReason(request, request.claimedById);
      if (blocked) {
        window.alert(blocked);
        return;
      }
    }

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
      addNotification(
        "coverage_approved",
        "Coverage change approved",
        request.requestedById,
        buildNotificationHtml("Coverage change approved", `${nameFor(request.claimedById)} is now covering your shift.`)
      );
      addNotification(
        "coverage_approved",
        "Coverage change approved",
        request.claimedById,
        buildNotificationHtml("Coverage change approved", `You are now assigned to cover ${nameFor(request.requestedById)}'s shift.`)
      );
    } else {
      addNotification("coverage_rejected", "Coverage change rejected", request.requestedById, buildNotificationHtml("Coverage change rejected", "The coverage request was not approved."));
      if (request.claimedById) {
        addNotification("coverage_rejected", "Coverage change rejected", request.claimedById, buildNotificationHtml("Coverage change rejected", "The coverage offer was not approved."));
      }
    }

    addAudit(
      approved ? "coverage_approved" : "coverage_rejected",
      "CoverageRequest",
      requestId,
      approved ? "Manager approved a coverage offer." : "Manager rejected a coverage offer."
    );
  }

  function requestSwap() {
    if (!activeInviteAccepted) {
      window.alert("Accept the invite before requesting a swap.");
      return;
    }
    const requesterShift = shifts.find((shift) => shift.id === swapForm.requesterShiftId);
    const targetShift = shifts.find((shift) => shift.id === swapForm.targetShiftId);
    if (!requesterShift || !targetShift || !targetShift.employeeId) return;
    const blocked = swapBlockReason(requesterShift, targetShift);
    if (blocked) {
      window.alert(blocked);
      return;
    }

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
    addNotification(
      "swap_requested",
      `${activeEmployee.name} requested a shift swap`,
      targetShift.employeeId,
      buildNotificationHtml(
        `${activeEmployee.name} requested a shift swap`,
        `${activeEmployee.name} wants to trade ${getDayName(requesterShift.date)} ${formatTime(requesterShift.startTime)} for your ${getDayName(targetShift.date)} ${formatTime(targetShift.startTime)} shift.`
      )
    );
    addAudit("swap_requested", "SwapRequest", request.id, `${activeEmployee.name} requested a shift swap.`, activeEmployee.id);
  }

  function acceptSwap(requestId: string, accepted: boolean) {
    if (!activeInviteAccepted) {
      window.alert("Accept the invite before responding to swaps.");
      return;
    }
    const request = swaps.find((item) => item.id === requestId);
    if (!request) return;
    if (accepted) {
      const blocked = swapApprovalBlockReason(request);
      if (blocked) {
        window.alert(blocked);
        return;
      }
    }
    setSwaps((current) =>
      current.map((request) =>
        request.id === requestId
          ? { ...request, status: accepted ? "pending_manager_approval" : "declined_by_employee" }
          : request
      )
    );
    addNotification(
      "swap_response",
      accepted ? "A swap is ready for manager approval" : "A swap was declined",
      "emp_manager",
      buildNotificationHtml(
        accepted ? "A swap is ready for manager approval" : "A swap was declined",
        `${activeEmployee.name} ${accepted ? "accepted" : "declined"} ${nameFor(request.requesterId)}'s swap request.`
      )
    );
    addNotification(
      "swap_response",
      accepted ? "Swap accepted by coworker" : "Swap declined by coworker",
      request.requesterId,
      buildNotificationHtml(
        accepted ? "Swap accepted by coworker" : "Swap declined by coworker",
        accepted ? "A manager still needs to approve the swap." : `${activeEmployee.name} declined the swap.`
      )
    );
    addAudit(accepted ? "swap_employee_accepted" : "swap_employee_declined", "SwapRequest", requestId, "Employee responded to swap.", activeEmployee.id);
  }

  function approveSwap(requestId: string, approved: boolean) {
    const request = swaps.find((item) => item.id === requestId);
    if (!request || !request.targetShiftId) return;
    if (approved) {
      const blocked = swapApprovalBlockReason(request);
      if (blocked) {
        window.alert(blocked);
        return;
      }
    }

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
      addNotification("swap_approved", "Shift swap approved", request.requesterId, buildNotificationHtml("Shift swap approved", "Your schedule was updated with the approved swap."));
      addNotification("swap_approved", "Shift swap approved", request.targetEmployeeId, buildNotificationHtml("Shift swap approved", "Your schedule was updated with the approved swap."));
    } else {
      addNotification("swap_rejected", "Shift swap rejected", request.requesterId, buildNotificationHtml("Shift swap rejected", "The manager rejected the swap."));
      addNotification("swap_rejected", "Shift swap rejected", request.targetEmployeeId, buildNotificationHtml("Shift swap rejected", "The manager rejected the swap."));
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

  function beginEditEmployee(employee: Employee) {
    const parts = employeeNameParts(employee.name);
    setEditingEmployeeId(employee.id);
    setEmployeeEdit({
      ...parts,
      email: employee.email
    });
  }

  function cancelEditEmployee() {
    setEditingEmployeeId(null);
    setEmployeeEdit({ firstName: "", lastName: "", email: "" });
  }

  function saveEmployeeEdit(employeeId: string) {
    const email = employeeEdit.email.trim().toLowerCase();
    const name = employeeFullName(employeeEdit);
    if (!name || !email) return;
    if (people.some((employee) => employee.id !== employeeId && employee.email.toLowerCase() === email)) {
      window.alert("That Gmail account is already approved.");
      return;
    }

    setPeople((current) =>
      current.map((employee) => (employee.id === employeeId ? { ...employee, name, email } : employee))
    );
    setInviteAcceptances((current) =>
      current.map((acceptance) => (acceptance.employeeId === employeeId ? { ...acceptance, name, email } : acceptance))
    );
    addAudit("employee_updated", "User", employeeId, `Updated employee info for ${name}.`);
    cancelEditEmployee();
  }

  function addEmployee() {
    const email = newEmployee.email.trim().toLowerCase();
    const name = employeeFullName(newEmployee);
    if (!email || !name) return;
    if (people.some((employee) => employee.email.toLowerCase() === email)) {
      window.alert("That Gmail account is already approved.");
      return;
    }

    const employee: Employee = {
      id: `emp_${Date.now()}`,
      name,
      email,
      role: "employee",
      active: true
    };

    setPeople((current) => [...current, employee]);
    setNewEmployee({ firstName: "", lastName: "", email: "" });
    const notificationId = addNotification(
      "employee_invited",
      `Join ${store.name} on The Schedule`,
      employee.id,
      buildNotificationHtml(
        `Join ${store.name} on The Schedule`,
        `${currentIdentity?.name ?? "Your manager"} invited you to join ${store.name} as an employee. Use your approved Gmail account to accept the invitation and submit availability.`,
        "Accept invitation"
      ),
      { to: employee.email, recipientName: employee.name },
      false
    );
    void fetch("/api/invites", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: employee.name,
        email: employee.email,
        storeId: store.id
      })
    })
      .then((response) => {
        if (!response.ok) throw new Error("Unable to create production invite.");
        return response.json() as Promise<{ invitation: { inviteUrl: string }; notification: { status: NotificationEntry["status"]; reason?: string } }>;
      })
      .then((result) => {
        setNotifications((current) =>
          current.map((entry) =>
            entry.id === notificationId
              ? {
                  ...entry,
                  status: result.notification.status
                }
              : entry
          )
        );
        addAudit("employee_invite_link_created", "StoreInvitation", employee.id, `Created invite link for ${employee.email}.`);
      })
      .catch(() => {
        setNotifications((current) => current.map((entry) => (entry.id === notificationId ? { ...entry, status: "failed" } : entry)));
        sendOwnerAlert("software_outage", "Production invite creation failed", [
          { label: "Employee", value: employee.name },
          { label: "Email", value: employee.email },
          { label: "Store", value: store.name },
          { label: "Detected at", value: new Date().toISOString() }
        ]);
      });
    addAudit("employee_invited", "User", employee.id, `Invited ${employee.email} to join ${store.name}.`);
  }

  function resetTestRun() {
    setMode("manager");
    setActiveTab("dashboard");
    setActiveEmployeeId("emp_manager");
    setPeople(employees);
    setPeriod(schedulePeriod);
    setShifts(generateDefaultShifts(schedulePeriod));
    setAvailability([]);
    setCoverage([]);
    setSwaps([]);
    setAuditLog(DEFAULT_AUDIT_LOG);
    setNotifications([]);
    setAvailabilityDrafts({});
    setUatIssues([]);
    setInviteAcceptances([]);
    setSelectedShiftId(null);
    setShowOnlyUnassigned(false);
    setShowIssueReporter(false);
    setShowPublishReview(false);
    cancelEditEmployee();
    window.localStorage.removeItem(STORAGE_KEY);
    setPersistenceStatus("saving");
    void fetch("/api/test-state", { method: "DELETE" })
      .then((response) => {
        if (!response.ok) throw new Error("Unable to reset server test state.");
        setPersistenceStatus("saved");
      })
      .catch(() => setPersistenceStatus("local"));
  }

  function applyScenarioPreset(preset: ScenarioPreset) {
    const presetAvailability = preset === "fresh" ? [] : availabilitySubmissions;
    const defaultShiftBlocks = generateDefaultShifts(schedulePeriod);
    const presetInviteAcceptances =
      preset === "fresh"
        ? []
        : employees
            .filter((employee) => employee.role === "employee")
            .map((employee) => ({
              id: `preset_acceptance_${employee.id}`,
              employeeId: employee.id,
              acceptedAt: "2026-07-06T18:00:00.000Z",
              email: employee.email,
              name: employee.name
            }));
    const generatedDraft = autoAssignDraft(defaultShiftBlocks, employees, presetAvailability);
    const nextPeriod =
      preset === "published"
        ? { ...schedulePeriod, status: "published" as const, publishedAt: "2026-07-14T16:00:00.000Z" }
        : { ...schedulePeriod, status: "draft" as const, publishedAt: undefined };
    const nextShifts =
      preset === "draft"
        ? generatedDraft
        : preset === "published"
          ? initialShifts
          : defaultShiftBlocks;

    setMode("manager");
    setActiveTab("dashboard");
    setPeople(employees);
    setPeriod(nextPeriod);
    setShifts(nextShifts);
    setAvailability(presetAvailability);
    setCoverage(preset === "published" ? coverageRequests : []);
    setSwaps(preset === "published" ? swapRequests : []);
    setAuditLog([
      {
        id: `audit_preset_${Date.now()}`,
        actorId: "emp_manager",
        action: "uat_preset_loaded",
        entityType: "TestScenario",
        entityId: preset,
        summary: `Loaded ${preset.replaceAll("_", " ")} UAT scenario.`,
        createdAt: new Date().toISOString()
      },
      ...DEFAULT_AUDIT_LOG
    ]);
    setNotifications([]);
    setAvailabilityDrafts({});
    setUatIssues([]);
    setInviteAcceptances(presetInviteAcceptances);
    setSelectedShiftId(nextShifts[0]?.id ?? null);
    setShowOnlyUnassigned(false);
    setShowIssueReporter(false);
    setShowPublishReview(false);
    cancelEditEmployee();
  }

  const managerTabs: Array<{ id: TabId; label: string; icon: React.ReactNode }> = [
    { id: "dashboard", label: "Dashboard", icon: <CalendarDays size={16} /> },
    { id: "employees", label: "Employees", icon: <Users size={16} /> },
    { id: "availability", label: "Availability", icon: <Clock size={16} /> },
    { id: "builder", label: "Builder", icon: <Plus size={16} /> },
    { id: "requests", label: "Requests", icon: <Repeat2 size={16} /> },
    { id: "reports", label: "Reports", icon: <FileText size={16} /> },
    { id: "issues", label: "UAT Issues", icon: <ClipboardList size={16} /> },
    { id: "notifications", label: "Notifications", icon: <Mail size={16} /> },
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
      <header className="no-print sticky top-0 z-30 border-b border-line bg-white">
        <div className="mx-auto flex max-w-[1800px] flex-col gap-3 px-4 py-3 xl:px-6 2xl:px-8 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <div className="min-w-0">
              <h1 className="truncate text-lg font-black sm:text-xl">The Schedule</h1>
              <p className="truncate text-sm text-ink/60">{store.name}</p>
            </div>
            <Badge tone={period.status === "published" ? "good" : "warn"}>{period.status}</Badge>
            <Badge tone={persistenceTone}>{persistenceLabel}</Badge>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="hidden max-w-[260px] items-center gap-2 rounded-md border border-line bg-paper px-3 py-2 text-sm md:flex">
              <ShieldCheck size={16} className="shrink-0 text-mall" />
              <span className="truncate">
                <strong>{currentIdentity?.name ?? "Test user"}</strong>
              </span>
            </div>
            <div className="inline-flex rounded-lg border border-line bg-white p-1">
              <button
                className={cx("h-8 rounded-md px-3 text-sm font-semibold", mode === "manager" && "bg-mall text-white")}
                onClick={() => {
                  setMode("manager");
                  setActiveTab("dashboard");
                }}
              >
                Manager
              </button>
              <button
                className={cx("h-8 rounded-md px-3 text-sm font-semibold", mode === "employee" && "bg-mall text-white")}
                onClick={() => {
                  setMode("employee");
                  setActiveEmployeeId(managerIdentity.id);
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
                    {employee.name}{employee.role === "manager" ? " (manager)" : ""}
                  </option>
                ))}
              </select>
            )}

            <Button
              variant="secondary"
              onClick={() => setThemePreference(currentTheme === "dark" ? "light" : "dark")}
              title={`Switch to ${currentTheme === "dark" ? "light" : "dark"} mode`}
            >
              {currentTheme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
              {currentTheme === "dark" ? "Light" : "Dark"}
            </Button>
            <Button variant="secondary" onClick={() => void sendTestEmail()} disabled={testEmailStatus === "sending"}>
              <Mail size={16} />
              {testEmailStatus === "sending" ? "Sending" : "Test"}
            </Button>
            <Button variant="secondary" onClick={resetTestRun}>
              <RefreshCw size={16} />
              Reset
            </Button>
          </div>
        </div>
        <nav className="mx-auto flex max-w-[1800px] gap-2 overflow-x-auto px-4 pb-3 xl:px-6 2xl:px-8">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              className={cx(
                "inline-flex h-9 shrink-0 items-center gap-2 rounded-md border px-3 text-sm font-semibold",
                activeTab === tab.id ? "border-mall bg-mall text-white" : "border-line bg-white text-ink hover:bg-paper",
                mode === "employee" && tab.id === "submit" && activeEmployeeNeedsAvailability && activeTab !== tab.id && "border-warn bg-warn/10 text-warn",
                tab.id === "requests" &&
                  (mode === "manager" ? pendingManagerRequests > 0 : activeEmployeeRequestCount > 0) &&
                  activeTab !== tab.id &&
                  "border-warn bg-warn/10 text-warn"
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
              {mode === "manager" && tab.id === "issues" && openUatIssues.length > 0 && (
                <span className={cx("grid min-w-5 place-items-center rounded-full px-1 text-[11px]", activeTab === tab.id ? "bg-white text-warn" : "bg-warn text-white")}>
                  {openUatIssues.length}
                </span>
              )}
              {tab.id === "requests" && (mode === "manager" ? pendingManagerRequests > 0 : activeEmployeeRequestCount > 0) && (
                <span className={cx("grid min-w-5 place-items-center rounded-full px-1 text-[11px]", activeTab === tab.id ? "bg-white text-warn" : "bg-warn text-white")}>
                  {mode === "manager" ? pendingManagerRequests : activeEmployeeRequestCount}
                </span>
              )}
            </button>
          ))}
        </nav>
      </header>

      <div className="no-print border-b border-line bg-paper">
        <div className="mx-auto flex max-w-[1800px] flex-col gap-3 px-4 py-2.5 text-sm xl:px-6 2xl:px-8 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-2">
            <ShieldCheck size={17} className="mt-0.5 shrink-0 text-mall" />
            <div>
              <span className="font-black">Test mode</span>
              <span className="text-ink/60"> - role switcher and UAT presets</span>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => setShowIssueReporter((current) => !current)}>
              <ClipboardList size={16} />
              Report issue
            </Button>
            <Button variant="secondary" onClick={() => applyScenarioPreset("fresh")}>Fresh pre-release</Button>
            <Button variant="secondary" onClick={() => applyScenarioPreset("availability")}>Availability submitted</Button>
            <Button variant="secondary" onClick={() => applyScenarioPreset("draft")}>Draft generated</Button>
            <Button variant="secondary" onClick={() => applyScenarioPreset("published")}>Published</Button>
          </div>
        </div>
      </div>

      <div className="mx-auto grid max-w-[1800px] gap-4 px-4 py-4 pb-24 xl:px-6 2xl:px-8 md:pb-4">
        {showIssueReporter && (
          <Section title="Report UAT Issue" icon={<ClipboardList size={18} />}>
            <div className="grid gap-3 lg:grid-cols-[220px_1fr_auto] lg:items-end">
              <Field label="Category">
                <select
                  className={inputBase}
                  value={issueForm.category}
                  onChange={(event) => setIssueForm((current) => ({ ...current, category: event.target.value as UatIssueCategory }))}
                >
                  {issueCategories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="What happened?">
                <input
                  className={inputBase}
                  value={issueForm.note}
                  onChange={(event) => setIssueForm((current) => ({ ...current, note: event.target.value }))}
                  placeholder="Short note for UAT follow-up"
                />
              </Field>
              <Button onClick={submitUatIssue} disabled={!issueForm.note.trim()}>
                <Send size={16} />
                Save issue
              </Button>
            </div>
            <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold text-ink/55">
              <Badge>{mode}</Badge>
              <Badge>{activeTab}</Badge>
              {mode === "employee" && <Badge>{activeEmployee.name}</Badge>}
              <Badge>{currentTheme}</Badge>
            </div>
          </Section>
        )}

        {activeTab === "dashboard" && mode === "employee" && (
          <div className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
            <Section title={activeEmployee.name} icon={<CalendarDays size={18} />}>
              <div className="grid gap-3">
                <div className={cx("rounded-lg border p-4", activeInviteAccepted ? "border-approve/30 bg-approve/10" : "border-warn bg-warn/10")}>
                  <div className="flex items-start gap-3">
                    <span className={cx("mt-0.5", activeInviteAccepted ? "text-approve" : "text-mall")}>
                      {activeInviteAccepted ? <Check size={20} /> : <Mail size={20} />}
                    </span>
                    <div className="min-w-0">
                      <div className="font-black">{activeInviteAccepted ? "Active" : "Invited"}</div>
                      <div className="mt-1 text-sm text-ink/60">{activeEmployee.email}</div>
                    </div>
                  </div>
                  {!activeInviteAccepted && (
                    <Button className="mt-3" variant="secondary" onClick={acceptInviteForActiveEmployee}>
                      <Check size={16} />
                      Accept invite
                    </Button>
                  )}
                </div>
                {activeEmployee.role === "manager" && (
                  <div className="rounded-lg border border-mall/30 bg-mall/10 p-4">
                    <div className="flex items-start gap-3">
                      <ShieldCheck className="mt-0.5 text-mall" size={20} />
                      <div>
                        <div className="font-black">Manager floor view</div>
                        <div className="mt-1 text-sm text-ink/60">Employee tools for the manager account.</div>
                      </div>
                    </div>
                  </div>
                )}
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
                      <div className="mt-1 text-sm text-ink/60">Due before {period.availabilityDeadlineAt}</div>
                    </div>
                  </div>
                  {activeEmployeeNeedsAvailability && (
                    <Button className="mt-3" onClick={() => setActiveTab("submit")}>
                      <Send size={16} />
                      Submit availability
                    </Button>
                  )}
                </div>
                <div className="rounded-lg border border-line p-4 md:hidden">
                  <div className="text-xs font-semibold uppercase tracking-normal text-ink/55">Quick actions</div>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <Button variant="secondary" onClick={() => setActiveTab("submit")}>
                      <Send size={16} />
                      Availability
                    </Button>
                    <Button variant="secondary" onClick={() => setActiveTab("my-shifts")}>
                      <Clock size={16} />
                      My shifts
                    </Button>
                    <Button variant="secondary" onClick={() => setActiveTab("team")}>
                      <CalendarDays size={16} />
                      Team
                    </Button>
                    <Button variant="secondary" onClick={() => setShowIssueReporter(true)}>
                      <ClipboardList size={16} />
                      Report issue
                    </Button>
                  </div>
                </div>
                <div className="grid gap-2 rounded-lg border border-line bg-paper p-4">
                  <div className="text-xs font-semibold uppercase tracking-normal text-ink/55">Flow</div>
                  <div className="grid gap-2 text-sm">
                    <div className="flex items-center gap-2">
                      <Badge tone={activeEmployeeNeedsAvailability ? "warn" : "good"}>1</Badge>
                      Submit availability.
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge tone={shifts.length > 0 ? "good" : "neutral"}>2</Badge>
                      Build the draft.
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge tone={period.status === "published" ? "good" : "neutral"}>3</Badge>
                      Publish and review.
                    </div>
                  </div>
                </div>
              </div>
            </Section>
            <Section title="My Upcoming Shifts" icon={<Clock size={18} />}>
              <ShiftList shifts={myShifts} coverageRequests={coverage} onRequestCoverage={requestCoverage} />
            </Section>
          </div>
        )}

        {activeTab === "dashboard" && mode === "manager" && (
          <div className="grid gap-4">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <Metric label="Test date" value={TEST_TODAY} detail={testStep} tone={period.status === "published" ? "good" : "warn"} />
              <Metric
                label="Availability"
                value={`${schedulableSubmittedIds.size}/${schedulableEmployees.length}`}
                detail={`${missingAvailability.length} still missing`}
                tone={schedulableSubmittedIds.size === schedulableEmployees.length ? "good" : "warn"}
              />
              <Metric label="Open requests" value={String(pendingManagerRequests)} detail="Need manager action" tone={pendingManagerRequests ? "warn" : "good"} />
              <Metric label="Draft shifts" value={String(shifts.length)} detail={shifts.length ? "Ready for assignment" : "Generate from templates"} />
            </div>

            <Section title="UAT Checks" icon={<Check size={18} />}>
              <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
                <div className="rounded-lg border border-line bg-paper p-4">
                  <div className="text-xs font-semibold uppercase tracking-normal text-ink/55">Progress</div>
                  <div className="mt-2 text-3xl font-black">
                    {completedUatItems}/{uatItems.length}
                  </div>
                  <div className="mt-1 text-sm text-ink/60">Manual test pass</div>
                </div>
                <div className="grid gap-2 md:grid-cols-2">
                  {uatItems.map((item) => (
                    <div key={item.label} className="flex items-center gap-2 rounded-lg border border-line p-3">
                      <span className={cx("grid size-7 shrink-0 place-items-center rounded-md", item.done ? "bg-approve text-white" : "bg-paper text-ink/45")}>
                        <Check size={15} />
                      </span>
                      <span className={cx("text-sm font-semibold", item.done ? "text-ink" : "text-ink/55")}>{item.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            </Section>

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
                    <p className="mt-1 text-sm text-ink/60">
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
                    <p className="mt-1 text-sm text-ink/60">
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
                    <p className="mt-1 line-clamp-2 text-sm text-ink/60">{entry.summary}</p>
                  </div>
                ))}
              </div>
            </Section>
          </div>
        )}

        {activeTab === "employees" && mode === "manager" && (
          <Section title="Employees" icon={<Users size={18} />}>
            <div className="mb-4 grid gap-3 rounded-lg border border-line p-4 lg:grid-cols-[1fr_1fr_1.4fr_auto]">
              <Field label="First name">
                <input className={inputBase} value={newEmployee.firstName} onChange={(event) => setNewEmployee({ ...newEmployee, firstName: event.target.value })} />
              </Field>
              <Field label="Last name">
                <input className={inputBase} value={newEmployee.lastName} onChange={(event) => setNewEmployee({ ...newEmployee, lastName: event.target.value })} />
              </Field>
              <Field label="Approved Gmail">
                <input className={inputBase} type="email" value={newEmployee.email} onChange={(event) => setNewEmployee({ ...newEmployee, email: event.target.value })} />
              </Field>
              <div className="flex items-end">
                <Button className="w-full" onClick={addEmployee}>
                  <UserPlus size={16} />
                  Invite
                </Button>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] border-separate border-spacing-0 text-left text-sm">
                <thead>
                  <tr className="text-xs uppercase tracking-normal text-ink/55">
                    <th className="border-b border-line pb-2">First</th>
                    <th className="border-b border-line pb-2">Last</th>
                    <th className="border-b border-line pb-2">Approved Gmail</th>
                    <th className="border-b border-line pb-2">Access</th>
                    <th className="border-b border-line pb-2">Status</th>
                    <th className="border-b border-line pb-2 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {people.map((employee) => {
                    const parts = employeeNameParts(employee.name);
                    const status = inviteStatusFor(employee);
                    const isEditing = editingEmployeeId === employee.id;

                    return (
                      <tr key={employee.id}>
                        <td className="border-b border-line py-3 pr-3 font-semibold">
                          {isEditing ? (
                            <input className={inputBase} value={employeeEdit.firstName} onChange={(event) => setEmployeeEdit({ ...employeeEdit, firstName: event.target.value })} />
                          ) : (
                            parts.firstName
                          )}
                        </td>
                        <td className="border-b border-line py-3 pr-3">
                          {isEditing ? (
                            <input className={inputBase} value={employeeEdit.lastName} onChange={(event) => setEmployeeEdit({ ...employeeEdit, lastName: event.target.value })} />
                          ) : (
                            parts.lastName || "-"
                          )}
                        </td>
                        <td className="border-b border-line py-3 pr-3">
                          {isEditing ? (
                            <input className={inputBase} type="email" value={employeeEdit.email} onChange={(event) => setEmployeeEdit({ ...employeeEdit, email: event.target.value })} />
                          ) : (
                            employee.email
                          )}
                        </td>
                        <td className="border-b border-line py-3 capitalize">{employee.role}</td>
                        <td className="border-b border-line py-3">
                          <Badge tone={status === "active" ? "good" : status === "invited" ? "warn" : "neutral"}>
                            {status === "active" ? "Active" : status === "invited" ? "Invited" : "Inactive"}
                          </Badge>
                        </td>
                        <td className="border-b border-line py-3">
                          <div className="flex justify-end gap-2">
                            {isEditing ? (
                              <>
                                <Button onClick={() => saveEmployeeEdit(employee.id)}>
                                  <Check size={16} />
                                  Save
                                </Button>
                                <Button variant="secondary" onClick={cancelEditEmployee}>
                                  <X size={16} />
                                  Cancel
                                </Button>
                              </>
                            ) : (
                              <Button variant="secondary" onClick={() => beginEditEmployee(employee)}>
                                <Settings size={16} />
                                Edit
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
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
                const inviteStatus = inviteStatusFor(employee);
                return (
                  <div key={employee.id} className="rounded-lg border border-line p-4">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <div className="font-bold">{employee.name}</div>
                        <div className="text-sm text-ink/60">{employee.email}</div>
                      </div>
                      <Badge tone={inviteStatus !== "active" ? "neutral" : submission?.submittedAt ? "good" : "warn"}>
                        {inviteStatus !== "active" ? "Invited" : submission?.submittedAt ? "Submitted" : "Missing"}
                      </Badge>
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
              <Metric
                label="Availability"
                value={`${schedulableSubmittedIds.size}/${schedulableEmployees.length}`}
                detail={`${missingAvailability.length} missing`}
                tone={missingAvailability.length ? "warn" : "good"}
              />
              <Metric label="Selected" value={selectedShift ? shortDayLabel(selectedShift.date) : "-"} detail={selectedShift ? `${formatTime(selectedShift.startTime)}-${formatTime(selectedShift.endTime)}` : "Choose a shift"} />
            </div>
            <Section title="Publish Readiness" icon={<ShieldCheck size={18} />}>
              <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-5">
                {[
                  { label: "Shift blocks ready", done: shifts.length > 0, detail: `${shifts.length} shifts` },
                  { label: "Availability collected", done: missingAvailability.length === 0, detail: `${missingAvailability.length} missing` },
                  { label: "All shifts assigned", done: unassignedShifts.length === 0 && shifts.length > 0, detail: `${unassignedShifts.length} unassigned` },
                  { label: "Invites accepted", done: assignedPendingInviteShifts.length === 0, detail: `${assignedPendingInviteShifts.length} pending` },
                  { label: "No availability conflicts", done: assignedConflictShifts.length === 0, detail: `${assignedConflictShifts.length} conflicts` }
                ].map((item) => (
                  <div key={item.label} className={cx("rounded-lg border p-3", item.done ? "border-approve/30 bg-approve/10" : "border-warn bg-warn/10")}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold">{item.label}</span>
                      <Badge tone={item.done ? "good" : "warn"}>{item.done ? "Ready" : "Check"}</Badge>
                    </div>
                    <div className="mt-1 text-sm text-ink/65">{item.detail}</div>
                  </div>
                ))}
              </div>
            </Section>
            {showPublishReview && (
              <Section
                title="Publish Confirmation"
                icon={<Send size={18} />}
                action={
                  <div className="flex flex-wrap gap-2">
                    <Button variant="secondary" onClick={() => setShowPublishReview(false)}>
                      <X size={16} />
                      Cancel
                    </Button>
                    <Button onClick={confirmPublishSchedule}>
                      <Check size={16} />
                      Confirm publish
                    </Button>
                  </div>
                }
              >
                <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
                  <div className="grid gap-3">
                    <div className="rounded-lg border border-line bg-paper p-4">
                      <div className="text-xs font-semibold uppercase tracking-normal text-ink/55">Final review</div>
                      <div className="mt-2 text-2xl font-black">{period.name}</div>
                      <p className="mt-1 text-sm text-ink/65">
                        {shifts.length} shifts, {shifts.filter((shift) => shift.employeeId).length} assigned, {unassignedShifts.length} unassigned.
                      </p>
                    </div>
                    <div className="rounded-lg border border-line p-4">
                      <div className="font-black">Warnings</div>
                      <div className="mt-3 grid gap-2">
                        {publishWarnings.length === 0 && (
                          <div className="rounded-md border border-approve/30 bg-approve/10 p-3 text-sm font-semibold text-approve">
                            No publish warnings.
                          </div>
                        )}
                        {publishWarnings.map((warning) => (
                          <div key={warning} className="rounded-md border border-warn bg-warn/10 p-3 text-sm font-semibold text-warn">
                            {warning}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className="grid gap-3">
                    <div className="rounded-lg border border-line p-4">
                      <div className="font-black">Employee notifications</div>
                      <div className="mt-3 grid gap-2">
                        {schedulableEmployees.map((employee) => {
                          const employeeShifts = shifts.filter((shift) => shift.employeeId === employee.id);
                          return (
                            <div key={employee.id} className="flex items-center justify-between gap-3 rounded-md bg-paper p-3 text-sm">
                              <span className="font-semibold">{employee.name}</span>
                              <Badge tone={employeeShifts.length ? "good" : "neutral"}>
                                {employeeShifts.length ? `${employeeShifts.length} shift${employeeShifts.length === 1 ? "" : "s"}` : "No email"}
                              </Badge>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                    <div className="rounded-lg border border-line p-4">
                      <div className="font-black">Hours snapshot</div>
                      <div className="mt-3 grid gap-2">
                        {finalHours
                          .filter((item) => item.shifts > 0)
                          .map((item) => (
                            <div key={item.employeeId} className="flex items-center justify-between gap-3 rounded-md bg-paper p-3 text-sm">
                              <span className="font-semibold">{item.name}</span>
                              <span>{item.hours.toFixed(1)}h</span>
                            </div>
                          ))}
                      </div>
                    </div>
                  </div>
                </div>
              </Section>
            )}
            <div className="grid min-w-0 gap-4">
              <ScheduleGrid
                people={people}
                title="Schedule Builder"
                calendarWeeks={calendarWeeks}
                availability={availability}
                hours={finalHours}
                assignablePeople={schedulableEmployees}
                showAssignments
                onRemove={removeShift}
                onUpdateShift={updateShift}
                onAddShiftForDate={addShiftForDate}
                selectedShift={selectedShift}
                selectedShiftId={selectedShiftId}
                onSelectShift={setSelectedShiftId}
                showOnlyUnassigned={showOnlyUnassigned}
                action={
                  <div className="flex flex-wrap gap-2">
                    <Button variant={showOnlyUnassigned ? "primary" : "secondary"} onClick={() => setShowOnlyUnassigned((current) => !current)}>
                      <AlertTriangle size={16} />
                      Unassigned
                    </Button>
                    <Button variant="secondary" onClick={generateDraft} disabled={!canAutoAssignSchedule}>
                      <RefreshCw size={16} />
                      Auto complete
                    </Button>
                    <Button variant="danger" onClick={clearShiftAssignments} disabled={unassignedShifts.length === shifts.length}>
                      <X size={16} />
                      Clear names
                    </Button>
                    <Button onClick={publishSchedule} disabled={period.status === "published"}>
                      <Send size={16} />
                      Publish
                    </Button>
                  </div>
                }
              />
            </div>
          </div>
        )}

        {activeTab === "my-shifts" && mode === "employee" && (
          <Section title="My Shifts" icon={<Clock size={18} />}>
            <ShiftList shifts={myShifts} coverageRequests={coverage} onRequestCoverage={requestCoverage} />
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
                    {!activeInviteAccepted ? "Invite not accepted." : activeEmployeeNeedsAvailability ? "Add unavailable days." : "Submitted."}
                  </div>
                  <div className="mt-1 text-ink/60">
                    {!activeInviteAccepted ? "Accept the invite before submitting." : canChangeAvailability ? "Add days first, then submit." : "Deadline passed."}
                  </div>
                  {activeSubmission?.submittedAt && (
                    <Button className="mt-3" variant="secondary" onClick={beginEditAvailability} disabled={!canChangeAvailability}>
                      <RefreshCw size={16} />
                      Unsubmit
                    </Button>
                  )}
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
                      {availableShiftTemplates.map((template) => (
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
                <Button onClick={addAvailabilityDraftEntry} disabled={!activeInviteAccepted || !canChangeAvailability}>
                  <Plus size={16} />
                  1. Add unavailable day
                </Button>
                <Button variant="secondary" onClick={submitAvailability} disabled={!activeInviteAccepted || !canChangeAvailability}>
                  <Check size={16} />
                  {activeAvailabilityDraft.length === 0 ? "2. Submit no days" : "2. Submit draft"}
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
                        Submit no days if you are available for the next two weeks.
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
                    <div className="flex items-center gap-2">
                      <Badge tone={activeSubmission?.submittedAt ? "good" : "warn"}>
                        {activeSubmission?.submittedAt ? "Submitted" : "Not submitted"}
                      </Badge>
                      {activeSubmission?.submittedAt && (
                        <Button variant="ghost" onClick={unsubmitAvailability} disabled={!activeInviteAccepted || !canChangeAvailability}>
                          <RefreshCw size={16} />
                          Unsubmit
                        </Button>
                      )}
                    </div>
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
                {openCoverage.length === 0 && (
                  <div className="rounded-lg border border-dashed border-line p-6 text-sm font-semibold text-ink/55">
                    No open coverage requests.
                  </div>
                )}
                {openCoverage.map((request) => {
                  const shift = shifts.find((item) => item.id === request.shiftId);
                  if (!shift) return null;
                  const isMine = shift.employeeId === activeEmployee.id;
                  const canOffer = mode === "employee" && !isMine && request.requestedById !== activeEmployee.id && request.status === "open";
                  const offerBlockReason = canOffer ? coverageBlockReason(request, activeEmployee.id) : "";
                  const claimant = request.claimedById ? nameFor(request.claimedById) : "No one yet";

                  return (
                    <div key={request.id} className="rounded-lg border border-line p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <div className="font-bold">
                            {mode === "manager"
                              ? `${nameFor(request.requestedById)} is asking for this shift to be covered`
                              : getDayName(shift.date)}
                          </div>
                          <div className="text-sm text-ink/65">
                            {getDayName(shift.date)} {formatTime(shift.startTime)}-{formatTime(shift.endTime)}
                          </div>
                        </div>
                        <Badge tone={request.status === "offered" ? "warn" : "neutral"}>{request.status}</Badge>
                      </div>
                      <div className="mt-3 grid gap-2 rounded-md bg-paper p-3 text-sm text-ink/70">
                        <div>
                          <span className="font-bold text-ink">{nameFor(request.requestedById)}</span> is asking for coverage.
                        </div>
                        <div>
                          <span className="font-bold text-ink">{claimant}</span>{request.claimedById ? " is requesting to cover it." : " has offered to cover it."}
                        </div>
                        <div>{request.reason}</div>
                      </div>
                      {offerBlockReason && <p className="mt-2 text-sm font-semibold text-warn">{offerBlockReason}</p>}
                      <div className="mt-3 flex flex-wrap gap-2">
                        {canOffer && (
                          <Button variant="secondary" onClick={() => offerCoverage(request.id)} disabled={Boolean(offerBlockReason)}>
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
                        .map((shift) => {
                          const requesterShift = shifts.find((item) => item.id === swapForm.requesterShiftId);
                          const blocked = requesterShift ? swapBlockReason(requesterShift, shift) : "";
                          return (
                            <option key={shift.id} value={shift.id} disabled={Boolean(blocked)}>
                              {nameFor(shift.employeeId)} - {getDayName(shift.date)} {formatTime(shift.startTime)}
                              {blocked ? ` (${blocked})` : ""}
                            </option>
                          );
                        })}
                    </select>
                  </Field>
                  <Field label="Reason">
                    <input className={inputBase} value={swapForm.reason} onChange={(event) => setSwapForm({ ...swapForm, reason: event.target.value })} />
                  </Field>
                  {currentSwapBlockReason() && <div className="rounded-md border border-warn bg-warn/10 p-3 text-sm font-semibold text-warn">{currentSwapBlockReason()}</div>}
                  <Button onClick={requestSwap} disabled={!swapForm.requesterShiftId || !swapForm.targetShiftId || Boolean(currentSwapBlockReason())}>
                    <Repeat2 size={16} />
                    Request swap
                  </Button>
                </div>
              )}

              <div className="grid gap-3">
                {swaps.length === 0 && (
                  <div className="rounded-lg border border-dashed border-line p-6 text-sm font-semibold text-ink/55">
                    No shift swaps yet.
                  </div>
                )}
                {swaps.map((request) => {
                  const requesterShift = shifts.find((shift) => shift.id === request.requesterShiftId);
                  const targetShift = shifts.find((shift) => shift.id === request.targetShiftId);
                  const targetCanRespond = mode === "employee" && request.targetEmployeeId === activeEmployee.id && request.status === "pending_employee_response";
                  const swapBlock = request.status === "pending_employee_response" || request.status === "pending_manager_approval" ? swapApprovalBlockReason(request) : "";
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
                        {nameFor(request.requesterId)} gives{" "}
                        {requesterShift ? `${getDayName(requesterShift.date)} ${formatTime(requesterShift.startTime)}-${formatTime(requesterShift.endTime)}` : "their shift"}
                        {" for "}
                        {nameFor(request.targetEmployeeId)}
                        {"'s "}
                        {targetShift ? `${getDayName(targetShift.date)} ${formatTime(targetShift.startTime)}-${formatTime(targetShift.endTime)}` : "shift"}
                      </div>
                      <p className="mt-1 text-sm text-ink/65">{request.reason}</p>
                      {swapBlock && <p className="mt-2 text-sm font-semibold text-warn">{swapBlock}</p>}
                      <div className="mt-3 flex flex-wrap gap-2">
                        {targetCanRespond && (
                          <>
                            <Button onClick={() => acceptSwap(request.id, true)} disabled={Boolean(swapBlock)}>
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
                            <Button onClick={() => approveSwap(request.id, true)} disabled={Boolean(swapBlock)}>
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

        {activeTab === "issues" && mode === "manager" && (
          <div className="grid gap-4">
            <div className="grid gap-3 md:grid-cols-3">
              <Metric label="Open issues" value={String(openUatIssues.length)} detail="Needs UAT follow-up" tone={openUatIssues.length ? "warn" : "good"} />
              <Metric label="Resolved" value={String(resolvedUatIssues.length)} detail={`${uatIssues.length} total logged`} />
              <Metric label="Latest area" value={uatIssues[0] ? issueCategories.find((item) => item.id === uatIssues[0].category)?.label ?? uatIssues[0].category : "-"} detail={uatIssues[0] ? uatIssues[0].activeTab : "No issues yet"} />
            </div>
            <Section
              title="UAT Issues"
              icon={<ClipboardList size={18} />}
              action={
                <div className="flex flex-wrap gap-2">
                  <Button variant="secondary" onClick={() => setShowIssueReporter(true)}>
                    <Plus size={16} />
                    Log issue
                  </Button>
                  <Button variant="secondary" onClick={() => exportUatIssues("csv")} disabled={uatIssues.length === 0}>
                    <Download size={16} />
                    CSV
                  </Button>
                  <Button variant="secondary" onClick={() => exportUatIssues("json")} disabled={uatIssues.length === 0}>
                    <Download size={16} />
                    JSON
                  </Button>
                </div>
              }
            >
              <div className="grid gap-3">
                {uatIssues.length === 0 && (
                  <div className="rounded-lg border border-dashed border-line p-6 text-sm font-semibold text-ink/55">No issues logged.</div>
                )}
                {uatIssues.map((issue) => (
                  <div key={issue.id} className="rounded-lg border border-line p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge tone={issue.status === "open" ? "warn" : "good"}>{issue.status}</Badge>
                          <Badge>{issueCategories.find((item) => item.id === issue.category)?.label ?? issue.category}</Badge>
                          <span className="text-xs font-semibold text-ink/55">
                            {new Date(issue.createdAt).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                          </span>
                        </div>
                        <p className="mt-3 text-sm font-semibold text-ink">{issue.note}</p>
                        <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold text-ink/55">
                          <Badge>{issue.role}</Badge>
                          <Badge>{issue.activeTab}</Badge>
                          {issue.activeEmployeeId && <Badge>{nameFor(issue.activeEmployeeId)}</Badge>}
                          <Badge>{issue.theme}</Badge>
                        </div>
                      </div>
                      <Button
                        variant={issue.status === "open" ? "primary" : "secondary"}
                        onClick={() => setUatIssueStatus(issue.id, issue.status === "open" ? "resolved" : "open")}
                      >
                        {issue.status === "open" ? <Check size={16} /> : <RefreshCw size={16} />}
                        {issue.status === "open" ? "Resolve" : "Reopen"}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </Section>
          </div>
        )}

        {activeTab === "notifications" && mode === "manager" && (
          <div className="grid gap-4">
            <Section title="Email Previews" icon={<Mail size={18} />}>
              <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
                {notificationPreviews.map((preview) => (
                  <div key={preview.type} className="rounded-lg border border-line p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <Badge>{preview.type.replaceAll("_", " ")}</Badge>
                        <div className="mt-3 font-black">{preview.subject}</div>
                        <div className="mt-1 text-sm font-semibold text-ink/55">To: {preview.recipient}</div>
                      </div>
                      <Mail className="shrink-0 text-mall" size={20} />
                    </div>
                    <p className="mt-3 text-sm text-ink/60">{preview.body}</p>
                  </div>
                ))}
              </div>
            </Section>
            <Section title="Email Log" icon={<ShieldCheck size={18} />}>
              <div className="grid gap-3">
                {notifications.length === 0 && (
                  <div className="rounded-lg border border-dashed border-line p-6 text-sm font-semibold text-ink/55">No email activity yet.</div>
                )}
                {notifications.map((entry) => (
                  <div key={entry.id} className="rounded-lg border border-line p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="font-black">{entry.subject}</div>
                        <div className="mt-1 text-sm text-ink/65">
                          {entry.type.replaceAll("_", " ")}
                          {entry.userId ? ` - ${nameFor(entry.userId)}` : ""}
                        </div>
                      </div>
                      <Badge tone={entry.status === "failed" ? "danger" : entry.status === "sent" ? "good" : "neutral"}>{entry.status}</Badge>
                    </div>
                  </div>
                ))}
              </div>
            </Section>
          </div>
        )}

        {activeTab === "settings" && mode === "manager" && (
          <div className="grid gap-4 xl:grid-cols-4">
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
            <Section title="Shift Templates" icon={<Clock size={18} />}>
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
            <Section title="Schedule Due Date" icon={<CalendarDays size={18} />}>
              <div className="grid gap-3">
                <Field label="Schedule due">
                  <input
                    className={inputBase}
                    type="date"
                    value={period.releaseDate}
                    min={period.availabilityOpenAt}
                    max={period.endDate}
                    onChange={(event) => updateScheduleReleaseDate(event.target.value)}
                  />
                </Field>
                <div className="rounded-lg border border-line bg-paper p-3 text-sm">
                  <div className="font-black">Availability due</div>
                  <div className="mt-1 text-ink/65">{period.availabilityDeadlineAt}</div>
                </div>
                <div className="rounded-lg border border-line bg-paper p-3 text-sm">
                  <div className="font-black">Reminder window</div>
                  <div className="mt-1 text-ink/65">{period.availabilityOpenAt} to {period.availabilityDeadlineAt}</div>
                </div>
              </div>
            </Section>
            <Section title="Access & Email" icon={<ShieldCheck size={18} />}>
              <div className="grid gap-3">
                <div className="rounded-lg border border-line p-3">
                  <div className="text-xs font-semibold uppercase tracking-normal text-ink/55">Approved access</div>
                  <div className="mt-2 font-black">{people.filter((person) => person.active).length} active Gmail accounts</div>
                  <Link className={cx(buttonBase, "mt-3 border-line bg-white text-ink hover:bg-paper")} href="/api/auth/signin">
                    <ShieldCheck size={16} />
                    Google sign-in
                  </Link>
                </div>
                <div className="rounded-lg border border-line p-3">
                  <div className="text-xs font-semibold uppercase tracking-normal text-ink/55">Test notification</div>
                  <div className="mt-2 font-black">{currentIdentity?.email ?? "No recipient"}</div>
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
                  activeTab === tab.id ? "bg-mall text-white" : "bg-paper text-ink",
                  tab.id === "submit" && activeEmployeeNeedsAvailability && activeTab !== tab.id && "text-warn",
                  tab.id === "requests" && activeEmployeeRequestCount > 0 && activeTab !== tab.id && "text-warn"
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
                {tab.id === "requests" && activeEmployeeRequestCount > 0 && (
                  <span
                    className={cx(
                      "absolute right-1 top-1 grid min-w-4 place-items-center rounded-full px-1 text-[10px]",
                      activeTab === tab.id ? "bg-white text-warn" : "bg-warn text-white"
                    )}
                  >
                    {activeEmployeeRequestCount}
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
  hours = [],
  assignablePeople,
  showAssignments,
  onRemove,
  onUpdateShift,
  onAddShiftForDate,
  selectedShift,
  selectedShiftId,
  onSelectShift,
  showOnlyUnassigned = false
}: {
  people: Employee[];
  title?: string;
  action?: React.ReactNode;
  calendarWeeks: ReturnType<typeof buildCalendarWeeks>;
  availability: AvailabilitySubmission[];
  hours?: ReturnType<typeof calculateHours>;
  assignablePeople?: Employee[];
  showAssignments?: boolean;
  onRemove?: (shiftId: string) => void;
  onUpdateShift?: (shiftId: string, updates: Partial<Pick<Shift, "date" | "startTime" | "endTime" | "employeeId" | "externalAssigneeName">>) => void;
  onAddShiftForDate?: (date: string) => void;
  selectedShift?: Shift | null;
  selectedShiftId?: string | null;
  onSelectShift?: (shiftId: string) => void;
  showOnlyUnassigned?: boolean;
}) {
  const weekDayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const activePeople = (assignablePeople ?? people).filter((employee) => employee.active);
  const calendarDates = calendarWeeks.flatMap((week) => week).filter((day) => day.inPeriod).map((day) => day.date);
  const exportRef = useRef<HTMLElement | null>(null);
  const [externalName, setExternalName] = useState("");

  useEffect(() => {
    setExternalName(selectedShift?.externalAssigneeName ?? "");
  }, [selectedShift?.id, selectedShift?.externalAssigneeName]);

  function employeeStats(employeeId?: string | null) {
    return hours.find((item) => item.employeeId === employeeId);
  }

  function loadTone(employeeId?: string | null) {
    const stats = employeeStats(employeeId);
    if (!employeeId || !stats) return "border-line bg-paper text-ink";
    if (stats.averageDelta > 4) return "border-warn bg-warn/10 text-ink";
    if (stats.averageDelta < -4) return "border-mall bg-mall/10 text-ink";
    return "border-approve/40 bg-approve/10 text-ink";
  }

  return (
    <Section
      title={title}
      icon={<CalendarDays size={18} />}
      captureRef={exportRef}
      action={
        action ?? (
          <ScheduleExportButtons title={`${title} ${store.name} ${schedulePeriod.name}`} calendarWeeks={calendarWeeks} people={people} />
        )
      }
    >
      {selectedShift && onUpdateShift && (
        <div className="mb-3 grid gap-3 rounded-lg border border-line bg-paper p-3 xl:grid-cols-[0.85fr_1.15fr]">
          <div className="grid gap-3 sm:grid-cols-4">
            <Field label="Date">
              <select
                className={inputBase}
                value={selectedShift.date}
                onChange={(event) => onUpdateShift(selectedShift.id, { date: event.target.value })}
              >
                {calendarDates.map((date) => (
                  <option key={date} value={date}>
                    {getDayName(date)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Start">
              <input
                className={inputBase}
                type="time"
                value={selectedShift.startTime}
                onChange={(event) => onUpdateShift(selectedShift.id, { startTime: event.target.value })}
              />
            </Field>
            <Field label="End">
              <input
                className={inputBase}
                type="time"
                value={selectedShift.endTime}
                onChange={(event) => onUpdateShift(selectedShift.id, { endTime: event.target.value })}
              />
            </Field>
            <Field label="External cover">
              <div className="flex gap-2">
                <input
                  className={inputBase}
                  value={externalName}
                  onChange={(event) => setExternalName(event.target.value)}
                  placeholder="Owner family"
                />
                <button
                  className="h-9 shrink-0 rounded-md border border-line bg-white px-3 text-xs font-black text-ink hover:bg-paper"
                  onClick={() => onUpdateShift(selectedShift.id, { externalAssigneeName: externalName })}
                  type="button"
                >
                  Set
                </button>
              </div>
            </Field>
          </div>
          <div className="grid gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <button
                className={cx(
                  "rounded-md border px-3 py-2 text-left text-sm font-bold transition hover:border-mall",
                  !selectedShift.employeeId && !selectedShift.externalAssigneeName ? "border-mall bg-mall text-white" : "border-line bg-white text-ink"
                )}
                onClick={() => onUpdateShift(selectedShift.id, { employeeId: "" })}
                type="button"
              >
                Unassigned
              </button>
              {activePeople.map((employee) => {
                const stats = employeeStats(employee.id);
                const unavailable = isEmployeeUnavailable(employee.id, selectedShift, availability);
                const assigned = selectedShift.employeeId === employee.id;
                return (
                  <button
                    key={employee.id}
                    className={cx(
                      "rounded-md border px-3 py-2 text-left text-sm transition hover:border-mall",
                      loadTone(employee.id),
                      assigned && "ring-2 ring-mall/30",
                      unavailable && "border-warn bg-warn/10"
                    )}
                    onClick={() => onUpdateShift(selectedShift.id, { employeeId: employee.id })}
                    type="button"
                  >
                    <span className="block font-black leading-tight">{employee.name}</span>
                    <span className="mt-0.5 block text-xs font-semibold text-ink/60">
                      {(stats?.hours ?? 0).toFixed(1)}h / {stats?.shifts ?? 0} shifts
                      {stats ? ` / ${stats.averageDelta >= 0 ? "+" : ""}${stats.averageDelta.toFixed(1)}` : ""}
                      {unavailable ? " / unavailable" : ""}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      <div className="-mx-2 overflow-x-auto px-2 pb-2">
        <div className="min-w-[920px] overflow-hidden rounded-lg border border-line bg-white">
          <div className="grid grid-cols-7 border-b border-line bg-mall text-white">
            {weekDayLabels.map((label) => (
              <div key={label} className="px-3 py-2 text-xs font-black uppercase tracking-normal">
                {label}
              </div>
            ))}
          </div>
          <div className="grid">
            {calendarWeeks.map((week, weekIndex) => (
              <div key={`week-${weekIndex}`} className="grid grid-cols-7 border-b border-line last:border-b-0">
                {week.map(({ date, inPeriod, shifts }) => {
                  const dayHours = storeHours.find((entry) => entry.dayOfWeek === parseLocalDate(date).getDay());
                  const visibleShifts = showOnlyUnassigned ? shifts.filter((shift) => !shift.employeeId) : shifts;

                  return (
                    <div
                      key={date}
                      className={cx(
                        "flex min-h-[160px] flex-col border-r border-line p-2 last:border-r-0",
                        inPeriod ? "bg-white" : "bg-paper/60 text-ink/35"
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className={cx("text-sm font-black leading-tight", !inPeriod && "text-ink/35")}>
                            {shortDayLabel(date)}
                          </div>
                          <div className={cx("mt-1 text-xs font-semibold", inPeriod ? "text-ink/55" : "text-ink/30")}>
                            {dayHours && inPeriod ? `${formatTime(dayHours.openTime)}-${formatTime(dayHours.closeTime)}` : weekdayLong(date)}
                          </div>
                        </div>
                        {inPeriod && shifts.length > 0 && <Badge>{showOnlyUnassigned ? `${visibleShifts.length}/${shifts.length}` : shifts.length}</Badge>}
                      </div>

                      <div className="mt-2 grid flex-1 content-start gap-1.5">
                        {!inPeriod && <div className="h-16" />}
                        {inPeriod && visibleShifts.length === 0 && (
                          <div className="rounded-md border border-dashed border-line bg-paper/70 p-2 text-xs font-semibold text-ink/45">
                            {shifts.length === 0 ? "No shifts" : "No unassigned shifts"}
                          </div>
                        )}
                        {inPeriod &&
                          visibleShifts.map((shift) => {
                            const assignedUnavailable = shift.employeeId ? isEmployeeUnavailable(shift.employeeId, shift, availability) : false;
                            const isSelected = selectedShiftId === shift.id;
                            return (
                              <div
                                key={shift.id}
                                className={cx(
                                  "cursor-pointer rounded-md border p-2 transition hover:border-mall hover:bg-white",
                                  loadTone(shift.employeeId),
                                  isSelected ? "border-mall ring-2 ring-mall/20" : "border-line",
                                  assignedUnavailable && "border-warn bg-warn/10"
                                )}
                                onClick={() => onSelectShift?.(shift.id)}
                                onKeyDown={(event) => {
                                  if (event.key === "Enter" || event.key === " ") onSelectShift?.(shift.id);
                                }}
                                role={onSelectShift ? "button" : undefined}
                                tabIndex={onSelectShift ? 0 : undefined}
                                title="Edit shift"
                              >
                                <div className="flex items-start justify-between gap-2">
                                  <div className="min-w-0">
                                    <div className="text-xs font-black leading-tight">
                                      {formatTime(shift.startTime)}-{formatTime(shift.endTime)}
                                    </div>
                                    <div className="mt-0.5 truncate text-xs font-semibold text-ink/60">
                                      {shiftAssigneeLabel(shift, people)} / {shiftDurationHours(shift).toFixed(1)}h
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
                                  assignedUnavailable && (
                                    <div className="mt-1 flex items-center gap-1 text-xs font-semibold text-warn">
                                      <AlertTriangle size={13} />
                                      Conflict
                                    </div>
                                  )
                                )}
                              </div>
                            );
                          })}
                      </div>
                      {inPeriod && onAddShiftForDate && (
                        <button
                          className="mt-2 flex h-8 items-center justify-center gap-1 rounded-md border border-dashed border-line text-xs font-black text-ink/60 transition hover:border-mall hover:bg-mall/10 hover:text-mall"
                          onClick={() => onAddShiftForDate(date)}
                          type="button"
                        >
                          <Plus size={14} />
                          Shift
                        </button>
                      )}
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
  coverageRequests = [],
  onRequestCoverage
}: {
  shifts: Shift[];
  coverageRequests?: CoverageRequest[];
  onRequestCoverage: (shiftId: string) => void;
}) {
  if (shifts.length === 0) {
    return <div className="rounded-lg border border-dashed border-line p-6 text-sm text-ink/60">No assigned shifts for this period.</div>;
  }

  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {shifts.map((shift) => {
        const coverageRequest = coverageRequests.find((request) => request.shiftId === shift.id && request.status !== "cancelled");
        const requestPending = coverageRequest?.status === "open" || coverageRequest?.status === "offered";
        const requestLabel =
          coverageRequest?.status === "open"
            ? "Request sent"
            : coverageRequest?.status === "offered"
              ? "Offer pending"
              : coverageRequest?.status === "approved"
                ? "Covered"
                : coverageRequest?.status === "rejected"
                  ? "Rejected"
                  : "Request coverage";

        return (
          <div key={shift.id} className="rounded-lg border border-line p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="font-black">{getDayName(shift.date)}</div>
                <div className="text-sm text-ink/65">
                  {formatTime(shift.startTime)}-{formatTime(shift.endTime)}
                </div>
              </div>
              <Badge tone={requestPending ? "warn" : "neutral"}>{requestPending ? "Coverage open" : `${shiftDurationHours(shift).toFixed(1)}h`}</Badge>
            </div>
            <Button
              variant={requestPending || coverageRequest?.status === "rejected" ? "ghost" : "secondary"}
              className={cx("mt-3 w-full", requestPending && "bg-paper text-ink/55")}
              onClick={() => onRequestCoverage(shift.id)}
              disabled={Boolean(coverageRequest)}
            >
              <Mail size={16} />
              {requestLabel}
            </Button>
          </div>
        );
      })}
    </div>
  );
}
