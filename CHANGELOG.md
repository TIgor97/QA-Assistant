# Changelog

## [Unreleased]

### Added
- Payment test data hierarchy (Credit Cards/Direct Debit) with brand/type grouping.
- Lorem types and sizes selectors for streamlined test data insertion.

### Changed
- Flattened name datasets with locale picker and simplified lorem selection.
- Context menu test data labels now capitalize and group Payment datasets.
- Popup buttons and spacing refreshed for clearer click affordance.

## [0.1.1] - 2026-01-21

### Added
- Selector metadata panel (tag/id/classes/role/aria/placeholder/text/frame).
- New snippet targets: Playwright TS, Cypress TS, Selenium JS/TS, Vanilla JS, Playwright iframe.
- Action suggestions menu for click/double/triple/hover/right-click/drag/drop/type/select/check/keys/scroll/long-press/swipe/file upload.
- Context menu utilities: Scan for typos toggle + Save page screenshot (page-title filename).
- Expanded locale name datasets (Welsh, Japanese, Chinese, Serbian, Bosnian, Croatian, Greek, Arabic, Hindi, Korean, Turkish, Vietnamese, Polish, Ukrainian).
- Toast feedback for selector/snippet/scan/export actions.
- TXT export for scan results with clipboard copy + download.
- Popup UI refresh and best-practice tips.

### Changed
- Picker flow keeps popup open when possible and surfaces live feedback.
- Downloads permission added for TXT exports.
- Typo scan now uses blue highlights, click-to-clear behavior, and stricter filtering to reduce false positives.

### Fixed
- Selector picker reliability by ensuring content script injection.
- Export feedback and clipboard handling.
