<div align="center">

# Discord Cleaner

**Three standalone console tools to clean up Discord.**

[![License](https://img.shields.io/badge/license-MIT-23a55a?style=for-the-badge)](LICENSE)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-ff6b6b?style=for-the-badge)](CONTRIBUTING.md)

*No install. No extension. Paste in the console.*

</div>

## Tools

| | Tool | What it does |
|---|---|---|
| 👥 | **[Friends Cleaner](friends-cleaner/)** | Bulk-remove friends. Filter by date, account age, avatar. |
| 🚪 | **[Groups Cleaner](groups-cleaner/)** | Leave group DMs. Silent mode. Solo-group detection. |
| 💬 | **[DM Cleaner](dm-cleaner/)** | Delete every message you sent in a DM. |

Each tool is standalone. Use only what you need.

## Quick start

1. Open <https://discord.com/app>
2. Open DevTools with `CTRL + Shift + I`
3. Go to the **Console** tab
4. Open the tool's `.js` file, copy it, paste it, press Enter

> Chrome may ask you to type `allow pasting` on first use. This is a standard anti-self-XSS safeguard. The scripts are open source, read them first.

### 👥 Friends Cleaner

[`friends-cleaner/friends-cleaner.js`](friends-cleaner/friends-cleaner.js)

Sort by date added, name, or account age. Quick filters for new accounts, no-avatar users, fresh friends, and long-time friends. Two-step per-row delete. Custom Discord-style UI.

![Friends preview](assets/friends-preview.png)

### 🚪 Groups Cleaner

[`groups-cleaner/groups-cleaner.js`](groups-cleaner/groups-cleaner.js)

Silent mode, persisted. Auto-detects groups where you are the only member. Click a name to open the chat. Bulk-leave with a progress overlay.

![Groups preview](assets/groups-preview.png)

### 💬 DM Cleaner

[`dm-cleaner/dm-cleaner.js`](dm-cleaner/dm-cleaner.js)

Auto-detects the DM you are viewing. Fetches your messages, confirms, then deletes them with an adaptive delay that respects rate limits.

![DM preview](assets/dm-preview.png)

## Shared features

- **Token stays local.** No third-party servers, no telemetry.
- **Native Discord UI.** Draggable, dark theme.
- **Rate-limit handling.** Retry with backoff and jitter.
- **Cancellable.** Every long-running action has a cancel button.
- **Progress overlay.** Live count, ETA, error tally.
- **Persistent prefs.** Sort, filters, silent mode are remembered.

## How it works

All three tools use Discord's internal API (`https://discord.com/api/v10`), the same calls the web client makes:

- `DELETE /users/@me/relationships/{id}` to remove a friend
- `DELETE /channels/{id}?silent=true` to leave a group silently
- `DELETE /channels/{id}/messages/{id}` to delete a DM message

The token is read from `localStorage` via an isolated iframe, with a `webpackChunkdiscord_app` fallback.

## Disclaimer

Not affiliated with Discord Inc. Using scripts on your account may violate the ToS. Use at your own risk.

## License

[MIT](LICENSE)
