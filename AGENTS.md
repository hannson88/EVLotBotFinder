# AGENTS.md

## Project Working Notes

- Make the smallest useful change for each approved improvement.
- Before editing tracked files, copy originals into a timestamped folder under `.backups/`.
- Keep `.backups/` out of Git.
- Document notable decisions here as the fork evolves.

## Decision Log

### 2026-05-03: Rename User-Facing Subscriptions To Alerts

- Decision: Keep `/subs` as the command but describe the feature as alerts in user-facing copy.
- Reason: The bot notifies users when unavailable chargers become available; "subscriptions" is less intuitive.
- Scope: Updated welcome text, command description, alert list, alert setup, removal, and unknown-command messages.

### 2026-05-03: Add Data Source Disclaimer

- Decision: Show a compact LTA/pricing disclaimer on nearby results and venue detail messages.
- Reason: Availability and price data come from LTA DataMall and may be incomplete or outdated.
- Scope: Added a shared disclaimer in `src/bot.js` without adding noise to generic bot messages.

### 2026-05-03: Show Nearby Provider-Level Options

- Decision: Nearby search results are provider/location options rather than aggregated venue rows.
- Reason: Provider affects app access, pricing, and availability; aggregating providers can mislead users.
- Scope: Return one nearby row per lot/provider and show provider names in nearby message and button labels.

### 2026-05-03: Compact Nearby Result Buttons

- Decision: Limit nearby button venue names to 16 characters and show explicit AC/DC open counts.
- Reason: Telegram buttons truncate on phones; compact labels should still communicate charger type and availability.
- Scope: Updated nearby button formatting only; detailed result text remains unchanged.

### 2026-05-03: Clarify Nearby Availability Sorting And Filters

- Decision: Rename availability sorting to "Best chance" and add All/AC/DC filters.
- Reason: "Most available" was ambiguous between raw open count and percentage available; users also need to narrow AC or DC charger choices.
- Scope: Sort best chance by availability ratio, then open count, then distance; keep result buttons short with a venue hint and open count.

### 2026-05-03: Add Nearby Sort Controls

- Decision: Move nearby details into the message body and keep venue buttons short and numbered.
- Reason: Telegram button labels truncate long text; users still need to compare distance, availability, and cost.
- Scope: Added short-lived in-memory location cache, sort buttons for nearest/available/cheapest, and multiline result details.

### 2026-05-03: Enrich Nearby Search Results

- Decision: Show distance, AC/DC live counts, and the lowest visible price in nearby result buttons.
- Reason: Nearby users may choose based on proximity, vacancy, or cost; compact labels reduce extra taps.
- Scope: Enriched the venue query and result label formatter; removed the location-share reply keyboard after location is received.

### 2026-05-03: Add Nearby Charger Search

- Decision: Add `/nearby` with Telegram location sharing and a 3 km venue search radius.
- Reason: Users can find chargers near their current position without typing an address.
- Scope: Use existing LTA latitude/longitude data, do not store user locations, return up to 10 nearby venues, and reuse the existing venue detail/subscription flow.

### 2026-05-03: Add Throttled Admin Error Alerts

- Decision: Send Telegram alerts to `ADMIN_CHAT_ID` for high-signal runtime failures.
- Reason: Important poll and LTA fetch failures should be visible without manually watching PM2 logs.
- Scope: Added `src/adminAlerts.js` with 30-minute per-key throttling; wired startup poll, scheduled poll, and LTA fetch failures.

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

## Change Log

### 2026-05-03

- Renamed user-facing subscription copy to alerts and updated bot branding.
- Added LTA DataMall and pricing disclaimer to availability/pricing views.
- Changed `/nearby` results to provider-level options.
- Shortened `/nearby` result buttons and made AC/DC open counts explicit.
- Added AC/DC nearby filters and clarified availability sorting as best chance.
- Added `/nearby` sort controls for nearest, best chance, and cheapest.
- Enriched `/nearby` result labels with distance, availability, and price.
- Added `/nearby` location-based charger search.
- Added throttled Telegram admin alerts for important runtime failures.
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
