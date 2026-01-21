# QA Testing Assistant Extension

Exploratory testing superpowers for Chrome. This extension blends **Bug Magnet-inspired datasets**, smart selector tooling, and bulk form filling so QA teams can uncover edge cases faster.

![Chrome Extension](https://img.shields.io/badge/Chrome-Extension-2563eb?style=flat-square)
![Manifest V3](https://img.shields.io/badge/Manifest-V3-0ea5e9?style=flat-square)
![Status](https://img.shields.io/badge/Status-Active-success?style=flat-square)

---

## ⚡ Quick Start

1. Load the extension in **chrome://extensions** (Developer mode → Load unpacked).
2. Open any page and click the extension icon.
3. Pick selectors, insert test data, or **Bulk fill** to kick off exploratory testing.

---

## ✨ Highlights

- **Selector toolkit**: Pick elements with a live outline and copy CSS, XPath, Playwright, Cypress, and `getByRole` snippets.
- **Massive datasets**: Valid, invalid, boundary, and Unicode-heavy inputs (Bug Magnet + custom).
- **Bulk fill forms**: Auto-populates fields using label/placeholder heuristics and generates test cases.
- **Test idea generator**: Scans pages and proposes scenarios from HTML constraints.
- **Security quick check**: Flags missing headers and surfaces OWASP hints.

---

## 🚀 Feature Tour

### 1) Smart Selector Panel
- Visual hover picker + selector preview
- Copy CSS / XPath / Playwright / Cypress
- Export snippets that match automation best practices

### 2) Test Data Engine
- Huge dataset library (Bug Magnet + custom)
- **Valid / Invalid / Edge / Random** variants
- Supports template expansion (e.g. 128b/64K generated text)

### 3) Bulk Fill Forms
- Detects intent from labels/placeholder/name/id
- Handles selects, checkboxes, radios, and contenteditable
- Generates **test cases** based on filled fields

### 4) Test Case Scanner
- Reads required/min/max/pattern attributes
- Covers email/url/tel/date/password constraints
- Adds iframe and external link scenarios

### 5) Security Checks
- Basic header inspection (CSP/HSTS/XFO/etc.)
- OWASP reminders embedded in the popup

---

## 🧪 Bug Magnet Dataset Coverage

Extended datasets based on [Bug Magnet](https://bugmagnet.org/):

- Names, emails, addresses, unicode, whitespace
- URLs, numbers, currencies, boundary values
- Payment cards (Stripe, Braintree, Authorize.Net, PayPal, Vantiv)
- Text size generators (128b, 256b, 32K, 64K)
- Unicode confusables, RTL overrides, emojis, control chars

---

## 📦 Install (Developer Mode)

1. Open **chrome://extensions**
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select this folder

---

## 🔧 Usage

- Click the extension icon to open the panel
- Pick a selector or insert test data into a focused field
- Use **Bulk fill form** to auto-populate inputs
- Run **Scan page → test cases** for exploratory ideas

---

## 🎯 Use Cases

- **Exploratory testing**: Quickly inject edge cases, unicode, and boundary values into inputs.
- **Automation prep**: Capture stable selectors and snippets for Playwright or Cypress.
- **Regression sweeps**: Bulk fill forms with realistic or invalid data and capture failures.
- **Security sanity checks**: Spot missing headers and common OWASP concerns early.
- **Localization checks**: Push RTL, multi-language, and currency inputs through UI.

---

## 🥊 Why This vs Alternatives

- **Bug Magnet browser plugin**: Great datasets, but limited selector tooling and automation snippets.
- **Standalone data generators**: Powerful, but not context-aware or connected to UI selectors.
- **DevTools snippets**: Flexible, but manual and slower for repetitive QA workflows.

This extension combines **datasets + selectors + automation-ready exports + test ideas** in a single workflow.

---

## 📤 Export Options

- Markdown / Gherkin / JSON / CSV
- Playwright / Cypress snippets
- Jira-friendly formats

---

## 🧾 Permissions (Chrome Web Store-ready)

- **activeTab**: Read and inject data only on the active tab you choose.
- **scripting**: Insert selectors, scan pages, and fill fields on demand.
- **storage**: Save preferences and last scan results.
- **contextMenus**: Right-click insertion of test data.

---

## 🔒 Privacy

- No analytics, tracking, or remote data collection.
- All test data lives locally in `test-data.json`.
- Page scans are performed locally in your browser session.

---

## 💬 Support

Open a GitHub issue for bugs, feature requests, or dataset additions.

---

## 🧩 Key Files

- `popup.html` / `popup.js` / `popup.css` → UI panel
- `content.js` → selector picking, scan logic, bulk fill
- `background.js` → context menus and messaging
- `test-data.json` → all datasets

---

## ✅ Roadmap (Optional)

- Context-menu template builder
- Structured test case export to Jira Cloud
- Heavier heuristics for field detection

---

## 🙌 Credits

- **Bug Magnet** datasets: https://bugmagnet.org/ (Gojko Adzic)
- Inspired by exploratory testing best practices

---

## 📄 License

MIT
