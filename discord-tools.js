// ============================================================
//  Discord Tools — Friends + Groups + Not Friends Manager (v1.3)
//  ✨ 4 tabs: Friends · Groups · Not Friends · Universal History
//  ✨ Not Friends: shows ALL non-friend DMs from your sidebar
//  ✨ Single token, single window, shared utilities
//  ✨ Progress bar integrated in the footer (no popup)
// ============================================================
window.__dt_run = async () => {
  document.getElementById('__dt_box')?.remove();
  document.getElementById('__dt_style')?.remove();
  document.getElementById('__dt_progress')?.remove();
  document.getElementById('__dt_confirm')?.remove();

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

  const BASE  = "https://discord.com/api/v10";
  const HEADS = { Authorization: TOKEN, "Content-Type": "application/json" };
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  // ── Loading modal state (declared early to avoid TDZ errors) ──
  let _loadTarget = 0;
  let _loadCurrent = 0;
  let _loadTicker = null;
  let _loadDotsTimer = null;
  let _loadBaseText = '';

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
  const iconUrl = g => g.icon ? `https://cdn.discordapp.com/channel-icons/${g.id}/${g.icon}.webp?size=64` : null;
  const fmtRelative = d => {
    if (!d) return 'never';
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
  const PREF_KEY = '__dt_prefs_v1';
  const loadPrefs = () => { try { return JSON.parse(localStorage.getItem(PREF_KEY)) || {}; } catch { return {}; } };
  const savePrefs = (p) => { try { localStorage.setItem(PREF_KEY, JSON.stringify(p)); } catch {} };
  const prefs = loadPrefs();

  const SILENT_KEY = '__dt_silent';
  const loadSilentPref = () => { try { const v = localStorage.getItem(SILENT_KEY); return v === null ? true : v === '1'; } catch { return true; } };
  const saveSilentPref = v => { try { localStorage.setItem(SILENT_KEY, v ? '1' : '0'); } catch {} };

  // ── Universal history (in-memory via window.name) ───────
  const HISTORY_MAX = 500;
  const WN_KEY = '__dt_history_v1__';
  let history = [];
  try {
    if (typeof window.name === 'string' && window.name.startsWith(WN_KEY)) {
      history = JSON.parse(window.name.slice(WN_KEY.length)) || [];
    }
  } catch {}
  try {
    localStorage.removeItem('__dt_history_v1');
    localStorage.removeItem('__fr_history_v1');
    localStorage.removeItem('__gl_history_v1');
    sessionStorage.removeItem('__dt_history_v1');
  } catch {}

  const saveHistory = () => {
    try {
      if (history.length > HISTORY_MAX) history = history.slice(0, HISTORY_MAX);
      window.name = WN_KEY + JSON.stringify(history);
    } catch {}
  };
  const pushHistory = (entry) => {
    history = history.filter(h => !(h.id === entry.id && h.kind === entry.kind));
    history.unshift(entry);
    saveHistory();
    const hc = document.getElementById('dt-hcount');
    if (hc) hc.textContent = history.length;
    if (activeTab === 'history') renderHistory();
  };
  const clearHistory = () => {
    history = [];
    saveHistory();
    const hc = document.getElementById('dt-hcount');
    if (hc) hc.textContent = '0';
    if (activeTab === 'history') renderHistory();
  };

  // ── Show loading modal ──────────────────────────────────
  showLoadingModal('Connecting to Discord');
  setLoadingStep('Connecting to Discord', 5);

  await sleep(120);
  setLoadingStep('Fetching your profile', 15);
  await sleep(100);

  // ── Fetch ME + relationships + channels ─────────────────
  console.log("📥 Fetching profile, friends & channels...");
  const [rMe, rRel, rCh] = await Promise.all([
    apiFetch(`${BASE}/users/@me`),
    apiFetch(`${BASE}/users/@me/relationships`),
    apiFetch(`${BASE}/users/@me/channels`),
  ]);

  setLoadingStep('Verifying session', 35);
  await sleep(80);
  if (!rMe.ok)  throw new Error(`Could not fetch profile (${rMe.status}) — invalid token?`);
  if (!rRel.ok) throw new Error(`Could not fetch friends (${rRel.status})`);
  if (!rCh.ok)  throw new Error(`Could not fetch channels (${rCh.status})`);

  setLoadingStep('Reading your profile', 45);
  await sleep(100);

  const ME = await rMe.json();
  console.log(`👤 Logged in as ${ME.username} (${ME.id})`);
  setLoadingStep('Loading your friends list', 55);
  await sleep(80);

  let friends = (await rRel.json())
    .filter(r => r.type === 1)
    .map(r => ({ id: r.id, user: r.user, since: r.since ? new Date(r.since) : null, created: createdAt(r.id) }));

  const friendIds = new Set(friends.map(f => f.id));

  setLoadingStep('Reading your conversations', 65);
  await sleep(80);

  const channels = await rCh.json();
  const dmChannelByUserId = new Map();
  const dmLastByUserId = new Map();
  for (const ch of channels) {
    if (ch.type === 1 && ch.recipients?.[0]) {
      dmChannelByUserId.set(ch.recipients[0].id, ch.id);
      if (ch.last_message_id) dmLastByUserId.set(ch.recipients[0].id, createdAt(ch.last_message_id));
    }
  }

  const toGroup = ch => {
    const rec = ch.recipients ?? [];
    return {
      id: ch.id,
      name: ch.name || (rec.length ? rec.map(u => u.global_name || u.username).join(', ') : `Unnamed group (${ch.id})`),
      named: !!ch.name,
      size: rec.length + 1,
      solo: rec.length === 0,
      icon: ch.icon || null,
      created: createdAt(ch.id),
      last: ch.last_message_id ? createdAt(ch.last_message_id) : null,
      members: rec.map(u => `${u.username} ${u.global_name ?? ''}`).join(' '),
    };
  };
  let groups = channels.filter(ch => ch.type === 3).map(toGroup);

  setLoadingStep('Scanning your DMs', 75);
  await sleep(80);

  const notFriendChannels = channels
    .filter(ch => ch.type === 1 && ch.recipients?.[0] && !friendIds.has(ch.recipients[0].id))
    .map(ch => ({
      id: ch.id,
      user: ch.recipients[0],
      lastMessageId: ch.last_message_id || null,
      lastMessage: ch.last_message_id ? createdAt(ch.last_message_id) : null,
    }));

  let notFriends = notFriendChannels.map(c => {
    const u = c.user;
    return {
      id: u.id,
      user: u,
      channelId: c.id,
      created: createdAt(u.id),
      last: c.lastMessage,
      count: -1,
    };
  });

  console.log(`  → ${friends.length} friend(s) · ${groups.length} group(s) · ${notFriends.length} non-friend DM(s) · ${history.length} in history`);

  setLoadingStep('Preparing the interface', 88);
  await sleep(100);

  const DAY = 86400000;
  const isNewAccount     = f => (Date.now() - f.created.getTime()) < 30 * DAY;
  const isNoAvatar       = f => !f.user.avatar;
  const isFreshFriend    = f => f.since && (Date.now() - f.since.getTime()) < 7 * DAY;
  const isLongTimeFriend = f => f.since && (Date.now() - f.since.getTime()) > 365 * DAY;
  const isNewGroup  = g => (Date.now() - g.created.getTime()) < 30 * DAY;
  const isOldGroup  = g => (Date.now() - g.created.getTime()) > 365 * DAY;
  const isInactive  = g => !g.last || (Date.now() - g.last.getTime()) > 90 * DAY;

  function badgesForFriend(f) {
    const out = [];
    if (isNewAccount(f))     out.push({ icon: '🆕', label: 'New account (< 30 days)',     color: '#5865f2' });
    if (isNoAvatar(f))       out.push({ icon: '👻', label: 'No custom avatar',            color: '#b5bac1' });
    if (isFreshFriend(f))    out.push({ icon: '🌱', label: 'Friend for less than 7 days', color: '#23a55a' });
    if (isLongTimeFriend(f)) out.push({ icon: '⏳', label: 'Friend for over a year',      color: '#faa61a' });
    return out;
  }
  function badgesForGroup(g) {
    const out = [];
    if (g.solo)         out.push({ icon: '👤', label: "You're the only member",   color: '#faa61a' });
    if (isNewGroup(g))  out.push({ icon: '🆕', label: 'New group (< 30 days)',    color: '#5865f2' });
    if (isOldGroup(g))  out.push({ icon: '⏳', label: 'Group older than a year',  color: '#b5bac1' });
    if (isInactive(g))  out.push({ icon: '💤', label: 'No activity for 90+ days', color: '#949ba4' });
    return out;
  }
  function badgesForNotFriend(nf) {
    const out = [];
    const u = nf.user;
    const created = createdAt(u.id);
    if ((Date.now() - created.getTime()) < 30 * DAY) out.push({ icon: '🆕', label: 'New account (< 30 days)', color: '#5865f2' });
    if (!u.avatar) out.push({ icon: '👻', label: 'No custom avatar', color: '#b5bac1' });
    if (nf.count > 0)      out.push({ icon: '💬', label: `${nf.count} message(s) from you`, color: '#5865f2' });
    else if (nf.count === 0 && !nf.anyMessage) out.push({ icon: '📭', label: 'Truly empty conversation', color: '#949ba4' });
    else if (nf.count === 0) out.push({ icon: '💤', label: 'You never replied', color: '#949ba4' });
    return out;
  }

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
  function navigateToChannel(channelId) {
    const path = `/channels/@me/${channelId}`;
    if (location.pathname === path) return;
    window.history.pushState({}, '', path);
    window.dispatchEvent(new PopStateEvent('popstate', { state: {} }));
  }

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
        return ch.id;
      }
    } catch (e) { console.warn('⚠️ resolveDMChannel:', e); }
    return null;
  }
  async function closeDMChannel(channelId) {
    if (!channelId) return false;
    try {
      const r = await apiFetch(`${BASE}/channels/${channelId}`, { method: 'DELETE' });
      if (r.ok || r.status === 404) {
        if (location.pathname.includes(channelId)) {
          window.history.pushState({}, '', '/channels/@me');
          window.dispatchEvent(new PopStateEvent('popstate', { state: {} }));
        }
        return true;
      }
    } catch (e) { console.warn('⚠️ closeDMChannel:', e); }
    return false;
  }
  async function openDM(userId) {
    let channelId = await resolveDMChannel(userId);
    if (!channelId) { window.open(`discord://-/users/${userId}`); return false; }
    navigateToChannel(channelId);
    return true;
  }

  const isMyMessage = m => m.author.id === ME.id && [0, 19, 20].includes(m.type);

  async function fetchAllMyMessages(channelId) {
    const all = [];
    let lastId = null;
    while (true) {
      const url = new URL(`${BASE}/channels/${channelId}/messages`);
      url.searchParams.set("limit", "100");
      if (lastId) url.searchParams.set("before", lastId);
      const r = await apiFetch(url.toString());
      if (!r.ok) break;
      const batch = await r.json();
      if (!batch.length) break;
      all.push(...batch.filter(isMyMessage));
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
      return (await r.json()).filter(isMyMessage).length;
    } catch { return 0; }
  }

  async function deleteMyMessages(channelId, msgs, hooks = {}) {
    const total = msgs.length;
    let deleted = 0, errors = 0, rateLimits = 0, lastErrorStatus = 0;
    const delay = new AdaptiveDelay(total);

    for (const msg of msgs) {
      if (hooks.isCancelled?.()) break;
      let attempts403 = 0, attemptsOther = 0, done = false;

      while (!done) {
        let r;
        try {
          r = await fetch(`${BASE}/channels/${channelId}/messages/${msg.id}`, { method: "DELETE", headers: HEADS });
        } catch (e) {
          await sleep(1500);
          if (++attemptsOther >= 2) { errors++; lastErrorStatus = -1; done = true; }
          continue;
        }

        if (r.status === 204 || r.status === 404) {
          deleted++; delay.onSuccess(); done = true;
        } else if (r.status === 403) {
          attempts403++;
          if (attempts403 < 3) { await sleep(1500); }
          else { errors++; lastErrorStatus = 403; done = true; }
        } else if (r.status === 429) {
          rateLimits++;
          const body = await r.json().catch(() => ({}));
          delay.onRateLimit(body.retry_after ?? 1);
          hooks.onProgress?.(deleted, total, errors, rateLimits, delay.current);
          await sleep(delay.current);
        } else {
          attemptsOther++;
          if (attemptsOther < 2) { await sleep(2000); }
          else { errors++; lastErrorStatus = r.status; done = true; }
        }
      }

      hooks.onProgress?.(deleted, total, errors, rateLimits, 0);
      if (!hooks.isCancelled?.()) await sleep(delay.current);
    }
    return { deleted, errors, rateLimits, total, cancelled: !!hooks.isCancelled?.(), lastErrorStatus };
  }

  async function cleanChannelMessages(channel, progress, label) {
    const msgs = await fetchAllMyMessages(channel.id);
    if (!msgs.length) return { deleted: 0, total: 0, errors: 0, skipped: true, cancelled: false, lastErrorStatus: 0 };
    progress?.setMode('clean');
    const res = await deleteMyMessages(channel.id, msgs, {
      isCancelled: () => progress?.isCancelled() ?? false,
      onProgress: (done, total, errors, rateLimits, rateWait) => {
        if (!progress) return;
        progress.update(done, total, `🧹 ${label}`, errors);
        if (rateLimits > 0 && rateWait) progress.setRateLimit(rateWait, 0, 0);
        else progress.clearRateLimit();
      },
    });
    return { ...res, total: msgs.length };
  }

  async function removeFriendAPI(id, onWait) {
    const r = await apiFetch(`${BASE}/users/@me/relationships/${id}`, { method: 'DELETE' }, onWait);
    return r.status === 204 || r.status === 200;
  }
  async function leaveGroupAPI(group, silent = true) {
    const url = `${BASE}/channels/${group.id}${silent ? '?silent=true' : ''}`;
    const r = await apiFetch(url, { method: "DELETE" });
    return r.status === 200 || r.status === 204 || r.status === 404;
  }

  function choiceDialog({ title, message, choices }) {
    return new Promise(resolve => {
      document.getElementById('__dt_confirm')?.remove();
      const ov = document.createElement('div');
      ov.id = '__dt_confirm';
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
      for (const c of choices) {
        const bg    = c.danger ? '#da373c' : '#4e5058';
        const hover = c.danger ? '#a12d31' : '#6d6f78';
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
        row.append(b);
      }
      box.append(row);
      ov.append(box);
      document.body.append(ov);
    });
  }

  // ── Progress controller (drives the footer bar + status text) ───
  function createProgressOverlay(initialMode = 'remove', silent = true) {
    document.getElementById('__dt_progress')?.remove();

    let _cancelled = false, _mode = initialMode;
    let _currentDone = 0, _currentTotal = 0, _currentErr = 0;
    const configs = {
      remove: { icon: '🗑', title: 'Removing friends',        noun: 'Removed', word: 'friend',  done: 'removed', color: '#da373c' },
      leave:  { icon: '🚪', title: `${silent ? 'Silent' : 'Normal'} leave in progress`, noun: 'Left', word: 'group', done: 'left', color: '#da373c' },
      clean:  { icon: '🧹', title: 'Deleting your messages',  noun: 'Deleted', word: 'message', done: 'deleted', color: '#5865f2' },
    };

    footbar.classList.add('visible');
    let cancelBtn = document.getElementById('__dt_cancel');
    if (!cancelBtn) {
      cancelBtn = document.createElement('button');
      cancelBtn.id = '__dt_cancel';
      cancelBtn.className = 'dt-btn';
      cancelBtn.textContent = '✕ Cancel';
      Object.assign(cancelBtn.style, {
        padding: '4px 8px', fontSize: '11px',
        background: 'transparent', border: '1px solid #4e5058', color: '#b5bac1',
        flexShrink: '0',
      });
      cancelBtn.onmouseenter = () => { cancelBtn.style.background = '#da373c'; cancelBtn.style.color = '#fff'; cancelBtn.style.borderColor = '#da373c'; };
      cancelBtn.onmouseleave = () => { cancelBtn.style.background = 'transparent'; cancelBtn.style.color = '#b5bac1'; cancelBtn.style.borderColor = '#4e5058'; };
      cancelBtn.onclick = () => {
        _cancelled = true;
        cancelBtn.disabled = true;
        cancelBtn.textContent = '…';
        statusEl.style.color = '#faa61a';
      };
      delBtn.parentNode.insertBefore(cancelBtn, delBtn);
    }
    cancelBtn.style.display = '';
    cancelBtn.disabled = false;
    cancelBtn.textContent = '✕ Cancel';

    const applyBarColor = (mode) => {
      const c = configs[mode] || configs.remove;
      footbarFill.style.background = c.color === '#da373c'
        ? 'linear-gradient(90deg,#da373c,#ff6b6b)'
        : 'linear-gradient(90deg,#5865f2,#8891ff)';
    };

    const setMode = mode => {
      _mode = mode;
      applyBarColor(mode);
      if (!_cancelled) statusEl.style.color = '';
    };
    setMode(initialMode);

    const writeStatus = (done, total, name, err, prefix) => {
      const c = configs[_mode] || configs.remove;
      const head = prefix ? `${prefix} ` : '';
      const errTxt = err > 0 ? `  ⚠️ ${err} error${err > 1 ? 's' : ''}` : '';
      const nameTxt = name ? `  ·  ⏳ ${name}` : '';
      statusEl.textContent = `${head}${c.icon} ${c.noun}: ${done}/${total}${errTxt}${nameTxt}`;
    };

    return {
      setMode,
      // Single-item level update (per message in a DM, per friend, etc.)
      update: (done, total, name, err = 0) => {
        writeStatus(done, total, name, err, '');
        footbarFill.style.width = `${total > 0 ? Math.round((done / total) * 100) : 0}%`;
      },
      // Global counter for bulk operations
      setGlobal: (done, total, name, err = 0) => {
        _currentDone = done;
        _currentTotal = total;
        _currentErr = err;
        const c = configs[_mode] || configs.remove;
        const errTxt = err > 0 ? `  ⚠️ ${err} error${err > 1 ? 's' : ''}` : '';
        const nameTxt = name ? `  ·  ⏳ ${name}` : '';
        statusEl.textContent = `${c.icon} ${c.noun}: ${done}/${total}${errTxt}${nameTxt}`;
        footbarFill.style.width = `${total > 0 ? Math.round((done / total) * 100) : 0}%`;
      },
      setRateLimit: (waitMs, attempt, max) => {
        const msg = attempt
          ? `🐢 Rate limited — retry ${attempt}/${max} in ${(waitMs/1000).toFixed(1)}s`
          : `🐢 Rate limited — waiting ${(waitMs/1000).toFixed(1)}s`;
        statusEl.textContent = msg;
        statusEl.style.color = '#faa61a';
      },
      clearRateLimit: () => {
        if (!_cancelled) statusEl.style.color = '';
      },
      // Show the secondary (blue) bar during a DM clean inside a bulk op.
      setCleanProgress: (done, total, name, err = 0) => {
        if (total === 0 && done === 0 && !name) {
          footbarClean.style.display = 'none';
          footbarCleanFill.style.width = '0%';
          cleanLabel.style.display = 'none';
          cleanNameEl.textContent = '';
          cleanCounterEl.textContent = '0/0';
          const c = configs[_mode] || configs.remove;
          const errTxt = _currentErr > 0 ? `  ⚠️ ${_currentErr} error${_currentErr > 1 ? 's' : ''}` : '';
          statusEl.textContent = `${c.icon} ${c.noun}: ${_currentDone}/${_currentTotal}${errTxt}`;
          return;
        }
        footbarClean.style.display = 'block';
        cleanLabel.style.display = 'block';
        const pct = total > 0 ? Math.round((done / total) * 100) : 0;
        footbarCleanFill.style.width = pct + '%';
        cleanNameEl.textContent = name || 'unknown';
        cleanCounterEl.textContent = `${done}/${total}`;
        // Status line = global counter only (name/counter now in the label)
        const c = configs[_mode] || configs.remove;
        const errTxt = err > 0 ? `  ⚠️ ${err}` : '';
        statusEl.textContent = `${c.icon} ${c.noun}: ${_currentDone}/${_currentTotal}${errTxt}`;
      },
      finish: (done, total, err, cancelled = false) => {
        const c = configs[_mode] || configs.remove;
        const errTxt = err > 0 ? `  ⚠️ ${err} error${err > 1 ? 's' : ''}` : '';
        statusEl.textContent = cancelled
          ? `⛔ Cancelled — ${done}/${total} ${c.word}${done > 1 ? 's' : ''} ${c.done}${errTxt}`
          : `✅ Done — ${done}/${total} ${c.word}${done > 1 ? 's' : ''} ${c.done}${errTxt}`;
        statusEl.style.color = cancelled ? '#faa61a' : '#23a55a';
        footbarFill.style.background = cancelled
          ? 'linear-gradient(90deg,#faa61a,#ffcf72)'
          : 'linear-gradient(90deg,#23a55a,#57f287)';
        footbarFill.style.width = '100%';
        setTimeout(() => {
          footbar.classList.remove('visible');
          footbarClean.style.display = 'none';
          footbarCleanFill.style.width = '0%';
          cleanLabel.style.display = 'none';
          cleanNameEl.textContent = '';
          cleanCounterEl.textContent = '0/0';
          setTimeout(() => { footbarFill.style.width = '0%'; }, 300);
          cancelBtn.style.display = 'none';
        }, 3000);
      },
      remove: () => {
        footbar.classList.remove('visible');
        footbarClean.style.display = 'none';
        footbarCleanFill.style.width = '0%';
        cleanLabel.style.display = 'none';
        cleanNameEl.textContent = '';
        cleanCounterEl.textContent = '0/0';
        cancelBtn.style.display = 'none';
      },
      isCancelled: () => _cancelled,
    };
  }

  // ── Styles ──────────────────────────────────────────────
  const style = document.createElement('style');
  style.id = '__dt_style';
  style.textContent = `
    #__dt_box { position:fixed; top:6vh; left:calc(50% - 400px); width:800px; max-width:96vw; height:88vh;
      background:#313338; color:#dbdee1; border-radius:12px; z-index:1000; display:flex; flex-direction:column;
      font-family:"gg sans","Noto Sans",sans-serif; box-shadow:0 12px 48px rgba(0,0,0,.85),0 0 0 1px rgba(255,255,255,.06); }
    #__dt_box * { box-sizing:border-box; }
    .dt-head { display:flex; align-items:center; padding:10px 14px; cursor:grab; user-select:none; border-bottom:1px solid #1e1f22; flex-shrink:0; gap:6px; }
    .dt-logo { width:22px; height:22px; flex-shrink:0; color:#5865f2; }
    .dt-title { font-size:14px; font-weight:700; color:#fff; white-space:nowrap; margin:0 8px; }
    .dt-x { background:transparent; border:none; color:#b5bac1; font-size:16px; cursor:pointer; padding:2px 6px; border-radius:4px; }
    .dt-x:hover { background:#da373c; color:#fff; }
    .dt-min { background:transparent; border:none; color:#b5bac1; cursor:pointer; padding:4px 6px; border-radius:4px; display:flex; align-items:center; }
    .dt-min svg { transition:transform .15s; }
    #__dt_box.min .dt-min svg { transform:rotate(-90deg); }
    .dt-min:hover { background:#4e5058; color:#fff; }
    .dt-refresh { background:transparent; border:none; color:#b5bac1; cursor:pointer; padding:4px 6px; border-radius:4px; display:flex; align-items:center; }
    .dt-refresh svg { transition:transform .3s; }
    .dt-refresh:hover { background:#4e5058; color:#fff; }
    .dt-refresh:hover svg { transform:rotate(180deg); }
    .dt-refresh.spinning svg { animation:dt-spin .8s linear infinite; }
    @keyframes dt-spin { to { transform:rotate(360deg); } }
    #__dt_box.min { height:auto; width:auto; min-width:0; }
    #__dt_box.min .dt-body, #__dt_box.min .dt-foot,
    #__dt_box.min .dt-tabs { display:none; }
    #__dt_box.min .dt-head { border-bottom:none; padding:8px 12px; gap:6px; }
    #__dt_box.min .dt-title { margin:0 6px 0 2px; }

    .dt-tabs { display:flex; gap:2px; flex:1; }
    .dt-tab { background:transparent; border:none; color:#949ba4; padding:6px 12px; border-radius:6px; font-size:12px; font-weight:600; cursor:pointer;
      display:flex; align-items:center; gap:6px; transition:all .12s; font-family:inherit; }
    .dt-tab:hover { background:#3a3c43; color:#fff; }
    .dt-tab.active { background:#5865f2; color:#fff; }
    .dt-tabcount { background:rgba(255,255,255,.12); padding:0 6px; border-radius:99px; font-size:10px; font-weight:700; min-width:18px; text-align:center; line-height:16px; height:16px; }
    .dt-tab.active .dt-tabcount { background:rgba(0,0,0,.22); }

    .dt-body { flex:1; display:flex; overflow:hidden; position:relative; }
    .dt-panel { flex:1; display:flex; flex-direction:column; overflow:hidden; }
    .dt-panel:not(.active) { display:none; }

    .dt-bar { padding:10px 16px 8px; display:flex; flex-wrap:wrap; gap:8px; align-items:center; flex-shrink:0; }
    .dt-bar input, .dt-bar select { background:#1e1f22; color:#dbdee1; border:1px solid #2b2d31; border-radius:4px; padding:6px 8px; font-size:12px; outline:none; font-family:inherit; }
    .dt-bar input:focus, .dt-bar select:focus { border-color:#5865f2; }
    .dt-btn { background:#4e5058; color:#fff; border:none; border-radius:4px; padding:6px 10px; font-size:12px; font-weight:600; cursor:pointer; transition:background .15s; font-family:inherit; }
    .dt-btn:hover { background:#6d6f78; } .dt-btn.red { background:#da373c; } .dt-btn.red:hover { background:#a12d31; }
    .dt-btn:disabled { opacity:.45; cursor:not-allowed; }
    .dt-chips { display:flex; flex-wrap:wrap; gap:6px; padding:0 16px 10px; flex-shrink:0; }
    .dt-chip { background:#1e1f22; color:#b5bac1; border:1px solid #2b2d31; border-radius:99px; padding:4px 10px; font-size:11px; font-weight:600; cursor:pointer; transition:all .12s; font-family:inherit; }
    .dt-chip:hover { border-color:#5865f2; } .dt-chip.active { background:rgba(88,101,242,.15); border-color:#5865f2; color:#fff; }
    .dt-n-msg-arrow {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      margin-right: 4px;
      vertical-align: -1px;
      pointer-events: none;
    }
    .dt-adv { display:none; padding:10px 16px; gap:8px; flex-wrap:wrap; align-items:center; border-top:1px dashed #2b2d31; margin-top:2px; }
    .dt-adv.open { display:flex; }
    .dt-adv label { font-size:11px; color:#b5bac1; display:flex; align-items:center; gap:4px; }
    .dt-list { flex:1; overflow-y:auto; padding:6px 10px; background:#2b2d31; border-top:1px solid #1e1f22; }
    .dt-row { display:flex; align-items:center; gap:10px; padding:8px; border-radius:6px; cursor:pointer; border-bottom:1px solid #313338; transition:background .12s; }
    .dt-row:hover { background:#35373c; } .dt-row.sel { background:rgba(218,55,60,.15); }
    .dt-cb { accent-color:#da373c; width:16px; height:16px; flex-shrink:0; cursor:pointer; }
    .dt-av { width:40px; height:40px; border-radius:50%; flex-shrink:0; background:#1e1f22; object-fit:cover; cursor:pointer; }
    .dt-av-ph { display:flex; align-items:center; justify-content:center; font-size:20px; background:#5865f2; }
    .dt-av-ph.solo { background:#faa61a; }
    .dt-info { flex:1; min-width:0; }
    .dt-name { font-size:14px; font-weight:600; color:#fff; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; width:fit-content; max-width:100%; cursor:pointer; }
    .dt-name:hover { text-decoration:underline; }
    .dt-name span { font-weight:400; color:#b5bac1; font-size:12px; margin-left:6px; }
    .dt-sub { font-size:11px; color:#b5bac1; margin-top:2px; }
    .dt-badges { display:flex; gap:4px; flex-shrink:0; }
    .dt-badge { font-size:11px; padding:1px 5px; border-radius:4px; line-height:1.4; }
    .dt-actions { display:flex; gap:6px; flex-shrink:0; }
.dt-dm, .dt-open { background:transparent; border:1px solid #4e5058; color:#b5bac1; font-size:13px; padding:4px 8px; border-radius:4px; cursor:pointer; font-weight:600; transition:all .12s; font-family:inherit; display:inline-flex; align-items:center; justify-content:center; }
    .dt-dm:hover, .dt-open:hover { border-color:#5865f2; color:#5865f2; } .dt-dm.loading, .dt-open.loading { opacity:.6; cursor:wait; }
    .dt-rm { background:transparent; border:1px solid #4e5058; color:#b5bac1; font-size:12px; padding:4px 8px; border-radius:4px; cursor:pointer; font-weight:600; transition:all .12s; min-width:84px; font-family:inherit; }
    .dt-rm:hover { border-color:#da373c; color:#da373c; background:rgba(218,55,60,.08); }
    .dt-rm.armed { border-color:#da373c; color:#fff; background:#da373c; }
    .dt-rm.loading { opacity:.6; cursor:wait; } .dt-rm.err { border-color:#da373c; color:#da373c; background:rgba(218,55,60,.15); }
    .dt-cl { background:transparent; border:1px solid #4e5058; color:#b5bac1; font-size:12px; padding:4px 8px; border-radius:4px; cursor:pointer; font-weight:600; transition:all .12s; min-width:84px; font-family:inherit; }
    .dt-cl:hover { border-color:#5865f2; color:#5865f2; background:rgba(88,101,242,.08); }
    .dt-cl.armed { border-color:#5865f2; color:#fff; background:#5865f2; }
    .dt-cl.loading { opacity:.6; cursor:wait; }
    .dt-foot { padding:10px 16px; border-top:1px solid #1e1f22; display:flex; align-items:center; gap:10px; flex-shrink:0; flex-wrap:wrap; }
    .dt-status { flex:1; font-size:12px; color:#b5bac1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; min-width:120px; }
    .dt-silent { cursor:pointer; font-size:12px; color:#dbdee1; background:#1e1f22; border:1px solid #2b2d31; border-radius:4px; padding:5px 8px; display:flex; align-items:center; gap:6px; }
    .dt-silent:hover { border-color:#5865f2; }
    .dt-footbar { width:100%; height:6px; background:#1e1f22; border-radius:99px; overflow:hidden; margin-top:6px; display:none; }
    .dt-footbar.visible { display:block; }
    .dt-footbar > div { height:100%; width:0%; background:linear-gradient(90deg,#da373c,#ff6b6b); border-radius:99px; transition:width .4s ease; }
    .dt-footbar-clean > div { background:linear-gradient(90deg,#5865f2,#8891ff); }
    .dt-clean-label {
      width:100%; font-size:11px; color:#8891ff; font-weight:600;
      margin-top:6px; margin-bottom:2px; overflow:hidden;
      text-overflow:ellipsis; white-space:nowrap;
    }
    .dt-clean-label #dt-clean-name { color:#fff; }
    .dt-empty { text-align:center; color:#b5bac1; padding:30px; font-size:13px; }

    .dt-hist-meta { display:flex; gap:6px; flex-wrap:wrap; margin-top:4px; }
    .dt-hist-tag { font-size:10px; padding:2px 6px; border-radius:4px; font-weight:600; background:rgba(88,101,242,.12); color:#8891ff; border:1px solid rgba(88,101,242,.3); }
    .dt-hist-tag.green { background:rgba(35,165,90,.12); color:#57f287; border-color:rgba(35,165,90,.3); }
    .dt-hist-tag.orange { background:rgba(250,166,26,.12); color:#faa61a; border-color:rgba(250,166,26,.3); }
    .dt-hist-tag.grey { background:rgba(181,186,193,.1); color:#b5bac1; border-color:rgba(181,186,193,.25); }
    .dt-hist-tag.friend { background:rgba(218,55,60,.12); color:#ff8189; border-color:rgba(218,55,60,.3); }
    .dt-hist-tag.group { background:rgba(88,101,242,.12); color:#8891ff; border-color:rgba(88,101,242,.3); }
    .dt-hist-tag.notfriend { background:rgba(35,165,90,.12); color:#57f287; border-color:rgba(35,165,90,.3); }
    .dt-hist-date { font-size:10px; color:#6d6f78; margin-top:3px; }
    #__dt_box .dt-hrow { cursor:default; }

    /* ── Scrollbar bleue minimaliste ── */
    .dt-list::-webkit-scrollbar {
      width: 6px;
    }
    .dt-list::-webkit-scrollbar-track {
      background: transparent;
    }
    .dt-list::-webkit-scrollbar-thumb {
      background: #5865f2;
      border-radius: 99px;
      cursor: pointer;
    }
    .dt-list::-webkit-scrollbar-thumb:hover {
      background: #4752c4;
    }
  `;
  document.head.append(style);

  // ── Loading modal ───────────────────────────────────────
  function showLoadingModal(text = 'Loading Discord Tools…') {
    document.getElementById('__dt_loading')?.remove();
    stopLoadingTicker();
    _loadCurrent = 0;
    _loadTarget = 0;
    _loadBaseText = text;
    const ov = document.createElement('div');
    ov.id = '__dt_loading';
    Object.assign(ov.style, {
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)',
      zIndex: '100002', display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: '"gg sans","Noto Sans",sans-serif',
      backdropFilter: 'blur(4px)',
    });
    const card = document.createElement('div');
    Object.assign(card.style, {
      background: '#313338', borderRadius: '14px', padding: '28px 36px',
      width: '360px', maxWidth: '92vw', color: '#dbdee1', textAlign: 'center',
      boxShadow: '0 16px 60px rgba(0,0,0,0.9), 0 0 0 1px rgba(255,255,255,0.06)',
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '18px',
    });

    const logo = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    logo.setAttribute('viewBox', '0 0 127.14 96.36');
    logo.setAttribute('width', '42');
    logo.setAttribute('height', '42');
    logo.setAttribute('fill', '#5865f2');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', 'M107.7,8.07A105.15,105.15,0,0,0,81.47,0a72.06,72.06,0,0,0-3.36,6.83A97.68,97.68,0,0,0,49,6.83,72.37,72.37,0,0,0,45.64,0,105.89,105.89,0,0,0,19.39,8.09C2.79,32.65-1.71,56.6.54,80.21h0A105.73,105.73,0,0,0,32.71,96.36,77.7,77.7,0,0,0,39.6,85.25a68.42,68.42,0,0,1-10.85-5.18c.91-.66,1.8-1.34,2.66-2a75.57,75.57,0,0,0,64.32,0c.87.71,1.76,1.39,2.66,2a68.68,68.68,0,0,1-10.87,5.19,77,77,0,0,0,6.89,11.1A105.25,105.25,0,0,0,126.6,80.22h0C129.24,52.84,122.09,29.11,107.7,8.07ZM42.45,65.69C36.18,65.69,31,60,31,53s5-12.74,11.43-12.74S54,46,53.89,53,48.84,65.69,42.45,65.69Zm42.24,0C78.41,65.69,73.25,60,73.25,53s5-12.74,11.44-12.74S96.23,46,96.12,53,91.08,65.69,84.69,65.69Z');
    logo.append(path);

    const title = document.createElement('div');
    title.textContent = 'Discord Tools';
    Object.assign(title.style, { fontSize: '17px', fontWeight: '700', color: '#fff' });

    const status = document.createElement('div');
    status.id = '__dt_loading_status';
    status.textContent = text;
    Object.assign(status.style, { fontSize: '13px', color: '#b5bac1', minHeight: '18px' });

    const barTrack = document.createElement('div');
    Object.assign(barTrack.style, { width: '100%', height: '6px', background: '#1e1f22', borderRadius: '99px', overflow: 'hidden' });
    const barFill = document.createElement('div');
    barFill.id = '__dt_loading_fill';
    Object.assign(barFill.style, {
      height: '100%', width: '0%', borderRadius: '99px',
      background: 'linear-gradient(90deg,#5865f2,#8891ff)',
    });
    barTrack.append(barFill);

    card.append(logo, title, status, barTrack);
    ov.append(card);
    document.body.append(ov);
  }
  function _renderLoadingText() {
    const s = document.getElementById('__dt_loading_status');
    if (!s) return;
    const dots = '.'.repeat((Math.floor(Date.now() / 350) % 4));
    s.textContent = _loadBaseText + dots;
  }

  function setLoadingStep(text, pct) {
    _loadBaseText = text;
    if (typeof pct === 'number') {
      _loadTarget = Math.max(_loadTarget, Math.max(0, Math.min(100, pct)));
    }
    const s = document.getElementById('__dt_loading_status');
    if (s) s.textContent = text;

    if (!_loadTicker) {
      _loadTicker = setInterval(() => {
        const f = document.getElementById('__dt_loading_fill');
        if (!f) { clearInterval(_loadTicker); _loadTicker = null; return; }
        const diff = _loadTarget - _loadCurrent;
        if (Math.abs(diff) < 0.1) {
          _loadCurrent = _loadTarget;
        } else {
          _loadCurrent += diff * 0.08;
        }
        f.style.width = _loadCurrent.toFixed(2) + '%';
      }, 30);
    }
    if (!_loadDotsTimer) {
      _loadDotsTimer = setInterval(_renderLoadingText, 300);
    }
  }

  function stopLoadingTicker() {
    if (_loadTicker) { clearInterval(_loadTicker); _loadTicker = null; }
    if (_loadDotsTimer) { clearInterval(_loadDotsTimer); _loadDotsTimer = null; }
  }
  function hideLoadingModal() {
    const ov = document.getElementById('__dt_loading');
    if (!ov) return;
    stopLoadingTicker();
    const f = document.getElementById('__dt_loading_fill');
    if (f) f.style.width = '100%';
    ov.style.transition = 'opacity .25s ease';
    ov.style.opacity = '0';
    setTimeout(() => ov.remove(), 260);
  }

  // ── Build window ────────────────────────────────────────
  const box = document.createElement('div');
  box.id = '__dt_box';
  box.innerHTML = `
    <div class="dt-head">
      <button class="dt-min" title="Collapse"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 9l7 7 7-7"/></svg></button>
      <button class="dt-refresh" title="Reload Discord Tools"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-3-6.7"/><path d="M21 3v5h-5"/></svg></button>
      <svg class="dt-logo" viewBox="0 0 127.14 96.36" fill="currentColor" aria-hidden="true">
        <path d="M107.7,8.07A105.15,105.15,0,0,0,81.47,0a72.06,72.06,0,0,0-3.36,6.83A97.68,97.68,0,0,0,49,6.83,72.37,72.37,0,0,0,45.64,0,105.89,105.89,0,0,0,19.39,8.09C2.79,32.65-1.71,56.6.54,80.21h0A105.73,105.73,0,0,0,32.71,96.36,77.7,77.7,0,0,0,39.6,85.25a68.42,68.42,0,0,1-10.85-5.18c.91-.66,1.8-1.34,2.66-2a75.57,75.57,0,0,0,64.32,0c.87.71,1.76,1.39,2.66,2a68.68,68.68,0,0,1-10.87,5.19,77,77,0,0,0,6.89,11.1A105.25,105.25,0,0,0,126.6,80.22h0C129.24,52.84,122.09,29.11,107.7,8.07ZM42.45,65.69C36.18,65.69,31,60,31,53s5-12.74,11.43-12.74S54,46,53.89,53,48.84,65.69,42.45,65.69Zm42.24,0C78.41,65.69,73.25,60,73.25,53s5-12.74,11.44-12.74S96.23,46,96.12,53,91.08,65.69,84.69,65.69Z"/>
      </svg>
      <div class="dt-title">Discord Tools</div>
      <div class="dt-tabs">
        <button class="dt-tab active" data-tab="friends">👥 Friends <span class="dt-tabcount" id="dt-fcount">${friends.length}</span></button>
        <button class="dt-tab" data-tab="groups">👥 Groups <span class="dt-tabcount" id="dt-gcount">${groups.length}</span></button>
        <button class="dt-tab" data-tab="notfriends">💬 Not Friends <span class="dt-tabcount" id="dt-ncount">${notFriends.length}</span></button>
        <button class="dt-tab" data-tab="history">📜 History <span class="dt-tabcount" id="dt-hcount">${history.length}</span></button>
      </div>
      <button class="dt-x" title="Close">✕</button>
    </div>
    <div class="dt-body">

      <!-- ══════════ FRIENDS PANEL ══════════ -->
      <div class="dt-panel active" data-panel="friends">
        <div class="dt-bar">
          <input id="dt-f-q" placeholder="🔍 Search username / ID" style="flex:1;min-width:150px">
          <select id="dt-f-sort" title="Sort by">
            <option value="added">Date added</option>
            <option value="name">Name</option>
            <option value="created">Account created</option>
            <option value="lastdm">Last DM</option>
          </select>
          <button class="dt-btn" id="dt-f-dir" style="min-width:32px;font-size:14px;padding:4px 8px">↓</button>
          <label style="cursor:pointer;font-size:12px;color:#dbdee1;background:#1e1f22;border:1px solid #2b2d31;border-radius:4px;padding:5px 8px">
            <input type="checkbox" id="dt-f-selall" class="dt-cb" style="width:14px;height:14px"> Select all
          </label>
          <button class="dt-btn" id="dt-f-adv-toggle" style="font-size:14px;padding:4px 10px">⚙</button>
        </div>
        <div class="dt-chips" id="dt-f-chips">
          <button class="dt-chip active" data-chip="all">All</button>
          <button class="dt-chip" data-chip="newacct">🆕 New accounts</button>
          <button class="dt-chip" data-chip="noavatar">👻 No avatar</button>
          <button class="dt-chip" data-chip="fresh">🌱 Fresh friends</button>
          <button class="dt-chip" data-chip="long">⏳ Long-time</button>
        </div>
        <div class="dt-adv" id="dt-f-adv">
          <label>Added after <input type="date" id="dt-f-from"></label>
          <label>before <input type="date" id="dt-f-to"></label>
          <select id="dt-f-av">
            <option value="all">All avatars</option>
            <option value="def">Default avatar</option>
            <option value="custom">Custom avatar</option>
          </select>
        </div>
        <div class="dt-list" id="dt-f-list"></div>
      </div>

      <!-- ══════════ GROUPS PANEL ══════════ -->
      <div class="dt-panel" data-panel="groups">
        <div class="dt-bar">
          <input id="dt-g-q" placeholder="🔍 Search name / member / ID" style="flex:1;min-width:150px">
          <select id="dt-g-sort" title="Sort by">
            <option value="created">Date created</option>
            <option value="activity">Last activity</option>
            <option value="name">Name</option>
            <option value="members">Members</option>
          </select>
          <button class="dt-btn" id="dt-g-dir" style="min-width:32px;font-size:14px;padding:4px 8px">↓</button>
          <label style="cursor:pointer;font-size:12px;color:#dbdee1;background:#1e1f22;border:1px solid #2b2d31;border-radius:4px;padding:5px 8px">
            <input type="checkbox" id="dt-g-selall" class="dt-cb" style="width:14px;height:14px"> Select all
          </label>
          <button class="dt-btn" id="dt-g-adv-toggle" style="font-size:14px;padding:4px 10px">⚙</button>
        </div>
        <div class="dt-chips" id="dt-g-chips">
          <button class="dt-chip active" data-chip="all">All</button>
          <button class="dt-chip" data-chip="solo">👤 Solo</button>
          <button class="dt-chip" data-chip="named">✏️ Named</button>
          <button class="dt-chip" data-chip="inactive">💤 Inactive</button>
          <button class="dt-chip" data-chip="new">🆕 Recent</button>
          <button class="dt-chip" data-chip="old">⏳ Old</button>
        </div>
        <div class="dt-adv" id="dt-g-adv">
          <label>Created after <input type="date" id="dt-g-from"></label>
          <label>before <input type="date" id="dt-g-to"></label>
          <select id="dt-g-ic">
            <option value="all">All icons</option>
            <option value="def">Default icon</option>
            <option value="custom">Custom icon</option>
          </select>
        </div>
        <div class="dt-list" id="dt-g-list"></div>
      </div>

      <!-- ══════════ NOT FRIENDS PANEL ══════════ -->
      <div class="dt-panel" data-panel="notfriends">
        <div class="dt-bar">
          <input id="dt-n-q" placeholder="🔍 Search username / ID" style="flex:1;min-width:150px">
          <select id="dt-n-sort" title="Sort by">
            <option value="lastdm">Last DM</option>
            <option value="name">Name</option>
            <option value="created">Account created</option>
            <option value="count">Message count</option>
          </select>
          <button class="dt-btn" id="dt-n-dir" style="min-width:32px;font-size:14px;padding:4px 8px">↓</button>
          <label style="cursor:pointer;font-size:12px;color:#dbdee1;background:#1e1f22;border:1px solid #2b2d31;border-radius:4px;padding:5px 8px">
            <input type="checkbox" id="dt-n-selall" class="dt-cb" style="width:14px;height:14px"> Select all
          </label>
        </div>
        <div class="dt-chips" id="dt-n-chips">
          <button class="dt-chip active" data-chip="all">All</button>
          <button class="dt-chip" data-chip="withmsg" id="dt-n-msg-toggle">
            <span class="dt-n-msg-arrow">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="7 4 3 8 7 12"/><line x1="3" y1="8" x2="21" y2="8"/><polyline points="17 12 21 16 17 20"/><line x1="21" y1="16" x2="3" y2="16"/></svg>
            </span>
            <span id="dt-n-msg-label">💬 With my messages</span>
          </button>
          <button class="dt-chip" data-chip="empty">📭 Empty</button>
          <button class="dt-chip" data-chip="newacct">🆕 New accounts</button>
          <button class="dt-chip" data-chip="noavatar">👻 No avatar</button>
        </div>
        <div class="dt-list" id="dt-n-list"></div>
      </div>

      <!-- ══════════ HISTORY PANEL ══════════ -->
      <div class="dt-panel" data-panel="history">
        <div class="dt-bar">
          <input id="dt-hq" placeholder="🔍 Search in history" style="flex:1;min-width:150px">
          <select id="dt-hfilter" title="Filter by type">
            <option value="all">All types</option>
            <option value="friend">👤 Friends only</option>
            <option value="group">👥 Groups only</option>
            <option value="notfriend">💬 Not-friends only</option>
          </select>
          <span id="dt-hstats" style="font-size:11px;color:#949ba4"></span>
          <button class="dt-btn red" id="dt-hclear" title="Clear all history">🗑 Clear</button>
        </div>
        <div class="dt-list" id="dt-hlist"></div>
      </div>

    </div>
    <div class="dt-foot" id="dt-foot">
      <div class="dt-status" id="dt-status"></div>
      <label class="dt-silent" id="dt-silent-wrap" title="No notification will be sent to the other members" style="display:none">
        <input type="checkbox" id="dt-silent" class="dt-cb" style="width:14px;height:14px;accent-color:#5865f2"> 🔇 Silent
      </label>
      <button class="dt-btn red" id="dt-del" disabled>🗑 Remove selected</button>
      <div class="dt-footbar" id="dt-footbar"><div></div></div>
      <div class="dt-clean-label" id="dt-clean-label" style="display:none">
        🧹 <span id="dt-clean-name"></span> — <span id="dt-clean-counter">0/0</span> messages
      </div>
      <div class="dt-footbar dt-footbar-clean" id="dt-footbar-clean" style="display:none">
        <div id="dt-footbar-clean-fill"></div>
      </div>
    </div>`;
  document.body.append(box);

  const $ = id => box.querySelector('#' + id);

  let busy = false, activeTab = prefs.activeTab || 'friends';
  let visibleFriends = [], visibleGroups = [], visibleNotFriends = [];
  let sortDirFriend = prefs.dirFriend === 'asc' ? 'asc' : 'desc';
  let sortDirGroup  = prefs.dirGroup  === 'asc' ? 'asc' : 'desc';
  let sortDirNotFriends = prefs.dirNotFriends === 'asc' ? 'asc' : 'desc';
  let activeChipFriend = prefs.chipFriend || 'all';
  let activeChipGroup  = prefs.chipGroup  || 'all';
  let activeChipNotFriends = prefs.chipNotFriends || 'all';
  let notFriendsMsgMode = prefs.notFriendsMsgMode || 'with';

  const statusEl   = $('dt-status');
  const delBtn     = $('dt-del');
  const silentCb   = $('dt-silent');
  const silentWrap = $('dt-silent-wrap');
  const footEl     = $('dt-foot');
  const footbar    = $('dt-footbar');
  const footbarFill = footbar.firstElementChild;
  const footbarClean = $('dt-footbar-clean');
  const footbarCleanFill = footbarClean.firstElementChild;
  const cleanLabel = $('dt-clean-label');
  const cleanNameEl = $('dt-clean-name');
  const cleanCounterEl = $('dt-clean-counter');
  const fListEl = $('dt-f-list'), gListEl = $('dt-g-list'), hListEl = $('dt-hlist'), nListEl = $('dt-n-list');

  $('dt-f-sort').value = prefs.sortFriend || 'added';
  $('dt-f-av').value   = prefs.avFriend || 'all';
  if (prefs.fromFriend) $('dt-f-from').value = prefs.fromFriend;
  if (prefs.toFriend)   $('dt-f-to').value   = prefs.toFriend;
  $('dt-f-dir').textContent = sortDirFriend === 'desc' ? '↓' : '↑';

  $('dt-g-sort').value = prefs.sortGroup || 'created';
  $('dt-g-ic').value   = prefs.icGroup || 'all';
  if (prefs.fromGroup) $('dt-g-from').value = prefs.fromGroup;
  if (prefs.toGroup)   $('dt-g-to').value   = prefs.toGroup;
  $('dt-g-dir').textContent = sortDirGroup === 'desc' ? '↓' : '↑';

  $('dt-n-sort').value = prefs.sortNotFriends || 'lastdm';
  $('dt-n-dir').textContent = sortDirNotFriends === 'desc' ? '↓' : '↑';

  silentCb.checked = loadSilentPref();
  silentCb.onchange = () => saveSilentPref(silentCb.checked);

  box.querySelectorAll('#dt-f-chips .dt-chip').forEach(c => c.classList.toggle('active', c.dataset.chip === activeChipFriend));
  box.querySelectorAll('#dt-g-chips .dt-chip').forEach(c => c.classList.toggle('active', c.dataset.chip === activeChipGroup));
  box.querySelectorAll('#dt-n-chips .dt-chip').forEach(c => c.classList.toggle('active', c.dataset.chip === activeChipNotFriends));
  {
    const label = document.getElementById('dt-n-msg-label');
    if (label) label.textContent = notFriendsMsgMode === 'with' ? '💬 With my messages' : '🚫 Without my messages';
  }

  const saveCurrentPrefs = () => savePrefs({
    sortFriend: $('dt-f-sort').value, dirFriend: sortDirFriend,
    avFriend: $('dt-f-av').value, fromFriend: $('dt-f-from').value, toFriend: $('dt-f-to').value,
    chipFriend: activeChipFriend,
    sortGroup: $('dt-g-sort').value, dirGroup: sortDirGroup,
    icGroup: $('dt-g-ic').value, fromGroup: $('dt-g-from').value, toGroup: $('dt-g-to').value,
    chipGroup: activeChipGroup,
    sortNotFriends: $('dt-n-sort').value, dirNotFriends: sortDirNotFriends,
    chipNotFriends: activeChipNotFriends,
    notFriendsMsgMode,
    activeTab,
  });

  const head = box.querySelector('.dt-head');
  let drag = null;
  head.addEventListener('mousedown', e => {
    if (e.target.closest('.dt-x, .dt-min, .dt-tab')) return;
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

  const minBtn = box.querySelector('.dt-min');
  const toggleMin = () => {
    const m = box.classList.toggle('min');
    minBtn.title = m ? 'Expand' : 'Collapse';
    requestAnimationFrame(() => {
      const r = box.getBoundingClientRect();
      if (r.right > innerWidth - 8) {
        box.style.left = Math.max(8, innerWidth - r.width - 8) + 'px';
      }
      if (r.left < 8) {
        box.style.left = '8px';
      }
    });
  };
  minBtn.onclick = toggleMin;
  head.addEventListener('dblclick', e => { if (!e.target.closest('.dt-x, .dt-min, .dt-tab')) toggleMin(); });
  box.querySelector('.dt-x').onclick = () => {
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
    box.remove(); style.remove();
    document.getElementById('__dt_progress')?.remove();
    document.getElementById('__dt_confirm')?.remove();
  };

  $('dt-f-adv-toggle').onclick = () => $('dt-f-adv').classList.toggle('open');
  $('dt-g-adv-toggle').onclick = () => $('dt-g-adv').classList.toggle('open');

  box.querySelector('.dt-refresh').onclick = () => {
    const btn = box.querySelector('.dt-refresh');
    btn.classList.add('spinning');
    btn.disabled = true;
    statusEl.textContent = '🔄 Reloading Discord Tools…';
    showLoadingModal('Reloading Discord Tools…');
    setLoadingStep('Cleaning up…', 20);
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
    document.getElementById('__dt_progress')?.remove();
    document.getElementById('__dt_confirm')?.remove();
    setTimeout(() => {
      box.remove();
      style.remove();
      if (typeof window.__dt_run === 'function') {
        window.__dt_run();
      } else {
        console.warn('⚠️ Reload function not available — re-paste the script manually');
      }
    }, 200);
  };

  const applyTab = () => {
    box.querySelectorAll('.dt-tab').forEach(x => x.classList.toggle('active', x.dataset.tab === activeTab));
    box.querySelectorAll('.dt-panel').forEach(p => p.classList.toggle('active', p.dataset.panel === activeTab));
    footEl.style.display = activeTab === 'history' ? 'none' : '';
    silentWrap.style.display = activeTab === 'groups' ? 'flex' : 'none';

    if (activeTab === 'friends') {
      delBtn.textContent = `🗑 Remove selected (${selectedFriends.size})`;
      delBtn.disabled = busy || selectedFriends.size === 0;
      statusEl.textContent = `${visibleFriends.length} shown / ${friends.length} friend(s) · ${selectedFriends.size} selected`;
    } else if (activeTab === 'groups') {
      delBtn.textContent = `🚪 Leave selected (${selectedGroups.size})`;
      delBtn.disabled = busy || selectedGroups.size === 0;
      const solo = groups.filter(g => g.solo).length;
      statusEl.textContent = `${visibleGroups.length} shown / ${groups.length} group(s)${solo ? ` (${solo} solo)` : ''} · ${selectedGroups.size} selected`;
    } else if (activeTab === 'notfriends') {
      delBtn.textContent = `🧹 Clean + close (${selectedNotFriends.size})`;
      delBtn.disabled = busy || selectedNotFriends.size === 0;
      statusEl.textContent = `${visibleNotFriends.length} shown / ${notFriends.length} non-friend DM(s) · ${selectedNotFriends.size} selected`;
    }
  };
  box.querySelectorAll('.dt-tab').forEach(t => {
    t.onclick = () => {
      activeTab = t.dataset.tab;
      applyTab();
      if (activeTab === 'friends') renderFriends();
      else if (activeTab === 'groups') renderGroups();
      else if (activeTab === 'notfriends') { ensureNotFriendsScanned(); }
      else renderHistory();
      saveCurrentPrefs();
    };
  });

  // ════════════════════════════════════════════════════════
  //  FRIENDS TAB
  // ════════════════════════════════════════════════════════
  const selectedFriends = new Set();
  const getVisibleFriends = () => {
    const q = $('dt-f-q').value.trim().toLowerCase();
    const av = $('dt-f-av').value;
    const from = $('dt-f-from').value ? new Date($('dt-f-from').value + 'T00:00:00') : null;
    const to   = $('dt-f-to').value   ? new Date($('dt-f-to').value + 'T23:59:59') : null;
    let l = friends.filter(f => {
      const u = f.user;
      if (q && !(`${u.username} ${u.global_name ?? ''} ${f.id}`.toLowerCase().includes(q))) return false;
      if (from && (!f.since || f.since < from)) return false;
      if (to && (!f.since || f.since > to)) return false;
      if (av === 'def' && u.avatar) return false;
      if (av === 'custom' && !u.avatar) return false;
      if (activeChipFriend === 'newacct'  && !isNewAccount(f))     return false;
      if (activeChipFriend === 'noavatar' && !isNoAvatar(f))       return false;
      if (activeChipFriend === 'fresh'    && !isFreshFriend(f))    return false;
      if (activeChipFriend === 'long'     && !isLongTimeFriend(f)) return false;
      return true;
    });
    const key = $('dt-f-sort').value;
    const m = sortDirFriend === 'asc' ? 1 : -1;
    const val = {
      added: f => f.since?.getTime() ?? (m === 1 ? Infinity : -Infinity),
      created: f => f.created.getTime(),
      lastdm: f => dmLastByUserId.get(f.user.id)?.getTime() ?? (m === 1 ? Infinity : -Infinity),
    };
    l.sort((a, b) => key === 'name'
      ? m * displayName(a.user).localeCompare(displayName(b.user), undefined, { sensitivity: 'base' })
      : m * (val[key](a) - val[key](b)));
    return l;
  };

  const friendRowHtml = f => {
    const u = f.user;
    const badges = badgesForFriend(f).map(b =>
      `<span class="dt-badge" title="${esc(b.label)}" style="color:${b.color};background:${b.color}20;border:1px solid ${b.color}55">${b.icon}</span>`
    ).join('');
    return `<div class="dt-row ${selectedFriends.has(f.id) ? 'sel' : ''}" data-id="${f.id}">
      <input type="checkbox" class="dt-cb" ${selectedFriends.has(f.id) ? 'checked' : ''}>
      <img class="dt-av" loading="lazy" src="${avatarUrl(u)}" title="View profile">
      <div class="dt-info">
        <div class="dt-name" title="View profile">${esc(displayName(u))}<span>@${esc(u.username)}</span></div>
        <div class="dt-sub">Friends since ${fmtDate(f.since)} (${fmtRelative(f.since)}) · Account created ${fmtDate(f.created)}${dmLastByUserId.has(u.id) ? ` · 💬 Last DM ${fmtRelative(dmLastByUserId.get(u.id))}` : ''}</div>
      </div>
      <div class="dt-badges">${badges}</div>
      <div class="dt-actions">
<button class="dt-dm" title="Open DM"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="7" y1="17" x2="17" y2="7"/><polyline points="7 7 17 7 17 17"/></svg></button>
        <button class="dt-cl" title="Delete only your messages in this DM (click twice)">🧹 Clean</button>
        <button class="dt-rm" title="Remove this friend (click twice)">🗑 Remove</button>
      </div>
    </div>`;
  };

  const updateFriendFooter = (msg) => {
    const sa = $('dt-f-selall');
    if (sa) {
      const n = visibleFriends.filter(f => selectedFriends.has(f.id)).length;
      sa.checked = visibleFriends.length > 0 && n === visibleFriends.length;
      sa.indeterminate = n > 0 && n < visibleFriends.length;
    }
    $('dt-fcount').textContent = friends.length;
    if (activeTab === 'friends') {
      delBtn.disabled = busy || selectedFriends.size === 0;
      delBtn.textContent = `🗑 Remove selected (${selectedFriends.size})`;
      statusEl.textContent = msg ?? `${visibleFriends.length} shown / ${friends.length} friend(s) · ${selectedFriends.size} selected`;
    }
  };

  const renderFriends = () => {
    visibleFriends = getVisibleFriends();
    fListEl.innerHTML = visibleFriends.length ? visibleFriends.map(friendRowHtml).join('')
      : `<div class="dt-empty">No friends match the filters.</div>`;
    updateFriendFooter();
  };

  async function cleanDMWithFriend(friend, progress) {
    const channelId = await resolveDMChannel(friend.id);
    if (!channelId) return { deleted: 0, total: 0, errors: 0, skipped: true, cancelled: false };
    const label = displayName(friend.user);
    return await cleanChannelMessages({ id: channelId }, progress, label);
  }

  async function askFriendChoice({ count, totalMsgCount, individualName }) {
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
          { label: 'Cancel',    value: 'cancel' },
          { label: '🗑 Remove', value: 'plain', danger: true },
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

  async function removeOneFriend(id, btn, row) {
    if (busy) return;
    const f = friends.find(x => x.id === id);
    if (!f) return;
    const name = displayName(f.user);

    busy = true;
    if (btn) { btn.classList.add('loading'); btn.textContent = '…'; }
    statusEl.textContent = `🔍 Checking your messages with ${name}…`;

    let channelId = null;
    try { channelId = await resolveDMChannel(id); } catch {}
    let msgCount = 0;
    if (channelId) msgCount = await quickCountMyMessages(channelId);

    if (!box.isConnected) { busy = false; return; }
    const action = await askFriendChoice({ count: msgCount, individualName: name });
    if (btn) { btn.classList.remove('loading'); btn.textContent = '🗑 Remove'; }
    busy = false;
    if (!box.isConnected || action === 'cancel') { updateFriendFooter(); return; }

    busy = true;
    if (btn) { btn.classList.add('loading'); btn.textContent = '…'; }

    let dmResult = null;
    if (action === 'clean') {
      statusEl.textContent = `🧹 Cleaning DM with ${name}…`;
      const progress = createProgressOverlay('clean');
      try { dmResult = await cleanDMWithFriend(f, progress); } catch (e) { console.warn(e); }
      progress.finish(dmResult?.deleted ?? 0, dmResult?.total ?? 0, dmResult?.errors ?? 0, dmResult?.cancelled ?? false);
    }

    let abortRemove = false;
    if (dmResult?.cancelled) {
      abortRemove = true;
      statusEl.textContent = `⛔ Clean cancelled — ${name} NOT removed.`;
    } else if (dmResult && dmResult.errors > 0) {
      const choice = await choiceDialog({
        title: `Some messages couldn't be deleted`,
        message: `<b style="color:#fff">${dmResult.deleted}/${dmResult.total}</b> messages deleted — <b style="color:#faa61a">${dmResult.errors} error${dmResult.errors > 1 ? 's' : ''}</b>.<br><br>
                  Do you still want to remove <b style="color:#fff">${esc(name)}</b>?`,
        choices: [
          { label: '❌ Keep friend',   value: 'keep' },
          { label: '🗑 Remove anyway', value: 'remove', danger: true },
        ],
      });
      if (choice !== 'remove') abortRemove = true;
    }

    if (abortRemove) {
      busy = false;
      if (btn) { btn.classList.remove('loading'); btn.textContent = '🗑 Remove'; }
      if (box.isConnected) updateFriendFooter();
      return;
    }

    statusEl.textContent = `🗑 Removing ${name}…`;
    let removed = false;
    try {
      removed = await removeFriendAPI(id, ({ waitMs, attempt, max }) =>
        statusEl.textContent = `🐢 Rate limited — retry ${attempt}/${max} in ${(waitMs/1000).toFixed(1)}s`);
    } catch (e) { console.warn(e.message); }

    if (!box.isConnected) { busy = false; return; }

    if (removed) {
      let dmClosed = false;
      if (channelId) {
        statusEl.textContent = `👋 Closing DM with ${name}…`;
        dmClosed = await closeDMChannel(channelId);
      }
      pushHistory({
        kind: 'friend',
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
      friendIds.delete(id);
      selectedFriends.delete(id);
      dmChannelByUserId.delete(id);
      busy = false;
      const dmInfo = dmResult?.deleted ? ` · 🧹 ${dmResult.deleted} msg deleted` : '';
      console.log(`✅ Removed: ${name}${dmInfo}${dmClosed ? ' · ✖️ DM closed' : ''}`);
      if (row) {
        row.style.transition = 'opacity .25s, transform .25s, max-height .25s, padding .25s';
        row.style.opacity = '0'; row.style.transform = 'translateX(24px)';
        row.style.maxHeight = row.offsetHeight + 'px';
        requestAnimationFrame(() => {
          row.style.maxHeight = '0'; row.style.paddingTop = '0';
          row.style.paddingBottom = '0'; row.style.borderBottom = 'none';
        });
        setTimeout(() => { const top = fListEl.scrollTop; renderFriends(); fListEl.scrollTop = top; }, 260);
      } else {
        updateFriendFooter(`✅ ${name} removed${dmInfo}.`);
      }
    } else {
      busy = false;
      if (btn) { btn.classList.add('err'); btn.textContent = '✕ Failed'; }
      updateFriendFooter(`⚠️ Failed to remove ${name}`);
    }
  }

  async function cleanOneFriendDM(id, btn) {
    if (busy) return;
    const f = friends.find(x => x.id === id);
    if (!f) return;
    const name = displayName(f.user);
    busy = true;
    if (btn) { btn.classList.add('loading'); btn.textContent = '…'; }
    statusEl.textContent = `🧹 Cleaning DM with ${name}…`;

    const wasOpen = dmChannelByUserId.has(id);
    const progress = createProgressOverlay('clean');
    let res = null;
    try { res = await cleanDMWithFriend(f, progress); } catch (e) { console.warn(e); }
    if (res?.skipped) progress.remove();
    else progress.finish(res?.deleted ?? 0, res?.total ?? 0, res?.errors ?? 0, res?.cancelled ?? false);

    if (!wasOpen) {
      const chId = dmChannelByUserId.get(id);
      if (chId) { await closeDMChannel(chId); dmChannelByUserId.delete(id); }
    }
    busy = false;
    if (!box.isConnected) return;
    if (btn?.isConnected) { btn.classList.remove('loading'); btn.textContent = '🧹 Clean'; }

    let msg;
    if (res?.cancelled)        msg = `⛔ Clean cancelled for ${name} — ${res.deleted}/${res.total} deleted.`;
    else if (res?.errors > 0)  msg = `⚠️ ${name}: ${res.deleted}/${res.total} deleted — ${res.errors} error(s).`;
    else if (res?.deleted > 0) msg = `✅ ${name}: 🧹 ${res.deleted} message${res.deleted > 1 ? 's' : ''} deleted.`;
    else                       msg = `ℹ️ ${name}: 0 message sent.`;
    updateFriendFooter(msg);
  }

  fListEl.addEventListener('click', async e => {
    const row = e.target.closest('.dt-row');
    if (!row) return;
    const id = row.dataset.id;

    if (e.target.closest('.dt-av, .dt-name')) { openProfile(id); return; }

    const dmBtn = e.target.closest('.dt-dm');
    if (dmBtn) {
      e.stopPropagation();
      if (dmBtn.classList.contains('loading')) return;
      dmBtn.classList.add('loading');
      try { await openDM(id); } catch {}
      setTimeout(() => { if (dmBtn.isConnected) dmBtn.classList.remove('loading'); }, 400);
      return;
    }

    const clBtn = e.target.closest('.dt-cl');
    if (clBtn) {
      e.stopPropagation();
      if (clBtn.classList.contains('loading')) return;
      if (!clBtn.dataset.armed) {
        clBtn.dataset.armed = '1'; clBtn.classList.add('armed'); clBtn.textContent = '⚠ sure?';
        clBtn._timer = setTimeout(() => {
          if (!clBtn.isConnected) return;
          delete clBtn.dataset.armed; clBtn.classList.remove('armed'); clBtn.textContent = '🧹 Clean';
        }, 3000);
        return;
      }
      clearTimeout(clBtn._timer); delete clBtn.dataset.armed;
      clBtn.classList.remove('armed'); clBtn.textContent = '🧹 Clean';
      await cleanOneFriendDM(id, clBtn);
      return;
    }

    const rmBtn = e.target.closest('.dt-rm');
    if (rmBtn) {
      e.stopPropagation();
      if (rmBtn.classList.contains('loading') || rmBtn.classList.contains('err')) return;
      if (!rmBtn.dataset.armed) {
        rmBtn.dataset.armed = '1'; rmBtn.classList.add('armed'); rmBtn.textContent = '⚠ sure?';
        rmBtn._timer = setTimeout(() => {
          if (!rmBtn.isConnected) return;
          delete rmBtn.dataset.armed; rmBtn.classList.remove('armed'); rmBtn.textContent = '🗑 Remove';
        }, 3000);
        return;
      }
      clearTimeout(rmBtn._timer); delete rmBtn.dataset.armed;
      rmBtn.classList.remove('armed'); rmBtn.textContent = '🗑 Remove';
      await removeOneFriend(id, rmBtn, row);
      return;
    }

    const cb = row.querySelector('.dt-cb');
    if (e.target !== cb) cb.checked = !cb.checked;
    cb.checked ? selectedFriends.add(id) : selectedFriends.delete(id);
    row.classList.toggle('sel', cb.checked);
    updateFriendFooter();
  });

  ['dt-f-q', 'dt-f-sort', 'dt-f-from', 'dt-f-to', 'dt-f-av'].forEach(id => {
    $(id).addEventListener(id === 'dt-f-q' ? 'input' : 'change', () => { saveCurrentPrefs(); renderFriends(); });
  });
  $('dt-f-dir').onclick = e => {
    sortDirFriend = sortDirFriend === 'desc' ? 'asc' : 'desc';
    e.currentTarget.textContent = sortDirFriend === 'desc' ? '↓' : '↑';
    saveCurrentPrefs(); renderFriends();
  };
  $('dt-f-selall').onchange = e => {
    if (e.target.checked) visibleFriends.forEach(f => selectedFriends.add(f.id));
    else visibleFriends.forEach(f => selectedFriends.delete(f.id));
    renderFriends();
  };
  box.querySelectorAll('#dt-f-chips .dt-chip').forEach(chip => {
    chip.onclick = () => {
      box.querySelectorAll('#dt-f-chips .dt-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      activeChipFriend = chip.dataset.chip;
      saveCurrentPrefs(); renderFriends();
    };
  });

  // ════════════════════════════════════════════════════════
  //  GROUPS TAB
  // ════════════════════════════════════════════════════════
  const selectedGroups = new Set();
  const getVisibleGroups = () => {
    const q = $('dt-g-q').value.trim().toLowerCase();
    const ic = $('dt-g-ic').value;
    const from = $('dt-g-from').value ? new Date($('dt-g-from').value + 'T00:00:00') : null;
    const to   = $('dt-g-to').value   ? new Date($('dt-g-to').value + 'T23:59:59') : null;
    const l = groups.filter(g => {
      if (q && !(`${g.name} ${g.members} ${g.id}`.toLowerCase().includes(q))) return false;
      if (from && g.created < from) return false;
      if (to && g.created > to) return false;
      if (ic === 'def' && g.icon) return false;
      if (ic === 'custom' && !g.icon) return false;
      if (activeChipGroup === 'solo'     && !g.solo)       return false;
      if (activeChipGroup === 'named'    && !g.named)      return false;
      if (activeChipGroup === 'inactive' && !isInactive(g)) return false;
      if (activeChipGroup === 'new'      && !isNewGroup(g)) return false;
      if (activeChipGroup === 'old'      && !isOldGroup(g)) return false;
      return true;
    });
    const key = $('dt-g-sort').value;
    const m = sortDirGroup === 'asc' ? 1 : -1;
    const val = {
      created:  g => g.created.getTime(),
      activity: g => g.last?.getTime() ?? 0,
      members:  g => g.size,
    };
    l.sort((a, b) => key === 'name'
      ? m * a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
      : m * (val[key](a) - val[key](b)));
    return l;
  };

  const groupRowHtml = g => {
    const badges = badgesForGroup(g).map(b =>
      `<span class="dt-badge" title="${esc(b.label)}" style="color:${b.color};background:${b.color}20;border:1px solid ${b.color}55">${b.icon}</span>`
    ).join('');
    const av = g.icon
      ? `<img class="dt-av" loading="lazy" src="${iconUrl(g)}" title="Open group">`
      : `<div class="dt-av dt-av-ph ${g.solo ? 'solo' : ''}" title="Open group">👥</div>`;
    return `<div class="dt-row ${selectedGroups.has(g.id) ? 'sel' : ''}" data-id="${g.id}">
      <input type="checkbox" class="dt-cb" ${selectedGroups.has(g.id) ? 'checked' : ''}>
      ${av}
      <div class="dt-info">
        <div class="dt-name" title="Open group">${esc(g.name)}</div>
        <div class="dt-sub">${g.size} member${g.size > 1 ? 's' : ''} · Created ${fmtDate(g.created)} (${fmtRelative(g.created)}) · Last activity ${g.last ? fmtRelative(g.last) : 'unknown'}</div>
      </div>
      <div class="dt-badges">${badges}</div>
      <div class="dt-actions">
<button class="dt-open" title="Open group"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="7" y1="17" x2="17" y2="7"/><polyline points="7 7 17 7 17 17"/></svg></button>
        <button class="dt-rm" title="Leave this group (click twice)">🚪 Leave</button>
      </div>
    </div>`;
  };

  const updateGroupFooter = (msg) => {
    const sa = $('dt-g-selall');
    if (sa) {
      const n = visibleGroups.filter(g => selectedGroups.has(g.id)).length;
      sa.checked = visibleGroups.length > 0 && n === visibleGroups.length;
      sa.indeterminate = n > 0 && n < visibleGroups.length;
    }
    $('dt-gcount').textContent = groups.length;
    if (activeTab === 'groups') {
      delBtn.disabled = busy || selectedGroups.size === 0;
      delBtn.textContent = `🚪 Leave selected (${selectedGroups.size})`;
      const solo = groups.filter(g => g.solo).length;
      statusEl.textContent = msg ?? `${visibleGroups.length} shown / ${groups.length} group(s)${solo ? ` (${solo} solo)` : ''} · ${selectedGroups.size} selected`;
    }
  };

  const renderGroups = () => {
    visibleGroups = getVisibleGroups();
    gListEl.innerHTML = visibleGroups.length ? visibleGroups.map(groupRowHtml).join('')
      : `<div class="dt-empty">${groups.length === 0 ? "You're not in any group DM 🎉" : 'No groups match the filters.'}</div>`;
    updateGroupFooter();
  };

  async function askGroupChoice({ count, totalMsgCount, individualName }) {
    const found = individualName ? count : totalMsgCount;
    const title = individualName ? `Leave ${individualName}?` : `Leave ${count} group${count > 1 ? 's' : ''}?`;
    const baseMsg = individualName
      ? `You're about to leave <b style="color:#fff">${esc(individualName)}</b>.`
      : `You're about to leave <b style="color:#fff">${count}</b> group${count > 1 ? 's' : ''}.`;
    const scope = individualName ? 'in this group' : 'in these groups';
    const each  = individualName ? '' : ' of each group';
    const hint = found > 0
      ? `At least <b style="color:#fff">${found}</b> message${found > 1 ? 's' : ''} from you found among the latest 100${each}.`
      : `No message from you among the latest 100${each} — older ones may still exist.`;

    return await choiceDialog({
      title,
      message: `${baseMsg}<br><br>
                Do you also want to <b style="color:#fff">delete all your messages</b> ${scope} before leaving?<br>
                <span style="color:#949ba4;font-size:12px">${hint}<br>
                Messages must be deleted <i>before</i> leaving — once you've left, you can no longer delete them.</span><br><br>
                <span style="color:#faa61a">⚠️ This cannot be undone.</span>`,
      choices: [
        { label: 'Cancel',                     value: 'cancel' },
        { label: '🚪 Leave only',              value: 'plain'  },
        { label: '🧹 Delete messages + leave', value: 'clean', danger: true },
      ],
    });
  }

  async function cleanGroupMessages(group, progress) {
    return await cleanChannelMessages(group, progress, group.name);
  }

  async function leaveOneGroupWithChoice(group, silent) {
    const count = await quickCountMyMessages(group.id);
    const action = await askGroupChoice({ count, individualName: group.name });
    if (action === 'cancel') return { status: 'cancelled', deleted: 0 };

    let deleted = 0;
    if (action === 'clean') {
      const progress = createProgressOverlay('clean', silent);
      let res = null;
      try { res = await cleanGroupMessages(group, progress); } catch (e) { console.warn(e); }
      progress.finish(res?.deleted ?? 0, res?.total ?? 0, res?.errors ?? 0, res?.cancelled ?? false);
      deleted = res?.deleted ?? 0;

      if (res?.cancelled) return { status: 'cancelled', deleted };
      if (res && res.errors > 0) {
        const choice = await choiceDialog({
          title: `Some messages couldn't be deleted`,
          message: `<b style="color:#fff">${res.deleted}/${res.total}</b> deleted — <b style="color:#faa61a">${res.errors} error${res.errors > 1 ? 's' : ''}</b>.<br><br>
                    Still leave <b style="color:#fff">${esc(group.name)}</b>?`,
          choices: [
            { label: '❌ Stay in group', value: 'keep'  },
            { label: '🚪 Leave anyway',  value: 'leave', danger: true },
          ],
        });
        if (choice !== 'leave') return { status: 'cancelled', deleted };
      }
    }
    const ok = await leaveGroupAPI(group, silent);
    return { status: ok ? 'left' : 'failed', deleted };
  }

  const logLeftGroup = (g, { deleted = 0, silent }) => pushHistory({
    kind: 'group',
    id: g.id, name: g.name, iconUrl: iconUrl(g), size: g.size, solo: g.solo,
    leftAt: Date.now(), msgDeleted: deleted, silent: !!silent,
    createdTs: g.created.getTime(),
  });

  async function leaveOneGroupRow(id, btn, row) {
    if (busy) return;
    const g = groups.find(x => x.id === id);
    if (!g) return;
    busy = true;
    if (btn) { btn.classList.add('loading'); btn.textContent = '…'; }
    statusEl.textContent = `🔍 Checking your messages in ${g.name}…`;

    const silent = silentCb.checked;
    const res = await leaveOneGroupWithChoice(g, silent);
    busy = false;
    if (!box.isConnected) return;

    if (res.status === 'cancelled') {
      if (btn) { btn.classList.remove('loading'); btn.textContent = '🚪 Leave'; }
      updateGroupFooter();
      return;
    }
    if (res.status === 'left') {
      logLeftGroup(g, { deleted: res.deleted, silent });
      groups = groups.filter(x => x.id !== id);
      selectedGroups.delete(id);
      const info = res.deleted ? ` · 🧹 ${res.deleted} msg deleted` : '';
      if (row) {
        row.style.transition = 'opacity .25s, transform .25s, max-height .25s, padding .25s';
        row.style.opacity = '0'; row.style.transform = 'translateX(24px)';
        row.style.maxHeight = row.offsetHeight + 'px';
        requestAnimationFrame(() => {
          row.style.maxHeight = '0'; row.style.paddingTop = '0';
          row.style.paddingBottom = '0'; row.style.borderBottom = 'none';
        });
        setTimeout(() => { const top = gListEl.scrollTop; renderGroups(); gListEl.scrollTop = top; updateGroupFooter(`✅ ${g.name} left${info}.`); }, 260);
      } else {
        renderGroups(); updateGroupFooter(`✅ ${g.name} left${info}.`);
      }
    } else {
      if (btn) { btn.classList.remove('loading'); btn.classList.add('err'); btn.textContent = '✕ Failed'; }
      updateGroupFooter(`⚠️ Failed to leave ${g.name}`);
    }
  }

  gListEl.addEventListener('click', async e => {
    const row = e.target.closest('.dt-row');
    if (!row) return;
    const id = row.dataset.id;

    if (e.target.closest('.dt-av, .dt-name, .dt-open')) { navigateToChannel(id); return; }

    const rmBtn = e.target.closest('.dt-rm');
    if (rmBtn) {
      e.stopPropagation();
      if (rmBtn.classList.contains('loading') || rmBtn.classList.contains('err')) return;
      if (!rmBtn.dataset.armed) {
        rmBtn.dataset.armed = '1'; rmBtn.classList.add('armed'); rmBtn.textContent = '⚠ sure?';
        rmBtn._timer = setTimeout(() => {
          if (!rmBtn.isConnected) return;
          delete rmBtn.dataset.armed; rmBtn.classList.remove('armed'); rmBtn.textContent = '🚪 Leave';
        }, 3000);
        return;
      }
      clearTimeout(rmBtn._timer); delete rmBtn.dataset.armed;
      rmBtn.classList.remove('armed'); rmBtn.textContent = '🚪 Leave';
      await leaveOneGroupRow(id, rmBtn, row);
      return;
    }

    const cb = row.querySelector('.dt-cb');
    if (e.target !== cb) cb.checked = !cb.checked;
    cb.checked ? selectedGroups.add(id) : selectedGroups.delete(id);
    row.classList.toggle('sel', cb.checked);
    updateGroupFooter();
  });

  ['dt-g-q', 'dt-g-sort', 'dt-g-from', 'dt-g-to', 'dt-g-ic'].forEach(id => {
    $(id).addEventListener(id === 'dt-g-q' ? 'input' : 'change', () => { saveCurrentPrefs(); renderGroups(); });
  });
  $('dt-g-dir').onclick = e => {
    sortDirGroup = sortDirGroup === 'desc' ? 'asc' : 'desc';
    e.currentTarget.textContent = sortDirGroup === 'desc' ? '↓' : '↑';
    saveCurrentPrefs(); renderGroups();
  };
  $('dt-g-selall').onchange = e => {
    if (e.target.checked) visibleGroups.forEach(g => selectedGroups.add(g.id));
    else visibleGroups.forEach(g => selectedGroups.delete(g.id));
    renderGroups();
  };
  box.querySelectorAll('#dt-g-chips .dt-chip').forEach(chip => {
    chip.onclick = () => {
      box.querySelectorAll('#dt-g-chips .dt-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      activeChipGroup = chip.dataset.chip;
      saveCurrentPrefs(); renderGroups();
    };
  });

  // ════════════════════════════════════════════════════════
  //  NOT FRIENDS TAB
  // ════════════════════════════════════════════════════════
  const selectedNotFriends = new Set();

  const getVisibleNotFriends = () => {
    const q = $('dt-n-q').value.trim().toLowerCase();
    let l = notFriends.filter(n => {
      const u = n.user;
      if (q && !(`${u.username} ${u.global_name ?? ''} ${n.id}`.toLowerCase().includes(q))) return false;
      if (activeChipNotFriends === 'withmsg' && notFriendsMsgMode === 'with'    && !(n.count > 0))  return false;
      if (activeChipNotFriends === 'withmsg' && notFriendsMsgMode === 'without' && !(n.count === 0 && n.anyMessage)) return false;
      if (activeChipNotFriends === 'empty'    && !(n.count === 0 && !n.anyMessage))     return false;
      if (activeChipNotFriends === 'newacct'  && !isNewAccount({ created: n.created })) return false;
      if (activeChipNotFriends === 'noavatar' && u.avatar)                              return false;
      return true;
    });
    const key = $('dt-n-sort').value;
    const m = sortDirNotFriends === 'asc' ? 1 : -1;
    const val = {
      lastdm:  n => n.last?.getTime() ?? (m === 1 ? Infinity : -Infinity),
      created: n => n.created.getTime(),
      count:   n => n.count < 0 ? -1 : n.count,
    };
    l.sort((a, b) => key === 'name'
      ? m * displayName(a.user).localeCompare(displayName(b.user), undefined, { sensitivity: 'base' })
      : m * (val[key](a) - val[key](b)));
    return l;
  };

  const notFriendRowHtml = n => {
    const u = n.user;
    const badges = badgesForNotFriend(n).map(b =>
      `<span class="dt-badge" title="${esc(b.label)}" style="color:${b.color};background:${b.color}20;border:1px solid ${b.color}55">${b.icon}</span>`
    ).join('');
    const countTxt = n.count < 0 ? '…' : n.count;
    return `<div class="dt-row ${selectedNotFriends.has(n.id) ? 'sel' : ''}" data-id="${n.id}">
      <input type="checkbox" class="dt-cb" ${selectedNotFriends.has(n.id) ? 'checked' : ''}>
      <img class="dt-av" loading="lazy" src="${avatarUrl(u)}" title="View profile">
      <div class="dt-info">
        <div class="dt-name" title="View profile">${esc(displayName(u))}<span>@${esc(u.username)}</span></div>
        <div class="dt-sub">💬 ${countTxt} message(s) from you · Last DM ${n.last ? fmtRelative(n.last) : 'unknown'} · Account created ${fmtDate(n.created)}</div>
      </div>
      <div class="dt-badges">${badges}</div>
      <div class="dt-actions">
<button class="dt-dm" title="Open DM"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="7" y1="17" x2="17" y2="7"/><polyline points="7 7 17 7 17 17"/></svg></button>
        <button class="dt-cl" title="Delete all your messages and close the DM (click twice)">🧹 Clean</button>
      </div>
    </div>`;
  };

  const updateNotFriendsFooter = (msg) => {
    const sa = $('dt-n-selall');
    if (sa) {
      const k = visibleNotFriends.filter(n => selectedNotFriends.has(n.id)).length;
      sa.checked = visibleNotFriends.length > 0 && k === visibleNotFriends.length;
      sa.indeterminate = k > 0 && k < visibleNotFriends.length;
    }
    $('dt-ncount').textContent = notFriends.length;
    if (activeTab === 'notfriends') {
      delBtn.disabled = busy || selectedNotFriends.size === 0;
      delBtn.textContent = `🧹 Clean + close (${selectedNotFriends.size})`;
      statusEl.textContent = msg ?? `${visibleNotFriends.length} shown / ${notFriends.length} non-friend DM(s) · ${selectedNotFriends.size} selected`;
    }
  };

  const renderNotFriends = () => {
    visibleNotFriends = getVisibleNotFriends();
    nListEl.innerHTML = visibleNotFriends.length ? visibleNotFriends.map(notFriendRowHtml).join('')
      : `<div class="dt-empty">${notFriends.length === 0 ? 'No DMs with non-friends 🎉' : 'No conversations match the filters.'}</div>`;
    updateNotFriendsFooter();
  };


  // ── Not Friends: full scan state ──
  let notFriendsScanState = 'idle'; // 'idle' | 'running' | 'done'
  let _nScanRunning = false;
  let _nScanDone = 0, _nScanTotal = 0;
  let _nScanFill = null, _nScanText = null;

  function renderNotFriendsProgress() {
    const pct = _nScanTotal > 0 ? Math.round((_nScanDone / _nScanTotal) * 100) : 0;
    nListEl.innerHTML = `
      <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:60px 20px;gap:16px;color:#b5bac1;font-size:13px">
        <div style="font-size:15px;font-weight:600;color:#fff">Scanning your DMs…</div>
        <div style="width:80%;max-width:420px;height:8px;background:#1e1f22;border-radius:99px;overflow:hidden">
          <div id="dt-n-progress-fill" style="height:100%;width:${pct}%;background:linear-gradient(90deg,#5865f2,#8891ff);border-radius:99px;transition:width .25s ease"></div>
        </div>
        <div id="dt-n-progress-text" style="font-size:12px;color:#949ba4">${_nScanDone} / ${_nScanTotal}</div>
      </div>`;
    _nScanFill = document.getElementById('dt-n-progress-fill');
    _nScanText = document.getElementById('dt-n-progress-text');
    lockNotFriendsControls(true);
  }

  function lockNotFriendsControls(locked) {
    const panel = box.querySelector('[data-panel="notfriends"]');
    if (!panel) return;
    const selectors = [
      '#dt-n-q',
      '#dt-n-sort',
      '#dt-n-dir',
      '#dt-n-selall',
      '#dt-n-chips .dt-chip',
    ];
    selectors.forEach(sel => {
      panel.querySelectorAll(sel).forEach(el => {
        el.disabled = locked;
        el.style.pointerEvents = locked ? 'none' : '';
        el.style.opacity = locked ? '0.45' : '';
        el.style.cursor = locked ? 'not-allowed' : '';
      });
    });
  }

  async function scanAllNotFriends() {
    if (_nScanRunning) return;
    _nScanRunning = true;
    notFriendsScanState = 'running';

    _nScanDone = 0;
    _nScanTotal = notFriends.length;

    if (activeTab === 'notfriends') renderNotFriendsProgress();

    for (const n of notFriends) {
      if (!box.isConnected) { _nScanRunning = false; return; }
      const c = await quickCountMyMessages(n.channelId);
      n.count = c;
      try {
        const url = new URL(`${BASE}/channels/${n.channelId}/messages`);
        url.searchParams.set("limit", "1");
        const r2 = await apiFetch(url.toString());
        if (r2.ok) {
          const batch = await r2.json();
          n.anyMessage = batch.length > 0;
        } else {
          n.anyMessage = false;
        }
      } catch { n.anyMessage = false; }
      _nScanDone++;

      if (activeTab === 'notfriends') {
        if (_nScanFill) _nScanFill.style.width = `${Math.round((_nScanDone / _nScanTotal) * 100)}%`;
        if (_nScanText) _nScanText.textContent = `${_nScanDone} / ${_nScanTotal}`;
      }
      await sleep(80);
    }

    notFriendsScanState = 'done';
    _nScanRunning = false;

    lockNotFriendsControls(false);

    if (activeTab === 'notfriends') renderNotFriends();
  }

  function ensureNotFriendsScanned() {
    if (notFriendsScanState === 'done') {
      renderNotFriends();
      return;
    }
    if (notFriendsScanState === 'running') {
      renderNotFriendsProgress();
      return;
    }
    scanAllNotFriends();
  }

  async function cleanOneNotFriend(id, btn) {
    if (busy) return;
    const n = notFriends.find(x => x.id === id);
    if (!n) return;
    const name = displayName(n.user);

    busy = true;
    if (btn) { btn.classList.add('loading'); btn.textContent = '…'; }
    statusEl.textContent = `🧹 Cleaning DM with ${name}…`;

    const progress = createProgressOverlay('clean');
    let res = null;
    try { res = await cleanChannelMessages({ id: n.channelId }, progress, name); }
    catch (e) { console.warn(e); }
    if (res?.skipped) progress.remove();
    else progress.finish(res?.deleted ?? 0, res?.total ?? 0, res?.errors ?? 0, res?.cancelled ?? false);

    statusEl.textContent = `👋 Closing DM with ${name}…`;
    const closed = await closeDMChannel(n.channelId);

    pushHistory({
      kind: 'notfriend',
      id: n.id,
      username: n.user.username,
      global_name: n.user.global_name || null,
      avatarUrl: avatarUrl(n.user),
      removedAt: Date.now(),
      dmDeleted: res?.deleted || 0,
      dmClosed: closed,
    });

    notFriends = notFriends.filter(x => x.id !== id);
    selectedNotFriends.delete(id);
    busy = false;
    if (!box.isConnected) return;
    if (btn?.isConnected) { btn.classList.remove('loading'); btn.textContent = '🧹 Clean'; }

    let msg;
    if (res?.cancelled)        msg = `⛔ Clean cancelled for ${name} — ${res.deleted}/${res.total} deleted${closed ? ' · 👋 DM closed' : ''}.`;
    else if (res?.errors > 0)  msg = `⚠️ ${name}: ${res.deleted}/${res.total} deleted — ${res.errors} error(s)${closed ? ' · 👋 DM closed' : ''}.`;
    else if (res?.deleted > 0) msg = `✅ ${name}: 🧹 ${res.deleted} message${res.deleted > 1 ? 's' : ''} deleted${closed ? ' · 👋 DM closed' : ''}.`;
    else                       msg = `ℹ️ ${name}: 0 message sent${closed ? ' · 👋 DM closed' : ''}.`;

    const top = nListEl.scrollTop;
    renderNotFriends();
    nListEl.scrollTop = top;
    updateNotFriendsFooter(msg);
  }

  nListEl.addEventListener('click', async e => {
    const row = e.target.closest('.dt-row');
    if (!row) return;
    const id = row.dataset.id;

    if (e.target.closest('.dt-av, .dt-name')) { openProfile(id); return; }

    const dmBtn = e.target.closest('.dt-dm');
    if (dmBtn) {
      e.stopPropagation();
      if (dmBtn.classList.contains('loading')) return;
      dmBtn.classList.add('loading');
      const nf = notFriends.find(x => x.id === id);
      if (nf) navigateToChannel(nf.channelId);
      setTimeout(() => { if (dmBtn.isConnected) dmBtn.classList.remove('loading'); }, 400);
      return;
    }

    const clBtn = e.target.closest('.dt-cl');
    if (clBtn) {
      e.stopPropagation();
      if (clBtn.classList.contains('loading')) return;
      if (!clBtn.dataset.armed) {
        clBtn.dataset.armed = '1'; clBtn.classList.add('armed'); clBtn.textContent = '⚠ sure?';
        clBtn._timer = setTimeout(() => {
          if (!clBtn.isConnected) return;
          delete clBtn.dataset.armed; clBtn.classList.remove('armed'); clBtn.textContent = '🧹 Clean';
        }, 3000);
        return;
      }
      clearTimeout(clBtn._timer); delete clBtn.dataset.armed;
      clBtn.classList.remove('armed'); clBtn.textContent = '🧹 Clean';
      await cleanOneNotFriend(id, clBtn);
      return;
    }

    const cb = row.querySelector('.dt-cb');
    if (e.target !== cb) cb.checked = !cb.checked;
    cb.checked ? selectedNotFriends.add(id) : selectedNotFriends.delete(id);
    row.classList.toggle('sel', cb.checked);
    updateNotFriendsFooter();
  });

  ['dt-n-q', 'dt-n-sort'].forEach(id => {
    $(id).addEventListener(id === 'dt-n-q' ? 'input' : 'change', () => { saveCurrentPrefs(); renderNotFriends(); });
  });
  $('dt-n-dir').onclick = e => {
    sortDirNotFriends = sortDirNotFriends === 'desc' ? 'asc' : 'desc';
    e.currentTarget.textContent = sortDirNotFriends === 'desc' ? '↓' : '↑';
    saveCurrentPrefs(); renderNotFriends();
  };
  $('dt-n-selall').onchange = e => {
    if (e.target.checked) visibleNotFriends.forEach(n => selectedNotFriends.add(n.id));
    else visibleNotFriends.forEach(n => selectedNotFriends.delete(n.id));
    renderNotFriends();
  };
  box.querySelectorAll('#dt-n-chips .dt-chip').forEach(chip => {
    chip.onclick = () => {
      if (notFriendsScanState === 'running' || _nScanRunning) return;

      const chipName = chip.dataset.chip;

      const alreadyOnThisChip = chip.classList.contains('active');
      if (chipName === 'withmsg' && alreadyOnThisChip && activeChipNotFriends === 'withmsg') {
        notFriendsMsgMode = notFriendsMsgMode === 'with' ? 'without' : 'with';
        const label = document.getElementById('dt-n-msg-label');
        if (label) label.textContent = notFriendsMsgMode === 'with' ? '💬 With my messages' : '🚫 Without my messages';
        saveCurrentPrefs();
        renderNotFriends();
        return;
      }

      box.querySelectorAll('#dt-n-chips .dt-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      activeChipNotFriends = chipName;

      saveCurrentPrefs(); renderNotFriends();
    };
  });

  // ════════════════════════════════════════════════════════
  //  HISTORY TAB (universal)
  // ════════════════════════════════════════════════════════
  const historyRowHtml = h => {
    const isGroup = h.kind === 'group';
    const isNotFriend = h.kind === 'notfriend';
    const name = isGroup ? h.name : (h.global_name || h.username);
    const sub  = (isGroup || isNotFriend) ? null : `@${h.username}`;
    const tags = [];

    if (isGroup) {
      tags.push(`<span class="dt-hist-tag group">👥 Group</span>`);
      if (h.msgDeleted > 0) tags.push(`<span class="dt-hist-tag green">🧹 ${h.msgDeleted} msg deleted</span>`);
      else tags.push(`<span class="dt-hist-tag grey">Messages kept</span>`);
      tags.push(h.silent ? `<span class="dt-hist-tag">🔇 silent</span>` : `<span class="dt-hist-tag orange">🔔 notified</span>`);
      tags.push(`<span class="dt-hist-tag grey">👥 ${h.size} member${h.size > 1 ? 's' : ''}</span>`);
    } else if (isNotFriend) {
      if (h.dmDeleted > 0) {
        tags.push(`<span class="dt-hist-tag notfriend">💬 Not-friend</span>`);
        tags.push(`<span class="dt-hist-tag green">🧹 ${h.dmDeleted} msg deleted</span>`);
        if (h.dmClosed) tags.push(`<span class="dt-hist-tag">👋 DM closed</span>`);
      } else {
        if (h.dmClosed) tags.push(`<span class="dt-hist-tag">👋 DM closed</span>`);
        else tags.push(`<span class="dt-hist-tag notfriend">💬 Not-friend</span>`);
      }
    } else {
      tags.push(`<span class="dt-hist-tag friend">👤 Friend</span>`);
      if (h.dmDeleted > 0) tags.push(`<span class="dt-hist-tag green">🧹 ${h.dmDeleted} msg deleted</span>`);
      else if (h.cleaned) tags.push(`<span class="dt-hist-tag green">🧹 DM cleaned</span>`);
      else tags.push(`<span class="dt-hist-tag grey">DMs kept</span>`);
      if (h.dmClosed) tags.push(`<span class="dt-hist-tag">👋 DM closed</span>`);
      if (h.friendSince) tags.push(`<span class="dt-hist-tag orange" title="Was friends since ${fmtDateTime(h.friendSince)}">📅 ${fmtTsRelative(h.friendSince)}</span>`);
    }

    const av = isGroup
      ? (h.iconUrl
          ? `<img class="dt-av" style="cursor:default" loading="lazy" src="${h.iconUrl}" onerror="this.style.opacity=.4">`
          : `<div class="dt-av dt-av-ph ${h.solo ? 'solo' : ''}" style="cursor:default">👥</div>`)
      : `<img class="dt-av" loading="lazy" src="${h.avatarUrl}" onerror="this.style.opacity=.4" title="View profile">`;

    const ts = h.removedAt || h.leftAt;
    const action = isGroup ? 'Left' : (isNotFriend ? 'Cleaned' : 'Removed');
const actions = isGroup ? '' : `<button class="dt-dm dt-h-view" title="Open profile"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="7" y1="17" x2="17" y2="7"/><polyline points="7 7 17 7 17 17"/></svg></button>`;

    return `<div class="dt-row dt-hrow" data-id="${h.id}" data-kind="${h.kind}">
      ${av}
      <div class="dt-info">
        <div class="dt-name" style="cursor:default;text-decoration:none">${esc(name)}${sub ? `<span>${esc(sub)}</span>` : ''}</div>
        <div class="dt-hist-meta">${tags.join('')}</div>
        <div class="dt-hist-date">${action} ${fmtTsRelative(ts)} · ${fmtDateTime(ts)}</div>
      </div>
      <div class="dt-actions">${actions}</div>
    </div>`;
  };

  function renderHistory() {
    const hq = $('dt-hq').value.trim().toLowerCase();
    const hf = $('dt-hfilter').value;
    const list = history.filter(h => {
      if (hf !== 'all' && h.kind !== hf) return false;
      if (!hq) return true;
      const name = h.kind === 'group' ? h.name : `${h.username} ${h.global_name || ''}`;
      return `${name} ${h.id}`.toLowerCase().includes(hq);
    });
    hListEl.innerHTML = list.length
      ? list.map(historyRowHtml).join('')
      : `<div class="dt-empty">${history.length === 0 ? 'No history yet — removed friends, left groups and cleaned non-friend DMs will appear here.' : 'No entries match your filters.'}</div>`;
    $('dt-hcount').textContent = history.length;
    const totalMsg = history.reduce((s, h) => s + (h.dmDeleted || h.msgDeleted || 0), 0);
    const friendCount = history.filter(h => h.kind === 'friend').length;
    const groupCount  = history.filter(h => h.kind === 'group').length;
    const nfCount     = history.filter(h => h.kind === 'notfriend').length;
    $('dt-hstats').textContent = history.length > 0
      ? `${friendCount}👤 · ${groupCount}👥 · ${nfCount}💬 · 🧹 ${totalMsg} msg`
      : '';
  }

  hListEl.addEventListener('click', e => {
    const row = e.target.closest('.dt-row');
    if (!row) return;
    const id = row.dataset.id, kind = row.dataset.kind;
    if ((kind === 'friend' || kind === 'notfriend') && e.target.closest('.dt-h-view, .dt-av, .dt-name')) openProfile(id);
  });

  $('dt-hq').addEventListener('input', renderHistory);
  $('dt-hfilter').addEventListener('change', renderHistory);
  $('dt-hclear').onclick = async () => {
    if (history.length === 0) return;
    const v = await choiceDialog({
      title: 'Clear history?',
      message: `This will clear <b style="color:#fff">${history.length}</b> entr${history.length > 1 ? 'ies' : 'y'} from your history.<br><br>
                <span style="color:#949ba4;font-size:12px">Only the local log is erased.</span><br><br>
                <span style="color:#faa61a">⚠️ This cannot be undone.</span>`,
      choices: [
        { label: 'Cancel',   value: 'cancel' },
        { label: '🗑 Clear', value: 'clear', danger: true },
      ],
    });
    if (v === 'clear') { clearHistory(); renderHistory(); }
  };

  // ════════════════════════════════════════════════════════
  //  BULK ACTIONS (depend on active tab)
  // ════════════════════════════════════════════════════════
  delBtn.onclick = async () => {
    if (busy) return;
    if (activeTab === 'friends')     return bulkRemoveFriends();
    if (activeTab === 'groups')      return bulkLeaveGroups();
    if (activeTab === 'notfriends')  return bulkCleanNotFriends();
  };

  async function bulkRemoveFriends() {
    if (!selectedFriends.size) return;
    const targets = friends.filter(f => selectedFriends.has(f.id));
    const n = targets.length;
    busy = true; delBtn.disabled = true;

    statusEl.textContent = `🔍 Checking your messages in ${n} DM(s)…`;
    const checkedTargets = [];
    let totalMsgCount = 0;
    for (const f of targets) {
      let channelId = null;
      try { channelId = await resolveDMChannel(f.id); } catch {}
      let count = 0;
      if (channelId) count = await quickCountMyMessages(channelId);
      totalMsgCount += count;
      checkedTargets.push({ friend: f, msgCount: count, channelId });
    }
    busy = false;
    if (!box.isConnected) return;

    const action = await askFriendChoice({ count: n, totalMsgCount });
    if (action === 'cancel') { updateFriendFooter(); return; }
    const doClean = action === 'clean';

    busy = true; delBtn.disabled = true;
    const progress = createProgressOverlay('remove');
    progress.setGlobal(0, n, '', 0);

    let okCount = 0, errCount = 0, dmDeletedTotal = 0, closedCount = 0;
    let skippedDueToCleanErrors = 0, cancelledMidway = false;
    const startTime = Date.now();

    for (const { friend: f, channelId } of checkedTargets) {
      if (progress.isCancelled() || !box.isConnected) { cancelledMidway = true; break; }
      const fname = displayName(f.user);
      let dmResult = null;

      if (doClean) {
        // Pass a wrapper that redirects updates to the secondary bar
        const cleanProgress = {
          setMode: (m) => progress.setMode(m),
          update: (done, total, name, err) => {
            progress.setCleanProgress(done, total, fname, err);
          },
          setRateLimit: (waitMs, attempt, max) => progress.setRateLimit(waitMs, attempt, max),
          clearRateLimit: () => progress.clearRateLimit(),
          isCancelled: () => progress.isCancelled(),
        };
        try { dmResult = await cleanDMWithFriend(f, cleanProgress); } catch {}
        progress.setCleanProgress(0, 0, '', 0);
      }
      if (dmResult?.cancelled) { skippedDueToCleanErrors++; cancelledMidway = true; break; }

      if (dmResult && dmResult.errors > 0) {
        const choice = await choiceDialog({
          title: `Clean failed for ${esc(fname)}`,
          message: `<b style="color:#fff">${dmResult.deleted}/${dmResult.total}</b> deleted — <b style="color:#faa61a">${dmResult.errors} error${dmResult.errors > 1 ? 's' : ''}</b>.<br><br>
                    Still remove <b style="color:#fff">${esc(fname)}</b>?`,
          choices: [
            { label: '⏭ Skip this one',  value: 'skip' },
            { label: '🗑 Remove anyway', value: 'remove', danger: true },
          ],
        });
        if (choice !== 'remove') { skippedDueToCleanErrors++; continue; }
      }
      if (dmResult?.deleted) dmDeletedTotal += dmResult.deleted;

      progress.setMode('remove');
      progress.setGlobal(okCount, n, fname, errCount);
      try {
        const ok = await removeFriendAPI(f.id, ({ waitMs, attempt, max }) => {
          progress.setRateLimit(waitMs, attempt, max);
        });
        progress.clearRateLimit();
        if (ok) {
          okCount++;
          let dmClosed = false;
          if (channelId) { dmClosed = await closeDMChannel(channelId); if (dmClosed) closedCount++; }
          pushHistory({
            kind: 'friend', id: f.id, username: f.user.username, global_name: f.user.global_name || null,
            avatarUrl: avatarUrl(f.user), removedAt: Date.now(),
            cleaned: !!(dmResult?.deleted || dmResult?.total), dmDeleted: dmResult?.deleted || 0,
            dmClosed, friendSince: f.since ? f.since.getTime() : null,
          });
          friends = friends.filter(x => x.id !== f.id);
          friendIds.delete(f.id);
          selectedFriends.delete(f.id);
          dmChannelByUserId.delete(f.id);
        } else errCount++;
      } catch { errCount++; }
      // Update the bar AFTER incrementing counters
      progress.setGlobal(okCount, n, '', errCount);
      await sleep((errCount > 0 ? 1400 : 900) + Math.random() * 400);
    }

    progress.finish(okCount, n, errCount, progress.isCancelled() || cancelledMidway);
    busy = false;
    if (!box.isConnected) return;
    const top = fListEl.scrollTop; renderFriends(); fListEl.scrollTop = top;
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

    const bits = [`${okCount} removed`];
    if (errCount) bits.push(`${errCount} error(s)`);
    if (skippedDueToCleanErrors) bits.push(`${skippedDueToCleanErrors} skipped`);
    if (doClean && dmDeletedTotal > 0) bits.push(`🧹 ${dmDeletedTotal} DM msg deleted`);
    if (closedCount > 0) bits.push(`👋 ${closedCount} DM closed`);
    updateFriendFooter(`${progress.isCancelled() || cancelledMidway ? '⛔ Cancelled' : '✅ Done'} — ${bits.join(', ')} in ${elapsed}s.`);
  }

  async function bulkLeaveGroups() {
    if (!selectedGroups.size) return;
    const targets = groups.filter(g => selectedGroups.has(g.id));
    const n = targets.length;
    busy = true; delBtn.disabled = true;

    let totalMsgCount = 0;
    for (let i = 0; i < n; i++) {
      statusEl.textContent = `🔍 Checking your messages… ${i + 1}/${n}`;
      totalMsgCount += await quickCountMyMessages(targets[i].id);
    }
    busy = false;
    if (!box.isConnected) return;

    const action = await askGroupChoice({ count: n, totalMsgCount });
    if (action === 'cancel') { updateGroupFooter(); return; }
    const doClean = action === 'clean';
    const silent = silentCb.checked;

    busy = true; delBtn.disabled = true;
    const progress = createProgressOverlay('leave', silent);
    progress.setGlobal(0, n, '', 0);

    let left = 0, errors = 0, skipped = 0, msgsDeleted = 0, cancelledMidway = false;
    const startTime = Date.now();

    for (const g of targets) {
      if (progress.isCancelled() || !box.isConnected) { cancelledMidway = true; break; }
      let res = null;
      if (doClean) {
        progress.setMode('clean');
        progress.setGlobal(left, n, `🔍 ${g.name}`, errors);
        const cleanProgress = {
          setMode: (m) => progress.setMode(m),
          update: (done, total, name, err) => {
            progress.setCleanProgress(done, total, g.name, err);
          },
          setRateLimit: (waitMs, attempt, max) => progress.setRateLimit(waitMs, attempt, max),
          clearRateLimit: () => progress.clearRateLimit(),
          isCancelled: () => progress.isCancelled(),
        };
        try { res = await cleanGroupMessages(g, cleanProgress); } catch {}
        progress.setCleanProgress(0, 0, '', 0);
        progress.clearRateLimit();

        if (res?.cancelled) { skipped++; cancelledMidway = true; break; }

        if (res && res.errors > 0) {
          const choice = await choiceDialog({
            title: `Clean failed for ${g.name}`,
            message: `<b style="color:#fff">${res.deleted}/${res.total}</b> deleted — <b style="color:#faa61a">${res.errors} error${res.errors > 1 ? 's' : ''}</b>.<br><br>
                      Still leave <b style="color:#fff">${esc(g.name)}</b>?`,
            choices: [
              { label: '⏭ Skip this one', value: 'skip'  },
              { label: '🚪 Leave anyway', value: 'leave', danger: true },
            ],
          });
          if (choice !== 'leave') { skipped++; continue; }
        }
        msgsDeleted += res?.deleted ?? 0;
      }

      progress.setMode('leave');
      progress.setGlobal(left, n, g.name, errors);

      if (await leaveGroupAPI(g, silent)) {
        left++;
        logLeftGroup(g, { deleted: res?.deleted ?? 0, silent });
        groups = groups.filter(x => x.id !== g.id);
        selectedGroups.delete(g.id);
      } else errors++;
      // Update the bar AFTER incrementing counters
      progress.setGlobal(left, n, '', errors);
      await sleep(600 + Math.random() * 200);
    }

    const wasCancelled = progress.isCancelled() || cancelledMidway;
    progress.setMode('leave');
    progress.finish(left, n, errors, wasCancelled);
    busy = false;
    if (!box.isConnected) return;
    const top = gListEl.scrollTop; renderGroups(); gListEl.scrollTop = top;

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    const bits = [`${left} left`];
    if (errors) bits.push(`${errors} error(s)`);
    if (skipped) bits.push(`${skipped} skipped`);
    if (doClean && msgsDeleted > 0) bits.push(`🧹 ${msgsDeleted} msg deleted`);
    updateGroupFooter(`${wasCancelled ? '⛔ Cancelled' : '✅ Done'} — ${bits.join(', ')} in ${elapsed}s.`);
  }

  async function bulkCleanNotFriends() {
    if (!selectedNotFriends.size) return;
    const targets = notFriends.filter(n => selectedNotFriends.has(n.id));
    const n = targets.length;

    const v = await choiceDialog({
      title: `Clean ${n} conversation${n > 1 ? 's' : ''}?`,
      message: `You're about to <b style="color:#fff">delete all your messages</b> in these ${n} DM(s) with non-friends, and <b style="color:#fff">close</b> them.<br><br>
                <span style="color:#faa61a">⚠️ This cannot be undone.</span>`,
      choices: [
        { label: 'Cancel',           value: 'cancel' },
        { label: '🧹 Clean + close', value: 'go', danger: true },
      ],
    });
    if (v !== 'go') return;

    busy = true; delBtn.disabled = true;
    const progress = createProgressOverlay('clean');
    progress.setGlobal(0, n, '', 0);

    let ok = 0, errors = 0, msgsDeleted = 0, closedCount = 0, cancelledMidway = false;
    const startTime = Date.now();

    for (const nf of targets) {
      if (progress.isCancelled() || !box.isConnected) { cancelledMidway = true; break; }
      const name = displayName(nf.user);

      progress.setMode('clean');
      progress.setGlobal(ok, n, `🔍 ${name}`, errors);

      let res = null;
      const cleanProgress = {
        setMode: (m) => progress.setMode(m),
        update: (done, total, n, err) => {
          progress.setCleanProgress(done, total, name, err);
        },
        setRateLimit: (waitMs, attempt, max) => progress.setRateLimit(waitMs, attempt, max),
        clearRateLimit: () => progress.clearRateLimit(),
        isCancelled: () => progress.isCancelled(),
      };
      try { res = await cleanChannelMessages({ id: nf.channelId }, cleanProgress, name); }
      catch (e) { console.warn(e); }
      progress.setCleanProgress(0, 0, '', 0);
      progress.clearRateLimit();
      if (res?.cancelled) { cancelledMidway = true; break; }
      if (res?.errors > 0) errors++;
      msgsDeleted += res?.deleted ?? 0;

      const closed = await closeDMChannel(nf.channelId);
      if (closed) closedCount++;
      dmChannelByUserId.delete(nf.id);

      pushHistory({
        kind: 'notfriend',
        id: nf.id,
        username: nf.user.username,
        global_name: nf.user.global_name || null,
        avatarUrl: avatarUrl(nf.user),
        removedAt: Date.now(),
        dmDeleted: res?.deleted || 0,
        dmClosed: closed,
      });

      notFriends = notFriends.filter(x => x.id !== nf.id);
      selectedNotFriends.delete(nf.id);
      ok++;

      progress.setGlobal(ok, n, '', errors);
      await sleep(500 + Math.random() * 200);
    }

    const wasCancelled = progress.isCancelled() || cancelledMidway;
    progress.setMode('clean');
    progress.finish(ok, n, errors, wasCancelled);
    busy = false;
    if (!box.isConnected) return;
    const top = nListEl.scrollTop; renderNotFriends(); nListEl.scrollTop = top;

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    const bits = [`${ok} cleaned`];
    if (errors) bits.push(`${errors} error(s)`);
    if (msgsDeleted) bits.push(`🧹 ${msgsDeleted} msg deleted`);
    if (closedCount) bits.push(`👋 ${closedCount} DM closed`);
    updateNotFriendsFooter(`${wasCancelled ? '⛔ Cancelled' : '✅ Done'} — ${bits.join(', ')} in ${elapsed}s.`);
  }

  // ── Initial render ──────────────────────────────────────
  setLoadingStep('Building the interface', 95);
  await sleep(60);
  renderFriends();
  renderGroups();
  notFriendsScanState = 'idle';
  if (activeTab === 'notfriends') renderNotFriendsProgress(); else renderNotFriends();
  renderHistory();
  applyTab();

  setLoadingStep('Ready!', 100);
  setTimeout(() => {
    hideLoadingModal();
  }, 450);

  setTimeout(() => { if (box.isConnected) scanAllNotFriends(); }, 300);

  console.log('%c✅ Discord Tools v1.3 ready — Friends · Groups · Not Friends · History', 'color:green;font-weight:bold;font-size:16px');
  if (history.length > 0) console.log(`📜 ${history.length} entr${history.length > 1 ? 'ies' : 'y'} in universal history`);
};

// Auto-run on first load
window.__dt_run().catch(e => console.error('❌', e.message));