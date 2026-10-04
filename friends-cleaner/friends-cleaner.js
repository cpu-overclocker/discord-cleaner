// ============================================================
//  Discord — Bulk Friend Remover (v4.7)
//  + Onglet Historique des suppressions récentes
// ============================================================
(async () => {
  document.getElementById('__fr_box')?.remove();
  document.getElementById('__fr_style')?.remove();
  document.getElementById('__fr_progress')?.remove();
  document.getElementById('__fr_confirm')?.remove();

  const isValidToken = t => typeof t === "string" && /^[A-Za-z0-9_-]{20,}\.[\w-]{4,}\.[\w-]{20,}$/.test(t);

  // ── Token extraction ────────────────────────────────────
  const TOKEN = (() => {
    try {
      const iframe = document.createElement('iframe');
      document.head.append(iframe);
      const pd = Object.getOwnPropertyDescriptor(iframe.contentWindow, 'localStorage');
      iframe.remove();
      const storage = pd.get.call(window);
      for (const key of Object.keys(storage)) {
        const val = storage.getItem(key)?.replace(/^"|"$/g, "");
        if (isValidToken(val)) { console.log("🔑 Token via iframe localStorage"); return val; }
      }
    } catch (_) {}

    try {
      let token = null;
      webpackChunkdiscord_app.push([[Symbol()], {}, ({ c }) => {
        for (const id in c) {
          const exp = c[id]?.exports;
          if (!exp) continue;
          const candidates = [exp, exp?.default, ...Object.values(exp)];
          for (const val of candidates) {
            if (typeof val?.getToken !== "function") continue;
            try { const t = val.getToken(); if (isValidToken(t)) { token = t; break; } } catch (_) {}
          }
          if (token) break;
        }
      }]);
      webpackChunkdiscord_app.pop();
      if (token) { console.log("🔑 Token via webpack"); return token; }
    } catch (_) {}

    throw new Error("Token not found — are you logged in on discord.com/app?");
  })();

  const BASE  = "https://discord.com/api/v9";
  const HEADS = { Authorization: TOKEN, "Content-Type": "application/json" };
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  // ── apiFetch with rate-limit handling ───────────────────
  async function apiFetch(url, opts = {}, onWait = null) {
    const MAX = 8;
    for (let attempt = 0; attempt < MAX; attempt++) {
      let r;
      try { r = await fetch(url, { headers: HEADS, ...opts }); }
      catch (e) { if (attempt < 2) { await sleep(800); continue; } throw e; }
      if (r.status === 429) {
        const body = await r.json().catch(() => ({}));
        const waitMs = Math.ceil((body.retry_after ?? 1) * 1000 + 400 + Math.random() * 400);
        if (onWait) onWait({ waitMs, attempt: attempt + 1, max: MAX });
        await sleep(waitMs);
        continue;
      }
      return r;
    }
    throw new Error(`Rate limited after ${MAX} attempts`);
  }

  // ── Adaptive delay ──────────────────────────────────────
  class AdaptiveDelay {
    #delay; #floor;
    static MAX = 8000;
    static STEP_DOWN_DELAY = 20;
    static STEP_DOWN_FLOOR = 10;
    static STEP_UP_FLOOR   = 400;
    constructor(total) {
      this.#floor = Math.round(Math.min(2000, Math.max(600, 500 + total * 2)));
      this.#delay = Math.round(Math.min(2500, Math.max(800, 700 + total * 2.5)));
    }
    onSuccess() {
      this.#floor = Math.max(500, this.#floor - AdaptiveDelay.STEP_DOWN_FLOOR);
      this.#delay = Math.max(this.#floor, this.#delay - AdaptiveDelay.STEP_DOWN_DELAY);
    }
    onRateLimit(retrySec) {
      this.#floor = Math.min(AdaptiveDelay.MAX - 600, this.#floor + AdaptiveDelay.STEP_UP_FLOOR);
      this.#delay = Math.min(AdaptiveDelay.MAX, Math.max(retrySec * 1000 + 800, this.#floor + 600));
    }
    get current() { return this.#delay; }
    get floorMs() { return this.#floor; }
  }

  // ── Utilities ───────────────────────────────────────────
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const createdAt = id => new Date(Number((BigInt(id) >> 22n) + 1420070400000n));
  const fmtDate = d => d ? d.toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' }) : 'unknown';
  const fmtDateTime = ts => {
    if (!ts) return 'unknown';
    const d = new Date(ts);
    return d.toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' }) +
      ' ' + d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  };
  const displayName = u => u.global_name || u.username;
  const avatarUrl = u => u.avatar
    ? `https://cdn.discordapp.com/avatars/${u.id}/${u.avatar}.webp?size=64`
    : `https://cdn.discordapp.com/embed/avatars/${Number((BigInt(u.id) >> 22n) % 6n)}.png`;
  const fmtRelative = d => {
    if (!d) return 'unknown';
    const diff = Date.now() - d.getTime(), abs = Math.abs(diff), DAY = 86400000;
    if (abs < 60000) return diff > 0 ? 'just now' : 'in a moment';
    if (abs < 3600000) return diff > 0 ? `${Math.floor(abs/60000)} min ago` : `in ${Math.floor(abs/60000)} min`;
    if (abs < DAY) return diff > 0 ? `${Math.floor(abs/3600000)} h ago` : `in ${Math.floor(abs/3600000)} h`;
    if (abs < 30*DAY) return diff > 0 ? `${Math.floor(abs/DAY)} d ago` : `in ${Math.floor(abs/DAY)} d`;
    if (abs < 365*DAY) return diff > 0 ? `${Math.floor(abs/(30*DAY))} mo ago` : `in ${Math.floor(abs/(30*DAY))} mo`;
    return diff > 0 ? `${Math.floor(abs/(365*DAY))} y ago` : `in ${Math.floor(abs/(365*DAY))} y`;
  };
  const fmtTsRelative = ts => fmtRelative(new Date(ts));

  // ── Preferences ─────────────────────────────────────────
  const PREF_KEY = '__fr_prefs_v4';
  const loadPrefs = () => { try { return JSON.parse(localStorage.getItem(PREF_KEY)) || {}; } catch { return {}; } };
  const savePrefs = (p) => { try { localStorage.setItem(PREF_KEY, JSON.stringify(p)); } catch {} };
  const prefs = loadPrefs();

  // ── History storage ─────────────────────────────────────
  const HISTORY_KEY = '__fr_history_v1';
  const HISTORY_MAX = 500;
  let history = [];
  try { history = JSON.parse(localStorage.getItem(HISTORY_KEY)) || []; } catch {}
  const saveHistory = () => {
    try {
      if (history.length > HISTORY_MAX) history = history.slice(0, HISTORY_MAX);
      localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
    } catch {}
  };
  const pushHistory = (entry) => {
    // Avoid duplicates by id — keep only the most recent
    history = history.filter(h => h.id !== entry.id);
    history.unshift(entry);
    saveHistory();
    const hc = document.getElementById('fr-hcount');
    if (hc) hc.textContent = history.length;
    if (activeTab === 'history') renderHistory();
  };
  const clearHistory = () => {
    history = [];
    saveHistory();
    const hc = document.getElementById('fr-hcount');
    if (hc) hc.textContent = '0';
    if (activeTab === 'history') renderHistory();
  };

  // ── Fetch ME, friends & DM channels (parallel) ──────────
  console.log("📥 Fetching profile, friends & DM channels...");
  const [rMe, rRel, rCh] = await Promise.all([
    apiFetch(`${BASE}/users/@me`),
    apiFetch(`${BASE}/users/@me/relationships`),
    apiFetch(`${BASE}/users/@me/channels`),
  ]);
  if (!rMe.ok)  throw new Error(`Could not fetch profile (${rMe.status}) — invalid token?`);
  if (!rRel.ok) throw new Error(`Could not fetch friends (${rRel.status})`);

  const ME = await rMe.json();
  console.log(`👤 Logged in as ${ME.username} (${ME.id})`);

  let friends = (await rRel.json())
    .filter(r => r.type === 1)
    .map(r => ({ id: r.id, user: r.user, since: r.since ? new Date(r.since) : null, created: createdAt(r.id) }));

  const dmChannelByUserId = new Map();
  if (rCh.ok) {
    for (const ch of await rCh.json()) {
      if (ch.type === 1 && ch.recipients?.[0]) dmChannelByUserId.set(ch.recipients[0].id, ch.id);
    }
  }

  const selected = new Set();
  console.log(`  → ${friends.length} friend(s) · ${dmChannelByUserId.size} DM channel(s) in cache · ${history.length} in history`);

  // ── Badges ──────────────────────────────────────────────
  const DAY = 86400000;
  const isNewAccount     = f => (Date.now() - f.created.getTime()) < 30 * DAY;
  const isNoAvatar       = f => !f.user.avatar;
  const isFreshFriend    = f => f.since && (Date.now() - f.since.getTime()) < 7 * DAY;
  const isLongTimeFriend = f => f.since && (Date.now() - f.since.getTime()) > 365 * DAY;

  function badgesFor(f) {
    const out = [];
    if (isNewAccount(f))     out.push({ icon: '🆕', label: 'New account (< 30 days)',     color: '#5865f2' });
    if (isNoAvatar(f))       out.push({ icon: '👻', label: 'No custom avatar',            color: '#b5bac1' });
    if (isFreshFriend(f))    out.push({ icon: '🌱', label: 'Friend for less than 7 days', color: '#23a55a' });
    if (isLongTimeFriend(f)) out.push({ icon: '⏳', label: 'Friend for over a year',      color: '#faa61a' });
    return out;
  }

  // ── Flux (profile open) ─────────────────────────────────
  function getFluxDispatcher() {
    let dispatcher = null;
    window.webpackChunkdiscord_app?.push([[Symbol()], {}, ({ c }) => {
      for (const id in c) {
        const exp = c[id]?.exports;
        if (!exp) continue;
        for (const val of [exp, exp?.default, ...Object.values(exp)]) {
          try {
            if (val && typeof val === 'object' && !Array.isArray(val) && !(val instanceof Element) &&
                typeof val.dispatch === 'function' && '_actionHandlers' in val) { dispatcher = val; return; }
          } catch {}
        }
      }
    }]);
    window.webpackChunkdiscord_app?.pop();
    return dispatcher;
  }
  let _flux = null;
  function openProfile(userId) {
    try {
      const el = document.querySelector(`img[src*="/users/${userId}/"]`)?.closest('[role="listitem"]');
      if (el) { el.click(); return; }
    } catch {}
    try {
      _flux ??= getFluxDispatcher();
      if (_flux) { _flux.dispatch({ type: 'USER_PROFILE_MODAL_OPEN', userId }); return; }
    } catch {}
    window.open(`discord://-/users/${userId}`);
  }

  // ── Navigation ──────────────────────────────────────────
  function navigateToChannel(channelId) {
    const path = `/channels/@me/${channelId}`;
    if (location.pathname === path) return;
    history_pushState(path);
  }
  function history_pushState(path) {
    window.history.pushState({}, '', path);
    window.dispatchEvent(new PopStateEvent('popstate', { state: {} }));
  }

  // ── DM helpers ──────────────────────────────────────────
  async function resolveDMChannel(userId) {
    let id = dmChannelByUserId.get(userId);
    if (id) return id;
    try {
      const r = await apiFetch(`${BASE}/users/@me/channels`, {
        method: 'POST', body: JSON.stringify({ recipient_id: userId }),
      });
      if (r.ok) {
        const ch = await r.json();
        dmChannelByUserId.set(userId, ch.id);
        console.log(`💬 DM channel resolved for ${userId}: ${ch.id}`);
        return ch.id;
      } else {
        console.warn(`⚠️ resolveDMChannel(${userId}) → HTTP ${r.status}`);
      }
    } catch (e) { console.warn('⚠️ resolveDMChannel:', e); }
    return null;
  }

  async function closeDMChannel(channelId) {
    if (!channelId) return false;
    try {
      const r = await apiFetch(`${BASE}/channels/${channelId}`, { method: 'DELETE' });
      if (r.ok || r.status === 404) {
        console.log(`👋 Closed DM ${channelId} from sidebar`);
        if (location.pathname.includes(channelId)) {
          history_pushState('/channels/@me');
        }
        return true;
      }
      console.warn(`⚠️ closeDMChannel(${channelId}) → HTTP ${r.status}`);
    } catch (e) { console.warn('⚠️ closeDMChannel:', e); }
    return false;
  }

  async function openDM(userId) {
    let channelId = await resolveDMChannel(userId);
    if (!channelId) { window.open(`discord://-/users/${userId}`); return false; }
    navigateToChannel(channelId);
    return true;
  }

  async function fetchAllMyMessages(channelId) {
    let all = [], lastId = null;
    while (true) {
      const url = new URL(`${BASE}/channels/${channelId}/messages`);
      url.searchParams.set("limit", "100");
      if (lastId) url.searchParams.set("before", lastId);
      const r = await apiFetch(url.toString());
      if (!r.ok) break;
      const batch = await r.json();
      if (!batch.length) break;
      all.push(...batch.filter(m => m.author.id === ME.id && [0, 19, 20].includes(m.type)));
      lastId = batch.at(-1).id;
      if (batch.length < 100) break;
    }
    return all;
  }

  async function quickCountMyMessages(channelId) {
    try {
      const url = new URL(`${BASE}/channels/${channelId}/messages`);
      url.searchParams.set("limit", "100");
      const r = await apiFetch(url.toString());
      if (!r.ok) return 0;
      const batch = await r.json();
      return batch.filter(m => m.author.id === ME.id && [0, 19, 20].includes(m.type)).length;
    } catch { return 0; }
  }

  // ── Delete DM messages ──────────────────────────────────
  async function deleteAllDMMessages(channelId, msgs, label, hooks = {}) {
    const total = msgs.length;
    let deleted = 0, errors = 0, rateLimits = 0;
    let lastErrorStatus = 0;
    const delay = new AdaptiveDelay(total);

    for (const msg of msgs) {
      if (hooks.isCancelled?.()) break;

      let attempts403 = 0;
      let attemptsOther = 0;
      let done = false;

      while (!done) {
        let r;
        try {
          r = await fetch(`${BASE}/channels/${channelId}/messages/${msg.id}`, {
            method: "DELETE", headers: HEADS,
          });
        } catch (e) {
          console.warn(`  ⚠️ Network error on msg ${msg.id}:`, e.message);
          await sleep(1500);
          if (++attemptsOther >= 2) { errors++; lastErrorStatus = -1; done = true; }
          continue;
        }

        if (r.status === 204) {
          deleted++; delay.onSuccess(); done = true;
        }
        else if (r.status === 404) {
          deleted++; delay.onSuccess(); done = true;
        }
        else if (r.status === 403) {
          attempts403++;
          if (attempts403 < 3) {
            console.warn(`  🔁 403 on msg ${msg.id} — retry ${attempts403}/2 in 1.5s…`);
            await sleep(1500);
          } else {
            console.warn(`  ❌ 403 on msg ${msg.id} — giving up`);
            errors++; lastErrorStatus = 403; done = true;
          }
        }
        else if (r.status === 429) {
          rateLimits++;
          const body = await r.json().catch(() => ({}));
          delay.onRateLimit(body.retry_after ?? 1);
          if (hooks.onProgress) hooks.onProgress(deleted, total, errors, rateLimits, delay.current);
          await sleep(delay.current);
        }
        else {
          attemptsOther++;
          if (attemptsOther < 2) {
            console.warn(`  🔁 Status ${r.status} on msg ${msg.id} — retrying…`);
            await sleep(2000);
          } else {
            errors++; lastErrorStatus = r.status; done = true;
          }
        }
      }

      if (hooks.onProgress) hooks.onProgress(deleted, total, errors, rateLimits, 0);
      if (!hooks.isCancelled?.()) await sleep(delay.current);
    }

    return {
      deleted, errors, rateLimits, total,
      cancelled: !!hooks.isCancelled?.(),
      lastErrorStatus,
    };
  }

  // ── Choice dialog ───────────────────────────────────────
  function choiceDialog({ title, message, choices }) {
    return new Promise(resolve => {
      document.getElementById('__fr_confirm')?.remove();
      const ov = document.createElement('div');
      ov.id = '__fr_confirm';
      Object.assign(ov.style, {
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
        zIndex: '100001', display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: '"gg sans","Noto Sans",sans-serif',
      });
      const box = document.createElement('div');
      Object.assign(box.style, {
        background: '#313338', borderRadius: '12px', padding: '24px 28px 22px',
        width: '480px', maxWidth: '92vw', color: '#dbdee1', textAlign: 'center',
        boxShadow: '0 12px 48px rgba(0,0,0,0.85), 0 0 0 1px rgba(255,255,255,0.06)',
      });
      const t = document.createElement('div');
      t.textContent = title;
      Object.assign(t.style, { fontSize: '18px', fontWeight: '700', color: '#fff', marginBottom: '10px' });
      const m = document.createElement('div');
      m.innerHTML = message;
      Object.assign(m.style, { fontSize: '13px', color: '#b5bac1', lineHeight: '1.55', marginBottom: '20px', textAlign: 'left' });
      box.append(t, m);

      const row = document.createElement('div');
      Object.assign(row.style, { display: 'flex', gap: '8px', flexWrap: 'wrap' });

      const mkBtn = (c) => {
        const bg    = c.danger ? '#da373c' : (c.primary ? '#5865f2' : '#4e5058');
        const hover = c.danger ? '#a12d31' : (c.primary ? '#4752c4' : '#6d6f78');
        const b = document.createElement('button');
        b.innerHTML = c.label;
        Object.assign(b.style, {
          flex: '1 1 0', minWidth: '110px', padding: '10px 14px', borderRadius: '6px', border: 'none',
          background: bg, color: '#fff', fontSize: '13px', fontWeight: '600',
          cursor: 'pointer', transition: 'background .15s', fontFamily: 'inherit',
        });
        b.onmouseenter = () => b.style.background = hover;
        b.onmouseleave = () => b.style.background = bg;
        b.onclick = () => { ov.remove(); resolve(c.value); };
        return b;
      };
      for (const c of choices) row.append(mkBtn(c));
      box.append(row);
      ov.append(box);
      document.body.append(ov);
    });
  }

  // ── Progress overlay ────────────────────────────────────
  function createProgressOverlay(initialMode = 'remove') {
    document.getElementById('__fr_progress')?.remove();
    const ov = document.createElement('div');
    ov.id = '__fr_progress';
    Object.assign(ov.style, {
      position: 'fixed', bottom: '28px', right: '28px', zIndex: '99999',
      fontFamily: '"gg sans","Noto Sans",sans-serif', background: '#313338',
      borderRadius: '12px', padding: '18px 22px', width: '340px',
      boxShadow: '0 8px 32px rgba(0,0,0,0.6)', color: '#dbdee1', userSelect: 'none',
    });

    let _cancelled = false, _mode = initialMode;
    const configs = {
      remove: { icon: '🗑', title: 'Removing friends…', noun: 'Removed' },
      dm:     { icon: '🧹', title: 'Cleaning DMs…',     noun: 'Deleted' },
    };

    const titleRow = document.createElement('div');
    Object.assign(titleRow.style, { display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' });
    const titleIcon = document.createElement('span'); titleIcon.style.fontSize = '18px';
    const titleText = document.createElement('span');
    Object.assign(titleText.style, { fontSize: '15px', fontWeight: '700', color: '#fff', flex: '1' });
    const btnClose = document.createElement('button');
    btnClose.textContent = '✕ Cancel';
    Object.assign(btnClose.style, { marginLeft: 'auto', background: 'transparent', border: '1px solid #4e5058',
      borderRadius: '4px', color: '#b5bac1', fontSize: '12px', padding: '3px 8px', cursor: 'pointer', flexShrink: '0' });
    btnClose.onmouseenter = () => { btnClose.style.background = '#da373c'; btnClose.style.color = '#fff'; btnClose.style.borderColor = '#da373c'; };
    btnClose.onmouseleave = () => { btnClose.style.background = 'transparent'; btnClose.style.color = '#b5bac1'; btnClose.style.borderColor = '#4e5058'; };
    btnClose.onclick = () => {
      _cancelled = true; btnClose.disabled = true; btnClose.textContent = '…';
      titleText.textContent = 'Cancelling…'; titleText.style.color = '#faa61a';
    };
    titleRow.append(titleIcon, titleText, btnClose);

    const statusLine = document.createElement('div');
    Object.assign(statusLine.style, { fontSize: '14px', fontWeight: '600', color: '#fff', marginBottom: '10px', minHeight: '20px' });
    const barTrack = document.createElement('div');
    Object.assign(barTrack.style, { background: '#1e1f22', borderRadius: '99px', height: '8px', overflow: 'hidden', marginBottom: '10px' });
    const barFill = document.createElement('div');
    Object.assign(barFill.style, { height: '100%', width: '0%',
      background: 'linear-gradient(90deg, #da373c, #ff6b6b)', borderRadius: '99px', transition: 'width 0.4s ease' });
    barTrack.append(barFill);
    const currentLine = document.createElement('div');
    Object.assign(currentLine.style, { fontSize: '12px', color: '#b5bac1', minHeight: '16px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' });
    const rateLimitLine = document.createElement('div');
    Object.assign(rateLimitLine.style, { fontSize: '12px', color: '#faa61a', marginTop: '4px', minHeight: '16px', fontWeight: '600', display: 'none' });
    ov.append(titleRow, statusLine, barTrack, currentLine, rateLimitLine);
    document.body.append(ov);

    function applyMode(mode) {
      _mode = mode;
      const c = configs[mode] || configs.remove;
      titleIcon.textContent = c.icon;
      titleText.textContent = c.title;
      titleText.style.color = '#fff';
      barFill.style.background = mode === 'dm'
        ? 'linear-gradient(90deg, #5865f2, #8891ff)'
        : 'linear-gradient(90deg, #da373c, #ff6b6b)';
    }
    applyMode(initialMode);

    return {
      setMode: applyMode,
      update: (done, total, name, err = 0) => {
        const noun = configs[_mode]?.noun || 'Done';
        statusLine.textContent = `${noun}: ${done}/${total}${err > 0 ? `  ⚠️ ${err} error${err > 1 ? 's' : ''}` : ''}`;
        barFill.style.width = `${total > 0 ? Math.round((done / total) * 100) : 0}%`;
        currentLine.textContent = name ? `⏳ ${name}` : '';
      },
      setRateLimit: (waitMs, attempt, max) => {
        rateLimitLine.style.display = 'block';
        rateLimitLine.textContent = `🐢 Rate limited — retry ${attempt}/${max} in ${(waitMs/1000).toFixed(1)}s`;
      },
      clearRateLimit: () => { rateLimitLine.style.display = 'none'; rateLimitLine.textContent = ''; },
      finish: (done, total, err, cancelled = false) => {
        titleText.textContent = cancelled ? 'Cancelled ⛔' : 'Done ✅';
        titleText.style.color = cancelled ? '#faa61a' : '#23a55a';
        statusLine.textContent = `${done}/${total}${err > 0 ? `  ⚠️ ${err} error${err > 1 ? 's' : ''}` : ''}`;
        barFill.style.background = cancelled
          ? 'linear-gradient(90deg,#faa61a,#ffcf72)'
          : 'linear-gradient(90deg,#23a55a,#57f287)';
        barFill.style.width = '100%';
        currentLine.textContent = '';
        rateLimitLine.style.display = 'none';
        setTimeout(() => ov.remove(), 5000);
      },
      remove: () => ov.remove(),
      isCancelled: () => _cancelled,
    };
  }

  // ── Styles ──────────────────────────────────────────────
  const style = document.createElement('style');
  style.id = '__fr_style';
  style.textContent = `
    #__fr_box { position:fixed; top:6vh; left:calc(50% - 400px); width:800px; max-width:96vw; height:88vh;
      background:#313338; color:#dbdee1; border-radius:12px; z-index:1000; display:flex; flex-direction:column;
      font-family:"gg sans","Noto Sans",sans-serif; box-shadow:0 12px 48px rgba(0,0,0,.85),0 0 0 1px rgba(255,255,255,.06); }
    #__fr_box * { box-sizing:border-box; }
    .fr-head { display:flex; align-items:center; padding:10px 14px; cursor:grab; user-select:none; border-bottom:1px solid #1e1f22; flex-shrink:0; gap:6px; }
    .fr-title { font-size:14px; font-weight:700; color:#fff; white-space:nowrap; margin:0 8px; }
    .fr-x { background:transparent; border:none; color:#b5bac1; font-size:16px; cursor:pointer; padding:2px 6px; border-radius:4px; }
    .fr-x:hover { background:#da373c; color:#fff; }
    .fr-min { background:transparent; border:none; color:#b5bac1; cursor:pointer; padding:4px 6px; border-radius:4px; display:flex; align-items:center; }
    .fr-min svg { transition:transform .15s; }
    #__fr_box.min .fr-min svg { transform:rotate(-90deg); }
    .fr-min:hover { background:#4e5058; color:#fff; }
    #__fr_box.min { height:auto; width:520px; }
    #__fr_box.min .fr-body, #__fr_box.min .fr-foot { display:none; }
    #__fr_box.min .fr-head { border-bottom:none; }

    /* Tabs */
    .fr-tabs { display:flex; gap:2px; flex:1; }
    .fr-tab { background:transparent; border:none; color:#949ba4;
      padding:6px 12px; border-radius:6px; font-size:12px; font-weight:600; cursor:pointer;
      display:flex; align-items:center; gap:6px; transition:all .12s; font-family:inherit; }
    .fr-tab:hover { background:#3a3c43; color:#fff; }
    .fr-tab.active { background:#5865f2; color:#fff; }
    .fr-tabcount { background:rgba(255,255,255,.12); padding:0 6px; border-radius:99px;
      font-size:10px; font-weight:700; min-width:18px; text-align:center;
      line-height:16px; height:16px; }
    .fr-tab.active .fr-tabcount { background:rgba(0,0,0,.22); }

    /* Body / panels */
    .fr-body { flex:1; display:flex; overflow:hidden; position:relative; }
    .fr-panel { flex:1; display:flex; flex-direction:column; overflow:hidden; }
    .fr-panel:not(.active) { display:none; }

    .fr-bar { padding:10px 16px 8px; display:flex; flex-wrap:wrap; gap:8px; align-items:center; flex-shrink:0; }
    .fr-bar input, .fr-bar select { background:#1e1f22; color:#dbdee1; border:1px solid #2b2d31; border-radius:4px; padding:6px 8px; font-size:12px; outline:none; font-family:inherit; }
    .fr-bar input:focus, .fr-bar select:focus { border-color:#5865f2; }
    .fr-btn { background:#4e5058; color:#fff; border:none; border-radius:4px; padding:6px 10px; font-size:12px; font-weight:600; cursor:pointer; transition:background .15s; font-family:inherit; }
    .fr-btn:hover { background:#6d6f78; } .fr-btn.red { background:#da373c; } .fr-btn.red:hover { background:#a12d31; }
    .fr-btn:disabled { opacity:.45; cursor:not-allowed; }
    .fr-chips { display:flex; flex-wrap:wrap; gap:6px; padding:0 16px 10px; flex-shrink:0; }
    .fr-chip { background:#1e1f22; color:#b5bac1; border:1px solid #2b2d31; border-radius:99px; padding:4px 10px; font-size:11px; font-weight:600; cursor:pointer; transition:all .12s; font-family:inherit; }
    .fr-chip:hover { border-color:#5865f2; color:#5865f2; } .fr-chip.active { background:rgba(88,101,242,.15); border-color:#5865f2; color:#fff; }
    .fr-adv { display:none; padding:10px 16px; gap:8px; flex-wrap:wrap; align-items:center; border-top:1px dashed #2b2d31; margin-top:2px; }
    .fr-adv.open { display:flex; }
    .fr-adv label { font-size:11px; color:#b5bac1; display:flex; align-items:center; gap:4px; }
    .fr-list { flex:1; overflow-y:auto; padding:6px 10px; background:#2b2d31; border-top:1px solid #1e1f22; }
    .fr-row { display:flex; align-items:center; gap:10px; padding:8px; border-radius:6px; cursor:pointer; border-bottom:1px solid #313338; transition:background .12s; }
    .fr-row:hover { background:#35373c; } .fr-row.sel { background:rgba(218,55,60,.15); }
    .fr-cb { accent-color:#da373c; width:16px; height:16px; flex-shrink:0; cursor:pointer; }
    .fr-av { width:40px; height:40px; border-radius:50%; flex-shrink:0; background:#1e1f22; object-fit:cover; }
    .fr-info { flex:1; min-width:0; }
    .fr-name { font-size:14px; font-weight:600; color:#fff; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; width:fit-content; max-width:100%; }
    .fr-name span { font-weight:400; color:#b5bac1; font-size:12px; margin-left:6px; }
    .fr-av, .fr-name { cursor:pointer; } .fr-name:hover { text-decoration:underline; }
    .fr-sub { font-size:11px; color:#b5bac1; margin-top:2px; }
    .fr-badges { display:flex; gap:4px; flex-shrink:0; }
    .fr-badge { font-size:11px; padding:1px 5px; border-radius:4px; line-height:1.4; }
    .fr-actions { display:flex; gap:6px; flex-shrink:0; }
    .fr-dm { background:transparent; border:1px solid #4e5058; color:#b5bac1; font-size:13px; padding:4px 8px; border-radius:4px; cursor:pointer; font-weight:600; transition:all .12s; font-family:inherit; }
    .fr-dm:hover { border-color:#5865f2; color:#5865f2; } .fr-dm.loading { opacity:.6; cursor:wait; }
    .fr-row:hover .fr-dm { border-color:#5865f2; color:#5865f2; }
    .fr-rm { background:transparent; border:1px solid #4e5058; color:#b5bac1; font-size:12px; padding:4px 8px; border-radius:4px; cursor:pointer; font-weight:600; transition:all .12s; min-width:84px; font-family:inherit; }
    .fr-rm:hover { border-color:#da373c; color:#da373c; background:rgba(218,55,60,.08); }
    .fr-rm.armed { border-color:#da373c; color:#fff; background:#da373c; }
    .fr-rm.loading { opacity:.6; cursor:wait; } .fr-rm.err { border-color:#da373c; color:#da373c; background:rgba(218,55,60,.15); }
    .fr-row:hover .fr-rm:not(.armed):not(.loading):not(.err) { border-color:#da373c; color:#da373c; }
    .fr-foot { padding:10px 16px; border-top:1px solid #1e1f22; display:flex; align-items:center; gap:10px; flex-shrink:0; flex-wrap:wrap; }
    .fr-status { flex:1; font-size:12px; color:#b5bac1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; min-width:120px; }
    .fr-footbar { width:100%; height:4px; background:#1e1f22; border-radius:99px; overflow:hidden; margin-top:4px; display:none; }
    .fr-footbar.visible { display:block; }
    .fr-footbar > div { height:100%; width:0%; background:linear-gradient(90deg,#da373c,#ff6b6b); border-radius:99px; transition:width .4s ease; }
    .fr-empty { text-align:center; color:#b5bac1; padding:30px; font-size:13px; }

    /* History */
    .fr-hist-meta { display:flex; gap:6px; flex-wrap:wrap; margin-top:4px; }
    .fr-hist-tag { font-size:10px; padding:2px 6px; border-radius:4px; font-weight:600;
      background:rgba(88,101,242,.12); color:#8891ff; border:1px solid rgba(88,101,242,.3); }
    .fr-hist-tag.green { background:rgba(35,165,90,.12); color:#57f287; border-color:rgba(35,165,90,.3); }
    .fr-hist-tag.orange { background:rgba(250,166,26,.12); color:#faa61a; border-color:rgba(250,166,26,.3); }
    .fr-hist-tag.grey { background:rgba(181,186,193,.1); color:#b5bac1; border-color:rgba(181,186,193,.25); }
    .fr-hist-date { font-size:10px; color:#6d6f78; margin-top:3px; }
  `;
  document.head.append(style);

  // ── Build window ────────────────────────────────────────
  const box = document.createElement('div');
  box.id = '__fr_box';
  box.innerHTML = `
    <div class="fr-head">
      <button class="fr-min" title="Collapse"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 9l7 7 7-7"/></svg></button>
      <div class="fr-title">👥 Friends Manager</div>
      <div class="fr-tabs">
        <button class="fr-tab active" data-tab="friends">👥 Friends</button>
        <button class="fr-tab" data-tab="history">📜 History <span class="fr-tabcount" id="fr-hcount">${history.length}</span></button>
      </div>
      <button class="fr-x" title="Close">✕</button>
    </div>
    <div class="fr-body">

      <!-- ══════════ FRIENDS PANEL ══════════ -->
      <div class="fr-panel active" data-panel="friends">
        <div class="fr-bar">
          <input id="fr-q" placeholder="🔍 Search username / ID" style="flex:1;min-width:150px">
          <select id="fr-sort" title="Sort by">
            <option value="added">Date added</option>
            <option value="name">Name</option>
            <option value="created">Account created</option>
          </select>
          <button class="fr-btn" id="fr-dir" style="min-width:32px;font-size:14px;padding:4px 8px">↓</button>
          <label style="cursor:pointer;font-size:12px;color:#dbdee1;background:#1e1f22;border:1px solid #2b2d31;border-radius:4px;padding:5px 8px">
            <input type="checkbox" id="fr-selall" class="fr-cb" style="width:14px;height:14px"> Select all
          </label>
          <button class="fr-btn" id="fr-adv-toggle" style="font-size:14px;padding:4px 10px">⚙</button>
        </div>
        <div class="fr-chips" id="fr-chips">
          <button class="fr-chip active" data-chip="all">All</button>
          <button class="fr-chip" data-chip="newacct">🆕 New accounts</button>
          <button class="fr-chip" data-chip="noavatar">👻 No avatar</button>
          <button class="fr-chip" data-chip="fresh">🌱 Fresh friends</button>
          <button class="fr-chip" data-chip="long">⏳ Long-time</button>
        </div>
        <div class="fr-adv" id="fr-adv">
          <label>Added after <input type="date" id="fr-from"></label>
          <label>before <input type="date" id="fr-to"></label>
          <select id="fr-av">
            <option value="all">All avatars</option>
            <option value="def">Default avatar</option>
            <option value="custom">Custom avatar</option>
          </select>
        </div>
        <div class="fr-list" id="fr-list"></div>
      </div>

      <!-- ══════════ HISTORY PANEL ══════════ -->
      <div class="fr-panel" data-panel="history">
        <div class="fr-bar">
          <input id="fr-hq" placeholder="🔍 Search in history" style="flex:1;min-width:150px">
          <span id="fr-hstats" style="font-size:11px;color:#949ba4"></span>
          <button class="fr-btn red" id="fr-hclear" title="Clear all history">🗑 Clear</button>
        </div>
        <div class="fr-list" id="fr-hlist"></div>
      </div>

    </div>
    <div class="fr-foot">
      <div class="fr-status" id="fr-status"></div>
      <button class="fr-btn red" id="fr-del" disabled>🗑 Remove selected</button>
      <div class="fr-footbar" id="fr-footbar"><div></div></div>
    </div>`;
  document.body.append(box);

  const $ = id => box.querySelector('#' + id);
  const listEl = $('fr-list'), statusEl = $('fr-status'), delBtn = $('fr-del');
  const footbar = $('fr-footbar'), footbarFill = footbar.firstElementChild;
  const footEl = box.querySelector('.fr-foot');
  let busy = false, visibleList = [], sortDir = prefs.dir === 'asc' ? 'asc' : 'desc', activeChip = prefs.chip || 'all';
  let activeTab = prefs.activeTab === 'history' ? 'history' : 'friends';

  $('fr-sort').value = prefs.sort || 'added';
  $('fr-av').value   = prefs.av || 'all';
  if (prefs.from) $('fr-from').value = prefs.from;
  if (prefs.to)   $('fr-to').value   = prefs.to;
  $('fr-dir').textContent = sortDir === 'desc' ? '↓' : '↑';
  $('fr-dir').title       = sortDir === 'desc' ? 'Descending' : 'Ascending';
  [...document.querySelectorAll('#fr-chips .fr-chip')].forEach(c => c.classList.toggle('active', c.dataset.chip === activeChip));

  const saveCurrentPrefs = () => savePrefs({
    sort: $('fr-sort').value, dir: sortDir,
    av: $('fr-av').value, from: $('fr-from').value, to: $('fr-to').value, chip: activeChip,
    activeTab,
  });

  // ── Drag / collapse / close ─────────────────────────────
  const head = box.querySelector('.fr-head');
  let drag = null;
  head.addEventListener('mousedown', e => {
    if (e.target.closest('.fr-x, .fr-min, .fr-tab')) return;
    const r = box.getBoundingClientRect();
    drag = { dx: e.clientX - r.left, dy: e.clientY - r.top };
    head.style.cursor = 'grabbing';
    e.preventDefault();
  });
  const onMove = e => {
    if (!drag) return;
    box.style.left = Math.min(Math.max(0, e.clientX - drag.dx), innerWidth - 60) + 'px';
    box.style.top  = Math.min(Math.max(0, e.clientY - drag.dy), innerHeight - 40) + 'px';
  };
  const onUp = () => { drag = null; head.style.cursor = 'grab'; };
  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onUp);

  const minBtn = box.querySelector('.fr-min');
  const toggleMin = () => { const m = box.classList.toggle('min'); minBtn.title = m ? 'Expand' : 'Collapse'; };
  minBtn.onclick = toggleMin;
  head.addEventListener('dblclick', e => { if (!e.target.closest('.fr-x, .fr-min, .fr-tab')) toggleMin(); });
  box.querySelector('.fr-x').onclick = () => {
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
    box.remove(); style.remove();
    document.getElementById('__fr_progress')?.remove();
    document.getElementById('__fr_confirm')?.remove();
  };
  $('fr-adv-toggle').onclick = () => $('fr-adv').classList.toggle('open');

  // ── Tabs ────────────────────────────────────────────────
  [...document.querySelectorAll('.fr-tab')].forEach(t => {
    t.onclick = () => {
      activeTab = t.dataset.tab;
      [...document.querySelectorAll('.fr-tab')].forEach(x => x.classList.toggle('active', x === t));
      [...document.querySelectorAll('.fr-panel')].forEach(p => p.classList.toggle('active', p.dataset.panel === activeTab));
      // Footer adapts
      if (activeTab === 'history') {
        footEl.style.display = 'none';
        renderHistory();
      } else {
        footEl.style.display = '';
        render();
      }
      saveCurrentPrefs();
    };
  });

  // Apply saved tab on start
  if (activeTab === 'history') {
    [...document.querySelectorAll('.fr-tab')].forEach(x => x.classList.toggle('active', x.dataset.tab === 'history'));
    [...document.querySelectorAll('.fr-panel')].forEach(p => p.classList.toggle('active', p.dataset.panel === 'history'));
    footEl.style.display = 'none';
  }

  // ── Filter / sort / render (friends) ────────────────────
  const getVisible = () => {
    const q = $('fr-q').value.trim().toLowerCase();
    const av = $('fr-av').value;
    const from = $('fr-from').value ? new Date($('fr-from').value + 'T00:00:00') : null;
    const to   = $('fr-to').value   ? new Date($('fr-to').value + 'T23:59:59') : null;
    let l = friends.filter(f => {
      const u = f.user;
      if (q && !(`${u.username} ${u.global_name ?? ''} ${f.id}`.toLowerCase().includes(q))) return false;
      if (from && (!f.since || f.since < from)) return false;
      if (to && (!f.since || f.since > to)) return false;
      if (av === 'def' && u.avatar) return false;
      if (av === 'custom' && !u.avatar) return false;
      if (activeChip === 'newacct'  && !isNewAccount(f))     return false;
      if (activeChip === 'noavatar' && !isNoAvatar(f))       return false;
      if (activeChip === 'fresh'    && !isFreshFriend(f))    return false;
      if (activeChip === 'long'     && !isLongTimeFriend(f)) return false;
      return true;
    });
    const key = $('fr-sort').value;
    const m = sortDir === 'asc' ? 1 : -1;
    const val = {
      added: f => f.since?.getTime() ?? (m === 1 ? Infinity : -Infinity),
      created: f => f.created.getTime(),
    };
    l.sort((a, b) => key === 'name'
      ? m * displayName(a.user).localeCompare(displayName(b.user), undefined, { sensitivity: 'base' })
      : m * (val[key](a) - val[key](b)));
    return l;
  };

  const rowHtml = f => {
    const u = f.user;
    const badges = badgesFor(f).map(b =>
      `<span class="fr-badge" title="${esc(b.label)}" style="color:${b.color};background:${b.color}20;border:1px solid ${b.color}55">${b.icon}</span>`
    ).join('');
    return `<div class="fr-row ${selected.has(f.id) ? 'sel' : ''}" data-id="${f.id}">
      <input type="checkbox" class="fr-cb" ${selected.has(f.id) ? 'checked' : ''}>
      <img class="fr-av" loading="lazy" src="${avatarUrl(u)}" title="View profile">
      <div class="fr-info">
        <div class="fr-name" title="View profile">${esc(displayName(u))}<span>@${esc(u.username)}</span></div>
        <div class="fr-sub">Friends since ${fmtDate(f.since)} (${fmtRelative(f.since)}) · Account created ${fmtDate(f.created)}</div>
      </div>
      <div class="fr-badges">${badges}</div>
      <div class="fr-actions">
        <button class="fr-dm" title="Send a DM">💬</button>
        <button class="fr-rm" title="Remove this friend (click twice)">🗑 Remove</button>
      </div>
    </div>`;
  };

  const updateFooter = (msg) => {
    const sa = $('fr-selall');
    if (sa) {
      const n = visibleList.filter(f => selected.has(f.id)).length;
      sa.checked = visibleList.length > 0 && n === visibleList.length;
      sa.indeterminate = n > 0 && n < visibleList.length;
    }
    delBtn.disabled = busy || selected.size === 0;
    delBtn.textContent = `🗑 Remove selected (${selected.size})`;
    statusEl.textContent = msg ?? `${visibleList.length} shown / ${friends.length} friend(s) · ${selected.size} selected`;
  };

  const render = () => {
    visibleList = getVisible();
    listEl.innerHTML = visibleList.length ? visibleList.map(rowHtml).join('')
      : `<div class="fr-empty">No friends match the filters.</div>`;
    updateFooter();
  };

  // ── History render ──────────────────────────────────────
  const historyRowHtml = h => {
    const name = h.global_name || h.username;
    const tags = [];
    if (h.dmDeleted > 0) tags.push(`<span class="fr-hist-tag green">🧹 ${h.dmDeleted} msg deleted</span>`);
    else if (h.cleaned) tags.push(`<span class="fr-hist-tag green">🧹 DM cleaned</span>`);
    else tags.push(`<span class="fr-hist-tag grey">DMs kept</span>`);
    if (h.dmClosed) tags.push(`<span class="fr-hist-tag">👋 DM closed</span>`);
    if (h.friendSince) tags.push(`<span class="fr-hist-tag orange" title="Was friends since ${fmtDateTime(h.friendSince)}">📅 ${fmtTsRelative(h.friendSince)}</span>`);
    return `<div class="fr-row" data-id="${h.id}">
      <img class="fr-av" loading="lazy" src="${h.avatarUrl}" onerror="this.style.opacity=.4" title="View profile">
      <div class="fr-info">
        <div class="fr-name" title="View profile">${esc(name)}<span>@${esc(h.username)}</span></div>
        <div class="fr-hist-meta">${tags.join('')}</div>
        <div class="fr-hist-date">Removed ${fmtTsRelative(h.removedAt)} · ${fmtDateTime(h.removedAt)}</div>
      </div>
      <div class="fr-actions">
        <button class="fr-dm fr-h-view" title="Open profile">👤</button>
      </div>
    </div>`;
  };

  function renderHistory() {
    const hq = $('fr-hq').value.trim().toLowerCase();
    const list = history.filter(h => {
      if (!hq) return true;
      return `${h.username} ${h.global_name || ''} ${h.id}`.toLowerCase().includes(hq);
    });
    const listEl = $('fr-hlist');
    listEl.innerHTML = list.length
      ? list.map(historyRowHtml).join('')
      : `<div class="fr-empty">${history.length === 0 ? 'No history yet — removed friends will appear here.' : 'No entries match your search.'}</div>`;
    $('fr-hcount').textContent = history.length;
    const totalMsg = history.reduce((sum, h) => sum + (h.dmDeleted || 0), 0);
    $('fr-hstats').textContent = history.length > 0
      ? `${history.length} entr${history.length > 1 ? 'ies' : 'y'} · 🧹 ${totalMsg} msg total`
      : '';
  }

  // History list click handlers
  $('fr-hlist').addEventListener('click', e => {
    const row = e.target.closest('.fr-row');
    if (!row) return;
    const id = row.dataset.id;
    if (e.target.closest('.fr-h-view, .fr-av, .fr-name')) { openProfile(id); return; }
  });

  $('fr-hq').addEventListener('input', () => renderHistory());
  $('fr-hclear').onclick = async () => {
    if (history.length === 0) return;
    const v = await choiceDialog({
      title: 'Clear history?',
      message: `This will clear <b style="color:#fff">${history.length}</b> entr${history.length > 1 ? 'ies' : 'y'} from your history.<br><br>
                <span style="color:#949ba4;font-size:12px">The friends stay removed — only the local log is erased.</span><br><br>
                <span style="color:#faa61a">⚠️ This cannot be undone.</span>`,
      choices: [
        { label: 'Cancel',        value: 'cancel' },
        { label: '🗑 Clear',      value: 'clear', danger: true },
      ],
    });
    if (v === 'clear') { clearHistory(); renderHistory(); }
  };

  // ── Footer bar helpers ──────────────────────────────────
  const showFootbar = () => footbar.classList.add('visible');
  const hideFootbar = () => { footbar.classList.remove('visible'); setTimeout(() => { footbarFill.style.width = '0%'; }, 400); };
  const setFootbar  = (pct) => { footbarFill.style.width = Math.max(0, Math.min(100, pct)) + '%'; };

  // ── Remove friend (API) ─────────────────────────────────
  async function removeFriendAPI(id, onWait) {
    const r = await apiFetch(`${BASE}/users/@me/relationships/${id}`, { method: 'DELETE' }, onWait);
    return r.status === 204 || r.status === 200;
  }

  // ── Clean DM with one friend ────────────────────────────
  async function cleanDMWithFriend(friend, progress) {
    const channelId = await resolveDMChannel(friend.id);
    if (!channelId) {
      console.log(`ℹ️ No DM channel for ${displayName(friend.user)} — skipping clean.`);
      return { deleted: 0, total: 0, errors: 0, skipped: true, cancelled: false };
    }
    const label = displayName(friend.user);

    const msgs = await fetchAllMyMessages(channelId);
    if (!msgs.length) {
      console.log(`ℹ️ No messages from you in DM with ${label}.`);
      return { deleted: 0, total: 0, errors: 0, skipped: true, cancelled: false };
    }

    progress?.setMode('dm');
    const res = await deleteAllDMMessages(channelId, msgs, label, {
      isCancelled: () => progress?.isCancelled() ?? false,
      onProgress: (done, total, errors, rateLimits, rateWait) => {
        if (!progress) return;
        progress.update(done, total, `🧹 ${label}`, errors);
        if (rateLimits > 0 && rateWait) progress.setRateLimit(rateWait, 0, 0);
        else progress.clearRateLimit();
      },
    });
    console.log(`🧹 cleanDM result for ${label}:`, res);
    return { ...res, total: msgs.length };
  }

  // ── Ask the user ────────────────────────────────────────
  async function askCleanChoice({ count, totalMsgCount, individualName }) {
    const hasMessages = totalMsgCount === undefined ? count > 0 : totalMsgCount > 0;

    const title = individualName
      ? `Remove ${esc(individualName)}?`
      : `Remove ${count} friend${count > 1 ? 's' : ''}?`;

    const baseMsg = individualName
      ? `You're about to permanently remove <b style="color:#fff">${esc(individualName)}</b> from your friends list.`
      : `You're about to permanently remove <b style="color:#fff">${count}</b> friends from your list.`;

    if (!hasMessages) {
      return await choiceDialog({
        title,
        message: `${baseMsg}<br><br>
                  <span style="color:#949ba4;font-size:12px">💡 No messages from you in ${individualName ? 'this DM' : 'these DMs'} — nothing to clean.</span><br><br>
                  <span style="color:#faa61a">⚠️ This cannot be undone.</span>`,
        choices: [
          { label: 'Cancel',     value: 'cancel' },
          { label: '🗑 Remove',  value: 'plain', danger: true },
        ],
      });
    }

    const msgLine = individualName
      ? `Do you also want to <b style="color:#fff">delete all your DM messages</b> with them (<b style="color:#fff">${totalMsgCount ?? count}+</b>)?`
      : `Do you also want to <b style="color:#fff">delete all your DM messages</b> with them?<br>
         <span style="color:#949ba4;font-size:12px">${totalMsgCount} message(s) found across the selection.</span>`;

    return await choiceDialog({
      title,
      message: `${baseMsg}<br><br>${msgLine}<br><br>
                <span style="color:#faa61a">⚠️ This cannot be undone.</span>`,
      choices: [
        { label: 'Cancel',                value: 'cancel' },
        { label: '🗑 Remove only',        value: 'plain'  },
        { label: '🧹 Clean DMs + remove', value: 'clean', danger: true },
      ],
    });
  }

  // ── Remove ONE friend ───────────────────────────────────
  async function removeOneWithModal(id, btn, row) {
    if (busy) return;
    const f = friends.find(x => x.id === id);
    if (!f) return;
    const name = displayName(f.user);

    busy = true;
    if (btn) { btn.classList.add('loading'); btn.textContent = '…'; }

    updateFooter(`🔍 Checking your messages with ${name}…`);
    let channelId = null;
    try { channelId = await resolveDMChannel(id); }
    catch (e) { console.warn('⚠️ resolveDMChannel:', e); }

    let msgCount = 0;
    if (channelId) {
      msgCount = await quickCountMyMessages(channelId);
      console.log(`🔍 ${name}: channel=${channelId} · ${msgCount} message(s) from you`);
    }

    if (!box.isConnected) return;

    const action = await askCleanChoice({ count: msgCount, individualName: name });

    if (btn) { btn.classList.remove('loading'); btn.textContent = '🗑 Remove'; }
    busy = false;
    if (!box.isConnected || action === 'cancel') { updateFooter(); return; }

    busy = true;
    if (btn) { btn.classList.add('loading'); btn.textContent = '…'; }

    let dmResult = null;
    if (action === 'clean') {
      updateFooter(`🧹 Cleaning DM with ${name}…`);
      const progress = createProgressOverlay('dm');
      try { dmResult = await cleanDMWithFriend(f, progress); }
      catch (e) { console.warn('⚠️ cleanDM error:', e); }
      progress.finish(dmResult?.deleted ?? 0, dmResult?.total ?? 0, dmResult?.errors ?? 0, dmResult?.cancelled ?? false);
    }

    let abortRemove = false;

    if (dmResult?.cancelled) {
      abortRemove = true;
      updateFooter(`⛔ Clean cancelled — ${name} NOT removed.`);
    } else if (dmResult && dmResult.errors > 0) {
      const errs = dmResult.errors;
      const total = dmResult.total;
      const deleted = dmResult.deleted;
      const choice = await choiceDialog({
        title: `Some messages couldn't be deleted`,
        message: `<b style="color:#fff">${deleted}/${total}</b> messages deleted — <b style="color:#faa61a">${errs} error${errs > 1 ? 's' : ''}</b> (status ${dmResult.lastErrorStatus}).<br><br>
                  Do you still want to remove <b style="color:#fff">${esc(name)}</b> from your friends list?`,
        choices: [
          { label: '❌ Keep friend',   value: 'keep'   },
          { label: '🗑 Remove anyway', value: 'remove', danger: true },
        ],
      });
      if (choice !== 'remove') abortRemove = true;
    }

    if (abortRemove) {
      busy = false;
      if (btn) { btn.classList.remove('loading'); btn.textContent = '🗑 Remove'; }
      if (box.isConnected) updateFooter();
      return;
    }

    updateFooter(`🗑 Removing ${name}…`);
    let removed = false;
    try {
      removed = await removeFriendAPI(id, ({ waitMs, attempt, max }) =>
        updateFooter(`🐢 Rate limited — retry ${attempt}/${max} in ${(waitMs/1000).toFixed(1)}s`));
    } catch (e) { console.warn('⚠️', e.message); }

    if (!box.isConnected) return;

    if (removed) {
      // Close DM in sidebar
      let dmClosed = false;
      if (channelId) {
        updateFooter(`👋 Closing DM with ${name}…`);
        dmClosed = await closeDMChannel(channelId);
      }
      // ✅ Log to history
      pushHistory({
        id: f.id,
        username: f.user.username,
        global_name: f.user.global_name || null,
        avatarUrl: avatarUrl(f.user),
        removedAt: Date.now(),
        cleaned: !!(dmResult?.deleted || dmResult?.total),
        dmDeleted: dmResult?.deleted || 0,
        dmClosed,
        friendSince: f.since ? f.since.getTime() : null,
      });
      friends = friends.filter(x => x.id !== id);
      selected.delete(id);
      dmChannelByUserId.delete(id);
      busy = false;
      const dmInfo = dmResult?.deleted ? ` · 🧹 ${dmResult.deleted} msg deleted` : '';
      console.log(`✅ Removed: ${name} (${id})${dmInfo}${dmClosed ? ' · 👋 DM closed' : ''}`);
      if (row) {
        row.style.transition = 'opacity .25s, transform .25s, max-height .25s, padding .25s';
        row.style.opacity = '0'; row.style.transform = 'translateX(24px)';
        row.style.maxHeight = row.offsetHeight + 'px';
        requestAnimationFrame(() => {
          row.style.maxHeight = '0'; row.style.paddingTop = '0';
          row.style.paddingBottom = '0'; row.style.borderBottom = 'none';
        });
        setTimeout(() => { const top = listEl.scrollTop; render(); listEl.scrollTop = top; }, 260);
      } else {
        updateFooter(`✅ ${name} removed${dmInfo}.`);
      }
    } else {
      busy = false;
      if (btn) { btn.classList.add('err'); btn.textContent = '✕ Failed'; }
      updateFooter(`⚠️ Failed to remove ${name}`);
    }
  }

  // ── List clicks (friends) ───────────────────────────────
  listEl.addEventListener('click', async e => {
    const row = e.target.closest('.fr-row');
    if (!row) return;
    const id = row.dataset.id;

    if (e.target.closest('.fr-av, .fr-name')) { openProfile(id); return; }

    const dmBtn = e.target.closest('.fr-dm');
    if (dmBtn) {
      e.stopPropagation();
      if (dmBtn.classList.contains('loading')) return;
      dmBtn.classList.add('loading');
      const prev = dmBtn.textContent;
      dmBtn.textContent = '…';
      try { await openDM(id); } catch (err) { console.warn('⚠️ openDM error:', err); }
      setTimeout(() => { if (dmBtn.isConnected) { dmBtn.classList.remove('loading'); dmBtn.textContent = prev; } }, 400);
      return;
    }

    const rmBtn = e.target.closest('.fr-rm');
    if (rmBtn) {
      e.stopPropagation();
      if (rmBtn.classList.contains('loading') || rmBtn.classList.contains('err')) return;
      if (!rmBtn.dataset.armed) {
        rmBtn.dataset.armed = '1';
        rmBtn.classList.add('armed');
        rmBtn.textContent = '⚠ sure?';
        rmBtn._timer = setTimeout(() => {
          if (!rmBtn.isConnected) return;
          delete rmBtn.dataset.armed;
          rmBtn.classList.remove('armed');
          rmBtn.textContent = '🗑 Remove';
        }, 3000);
        return;
      }
      clearTimeout(rmBtn._timer);
      delete rmBtn.dataset.armed;
      rmBtn.classList.remove('armed');
      rmBtn.textContent = '🗑 Remove';
      await removeOneWithModal(id, rmBtn, row);
      return;
    }

    const cb = row.querySelector('.fr-cb');
    if (e.target !== cb) cb.checked = !cb.checked;
    cb.checked ? selected.add(id) : selected.delete(id);
    row.classList.toggle('sel', cb.checked);
    updateFooter();
  });

  // ── Filter handlers ─────────────────────────────────────
  ['fr-q', 'fr-sort', 'fr-from', 'fr-to', 'fr-av'].forEach(id => {
    $(id).addEventListener(id === 'fr-q' ? 'input' : 'change', () => { saveCurrentPrefs(); render(); });
  });
  $('fr-dir').onclick = e => {
    sortDir = sortDir === 'desc' ? 'asc' : 'desc';
    e.currentTarget.textContent = sortDir === 'desc' ? '↓' : '↑';
    e.currentTarget.title       = sortDir === 'desc' ? 'Descending' : 'Ascending';
    saveCurrentPrefs(); render();
  };
  $('fr-selall').onchange = e => {
    if (e.target.checked) visibleList.forEach(f => selected.add(f.id));
    else visibleList.forEach(f => selected.delete(f.id));
    render();
  };
  [...document.querySelectorAll('#fr-chips .fr-chip')].forEach(chip => {
    chip.onclick = () => {
      [...document.querySelectorAll('#fr-chips .fr-chip')].forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      activeChip = chip.dataset.chip;
      saveCurrentPrefs(); render();
    };
  });

  // ── Bulk delete ─────────────────────────────────────────
  delBtn.onclick = async () => {
    if (busy || !selected.size) return;
    const targets = friends.filter(f => selected.has(f.id));
    const n = targets.length;

    busy = true;
    delBtn.disabled = true;

    updateFooter(`🔍 Checking your messages in ${n} DM(s)…`);
    const checkedTargets = [];
    let totalMsgCount = 0;
    for (const f of targets) {
      let channelId = null;
      try { channelId = await resolveDMChannel(f.id); }
      catch (e) { console.warn('⚠️ resolveDMChannel:', e); }

      let count = 0;
      if (channelId) count = await quickCountMyMessages(channelId);
      totalMsgCount += count;
      checkedTargets.push({ friend: f, msgCount: count, channelId });
      console.log(`🔍 ${displayName(f.user)}: ${count} message(s) from you`);
    }
    console.log(`🔍 Total: ${totalMsgCount} message(s) across ${n} DM(s)`);

    busy = false;
    if (!box.isConnected) return;

    const action = await askCleanChoice({ count: n, totalMsgCount });
    if (action === 'cancel') { updateFooter(); return; }

    const doClean = action === 'clean';

    busy = true;
    delBtn.disabled = true;
    showFootbar(); setFootbar(0);

    const progress = createProgressOverlay('remove');
    progress.update(0, n, '', 0);

    let okCount = 0, errCount = 0, dmCleanedCount = 0, dmDeletedTotal = 0;
    let closedCount = 0;
    let skippedDueToCleanErrors = 0, cancelledMidway = false;
    const startTime = Date.now();

    for (const { friend: f, channelId } of checkedTargets) {
      if (progress.isCancelled() || !box.isConnected) { cancelledMidway = true; break; }

      const fname = displayName(f.user);
      let dmResult = null;

      if (doClean) {
        setFootbar((okCount / n) * 100);
        try { dmResult = await cleanDMWithFriend(f, progress); }
        catch (e) { console.warn('⚠️ cleanDM error:', e); }
      }

      const cleanFailed    = dmResult && dmResult.errors > 0;
      const cleanCancelled = dmResult && dmResult.cancelled;

      if (cleanCancelled) {
        console.warn(`⛔ Clean cancelled — skipping removal of ${fname}`);
        skippedDueToCleanErrors++;
        cancelledMidway = true;
        break;
      }

      if (cleanFailed) {
        const errs = dmResult.errors;
        const deleted = dmResult.deleted;
        const total = dmResult.total;
        const choice = await choiceDialog({
          title: `Clean failed for ${esc(fname)}`,
          message: `<b style="color:#fff">${deleted}/${total}</b> deleted — <b style="color:#faa61a">${errs} error${errs > 1 ? 's' : ''}</b> (status ${dmResult.lastErrorStatus}).<br><br>
                    Still remove <b style="color:#fff">${esc(fname)}</b> from your list?<br>
                    <span style="color:#949ba4;font-size:12px">Or choose "Skip" to leave them untouched and continue with the rest.</span>`,
          choices: [
            { label: '⏭ Skip this one',  value: 'skip'   },
            { label: '🗑 Remove anyway', value: 'remove', danger: true },
          ],
        });
        if (choice !== 'remove') {
          skippedDueToCleanErrors++;
          continue;
        }
      }

      if (dmResult?.deleted) { dmCleanedCount++; dmDeletedTotal += dmResult.deleted; }

      progress.setMode('remove');
      progress.update(okCount, n, fname, errCount);
      setFootbar((okCount / n) * 100);

      try {
        const ok = await removeFriendAPI(f.id, ({ waitMs, attempt, max }) => {
          progress.setRateLimit(waitMs, attempt, max);
          statusEl.textContent = `🐢 Rate limited — retry ${attempt}/${max} in ${(waitMs/1000).toFixed(1)}s`;
        });
        progress.clearRateLimit();
        if (ok) {
          okCount++;
          let dmClosed = false;
          if (channelId) {
            dmClosed = await closeDMChannel(channelId);
            if (dmClosed) closedCount++;
          }
          // ✅ Log to history
          pushHistory({
            id: f.id,
            username: f.user.username,
            global_name: f.user.global_name || null,
            avatarUrl: avatarUrl(f.user),
            removedAt: Date.now(),
            cleaned: !!(dmResult?.deleted || dmResult?.total),
            dmDeleted: dmResult?.deleted || 0,
            dmClosed,
            friendSince: f.since ? f.since.getTime() : null,
          });
          friends = friends.filter(x => x.id !== f.id);
          selected.delete(f.id);
          dmChannelByUserId.delete(f.id);
          console.log(`✅ Removed: ${fname} (${f.id})`);
        } else { errCount++; }
      } catch (e) { errCount++; console.warn('⚠️', e.message); }

      await sleep((errCount > 0 ? 1400 : 900) + Math.random() * 400);
    }

    setFootbar(100);
    progress.finish(okCount, n, errCount, progress.isCancelled() || cancelledMidway);
    busy = false;
    if (!box.isConnected) return;
    const top = listEl.scrollTop;
    render();
    listEl.scrollTop = top;
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

    const bits = [];
    bits.push(`${okCount} removed`);
    if (errCount) bits.push(`${errCount} error(s)`);
    if (skippedDueToCleanErrors) bits.push(`${skippedDueToCleanErrors} skipped (clean failed)`);
    if (doClean && dmDeletedTotal > 0) bits.push(`🧹 ${dmDeletedTotal} DM msg deleted`);
    if (closedCount > 0) bits.push(`👋 ${closedCount} DM closed`);
    const summary = `${progress.isCancelled() || cancelledMidway ? '⛔ Cancelled' : '✅ Done'} — ${bits.join(', ')} in ${elapsed}s.`;
    updateFooter(summary);
    hideFootbar();
  };

  // ── Initial render ──────────────────────────────────────
  render();
  renderHistory();
  $('fr-hcount').textContent = history.length;

  console.log('%c✅ Friend Remover v4.7 ready', 'color:green;font-weight:bold;font-size:16px');
  if (history.length > 0) console.log(`📜 ${history.length} entr${history.length > 1 ? 'ies' : 'y'} in history`);
})().catch(e => console.error('❌', e.message));