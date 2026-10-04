// ============================================================
//  Discord — Group Manager (leave your group DMs) (v2.0)
//  ✨ Same interface as Friend Remover (window, tabs, filters)
//  ✨ Optional: delete YOUR messages before leaving
//  ✨ Silent toggle (persistent) · Solo filter · Open ↗ button
//  ✨ History tab of recently left groups
// ============================================================
(async () => {
  document.getElementById('__gl_box')?.remove();
  document.getElementById('__gl_style')?.remove();
  document.getElementById('__gl_progress')?.remove();
  document.getElementById('__gl_confirm')?.remove();

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

  async function apiFetch(url, opts = {}) {
    while (true) {
      const r = await fetch(url, { headers: HEADS, ...opts });
      if (r.status === 429) {
        const body = await r.json().catch(() => ({}));
        await sleep((body.retry_after ?? 1) * 1000 + 400);
        continue;
      }
      return r;
    }
  }

  // ── Adaptive delay between deletions ────────────────────
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
  const iconUrl = g => g.icon ? `https://cdn.discordapp.com/channel-icons/${g.id}/${g.icon}.webp?size=64` : null;

  // ── Preferences ─────────────────────────────────────────
  const PREF_KEY = '__gl_prefs_v1';
  const loadPrefs = () => { try { return JSON.parse(localStorage.getItem(PREF_KEY)) || {}; } catch { return {}; } };
  const savePrefs = p => { try { localStorage.setItem(PREF_KEY, JSON.stringify(p)); } catch {} };
  const prefs = loadPrefs();

  const SILENT_KEY = '__group_leaver_silent';
  const loadSilentPref = () => { try { const v = localStorage.getItem(SILENT_KEY); return v === null ? true : v === '1'; } catch { return true; } };
  const saveSilentPref = v => { try { localStorage.setItem(SILENT_KEY, v ? '1' : '0'); } catch {} };

  // ── History storage ─────────────────────────────────────
  const HISTORY_KEY = '__gl_history_v1';
  const HISTORY_MAX = 500;
  let leftLog = [];
  try { leftLog = JSON.parse(localStorage.getItem(HISTORY_KEY)) || []; } catch {}
  const saveHistory = () => {
    try {
      if (leftLog.length > HISTORY_MAX) leftLog = leftLog.slice(0, HISTORY_MAX);
      localStorage.setItem(HISTORY_KEY, JSON.stringify(leftLog));
    } catch {}
  };
  const pushHistory = entry => {
    leftLog = leftLog.filter(h => h.id !== entry.id);
    leftLog.unshift(entry);
    saveHistory();
    const hc = document.getElementById('gl-hcount');
    if (hc) hc.textContent = leftLog.length;
    if (activeTab === 'history') renderHistory();
  };
  const clearHistory = () => {
    leftLog = [];
    saveHistory();
    const hc = document.getElementById('gl-hcount');
    if (hc) hc.textContent = '0';
    if (activeTab === 'history') renderHistory();
  };

  // ── Fetch ME & groups ───────────────────────────────────
  console.log("📥 Fetching profile & groups...");
  const [rMe, rCh] = await Promise.all([
    apiFetch(`${BASE}/users/@me`),
    apiFetch(`${BASE}/users/@me/channels`),
  ]);
  if (!rMe.ok) throw new Error(`Could not fetch profile (${rMe.status}) — invalid token?`);
  if (!rCh.ok) throw new Error(`Could not fetch channels (${rCh.status})`);

  const ME = await rMe.json();
  console.log(`👤 Logged in as ${ME.username} (${ME.id})`);

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
  let groups = (await rCh.json()).filter(ch => ch.type === 3).map(toGroup);
  const groupName = g => g.name;

  const selected = new Set();
  console.log(`  → ${groups.length} group(s), ${groups.filter(g => g.solo).length} where you're the only member · ${leftLog.length} in history`);

  // ── Badges ──────────────────────────────────────────────
  const DAY = 86400000;
  const isNewGroup  = g => (Date.now() - g.created.getTime()) < 30 * DAY;
  const isOldGroup  = g => (Date.now() - g.created.getTime()) > 365 * DAY;
  const isInactive  = g => !g.last || (Date.now() - g.last.getTime()) > 90 * DAY;

  function badgesFor(g) {
    const out = [];
    if (g.solo)         out.push({ icon: '👤', label: "You're the only member",       color: '#faa61a' });
    if (isNewGroup(g))  out.push({ icon: '🆕', label: 'New group (< 30 days)',        color: '#5865f2' });
    if (isOldGroup(g))  out.push({ icon: '⏳', label: 'Group older than a year',      color: '#b5bac1' });
    if (isInactive(g))  out.push({ icon: '💤', label: 'No activity for 90+ days',     color: '#949ba4' });
    return out;
  }

  // ── Navigation ──────────────────────────────────────────
  function navigateToGroup(channelId) {
    const path = `/channels/@me/${channelId}`;
    if (location.pathname === path) return;
    window.history.pushState({}, '', path);
    window.dispatchEvent(new PopStateEvent('popstate', { state: {} }));
    console.log(`🧭 Opening group ${channelId}`);
  }

  // ── Your own messages ───────────────────────────────────
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

  // Quick estimate: only looks at the 100 latest messages
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
          console.warn(`  ⚠️ Network error on msg ${msg.id}:`, e.message);
          await sleep(1500);
          if (++attemptsOther >= 2) { errors++; lastErrorStatus = -1; done = true; }
          continue;
        }

        if (r.status === 204 || r.status === 404) {
          deleted++; delay.onSuccess(); done = true;
        } else if (r.status === 403) {
          attempts403++;
          if (attempts403 < 3) {
            console.warn(`  🔁 403 on msg ${msg.id} — retry ${attempts403}/2 in 1.5s…`);
            await sleep(1500);
          } else {
            console.warn(`  ❌ 403 on msg ${msg.id} — giving up`);
            errors++; lastErrorStatus = 403; done = true;
          }
        } else if (r.status === 429) {
          rateLimits++;
          const body = await r.json().catch(() => ({}));
          delay.onRateLimit(body.retry_after ?? 1);
          hooks.onProgress?.(deleted, total, errors, rateLimits, delay.current);
          await sleep(delay.current);
        } else {
          attemptsOther++;
          if (attemptsOther < 2) {
            console.warn(`  🔁 Status ${r.status} on msg ${msg.id} — retrying…`);
            await sleep(2000);
          } else {
            errors++; lastErrorStatus = r.status; done = true;
          }
        }
      }

      hooks.onProgress?.(deleted, total, errors, rateLimits, 0);
      if (!hooks.isCancelled?.()) await sleep(delay.current);
    }
    return { deleted, errors, rateLimits, total, cancelled: !!hooks.isCancelled?.(), lastErrorStatus };
  }

  async function cleanGroupMessages(group, progress) {
    const label = groupName(group);
    const msgs = await fetchAllMyMessages(group.id);
    if (!msgs.length) {
      console.log(`ℹ️ No messages from you in ${label}.`);
      return { deleted: 0, total: 0, errors: 0, skipped: true, cancelled: false, lastErrorStatus: 0 };
    }
    progress?.setMode('clean');
    const res = await deleteMyMessages(group.id, msgs, {
      isCancelled: () => progress?.isCancelled() ?? false,
      onProgress: (done, total, errors, rateLimits, rateWait) => {
        if (!progress) return;
        progress.update(done, total, `🧹 ${label}`, errors);
        if (rateLimits > 0 && rateWait) progress.setRateLimit(rateWait);
        else progress.clearRateLimit();
      },
    });
    console.log(`🧹 Clean result for ${label}:`, res);
    return { ...res, total: msgs.length };
  }

  // ── Leave a group (API) ─────────────────────────────────
  async function leaveOne(group, silent = true) {
    const name = groupName(group);
    const url  = `${BASE}/channels/${group.id}${silent ? '?silent=true' : ''}`;
    console.log(`🚪 Leaving: ${name} (${group.id}) ${silent ? '🔇' : '🔔'}`);
    const r = await apiFetch(url, { method: "DELETE" });
    if (r.status === 200 || r.status === 204 || r.status === 404) { console.log(`  ✅ Left: ${name}`); return true; }
    console.warn(`  ⚠️  Failed (${r.status}): ${name}`);
    return false;
  }

  // ── Choice dialog ───────────────────────────────────────
  function choiceDialog({ title, message, choices }) {
    return new Promise(resolve => {
      document.getElementById('__gl_confirm')?.remove();
      const ov = document.createElement('div');
      ov.id = '__gl_confirm';
      Object.assign(ov.style, {
        position: 'fixed', inset: '0', background: 'rgba(0,0,0,0.6)',
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

  // ── Ask: leave only, or delete your messages first? ─────
  // Returns 'cancel' | 'plain' | 'clean'
  async function askCleanChoice({ count, totalMsgCount, individualName }) {
    const found = individualName ? count : totalMsgCount;
    const title = individualName ? `Leave ${individualName}?` : `Leave ${count} group${count > 1 ? 's' : ''}?`;
    const baseMsg = individualName
      ? `You're about to leave <b style="color:#fff">${esc(individualName)}</b>.`
      : `You're about to leave <b style="color:#fff">${count}</b> group${count > 1 ? 's' : ''}.`;
    const scope = individualName ? 'in this group' : 'in these groups';
    const each  = individualName ? '' : ' of each group';
    const hint = found > 0
      ? `At least <b style="color:#fff">${found}</b> message${found > 1 ? 's' : ''} from you found among the latest 100${each}.`
      : `No message from you among the latest 100${each} — older ones may still exist (the full history is scanned if you choose to clean).`;

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

  // ── Progress overlay ────────────────────────────────────
  function createProgressOverlay(silent, initialMode = 'leave') {
    document.getElementById('__gl_progress')?.remove();
    const ov = document.createElement('div');
    ov.id = '__gl_progress';
    Object.assign(ov.style, {
      position: 'fixed', bottom: '28px', right: '28px', zIndex: '99999',
      fontFamily: '"gg sans","Noto Sans",sans-serif', background: '#313338',
      borderRadius: '12px', padding: '18px 22px', width: '340px',
      boxShadow: '0 8px 32px rgba(0,0,0,0.6)', color: '#dbdee1', userSelect: 'none',
    });

    let _cancelled = false, _mode = initialMode;
    const RED  = 'linear-gradient(90deg, #da373c, #ff6b6b)';
    const BLUE = 'linear-gradient(90deg, #5865f2, #8891ff)';
    const configs = {
      leave: { icon: '🚪', title: `${silent ? 'Silent' : 'Normal'} leave in progress…`, noun: 'Left',    word: 'group',   done: 'left',    bar: RED  },
      clean: { icon: '🧹', title: 'Deleting your messages…',                            noun: 'Deleted', word: 'message', done: 'deleted', bar: BLUE },
    };

    const titleRow = document.createElement('div');
    Object.assign(titleRow.style, { display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' });
    const titleIcon = document.createElement('span'); titleIcon.style.fontSize = '18px';
    const titleText = document.createElement('span');
    Object.assign(titleText.style, { fontSize: '15px', fontWeight: '700', color: '#fff', flex: '1' });
    const modeBadge = document.createElement('span');
    modeBadge.textContent = silent ? '🔇' : '🔔';
    modeBadge.title = silent ? 'Silent mode enabled' : 'Normal mode — members will be notified';
    Object.assign(modeBadge.style, {
      fontSize: '14px', padding: '2px 6px', borderRadius: '4px', flexShrink: '0',
      background: silent ? 'rgba(35,165,90,0.15)' : 'rgba(250,166,26,0.15)',
      border: `1px solid ${silent ? 'rgba(35,165,90,0.4)' : 'rgba(250,166,26,0.4)'}`,
    });
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
    titleRow.append(titleIcon, titleText, modeBadge, btnClose);

    const statusLine = document.createElement('div');
    Object.assign(statusLine.style, { fontSize: '14px', fontWeight: '600', color: '#fff', marginBottom: '10px', minHeight: '20px' });
    const barTrack = document.createElement('div');
    Object.assign(barTrack.style, { background: '#1e1f22', borderRadius: '99px', height: '8px', overflow: 'hidden', marginBottom: '10px' });
    const barFill = document.createElement('div');
    Object.assign(barFill.style, { height: '100%', width: '0%', borderRadius: '99px', transition: 'width 0.4s ease' });
    barTrack.append(barFill);
    const currentLine = document.createElement('div');
    Object.assign(currentLine.style, { fontSize: '12px', color: '#b5bac1', minHeight: '16px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' });
    const rateLimitLine = document.createElement('div');
    Object.assign(rateLimitLine.style, { fontSize: '12px', color: '#faa61a', marginTop: '4px', minHeight: '16px', fontWeight: '600', display: 'none' });
    ov.append(titleRow, statusLine, barTrack, currentLine, rateLimitLine);
    document.body.append(ov);

    const setMode = mode => {
      _mode = mode;
      const c = configs[mode] || configs.leave;
      titleIcon.textContent = c.icon;
      barFill.style.background = c.bar;
      if (!_cancelled) { titleText.textContent = c.title; titleText.style.color = '#fff'; }
    };
    setMode(initialMode);

    return {
      setMode,
      update: (done, total, name, err = 0) => {
        const noun = configs[_mode]?.noun || 'Done';
        statusLine.textContent = `${noun}: ${done}/${total}${err > 0 ? `  ⚠️ ${err} error${err > 1 ? 's' : ''}` : ''}`;
        barFill.style.width = `${total > 0 ? Math.round((done / total) * 100) : 0}%`;
        currentLine.textContent = name ? `⏳ ${name}` : '';
      },
      setRateLimit: waitMs => {
        rateLimitLine.style.display = 'block';
        rateLimitLine.textContent = `🐢 Rate limited — waiting ${(waitMs / 1000).toFixed(1)}s`;
      },
      clearRateLimit: () => { rateLimitLine.style.display = 'none'; rateLimitLine.textContent = ''; },
      finish: (done, total, err, cancelled = false) => {
        const c = configs[_mode] || configs.leave;
        titleText.textContent = cancelled ? 'Cancelled ⛔' : 'Done ✅';
        titleText.style.color = cancelled ? '#faa61a' : '#23a55a';
        statusLine.textContent = `${done}/${total} ${c.word}${done > 1 ? 's' : ''} ${c.done}${err > 0 ? `  ⚠️ ${err} error${err > 1 ? 's' : ''}` : ''}`;
        barFill.style.background = cancelled ? 'linear-gradient(90deg,#faa61a,#ffcf72)' : 'linear-gradient(90deg,#23a55a,#57f287)';
        barFill.style.width = '100%';
        currentLine.textContent = '';
        rateLimitLine.style.display = 'none';
        setTimeout(() => ov.remove(), 5000);
      },
      remove: () => ov.remove(),
      isCancelled: () => _cancelled,
    };
  }

  // ── Single group: ask → (clean) → leave ─────────────────
  // Returns { status: 'left' | 'failed' | 'cancelled', deleted }
  async function leaveOneWithChoice(group, silent = true) {
    const count  = await quickCountMyMessages(group.id);
    const action = await askCleanChoice({ count, individualName: groupName(group) });
    if (action === 'cancel') return { status: 'cancelled', deleted: 0 };

    let deleted = 0;
    if (action === 'clean') {
      const progress = createProgressOverlay(silent, 'clean');
      let res = null;
      try { res = await cleanGroupMessages(group, progress); }
      catch (e) { console.warn('⚠️ clean error:', e); }
      progress.finish(res?.deleted ?? 0, res?.total ?? 0, res?.errors ?? 0, res?.cancelled ?? false);
      deleted = res?.deleted ?? 0;

      if (res?.cancelled) {
        console.warn(`⛔ Clean cancelled — NOT leaving ${groupName(group)}.`);
        return { status: 'cancelled', deleted };
      }
      if (res && res.errors > 0) {
        const choice = await choiceDialog({
          title: `Some messages couldn't be deleted`,
          message: `<b style="color:#fff">${res.deleted}/${res.total}</b> messages deleted — <b style="color:#faa61a">${res.errors} error${res.errors > 1 ? 's' : ''}</b> (status ${res.lastErrorStatus}).<br><br>
                    Do you still want to leave <b style="color:#fff">${esc(groupName(group))}</b>?`,
          choices: [
            { label: '❌ Stay in group', value: 'keep'  },
            { label: '🚪 Leave anyway',  value: 'leave', danger: true },
          ],
        });
        if (choice !== 'leave') return { status: 'cancelled', deleted };
      }
    }
    const ok = await leaveOne(group, silent);
    return { status: ok ? 'left' : 'failed', deleted };
  }

  const logLeft = (g, { deleted = 0, silent }) => pushHistory({
    id: g.id, name: g.name, iconUrl: iconUrl(g), size: g.size, solo: g.solo,
    leftAt: Date.now(), msgDeleted: deleted, silent: !!silent,
    createdTs: g.created.getTime(),
  });

  // ── Styles ──────────────────────────────────────────────
  const style = document.createElement('style');
  style.id = '__gl_style';
  style.textContent = `
    #__gl_box { position:fixed; top:6vh; left:calc(50% - 400px); width:800px; max-width:96vw; height:88vh;
      background:#313338; color:#dbdee1; border-radius:12px; z-index:1000; display:flex; flex-direction:column;
      font-family:"gg sans","Noto Sans",sans-serif; box-shadow:0 12px 48px rgba(0,0,0,.85),0 0 0 1px rgba(255,255,255,.06); }
    #__gl_box * { box-sizing:border-box; }
    .gl-head { display:flex; align-items:center; padding:10px 14px; cursor:grab; user-select:none; border-bottom:1px solid #1e1f22; flex-shrink:0; gap:6px; }
    .gl-title { font-size:14px; font-weight:700; color:#fff; white-space:nowrap; margin:0 8px; }
    .gl-x { background:transparent; border:none; color:#b5bac1; font-size:16px; cursor:pointer; padding:2px 6px; border-radius:4px; }
    .gl-x:hover { background:#da373c; color:#fff; }
    .gl-min { background:transparent; border:none; color:#b5bac1; cursor:pointer; padding:4px 6px; border-radius:4px; display:flex; align-items:center; }
    .gl-min svg { transition:transform .15s; }
    #__gl_box.min .gl-min svg { transform:rotate(-90deg); }
    .gl-min:hover { background:#4e5058; color:#fff; }
    #__gl_box.min { height:auto; width:520px; }
    #__gl_box.min .gl-body, #__gl_box.min .gl-foot { display:none; }
    #__gl_box.min .gl-head { border-bottom:none; }

    .gl-tabs { display:flex; gap:2px; flex:1; }
    .gl-tab { background:transparent; border:none; color:#949ba4; padding:6px 12px; border-radius:6px; font-size:12px; font-weight:600; cursor:pointer;
      display:flex; align-items:center; gap:6px; transition:all .12s; font-family:inherit; }
    .gl-tab:hover { background:#3a3c43; color:#fff; }
    .gl-tab.active { background:#5865f2; color:#fff; }
    .gl-tabcount { background:rgba(255,255,255,.12); padding:0 6px; border-radius:99px; font-size:10px; font-weight:700; min-width:18px; text-align:center; line-height:16px; height:16px; }
    .gl-tab.active .gl-tabcount { background:rgba(0,0,0,.22); }

    .gl-body { flex:1; display:flex; overflow:hidden; position:relative; }
    .gl-panel { flex:1; display:flex; flex-direction:column; overflow:hidden; }
    .gl-panel:not(.active) { display:none; }

    .gl-bar { padding:10px 16px 8px; display:flex; flex-wrap:wrap; gap:8px; align-items:center; flex-shrink:0; }
    .gl-bar input, .gl-bar select { background:#1e1f22; color:#dbdee1; border:1px solid #2b2d31; border-radius:4px; padding:6px 8px; font-size:12px; outline:none; font-family:inherit; }
    .gl-bar input:focus, .gl-bar select:focus { border-color:#5865f2; }
    .gl-btn { background:#4e5058; color:#fff; border:none; border-radius:4px; padding:6px 10px; font-size:12px; font-weight:600; cursor:pointer; transition:background .15s; font-family:inherit; }
    .gl-btn:hover { background:#6d6f78; } .gl-btn.red { background:#da373c; } .gl-btn.red:hover { background:#a12d31; }
    .gl-btn:disabled { opacity:.45; cursor:not-allowed; }
    .gl-chips { display:flex; flex-wrap:wrap; gap:6px; padding:0 16px 10px; flex-shrink:0; }
    .gl-chip { background:#1e1f22; color:#b5bac1; border:1px solid #2b2d31; border-radius:99px; padding:4px 10px; font-size:11px; font-weight:600; cursor:pointer; transition:all .12s; font-family:inherit; }
    .gl-chip:hover { border-color:#5865f2; color:#5865f2; } .gl-chip.active { background:rgba(88,101,242,.15); border-color:#5865f2; color:#fff; }
    .gl-adv { display:none; padding:10px 16px; gap:8px; flex-wrap:wrap; align-items:center; border-top:1px dashed #2b2d31; margin-top:2px; }
    .gl-adv.open { display:flex; }
    .gl-adv label { font-size:11px; color:#b5bac1; display:flex; align-items:center; gap:4px; }
    .gl-list { flex:1; overflow-y:auto; padding:6px 10px; background:#2b2d31; border-top:1px solid #1e1f22; }
    .gl-row { display:flex; align-items:center; gap:10px; padding:8px; border-radius:6px; cursor:pointer; border-bottom:1px solid #313338; transition:background .12s; }
    .gl-row:hover { background:#35373c; } .gl-row.sel { background:rgba(218,55,60,.15); }
    .gl-cb { accent-color:#da373c; width:16px; height:16px; flex-shrink:0; cursor:pointer; }
    .gl-av { width:40px; height:40px; border-radius:50%; flex-shrink:0; background:#1e1f22; object-fit:cover; cursor:pointer; }
    .gl-av-ph { display:flex; align-items:center; justify-content:center; font-size:20px; background:#5865f2; }
    .gl-av-ph.solo { background:#faa61a; }
    .gl-info { flex:1; min-width:0; }
    .gl-name { font-size:14px; font-weight:600; color:#fff; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; width:fit-content; max-width:100%; cursor:pointer; }
    .gl-name:hover { text-decoration:underline; }
    .gl-name span { font-weight:400; color:#b5bac1; font-size:12px; margin-left:6px; }
    .gl-sub { font-size:11px; color:#b5bac1; margin-top:2px; }
    .gl-badges { display:flex; gap:4px; flex-shrink:0; }
    .gl-badge { font-size:11px; padding:1px 5px; border-radius:4px; line-height:1.4; }
    .gl-actions { display:flex; gap:6px; flex-shrink:0; }
    .gl-open { background:transparent; border:1px solid #4e5058; color:#b5bac1; font-size:13px; padding:4px 8px; border-radius:4px; cursor:pointer; font-weight:700; transition:all .12s; font-family:inherit; }
    .gl-open:hover { border-color:#5865f2; color:#5865f2; }
    .gl-rm { background:transparent; border:1px solid #4e5058; color:#b5bac1; font-size:12px; padding:4px 8px; border-radius:4px; cursor:pointer; font-weight:600; transition:all .12s; min-width:84px; font-family:inherit; }
    .gl-rm:hover { border-color:#da373c; color:#da373c; background:rgba(218,55,60,.08); }
    .gl-rm.armed { border-color:#da373c; color:#fff; background:#da373c; }
    .gl-rm.loading { opacity:.6; cursor:wait; } .gl-rm.err { border-color:#da373c; color:#da373c; background:rgba(218,55,60,.15); }
    .gl-foot { padding:10px 16px; border-top:1px solid #1e1f22; display:flex; align-items:center; gap:10px; flex-shrink:0; flex-wrap:wrap; }
    .gl-status { flex:1; font-size:12px; color:#b5bac1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; min-width:120px; }
    .gl-silent { cursor:pointer; font-size:12px; color:#dbdee1; background:#1e1f22; border:1px solid #2b2d31; border-radius:4px; padding:5px 8px; display:flex; align-items:center; gap:6px; }
    .gl-silent:hover { border-color:#5865f2; }
    .gl-footbar { width:100%; height:4px; background:#1e1f22; border-radius:99px; overflow:hidden; margin-top:4px; display:none; }
    .gl-footbar.visible { display:block; }
    .gl-footbar > div { height:100%; width:0%; background:linear-gradient(90deg,#da373c,#ff6b6b); border-radius:99px; transition:width .4s ease; }
    .gl-empty { text-align:center; color:#b5bac1; padding:30px; font-size:13px; }

    .gl-hist-meta { display:flex; gap:6px; flex-wrap:wrap; margin-top:4px; }
    .gl-hist-tag { font-size:10px; padding:2px 6px; border-radius:4px; font-weight:600; background:rgba(88,101,242,.12); color:#8891ff; border:1px solid rgba(88,101,242,.3); }
    .gl-hist-tag.green { background:rgba(35,165,90,.12); color:#57f287; border-color:rgba(35,165,90,.3); }
    .gl-hist-tag.orange { background:rgba(250,166,26,.12); color:#faa61a; border-color:rgba(250,166,26,.3); }
    .gl-hist-tag.grey { background:rgba(181,186,193,.1); color:#b5bac1; border-color:rgba(181,186,193,.25); }
    .gl-hist-date { font-size:10px; color:#6d6f78; margin-top:3px; }
    #__gl_box .gl-hrow { cursor:default; }
  `;
  document.head.append(style);

  // ── Build window ────────────────────────────────────────
  const box = document.createElement('div');
  box.id = '__gl_box';
  box.innerHTML = `
    <div class="gl-head">
      <button class="gl-min" title="Collapse"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 9l7 7 7-7"/></svg></button>
      <div class="gl-title">🚪 Groups Manager</div>
      <div class="gl-tabs">
        <button class="gl-tab active" data-tab="groups">👥 Groups <span class="gl-tabcount" id="gl-gcount">${groups.length}</span></button>
        <button class="gl-tab" data-tab="history">📜 History <span class="gl-tabcount" id="gl-hcount">${leftLog.length}</span></button>
      </div>
      <button class="gl-x" title="Close">✕</button>
    </div>
    <div class="gl-body">

      <!-- ══════════ GROUPS PANEL ══════════ -->
      <div class="gl-panel active" data-panel="groups">
        <div class="gl-bar">
          <input id="gl-q" placeholder="🔍 Search name / member / ID" style="flex:1;min-width:150px">
          <select id="gl-sort" title="Sort by">
            <option value="created">Date created</option>
            <option value="activity">Last activity</option>
            <option value="name">Name</option>
            <option value="members">Members</option>
          </select>
          <button class="gl-btn" id="gl-dir" style="min-width:32px;font-size:14px;padding:4px 8px">↓</button>
          <label style="cursor:pointer;font-size:12px;color:#dbdee1;background:#1e1f22;border:1px solid #2b2d31;border-radius:4px;padding:5px 8px">
            <input type="checkbox" id="gl-selall" class="gl-cb" style="width:14px;height:14px"> Select all
          </label>
          <button class="gl-btn" id="gl-adv-toggle" style="font-size:14px;padding:4px 10px">⚙</button>
        </div>
        <div class="gl-chips" id="gl-chips">
          <button class="gl-chip active" data-chip="all">All</button>
          <button class="gl-chip" data-chip="solo">👤 Solo</button>
          <button class="gl-chip" data-chip="named">🏷 Named</button>
          <button class="gl-chip" data-chip="inactive">💤 Inactive</button>
          <button class="gl-chip" data-chip="new">🆕 Recent</button>
          <button class="gl-chip" data-chip="old">⏳ Old</button>
        </div>
        <div class="gl-adv" id="gl-adv">
          <label>Created after <input type="date" id="gl-from"></label>
          <label>before <input type="date" id="gl-to"></label>
          <select id="gl-ic">
            <option value="all">All icons</option>
            <option value="def">Default icon</option>
            <option value="custom">Custom icon</option>
          </select>
        </div>
        <div class="gl-list" id="gl-list"></div>
      </div>

      <!-- ══════════ HISTORY PANEL ══════════ -->
      <div class="gl-panel" data-panel="history">
        <div class="gl-bar">
          <input id="gl-hq" placeholder="🔍 Search in history" style="flex:1;min-width:150px">
          <span id="gl-hstats" style="font-size:11px;color:#949ba4"></span>
          <button class="gl-btn red" id="gl-hclear" title="Clear all history">🗑 Clear</button>
        </div>
        <div class="gl-list" id="gl-hlist"></div>
      </div>

    </div>
    <div class="gl-foot">
      <div class="gl-status" id="gl-status"></div>
      <label class="gl-silent" title="No notification will be sent to the other group members">
        <input type="checkbox" id="gl-silent" class="gl-cb" style="width:14px;height:14px;accent-color:#5865f2"> 🔇 Silent
      </label>
      <button class="gl-btn red" id="gl-del" disabled>🚪 Leave selected</button>
      <div class="gl-footbar" id="gl-footbar"><div></div></div>
    </div>`;
  document.body.append(box);

  const $ = id => box.querySelector('#' + id);
  const listEl = $('gl-list'), statusEl = $('gl-status'), delBtn = $('gl-del'), silentCb = $('gl-silent');
  const footbar = $('gl-footbar'), footbarFill = footbar.firstElementChild;
  const footEl = box.querySelector('.gl-foot');
  let busy = false, visibleList = [], sortDir = prefs.dir === 'asc' ? 'asc' : 'desc', activeChip = prefs.chip || 'all';
  let activeTab = prefs.activeTab === 'history' ? 'history' : 'groups';

  silentCb.checked = loadSilentPref();
  silentCb.onchange = () => saveSilentPref(silentCb.checked);

  $('gl-sort').value = prefs.sort || 'created';
  $('gl-ic').value   = prefs.ic || 'all';
  if (prefs.from) $('gl-from').value = prefs.from;
  if (prefs.to)   $('gl-to').value   = prefs.to;
  $('gl-dir').textContent = sortDir === 'desc' ? '↓' : '↑';
  $('gl-dir').title       = sortDir === 'desc' ? 'Descending' : 'Ascending';
  box.querySelectorAll('#gl-chips .gl-chip').forEach(c => c.classList.toggle('active', c.dataset.chip === activeChip));

  const saveCurrentPrefs = () => savePrefs({
    sort: $('gl-sort').value, dir: sortDir, ic: $('gl-ic').value,
    from: $('gl-from').value, to: $('gl-to').value, chip: activeChip, activeTab,
  });

  // ── Drag / collapse / close ─────────────────────────────
  const head = box.querySelector('.gl-head');
  let drag = null;
  head.addEventListener('mousedown', e => {
    if (e.target.closest('.gl-x, .gl-min, .gl-tab')) return;
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

  const minBtn = box.querySelector('.gl-min');
  const toggleMin = () => { const m = box.classList.toggle('min'); minBtn.title = m ? 'Expand' : 'Collapse'; };
  minBtn.onclick = toggleMin;
  head.addEventListener('dblclick', e => { if (!e.target.closest('.gl-x, .gl-min, .gl-tab')) toggleMin(); });
  box.querySelector('.gl-x').onclick = () => {
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
    box.remove(); style.remove();
    document.getElementById('__gl_progress')?.remove();
    document.getElementById('__gl_confirm')?.remove();
  };
  $('gl-adv-toggle').onclick = () => $('gl-adv').classList.toggle('open');

  // ── Tabs ────────────────────────────────────────────────
  const applyTab = () => {
    box.querySelectorAll('.gl-tab').forEach(x => x.classList.toggle('active', x.dataset.tab === activeTab));
    box.querySelectorAll('.gl-panel').forEach(p => p.classList.toggle('active', p.dataset.panel === activeTab));
    footEl.style.display = activeTab === 'history' ? 'none' : '';
  };
  box.querySelectorAll('.gl-tab').forEach(t => {
    t.onclick = () => {
      activeTab = t.dataset.tab;
      applyTab();
      activeTab === 'history' ? renderHistory() : render();
      saveCurrentPrefs();
    };
  });
  applyTab();

  // ── Filter / sort / render (groups) ─────────────────────
  const getVisible = () => {
    const q = $('gl-q').value.trim().toLowerCase();
    const ic = $('gl-ic').value;
    const from = $('gl-from').value ? new Date($('gl-from').value + 'T00:00:00') : null;
    const to   = $('gl-to').value   ? new Date($('gl-to').value + 'T23:59:59') : null;
    const l = groups.filter(g => {
      if (q && !(`${g.name} ${g.members} ${g.id}`.toLowerCase().includes(q))) return false;
      if (from && g.created < from) return false;
      if (to && g.created > to) return false;
      if (ic === 'def' && g.icon) return false;
      if (ic === 'custom' && !g.icon) return false;
      if (activeChip === 'solo'     && !g.solo)       return false;
      if (activeChip === 'named'    && !g.named)      return false;
      if (activeChip === 'inactive' && !isInactive(g)) return false;
      if (activeChip === 'new'      && !isNewGroup(g)) return false;
      if (activeChip === 'old'      && !isOldGroup(g)) return false;
      return true;
    });
    const key = $('gl-sort').value;
    const m = sortDir === 'asc' ? 1 : -1;
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

  const rowHtml = g => {
    const badges = badgesFor(g).map(b =>
      `<span class="gl-badge" title="${esc(b.label)}" style="color:${b.color};background:${b.color}20;border:1px solid ${b.color}55">${b.icon}</span>`
    ).join('');
    const av = g.icon
      ? `<img class="gl-av" loading="lazy" src="${iconUrl(g)}" title="Open group">`
      : `<div class="gl-av gl-av-ph ${g.solo ? 'solo' : ''}" title="Open group">👥</div>`;
    return `<div class="gl-row ${selected.has(g.id) ? 'sel' : ''}" data-id="${g.id}">
      <input type="checkbox" class="gl-cb" ${selected.has(g.id) ? 'checked' : ''}>
      ${av}
      <div class="gl-info">
        <div class="gl-name" title="Open group">${esc(g.name)}</div>
        <div class="gl-sub">${g.size} member${g.size > 1 ? 's' : ''} · Created ${fmtDate(g.created)} (${fmtRelative(g.created)}) · Last activity ${g.last ? fmtRelative(g.last) : 'unknown'}</div>
      </div>
      <div class="gl-badges">${badges}</div>
      <div class="gl-actions">
        <button class="gl-open" title="Open this group in Discord">↗</button>
        <button class="gl-rm" title="Leave this group (click twice)">🚪 Leave</button>
      </div>
    </div>`;
  };

  const updateFooter = msg => {
    const sa = $('gl-selall');
    const n = visibleList.filter(g => selected.has(g.id)).length;
    sa.checked = visibleList.length > 0 && n === visibleList.length;
    sa.indeterminate = n > 0 && n < visibleList.length;
    delBtn.disabled = busy || selected.size === 0;
    delBtn.textContent = `🚪 Leave selected (${selected.size})`;
    const solo = groups.filter(g => g.solo).length;
    statusEl.textContent = msg ?? `${visibleList.length} shown / ${groups.length} group(s)${solo ? ` (${solo} solo)` : ''} · ${selected.size} selected`;
    $('gl-gcount').textContent = groups.length;
  };

  const render = () => {
    visibleList = getVisible();
    listEl.innerHTML = visibleList.length ? visibleList.map(rowHtml).join('')
      : `<div class="gl-empty">${groups.length === 0 ? "You're not in any group DM 🎉" : 'No groups match the filters.'}</div>`;
    updateFooter();
  };

  // ── History render ──────────────────────────────────────
  const historyRowHtml = h => {
    const tags = [];
    if (h.msgDeleted > 0) tags.push(`<span class="gl-hist-tag green">🧹 ${h.msgDeleted} msg deleted</span>`);
    else tags.push(`<span class="gl-hist-tag grey">Messages kept</span>`);
    tags.push(h.silent ? `<span class="gl-hist-tag">🔇 silent</span>` : `<span class="gl-hist-tag orange">🔔 members notified</span>`);
    tags.push(`<span class="gl-hist-tag grey">👥 ${h.size} member${h.size > 1 ? 's' : ''}</span>`);
    if (h.createdTs) tags.push(`<span class="gl-hist-tag orange" title="Created ${fmtDateTime(h.createdTs)}">📅 ${fmtTsRelative(h.createdTs)}</span>`);
    const av = h.iconUrl
      ? `<img class="gl-av" style="cursor:default" loading="lazy" src="${h.iconUrl}" onerror="this.style.opacity=.4">`
      : `<div class="gl-av gl-av-ph ${h.solo ? 'solo' : ''}" style="cursor:default">👥</div>`;
    return `<div class="gl-row gl-hrow" data-id="${h.id}">
      ${av}
      <div class="gl-info">
        <div class="gl-name" style="cursor:default;text-decoration:none">${esc(h.name)}</div>
        <div class="gl-hist-meta">${tags.join('')}</div>
        <div class="gl-hist-date">Left ${fmtTsRelative(h.leftAt)} · ${fmtDateTime(h.leftAt)}</div>
      </div>
    </div>`;
  };

  function renderHistory() {
    const hq = $('gl-hq').value.trim().toLowerCase();
    const list = leftLog.filter(h => !hq || `${h.name} ${h.id}`.toLowerCase().includes(hq));
    $('gl-hlist').innerHTML = list.length
      ? list.map(historyRowHtml).join('')
      : `<div class="gl-empty">${leftLog.length === 0 ? 'No history yet — groups you leave will appear here.' : 'No entries match your search.'}</div>`;
    $('gl-hcount').textContent = leftLog.length;
    const totalMsg = leftLog.reduce((s, h) => s + (h.msgDeleted || 0), 0);
    $('gl-hstats').textContent = leftLog.length > 0
      ? `${leftLog.length} entr${leftLog.length > 1 ? 'ies' : 'y'} · 🧹 ${totalMsg} msg total` : '';
  }

  $('gl-hq').addEventListener('input', renderHistory);
  $('gl-hclear').onclick = async () => {
    if (leftLog.length === 0) return;
    const v = await choiceDialog({
      title: 'Clear history?',
      message: `This will clear <b style="color:#fff">${leftLog.length}</b> entr${leftLog.length > 1 ? 'ies' : 'y'} from your history.<br><br>
                <span style="color:#949ba4;font-size:12px">You stay out of those groups — only the local log is erased.</span><br><br>
                <span style="color:#faa61a">⚠️ This cannot be undone.</span>`,
      choices: [
        { label: 'Cancel',   value: 'cancel' },
        { label: '🗑 Clear', value: 'clear', danger: true },
      ],
    });
    if (v === 'clear') { clearHistory(); renderHistory(); }
  };

  // ── Footer bar helpers ──────────────────────────────────
  const showFootbar = () => footbar.classList.add('visible');
  const hideFootbar = () => { footbar.classList.remove('visible'); setTimeout(() => { footbarFill.style.width = '0%'; }, 400); };
  const setFootbar  = pct => { footbarFill.style.width = Math.max(0, Math.min(100, pct)) + '%'; };

  // ── Leave ONE group (row button) ────────────────────────
  async function leaveOneRow(id, btn, row) {
    if (busy) return;
    const g = groups.find(x => x.id === id);
    if (!g) return;

    busy = true;
    if (btn) { btn.classList.add('loading'); btn.textContent = '…'; }
    updateFooter(`🔍 Checking your messages in ${g.name}…`);

    const silent = silentCb.checked;
    const res = await leaveOneWithChoice(g, silent);
    busy = false;
    if (!box.isConnected) return;

    if (res.status === 'cancelled') {
      if (btn) { btn.classList.remove('loading'); btn.textContent = '🚪 Leave'; }
      updateFooter();
      return;
    }

    if (res.status === 'left') {
      logLeft(g, { deleted: res.deleted, silent });
      groups = groups.filter(x => x.id !== id);
      selected.delete(id);
      const info = res.deleted ? ` · 🧹 ${res.deleted} msg deleted` : '';
      if (row) {
        row.style.transition = 'opacity .25s, transform .25s, max-height .25s, padding .25s';
        row.style.opacity = '0'; row.style.transform = 'translateX(24px)';
        row.style.maxHeight = row.offsetHeight + 'px';
        requestAnimationFrame(() => {
          row.style.maxHeight = '0'; row.style.paddingTop = '0';
          row.style.paddingBottom = '0'; row.style.borderBottom = 'none';
        });
        setTimeout(() => { const top = listEl.scrollTop; render(); listEl.scrollTop = top; updateFooter(`✅ ${g.name} left${info}.`); }, 260);
      } else {
        render(); updateFooter(`✅ ${g.name} left${info}.`);
      }
    } else {
      if (btn) { btn.classList.remove('loading'); btn.classList.add('err'); btn.textContent = '✕ Failed'; }
      updateFooter(`⚠️ Failed to leave ${g.name}`);
    }
  }

  // ── List clicks (groups) ────────────────────────────────
  listEl.addEventListener('click', async e => {
    const row = e.target.closest('.gl-row');
    if (!row) return;
    const id = row.dataset.id;

    if (e.target.closest('.gl-av, .gl-name')) { navigateToGroup(id); return; }

    if (e.target.closest('.gl-open')) { e.stopPropagation(); navigateToGroup(id); return; }

    const rmBtn = e.target.closest('.gl-rm');
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
          rmBtn.textContent = '🚪 Leave';
        }, 3000);
        return;
      }
      clearTimeout(rmBtn._timer);
      delete rmBtn.dataset.armed;
      rmBtn.classList.remove('armed');
      rmBtn.textContent = '🚪 Leave';
      await leaveOneRow(id, rmBtn, row);
      return;
    }

    const cb = row.querySelector('.gl-cb');
    if (e.target !== cb) cb.checked = !cb.checked;
    cb.checked ? selected.add(id) : selected.delete(id);
    row.classList.toggle('sel', cb.checked);
    updateFooter();
  });

  // ── Filter handlers ─────────────────────────────────────
  ['gl-q', 'gl-sort', 'gl-from', 'gl-to', 'gl-ic'].forEach(id => {
    $(id).addEventListener(id === 'gl-q' ? 'input' : 'change', () => { saveCurrentPrefs(); render(); });
  });
  $('gl-dir').onclick = e => {
    sortDir = sortDir === 'desc' ? 'asc' : 'desc';
    e.currentTarget.textContent = sortDir === 'desc' ? '↓' : '↑';
    e.currentTarget.title       = sortDir === 'desc' ? 'Descending' : 'Ascending';
    saveCurrentPrefs(); render();
  };
  $('gl-selall').onchange = e => {
    if (e.target.checked) visibleList.forEach(g => selected.add(g.id));
    else visibleList.forEach(g => selected.delete(g.id));
    render();
  };
  box.querySelectorAll('#gl-chips .gl-chip').forEach(chip => {
    chip.onclick = () => {
      box.querySelectorAll('#gl-chips .gl-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      activeChip = chip.dataset.chip;
      saveCurrentPrefs(); render();
    };
  });

  // ── Bulk leave ──────────────────────────────────────────
  delBtn.onclick = async () => {
    if (busy || !selected.size) return;
    const targets = groups.filter(g => selected.has(g.id));
    const n = targets.length;

    busy = true;
    delBtn.disabled = true;

    let totalMsgCount = 0;
    for (let i = 0; i < n; i++) {
      updateFooter(`🔍 Checking your messages… ${i + 1}/${n}`);
      const c = await quickCountMyMessages(targets[i].id);
      totalMsgCount += c;
      console.log(`🔍 ${targets[i].name}: ${c} message(s) from you`);
    }
    busy = false;
    if (!box.isConnected) return;

    const action = await askCleanChoice({ count: n, totalMsgCount });
    if (action === 'cancel') { updateFooter(); return; }

    const doClean = action === 'clean';
    const silent  = silentCb.checked;

    busy = true;
    delBtn.disabled = true;
    showFootbar(); setFootbar(0);

    const progress = createProgressOverlay(silent, 'leave');
    progress.update(0, n, '', 0);
    console.log(`🎛️  Mode: ${silent ? 'SILENT 🔇' : 'NORMAL 🔔'}${doClean ? ' + 🧹 message clean' : ''}`);

    let left = 0, errors = 0, skipped = 0, msgsDeleted = 0, cancelledMidway = false;
    const startTime = Date.now();

    for (const g of targets) {
      if (progress.isCancelled() || !box.isConnected) { cancelledMidway = true; break; }

      let res = null;
      if (doClean) {
        setFootbar((left / n) * 100);
        progress.setMode('clean');
        progress.update(0, 0, `🔍 ${g.name}`, errors);
        try { res = await cleanGroupMessages(g, progress); }
        catch (e) { console.warn('⚠️ clean error:', e); }
        progress.clearRateLimit();

        if (res?.cancelled) {
          console.warn(`⛔ Clean cancelled — NOT leaving ${g.name}`);
          skipped++; cancelledMidway = true;
          break;
        }

        if (res && res.errors > 0) {
          const choice = await choiceDialog({
            title: `Clean failed for ${g.name}`,
            message: `<b style="color:#fff">${res.deleted}/${res.total}</b> deleted — <b style="color:#faa61a">${res.errors} error${res.errors > 1 ? 's' : ''}</b> (status ${res.lastErrorStatus}).<br><br>
                      Still leave <b style="color:#fff">${esc(g.name)}</b>?<br>
                      <span style="color:#949ba4;font-size:12px">Or choose "Skip" to stay in this group and continue with the rest.</span>`,
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
      progress.update(left, n, g.name, errors);
      setFootbar((left / n) * 100);

      if (await leaveOne(g, silent)) {
        left++;
        logLeft(g, { deleted: res?.deleted ?? 0, silent });
        groups = groups.filter(x => x.id !== g.id);
        selected.delete(g.id);
      } else {
        errors++;
      }
      progress.update(left, n, '', errors);
      await sleep(600 + Math.random() * 200);
    }

    const wasCancelled = progress.isCancelled() || cancelledMidway;
    setFootbar(100);
    progress.setMode('leave');
    progress.finish(left, n, errors, wasCancelled);
    busy = false;
    if (!box.isConnected) return;
    const top = listEl.scrollTop;
    render();
    listEl.scrollTop = top;

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    const bits = [`${left} left`];
    if (errors)  bits.push(`${errors} error(s)`);
    if (skipped) bits.push(`${skipped} skipped (clean failed/cancelled)`);
    if (doClean && msgsDeleted > 0) bits.push(`🧹 ${msgsDeleted} msg deleted`);
    const summary = `${wasCancelled ? '⛔ Cancelled' : '✅ Done'} — ${bits.join(', ')} in ${elapsed}s.`;
    updateFooter(summary);
    console.log(summary);
    hideFootbar();
  };

  // ── Initial render ──────────────────────────────────────
  render();
  renderHistory();

  console.log('%c✅ Group Manager v2.0 ready', 'color:green;font-weight:bold;font-size:16px');
})().catch(e => console.error('❌', e.message));