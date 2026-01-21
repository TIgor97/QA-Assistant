async function getActiveTabId() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab?.id;
}

async function ensureContentScript(tabId) {
  try {
    await chrome.tabs.sendMessage(tabId, { type: "QA_PING" });
    return true;
  } catch {
    await chrome.scripting.executeScript({ target: { tabId }, files: ["content.js"] });
    await chrome.scripting.insertCSS({ target: { tabId }, files: ["content.css"] });
    return true;
  }
}

function buildOwaspChecklist(result) {
  const headers = result?.headers || {};
  return [
    { name: "A01 Broken Access Control", status: "review", severity: "high" },
    { name: "A02 Cryptographic Failures", status: headers["strict-transport-security"] ? "ok" : "warn", severity: "high" },
    { name: "A03 Injection", status: "review", severity: "high" },
    { name: "A05 Security Misconfiguration", status: headers["content-security-policy"] ? "ok" : "warn", severity: "high" },
    { name: "A06 Vulnerable Components", status: "review", severity: "medium" },
    { name: "A07 Auth Failures", status: "review", severity: "high" },
    { name: "A08 Data Integrity", status: "review", severity: "medium" },
    { name: "A09 Logging & Monitoring", status: "review", severity: "medium" },
    { name: "A10 SSRF", status: "review", severity: "medium" }
  ];
}

function toMarkdown(cases) {
  return cases
    .map((item, index) => {
      const steps = Array.isArray(item.steps) ? item.steps.map((s) => `- ${s}`).join("\n") : "";
      return `### ${index + 1}. ${item.title || "Test case"}\n` +
        `**Target:** ${item.target || "-"}\n\n` +
        `**Steps:**\n${steps || "-"}\n\n` +
        `**Expected:** ${item.expected || "-"}`;
    })
    .join("\n\n");
}

function toCsv(cases) {
  const rows = ["title,target,steps,expected"];
  cases.forEach((item) => {
    const title = JSON.stringify(item.title || "Test case");
    const target = JSON.stringify(item.target || "");
    const steps = JSON.stringify(Array.isArray(item.steps) ? item.steps.join(" | ") : "");
    const expected = JSON.stringify(item.expected || "");
    rows.push([title, target, steps, expected].join(","));
  });
  return rows.join("\n");
}

function toTxt(cases) {
  return cases
    .map((item, index) => {
      const steps = Array.isArray(item.steps) ? item.steps.map((s) => `- ${s}`).join("\n") : "";
      return `${index + 1}. ${item.title || "Test case"}\n` +
        `Target: ${item.target || "-"}\n` +
        `Steps:\n${steps || "-"}\n` +
        `Expected: ${item.expected || "-"}`;
    })
    .join("\n\n");
}

function showToast(message) {
  const toast = document.getElementById("toast");
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => {
    toast.classList.remove("show");
  }, 2200);
}

function downloadTextFile(filename, content) {
  const blob = new Blob([content], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  chrome.downloads.download({
    url,
    filename,
    saveAs: true
  }, () => {
    URL.revokeObjectURL(url);
  });
}

function toJira(cases) {
  return cases
    .map((item) => {
      const steps = Array.isArray(item.steps) ? item.steps.map((s) => `* ${s}`).join("\n") : "";
      return `h3. ${item.title || "Test case"}\n*Target:* ${item.target || "-"}\n*Steps:*\n${steps || "-"}\n*Expected:* ${item.expected || "-"}`;
    })
    .join("\n\n");
}

function toGherkin(cases) {
  return cases
    .map((item, index) => {
      const steps = Array.isArray(item.steps) ? item.steps : [];
      const [first, ...rest] = steps;
      const whenThen = rest.map((s) => `  And ${s}`).join("\n");
      const expected = item.expected ? `\n  Then ${item.expected}` : "";
      return `Scenario: ${index + 1} - ${item.title || "Test case"}\n` +
        `  Given ${item.target || "the element"}\n` +
        `  When ${first || "the user interacts"}\n` +
        `${whenThen}${expected}`;
    })
    .join("\n\n");
}

async function copyExport(format) {
  const { lastScan } = await chrome.storage.session.get(["lastScan"]);
  const items = Array.isArray(lastScan) ? lastScan : [];
  if (!items.length) {
    showToast("Scan a page first to export test cases.");
    return;
  }
  let output = "";
  if (format === "markdown") output = toMarkdown(items);
  if (format === "gherkin") output = toGherkin(items);
  if (format === "json") output = JSON.stringify(items, null, 2);
  if (format === "csv") output = toCsv(items);
  if (format === "txt") output = toTxt(items);
  if (format === "jira") output = toJira(items);
  if (format === "playwright") output = toScript(items, "playwright");
  if (format === "cypress") output = toScript(items, "cypress");
  if (output) {
    try {
      await navigator.clipboard.writeText(output);
      showToast(`Exported ${format.toUpperCase()} to clipboard.`);
    } catch {
      showToast("Clipboard blocked. Check browser permissions.");
    }
    if (format === "txt") {
      downloadTextFile("qa-test-cases.txt", output);
    }
  }
}

function renderPreview(previewItems, container) {
  container.innerHTML = "";
  if (!previewItems?.length) return;
  previewItems.forEach((item, index) => {
    const div = document.createElement("div");
    div.className = "item";
    if (index === 0) div.classList.add("best");
    const suffix = item.note ? ` (${item.note})` : "";
    div.textContent = `${item.target}: ${item.code || "-"}${suffix}`;
    container.appendChild(div);
  });
}

function renderSelectorMeta(meta, container) {
  container.innerHTML = "";
  if (!meta) {
    const empty = document.createElement("div");
    empty.className = "item";
    empty.textContent = "Pick an element to see details.";
    container.appendChild(empty);
    return;
  }

  const entries = [
    ["Tag", meta.tag],
    ["ID", meta.id],
    ["Classes", (meta.classes || []).join(" ")],
    ["Name", meta.name],
    ["Role", meta.role],
    ["Aria label", meta.ariaLabel],
    ["Placeholder", meta.placeholder],
    ["Type", meta.type],
    ["Test ID", meta.testId],
    ["Frame", meta.frame],
    ["Text", meta.text],
    ["Outer HTML", meta.outerHTML]
  ].filter(([, value]) => value);

  entries.forEach(([label, value]) => {
    const div = document.createElement("div");
    div.className = "item";
    div.textContent = `${label}: ${value}`;
    container.appendChild(div);
  });
}

const snippetFrameworkMap = {
  all: [
    "css",
    "playwright",
    "playwright-ts",
    "playwright-role",
    "playwright-label",
    "playwright-testid",
    "playwright-frame",
    "xpath",
    "cypress",
    "cypress-ts",
    "selenium-js",
    "selenium-ts",
    "js"
  ],
  playwright: [
    "playwright",
    "playwright-ts",
    "playwright-role",
    "playwright-label",
    "playwright-testid",
    "playwright-frame"
  ],
  cypress: ["cypress", "cypress-ts"],
  selenium: ["selenium-js", "selenium-ts"],
  vanilla: ["js"],
  generic: ["css", "xpath"]
};

function filterSnippetOptions(framework) {
  const select = document.getElementById("snippetType");
  const allowed = new Set(snippetFrameworkMap[framework] || snippetFrameworkMap.all);
  const options = Array.from(select.options);
  options.forEach((option) => {
    option.hidden = !allowed.has(option.value);
  });
  if (!allowed.has(select.value)) {
    const fallback = options.find((option) => allowed.has(option.value));
    if (fallback) select.value = fallback.value;
  }
}

function buildSecurityChecklist(result) {
  const headers = result?.headers || {};
  return [
    { name: "CSP", key: "content-security-policy", severity: "high" },
    { name: "HSTS", key: "strict-transport-security", severity: "high" },
    { name: "X-Frame-Options", key: "x-frame-options", severity: "medium" },
    { name: "X-Content-Type-Options", key: "x-content-type-options", severity: "medium" },
    { name: "Referrer-Policy", key: "referrer-policy", severity: "low" },
    { name: "Permissions-Policy", key: "permissions-policy", severity: "low" }
  ].map((item) => ({
    ...item,
    present: Boolean(headers[item.key])
  }));
}

function renderChecklist(items, container) {
  container.innerHTML = "";
  items.forEach((item) => {
    const div = document.createElement("div");
    div.className = "item";
    if (typeof item.present === "boolean") {
      div.textContent = `${item.name}: ${item.present ? "present" : "missing"} (${item.severity})`;
    } else {
      div.textContent = `${item.name}: ${item.status} (${item.severity})`;
    }
    container.appendChild(div);
  });
}

function toScript(cases, target) {
  const normalizeAction = (step) => {
    const text = (step || "").toLowerCase();
    if (text.includes("submit")) return "submit";
    if (text.includes("type") || text.includes("enter")) return "fill";
    if (text.includes("select")) return "select";
    if (text.includes("check")) return "check";
    if (text.includes("toggle")) return "click";
    return "click";
  };

  const buildLine = (selector, step, framework) => {
    if (!selector) return `  // ${step || "step"}`;
    const action = normalizeAction(step);
    if (framework === "playwright") {
      if (action === "fill") return `  await page.locator('${selector}').fill(''); // ${step || "fill"}`;
      if (action === "check") return `  await page.locator('${selector}').check(); // ${step || "check"}`;
      if (action === "select") return `  await page.locator('${selector}').selectOption(''); // ${step || "select"}`;
      if (action === "submit") return `  await page.locator('${selector}').press('Enter'); // ${step || "submit"}`;
      return `  await page.locator('${selector}').click(); // ${step || "click"}`;
    }
    if (framework === "cypress") {
      if (action === "fill") return `    cy.get('${selector}').type(''); // ${step || "type"}`;
      if (action === "check") return `    cy.get('${selector}').check(); // ${step || "check"}`;
      if (action === "select") return `    cy.get('${selector}').select(''); // ${step || "select"}`;
      if (action === "submit") return `    cy.get('${selector}').type('{enter}'); // ${step || "submit"}`;
      return `    cy.get('${selector}').click(); // ${step || "click"}`;
    }
    return "";
  };

  if (target === "playwright") {
    return [
      "import { test, expect } from '@playwright/test';",
      "",
      "test('qa generated cases', async ({ page }) => {",
      ...cases.flatMap((item) => {
        const selector = item.target || "";
        const steps = Array.isArray(item.steps) ? item.steps : [];
        if (!steps.length) return [`  // ${item.title || "Test case"}`];
        return steps.map((step) => buildLine(selector, step, "playwright"));
      }),
      "});"
    ].join("\n");
  }

  if (target === "cypress") {
    return [
      "describe('qa generated cases', () => {",
      "  it('runs generated steps', () => {",
      ...cases.flatMap((item) => {
        const selector = item.target || "";
        const steps = Array.isArray(item.steps) ? item.steps : [];
        if (!steps.length) return [`    // ${item.title || "Test case"}`];
        return steps.map((step) => buildLine(selector, step, "cypress"));
      }),
      "  });",
      "});"
    ].join("\n");
  }
  return "";
}

function renderSecurity(result, container) {
  container.innerHTML = "";
  if (!result) return;
  const headerEntries = Object.entries(result.headers || {});
  headerEntries.forEach(([key, value]) => {
    const div = document.createElement("div");
    div.className = "item";
    div.textContent = `${key}: ${value || "missing"}`;
    container.appendChild(div);
  });
  (result.cookies || []).forEach((cookie) => {
    const flags = [];
    if (cookie.flags?.secure) flags.push("Secure");
    if (cookie.flags?.httpOnly) flags.push("HttpOnly");
    if (cookie.flags?.sameSite) flags.push(cookie.flags.sameSite);
    const div = document.createElement("div");
    div.className = "item";
    div.textContent = `Cookie ${cookie.name}: ${flags.join(", ") || "no flags"}`;
    container.appendChild(div);
  });
}

async function refreshSessionState() {
  const { lastSelector, lastSelectorMeta, lastScan, lastSnippet, lastSecurity, lastLivePreview } = await chrome.storage.session.get([
    "lastSelector",
    "lastSelectorMeta",
    "lastScan",
    "lastSnippet",
    "lastSecurity",
    "lastLivePreview"
  ]);

  const { autoLivePreview, showSelectorPreview, defaultExport } = await chrome.storage.local.get([
    "autoLivePreview",
    "showSelectorPreview",
    "defaultExport"
  ]);

  const sel = document.getElementById("lastSelector");
  sel.textContent = lastSelector || "-";

  const snippet = document.getElementById("lastSnippet");
  snippet.textContent = lastSnippet || "-";

  const metaBox = document.getElementById("selectorMeta");
  renderSelectorMeta(lastSelectorMeta, metaBox);

  const list = document.getElementById("lastScan");
  list.innerHTML = "";
  const items = Array.isArray(lastScan) ? lastScan : [];
  for (const t of items) {
    const div = document.createElement("div");
    div.className = "item";
    if (typeof t === "string") {
      div.textContent = t;
    } else {
      const title = t?.title || "Test case";
      const steps = Array.isArray(t?.steps) ? t.steps.join(" → ") : "";
      const expected = t?.expected ? `Expected: ${t.expected}` : "";
      div.textContent = [title, steps, expected].filter(Boolean).join(" | ");
    }
    list.appendChild(div);
  }

  const previewBox = document.getElementById("selectorPreview");
  if (showSelectorPreview !== false && lastLivePreview?.preview) {
    renderPreview(lastLivePreview.preview, previewBox);
  } else {
    previewBox.innerHTML = "";
  }

  const securityResults = document.getElementById("securityResults");
  const securityChecklist = document.getElementById("securityChecklist");
  const owaspChecklist = document.getElementById("owaspChecklist");
  renderSecurity(lastSecurity, securityResults);
  renderChecklist(buildSecurityChecklist(lastSecurity), securityChecklist);
  renderChecklist(buildOwaspChecklist(lastSecurity), owaspChecklist);

  const liveToggle = document.getElementById("toggleLivePreview");
  liveToggle.dataset.state = autoLivePreview ? "on" : "off";
  liveToggle.textContent = autoLivePreview ? "Live preview: On" : "Live preview: Off";

  const autoLiveEl = document.getElementById("autoLivePreview");
  const showPreviewEl = document.getElementById("showSelectorPreview");
  const exportSelect = document.getElementById("defaultExport");
  autoLiveEl.checked = Boolean(autoLivePreview);
  showPreviewEl.checked = showSelectorPreview !== false;
  if (defaultExport) exportSelect.value = defaultExport;
}

document.getElementById("pickSelector").addEventListener("click", async () => {
  const tabId = await getActiveTabId();
  if (!tabId) return;
  await ensureContentScript(tabId);
  await chrome.tabs.sendMessage(tabId, { type: "QA_START_PICK_SELECTOR" });
  showToast("Pick an element on the page.");
});

document.getElementById("snippetFramework").addEventListener("change", (e) => {
  filterSnippetOptions(e.target.value);
});

function updateDataVariantVisibility() {
  const kind = document.getElementById("dataKind").value;
  const variantSelect = document.getElementById("dataVariant");
  const nameLocale = document.getElementById("nameLocale");
  const paymentKind = document.getElementById("paymentKind");
  const paymentVendor = document.getElementById("paymentVendor");
  const loremType = document.getElementById("loremType");
  const loremSizeType = document.getElementById("loremSizeType");
  const hideVariants = kind === "names" || kind === "loremTypes" || kind === "loremSizes";
  variantSelect.classList.toggle("hidden", hideVariants);
  nameLocale.classList.toggle("hidden", kind !== "names");
  paymentKind.classList.toggle("hidden", kind !== "payment");
  paymentVendor.classList.toggle("hidden", kind !== "payment");
  loremType.classList.toggle("hidden", kind !== "loremTypes");
  loremSizeType.classList.toggle("hidden", kind !== "loremSizes");

  if (kind === "payment") {
    const paymentValue = paymentKind.value;
    if (paymentValue === "cards") {
      paymentVendor.innerHTML = "";
      ["visa", "mastercard", "amex", "discover", "jcb", "diners"].forEach((value) => {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = value === "amex" ? "Amex" : value.charAt(0).toUpperCase() + value.slice(1);
        paymentVendor.appendChild(option);
      });
    } else {
      paymentVendor.innerHTML = "";
      ["iban", "unipaas", "stripeAccount", "stripeToken", "stripeMicrodeposit"].forEach((value) => {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = value
          .replace(/([A-Z])/g, " $1")
          .replace(/^./, (char) => char.toUpperCase());
        paymentVendor.appendChild(option);
      });
    }
  }
}

document.getElementById("dataKind").addEventListener("change", () => {
  updateDataVariantVisibility();
});

document.getElementById("paymentKind").addEventListener("change", () => {
  updateDataVariantVisibility();
});

document.getElementById("nameLocale").addEventListener("change", () => {
  updateDataVariantVisibility();
});

updateDataVariantVisibility();

document.getElementById("closeSidePanel").addEventListener("click", async () => {
  const tabId = await getActiveTabId();
  if (!tabId) return;
  if (!chrome.sidePanel?.setOptions) {
    showToast("Side panel not supported in this Chrome version.");
    return;
  }
  await chrome.sidePanel.setOptions({ tabId, enabled: false });
  showToast("Side panel closed.");
});

document.getElementById("insertData").addEventListener("click", async () => {
  const tabId = await getActiveTabId();
  if (!tabId) return;
  await ensureContentScript(tabId);

  const dataKind = document.getElementById("dataKind").value;
  const paymentKind = document.getElementById("paymentKind").value;
  const paymentVendor = document.getElementById("paymentVendor").value;
  const loremType = document.getElementById("loremType").value;
  const loremSizeType = document.getElementById("loremSizeType").value;
  const kind = dataKind === "names"
    ? document.getElementById("nameLocale").value
    : dataKind === "payment"
      ? (paymentKind === "cards"
        ? `paymentCards.${paymentVendor}`
        : `paymentDirectDebit.${paymentVendor}`)
      : dataKind === "loremTypes"
        ? `loremTypes.${loremType}`
        : dataKind === "loremSizes"
          ? `loremSizes.${loremSizeType}`
          : dataKind;
  const variant = document.getElementById("dataVariant").classList.contains("hidden")
    ? "valid"
    : document.getElementById("dataVariant").value;
  const indexValue = document.getElementById("dataIndex").value.trim();
  const index = variant === "random" ? "random" : indexValue || "0";

  const res = await chrome.tabs.sendMessage(tabId, { type: "QA_INSERT_TEST_DATA", kind, variant, index });
  if (res?.copied) {
    showToast("Test data copied to clipboard.");
  } else if (res?.ok) {
    showToast("Test data inserted.");
  } else {
    showToast("No focused input. Clipboard copy failed.");
  }
});

document.querySelectorAll(".qa-quick-data").forEach((button) => {
  button.addEventListener("click", async () => {
    const kind = button.dataset.kind;
    const variant = button.dataset.variant || "valid";
    const tabId = await getActiveTabId();
    if (!tabId) return;
    await ensureContentScript(tabId);
    const res = await chrome.tabs.sendMessage(tabId, {
      type: "QA_INSERT_TEST_DATA",
      kind,
      variant,
      index: "random"
    });
    if (res?.copied) {
      showToast("Test data copied to clipboard.");
    } else if (res?.ok) {
      showToast("Test data inserted.");
    } else if (!res?.ok) {
      showToast("No focused input. Clipboard copy failed.");
    }
  });
});

document.getElementById("bulkInsert").addEventListener("click", async () => {
  const tabId = await getActiveTabId();
  if (!tabId) return;
  const variant = document.getElementById("dataVariant").value;
  const res = await chrome.tabs.sendMessage(tabId, { type: "QA_BULK_INSERT", variant });
  const status = document.getElementById("bulkInsertStatus");
  status.innerHTML = "";
  if (!res?.result) return;
  const div = document.createElement("div");
  div.className = "item";
  div.textContent = `Filled ${res.result.filled} of ${res.result.total} fields (skipped ${res.result.skipped}).`;
  status.appendChild(div);
  if (Array.isArray(res.result.testCases)) {
    await chrome.storage.session.set({ lastScan: res.result.testCases });
    await refreshSessionState();
  }
  filterSnippetOptions(document.getElementById("snippetFramework").value);
  updateDataVariantVisibility();
});

document.getElementById("scanPage").addEventListener("click", async () => {
  const tabId = await getActiveTabId();
  if (!tabId) return;

  const res = await chrome.tabs.sendMessage(tabId, { type: "QA_SCAN_PAGE" });
  await chrome.storage.session.set({ lastScan: res?.testCases || [] });
  if (Array.isArray(res?.testCases) && res.testCases.length) {
    const txtOutput = toTxt(res.testCases);
    try {
      await navigator.clipboard.writeText(txtOutput);
      showToast("Scan complete. TXT copied to clipboard and downloaded.");
    } catch {
      showToast("Scan complete. TXT downloaded. Clipboard blocked.");
    }
    downloadTextFile("qa-scan.txt", txtOutput);
  } else {
    showToast("No test cases found on this page.");
  }
  await refreshSessionState();
});

document.getElementById("previewSelector").addEventListener("click", async () => {
  const tabId = await getActiveTabId();
  if (!tabId) return;
  await ensureContentScript(tabId);
  const res = await chrome.tabs.sendMessage(tabId, { type: "QA_SELECTOR_PREVIEW" });
  const previewBox = document.getElementById("selectorPreview");
  renderPreview(res?.preview || [], previewBox);
});

document.getElementById("scanSecurity").addEventListener("click", async () => {
  const tabId = await getActiveTabId();
  if (!tabId) return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const res = await chrome.runtime.sendMessage({ type: "QA_SECURITY_SCAN", url: tab?.url });
  if (res?.result) {
    const results = document.getElementById("securityResults");
    const checklist = document.getElementById("securityChecklist");
    const owaspChecklist = document.getElementById("owaspChecklist");
    renderSecurity(res.result, results);
    renderChecklist(buildSecurityChecklist(res.result), checklist);
    renderChecklist(buildOwaspChecklist(res.result), owaspChecklist);
    showToast("Security scan complete.");
  }
});

document.getElementById("toggleLivePreview").addEventListener("click", async () => {
  const button = document.getElementById("toggleLivePreview");
  const tabId = await getActiveTabId();
  if (!tabId) return;
  await ensureContentScript(tabId);
  const isOn = button.dataset.state === "on";
  if (isOn) {
    await chrome.tabs.sendMessage(tabId, { type: "QA_STOP_LIVE_PREVIEW" });
    button.dataset.state = "off";
    button.textContent = "Live preview: Off";
    await chrome.storage.local.set({ autoLivePreview: false });
  } else {
    await chrome.tabs.sendMessage(tabId, { type: "QA_START_LIVE_PREVIEW" });
    button.dataset.state = "on";
    button.textContent = "Live preview: On";
    await chrome.storage.local.set({ autoLivePreview: true });
  }
});

document.getElementById("copySnippet").addEventListener("click", async () => {
  const tabId = await getActiveTabId();
  if (!tabId) return;
  await ensureContentScript(tabId);
  const target = document.getElementById("snippetType").value;
  await chrome.tabs.sendMessage(tabId, { type: "QA_COPY_SNIPPET", target });
  showToast("Snippet generated and copied to clipboard.");
});

document.getElementById("exportMarkdown").addEventListener("click", async () => {
  await copyExport("markdown");
});

document.getElementById("exportGherkin").addEventListener("click", async () => {
  await copyExport("gherkin");
});

document.getElementById("exportJson").addEventListener("click", async () => {
  await copyExport("json");
});

document.getElementById("exportPlaywright").addEventListener("click", async () => {
  await copyExport("playwright");
});

document.getElementById("exportCypress").addEventListener("click", async () => {
  await copyExport("cypress");
});

document.getElementById("exportCsv").addEventListener("click", async () => {
  await copyExport("csv");
});

document.getElementById("exportTxt").addEventListener("click", async () => {
  await copyExport("txt");
});

document.getElementById("exportJira").addEventListener("click", async () => {
  await copyExport("jira");
});

document.getElementById("autoLivePreview").addEventListener("change", async (e) => {
  await chrome.storage.local.set({ autoLivePreview: e.target.checked });
});

document.getElementById("showSelectorPreview").addEventListener("change", async (e) => {
  await chrome.storage.local.set({ showSelectorPreview: e.target.checked });
  await refreshSessionState();
});

document.getElementById("defaultExport").addEventListener("change", async (e) => {
  await chrome.storage.local.set({ defaultExport: e.target.value });
});

chrome.storage.session.onChanged.addListener((changes) => {
  if (changes.lastSelector?.newValue) {
    showToast("Selector captured and copied.");
  }
  if (changes.lastSnippet?.newValue) {
    showToast("Snippet generated and copied.");
  }
  refreshSessionState();
});

refreshSessionState();
