export type Role = "employee" | "manager";
export type ScheduleStatus = "draft" | "published" | "archived";
export type UnavailableType = "full_day" | "shift_template" | "custom_time_range";
export type CoverageStatus = "open" | "offered" | "approved" | "rejected" | "cancelled";
export type SwapStatus =
  | "pending_employee_response"
  | "declined_by_employee"
  | "pending_manager_approval"
  | "approved"
  | "rejected_by_manager"
  | "cancelled";

export type Employee = {
  id: string;
  name: string;
  email: string;
  role: Role;
  active: boolean;
};

export type StoreHours = {
  dayOfWeek: number;
  day: string;
  openTime: string;
  closeTime: string;
  label: string;
  active: boolean;
};

export type ShiftTemplate = {
  id: string;
  dayPattern: "weekday" | "weekend" | "sunday";
  name: string;
  startTime: string;
  endTime: string;
  active: boolean;
};

export type SchedulePeriod = {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  releaseDate: string;
  availabilityOpenAt: string;
  availabilityDeadlineAt: string;
  status: ScheduleStatus;
  publishedAt?: string;
};

export type Unavailability = {
  id: string;
  userId: string;
  date: string;
  unavailableType: UnavailableType;
  allDay: boolean;
  shiftTemplateId?: string;
  startTime?: string;
  endTime?: string;
  note?: string;
};

export type AvailabilitySubmission = {
  id: string;
  schedulePeriodId: string;
  userId: string;
  submittedAt?: string;
  note?: string;
  unavailable: Unavailability[];
};

export type Shift = {
  id: string;
  schedulePeriodId: string;
  date: string;
  startTime: string;
  endTime: string;
  employeeId?: string;
  externalAssigneeName?: string;
  notes?: string;
  originalEmployeeId?: string;
  originalStartTime?: string;
  originalEndTime?: string;
};

export type CoverageRequest = {
  id: string;
  shiftId: string;
  requestedById: string;
  claimedById?: string;
  status: CoverageStatus;
  reason: string;
  managerNote?: string;
};

export type SwapRequest = {
  id: string;
  requesterId: string;
  targetEmployeeId?: string;
  requesterShiftId: string;
  targetShiftId?: string;
  status: SwapStatus;
  reason: string;
  managerNote?: string;
};

export type AuditEntry = {
  id: string;
  actorId: string;
  action: string;
  entityType: string;
  entityId: string;
  summary: string;
  createdAt: string;
};

export type NotificationEntry = {
  id: string;
  userId?: string;
  type: string;
  subject: string;
  status: "queued" | "sent" | "failed";
  createdAt: string;
};

export const store = {
  id: "store_wem",
  name: "Men Are From Mars",
  timezone: "America/Edmonton",
  availabilityOpenDays: 5,
  availabilityDeadlineDays: 2,
  releaseDays: [14, 31]
};

export const employees: Employee[] = [
  {
    id: "emp_manager",
    name: "M. Kodithuwakku",
    email: "m.kodithuwakku803@gmail.com",
    role: "manager",
    active: true
  },
  {
    id: "emp_ualberta",
    name: "Kodithuw UAlberta",
    email: "kodithuw@ualberta.ca",
    role: "employee",
    active: true
  },
  {
    id: "emp_hockey",
    name: "M. Kodithuwakku Hockey",
    email: "m.kodithuwakku.hockey@gmail.com",
    role: "employee",
    active: true
  },
  {
    id: "emp_bobby",
    name: "Bobby Cazby",
    email: "bobby.cazby@gmail.com",
    role: "employee",
    active: true
  }
];

export const storeHours: StoreHours[] = [
  { dayOfWeek: 1, day: "Monday", openTime: "10:00", closeTime: "21:00", label: "Mall hours", active: true },
  { dayOfWeek: 2, day: "Tuesday", openTime: "10:00", closeTime: "21:00", label: "Mall hours", active: true },
  { dayOfWeek: 3, day: "Wednesday", openTime: "10:00", closeTime: "21:00", label: "Mall hours", active: true },
  { dayOfWeek: 4, day: "Thursday", openTime: "10:00", closeTime: "21:00", label: "Mall hours", active: true },
  { dayOfWeek: 5, day: "Friday", openTime: "10:00", closeTime: "21:00", label: "Mall hours", active: true },
  { dayOfWeek: 6, day: "Saturday", openTime: "10:00", closeTime: "21:00", label: "Mall hours", active: true },
  { dayOfWeek: 0, day: "Sunday", openTime: "11:00", closeTime: "18:00", label: "Sunday hours", active: true }
];

export const shiftTemplates: ShiftTemplate[] = [
  { id: "tpl_weekday_open", dayPattern: "weekday", name: "Open", startTime: "09:45", endTime: "15:45", active: true },
  { id: "tpl_weekday_close", dayPattern: "weekday", name: "Close", startTime: "15:15", endTime: "21:15", active: true },
  { id: "tpl_weekend_open", dayPattern: "weekend", name: "Open", startTime: "09:45", endTime: "15:45", active: true },
  { id: "tpl_weekend_mid", dayPattern: "weekend", name: "Mid", startTime: "12:00", endTime: "18:00", active: true },
  { id: "tpl_weekend_close", dayPattern: "weekend", name: "Close", startTime: "15:15", endTime: "21:15", active: true },
  { id: "tpl_sunday_open", dayPattern: "sunday", name: "Sunday Open", startTime: "10:45", endTime: "14:45", active: true },
  { id: "tpl_sunday_close", dayPattern: "sunday", name: "Sunday Close", startTime: "14:15", endTime: "18:15", active: true }
];

export const schedulePeriod: SchedulePeriod = {
  id: "period_july_15_31",
  name: "July 15-31, 2026",
  startDate: "2026-07-15",
  endDate: "2026-07-31",
  releaseDate: "2026-07-14",
  availabilityOpenAt: "2026-07-06",
  availabilityDeadlineAt: "2026-07-12",
  status: "draft"
};

export const availabilitySubmissions: AvailabilitySubmission[] = [
  {
    id: "av_ualberta",
    schedulePeriodId: schedulePeriod.id,
    userId: "emp_ualberta",
    submittedAt: "2026-07-10T17:20:00.000Z",
    note: "Class before lunch.",
    unavailable: [
      {
        id: "u_ualberta_17",
        userId: "emp_ualberta",
        date: "2026-07-17",
        unavailableType: "custom_time_range",
        allDay: false,
        startTime: "09:00",
        endTime: "14:00",
        note: "Morning class"
      }
    ]
  },
  {
    id: "av_hockey",
    schedulePeriodId: schedulePeriod.id,
    userId: "emp_hockey",
    submittedAt: "2026-07-10T21:03:00.000Z",
    note: "Away on the weekend.",
    unavailable: [
      {
        id: "u_hockey_18",
        userId: "emp_hockey",
        date: "2026-07-18",
        unavailableType: "full_day",
        allDay: true,
        note: "Family event"
      },
      {
        id: "u_hockey_19",
        userId: "emp_hockey",
        date: "2026-07-19",
        unavailableType: "full_day",
        allDay: true,
        note: "Family event"
      }
    ]
  },
  {
    id: "av_bobby",
    schedulePeriodId: schedulePeriod.id,
    userId: "emp_bobby",
    submittedAt: "2026-07-11T15:40:00.000Z",
    note: "Can close most nights.",
    unavailable: [
      {
        id: "u_bobby_21",
        userId: "emp_bobby",
        date: "2026-07-21",
        unavailableType: "shift_template",
        allDay: false,
        shiftTemplateId: "tpl_weekday_open",
        startTime: "09:45",
        endTime: "15:45",
        note: "Morning appointment"
      }
    ]
  }
];

export const initialShifts: Shift[] = [
  { id: "shift_1", schedulePeriodId: schedulePeriod.id, date: "2026-07-15", startTime: "09:45", endTime: "15:45", employeeId: "emp_manager", originalEmployeeId: "emp_manager", originalStartTime: "09:45", originalEndTime: "15:45" },
  { id: "shift_2", schedulePeriodId: schedulePeriod.id, date: "2026-07-15", startTime: "15:15", endTime: "21:15", employeeId: "emp_bobby", originalEmployeeId: "emp_bobby", originalStartTime: "15:15", originalEndTime: "21:15" },
  { id: "shift_3", schedulePeriodId: schedulePeriod.id, date: "2026-07-16", startTime: "09:45", endTime: "15:45", employeeId: "emp_ualberta", originalEmployeeId: "emp_ualberta", originalStartTime: "09:45", originalEndTime: "15:45" },
  { id: "shift_4", schedulePeriodId: schedulePeriod.id, date: "2026-07-16", startTime: "15:15", endTime: "21:15", employeeId: "emp_hockey", originalEmployeeId: "emp_hockey", originalStartTime: "15:15", originalEndTime: "21:15" },
  { id: "shift_5", schedulePeriodId: schedulePeriod.id, date: "2026-07-17", startTime: "09:45", endTime: "15:45", employeeId: "emp_bobby", originalEmployeeId: "emp_bobby", originalStartTime: "09:45", originalEndTime: "15:45" },
  { id: "shift_6", schedulePeriodId: schedulePeriod.id, date: "2026-07-17", startTime: "15:15", endTime: "21:15", employeeId: "emp_manager", originalEmployeeId: "emp_manager", originalStartTime: "15:15", originalEndTime: "21:15" },
  { id: "shift_7", schedulePeriodId: schedulePeriod.id, date: "2026-07-18", startTime: "09:45", endTime: "15:45", employeeId: "emp_ualberta", originalEmployeeId: "emp_ualberta", originalStartTime: "09:45", originalEndTime: "15:45" },
  { id: "shift_8", schedulePeriodId: schedulePeriod.id, date: "2026-07-18", startTime: "12:00", endTime: "18:00", employeeId: "emp_hockey", originalEmployeeId: "emp_hockey", originalStartTime: "12:00", originalEndTime: "18:00" },
  { id: "shift_9", schedulePeriodId: schedulePeriod.id, date: "2026-07-18", startTime: "15:15", endTime: "21:15", employeeId: "emp_bobby", originalEmployeeId: "emp_bobby", originalStartTime: "15:15", originalEndTime: "21:15" },
  { id: "shift_10", schedulePeriodId: schedulePeriod.id, date: "2026-07-19", startTime: "10:45", endTime: "14:45", employeeId: "emp_manager", originalEmployeeId: "emp_manager", originalStartTime: "10:45", originalEndTime: "14:45" },
  { id: "shift_11", schedulePeriodId: schedulePeriod.id, date: "2026-07-19", startTime: "14:15", endTime: "18:15", employeeId: "emp_ualberta", originalEmployeeId: "emp_ualberta", originalStartTime: "14:15", originalEndTime: "18:15" }
];

export const coverageRequests: CoverageRequest[] = [
  {
    id: "cov_1",
    shiftId: "shift_6",
    requestedById: "emp_manager",
    status: "open",
    reason: "Need coverage while handling a manager task."
  }
];

export const swapRequests: SwapRequest[] = [
  {
    id: "swap_1",
    requesterId: "emp_ualberta",
    targetEmployeeId: "emp_bobby",
    requesterShiftId: "shift_7",
    targetShiftId: "shift_9",
    status: "pending_employee_response",
    reason: "Trying to move to an evening shift."
  }
];

export const initialAuditLog: AuditEntry[] = [
  {
    id: "audit_1",
    actorId: "emp_manager",
    action: "draft_created",
    entityType: "SchedulePeriod",
    entityId: schedulePeriod.id,
    summary: "Generated draft period from Men Are From Mars defaults.",
    createdAt: "2026-07-06T19:10:00.000Z"
  }
];

export const initialNotifications: NotificationEntry[] = [
  {
    id: "note_1",
    userId: "emp_manager",
    type: "coverage_opened",
    subject: "A shift is open for coverage",
    status: "queued",
    createdAt: "2026-07-06T19:15:00.000Z"
  }
];

export function getDatesInPeriod(period: SchedulePeriod) {
  const dates: string[] = [];
  const cursor = new Date(`${period.startDate}T12:00:00`);
  const end = new Date(`${period.endDate}T12:00:00`);

  while (cursor <= end) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setDate(cursor.getDate() + 1);
  }

  return dates;
}

export function toMinutes(value: string) {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

export function formatTime(value: string) {
  const minutes = toMinutes(value);
  const hour24 = Math.floor(minutes / 60);
  const minute = minutes % 60;
  const hour = hour24 % 12 || 12;
  const suffix = hour24 >= 12 ? "PM" : "AM";
  return `${hour}:${minute.toString().padStart(2, "0")} ${suffix}`;
}

export function getDayName(date: string) {
  return new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric" }).format(
    new Date(`${date}T12:00:00`)
  );
}

export function dayOfWeek(date: string) {
  return new Date(`${date}T12:00:00`).getDay();
}

export function templatePatternForDate(date: string): ShiftTemplate["dayPattern"] {
  const day = dayOfWeek(date);
  if (day === 0) return "sunday";
  if (day === 5 || day === 6) return "weekend";
  return "weekday";
}

export function shiftDurationHours(shift: Pick<Shift, "startTime" | "endTime">) {
  const start = toMinutes(shift.startTime);
  const end = toMinutes(shift.endTime);

  if (end <= start) return 0;
  return (end - start) / 60;
}

export function rangesOverlap(startA: string, endA: string, startB: string, endB: string) {
  return toMinutes(startA) < toMinutes(endB) && toMinutes(startB) < toMinutes(endA);
}

export function isEmployeeUnavailable(
  employeeId: string,
  shift: Pick<Shift, "date" | "startTime" | "endTime">,
  submissions: AvailabilitySubmission[]
) {
  const submission = submissions.find((item) => item.userId === employeeId);
  if (!submission) return false;

  return submission.unavailable.some((entry) => {
    if (entry.date !== shift.date) return false;
    if (entry.allDay || entry.unavailableType === "full_day") return true;
    if (!entry.startTime || !entry.endTime) return false;
    return rangesOverlap(shift.startTime, shift.endTime, entry.startTime, entry.endTime);
  });
}

export function availableEmployeesForShift(
  shift: Pick<Shift, "date" | "startTime" | "endTime">,
  people: Employee[],
  submissions: AvailabilitySubmission[]
) {
  return people.filter((person) => person.active && !isEmployeeUnavailable(person.id, shift, submissions));
}

export function generateDefaultShifts(period: SchedulePeriod) {
  return getDatesInPeriod(period).flatMap((date, dayIndex) => {
    const pattern = templatePatternForDate(date);
    const templates = shiftTemplates.filter((template) => template.dayPattern === pattern && template.active);

    return templates.map((template, templateIndex) => ({
      id: `generated_${date}_${template.id}_${dayIndex}_${templateIndex}`,
      schedulePeriodId: period.id,
      date,
      startTime: template.startTime,
      endTime: template.endTime,
      employeeId: undefined,
      originalEmployeeId: undefined,
      originalStartTime: template.startTime,
      originalEndTime: template.endTime
    }));
  });
}

export function calculateHours(people: Employee[], shifts: Shift[], useOriginal = false) {
  const activePeople = people.filter((person) => person.active || shifts.some((shift) => shift.employeeId === person.id));
  const totals = activePeople.map((person) => {
    const assigned = shifts.filter((shift) => {
      const employeeId = useOriginal ? shift.originalEmployeeId : shift.employeeId;
      return employeeId === person.id;
    });
    const hours = assigned.reduce((sum, shift) => {
      const startTime = useOriginal ? shift.originalStartTime ?? shift.startTime : shift.startTime;
      const endTime = useOriginal ? shift.originalEndTime ?? shift.endTime : shift.endTime;
      return sum + shiftDurationHours({ startTime, endTime });
    }, 0);

    return {
      employeeId: person.id,
      name: person.name,
      shifts: assigned.length,
      hours
    };
  });

  const assignedPeople = totals.filter((total) => total.shifts > 0);
  const average = assignedPeople.length
    ? assignedPeople.reduce((sum, total) => sum + total.hours, 0) / assignedPeople.length
    : 0;

  return totals.map((total) => ({
    ...total,
    averageDelta: total.hours - average
  }));
}

export function buildHoursCsv(people: Employee[], shifts: Shift[]) {
  const finalTotals = calculateHours(people, shifts, false);
  const initialTotals = calculateHours(people, shifts, true);
  const rows = [["Employee", "Initial published hours", "Final worked hours", "Final shifts"]];

  finalTotals.forEach((finalTotal) => {
    const initial = initialTotals.find((entry) => entry.employeeId === finalTotal.employeeId);
    rows.push([
      finalTotal.name,
      (initial?.hours ?? 0).toFixed(2),
      finalTotal.hours.toFixed(2),
      String(finalTotal.shifts)
    ]);
  });

  return rows
    .map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(","))
    .join("\n");
}
