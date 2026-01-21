let picking = false;
let lastOutline = new Map();
let testDataCache = null;
let livePreviewActive = false;
let livePreviewHandle = null;
let lastPreviewTarget = null;

function cssEscape(value) {
  if (globalThis.CSS && typeof globalThis.CSS.escape === "function") return globalThis.CSS.escape(value);
  return String(value).replace(/[^a-zA-Z0-9_-]/g, "\\$&");
}

function uniqueSelector(el) {
  if (!(el instanceof Element)) return null;
  if (el.id) return `#${cssEscape(el.id)}`;

  const parts = [];
  let node = el;
  while (node && node.nodeType === 1 && node !== document.documentElement) {
    let part = node.tagName.toLowerCase();

    const nameAttr = node.getAttribute("name");
    const ariaLabel = node.getAttribute("aria-label");
    const placeholder = node.getAttribute("placeholder");
    const testId =
      node.dataset.testid ||
      node.dataset.test ||
      node.dataset.cy ||
      node.dataset.qa ||
      node.dataset.qaid ||
      node.getAttribute("data-test") ||
      node.getAttribute("data-qa");

    if (testId) {
      part += `[data-testid="${cssEscape(testId)}"]`;
      parts.unshift(part);
      break;
    }

    if (nameAttr) {
      part += `[name="${cssEscape(nameAttr)}"]`;
    }

    if (ariaLabel) {
      part += `[aria-label="${cssEscape(ariaLabel)}"]`;
    }

    if (placeholder) {
      part += `[placeholder="${cssEscape(placeholder)}"]`;
    }

    const classList = Array.from(node.classList || []).filter(Boolean);
    if (classList.length) {
      part += "." + classList.slice(0, 2).map(cssEscape).join(".");
    }

    const parent = node.parentElement;
    if (parent) {
      const siblings = Array.from(parent.children).filter((c) => c.tagName === node.tagName);
      if (siblings.length > 1) {
        const idx = siblings.indexOf(node) + 1;
        part += `:nth-of-type(${idx})`;
      }
    }

    parts.unshift(part);

    const candidate = parts.join(" > ");
    try {
      const found = document.querySelectorAll(candidate);
      if (found.length === 1) return candidate;
    } catch {
    }

    node = parent;
  }

  return parts.join(" > ");
}

function clearOutlines() {
  for (const [el, prev] of lastOutline.entries()) {
    try {
      el.style.outline = prev;
    } catch {
    }
  }
  lastOutline.clear();
}

function setOutline(el) {
  if (!(el instanceof Element)) return;
  if (!lastOutline.has(el)) lastOutline.set(el, el.style.outline);
  el.style.outline = "2px solid #3b82f6";
}

function showToast(message) {
  if (!message) return;
  const existing = document.querySelector(".qa-toast");
  if (existing) existing.remove();
  const toast = document.createElement("div");
  toast.className = "qa-toast";
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 2400);
}

function showTypoNotification(message, color) {
  const existing = document.querySelector(".typo-notification");
  if (existing) existing.remove();
  const msg = document.createElement("div");
  msg.className = "typo-notification";
  msg.style.cssText = `
    position: fixed;
    bottom: 20px;
    right: 20px;
    background-color: ${color};
    color: white;
    padding: 10px;
    border-radius: 5px;
    z-index: 999999;
    box-shadow: 0 2px 5px rgba(0,0,0,0.2);
    max-width: 300px;
    font-family: "Space Grotesk", "Segoe UI", system-ui, sans-serif;
    font-size: 12px;
  `;
  msg.textContent = message;
  document.body.appendChild(msg);
  setTimeout(() => msg.remove(), 5000);
}

async function loadTypoWordSet() {
  if (window.__qaTypoWordSet) return window.__qaTypoWordSet;
  const dicText = await fetch(chrome.runtime.getURL("assets/typo/en_US.dic")).then((res) => res.text());
  const lines = dicText.split(/\r?\n/).filter(Boolean);
  const words = new Set();
  lines.slice(1).forEach((line) => {
    const word = line.split("/")[0]?.trim();
    if (word) words.add(word.toLowerCase());
  });
  window.__qaTypoWordSet = words;
  return words;
}

function removeTypoHighlights() {
  document.querySelectorAll(".typo-word-highlight").forEach((el) => {
    el.replaceWith(...el.childNodes);
  });
  document.querySelectorAll(".typo-notification").forEach((el) => el.remove());
  const styleEl = document.getElementById("qa-typo-style");
  if (styleEl) styleEl.remove();
  window.__qaTypoActive = false;
  document.removeEventListener("click", handleTypoClearClick, true);
}

function handleTypoClearClick(event) {
  if (event.button !== 0) return;
  if (!document.querySelector(".typo-word-highlight")) return;
  removeTypoHighlights();
  showTypoNotification("Typo highlights removed!", "#4CAF50");
}

function applyTypoHighlightStyles() {
  if (document.getElementById("qa-typo-style")) return;
  const style = document.createElement("style");
  style.id = "qa-typo-style";
  style.textContent = `
    .typo-word-highlight {
      background-color: #bfdbfe;
      border-bottom: 1px dashed #2563eb;
      position: relative;
      display: inline;
    }
    .typo-word-highlight:hover::after {
      content: "Possible typo";
      position: absolute;
      background: #2563eb;
      color: white;
      padding: 2px 5px;
      border-radius: 3px;
      font-size: 12px;
      bottom: 100%;
      left: 50%;
      transform: translateX(-50%);
      white-space: nowrap;
      z-index: 10000;
    }
  `;
  document.head.appendChild(style);
}

function normalizeTypoWord(word) {
  let normalized = word.toLowerCase();
  if (normalized.endsWith("'s")) {
    normalized = normalized.slice(0, -2);
  }
  return normalized;
}

function shouldIgnoreTypo(word, wordSet, counts) {
  if (word.length <= 2) return true;
  if (!/^[a-zA-Z]+$/.test(word)) return true;
  const normalized = normalizeTypoWord(word);
  if (wordSet.has(normalized)) return true;
  if ((counts.get(normalized) || 0) >= 3) return true;
  if (/^[A-Z]/.test(word)) return true;
  return false;
}

function checkTextNodeForTypos(node, wordSet, counts) {
  if (node.nodeType !== Node.TEXT_NODE || !node.nodeValue?.trim()) return;
  const text = node.nodeValue;
  const words = text.match(/\b[\w']+\b/g) || [];
  let lastIndex = 0;
  const newNodes = [];

  words.forEach((word) => {
    const wordStart = text.indexOf(word, lastIndex);
    if (wordStart === -1) return;
    if (wordStart > lastIndex) {
      newNodes.push(document.createTextNode(text.slice(lastIndex, wordStart)));
    }
    if (!shouldIgnoreTypo(word, wordSet, counts)) {
      const span = document.createElement("span");
      span.className = "typo-word-highlight";
      span.textContent = word;
      newNodes.push(span);
    } else {
      newNodes.push(document.createTextNode(word));
    }
    lastIndex = wordStart + word.length;
  });

  if (lastIndex < text.length) {
    newNodes.push(document.createTextNode(text.slice(lastIndex)));
  }

  if (newNodes.length > 1 || (newNodes.length === 1 && newNodes[0].nodeType !== Node.TEXT_NODE)) {
    const fragment = document.createDocumentFragment();
    newNodes.forEach((n) => fragment.appendChild(n));
    node.parentNode.replaceChild(fragment, node);
  }
}

function walkNodesForTypos(node, wordSet, counts) {
  if (!node) return;
  if (["SCRIPT", "STYLE", "NOSCRIPT", "IFRAME", "OBJECT", "CODE", "PRE"].includes(node.nodeName)) {
    return;
  }
  if (node.nodeType === Node.TEXT_NODE) {
    checkTextNodeForTypos(node, wordSet, counts);
  } else if (node.nodeType === Node.ELEMENT_NODE) {
    Array.from(node.childNodes).forEach((child) => walkNodesForTypos(child, wordSet, counts));
  }
}

function collectWordCounts(node, counts) {
  if (!node) return;
  if (["SCRIPT", "STYLE", "NOSCRIPT", "IFRAME", "OBJECT", "CODE", "PRE"].includes(node.nodeName)) {
    return;
  }
  if (node.nodeType === Node.TEXT_NODE && node.nodeValue?.trim()) {
    const words = node.nodeValue.match(/\b[\w']+\b/g) || [];
    words.forEach((word) => {
      if (!/^[a-zA-Z]+$/.test(word)) return;
      const normalized = normalizeTypoWord(word);
      counts.set(normalized, (counts.get(normalized) || 0) + 1);
    });
    return;
  }
  if (node.nodeType === Node.ELEMENT_NODE) {
    Array.from(node.childNodes).forEach((child) => collectWordCounts(child, counts));
  }
}

async function runTypoScan() {
  if (document.querySelector(".typo-word-highlight")) {
    removeTypoHighlights();
    showTypoNotification("Typo highlights removed!", "#4CAF50");
    return;
  }

  try {
    applyTypoHighlightStyles();
    const wordSet = await loadTypoWordSet();
    const counts = new Map();
    collectWordCounts(document.body, counts);
    walkNodesForTypos(document.body, wordSet, counts);
    window.__qaTypoActive = true;
    document.addEventListener("click", handleTypoClearClick, true);
    showTypoNotification("Typo checking complete! Click again to remove highlights.", "#4CAF50");
  } catch (error) {
    showTypoNotification("Typo scan failed to load dictionary.", "#d32f2f");
  }
}

function generateTestData(kind, variant) {
  return testDataCache?.[kind]?.[variant]?.[0] ?? "";
}

async function loadTestData() {
  if (testDataCache) return testDataCache;
  const url = chrome.runtime.getURL("test-data.json");
  const res = await fetch(url);
  testDataCache = await res.json();
  return testDataCache;
}

function expandTestDataValue(value) {
  if (value && typeof value === "object" && value._type === "size") {
    const size = Number.parseInt(value.size, 10);
    const template = String(value.template || "");
    if (!Number.isFinite(size) || size <= 0 || !template) return "";
    let out = "";
    while (out.length < size) {
      out += template;
    }
    return out.slice(0, size);
  }
  return value ?? "";
}

async function getTestDataValue(kind, variant, index) {
  const data = await loadTestData();
  if (variant === "random") {
    const group = data?.[kind] || {};
    const pools = Object.values(group).filter((arr) => Array.isArray(arr) && arr.length);
    if (!pools.length) return "";
    const pick = pools[Math.floor(Math.random() * pools.length)];
    return expandTestDataValue(pick[Math.floor(Math.random() * pick.length)]);
  }
  const values = data?.[kind]?.[variant] ?? [];
  if (!values.length) return "";
  if (index === "random") {
    return expandTestDataValue(values[Math.floor(Math.random() * values.length)]);
  }
  const idx = Number.parseInt(index ?? "0", 10);
  return expandTestDataValue(values[idx] ?? values[0]);
}

function formatSnippet(selector, target) {
  if (!selector) return "";
  if (target === "css") return selector;
  if (target === "playwright" || target === "playwright-ts") {
    return `await page.locator('${selector}').click();`;
  }
  if (target === "cypress" || target === "cypress-ts") {
    return `cy.get('${selector}').click();`;
  }
  if (target === "selenium-js" || target === "selenium-ts") {
    return `await driver.findElement(By.css('${selector}')).click();`;
  }
  if (target === "js") return `document.querySelector('${selector}')?.click();`;
  return selector;
}

function getRoleForElement(el) {
  if (!(el instanceof Element)) return null;
  const role = el.getAttribute("role");
  if (role) return role;
  const tag = el.tagName.toLowerCase();
  if (tag === "button") return "button";
  if (tag === "a") return "link";
  if (tag === "input") {
    const type = el.getAttribute("type") || "text";
    if (type === "checkbox") return "checkbox";
    if (type === "radio") return "radio";
    if (type === "submit" || type === "button") return "button";
    return "textbox";
  }
  if (tag === "select") return "combobox";
  if (tag === "textarea") return "textbox";
  return null;
}

function getLabelText(el) {
  if (!(el instanceof Element)) return "";
  const ariaLabel = el.getAttribute("aria-label");
  if (ariaLabel) return ariaLabel.trim();
  const labelledBy = el.getAttribute("aria-labelledby");
  if (labelledBy) {
    const labelEl = document.getElementById(labelledBy);
    if (labelEl?.textContent) return labelEl.textContent.trim();
  }
  if (el.id) {
    const label = document.querySelector(`label[for="${cssEscape(el.id)}"]`);
    if (label?.textContent) return label.textContent.trim();
  }
  const wrappingLabel = el.closest("label");
  if (wrappingLabel?.textContent) return wrappingLabel.textContent.trim();
  return "";
}

function getTestId(el) {
  if (!(el instanceof Element)) return "";
  return (
    el.dataset.testid ||
    el.dataset.test ||
    el.dataset.cy ||
    el.dataset.qa ||
    el.dataset.qaid ||
    el.getAttribute("data-test") ||
    el.getAttribute("data-qa") ||
    ""
  );
}

function getXPath(el) {
  if (!(el instanceof Element)) return "";
  if (el.id) return `//*[@id="${el.id}"]`;
  const parts = [];
  let node = el;
  while (node && node.nodeType === 1) {
    const tag = node.tagName.toLowerCase();
    const parent = node.parentElement;
    if (!parent) {
      parts.unshift(`/${tag}`);
      break;
    }
    const siblings = Array.from(parent.children).filter((c) => c.tagName === node.tagName);
    const index = siblings.indexOf(node) + 1;
    parts.unshift(`/${tag}[${index}]`);
    node = parent;
  }
  return parts.join("");
}

function getElementMetadata(element, selector) {
  if (!(element instanceof Element)) return null;
  const tag = element.tagName.toLowerCase();
  const id = element.id || "";
  const classList = Array.from(element.classList || []).filter(Boolean);
  const name = element.getAttribute("name") || "";
  const role = element.getAttribute("role") || getRoleForElement(element) || "";
  const ariaLabel = element.getAttribute("aria-label") || "";
  const placeholder = element.getAttribute("placeholder") || "";
  const type = element.getAttribute("type") || "";
  const testId = getTestId(element);
  const text = (element.textContent || "").trim().slice(0, 120);
  const outerHTML = element.outerHTML ? element.outerHTML.slice(0, 240) : "";
  const frame = getFrameSelector(element);
  return {
    selector,
    tag,
    id,
    classes: classList.slice(0, 6),
    name,
    role,
    ariaLabel,
    placeholder,
    type,
    testId,
    text,
    outerHTML,
    frame
  };
}

function getFrameSelector(element) {
  if (!(element instanceof Element)) return "";
  const frameEl = element.ownerDocument?.defaultView?.frameElement;
  if (!(frameEl instanceof Element)) return "";
  if (frameEl.id) return `#${cssEscape(frameEl.id)}`;
  const name = frameEl.getAttribute("name");
  if (name) return `iframe[name="${cssEscape(name)}"]`;
  const title = frameEl.getAttribute("title");
  if (title) return `iframe[title="${cssEscape(title)}"]`;
  const src = frameEl.getAttribute("src");
  if (src) return `iframe[src="${cssEscape(src)}"]`;
  return "iframe";
}

function formatStrategySnippet(selector, target, element) {
  if (!element) return formatSnippet(selector, target);
  if (target === "playwright-role") {
    const role = getRoleForElement(element);
    const name = getLabelText(element);
    if (role && name) return `await page.getByRole('${role}', { name: '${name}' }).click();`;
    if (role) return `await page.getByRole('${role}').click();`;
  }
  if (target === "playwright-label") {
    const name = getLabelText(element);
    if (name) return `await page.getByLabel('${name}').fill('');`;
  }
  if (target === "playwright-testid") {
    const testId = getTestId(element);
    if (testId) return `await page.getByTestId('${testId}').click();`;
  }
  if (target === "playwright-frame") {
    const frameSelector = getFrameSelector(element);
    if (frameSelector) {
      return `await page.frameLocator('${frameSelector}').locator('${selector}').click();`;
    }
  }
  if (target === "xpath") {
    const xpath = getXPath(element);
    if (xpath) return xpath;
  }
  return formatSnippet(selector, target);
}

function formatActionSnippet(selector, target, action) {
  if (!selector) return "";
  const clickAction = action || "click";
  if (target === "playwright" || target === "playwright-ts") {
    if (clickAction === "hover") return `await page.locator('${selector}').hover();`;
    if (clickAction === "right") return `await page.locator('${selector}').click({ button: 'right' });`;
    if (clickAction === "long-press") {
      return `await page.locator('${selector}').click({ delay: 1000 });`;
    }
    if (clickAction === "swipe") {
      return `await page.locator('${selector}').dragTo(page.locator('TARGET_SELECTOR'));`;
    }
    if (clickAction === "drag") {
      return `await page.locator('${selector}').dragTo(page.locator('TARGET_SELECTOR'));`;
    }
    if (clickAction === "file-upload") {
      return `await page.setInputFiles('${selector}', 'path/to/file');`;
    }
    if (clickAction === "type") return `await page.locator('${selector}').fill('');`;
    if (clickAction === "select") return `await page.locator('${selector}').selectOption('');`;
    if (clickAction === "check") return `await page.locator('${selector}').check();`;
    if (clickAction === "uncheck") return `await page.locator('${selector}').uncheck();`;
    if (clickAction === "key-enter") return `await page.locator('${selector}').press('Enter');`;
    if (clickAction === "key-escape") return `await page.locator('${selector}').press('Escape');`;
    if (clickAction === "key-tab") return `await page.locator('${selector}').press('Tab');`;
    if (clickAction === "scroll") return `await page.locator('${selector}').scrollIntoViewIfNeeded();`;
    if (clickAction === "double") return `await page.locator('${selector}').dblclick();`;
    if (clickAction === "triple") return `await page.locator('${selector}').click({ clickCount: 3 });`;
    return `await page.locator('${selector}').click();`;
  }
  if (target === "cypress" || target === "cypress-ts") {
    if (clickAction === "hover") return `cy.get('${selector}').trigger('mouseover');`;
    if (clickAction === "right") return `cy.get('${selector}').rightclick();`;
    if (clickAction === "long-press") {
      return `cy.get('${selector}').trigger('mousedown');
cy.wait(1000);
cy.get('${selector}').trigger('mouseup');`;
    }
    if (clickAction === "swipe") {
      return `cy.get('${selector}').trigger('pointerdown');
cy.get('TARGET_SELECTOR').trigger('pointermove').trigger('pointerup');`;
    }
    if (clickAction === "drag") {
      return `cy.get('${selector}').trigger('mousedown');
cy.get('TARGET_SELECTOR').trigger('mousemove').trigger('mouseup');`;
    }
    if (clickAction === "file-upload") {
      return `cy.get('${selector}').selectFile('path/to/file');`;
    }
    if (clickAction === "type") return `cy.get('${selector}').type('');`;
    if (clickAction === "select") return `cy.get('${selector}').select('');`;
    if (clickAction === "check") return `cy.get('${selector}').check();`;
    if (clickAction === "uncheck") return `cy.get('${selector}').uncheck();`;
    if (clickAction === "key-enter") return `cy.get('${selector}').type('{enter}');`;
    if (clickAction === "key-escape") return `cy.get('${selector}').type('{esc}');`;
    if (clickAction === "key-tab") return `cy.get('${selector}').type('{tab}');`;
    if (clickAction === "scroll") return `cy.get('${selector}').scrollIntoView();`;
    if (clickAction === "double") return `cy.get('${selector}').dblclick();`;
    if (clickAction === "triple") {
      return `cy.get('${selector}').click().click().click();`;
    }
    return `cy.get('${selector}').click();`;
  }
  if (target === "selenium-js" || target === "selenium-ts") {
    if (clickAction === "hover") {
      return `const el = await driver.findElement(By.css('${selector}'));
await driver.actions().move({ origin: el }).perform();`;
    }
    if (clickAction === "right") {
      return `const el = await driver.findElement(By.css('${selector}'));
await driver.actions().contextClick(el).perform();`;
    }
    if (clickAction === "long-press") {
      return `const el = await driver.findElement(By.css('${selector}'));
await driver.actions().clickAndHold(el).pause(1000).release().perform();`;
    }
    if (clickAction === "swipe") {
      return `const el = await driver.findElement(By.css('${selector}'));
const target = await driver.findElement(By.css('TARGET_SELECTOR'));
await driver.actions().dragAndDrop(el, target).perform();`;
    }
    if (clickAction === "drag") {
      return `const el = await driver.findElement(By.css('${selector}'));
const target = await driver.findElement(By.css('TARGET_SELECTOR'));
await driver.actions().dragAndDrop(el, target).perform();`;
    }
    if (clickAction === "file-upload") {
      return `await driver.findElement(By.css('${selector}')).sendKeys('path/to/file');`;
    }
    if (clickAction === "type") return `await driver.findElement(By.css('${selector}')).sendKeys('');`;
    if (clickAction === "select") return `await driver.findElement(By.css('${selector}')).sendKeys('OPTION_VALUE');`;
    if (clickAction === "check") return `await driver.findElement(By.css('${selector}')).click();`;
    if (clickAction === "uncheck") return `await driver.findElement(By.css('${selector}')).click();`;
    if (clickAction === "key-enter") return `await driver.findElement(By.css('${selector}')).sendKeys(Key.ENTER);`;
    if (clickAction === "key-escape") return `await driver.findElement(By.css('${selector}')).sendKeys(Key.ESCAPE);`;
    if (clickAction === "key-tab") return `await driver.findElement(By.css('${selector}')).sendKeys(Key.TAB);`;
    if (clickAction === "scroll") {
      return `const el = await driver.findElement(By.css('${selector}'));
await driver.executeScript('arguments[0].scrollIntoView({block: "center"});', el);`;
    }
    if (clickAction === "double") {
      return `const el = await driver.findElement(By.css('${selector}'));
await driver.actions().doubleClick(el).perform();`;
    }
    if (clickAction === "triple") {
      return `const el = await driver.findElement(By.css('${selector}'));
await el.click();
await el.click();
await el.click();`;
    }
    return `await driver.findElement(By.css('${selector}')).click();`;
  }
  if (clickAction === "hover") {
    return `document.querySelector('${selector}')?.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));`;
  }
  if (clickAction === "right") {
    return `document.querySelector('${selector}')?.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true }));`;
  }
  if (clickAction === "long-press") {
    return `const el = document.querySelector('${selector}');
if (el) { el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
setTimeout(() => el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true })), 1000); }`;
  }
  if (clickAction === "swipe") {
    return `const el = document.querySelector('${selector}');
if (el) { el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); }`;
  }
  if (clickAction === "drag") {
    return `const el = document.querySelector('${selector}');
if (el) { el.dispatchEvent(new DragEvent('dragstart', { bubbles: true })); }`;
  }
  if (clickAction === "file-upload") {
    return `document.querySelector('${selector}')?.dispatchEvent(new Event('change', { bubbles: true }));`;
  }
  if (clickAction === "type") {
    return `const el = document.querySelector('${selector}');
if (el) { el.focus(); el.value = ''; el.dispatchEvent(new Event('input', { bubbles: true })); }`;
  }
  if (clickAction === "select") {
    return `const el = document.querySelector('${selector}');
if (el) { el.value = ''; el.dispatchEvent(new Event('change', { bubbles: true })); }`;
  }
  if (clickAction === "check") {
    return `const el = document.querySelector('${selector}');
if (el) { el.checked = true; el.dispatchEvent(new Event('change', { bubbles: true })); }`;
  }
  if (clickAction === "uncheck") {
    return `const el = document.querySelector('${selector}');
if (el) { el.checked = false; el.dispatchEvent(new Event('change', { bubbles: true })); }`;
  }
  if (clickAction === "key-enter") {
    return `document.querySelector('${selector}')?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));`;
  }
  if (clickAction === "key-escape") {
    return `document.querySelector('${selector}')?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));`;
  }
  if (clickAction === "key-tab") {
    return `document.querySelector('${selector}')?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));`;
  }
  if (clickAction === "scroll") {
    return `document.querySelector('${selector}')?.scrollIntoView({ behavior: 'smooth', block: 'center' });`;
  }
  if (clickAction === "double") {
    return `document.querySelector('${selector}')?.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));`;
  }
  if (clickAction === "triple") {
    return `const el = document.querySelector('${selector}');
if (el) { el.click(); el.click(); el.click(); }`;
  }
  return `document.querySelector('${selector}')?.click();`;
}

function buildSelectorPreview(element, selector) {
  const targets = [
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
  ];
  return targets.map((target) => ({
    target,
    code: formatStrategySnippet(selector, target, element)
  }));
}

function insertIntoActiveElement(text) {
  const el = document.activeElement;
  if (!(el instanceof HTMLInputElement) && !(el instanceof HTMLTextAreaElement)) return false;

  const start = el.selectionStart ?? el.value.length;
  const end = el.selectionEnd ?? el.value.length;
  const next = el.value.slice(0, start) + text + el.value.slice(end);
  el.value = next;
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
  return true;
}

function getFieldHint(el) {
  if (!(el instanceof Element)) return "";
  const label = getLabelText(el);
  const aria = el.getAttribute("aria-label");
  const placeholder = el.getAttribute("placeholder");
  const name = el.getAttribute("name");
  const id = el.getAttribute("id");
  return [label, aria, placeholder, name, id]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function suggestDataKind(el) {
  if (!(el instanceof Element)) return "";
  if (el instanceof HTMLInputElement) {
    const type = (el.type || "").toLowerCase();
    if (type === "email") return "email";
    if (type === "tel") return "phone";
    if (type === "url") return "url";
    if (type === "number") return "number";
    if (type === "date") return "date";
    if (type === "time") return "time";
    if (type === "datetime-local") return "datetime";
    if (type === "password") return "password";
  }

  const hint = getFieldHint(el);
  if (hint.includes("email")) return "email";
  if (hint.includes("phone") || hint.includes("mobile") || hint.includes("tel")) return "phone";
  if (hint.includes("first") || hint.includes("last") || hint.includes("name")) return "name";
  if (hint.includes("user") || hint.includes("login") || hint.includes("handle")) return "username";
  if (hint.includes("pass")) return "password";
  if (hint.includes("address") || hint.includes("street")) return "address";
  if (hint.includes("city") || hint.includes("state") || hint.includes("province")) return "addressLocale";
  if (hint.includes("zip") || hint.includes("postal")) return "postalCode";
  if (hint.includes("country")) return "country";
  if (hint.includes("iban")) return "iban";
  if (hint.includes("bic")) return "bic";
  if (hint.includes("vat")) return "vat";
  if (hint.includes("passport")) return "passport";
  if (hint.includes("ssn") || hint.includes("national")) return "nationalId";
  if (hint.includes("card") || hint.includes("cc") || hint.includes("cvc") || hint.includes("cvv")) {
    return "creditCard";
  }
  if (hint.includes("amount") || hint.includes("price") || hint.includes("currency") || hint.includes("total")) {
    return "currency";
  }
  if (hint.includes("url") || hint.includes("website")) return "url";
  if (hint.includes("company") || hint.includes("organization") || hint.includes("org")) return "name";
  if (hint.includes("ip")) return "ip";
  if (hint.includes("uuid") || hint.includes("guid")) return "uuid";
  if (hint.includes("json")) return "json";
  if (hint.includes("lorem") || hint.includes("bio") || hint.includes("description")) return "lorem";
  if (hint.includes("language") || hint.includes("locale")) return "language";
  return el instanceof HTMLTextAreaElement ? "largeText" : "name";
}

function buildBulkTestCases(elements, variant) {
  const cases = [];
  elements.forEach((el) => {
    if (!(el instanceof Element)) return;
    const target = uniqueSelector(el);
    if (!target) return;
    const kind = suggestDataKind(el);
    cases.push({
      title: `Bulk fill ${kind} (${variant})`,
      target,
      steps: ["Auto-fill field with dataset value", "Submit form"],
      expected: "Field accepts dataset input or shows validation feedback"
    });
  });
  return cases;
}

async function fillFormWithTestData(variant = "random") {
  await loadTestData();
  const elements = Array.from(document.querySelectorAll("input, textarea, select, [contenteditable='true']"));
  let filled = 0;
  let skipped = 0;
  const filledElements = [];

  for (const el of elements) {
    if (!(el instanceof Element)) continue;
    if (el.hasAttribute("disabled") || el.hasAttribute("readonly")) {
      skipped += 1;
      continue;
    }

    if (el instanceof HTMLInputElement) {
      const type = (el.type || "").toLowerCase();
      if (type === "checkbox" || type === "radio") {
        el.checked = true;
        el.dispatchEvent(new Event("change", { bubbles: true }));
        filled += 1;
        filledElements.push(el);
        continue;
      }
      if (type === "file") {
        skipped += 1;
        continue;
      }
    }

    if (el instanceof HTMLSelectElement) {
      const options = Array.from(el.options).filter((opt) => !opt.disabled && opt.value !== "");
      if (options.length) {
        el.value = options[0].value;
        el.dispatchEvent(new Event("change", { bubbles: true }));
        filled += 1;
        filledElements.push(el);
      } else {
        skipped += 1;
      }
      continue;
    }

    const kind = suggestDataKind(el);
    const value = await getTestDataValue(kind, variant, "random");
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
      el.value = value;
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
      filled += 1;
      filledElements.push(el);
      continue;
    }

    if (el.getAttribute("contenteditable") === "true") {
      el.textContent = value;
      el.dispatchEvent(new Event("input", { bubbles: true }));
      filled += 1;
      filledElements.push(el);
      continue;
    }

    skipped += 1;
  }

  return {
    filled,
    skipped,
    total: elements.length,
    testCases: buildBulkTestCases(filledElements, variant)
  };
}

function scanPageForTestCases() {
  const cases = [];

  const forms = Array.from(document.querySelectorAll("form"));
  forms.forEach((form, index) => {
    cases.push({
      title: `Form ${index + 1} validation`,
      target: uniqueSelector(form),
      steps: ["Submit with empty required fields", "Verify validation messages", "Submit with valid values"],
      expected: "Required errors displayed, valid submission succeeds"
    });
  });

  const inputs = Array.from(document.querySelectorAll("input, textarea, select"));
  const password = inputs.filter((i) => i instanceof HTMLInputElement && i.type === "password");
  password.forEach((input) => {
    cases.push({
      title: "Password field behavior",
      target: uniqueSelector(input),
      steps: ["Enter weak password", "Enter strong password", "Toggle show/hide if available"],
      expected: "Validation reflects strength rules and visibility toggles work"
    });
  });

  const email = inputs.filter((i) => i instanceof HTMLInputElement && i.type === "email");
  email.forEach((input) => {
    cases.push({
      title: "Email format validation",
      target: uniqueSelector(input),
      steps: ["Enter invalid email", "Enter valid email", "Check trimming and normalization"],
      expected: "Invalid formats rejected and valid formats accepted"
    });
  });

  const hasSearch = !!document.querySelector("input[type=search], [role=search]");
  if (hasSearch) {
    cases.push({
      title: "Search behavior",
      target: "input[type=search], [role=search]",
      steps: ["Search with empty query", "Search with special characters", "Search with long query"],
      expected: "Handles empty/special queries and returns results or empty state"
    });
  }

  const links = Array.from(document.querySelectorAll("a[href]"));
  const external = links.filter((a) => {
    try {
      const u = new URL(a.href);
      return u.origin !== location.origin;
    } catch {
      return false;
    }
  });
  if (external.length) {
    cases.push({
      title: "External link safety",
      target: "a[href]",
      steps: ["Click external link", "Verify rel=noopener and correct target"],
      expected: "External links open safely without window.opener"
    });
  }

  const numbers = inputs.filter((i) => i instanceof HTMLInputElement && i.type === "number");
  numbers.forEach((input) => {
    cases.push({
      title: "Number field boundaries",
      target: uniqueSelector(input),
      steps: ["Enter min-1", "Enter max+1", "Enter decimals"],
      expected: "Invalid ranges rejected, valid numbers accepted"
    });
  });

  const dates = inputs.filter((i) => i instanceof HTMLInputElement && i.type === "date");
  dates.forEach((input) => {
    cases.push({
      title: "Date field validation",
      target: uniqueSelector(input),
      steps: ["Enter invalid date", "Enter leap day", "Enter valid date"],
      expected: "Invalid dates rejected, valid dates accepted"
    });
  });

  const files = inputs.filter((i) => i instanceof HTMLInputElement && i.type === "file");
  files.forEach((input) => {
    cases.push({
      title: "File upload validation",
      target: uniqueSelector(input),
      steps: ["Upload invalid file type", "Upload large file", "Upload valid file"],
      expected: "Only allowed file types and sizes are accepted"
    });
    if (input.accept) {
      cases.push({
        title: "File accept restrictions",
        target: uniqueSelector(input),
        steps: ["Upload file outside accept list", "Upload allowed file"],
        expected: "Only accepted file extensions/types are allowed"
      });
    }
  });

  const selects = inputs.filter((i) => i instanceof HTMLSelectElement);
  selects.forEach((select) => {
    cases.push({
      title: "Select list validation",
      target: uniqueSelector(select),
      steps: ["Choose default option", "Select valid option", "Try invalid value"],
      expected: "Selection requires valid option and default behaves as expected"
    });
    if (select.multiple) {
      cases.push({
        title: "Multi-select list behavior",
        target: uniqueSelector(select),
        steps: ["Select multiple options", "Deselect option", "Submit form"],
        expected: "Multiple selections are preserved and validated"
      });
    }
  });

  const checkboxes = inputs.filter((i) => i instanceof HTMLInputElement && i.type === "checkbox");
  if (checkboxes.length) {
    cases.push({
      title: "Checkbox states",
      target: uniqueSelector(checkboxes[0]),
      steps: ["Check", "Uncheck", "Submit form"],
      expected: "Checkbox state saved and validated"
    });
  }

  const radios = inputs.filter((i) => i instanceof HTMLInputElement && i.type === "radio");
  if (radios.length) {
    cases.push({
      title: "Radio group selection",
      target: uniqueSelector(radios[0]),
      steps: ["Select option A", "Select option B", "Submit form"],
      expected: "Only one option selectable at a time"
    });
  }

  inputs.forEach((input) => {
    if (input instanceof HTMLElement && (input.hasAttribute("disabled") || input.hasAttribute("readonly"))) {
      cases.push({
        title: "Disabled/readonly field handling",
        target: uniqueSelector(input),
        steps: ["Try to focus", "Attempt input", "Submit form"],
        expected: "Disabled or readonly fields block editing and behave consistently"
      });
    }

    if (input instanceof HTMLInputElement && input.autocomplete === "off") {
      cases.push({
        title: "Autocomplete disabled",
        target: uniqueSelector(input),
        steps: ["Focus input", "Attempt browser autofill"],
        expected: "Autocomplete is disabled for sensitive fields"
      });
    }

    const required = input instanceof HTMLElement && input.hasAttribute("required");
    if (required) {
      cases.push({
        title: "Required field enforcement",
        target: uniqueSelector(input),
        steps: ["Leave field empty", "Submit form"],
        expected: "Required field blocks submission with clear error"
      });
    }

    const minLength = input.getAttribute?.("minlength");
    if (minLength) {
      cases.push({
        title: "Min length validation",
        target: uniqueSelector(input),
        steps: [`Enter ${Number(minLength) - 1} characters`, "Submit"],
        expected: "Input shorter than min length is rejected"
      });
    }

    const maxLength = input.getAttribute?.("maxlength");
    if (maxLength) {
      cases.push({
        title: "Max length validation",
        target: uniqueSelector(input),
        steps: [`Enter ${Number(maxLength) + 1} characters`, "Submit"],
        expected: "Input longer than max length is rejected"
      });
    }

    const pattern = input.getAttribute?.("pattern");
    if (pattern) {
      cases.push({
        title: "Pattern validation",
        target: uniqueSelector(input),
        steps: ["Enter invalid pattern value", "Enter valid pattern value"],
        expected: "Pattern mismatch rejected and valid pattern accepted"
      });
    }
  });

  const urlInputs = inputs.filter((i) => i instanceof HTMLInputElement && i.type === "url");
  urlInputs.forEach((input) => {
    cases.push({
      title: "URL input validation",
      target: uniqueSelector(input),
      steps: ["Enter invalid URL", "Enter valid URL", "Enter URL with query"],
      expected: "Only valid URL formats are accepted"
    });
  });

  const telInputs = inputs.filter((i) => i instanceof HTMLInputElement && i.type === "tel");
  telInputs.forEach((input) => {
    cases.push({
      title: "Telephone input validation",
      target: uniqueSelector(input),
      steps: ["Enter letters", "Enter intl number", "Enter formatted number"],
      expected: "Only valid phone formats are accepted"
    });
  });

  const textareas = inputs.filter((i) => i instanceof HTMLTextAreaElement);
  textareas.forEach((input) => {
    cases.push({
      title: "Textarea length handling",
      target: uniqueSelector(input),
      steps: ["Enter long text", "Enter special characters", "Submit form"],
      expected: "Textarea accepts allowed content and respects limits"
    });
  });

  const contentEditable = Array.from(document.querySelectorAll("[contenteditable='true']"));
  contentEditable.forEach((node) => {
    cases.push({
      title: "Contenteditable input",
      target: uniqueSelector(node),
      steps: ["Enter formatted text", "Paste content", "Submit form"],
      expected: "Editable region stores content safely"
    });
  });

  const iframeCount = document.querySelectorAll("iframe").length;
  if (iframeCount) {
    cases.push({
      title: "Embedded iframe content",
      target: "iframe",
      steps: ["Verify iframe loads", "Check permissions/sandbox", "Test interactions inside iframe"],
      expected: "Iframe content loads securely and interactions work"
    });
  }

  return cases;
}

function onMove(e) {
  if (!picking) return;
  clearOutlines();
  setOutline(e.target);
}

function sendLivePreview(target) {
  if (!livePreviewActive || !(target instanceof Element)) return;
  if (lastPreviewTarget === target) return;
  lastPreviewTarget = target;
  const selector = uniqueSelector(target);
  const preview = buildSelectorPreview(target, selector);
  chrome.runtime.sendMessage({
    type: "QA_LIVE_PREVIEW_UPDATE",
    preview: {
      selector,
      preview
    }
  });
}

function onLivePreviewMove(e) {
  if (!livePreviewActive) return;
  const target = e.target;
  if (livePreviewHandle) cancelAnimationFrame(livePreviewHandle);
  livePreviewHandle = requestAnimationFrame(() => {
    sendLivePreview(target);
  });
}

async function onClick(e) {
  if (!picking) return;
  e.preventDefault();
  e.stopPropagation();

  const selector = uniqueSelector(e.target);
  const meta = selector ? getElementMetadata(e.target, selector) : null;
  picking = false;
  clearOutlines();
  document.documentElement.classList.remove("qa-picker-active");
  document.removeEventListener("mousemove", onMove, true);
  document.removeEventListener("click", onClick, true);

  if (selector) {
    await navigator.clipboard.writeText(selector).catch(() => { });
    chrome.runtime.sendMessage({ type: "QA_SELECTOR_PICKED", selector, meta });
    showToast("Selector copied to clipboard");
  }
}

async function handleMessage(msg, sendResponse) {
  if (msg?.type === "QA_PING") {
    sendResponse({ ok: true });
    return;
  }

  if (msg?.type === "QA_START_PICK_SELECTOR") {
    if (!picking) {
      picking = true;
      document.documentElement.classList.add("qa-picker-active");
      document.addEventListener("mousemove", onMove, true);
      document.addEventListener("click", onClick, true);
    }
    sendResponse({ ok: true });
    return;
  }

  if (msg?.type === "QA_START_LIVE_PREVIEW") {
    if (!livePreviewActive) {
      livePreviewActive = true;
      document.addEventListener("mousemove", onLivePreviewMove, true);
    }
    sendResponse({ ok: true });
    return;
  }

  if (msg?.type === "QA_STOP_LIVE_PREVIEW") {
    livePreviewActive = false;
    lastPreviewTarget = null;
    document.removeEventListener("mousemove", onLivePreviewMove, true);
    sendResponse({ ok: true });
    return;
  }

  if (msg?.type === "QA_INSERT_TEST_DATA") {
    const value = await getTestDataValue(msg.kind, msg.variant, msg.index);
    const ok = insertIntoActiveElement(value);
    sendResponse({ ok });
    return;
  }

  if (msg?.type === "QA_BULK_INSERT") {
    const result = await fillFormWithTestData(msg.variant || "random");
    sendResponse({ ok: true, result });
    return;
  }

  if (msg?.type === "QA_SCAN_PAGE") {
    const testCases = scanPageForTestCases();
    sendResponse({ testCases });
    return;
  }

  if (msg?.type === "QA_COPY_SNIPPET") {
    const element = document.activeElement || document.body;
    const selector = msg?.selector || uniqueSelector(element);
    const code = formatStrategySnippet(selector, msg.target, element);
    if (code) {
      await navigator.clipboard.writeText(code).catch(() => { });
      showToast("Snippet copied to clipboard");
    }
    sendResponse({ code });
  }

  if (msg?.type === "QA_COPY_ACTION_SNIPPET") {
    const element = document.activeElement || document.body;
    const selector = msg?.selector || uniqueSelector(element);
    const code = formatActionSnippet(selector, msg.target, msg.action);
    if (code) {
      await navigator.clipboard.writeText(code).catch(() => { });
      showToast("Action snippet copied to clipboard");
    }
    sendResponse({ code });
  }

  if (msg?.type === "QA_SELECTOR_PREVIEW") {
    const element = document.activeElement || document.body;
    const selector = msg?.selector || uniqueSelector(element);
    const preview = buildSelectorPreview(element, selector);
    sendResponse({ selector, preview });
  }

  if (msg?.type === "QA_TYPO_SCAN") {
    await runTypoScan();
    sendResponse({ ok: true });
  }
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  const asyncTypes = new Set([
    "QA_INSERT_TEST_DATA",
    "QA_COPY_SNIPPET",
    "QA_COPY_ACTION_SNIPPET",
    "QA_TYPO_SCAN"
  ]);
  const isAsync = asyncTypes.has(msg?.type);
  handleMessage(msg, sendResponse);
  return isAsync;
});
