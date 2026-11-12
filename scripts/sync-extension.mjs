import { cpSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dest = join(root, "extension/vendor");
for (const name of ["adapters", "rates", "deals"]) {
  rmSync(join(dest, name), { recursive: true, force: true });
  mkdirSync(join(dest, name), { recursive: true });
  cpSync(join(root, name), join(dest, name), { recursive: true });
}
console.log("synced adapters/, rates/ and deals/ into extension/vendor/");
