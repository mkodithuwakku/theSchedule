import { rm } from "node:fs/promises";
import path from "node:path";

const testStatePath = path.join(process.cwd(), "data", "test-state.json");

await rm(testStatePath, { force: true });

console.log("Reset local UAT test state for a fresh dev run.");
