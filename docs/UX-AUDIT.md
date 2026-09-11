# CivicFlow verification — 11 September 2026

## Changes

- Center the full-day calendar dialog within the available viewport on desktop and mobile.
- Keep the Income entry control visible at tablet widths and prevent inherited metric columns from squeezing the finance summary.
- Allow touch scrolling on the calendar timeline without starting a drag selection.
- Preserve keyboard focus while typing in edit dialogs, contain Tab navigation, and restore focus when closing.
- Refresh records when returning to a page or when another same-origin browser tab changes data.
- Keep task filters in the URL and include a bill icon in notifications.
- Preserve negative signs in available balances and show the month containing a newly added financial record.
- Explain category budgets, paid-bill accounting, copying, and the previous-month rollover option.
- Keep the user signed in after an incorrect current password in Settings.

## Verification performed

Browser checks used an isolated account and temporary SQLite database, not the user's records.

- Chromium/Edge viewport widths: 320, 375, 390, 470, 600, 760, 768, 820, 900, 980, 1024, 1100, 1280, 1440, and 1920px (900px height).
- All seven signed-in routes checked for page overflow at each width; calendar dialog vertical centering and finance entry-tab clipping checked explicitly.
- Browser workflows: registration, session persistence after reload, invalid and valid login, logout, password change, profile propagation, themes, task creation/editing/completion/reopening/filtering/deletion, dashboard deadline navigation, time-block creation/completion, dashboard schedule updates, document creation/search/editing/deletion, income/spending/bill creation, payment, financial editing, budget recalculation, privacy toggle, notification read-all/dismissal, and finance updates in a second tab.
- API integration tests cover CRUD across resources, recurring bills, budget copying/editing, notification read/dismiss state, preference updates, password reset and token reuse rejection, user isolation, unauthenticated access, and invalid-current-password session preservation.
- ESLint, integration tests, and production build pass.

The accelerated browser sweep is split into separate server runs to avoid exhausting the production-like API rate limit; the database is preserved between those runs.

## Verification limits

Viewport emulation is not a physical iPhone/Safari test. Real-device keyboard, browser chrome, assistive-technology behavior, network interruptions, and every possible data combination are not certified by this audit.

Password-reset token handling is tested locally. External email delivery is not verified; the email-provider setup was previously paused and still needs a real inbox delivery test before being described as production-ready.
