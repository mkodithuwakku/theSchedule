import type { Employee } from "@/lib/demo-data";

// Manager access also includes personal availability, shifts, coverage, and swaps.
export const DEFAULT_MANAGERS: Employee[] = [
  { id: "emp_manager", name: "M. Kodithuwakku", email: "m.kodithuwakku803@gmail.com", role: "manager", active: true },
  { id: "emp_morris", name: "A. T. Morris", email: "a.t.morris03@gmail.com", role: "manager", active: true }
];
