import { client, BASE_URL, MODEL } from "./config.js";

const MAX_RETRIES = 4;

async function callWithRetry(fn) {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (e) {
      const isRateLimit = e?.status === 429 || e?.code === "rate_limit_exceeded";
      if (isRateLimit && attempt < MAX_RETRIES) {
        const retryAfter = parseFloat(e?.headers?.["retry-after"]) || 0;
        const waitMs = Math.max(retryAfter * 1000, Math.pow(2, attempt) * 2000);
        console.log(`  ⏳ Rate limited — waiting ${(waitMs / 1000).toFixed(1)}s (attempt ${attempt + 1}/${MAX_RETRIES})...`);
        await new Promise(r => setTimeout(r, waitMs));
        continue;
      }
      throw e;
    }
  }
}

export async function decideNextAction({ goal, snapshot, history, previousUrl }) {
  const prompt = `
    You are a QA agent controlling a browser. Execute the goal step by step.

    GOAL: ${goal}

    RULES:
    - You MUST interact with the browser (click, fill, navigate, etc.) to achieve the goal. You are a BROWSER automation agent - every goal must be accomplished through browser interaction.
    - If the goal cannot be accomplished through browser interaction with the application, use "fail" with reason explaining why. NEVER use "done" without having performed at least one browser action.
    - Focus on NAVIGATING and INTERACTING to achieve the goal.
    - Do NOT use assert_text unless the goal explicitly says to verify/confirm/assert text.
    - After submitting a form (like login), if the URL or page content changed, assume success and move to the NEXT part of the goal.
    - Use "done" ONLY when ALL parts of the goal are completed through browser interaction.
    - If you see an application error page (e.g. NoMethodError, 500 error, stack trace, exception), immediately use "fail" with a description of the error. Do NOT retry or try alternative approaches for application errors.
    - Use "fail" if you are stuck after 2-3 attempts at the same step, or if the page shows an error.
    - CRITICAL: NEVER repeat the same action or cycle between the same 2-3 actions. Review your action history below — if you see a repeating pattern, you MUST try a completely different approach or use "fail". You will be terminated if you loop.
    - Prefer clicking links/buttons by their visible text with click_text.
    - When you see tabs or navigation items, click them by their text.
    - ALWAYS use ${BASE_URL} as the base for any goto URL. NEVER hardcode a different host or port.
    - Use "scroll" to reveal content below the fold before trying to interact with elements not yet visible.
    - Use "key_press" with key "Enter" to submit search forms or forms without a visible submit button.
    - For <select> dropdowns, use the "select" action with one of the option labels listed in the controls. If "select" fails, the control may not be a native <select> — try click_text with the option text instead.
    EMAIL CONFIRMATION:
    - When you need to handle any email-based confirmation (account activation, code verification, password reset, etc.), navigate to ${BASE_URL}/letter_opener
    - This page shows all sent emails. Find and click the relevant email.
    - Read the email content carefully. The confirmation method varies:
      * If there's a confirmation link/button, click it.
      * If there's a confirmation code or token, copy it, navigate back to the app, and enter it in the appropriate field.
      * If there are other instructions, follow them accordingly.

    Current page:
    - title: ${snapshot.title}
    - url: ${snapshot.url}
    - previous url: ${previousUrl || "(first step)"}
    - navigation detected: ${previousUrl && previousUrl !== snapshot.url ? `YES (changed from ${previousUrl})` : "NO"}
    - visible text (partial): ${snapshot.visibleText.slice(0, 4000)}

    Available controls:
    ${snapshot.controls.map(c => {
      let desc = `- ${c.tag} label="${c.label}"`;
      if (c.testid) desc += ` testid="${c.testid}"`;
      if (c.type) desc += ` type="${c.type}"`;
      if (c.role) desc += ` role="${c.role}"`;
      if (c.href) desc += ` href="${c.href}"`;
      if (c.options) desc += ` options=[${c.options.join(", ")}]`;
      return desc;
    }).join("\n")}

    Action history:
    ${history.length ? history.join("\n") : "(none yet)"}

    Available actions (return ONE as JSON):
    {"type":"goto","url":"${BASE_URL}/..."}
    {"type":"click","testid":"..."}
    {"type":"click_text","text":"..."}
    {"type":"fill","testid":"...","value":"..."}
    {"type":"fill_by_label","label":"...","value":"..."}
    {"type":"scroll","direction":"down|up"}
    {"type":"key_press","key":"Enter|Tab|Escape|..."}
    {"type":"select","testid":"...","value":"option text"}
    {"type":"select","label":"...","value":"option text"}
    {"type":"assert_text","text":"..."}
    {"type":"done","reason":"..."}
    {"type":"fail","reason":"..."}

    BEFORE YOU RESPOND — break the GOAL into its individual steps and check your action history:
    - Have you completed ALL steps, not just some?
    - If the goal says "confirm" or "verify" you are on a different page, check "navigation detected" above. YES means the URL changed — that IS the confirmation. No further clicks or scrolling needed for that step.
    - Only respond with "done" when EVERY part of the goal is satisfied. Only respond with further actions if a specific step is still pending.

    Return ONLY valid JSON, nothing else.`;

  const resp = await callWithRetry(() =>
    client.responses.create({ model: MODEL, input: prompt })
  );

  const raw = resp.output_text.trim().replace(/^```json\n?/, "").replace(/\n?```$/, "");
  return JSON.parse(raw);
}
