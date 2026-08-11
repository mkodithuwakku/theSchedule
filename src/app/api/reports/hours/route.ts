import { NextResponse } from "next/server";
import { buildHoursCsv, employees, initialShifts } from "@/lib/demo-data";
import { getCurrentAccess } from "@/lib/access";

export async function GET() {
  const access = await getCurrentAccess();
  if (!access) return NextResponse.json({ error: "Sign in with an active employee account." }, { status: 401 });
  if (access.role !== "manager") return NextResponse.json({ error: "Only managers can export hours." }, { status: 403 });

  const csv = buildHoursCsv(employees, initialShifts);

  return new NextResponse(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": 'attachment; filename="the-schedule-hours.csv"'
    }
  });
}
