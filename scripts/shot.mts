/**
 * Screenshots pages for visual review.
 *   npx tsx scripts/shot.mts <user|-> <outDir> <path[@w]>...
 * Logs in as <user> (password "password123") unless "-".
 */
import { chromium } from "@playwright/test";

const [user, outDir, ...paths] = process.argv.slice(2);
const base = process.env.BASE_URL ?? "http://localhost:3000";
const browser = await chromium.launch();

for (const scheme of ["light", "dark"] as const) {
  const context = await browser.newContext({ colorScheme: scheme, deviceScaleFactor: 1 });
  const page = await context.newPage();
  if (user && user !== "-") {
    const response = await page.request.post(`${base}/api/auth/sign-in/username`, {
      data: { username: user, password: "password123" },
      headers: { Origin: base },
    });
    if (!response.ok()) throw new Error(`login failed: ${response.status()}`);
  }
  for (const entry of paths) {
    const [path, width = "1280"] = entry.split("@");
    await page.setViewportSize({ width: Number(width), height: Number(width) < 600 ? 844 : 860 });
    await page.goto(base + path, { waitUntil: "networkidle" });
    await page.waitForTimeout(400);
    const name = `${path.replace(/[^a-z0-9]+/gi, "_") || "root"}-${width}-${scheme}.png`;
    await page.screenshot({ path: `${outDir}/${name}`, fullPage: true });
    console.log(`${outDir}/${name}`);
  }
  await context.close();
}
await browser.close();
