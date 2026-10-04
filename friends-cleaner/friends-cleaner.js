// ============================================================
//  Discord — Bulk Friend Remover (v3.2)
//  ✨ Bouton 💬 DM par ami (même méthode que le group cleaner)
//  ✨ Rate limit visible + retry backoff adaptatif
//  ✨ Barre de progression (overlay + footer)
//  ✨ Suppression individuelle en 2 clics · Badges · Filtres · Prefs
// ============================================================
(async () => {
  document.getElementById('__fr_box')?.remove();
  document.getElementById('__fr_style')?.remove();
  document.getElementById('__fr_progress')?.remove();

  const isValidToken = t => typeof t === "string" && /^[A-Za-z0-9_-]{20,}\.[\w-]{4,}\.[\w-]{20,}$/.test(t);

  // ── Automatic token extraction ──────────────────────────
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
      webpackChunkdiscord_app.push([
        [Symbol()], {},
        ({ c }) => {
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
        }
      ]);
      webpackChunkdiscord_app.pop();
      if (token) { console.log("🔑 Token via webpack"); return token; }
    } catch (_) {}

    throw new Error("Token not found — are you logged in on discord.com/app?");
  })();

  const BASE  = "https://discord.com/api/v9";
  const HEADS = { Authorization: TOKEN, "Content-Type": "application/json" };
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  // ── Enhanced apiFetch with rate-limit callback ──────────
  async function apiFetch(url, opts = {}, onWait = null) {
    const MAX = 8;
    for (let attempt = 0; attempt < MAX; attempt++) {
      let r;
      try {
        r = await fetch(url, { headers: HEADS, ...opts });
      } catch (e) {
        if (attempt < 2) { await sleep(800); continue; }
        throw e;
      }

      if (r.status === 429) {
        const body = await r.json().catch(() => ({}));
        const baseMs  = (body.retry_after ?? 1) * 1000;
        const jitter  = Math.random() * 400;
        const waitMs  = Math.ceil(baseMs + 400 + jitter);
        if (onWait) onWait({ waitMs, attempt: attempt + 1, max: MAX });
        await sleep(waitMs);
        continue;
      }
      return r;
    }
    throw new Error(`Rate limited after ${MAX} attempts`);
  }

  // ── Utilities ──────────────────────────────────────────
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const createdAt = id => new Date(Number((BigInt(id) >> 22n) + 1420070400000n));
  const fmtDate = d => d ? d.toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' }) : 'unknown';
  const displayName = u => u.global_name || u.username;
  const avatarUrl = u => u.avatar
    ? `https://cdn.discordapp.com/avatars/${u.id}/${u.avatar}.webp?size=64`
    : `https://cdn.discordapp.com/embed/avatars/${Number((BigInt(u.id) >> 22n) % 6n)}.png`;

  const fmtRelative = d => {
    if (!d) return 'unknown';
    const diff = Date.now() - d.getTime();
    const abs = Math.abs(diff);
    const DAY = 86400000;
    if (abs < 60000)    return diff > 0 ? 'just now' : 'in a moment';
    if (abs < 3600000)  return diff > 0 ? `${Math.floor(abs / 60000)} min ago` : `in ${Math.floor(abs / 60000)} min`;
    if (abs < DAY)      return diff > 0 ? `${Math.floor(abs / 3600000)} h ago` : `in ${Math.floor(abs / 3600000)} h`;
    if (abs < 30 * DAY) return diff > 0 ? `${Math.floor(abs / DAY)} d ago` : `in ${Math.floor(abs / DAY)} d`;
    if (abs < 365 * DAY) return diff > 0 ? `${Math.floor(abs / (30 * DAY))} mo ago` : `in ${Math.floor(abs / (30 * DAY))} mo`;
    return diff > 0 ? `${Math.floor(abs / (365 * DAY))} y ago` : `in ${Math.floor(abs / (365 * DAY))} y`;
  };

  // ── Preferences (persistent) ───────────────────────────
  const PREF_KEY = '__fr_prefs_v3';
  const loadPrefs = () => { try { return JSON.parse(localStorage.getItem(PREF_KEY)) || {}; } catch { return {}; } };
  const savePrefs = (p) => { try { localStorage.setItem(PREF_KEY, JSON.stringify(p)); } catch {} };
  const prefs = loadPrefs();

  // ── Fetch friends ──────────────────────────────────────
  console.log("📥 Fetching friends...");
  const rRel = await apiFetch(`${BASE}/users/@me/relationships`);
  if (!rRel.ok) throw new Error(`Could not fetch friends (${rRel.status})`);

  let friends = (await rRel.json())
    .filter(r => r.type === 1)
    .map(r => ({
      id: r.id,
      user: r.user,
      since: r.since ? new Date(r.since) : null,
      created: createdAt(r.id),
    }));
  const selected = new Set();
  console.log(`  → ${friends.length} friend(s)`);

  // ── Badges ─────────────────────────────────────────────
  const DAY = 86400000;
  const isNewAccount    = f => (Date.now() - f.created.getTime()) < 30 * DAY;
  const isNoAvatar      = f => !f.user.avatar;
  const isFreshFriend   = f => f.since && (Date.now() - f.since.getTime()) < 7 * DAY;
  const isLongTimeFriend= f => f.since && (Date.now() - f.since.getTime()) > 365 * DAY;

  function badgesFor(f) {
    const out = [];
    if (isNewAccount(f))     out.push({ icon: '🆕', label: 'New account (< 30 days)',     color: '#5865f2' });
    if (isNoAvatar(f))       out.push({ icon: '👻', label: 'No custom avatar',            color: '#b5bac1' });
    if (isFreshFriend(f))    out.push({ icon: '🌱', label: 'Friend for less than 7 days', color: '#23a55a' });
    if (isLongTimeFriend(f)) out.push({ icon: '⏳', label: 'Friend for over a year',      color: '#faa61a' });
    return out;
  }

  // ── Discord internals (Flux, for profile only) ─────────
  function getFluxDispatcher() {
    let dispatcher = null;
    window.webpackChunkdiscord_app?.push([[Symbol()], {}, ({ c }) => {
      for (const id in c) {
        const exp = c[id]?.exports;
        if (!exp) continue;
        for (const val of [exp, exp?.default, ...Object.values(exp)]) {
          try {
            if (
              val && typeof val === 'object' && !Array.isArray(val) &&
              !(val instanceof Element) &&
              typeof val.dispatch === 'function' &&
              '_actionHandlers' in val
            ) { dispatcher = val; return; }
          } catch {}
        }
      }
    }]);
    window.webpackChunkdiscord_app?.pop();
    return dispatcher;
  }

  let _fluxForProfile = null;
  function openProfile(userId) {
    try {
      const avatarImg = document.querySelector(`img[src*="/users/${userId}/"]`);
      const memberEl = avatarImg?.closest('[role="listitem"]');
      if (memberEl) { memberEl.click(); return; }
    } catch {}

    try {
      _fluxForProfile ??= getFluxDispatcher();
      if (_fluxForProfile) {
        _fluxForProfile.dispatch({ type: 'USER_PROFILE_MODAL_OPEN', userId });
        return;
      }
    } catch {}

    window.open(`discord://-/users/${userId}`);
  }

  // ── Navigate to a channel (same trick as group cleaner) ─
  function navigateToChannel(channelId) {
    const path = `/channels/@me/${channelId}`;
    if (location.pathname === path) {
      console.log(`📍 Already on ${channelId}`);
      return;
    }
    history.pushState({}, '', path);
    window.dispatchEvent(new PopStateEvent('popstate', { state: {} }));
    console.log(`🧭 Navigating to ${path}`);
  }

  // ── Open DM with a user ────────────────────────────────
  async function openDM(userId) {
    console.log(`💬 Resolving DM channel for ${userId}…`);

    // Create (or fetch existing) DM channel via API
    let channelId = null;
    try {
      const r = await fetch(`${BASE}/users/@me/channels`, {
        method: 'POST',
        headers: HEADS,
        body: JSON.stringify({ recipient_id: userId }),
      });

      if (r.ok) {
        const ch = await r.json();
        channelId = ch.id;
        console.log(`💬 DM channel resolved: ${channelId}`);
      } else if (r.status === 429) {
        const body = await r.json().catch(() => ({}));
        const wait = ((body.retry_after ?? 1) + 0.3) * 1000;
        console.warn(`⏳ DM rate limited, waiting ${wait}ms`);
        await sleep(wait);
        const r2 = await fetch(`${BASE}/users/@me/channels`, {
          method: 'POST',
          headers: HEADS,
          body: JSON.stringify({ recipient_id: userId }),
        });
        if (r2.ok) {
          const ch = await r2.json();
          channelId = ch.id;
          console.log(`💬 DM channel resolved (retry): ${channelId}`);
        } else {
          console.warn(`⚠️ Retry failed (${r2.status})`);
        }
      } else {
        console.warn(`⚠️ Could not create/get DM channel (${r.status})`);
      }
    } catch (e) {
      console.warn('⚠️ DM channel fetch error:', e);
    }

    if (!channelId) {
      window.open(`discord://-/users/${userId}`);
      return false;
    }

    // Same navigation as group cleaner → works 100%
    navigateToChannel(channelId);
    return true;
  }

  // ── In-app confirm dialog ──────────────────────────────
  function confirmDialog({ title, message, confirmLabel = 'Confirm', cancelLabel = 'Cancel', danger = false }) {
    return new Promise(resolve => {
      const ov = document.createElement('div');
      Object.assign(ov.style, {
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
        zIndex: '100001', display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: '"gg sans","Noto Sans",sans-serif',
      });

      const box = document.createElement('div');
      Object.assign(box.style, {
        background: '#313338', borderRadius: '12px', padding: '24px 28px 22px',
        width: '440px', maxWidth: '92vw', color: '#dbdee1', textAlign: 'center',
        boxShadow: '0 12px 48px rgba(0,0,0,0.85), 0 0 0 1px rgba(255,255,255,0.06)',
      });

      const t = document.createElement('div');
      t.textContent = title;
      Object.assign(t.style, { fontSize: '18px', fontWeight: '700', color: '#fff', marginBottom: '10px' });

      const m = document.createElement('div');
      m.innerHTML = message;
      Object.assign(m.style, { fontSize: '13px', color: '#b5bac1', lineHeight: '1.5', marginBottom: '20px' });

      const row = document.createElement('div');
      Object.assign(row.style, { display: 'flex', gap: '10px', justifyContent: 'center' });

      const mkBtn = (label, bg, hover) => {
        const b = document.createElement('button');
        b.textContent = label;
        Object.assign(b.style, {
          flex: '1', padding: '10px', borderRadius: '4px', border: 'none',
          background: bg, color: '#fff', fontSize: '14px', fontWeight: '600',
          cursor: 'pointer', transition: 'background 0.15s',
        });
        b.onmouseenter = () => b.style.background = hover;
        b.onmouseleave = () => b.style.background = bg;
        return b;
      };

      const btnCancel  = mkBtn(cancelLabel,  '#4e5058', '#6d6f78');
      const btnConfirm = mkBtn(confirmLabel, danger ? '#da373c' : '#5865f2', danger ? '#a12d31' : '#4752c4');

      btnCancel.onclick  = () => { ov.remove(); resolve(false); };
      btnConfirm.onclick = () => { ov.remove(); resolve(true); };

      row.append(btnCancel, btnConfirm);
      box.append(t, m, row);
      ov.append(box);
      document.body.append(ov);
    });
  }

  // ── Progress overlay (bottom-right) ────────────────────
  function createProgressOverlay() {
    document.getElementById('__fr_progress')?.remove();

    const overlay = document.createElement('div');
    overlay.id = '__fr_progress';
    Object.assign(overlay.style, {
      position: 'fixed', bottom: '28px', right: '28px', zIndex: '99999',
      fontFamily: '"gg sans", "Noto Sans", sans-serif',
      background: '#313338', borderRadius: '12px', padding: '18px 22px',
      width: '320px', boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
      color: '#dbdee1', userSelect: 'none',
    });

    let _cancelled = false;

    const titleRow = document.createElement('div');
    Object.assign(titleRow.style, { display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' });

    const titleIcon = document.createElement('span');
    titleIcon.textContent = '🗑';
    titleIcon.style.fontSize = '18px';

    const titleText = document.createElement('span');
    titleText.textContent = 'Removing friends…';
    Object.assign(titleText.style, { fontSize: '15px', fontWeight: '700', color: '#fff', flex: '1' });

    const btnClose = document.createElement('button');
    btnClose.textContent = '✕ Cancel';
    Object.assign(btnClose.style, {
      marginLeft: 'auto', background: 'transparent', border: '1px solid #4e5058',
      borderRadius: '4px', color: '#b5bac1', fontSize: '12px',
      padding: '3px 8px', cursor: 'pointer', flexShrink: '0',
    });
    btnClose.onmouseenter = () => { btnClose.style.background = '#da373c'; btnClose.style.color = '#fff'; btnClose.style.borderColor = '#da373c'; };
    btnClose.onmouseleave = () => { btnClose.style.background = 'transparent'; btnClose.style.color = '#b5bac1'; btnClose.style.borderColor = '#4e5058'; };
    btnClose.onclick = () => {
      _cancelled = true;
      btnClose.disabled = true;
      btnClose.textContent = '…';
      titleText.textContent = 'Cancelling…';
      titleText.style.color = '#faa61a';
    };
    titleRow.append(titleIcon, titleText, btnClose);

    const statusLine = document.createElement('div');
    Object.assign(statusLine.style, {
      fontSize: '14px', fontWeight: '600', color: '#fff',
      marginBottom: '12px', minHeight: '20px',
    });

    const barTrack = document.createElement('div');
    Object.assign(barTrack.style, { background: '#1e1f22', borderRadius: '99px', height: '8px', overflow: 'hidden', marginBottom: '10px' });
    const barFill = document.createElement('div');
    Object.assign(barFill.style, {
      height: '100%', width: '0%',
      background: 'linear-gradient(90deg, #da373c, #ff6b6b)',
      borderRadius: '99px', transition: 'width 0.4s ease',
    });
    barTrack.append(barFill);

    const currentLine = document.createElement('div');
    Object.assign(currentLine.style, { fontSize: '12px', color: '#b5bac1', marginTop: '6px', minHeight: '16px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' });

    const rateLimitLine = document.createElement('div');
    Object.assign(rateLimitLine.style, {
      fontSize: '12px', color: '#faa61a', marginTop: '4px', minHeight: '16px',
      fontWeight: '600', display: 'none',
    });

    overlay.append(titleRow, statusLine, barTrack, currentLine, rateLimitLine);
    document.body.append(overlay);

    const update = (done, total, currentName, errors) => {
      statusLine.textContent = `Removed: ${done}/${total}${errors > 0 ? `  ⚠️ ${errors} error${errors > 1 ? 's' : ''}` : ''}`;
      barFill.style.width = `${total > 0 ? Math.round((done / total) * 100) : 0}%`;
      currentLine.textContent = currentName ? `⏳ ${currentName}` : '';
    };

    const setRateLimit = (waitMs, attempt, max) => {
      rateLimitLine.style.display = 'block';
      rateLimitLine.textContent = `🐢 Rate limited — retry ${attempt}/${max} in ${(waitMs / 1000).toFixed(1)}s`;
    };

    const clearRateLimit = () => {
      rateLimitLine.style.display = 'none';
      rateLimitLine.textContent = '';
    };

    const finish = (done, total, errors, cancelled = false) => {
      titleText.textContent = cancelled ? 'Cancelled ⛔' : 'Done ✅';
      titleText.style.color  = cancelled ? '#faa61a' : '#23a55a';
      statusLine.textContent = `${done}/${total} removed${errors > 0 ? `  ⚠️ ${errors} error${errors > 1 ? 's' : ''}` : ''}`;
      barFill.style.background = cancelled
        ? 'linear-gradient(90deg, #faa61a, #ffcf72)'
        : 'linear-gradient(90deg, #23a55a, #57f287)';
      barFill.style.width = '100%';
      currentLine.textContent = '';
      clearRateLimit();
      setTimeout(() => overlay.remove(), 5000);
    };

    return { update, finish, setRateLimit, clearRateLimit, remove: () => overlay.remove(), isCancelled: () => _cancelled };
  }

  // ── Styles ─────────────────────────────────────────────
  const style = document.createElement('style');
  style.id = '__fr_style';
  style.textContent = `
    #__fr_box { position:fixed; top:6vh; left:calc(50% - 400px); width:800px; max-width:96vw; height:88vh;
      background:#313338; color:#dbdee1; border-radius:12px; z-index:1000; display:flex; flex-direction:column;
      font-family:"gg sans","Noto Sans",sans-serif; box-shadow:0 12px 48px rgba(0,0,0,.85),0 0 0 1px rgba(255,255,255,.06); }
    #__fr_box * { box-sizing:border-box; }
    .fr-head { display:flex; align-items:center; padding:12px 16px; cursor:grab; user-select:none; border-bottom:1px solid #1e1f22; flex-shrink:0; }
    .fr-title { flex:1; font-size:16px; font-weight:700; color:#fff; }
    .fr-x { background:transparent; border:none; color:#b5bac1; font-size:16px; cursor:pointer; padding:2px 6px; border-radius:4px; }
    .fr-x:hover { background:#da373c; color:#fff; }
    .fr-min { background:transparent; border:none; color:#b5bac1; cursor:pointer; padding:4px 6px; border-radius:4px; margin-right:8px; display:flex; align-items:center; }
    .fr-min svg { transition:transform .15s; }
    #__fr_box.min .fr-min svg { transform:rotate(-90deg); }
    .fr-min:hover { background:#4e5058; color:#fff; }
    #__fr_box.min { height:auto; width:460px; }
    #__fr_box.min .fr-bar, #__fr_box.min .fr-chips, #__fr_box.min .fr-adv, #__fr_box.min .fr-list, #__fr_box.min .fr-foot { display:none; }
    #__fr_box.min .fr-head { border-bottom:none; }

    .fr-bar { padding:10px 16px 8px; display:flex; flex-wrap:wrap; gap:8px; align-items:center; flex-shrink:0; }
    .fr-bar input, .fr-bar select { background:#1e1f22; color:#dbdee1; border:1px solid #2b2d31; border-radius:4px; padding:6px 8px; font-size:12px; outline:none; }
    .fr-bar input:focus, .fr-bar select:focus { border-color:#5865f2; }
    .fr-bar label { font-size:11px; color:#b5bac1; display:flex; align-items:center; gap:4px; }

    .fr-btn { background:#4e5058; color:#fff; border:none; border-radius:4px; padding:6px 10px; font-size:12px; font-weight:600; cursor:pointer; transition:background .15s; }
    .fr-btn:hover { background:#6d6f78; }
    .fr-btn.blue { background:#5865f2; } .fr-btn.blue:hover { background:#4752c4; }
    .fr-btn.red { background:#da373c; } .fr-btn.red:hover { background:#a12d31; }
    .fr-btn:disabled { opacity:.45; cursor:not-allowed; }

    .fr-chips { display:flex; flex-wrap:wrap; gap:6px; padding:0 16px 10px; flex-shrink:0; }
    .fr-chip { background:#1e1f22; color:#b5bac1; border:1px solid #2b2d31; border-radius:99px;
      padding:4px 10px; font-size:11px; font-weight:600; cursor:pointer; transition:all .12s; }
    .fr-chip:hover { border-color:#5865f2; color:#5865f2; }
    .fr-chip.active { background:rgba(88,101,242,.15); border-color:#5865f2; color:#fff; }

    .fr-adv { display:none; padding:10px 16px; gap:8px; flex-wrap:wrap; align-items:center; border-top:1px dashed #2b2d31; margin-top:2px; }
    .fr-adv.open { display:flex; }

    .fr-list { flex:1; overflow-y:auto; padding:6px 10px; background:#2b2d31; border-top:1px solid #1e1f22; }
    .fr-row { display:flex; align-items:center; gap:10px; padding:8px; border-radius:6px; cursor:pointer; border-bottom:1px solid #313338; transition:background .12s; }
    .fr-row:hover { background:#35373c; } .fr-row.sel { background:rgba(218,55,60,.15); }
    .fr-row.removing { opacity:0; transform:translateX(24px); }
    .fr-cb { accent-color:#da373c; width:16px; height:16px; flex-shrink:0; cursor:pointer; }
    .fr-av { width:40px; height:40px; border-radius:50%; flex-shrink:0; background:#1e1f22; }
    .fr-info { flex:1; min-width:0; }
    .fr-name { font-size:14px; font-weight:600; color:#fff; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; width:fit-content; max-width:100%; }
    .fr-name span { font-weight:400; color:#b5bac1; font-size:12px; margin-left:6px; }
    .fr-av, .fr-name { cursor:pointer; }
    .fr-name:hover { text-decoration:underline; }
    .fr-sub { font-size:11px; color:#b5bac1; margin-top:2px; }
    .fr-badges { display:flex; gap:4px; flex-shrink:0; }
    .fr-badge { font-size:11px; padding:1px 5px; border-radius:4px; line-height:1.4; }

    .fr-actions { display:flex; gap:6px; flex-shrink:0; }
    .fr-dm { background:transparent; border:1px solid #4e5058; color:#b5bac1; font-size:13px;
      padding:4px 8px; border-radius:4px; cursor:pointer; font-weight:600;
      transition:all .12s; line-height:1.2; }
    .fr-dm:hover { border-color:#5865f2; color:#5865f2; background:rgba(88,101,242,.08); }
    .fr-dm.loading { opacity:.6; cursor:wait; border-color:#5865f2; color:#5865f2; }
    .fr-row:hover .fr-dm { border-color:#5865f2; color:#5865f2; }

    .fr-rm { background:transparent; border:1px solid #4e5058; color:#b5bac1; font-size:12px;
      padding:4px 8px; border-radius:4px; cursor:pointer; font-weight:600;
      transition:all .12s; min-width:84px; }
    .fr-rm:hover { border-color:#da373c; color:#da373c; background:rgba(218,55,60,.08); }
    .fr-rm.armed { border-color:#da373c; color:#fff; background:#da373c; }
    .fr-rm.loading { opacity:.6; cursor:wait; }
    .fr-rm.err { border-color:#da373c; color:#da373c; background:rgba(218,55,60,.15); }
    .fr-row:hover .fr-rm:not(.armed):not(.loading):not(.err) { border-color:#da373c; color:#da373c; }

    .fr-foot { padding:10px 16px; border-top:1px solid #1e1f22; display:flex; align-items:center; gap:10px; flex-shrink:0; flex-wrap:wrap; }
    .fr-status { flex:1; font-size:12px; color:#b5bac1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; min-width:120px; }

    .fr-footbar { width:100%; height:4px; background:#1e1f22; border-radius:99px; overflow:hidden; margin-top:4px; display:none; }
    .fr-footbar.visible { display:block; }
    .fr-footbar > div { height:100%; width:0%; background:linear-gradient(90deg,#da373c,#ff6b6b); border-radius:99px; transition:width .4s ease; }

    .fr-empty { text-align:center; color:#b5bac1; padding:30px; font-size:13px; }
  `;
  document.head.append(style);

  // ── Build window ───────────────────────────────────────
  const box = document.createElement('div');
  box.id = '__fr_box';
  box.innerHTML = `
    <div class="fr-head">
      <button class="fr-min" title="Collapse"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 9l7 7 7-7"/></svg></button>
      <div class="fr-title">👥 Bulk Friend Remover</div>
      <button class="fr-x" title="Close">✕</button>
    </div>
    <div class="fr-bar">
      <input id="fr-q" placeholder="🔍 Search username / ID" style="flex:1;min-width:150px">
      <select id="fr-sort" title="Sort by">
        <option value="added">Date added</option>
        <option value="name">Name</option>
        <option value="created">Account created</option>
      </select>
      <button class="fr-btn" id="fr-dir" title="Descending" style="min-width:32px;font-size:14px;padding:4px 8px">↓</button>
      <label class="fr-selall" style="cursor:pointer;font-size:12px;color:#dbdee1;background:#1e1f22;border:1px solid #2b2d31;border-radius:4px;padding:5px 8px">
        <input type="checkbox" id="fr-selall" class="fr-cb" style="width:14px;height:14px"> Select all
      </label>
      <button class="fr-btn" id="fr-adv-toggle" title="Advanced filters" style="font-size:14px;padding:4px 10px">⚙</button>
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
    <div class="fr-foot">
      <div class="fr-status" id="fr-status"></div>
      <button class="fr-btn red" id="fr-del" disabled>🗑 Remove selected</button>
      <div class="fr-footbar" id="fr-footbar"><div></div></div>
    </div>`;
  document.body.append(box);

  const $ = id => box.querySelector('#' + id);
  const listEl = $('fr-list'), statusEl = $('fr-status'), delBtn = $('fr-del');
  const footbar = $('fr-footbar'), footbarFill = footbar.firstElementChild;
  let busy = false, visibleList = [], sortDir = prefs.dir === 'asc' ? 'asc' : 'desc', activeChip = prefs.chip || 'all';

  // ── Restore prefs ──────────────────────────────────────
  $('fr-sort').value = prefs.sort || 'added';
  $('fr-av').value   = prefs.av || 'all';
  if (prefs.from) $('fr-from').value = prefs.from;
  if (prefs.to)   $('fr-to').value   = prefs.to;
  $('fr-dir').textContent = sortDir === 'desc' ? '↓' : '↑';
  $('fr-dir').title       = sortDir === 'desc' ? 'Descending' : 'Ascending';
  [...document.querySelectorAll('#fr-chips .fr-chip')].forEach(c => {
    c.classList.toggle('active', c.dataset.chip === activeChip);
  });

  const saveCurrentPrefs = () => savePrefs({
    sort: $('fr-sort').value, dir: sortDir,
    av: $('fr-av').value, from: $('fr-from').value, to: $('fr-to').value,
    chip: activeChip,
  });

  // ── Drag ───────────────────────────────────────────────
  const head = box.querySelector('.fr-head');
  let drag = null;
  head.addEventListener('mousedown', e => {
    if (e.target.closest('.fr-x, .fr-min')) return;
    const r = box.getBoundingClientRect();
    drag = { dx: e.clientX - r.left, dy: e.clientY - r.top };
    head.style.cursor = 'grabbing';
    e.preventDefault();
  });
  const onMove = e => {
    if (!drag) return;
    const x = Math.min(Math.max(0, e.clientX - drag.dx), innerWidth - 60);
    const y = Math.min(Math.max(0, e.clientY - drag.dy), innerHeight - 40);
    box.style.left = x + 'px'; box.style.top = y + 'px';
  };
  const onUp = () => { drag = null; head.style.cursor = 'grab'; };
  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onUp);

  // ── Collapse / expand ──────────────────────────────────
  const minBtn = box.querySelector('.fr-min');
  const toggleMin = () => {
    const m = box.classList.toggle('min');
    minBtn.title = m ? 'Expand' : 'Collapse';
  };
  minBtn.onclick = toggleMin;
  head.addEventListener('dblclick', e => { if (!e.target.closest('.fr-x, .fr-min')) toggleMin(); });

  // ── Close ──────────────────────────────────────────────
  box.querySelector('.fr-x').onclick = () => {
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
    box.remove(); style.remove();
    document.getElementById('__fr_progress')?.remove();
  };

  $('fr-adv-toggle').onclick = () => $('fr-adv').classList.toggle('open');

  // ── Filter / sort / render ─────────────────────────────
  const getVisible = () => {
    const q = $('fr-q').value.trim().toLowerCase();
    const av = $('fr-av').value;
    const from = $('fr-from').value ? new Date($('fr-from').value + 'T00:00:00') : null;
    const to = $('fr-to').value ? new Date($('fr-to').value + 'T23:59:59') : null;

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
        <div class="fr-sub">Friends since ${fmtDate(f.since)} (${fmtRelative(f.since)}) · Account created ${fmtDate(f.created)} (${fmtRelative(f.created)})</div>
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
    listEl.innerHTML = visibleList.length
      ? visibleList.map(rowHtml).join('')
      : `<div class="fr-empty">No friends match the filters.</div>`;
    updateFooter();
  };

  // ── Inline footer progress bar helpers ─────────────────
  const showFootbar  = () => { footbar.classList.add('visible'); };
  const hideFootbar  = () => { footbar.classList.remove('visible'); setTimeout(() => { footbarFill.style.width = '0%'; }, 400); };
  const setFootbar   = (pct) => { footbarFill.style.width = Math.max(0, Math.min(100, pct)) + '%'; };

  // ── Remove one friend (2-step inline) ──────────────────
  async function removeOne(id, btn, row) {
    if (busy) return;
    const f = friends.find(x => x.id === id);
    if (!f) return;
    const name = displayName(f.user);

    busy = true;
    updateFooter(`🗑 Removing ${name}…`);
    let msg;
    try {
      const r = await apiFetch(`${BASE}/users/@me/relationships/${id}`, { method: 'DELETE' },
        ({ waitMs, attempt, max }) => {
          updateFooter(`🐢 Rate limited — retry ${attempt}/${max} in ${(waitMs/1000).toFixed(1)}s`);
        });
      if (r.status === 204 || r.status === 200) {
        friends = friends.filter(x => x.id !== id);
        selected.delete(id);
        msg = `✅ ${name} removed.`;
        console.log(`✅ Removed: ${name} (${id})`);
        if (row) {
          row.style.transition = 'opacity .25s, transform .25s, max-height .25s, padding .25s';
          row.style.opacity = '0';
          row.style.transform = 'translateX(24px)';
          row.style.maxHeight = row.offsetHeight + 'px';
          requestAnimationFrame(() => {
            row.style.maxHeight = '0';
            row.style.paddingTop = '0';
            row.style.paddingBottom = '0';
            row.style.borderBottom = 'none';
          });
          setTimeout(() => {
            const top = listEl.scrollTop;
            render();
            listEl.scrollTop = top;
          }, 260);
        }
      } else {
        msg = `⚠️ Failed (${r.status}): ${name}`;
        if (btn) { btn.classList.add('err'); btn.textContent = '✕ Failed'; }
      }
    } catch (e) {
      msg = `⚠️ ${e.message}`;
      if (btn) { btn.classList.add('err'); btn.textContent = '✕ Failed'; }
    }
    busy = false;
    if (!box.isConnected) return;
    updateFooter(msg);
  }

  // ── List clicks ────────────────────────────────────────
  listEl.addEventListener('click', async e => {
    const row = e.target.closest('.fr-row');
    if (!row) return;
    const id = row.dataset.id;

    // Profile open
    if (e.target.closest('.fr-av, .fr-name')) { openProfile(id); return; }

    // Open DM
    const dmBtn = e.target.closest('.fr-dm');
    if (dmBtn) {
      e.stopPropagation();
      if (dmBtn.classList.contains('loading')) return;
      dmBtn.classList.add('loading');
      const prev = dmBtn.textContent;
      dmBtn.textContent = '…';
      try {
        const ok = await openDM(id);
        if (!ok) {
          dmBtn.textContent = '⚠';
          dmBtn.style.color = '#da373c';
          dmBtn.style.borderColor = '#da373c';
          setTimeout(() => {
            if (dmBtn.isConnected) {
              dmBtn.classList.remove('loading');
              dmBtn.textContent = prev;
              dmBtn.style.color = '';
              dmBtn.style.borderColor = '';
            }
          }, 1500);
          return;
        }
      } catch (err) {
        console.warn('⚠️ openDM error:', err);
      }
      setTimeout(() => {
        if (dmBtn.isConnected) {
          dmBtn.classList.remove('loading');
          dmBtn.textContent = prev;
        }
      }, 400);
      return;
    }

    // Inline 2-step remove
    const rmBtn = e.target.closest('.fr-rm');
    if (rmBtn) {
      e.stopPropagation();
      if (rmBtn.classList.contains('loading') || rmBtn.classList.contains('err')) return;

      if (!rmBtn.dataset.armed) {
        rmBtn.dataset.armed = '1';
        rmBtn.classList.add('armed');
        rmBtn.textContent = '⚠ sure?';
        rmBtn._timer = setTimeout(() => {
          delete rmBtn.dataset.armed;
          rmBtn.classList.remove('armed');
          rmBtn.textContent = '🗑 Remove';
        }, 3000);
        return;
      }
      clearTimeout(rmBtn._timer);
      delete rmBtn.dataset.armed;
      rmBtn.classList.remove('armed');
      rmBtn.classList.add('loading');
      rmBtn.textContent = '…';
      await removeOne(id, rmBtn, row);
      return;
    }

    // Toggle selection
    const cb = row.querySelector('.fr-cb');
    if (e.target !== cb) cb.checked = !cb.checked;
    cb.checked ? selected.add(id) : selected.delete(id);
    row.classList.toggle('sel', cb.checked);
    updateFooter();
  });

  // ── Filter handlers ────────────────────────────────────
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

  // ── Bulk delete (overlay + footer bar) ─────────────────
  delBtn.onclick = async () => {
    if (busy || !selected.size) return;
    const targets = friends.filter(f => selected.has(f.id));

    const ok = await confirmDialog({
      title: `Remove ${targets.length} friend${targets.length > 1 ? 's' : ''}?`,
      message: `You're about to permanently remove <b style="color:#fff">${targets.length}</b> friend${targets.length > 1 ? 's' : ''} from your list.<br><br>
        <span style="color:#faa61a">⚠️ This action cannot be undone.</span>`,
      confirmLabel: `🗑 Remove ${targets.length}`,
      cancelLabel: 'Cancel',
      danger: true,
    });
    if (!ok) return;

    busy = true;
    delBtn.disabled = true;
    showFootbar();
    setFootbar(0);

    const progress = createProgressOverlay();
    progress.update(0, targets.length, '', 0);

    let okCount = 0, errCount = 0;
    const startTime = Date.now();

    for (const f of targets) {
      if (progress.isCancelled() || !box.isConnected) break;

      const pct = (okCount / targets.length) * 100;
      setFootbar(pct);
      progress.update(okCount, targets.length, displayName(f.user), errCount);

      try {
        const r = await apiFetch(`${BASE}/users/@me/relationships/${f.id}`, { method: 'DELETE' },
          ({ waitMs, attempt, max }) => {
            progress.setRateLimit(waitMs, attempt, max);
            statusEl.textContent = `🐢 Rate limited — retry ${attempt}/${max} in ${(waitMs/1000).toFixed(1)}s`;
          });
        progress.clearRateLimit();
        if (r.status === 204 || r.status === 200) {
          okCount++;
          friends = friends.filter(x => x.id !== f.id);
          selected.delete(f.id);
          console.log(`✅ Removed: ${displayName(f.user)} (${f.id})`);
        } else {
          errCount++;
          console.warn(`⚠️ Failed (${r.status}): ${displayName(f.user)}`);
        }
      } catch (e) { errCount++; console.warn('⚠️', e.message); }

      const base = errCount > 0 ? 1400 : 900;
      await sleep(base + Math.random() * 400);
    }

    setFootbar(100);
    progress.finish(okCount, targets.length, errCount, progress.isCancelled());
    busy = false;
    if (!box.isConnected) return;
    const top = listEl.scrollTop;
    render();
    listEl.scrollTop = top;
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    updateFooter(`${progress.isCancelled() ? '⛔ Cancelled' : '✅ Done'} — ${okCount} removed${errCount ? `, ${errCount} error(s)` : ''} in ${elapsed}s.`);
    hideFootbar();
  };

  render();
  console.log('%c✅ Friend Remover v3.2 ready', 'color:green;font-weight:bold;font-size:16px');
})().catch(e => console.error('❌', e.message));
