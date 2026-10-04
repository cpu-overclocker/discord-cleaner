<div align="center">

# 👥 Friends Cleaner

**Bulk-remove friends from Discord.**

[Back to home](../README.md)

</div>

## Features

- **Filter by date added**, account age, or avatar type
- **Quick chips:** new account, no avatar, fresh friend, long-time friend
- **Search** by username, display name, or user ID
- **Sort** by date added, name, or account age
- **Bulk remove** with multi-select and Select all
- **Two-step per-row delete** to prevent mistakes
- **Open DM** or **open profile** in one click
- **Progress overlay** with rate-limit indicator and cancel button
- **Persistent prefs** for sort and filters

## Installation

1. Open <https://discord.com/app>
2. Press `F12`, then open the **Console** tab
3. Copy the content of [`friends-cleaner.js`](friends-cleaner.js)
4. Paste and press Enter

## Usage

### Row actions

| Element | Action |
|---|---|
| Avatar or name | Opens the user profile |
| 💬 | Opens the DM with this friend |
| 🗑 Remove | First click arms the button, second click confirms |
| Checkbox or row | Toggles selection |

### Badges

| Badge | Meaning |
|---|---|
| 🆕 | Account created less than 30 days ago |
| 👻 | No custom avatar |
| 🌱 | Friend for less than 7 days |
| ⏳ | Friend for more than a year |

## How it works

```js
GET    https://discord.com/api/v9/users/@me/relationships
DELETE https://discord.com/api/v9/users/@me/relationships/{user_id}
```

Same endpoints the official client uses. The token never leaves your browser.

## FAQ

**Can I undo a removal?**
No. Removal is permanent. You can send a new friend request, but the other person has to accept.

**Will they be notified?**
No. They will only notice you are no longer in their friends list.

**Why two clicks to delete?**
Anti-mistake. The first click arms the button, the second confirms. It disarms after 3 seconds.

---

[Back to home](../README.md) · [MIT License](../LICENSE)