<div align="center">

# 🛠 Discord Tools

**A powerful all-in-one userscript to manage your Discord account.**
Clean friends, groups, and DMs — all from a sleek, native-looking panel.

![Version](https://img.shields.io/badge/version-1.3-5865f2?style=flat-square)
![Platform](https://img.shields.io/badge/platform-Discord%20Web-5865f2?style=flat-square)
![Language](https://img.shields.io/badge/language-JavaScript-f7df1e?style=flat-square)

</div>

---

## ✨ Features

<table>
<tr>
<td width="50%">

### 👥 Friends Manager
- List, search, sort, and filter all your friends
- Badges for new accounts, fresh friends, long-time friends, no-avatar
- Remove individually or in bulk
- Optional: clean your DM messages before removing
- Optional: auto-close the DM in the sidebar

</td>
<td width="50%">

### 👥 Groups Manager
- List all your group DMs
- Filter by Solo, Named, Inactive, Recent, Old
- Leave individually or in bulk (silent mode supported)
- Optional: delete your messages before leaving

</td>
</tr>
<tr>
<td width="50%">

### 💬 Not Friends
- All DMs from people who aren't in your friend list
- 3 filters: **With my messages** / **Without my messages** / **Empty**
- Deep scan to detect truly empty conversations
- Clean + close in one click

</td>
<td width="50%">

### 📜 History
- Logs every friend removed, group left, DM cleaned
- Search, filter by type, clear all
- Session-only storage (cleared on page refresh)

</td>
</tr>
</table>

---

## 🎨 Highlights

- **Native Discord look** — same fonts, colors, and interactions
- **Floating draggable window** — minimize, move, reload
- **Adaptive rate-limit handling** — no manual cooldowns
- **Live progress bars** — global counter + per-conversation clean tracker
- **Loading modal** with progress on startup
- **Zero dependencies** — pure vanilla JavaScript

---

## 🚀 Installation

1. Open **Discord** in your browser → `discord.com/app`
2. Open the **DevTools Console** (`CTRL + SHIFT + I` or `F12` → Console tab)
3. Copy the entire content of `discord-tools.js`
4. Paste it into the console and hit **Enter**
5. The Discord Tools panel appears

> 💡 Tip: you can save the script as a **bookmarklet** or use it via a userscript manager (Tampermonkey, Violentmonkey).

---

## 👁️ Preview

<div align="center">

![Discord Tools Preview](assets/preview.png)

</div>

---

## ⚙️ How it works

- Extracts your Discord token from **localStorage** or via **webpack modules**
- Uses the official Discord API (`/api/v10`) with proper rate-limit handling
- All operations happen client-side — nothing is sent anywhere else
- Preferences stored in `localStorage`, history in `window.name` (session-only)

---

## 🔒 Privacy

- No external server, no analytics, no tracking
- Your token never leaves your browser
- Everything runs locally on `discord.com`

---

<div align="center">

**Made with ❤️ for the Discord community**

</div>