import assert from "node:assert/strict";
import test from "node:test";
import {
  type AvailabilitySubmission, type Unavailability,
  generateDefaultShifts, isEmployeeUnavailable, schedulePeriod, shiftTemplates,
  availableEmployeesForShift
} from "../src/lib/demo-data";
import { autoAssignDraftShifts, getScheduleBlockingIssues } from "../src/lib/schedule-builder";

const person = { id: "employee", name: "Employee", email: "employee@example.com", role: "employee" as const, active: true };
const dates = { weekday: "2026-09-16", weekend: "2026-09-18", sunday: "2026-09-20" };

function submission(entry: Partial<Unavailability>): AvailabilitySubmission[] {
  return [{
    id: "submitted", schedulePeriodId: schedulePeriod.id, userId: person.id,
    submittedAt: "2026-09-10T12:00:00Z",
    unavailable: [{ id: "unavailable", userId: person.id, date: dates.weekday,
      allDay: false, unavailableType: "shift_template", ...entry }]
  }];
}

test("existing shift-specific submissions block only the selected weekday, weekend, or Sunday shift", () => {
  const shifts = generateDefaultShifts(schedulePeriod);
  for (const template of shiftTemplates) {
    const date = dates[template.dayPattern];
    const availability = submission({ date, shiftTemplateId: template.id, startTime: template.startTime, endTime: template.endTime });
    const original = structuredClone(availability);
    for (const shift of shifts.filter((item) => item.date === date)) {
      const selected = shift.startTime === template.startTime && shift.endTime === template.endTime;
      assert.equal(isEmployeeUnavailable(person.id, shift, availability), selected, `${template.id} against ${shift.startTime}-${shift.endTime}`);
      assert.equal(availableEmployeesForShift(shift, [person], availability).length, selected ? 0 : 1);
      assert.equal(getScheduleBlockingIssues([{ ...shift, employeeId: person.id }], availability, [person]).length, selected ? 1 : 0);
      assert.equal(autoAssignDraftShifts([shift], [person], availability)[0].employeeId, selected ? undefined : person.id);
    }
    assert.deepEqual(availability, original, "reading an existing submission must not rewrite it");
  }
});

test("custom time ranges still block overlapping shifts; full days block every shift", () => {
  const shifts = generateDefaultShifts(schedulePeriod).filter((shift) => shift.date === dates.weekday);
  const custom = submission({ unavailableType: "custom_time_range", startTime: "15:15", endTime: "21:15" });
  const fullDay = submission({ unavailableType: "full_day", allDay: true });
  for (const shift of shifts) {
    assert.equal(isEmployeeUnavailable(person.id, shift, custom), true);
    assert.equal(isEmployeeUnavailable(person.id, shift, fullDay), true);
  }
  assert.equal(isEmployeeUnavailable(person.id, { date: dates.weekday, startTime: "09:45", endTime: "15:15" }, custom), false);
  assert.equal(isEmployeeUnavailable(person.id, { ...shifts[0], date: "2026-09-17" }, fullDay), false);
  assert.equal(isEmployeeUnavailable("another-employee", shifts[0], fullDay), false);
});

test("template selections use submitted times and support older entries containing only a template ID", () => {
  const closing = { date: dates.weekday, startTime: "15:15", endTime: "21:15" };
  assert.equal(isEmployeeUnavailable(person.id, closing, submission({ shiftTemplateId: "tpl_weekday_close" })), true);
  const saved = submission({ shiftTemplateId: "tpl_weekday_close", startTime: "15:00", endTime: "21:00" });
  assert.equal(isEmployeeUnavailable(person.id, closing, saved), false);
  assert.equal(isEmployeeUnavailable(person.id, { ...closing, startTime: "15:00", endTime: "21:00" }, saved), true);
});
