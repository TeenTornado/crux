// Capture README screenshots of the new features by driving the running dev
// server through the demo flow.  node eval/shoot-readme.mjs
import puppeteer from "puppeteer-core";
import { mkdirSync } from "node:fs";

const OUT = "docs/screenshots";
mkdirSync(OUT, { recursive: true });

const clickByText = (page, text, tag = "button") =>
  page.evaluate(
    ({ text, tag }) => {
      const el = [...document.querySelectorAll(tag)].find((b) =>
        (b.textContent || "").includes(text)
      );
      if (el) (el instanceof HTMLElement) && el.click();
      return Boolean(el);
    },
    { text, tag }
  );

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: "new",
  args: ["--window-size=1440,900"],
});
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900 });

// ── run the demo end-to-end (extract → reconcile → agent auto-act) ──────────
await page.goto("http://localhost:3000/app", { waitUntil: "networkidle2", timeout: 60000 });
await sleep(1500);
const clicked = await clickByText(page, "Load demo corpus");
console.log("load demo clicked:", clicked);
// the agent's autonomous act sets this exact status when it lands
await page.waitForFunction(
  () => document.body.innerText.includes("Agent: experiment designed autonomously"),
  { timeout: 90000 }
);
await sleep(1200);

// 1 · full workspace with colored verdict edges + auto-opened experiment
await page.screenshot({ path: `${OUT}/08-workspace-agent-acted.png` });
console.log("08 workspace ✓");

// 2 · the right panel: verdict card + engine badge + POPPER plan (agent-selected)
await page.screenshot({
  path: `${OUT}/09-verdict-experiment-ondevice.png`,
  clip: { x: 1040, y: 0, width: 400, height: 900 },
});
console.log("09 verdict/experiment ✓");

// 3 · Agent State expanded
await page.evaluate(() => {
  const b = document.querySelector('button[aria-label="Toggle agent state"]');
  if (b instanceof HTMLElement) b.click();
});
await sleep(400);
await page.screenshot({
  path: `${OUT}/10-agent-state.png`,
  clip: { x: 1040, y: 0, width: 400, height: 520 },
});
console.log("10 agent state ✓");

// 4 · Ask tab → the narrated run card with timings
await clickByText(page, "Ask");
await sleep(700);
await page.screenshot({
  path: `${OUT}/11-agent-run-card.png`,
  clip: { x: 1040, y: 0, width: 400, height: 900 },
});
console.log("11 run card ✓");

// 5 · compute-mode selector popover
await page.evaluate(() => {
  const b = [...document.querySelectorAll("header button")].find((x) =>
    (x.textContent || "").match(/Local|Auto|Cloud/)
  );
  if (b instanceof HTMLElement) b.click();
});
await sleep(400);
await page.screenshot({
  path: `${OUT}/12-mode-selector.png`,
  clip: { x: 980, y: 0, width: 460, height: 560 },
});
console.log("12 mode selector ✓");

await browser.close();
console.log("done");
