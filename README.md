<div align="center">

# 🛠 Discord Tools

### Clean up your Discord — friends, groups, and DMs — without the pain.

A single-paste userscript that adds a native-looking panel right inside Discord Web.

![Version](https://img.shields.io/badge/version-1.3-5865f2?style=flat-square)
![Platform](https://img.shields.io/badge/platform-Discord%20Web-5865f2?style=flat-square)
![Language](https://img.shields.io/badge/language-JavaScript-f7df1e?style=flat-square)

**[⚡ Quick Start](#-quick-start)** · **[🎯 What it does](#-what-it-does)** · **[🔒 Safety](#-is-it-safe)** · **[❓ FAQ](#-faq)**

</div>

---

## ⚡ Quick Start

1. Open **[Discord](https://discord.com/app)** in your browser or the Discord App
2. Press `F12` or `CTRL + SHIFT + I` → open the **Console** tab
3. Paste the entire content of `discord-tools.js` and hit `Enter`
4. The panel appears — you're ready to go.

> 💡 Prefer automation? Use it as a **bookmarklet** or install via **Tampermonkey / Violentmonkey**.

---

## 🎯 What it does

| Tab | What you get |
|---|---|
| 👥 **Friends** | Search, sort, and filter your entire list. Remove one or many at once. Optionally wipe your DM history first, then auto-close the chat. |
| 👥 **Groups** | See every group DM you're in. Leave **silently** (no notification), and clean your messages before leaving. |
| 💬 **Not Friends** | Every DM from someone *not* on your friends list. Filter by message count, scan for empty threads, clean + close in bulk. |
| 📜 **History** | A running log of everything you've done. Search, filter, and clear it anytime. |

---

## ✨ Why it feels good

- **Looks native** — Same fonts, colors, and hover states as Discord itself.
- **Live presence** — 🟢 Online · 🟡 Idle · 🔴 DND · ⚫ Offline, refreshed every 15s right on the avatar.
- **Smart rate-limiting** — Adaptive delays mean fewer `429` errors and no manual waiting.
- **Real-time feedback** — Progress bars, per-conversation counters, and clear status text.
- **Zero dependencies** — Pure vanilla JavaScript. No build step, no extension needed.

---

## 🔒 Is it safe?

**Yes — and here's exactly why.**

- ✅ **100% client-side.** Nothing is sent to any external server.
- ✅ **Your token never leaves your browser.** It's read locally and used only for `discord.com` API calls.
- ✅ **Fully readable.** Every line of `discord-tools.js` is auditable — check it yourself.
- ✅ **No analytics, no tracking, no telemetry.**

> ⚠️ **General rule:** never paste code into your console that you haven't read. This script is self-contained and open source.

---

## ❓ FAQ

**Will I get banned?**
The script uses Discord's own API with normal rate limits. Still, use it responsibly — bulk actions are permanent.

**Where is my data stored?**
Preferences in `localStorage` · History in `window.name` (survives reloads, cleared when you close the tab).

**Can I undo a removal?**
No. Removing a friend, leaving a group, or deleting messages is **permanent**. Double-check before confirming.

---

<div align="center">

**Made with ❤️ for the Discord community**

</div>