const extractText = () => {
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const chunks = [];
  while (walker.nextNode()) {
    const t = walker.currentNode.nodeValue?.trim();
    if (t && t.length > 0) chunks.push(t);
    if (chunks.join(" ").length > 4000) break;
  }
  return chunks.join(" ").slice(0, 4000);
};

const extractControls = () => {
  function labelFor(el) {
    const aria = el.getAttribute("aria-label");
    const testid = el.getAttribute("data-testid");
    const text = (el.innerText || "").trim().slice(0, 80);
    const name = el.getAttribute("name");
    const placeholder = el.getAttribute("placeholder");
    const href = el.getAttribute("href");
    return aria || testid || text || name || placeholder || href || el.tagName;
  }

  const selector = [
    "a", "button", "input", "textarea", "select",
    "[role='button']", "[role='link']", "[role='tab']",
    "[role='menuitem']", "[role='option']",
    "[data-testid]", "[onclick]",
  ].join(",");
  const seen = new Set();
  return Array.from(document.querySelectorAll(selector))
    .filter((el) => {
      if (seen.has(el)) return false;
      seen.add(el);
      return true;
    })
    .slice(0, 120)
    .map((el) => {
      const ctrl = {
        tag: el.tagName.toLowerCase(),
        label: labelFor(el),
        testid: el.getAttribute("data-testid"),
        type: el.getAttribute("type"),
        href: el.getAttribute("href"),
        role: el.getAttribute("role"),
      };
      if (el.tagName === "SELECT") {
        ctrl.options = Array.from(el.options).map(o => o.textContent.trim()).slice(0, 10);
      }
      return ctrl;
    });
};

async function findInFrames(page, locatorFn) {
  const mainLocator = locatorFn(page);
  if (await mainLocator.count() > 0) return mainLocator.first();

  for (const frame of page.frames()) {
    if (frame === page.mainFrame()) continue;
    try {
      const frameLocator = locatorFn(frame);
      if (await frameLocator.count() > 0) return frameLocator.first();
    } catch (_) {
      continue;
    }
  }

  return mainLocator.first();
}

export async function getPageSnapshot(page) {
  const title = await page.title();
  const url = page.url();

  let visibleText = await page.evaluate(extractText);
  let controls = await page.evaluate(extractControls);

  for (const frame of page.frames()) {
    if (frame === page.mainFrame()) continue;
    try {
      const frameText = await frame.evaluate(extractText);
      if (frameText) visibleText += " " + frameText;
      const frameControls = await frame.evaluate(extractControls);
      controls.push(...frameControls);
    } catch (_) {
      continue;
    }
  }

  return { title, url, visibleText, controls };
}

export async function executeAction(page, action, timeout) {
  if (action.type === "goto") {
    await page.goto(action.url, { timeout });
  } else if (action.type === "click" && action.testid) {
    const el = await findInFrames(page, (ctx) => ctx.getByTestId(action.testid));
    await el.click({ timeout });
  } else if (action.type === "click_text" && action.text) {
    const link = await findInFrames(page, (ctx) => ctx.getByRole("link", { name: action.text, exact: false }));
    if (await link.count() > 0) {
      await link.click({ timeout });
    } else {
      const btn = await findInFrames(page, (ctx) => ctx.getByRole("button", { name: action.text, exact: false }));
      if (await btn.count() > 0) {
        await btn.click({ timeout });
      } else {
        const txt = await findInFrames(page, (ctx) => ctx.getByText(action.text, { exact: false }));
        await txt.click({ timeout });
      }
    }
  } else if (action.type === "fill" && action.testid) {
    const el = await findInFrames(page, (ctx) => ctx.getByTestId(action.testid));
    await el.fill(action.value ?? "", { timeout });
  } else if (action.type === "fill_by_label" && action.label) {
    const label = action.label;
    const val = action.value ?? "";
    const byLabel = await findInFrames(page, (ctx) => ctx.getByLabel(label));
    if (await byLabel.count() > 0) {
      await byLabel.fill(val, { timeout });
    } else {
      const byPlaceholder = await findInFrames(page, (ctx) => ctx.getByPlaceholder(label));
      if (await byPlaceholder.count() > 0) {
        await byPlaceholder.fill(val, { timeout });
      } else {
        const byName = await findInFrames(page, (ctx) => ctx.locator(`[name="${label}"]`));
        await byName.fill(val, { timeout });
      }
    }
  } else if (action.type === "scroll") {
    const px = action.direction === "up" ? -600 : 600;
    await page.evaluate((amount) => window.scrollBy(0, amount), px);
  } else if (action.type === "key_press" && action.key) {
    await page.keyboard.press(action.key);
  } else if (action.type === "select") {
    const val = action.value ?? "";
    if (action.testid) {
      const el = await findInFrames(page, (ctx) => ctx.getByTestId(action.testid));
      await el.selectOption({ label: val }, { timeout });
    } else if (action.label) {
      const el = await findInFrames(page, (ctx) => ctx.getByLabel(action.label));
      await el.selectOption({ label: val }, { timeout });
    }
  } else if (action.type === "assert_text" && action.text) {
    const el = await findInFrames(page, (ctx) => ctx.locator(`text=${action.text}`));
    await el.waitFor({ state: 'visible', timeout });
    console.log(`  ✓ Found text: "${action.text}"`);
  } else if (action.type === "done" || action.type === "fail") {
    return action;
  } else {
    console.log(`  ⚠️ Unknown action: ${JSON.stringify(action)}`);
  }

  await page.waitForTimeout(500);
  return null;
}
