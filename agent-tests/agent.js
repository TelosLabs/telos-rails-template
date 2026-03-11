import { resolve } from "path";
import { readFileSync, writeFileSync, existsSync, unlinkSync, mkdirSync } from "fs";
import { chromium } from "playwright";
import { BASE_URL, MAX_STEPS, TESTS_DIR, ACTION_TIMEOUT } from "./config.js";
import { decideNextAction } from "./ai.js";
import { getPageSnapshot, executeAction } from "./browser.js";

function detectLoop(history) {
  const actions = history
    .filter(h => h.startsWith("Step "))
    .map(h => h.replace(/^Step \d+: /, ""));
  if (actions.length < 4) return false;
  const last4 = actions.slice(-4);
  if (last4.every(a => a === last4[0])) return true;
  if (last4[0] === last4[2] && last4[1] === last4[3] && last4[0] !== last4[1]) return true;
  return false;
}

function loadTestCases() {
  const md = readFileSync(resolve(TESTS_DIR, "tests.md"), "utf-8");
  return md
    .split("\n")
    .map((line) => line.replace(/^[-*]\s+/, "").trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"));
}

async function takeScreenshot(page, testIndex, label) {
  const dir = resolve(TESTS_DIR, "screenshots");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const filename = `test-${testIndex + 1}-${label}-${Date.now()}.png`;
  await page.screenshot({ path: resolve(dir, filename), fullPage: true });
  console.log(`  📸 Screenshot saved: screenshots/${filename}`);
}

async function runTest(browser, goal, testIndex, totalTests) {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`🧪 Test ${testIndex + 1}/${totalTests}: ${goal}`);
  console.log("=".repeat(60));

  const isMobile = /mobile\s+viewport/i.test(goal);
  const context = await browser.newContext(
    isMobile ? { viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true } : {}
  );
  const page = await context.newPage();

  const history = [];
  let steps = 0;
  let result = "timeout";
  let previousUrl = null;

  await page.goto(`${BASE_URL}/`, { timeout: ACTION_TIMEOUT });

  while (steps < MAX_STEPS) {
    if (detectLoop(history)) {
      console.log("\n⚠️ Loop detected — aborting test.");
      await takeScreenshot(page, testIndex, "loop");
      result = "fail";
      break;
    }
    steps += 1;
    const snapshot = await getPageSnapshot(page);
    const action = await decideNextAction({ goal, snapshot, history, previousUrl });
    previousUrl = snapshot.url;

    console.log(`  Step ${steps}: ${JSON.stringify(action)}`);
    history.push(`Step ${steps}: ${JSON.stringify(action)}`);

    try {
      const terminal = await executeAction(page, action, ACTION_TIMEOUT);
      if (terminal) {
        if (terminal.type === "done" && steps <= 1) {
          console.log("\n❌ FAIL: Agent reported \"done\" without any browser interaction. E2E tests require at least one browser action.");
          console.log(` Agent reason: ${terminal.reason}`);
          await takeScreenshot(page, testIndex, "fail");
          result = "fail";
        } else if (terminal.type === "done") {
          console.log(`\n✅ DONE: ${terminal.reason}`);
          result = "pass";
        } else {
          console.log(`\n❌ FAIL: ${terminal.reason}`);
          await takeScreenshot(page, testIndex, "fail");
          result = "fail";
        }
        break;
      }
    } catch (e) {
      const errMsg = e?.message?.split("\n")[0] || String(e);
      console.log(`  ⚠️ Action failed: ${errMsg}`);
      history.push(`  → Error: ${errMsg}`);
    }
  }

  if (steps >= MAX_STEPS) {
    console.log("\n⚠️ Reached max steps without completing the goal.");
    await takeScreenshot(page, testIndex, "timeout");
  }

  await context.close();
  return { goal, result, steps, history };
}

async function run() {
  const failuresPath = resolve(TESTS_DIR, "failures.md");

  if (existsSync(failuresPath)) {
    unlinkSync(failuresPath);
  }

  const testCases = loadTestCases();
  if (testCases.length === 0) {
    console.error("No test cases found in tests.md");
    process.exit(1);
  }

  console.log(`\n🚀 Running ${testCases.length} test case(s)...\n`);

  const browser = await chromium.launch({ headless: process.env.CI === "true" });
  const results = [];

  for (let i = 0; i < testCases.length; i++) {
    try {
      const result = await runTest(browser, testCases[i], i, testCases.length);
      results.push(result);
    } catch (e) {
      console.error(`\n💥 Test ${i + 1} crashed: ${e.message}`);
      results.push({ goal: testCases[i], result: "error", steps: 0, history: [`Crash: ${e.message}`] });
    }
  }

  await browser.close();

  console.log(`\n${"=".repeat(60)}`);
  console.log("📊 RESULTS SUMMARY");
  console.log("=".repeat(60));
  results.forEach((r, i) => {
    const icon = r.result === "pass" ? "✅" : r.result === "fail" ? "❌" : "⚠️";
    console.log(`  ${icon} Test ${i + 1}: [${r.result.toUpperCase()}] ${r.goal} (${r.steps} steps)`);
  });

  const passed = results.filter((r) => r.result === "pass").length;
  console.log(`\n  Total: ${passed}/${results.length} passed`);

  const failures = results.filter((r) => r.result !== "pass");
  if (failures.length > 0) {
    const lines = [`# Test Failures`, ``];
    failures.forEach((r, i) => {
      lines.push(`## ${i + 1}. [${r.result.toUpperCase()}] ${r.goal}`);
      lines.push(``);
      lines.push(`- **Result:** ${r.result}`);
      lines.push(`- **Steps taken:** ${r.steps}`);
      lines.push(``);
      lines.push(`### Action history`);
      lines.push(``);
      (r.history || []).forEach((h) => lines.push(`- ${h}`));
      lines.push(``);
      lines.push(`---`);
      lines.push(``);
    });
    writeFileSync(failuresPath, lines.join("\n"), "utf-8");
    console.log(`\n📄 Failure details written to: ${failuresPath}`);
    process.exit(1);
  }
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
