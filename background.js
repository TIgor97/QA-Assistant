const MAX_ITEMS_PER_VARIANT = 8;
let testData = {};

async function loadTestData() {
  const url = chrome.runtime.getURL("test-data.json");
  const res = await fetch(url);
  testData = await res.json();
}

function createTestDataMenus(parentId) {
  Object.entries(testData).forEach(([kind, variants]) => {
    const kindId = `qa_kind:${kind}`;
    chrome.contextMenus.create({
      id: kindId,
      parentId,
      title: kind,
      contexts: ["editable"]
    });

    Object.entries(variants).forEach(([variant, values]) => {
      if (!Array.isArray(values)) return;
      const variantId = `qa_variant:${kind}:${variant}`;
      chrome.contextMenus.create({
        id: variantId,
        parentId: kindId,
        title: variant,
        contexts: ["editable"]
      });

      chrome.contextMenus.create({
        id: `qa_data:${kind}:${variant}:random`,
        parentId: variantId,
        title: "Random",
        contexts: ["editable"]
      });

      values.slice(0, MAX_ITEMS_PER_VARIANT).forEach((value, index) => {
        chrome.contextMenus.create({
          id: `qa_data:${kind}:${variant}:${index}`,
          parentId: variantId,
          title: value.length > 48 ? `${value.slice(0, 48)}...` : value,
          contexts: ["editable"]
        });
      });
    });
  });
}

async function initMenus() {
  await chrome.contextMenus.removeAll();

  chrome.contextMenus.create({
    id: "qa_open",
    title: "QA Testing Assistant",
    contexts: ["all"]
  });

  chrome.contextMenus.create({
    id: "qa_pick_selector",
    parentId: "qa_open",
    title: "Pick CSS selector",
    contexts: ["all"]
  });

  chrome.contextMenus.create({
    id: "qa_copy_snippet",
    parentId: "qa_open",
    title: "Copy selector snippet",
    contexts: ["all"]
  });

  chrome.contextMenus.create({
    id: "qa_action_suggestions",
    parentId: "qa_open",
    title: "Action suggestions",
    contexts: ["all"]
  });

  chrome.contextMenus.create({
    id: "qa_scan_typos",
    parentId: "qa_open",
    title: "Scan for typos",
    contexts: ["all"]
  });

  chrome.contextMenus.create({
    id: "qa_copy_css",
    parentId: "qa_copy_snippet",
    title: "CSS selector",
    contexts: ["all"]
  });

  chrome.contextMenus.create({
    id: "qa_copy_playwright",
    parentId: "qa_copy_snippet",
    title: "Playwright (CSS)",
    contexts: ["all"]
  });

  chrome.contextMenus.create({
    id: "qa_copy_playwright_ts",
    parentId: "qa_copy_snippet",
    title: "Playwright (TypeScript)",
    contexts: ["all"]
  });

  chrome.contextMenus.create({
    id: "qa_copy_playwright_role",
    parentId: "qa_copy_snippet",
    title: "Playwright (getByRole)",
    contexts: ["all"]
  });

  chrome.contextMenus.create({
    id: "qa_copy_playwright_label",
    parentId: "qa_copy_snippet",
    title: "Playwright (getByLabel)",
    contexts: ["all"]
  });

  chrome.contextMenus.create({
    id: "qa_copy_playwright_testid",
    parentId: "qa_copy_snippet",
    title: "Playwright (getByTestId)",
    contexts: ["all"]
  });

  chrome.contextMenus.create({
    id: "qa_copy_playwright_frame",
    parentId: "qa_copy_snippet",
    title: "Playwright (iframe)",
    contexts: ["all"]
  });

  chrome.contextMenus.create({
    id: "qa_copy_xpath",
    parentId: "qa_copy_snippet",
    title: "XPath",
    contexts: ["all"]
  });

  chrome.contextMenus.create({
    id: "qa_copy_cypress",
    parentId: "qa_copy_snippet",
    title: "Cypress (CSS)",
    contexts: ["all"]
  });

  chrome.contextMenus.create({
    id: "qa_copy_cypress_ts",
    parentId: "qa_copy_snippet",
    title: "Cypress (TypeScript)",
    contexts: ["all"]
  });

  chrome.contextMenus.create({
    id: "qa_copy_selenium_js",
    parentId: "qa_copy_snippet",
    title: "Selenium (JavaScript)",
    contexts: ["all"]
  });

  chrome.contextMenus.create({
    id: "qa_copy_selenium_ts",
    parentId: "qa_copy_snippet",
    title: "Selenium (TypeScript)",
    contexts: ["all"]
  });

  chrome.contextMenus.create({
    id: "qa_copy_js",
    parentId: "qa_copy_snippet",
    title: "Vanilla JS",
    contexts: ["all"]
  });

  const actionTargets = [
    { id: "playwright", label: "Playwright" },
    { id: "playwright-ts", label: "Playwright (TypeScript)" },
    { id: "cypress", label: "Cypress" },
    { id: "cypress-ts", label: "Cypress (TypeScript)" },
    { id: "selenium-js", label: "Selenium (JavaScript)" },
    { id: "selenium-ts", label: "Selenium (TypeScript)" },
    { id: "js", label: "Vanilla JS" }
  ];

  const actionItems = [
    { id: "click", label: "Click" },
    { id: "double", label: "Double click" },
    { id: "triple", label: "Triple click" },
    { id: "hover", label: "Hover" },
    { id: "right", label: "Right click" },
    { id: "long-press", label: "Long press" },
    { id: "swipe", label: "Swipe" },
    { id: "drag", label: "Drag & drop" },
    { id: "file-upload", label: "File upload" },
    { id: "type", label: "Type" },
    { id: "select", label: "Select option" },
    { id: "check", label: "Check" },
    { id: "uncheck", label: "Uncheck" },
    { id: "key-enter", label: "Press Enter" },
    { id: "key-escape", label: "Press Escape" },
    { id: "key-tab", label: "Press Tab" },
    { id: "scroll", label: "Scroll into view" }
  ];

  actionTargets.forEach((target) => {
    actionItems.forEach((action) => {
      chrome.contextMenus.create({
        id: `qa_action:${target.id}:${action.id}`,
        parentId: "qa_action_suggestions",
        title: `${action.label} (${target.label})`,
        contexts: ["all"]
      });
    });
  });

  chrome.contextMenus.create({
    id: "qa_generate_test_data",
    parentId: "qa_open",
    title: "Insert test data",
    contexts: ["editable"]
  });

  createTestDataMenus("qa_generate_test_data");

  chrome.contextMenus.create({
    id: "qa_scan_page",
    parentId: "qa_open",
    title: "Scan page -> test cases",
    contexts: ["all"]
  });

  chrome.contextMenus.create({
    id: "qa_scan_security",
    parentId: "qa_open",
    title: "Scan security headers",
    contexts: ["all"]
  });

  chrome.contextMenus.create({
    id: "qa_take_screenshot",
    parentId: "qa_open",
    title: "Save page screenshot",
    contexts: ["all"]
  });
}

chrome.runtime.onInstalled.addListener(() => {
  loadTestData().then(initMenus).catch(initMenus);
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!tab?.id) return;

  const itemId = String(info.menuItemId || "");
  const targetMap = {
    qa_copy_css: "css",
    qa_copy_playwright: "playwright",
    qa_copy_playwright_ts: "playwright-ts",
    qa_copy_playwright_role: "playwright-role",
    qa_copy_playwright_label: "playwright-label",
    qa_copy_playwright_testid: "playwright-testid",
    qa_copy_playwright_frame: "playwright-frame",
    qa_copy_xpath: "xpath",
    qa_copy_cypress: "cypress",
    qa_copy_cypress_ts: "cypress-ts",
    qa_copy_selenium_js: "selenium-js",
    qa_copy_selenium_ts: "selenium-ts",
    qa_copy_js: "js"
  };

  if (info.menuItemId === "qa_pick_selector") {
    await chrome.tabs.sendMessage(tab.id, { type: "QA_START_PICK_SELECTOR" });
    return;
  }

  if (info.menuItemId === "qa_scan_page") {
    const res = await chrome.tabs.sendMessage(tab.id, { type: "QA_SCAN_PAGE" });
    if (res?.testCases) {
      await chrome.storage.session.set({ lastScan: res.testCases });
    }
    return;
  }

  if (info.menuItemId === "qa_scan_security") {
    const result = await scanSecurityHeaders(tab.url);
    await chrome.storage.session.set({ lastSecurity: result });
    return;
  }

  if (info.menuItemId === "qa_scan_typos") {
    await chrome.tabs.sendMessage(tab.id, { type: "QA_TYPO_SCAN" });
    return;
  }

  if (info.menuItemId === "qa_take_screenshot") {
    const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: "png" });
    const title = (tab.title || "page")
      .replace(/[^a-z0-9-_]+/gi, "_")
      .replace(/_+/g, "_")
      .slice(0, 80);
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const filename = `QA-Assistant/${title || "page"}_${stamp}.png`;
    chrome.downloads.download({
      url: dataUrl,
      filename,
      saveAs: true
    });
    return;
  }

  if (itemId in targetMap) {
    const { lastSelector } = await chrome.storage.session.get(["lastSelector"]);
    const snippet = await chrome.tabs.sendMessage(tab.id, {
      type: "QA_COPY_SNIPPET",
      target: targetMap[itemId],
      selector: lastSelector
    });
    if (snippet?.code) {
      await chrome.storage.session.set({ lastSnippet: snippet.code });
    }
    return;
  }

  if (itemId.startsWith("qa_action:")) {
    const [, target, action] = itemId.split(":");
    const { lastSelector } = await chrome.storage.session.get(["lastSelector"]);
    const snippet = await chrome.tabs.sendMessage(tab.id, {
      type: "QA_COPY_ACTION_SNIPPET",
      target,
      action,
      selector: lastSelector
    });
    if (snippet?.code) {
      await chrome.storage.session.set({ lastSnippet: snippet.code });
    }
    return;
  }

  if (itemId.startsWith("qa_data:")) {
    const [, kind, variant, index] = itemId.split(":");
    await chrome.tabs.sendMessage(tab.id, {
      type: "QA_INSERT_TEST_DATA",
      kind,
      variant,
      index
    });
  }
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === "QA_SELECTOR_PICKED") {
    chrome.storage.session.set({
      lastSelector: msg.selector,
      lastSelectorMeta: msg.meta || null
    }).then(() => {
      sendResponse({ ok: true });
    });
    return true;
  }

  if (msg?.type === "QA_SECURITY_SCAN") {
    scanSecurityHeaders(msg.url).then((result) => {
      chrome.storage.session.set({ lastSecurity: result }).then(() => {
        sendResponse({ ok: true, result });
      });
    });
    return true;
  }

  if (msg?.type === "QA_LIVE_PREVIEW_UPDATE") {
    chrome.storage.session.set({ lastLivePreview: msg.preview }).then(() => {
      sendResponse({ ok: true });
    });
    return true;
  }

  return false;
});

async function scanSecurityHeaders(url) {
  if (!url) return { url: "", headers: {}, cookies: [] };
  const res = await fetch(url, { method: "GET", redirect: "follow" });
  const headerNames = [
    "content-security-policy",
    "strict-transport-security",
    "x-frame-options",
    "x-content-type-options",
    "referrer-policy",
    "permissions-policy"
  ];
  const headers = {};
  headerNames.forEach((name) => {
    headers[name] = res.headers.get(name) || "";
  });

  const rawSetCookie = res.headers.get("set-cookie") || "";
  const cookies = rawSetCookie
    .split(/,(?=[^;]+?=)/)
    .filter(Boolean)
    .map((cookieStr) => {
      const parts = cookieStr.split(";").map((p) => p.trim());
      const [nameValue] = parts;
      const name = nameValue?.split("=")[0] || "";
      const flags = {
        secure: parts.some((p) => p.toLowerCase() === "secure"),
        httpOnly: parts.some((p) => p.toLowerCase() === "httponly"),
        sameSite: parts.find((p) => p.toLowerCase().startsWith("samesite=")) || ""
      };
      return { name, flags };
    });

  return { url: res.url, headers, cookies };
}
