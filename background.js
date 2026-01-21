const MAX_ITEMS_PER_VARIANT = 8;
let testData = {};
let typoAssetsCache = null;

async function loadTestData() {
  const url = chrome.runtime.getURL("test-data.json");
  const res = await fetch(url);
  testData = await res.json();
}

async function fetchTypoAssets() {
  if (typoAssetsCache) return typoAssetsCache;
  const [sourceRes, affRes, dicRes] = await Promise.all([
    fetch(chrome.runtime.getURL("assets/typo/typo.min.js")),
    fetch(chrome.runtime.getURL("assets/typo/en_US.aff")),
    fetch(chrome.runtime.getURL("assets/typo/en_US.dic"))
  ]);
  const [source, aff, dic] = await Promise.all([
    sourceRes.text(),
    affRes.text(),
    dicRes.text()
  ]);
  typoAssetsCache = { source, aff, dic };
  return typoAssetsCache;
}

async function ensureContentScript(tabId) {
  try {
    await chrome.tabs.sendMessage(tabId, { type: "QA_PING" });
    return true;
  } catch {
    try {
      await chrome.scripting.executeScript({ target: { tabId }, files: ["content.js"] });
      await chrome.scripting.insertCSS({ target: { tabId }, files: ["content.css"] });
      return true;
    } catch {
      return false;
    }
  }
}

function createTestDataMenus(parentId) {
  const nameRootId = "qa_kind:names";
  let namesRootCreated = false;
  const formatLabel = (value) =>
    String(value || "")
      .replace(/([A-Z])/g, " $1")
      .replace(/[_-]+/g, " ")
      .trim()
      .replace(/^./, (char) => char.toUpperCase());
  const nameLabels = {
    name: "General",
    nameWelsh: "Welsh",
    nameJapanese: "Japanese",
    nameChinese: "Chinese",
    nameSerbian: "Serbian",
    nameBosnian: "Bosnian",
    nameCroatian: "Croatian",
    nameGreek: "Greek",
    nameArabic: "Arabic",
    nameHindi: "Hindi",
    nameKorean: "Korean",
    nameTurkish: "Turkish",
    nameVietnamese: "Vietnamese",
    namePolish: "Polish",
    nameUkrainian: "Ukrainian"
  };

  const flattenKinds = new Set(["lorem", ...Object.keys(nameLabels)]);
  const legacyPaymentKinds = new Set([
    "directDebit",
    "directDebitUnipaas",
    "directDebitStripeAccount",
    "directDebitStripeToken",
    "directDebitStripeMicrodeposit",
    "iban"
  ]);

  const addVariantMenus = (parent, kind, variants) => {
    Object.entries(variants || {}).forEach(([variant, values]) => {
      if (!Array.isArray(values)) return;
      const variantLabel = formatLabel(variant || "Value");
      const variantId = `qa_variant:${kind}:${variant}`;
      chrome.contextMenus.create({
        id: variantId,
        parentId: parent,
        title: variantLabel,
        contexts: ["all"]
      });
      addValuesMenu(variantId, kind, variant, values);
    });
  };

  const addValuesMenu = (parent, kind, variant, values) => {
    chrome.contextMenus.create({
      id: `qa_data:${kind}:${variant}:random`,
      parentId: parent,
      title: "Random",
      contexts: ["all"]
    });

    values.slice(0, MAX_ITEMS_PER_VARIANT).forEach((value, index) => {
      const label = typeof value === "string" ? value : JSON.stringify(value);
      const safeLabel = String(label || value || "Value");
      const trimmed = safeLabel.length > 48 ? `${safeLabel.slice(0, 48)}...` : safeLabel;
      chrome.contextMenus.create({
        id: `qa_data:${kind}:${variant}:${index}`,
        parentId: parent,
        title: trimmed,
        contexts: ["all"]
      });
    });
  };

  const paymentCards = testData?.paymentCards || {};
  const paymentDirectDebit = testData?.paymentDirectDebit || {};

  if (Object.keys(paymentCards).length || Object.keys(paymentDirectDebit).length) {
    const paymentRootId = "qa_kind:payment";
    chrome.contextMenus.create({
      id: paymentRootId,
      parentId,
      title: "Payment",
      contexts: ["all"]
    });

    if (Object.keys(paymentCards).length) {
      const cardsRootId = "qa_kind:paymentCards";
      chrome.contextMenus.create({
        id: cardsRootId,
        parentId: paymentRootId,
        title: "Credit cards",
        contexts: ["all"]
      });
      Object.entries(paymentCards).forEach(([brand, variants]) => {
        const brandId = `qa_kind:paymentCards.${brand}`;
        const label = brand === "amex" ? "Amex" : formatLabel(brand);
        chrome.contextMenus.create({
          id: brandId,
          parentId: cardsRootId,
          title: label,
          contexts: ["all"]
        });
        addVariantMenus(brandId, `paymentCards.${brand}`, variants);
      });
    }

    if (Object.keys(paymentDirectDebit).length) {
      const debitRootId = "qa_kind:paymentDirectDebit";
      chrome.contextMenus.create({
        id: debitRootId,
        parentId: paymentRootId,
        title: "Direct debit",
        contexts: ["all"]
      });
      Object.entries(paymentDirectDebit).forEach(([type, variants]) => {
        const typeId = `qa_kind:paymentDirectDebit.${type}`;
        const label = formatLabel(type);
        chrome.contextMenus.create({
          id: typeId,
          parentId: debitRootId,
          title: label,
          contexts: ["all"]
        });
        addVariantMenus(typeId, `paymentDirectDebit.${type}`, variants);
      });
    }
  }

  if (testData?.loremTypes) {
    const loremTypesRoot = "qa_kind:loremTypes";
    chrome.contextMenus.create({
      id: loremTypesRoot,
      parentId,
      title: "Lorem types",
      contexts: ["all"]
    });
    Object.entries(testData.loremTypes).forEach(([type, values]) => {
      const typeId = `qa_kind:loremTypes.${type}`;
      const label = formatLabel(type);
      chrome.contextMenus.create({
        id: typeId,
        parentId: loremTypesRoot,
        title: label,
        contexts: ["all"]
      });
      addValuesMenu(typeId, `loremTypes.${type}`, "valid", Array.isArray(values) ? values : []);
    });
  }

  if (testData?.loremSizes) {
    const loremSizesRoot = "qa_kind:loremSizes";
    chrome.contextMenus.create({
      id: loremSizesRoot,
      parentId,
      title: "Lorem sizes",
      contexts: ["all"]
    });
    Object.entries(testData.loremSizes).forEach(([type, values]) => {
      const typeId = `qa_kind:loremSizes.${type}`;
      const label = formatLabel(type);
      chrome.contextMenus.create({
        id: typeId,
        parentId: loremSizesRoot,
        title: label,
        contexts: ["all"]
      });
      addValuesMenu(typeId, `loremSizes.${type}`, "valid", Array.isArray(values) ? values : []);
    });
  }

  Object.entries(testData).forEach(([kind, variants]) => {
    if (legacyPaymentKinds.has(kind)) return;
    if (kind.startsWith("bugmagnet")) return;
    if (kind === "paymentCards" || kind === "paymentDirectDebit" || kind === "loremTypes" || kind === "loremSizes") return;
    if (nameLabels[kind]) {
      if (!namesRootCreated) {
        chrome.contextMenus.create({
          id: nameRootId,
          parentId,
          title: "Names",
          contexts: ["all"]
        });
        namesRootCreated = true;
      }
      const localeId = `qa_kind:${kind}`;
      chrome.contextMenus.create({
        id: localeId,
        parentId: nameRootId,
        title: nameLabels[kind],
        contexts: ["all"]
      });
      const values = Array.isArray(variants)
        ? variants
        : [...(variants?.valid || []), ...(variants?.edge || [])];
      addValuesMenu(localeId, kind, "valid", values);
      return;
    }

    const kindLabel = formatLabel(kind || "Data");
    const kindId = `qa_kind:${kind}`;
    chrome.contextMenus.create({
      id: kindId,
      parentId,
      title: kindLabel,
      contexts: ["all"]
    });

    if (flattenKinds.has(kind)) {
      const values = Array.isArray(variants)
        ? variants
        : [...(variants?.valid || []), ...(variants?.edge || [])];
      addValuesMenu(kindId, kind, "valid", values);
      return;
    }
    addVariantMenus(kindId, kind, variants);
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
    id: "qa_take_screenshot",
    parentId: "qa_open",
    title: "Save page screenshot",
    contexts: ["all"]
  });

  chrome.contextMenus.create({
    id: "qa_insert_input",
    parentId: "qa_open",
    title: "Insert test data",
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

  createTestDataMenus("qa_insert_input");

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

}

chrome.runtime.onInstalled.addListener(() => {
  loadTestData().then(initMenus).catch(initMenus);
  if (chrome.sidePanel?.setPanelBehavior) {
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => { });
  }
});

chrome.runtime.onStartup.addListener(() => {
  if (chrome.sidePanel?.setPanelBehavior) {
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => { });
  }
});

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab?.id || !chrome.sidePanel?.open) return;
  try {
    await chrome.sidePanel.setOptions({ tabId: tab.id, enabled: true });
    await chrome.sidePanel.open({ tabId: tab.id });
  } catch {
    // ignore if side panel not available
  }
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
    if (!(await ensureContentScript(tab.id))) return;
    await chrome.tabs.sendMessage(tab.id, { type: "QA_START_PICK_SELECTOR" });
    return;
  }

  if (info.menuItemId === "qa_scan_page") {
    if (!(await ensureContentScript(tab.id))) return;
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
    if (!(await ensureContentScript(tab.id))) return;
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
    if (!(await ensureContentScript(tab.id))) return;
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
    if (!(await ensureContentScript(tab.id))) return;
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
    if (!(await ensureContentScript(tab.id))) return;
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
  if (msg?.type === "QA_GET_TYPO_ASSETS") {
    fetchTypoAssets()
      .then((assets) => sendResponse({ ok: true, assets }))
      .catch((error) => sendResponse({ ok: false, error: String(error) }));
    return true;
  }

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
