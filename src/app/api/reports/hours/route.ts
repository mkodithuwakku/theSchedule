import { NextResponse } from "next/server";
import { buildHoursCsv, employees, initialShifts } from "@/lib/demo-data";

export function GET() {
  const csv = buildHoursCsv(employees, initialShifts);

  return new NextResponse(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": 'attachment; filename="the-schedule-hours.csv"'
    }
  });
}
