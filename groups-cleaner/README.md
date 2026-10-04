<div align="center">

# 🚪 Groups Cleaner

**Leave Discord group DMs in bulk.**

[Back to home](../README.md)

</div>

## Features

- **Solo-group detection** for groups where you are the only member
- **Silent mode** to leave without notifying other members, persisted
- **Two-step per-row delete**
- **Open chat** to check a group before leaving
- **Filter by size:** all, solo, 3-5 members, 6 or more
- **Search** by group name or ID
- **Bulk leave** with All, Solo, and None shortcuts
- **Progress overlay** with cancel button

## Installation

1. Open <https://discord.com/app>
2. Press `F12`, then open the **Console** tab
3. Copy the content of [`groups-cleaner.js`](groups-cleaner.js)
4. Paste and press Enter

## Usage

### Silent mode

The toggle below the list controls the API call.

- Checked: `DELETE /channels/{id}?silent=true`. Nobody is notified.
- Unchecked: `DELETE /channels/{id}`. Other members see "X left the group".

The choice is saved and restored next time.

### Selection shortcuts

| Button | Action |
|---|---|
| ✔ All | Select every visible group |
| 👤 Solo | Select only groups where you are alone |
| ✘ None | Deselect everything |

### Row actions

| Element | Action |
|---|---|
| Group name or ↗ | Opens the group in Discord |
| 🗑 | First click arms the button, second click confirms |

## How it works

```js
GET    https://discord.com/api/v10/users/@me/channels
DELETE https://discord.com/api/v10/channels/{channel_id}?silent=true
```

Group DMs are filtered by `type === 3`. Solo groups have `recipients.length === 0`.

## FAQ

**What is a solo group?**
A group DM where you are the only member left. Discord keeps them around when everyone else leaves. Safe to delete, nobody gets notified.

**What does silent mode do exactly?**
Without `?silent=true`, Discord posts a "X left the group" message for the remaining members. With the flag, nothing is posted.

**Can I rejoin after leaving?**
Only if someone adds you back.

---

[Back to home](../README.md) · [MIT License](../LICENSE)