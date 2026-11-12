import puppeteer from "/tmp/pw/node_modules/puppeteer-core/lib/puppeteer/puppeteer-core.js";
import { createServer } from "node:http";
import { readFileSync, existsSync, mkdirSync } from "node:fs";
import { extname, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const extPath = join(root, "extension");
const outDir = join(root, "web/screenshots");
mkdirSync(outDir, { recursive: true });

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".md": "text/plain; charset=utf-8"
};

function startServer(port) {
  const server = createServer((req, res) => {
    const url = new URL(req.url, "http://127.0.0.1");
    let pathname = decodeURIComponent(url.pathname);
    if (pathname.endsWith("/")) pathname += "index.html";
    const file = join(root, pathname);
    if (!file.startsWith(root) || !existsSync(file)) {
      res.writeHead(404);
      res.end("not found");
      return;
    }
    res.writeHead(200, { "Content-Type": MIME[extname(file)] || "application/octet-stream" });
    res.end(readFileSync(file));
  });
  return new Promise((resolve) => {
    server.listen(port, "127.0.0.1", () => resolve(server));
  });
}

const port = 8766;
const server = await startServer(port);
const base = `http://127.0.0.1:${port}`;
console.log("server", base);

const xvfb = spawn("Xvfb", [":93", "-screen", "0", "1400x900x24", "-ac"], { stdio: "ignore" });
process.env.DISPLAY = ":93";
await new Promise((r) => setTimeout(r, 400));

const results = { messaging: "not-run", screenshots: [] };

async function launch(withExtension) {
  const args = [
    "--no-sandbox",
    "--disable-setuid-sandbox",
    "--disable-dev-shm-usage",
    "--font-render-hinting=none",
    "--hide-scrollbars",
    "--window-size=1280,800"
  ];
  return puppeteer.launch({
    executablePath: "/usr/bin/google-chrome",
    headless: false,
    enableExtensions: withExtension ? [extPath] : false,
    args,
    defaultViewport: { width: 1280, height: 800, deviceScaleFactor: 2 },
    env: { ...process.env, DISPLAY: ":93" }
  });
}

async function shot(page, name) {
  const dest = join(outDir, name);
  await page.screenshot({ path: dest, type: "png" });
  results.screenshots.push(dest);
  console.log("saved", dest);
}

// 1) Fixture dashboard (no real key, official-shaped example)
{
  const browser = await launch(false);
  const page = await browser.newPage();
  page.on("pageerror", (err) => console.error("PAGEERROR", err.message));
  await page.goto(`${base}/web/index.html?fresh=1&guide=0&fixture=modelscope&open=modelscope`, {
    waitUntil: "networkidle0"
  });
  await page.waitForSelector(".drawer");
  await new Promise((r) => setTimeout(r, 500));
  const quota = await page.$eval(".card[data-id='modelscope'] .card-quota", (el) => el.textContent);
  const disabled = await page.$eval("#drawerFoot .primary", (el) => el.textContent.trim());
  console.log("fixture quota:", quota, "button:", disabled);
  if (!String(quota).includes("998.5")) throw new Error("fixture balance not shown");
  if (!String(disabled).includes("无每日签到")) throw new Error("checkin button should be disabled / 无每日签到");
  await shot(page, "modelscope-fixture-nocheckin.png");

  await page.goto(`${base}/extension/options.html`, { waitUntil: "networkidle0" });
  await new Promise((r) => setTimeout(r, 300));
  await shot(page, "extension-options.png");
  await browser.close();
}

// 2) Try real extension messaging
try {
  const browser = await launch(true);
  await new Promise((r) => setTimeout(r, 1500));
  const page = await browser.newPage();
  await page.goto(`${base}/web/index.html?fresh=1&guide=0&open=modelscope`, {
    waitUntil: "networkidle0"
  });
  await new Promise((r) => setTimeout(r, 1200));
  const chip = await page.$eval("#extChip", (el) => el.textContent.trim());
  console.log("ext chip:", chip);
  const ping = await page.evaluate(() => {
    return new Promise((resolve) => {
      const id = "smoke-ping";
      const timer = setTimeout(() => resolve({ ok: false, error: "timeout" }), 2000);
      window.addEventListener("message", function onMsg(e) {
        const d = e.data;
        if (!d || d.source !== "saibo-lingjidan-extension" || d.id !== id) return;
        window.removeEventListener("message", onMsg);
        clearTimeout(timer);
        resolve(d);
      });
      window.postMessage({ source: "saibo-lingjidan-page", id, type: "ping", payload: {} }, window.location.origin);
    });
  });
  console.log("ping result:", JSON.stringify(ping));
  if (ping && ping.ok && ping.result && ping.result.connected) {
    results.messaging = "ok";
    const checkin = await page.evaluate(() => {
      return new Promise((resolve) => {
        const id = "smoke-checkin";
        const timer = setTimeout(() => resolve({ ok: false, error: "timeout" }), 2000);
        window.addEventListener("message", function onMsg(e) {
          const d = e.data;
          if (!d || d.source !== "saibo-lingjidan-extension" || d.id !== id) return;
          window.removeEventListener("message", onMsg);
          clearTimeout(timer);
          resolve(d);
        });
        window.postMessage({ source: "saibo-lingjidan-page", id, type: "checkin", payload: { platformId: "modelscope" } }, window.location.origin);
      });
    });
    console.log("checkin result:", JSON.stringify(checkin));
    if (!(checkin && checkin.ok && checkin.result && checkin.result.claimed === false && checkin.result.status === "unsupported")) {
      results.messaging = "checkin-unexpected: " + JSON.stringify(checkin);
    }
    await shot(page, "dashboard-extension-connected.png");

    // try options page via extension id
    const extPage = await browser.newPage();
    const targets = await browser.targets();
    const extTarget = targets.find((t) => t.type() === "service_worker" && t.url().startsWith("chrome-extension://"));
    if (extTarget) {
      const extUrl = extTarget.url();
      const id = extUrl.split("/")[2];
      console.log("extension id:", id);
      await extPage.goto(`chrome-extension://${id}/options.html`, { waitUntil: "networkidle0" });
      await new Promise((r) => setTimeout(r, 300));
      await extPage.screenshot({ path: join(outDir, "extension-options-live.png"), type: "png" });
      results.screenshots.push(join(outDir, "extension-options-live.png"));
      console.log("saved options live");
    }
  } else {
    results.messaging = "no-reply: chip=" + chip + " ping=" + JSON.stringify(ping);
  }
  await browser.close();
} catch (err) {
  results.messaging = "error: " + err.message;
  console.error("extension smoke failed:", err);
}

server.close();
xvfb.kill("SIGTERM");
console.log("RESULT", JSON.stringify(results, null, 2));
if (!results.screenshots.length) process.exitCode = 1;
