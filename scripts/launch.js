/**
 * Open the installed app in the browser, starting its server first when it is not
 * running. The launchers that install-linux.sh and install-windows.bat write call it;
 * "--stop" stops the server.
 */
import { spawn } from "node:child_process";
import { openSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const NAME = "Mandelbrot Odyssey";
const PORT = 5191;
const ADDRESS = `http://localhost:${PORT}/`;
const APP = dirname(dirname(fileURLToPath(import.meta.url)));
const PID = join(APP, "server.pid");
const LOG = join(APP, "server.log");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** "ours" when the app answers on the port, "other" when another program does, null when none does. */
async function probe() {
  try {
    const res = await fetch(ADDRESS, { signal: AbortSignal.timeout(2000) });
    return (await res.text()).includes(`<title>${NAME}`) ? "ours" : "other";
  } catch {
    return null;
  }
}

/** Say what went wrong, also on the desktop when there is no terminal to read it in. */
function fail(message) {
  console.error(message);
  if (process.platform === "linux" && !process.stdout.isTTY) spawn("notify-send", [NAME, message], { stdio: "ignore" }).on("error", () => {});
  process.exitCode = 1;
}

function open() {
  const opener =
    process.platform === "win32"
      ? spawn(`start "" "${ADDRESS}"`, { shell: true, stdio: "ignore", windowsHide: true })
      : spawn(process.platform === "darwin" ? "open" : "xdg-open", [ADDRESS], { stdio: "ignore" });
  opener.on("error", () => console.log(`Open ${ADDRESS} in your browser.`));
}

async function main() {
  const state = await probe();
  if (process.argv[2] === "--stop") {
    // Only stop the server when it is ours: an old pid may belong to another program now.
    if (state === "ours") {
      try {
        process.kill(Number(readFileSync(PID, "utf8")));
      } catch {
        // Already stopped.
      }
    }
    rmSync(PID, { force: true });
    return;
  }
  if (state === "other") return fail(`Port ${PORT} is used by another program: close it, then open ${NAME} again.`);
  if (state === null) {
    const log = openSync(LOG, "w");
    const vite = join(APP, "node_modules", "vite", "bin", "vite.js");
    const server = spawn(process.execPath, [vite, "preview", "--port", String(PORT), "--strictPort"], {
      cwd: APP,
      detached: true,
      windowsHide: true,
      stdio: ["ignore", log, log],
    });
    writeFileSync(PID, String(server.pid));
    server.unref();
    let up = false;
    for (let i = 0; i < 75 && !up; i++) {
      await sleep(200);
      up = (await probe()) === "ours";
    }
    if (!up) return fail(`${NAME} did not start. What it said is in ${LOG}`);
  }
  console.log(`${NAME} is open at ${ADDRESS}`);
  open();
}

await main();
