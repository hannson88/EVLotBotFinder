# AGENTS.md

## Project Working Notes

- Make the smallest useful change for each approved improvement.
- Before editing tracked files, copy originals into a timestamped folder under `.backups/`.
- Keep `.backups/` out of Git.
- Document notable decisions here as the fork evolves.

## Decision Log

### 2026-05-03: Make Poll Interval Configurable

- Decision: Add optional `POLL_INTERVAL_MINUTES` configuration with a default of 5.
- Reason: Allows deployment and testing interval changes without editing code.
- Scope: Validate the optional value in `src/index.js` and document it in `.env.example`.

### 2026-05-03: Prevent Overlapping Poll Cycles

- Decision: Add an in-memory guard around startup and scheduled poll runs.
- Reason: Avoid overlapping LTA poll cycles if a previous poll is still running.
- Scope: Added `runGuardedPoll` in `src/index.js`; skipped polls are logged and the next schedule remains unchanged.

### 2026-05-03: Remove Subscriptions Only After Successful Notification

- Decision: Remove a user's subscription only after Telegram confirms that the alert message was sent.
- Reason: Avoid silently dropping subscriptions for users whose alert delivery failed.
- Scope: Track successful chat IDs in `src/poller.js` and remove only those subscriptions.
- Test gap: Notification dispatch is not unit-tested yet because it currently depends on Telegram and DB side effects.

### 2026-05-03: Add First Pure Helper Tests

- Decision: Use Node's built-in test runner for the first test coverage.
- Reason: Covers useful polling logic without adding dependencies or changing runtime behavior.
- Scope: Added tests for `computeAvailabilityWithCounts` and `getPriceInfo`; exported `getPriceInfo` for testing.

### 2026-05-03: Validate Required Environment Variables

- Decision: Validate `BOT_TOKEN`, `LTA_ACCOUNT_KEY`, and `ADMIN_CHAT_ID` during startup.
- Reason: Fail fast with clear setup errors instead of allowing delayed polling or admin-command failures.
- Scope: Added minimal checks in `src/index.js`; `ADMIN_CHAT_ID` must be numeric.

### 2026-05-03: Escape Telegram HTML Output

- Decision: Escape dynamic values before inserting them into Telegram messages sent with `parse_mode: 'HTML'`.
- Reason: LTA-provided values such as locations, addresses, operators, prices, and positions can contain HTML-sensitive characters that may break Telegram rendering.
- Scope: Added small local `escapeHtml` helpers in `src/bot.js` and `src/poller.js`, then applied them only at dynamic HTML message call sites.

## Later Work

- Add throttled Telegram admin alerts for important runtime failures, such as repeated LTA API failures or poll-cycle errors, without spamming `ADMIN_CHAT_ID`.

## Change Log

### 2026-05-03

- Added optional `POLL_INTERVAL_MINUTES` configuration.
- Added an in-memory guard to skip overlapping poll cycles.
- Kept failed notification recipients subscribed for future retry.
- Added `npm test` using Node's built-in test runner.
- Added first tests for polling helper logic.
- Added startup validation for required environment variables.
- Recorded admin error alerts as later work.
- Added `.backups/` to `.gitignore`.
- Added this project notes file.
- Hardened Telegram HTML message formatting for dynamic data.
