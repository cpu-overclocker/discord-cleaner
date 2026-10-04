// ============================================================
//  Discord — Leave your group DMs (GDM)
//  ✨ Solo button    : select groups where you're the only member
//  ✨ Open button ↗  : open the group chat to check
//  ✨ Silent toggle  : persistent via localStorage
//  ✨ Per-row 🗑     : delete a single group inline (2-step confirm)
// ============================================================

const isValidToken = t => typeof t === "string" && /^[A-Za-z0-9_-]{20,}\.[\w-]{4,}\.[\w-]{20,}$/.test(t);

// ── Automatic token extraction ───────────────────────────────
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

  throw new Error("Token not found — are you logged in on discord.com/app ?");
})();

const BASE  = "https://discord.com/api/v10";
const HEADS = { Authorization: TOKEN, "Content-Type": "application/json" };
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ── Persistent preference: silent mode ───────────────────────
const SILENT_KEY = '__group_leaver_silent';
const loadSilentPref = () => {
  try { const v = localStorage.getItem(SILENT_KEY); return v === null ? true : v === '1'; }
  catch { return true; }
};
const saveSilentPref = (v) => { try { localStorage.setItem(SILENT_KEY, v ? '1' : '0'); } catch {} };

async function apiFetch(url, opts = {}) {
  while (true) {
    const r = await fetch(url, { headers: HEADS, ...opts });
    if (r.status === 429) {
      const body = await r.json().catch(() => ({}));
      await sleep((body.retry_after ?? 1) * 1000);
      continue;
    }
    return r;
  }
}

// ── Group helpers ────────────────────────────────────────────
const isSoloGroup = ch => (ch.recipients?.length ?? 0) === 0;
const groupSize   = ch => (ch.recipients?.length ?? 0) + 1;

function groupName(ch) {
  if (ch.name) return ch.name;
  if (ch.recipients?.length > 0)
    return ch.recipients.map(u => u.global_name || u.username).join(", ");
  return `Unnamed group (${ch.id})`;
}

// ── Fetch ────────────────────────────────────────────────────
async function fetchGroups() {
  console.log("📥 Fetching your groups...");
  const r = await apiFetch(`${BASE}/users/@me/channels`);
  if (!r.ok) throw new Error(`Could not fetch channels (${r.status})`);
  const channels = await r.json();
  const groups   = channels.filter(ch => ch.type === 3);
  const solo     = groups.filter(isSoloGroup).length;
  console.log(`  → ${channels.length} channel/DM total`);
  console.log(`  → ${groups.length} group(s) found, ${solo} where you're the only member`);
  return groups;
}

// ── Navigation ───────────────────────────────────────────────
function navigateToGroup(channelId) {
  const path = `/channels/@me/${channelId}`;
  if (location.pathname === path) { console.log("📍 Already on this group."); return; }
  history.pushState({}, '', path);
  window.dispatchEvent(new PopStateEvent('popstate', { state: {} }));
  console.log(`🧭 Opening group ${channelId}`);
}

// ── Delete a single group ────────────────────────────────────
async function leaveOne(group, silent = true) {
  const name = groupName(group);
  const url  = `${BASE}/channels/${group.id}${silent ? '?silent=true' : ''}`;
  console.log(`🚪 [single] Leaving : ${name} (${group.id}) ${silent ? '🔇' : '🔔'}`);

  const r = await fetch(url, { method: "DELETE", headers: HEADS });

  if (r.status === 200 || r.status === 204) { console.log(`  ✅ Left : ${name}`); return true; }

  if (r.status === 429) {
    const body = await r.json().catch(() => ({}));
    const wait = (body.retry_after ?? 1) * 1000 + 500;
    console.warn(`  ⏳ Rate limit — waiting ${wait}ms`);
    await sleep(wait);
    const r2 = await fetch(url, { method: "DELETE", headers: HEADS });
    if (r2.status === 200 || r2.status === 204) { console.log(`  ✅ Left (retry) : ${name}`); return true; }
    console.warn(`  ⚠️  Retry failed (${r2.status}) : ${name}`);
    return false;
  }

  console.warn(`  ⚠️  Failed (${r.status}) : ${name}`);
  return false;
}

// ── Selection popup ──────────────────────────────────────────
function showConfirmDialog(groupsPromise) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.id = '__group_leaver_overlay';
    Object.assign(overlay.style, {
      position: 'fixed', inset: '0',
      background: 'transparent', pointerEvents: 'none',
      zIndex: '99999', fontFamily: '"gg sans", "Noto Sans", sans-serif',
    });

    const box = document.createElement('div');
    Object.assign(box.style, {
      background: '#313338', borderRadius: '12px', padding: '0',
      width: '560px', maxHeight: '85vh',
      boxShadow: '0 12px 48px rgba(0,0,0,0.85), 0 0 0 1px rgba(255,255,255,0.06)',
      color: '#dbdee1', textAlign: 'center',
      position: 'fixed', top: '50%', left: '50%',
      transform: 'translate(-50%, -50%)',
      zIndex: '100000',
      display: 'flex', flexDirection: 'column',
      userSelect: 'none', pointerEvents: 'auto',
    });

    // ── Drag handle ──────────────────────────────────────────
    const dragHandle = document.createElement('div');
    Object.assign(dragHandle.style, {
      display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
      padding: '10px 14px 0 14px', cursor: 'grab', flexShrink: '0',
    });

    const btnX = document.createElement('button');
    btnX.textContent = '✕';
    Object.assign(btnX.style, {
      background: 'transparent', border: 'none',
      color: '#b5bac1', fontSize: '16px', cursor: 'pointer',
      lineHeight: '1', padding: '2px 4px', borderRadius: '4px',
      transition: 'color 0.15s, background 0.15s',
    });
    btnX.onmouseenter = () => { btnX.style.color = '#fff'; btnX.style.background = '#da373c'; };
    btnX.onmouseleave = () => { btnX.style.color = '#b5bac1'; btnX.style.background = 'transparent'; };
    btnX.onclick = (e) => { e.stopPropagation(); cleanup(null); };

    dragHandle.append(btnX);
    box.append(dragHandle);

    const boxContent = document.createElement('div');
    Object.assign(boxContent.style, {
      padding: '8px 32px 28px 32px', overflowY: 'auto', flex: '1',
    });

    // ── Drag logic ───────────────────────────────────────────
    let isDragging = false, dragOffX = 0, dragOffY = 0;
    dragHandle.addEventListener('mousedown', (e) => {
      if (e.target === btnX) return;
      isDragging = true;
      dragHandle.style.cursor = 'grabbing';
      const rect = box.getBoundingClientRect();
      box.style.transform = 'none';
      box.style.top  = rect.top  + 'px';
      box.style.left = rect.left + 'px';
      dragOffX = e.clientX - rect.left;
      dragOffY = e.clientY - rect.top;
      e.preventDefault();
    });
    document.addEventListener('mousemove', (e) => {
      if (!isDragging) return;
      box.style.left = (e.clientX - dragOffX) + 'px';
      box.style.top  = (e.clientY - dragOffY) + 'px';
    });
    document.addEventListener('mouseup', () => {
      if (!isDragging) return;
      isDragging = false;
      dragHandle.style.cursor = 'grab';
    });

    const loadingText = document.createElement('div');
    loadingText.textContent = 'Loading...';
    Object.assign(loadingText.style, { fontSize: '14px', color: '#b5bac1' });

    const cleanup = (result) => { overlay.remove(); box.remove(); resolve(result); };

    boxContent.append(loadingText);
    box.append(boxContent);
    overlay.append(box);
    document.body.append(overlay);

    const makeBtn = (text, bg, hoverBg) => {
      const b = document.createElement('button');
      b.textContent = text;
      Object.assign(b.style, {
        flex: '1', padding: '10px', borderRadius: '4px', border: 'none',
        background: bg, color: '#fff', fontSize: '14px', fontWeight: '600',
        cursor: 'pointer', transition: 'background 0.15s',
      });
      b.onmouseenter = () => b.style.background = hoverBg;
      b.onmouseleave = () => b.style.background = bg;
      return b;
    };

    // ── Global styles ────────────────────────────────────────
    const cbStyle = document.createElement('style');
    cbStyle.textContent = `
      .__glcb { accent-color: #5865f2; width: 16px; height: 16px; cursor: pointer; flex-shrink: 0; }
      .__glrow { cursor: pointer; transition: background 0.12s; }
      .__glrow:hover { background: #2b2d31 !important; }
      .__glrow:hover .__glopen { background: #5865f2 !important; color: #fff !important; border-color: #5865f2 !important; }
      .__glrow:hover .__gldel  { color: #da373c !important; border-color: #da373c !important; }
      .__glsolo { background: rgba(250,166,26,0.06); }
      .__glsilentrow { transition: border-color 0.15s, background 0.15s; }
      .__glsilentrow:hover { border-color: #5865f2 !important; }
    `;
    document.head.append(cbStyle);

    groupsPromise.then(groups => {
      if (!document.body.contains(overlay)) return;
      boxContent.innerHTML = '';

      const initialTotal = groups.length;
      const initialSolo  = groups.filter(isSoloGroup).length;

      const icon = document.createElement('div');
      Object.assign(icon.style, { fontSize: '40px', marginBottom: '12px' });

      const title = document.createElement('div');
      Object.assign(title.style, { fontSize: '20px', fontWeight: '700', color: '#fff', marginBottom: '6px' });

      const desc = document.createElement('div');
      Object.assign(desc.style, { fontSize: '13px', color: '#b5bac1', marginBottom: '14px', lineHeight: '1.4' });

      const row = document.createElement('div');
      Object.assign(row.style, { display: 'flex', gap: '12px', justifyContent: 'center', marginTop: '16px' });

      // ── Empty case ────────────────────────────────────────
      if (groups.length === 0) {
        icon.textContent = '💬';
        title.textContent = 'No groups found';
        desc.textContent  = "You're not in any Discord group.";
        const btnClose = makeBtn('✕ Close', '#4e5058', '#6d6f78');
        btnClose.style.flex = '0 0 auto';
        btnClose.onclick = () => cleanup(null);
        row.append(btnClose);
        boxContent.append(icon, title, desc, row);
        return;
      }

      icon.textContent = '🚪';
      title.textContent = 'Choose groups to leave';
      desc.innerHTML = `
        You're in <b style="color:#fff">${initialTotal}</b> group${initialTotal > 1 ? 's' : ''}${
          initialSolo > 0 ? ` (<b style="color:#faa61a">${initialSolo}</b> where you're alone)` : ''
        }.<br>
        Check the ones to leave — <span style="color:#b5bac1">click a name or the </span>
        <span style="color:#5865f2;font-weight:700">↗</span>
        <span style="color:#b5bac1"> icon to open the chat, or </span>
        <span style="color:#da373c;font-weight:700">🗑</span>
        <span style="color:#b5bac1"> to delete a single group.</span>`;

      // ── Selection counter ─────────────────────────────────
      const selCount = document.createElement('div');
      Object.assign(selCount.style, {
        fontSize: '13px', color: '#5865f2', fontWeight: '600', marginBottom: '10px',
      });

      const checkboxMap = new Map();

      const updateSelCount = () => {
        const entries = [...checkboxMap.values()];
        const curTotal = entries.length;
        const n        = entries.filter(e => e.checkbox.checked).length;
        const nSolo    = entries.filter(e => e.checkbox.checked && isSoloGroup(e.group)).length;

        if (curTotal === 0) {
          selCount.textContent = 'All groups have been left 🎉';
        } else {
          selCount.textContent = `${n} / ${curTotal} group${curTotal > 1 ? 's' : ''} selected` +
            (nSolo > 0 ? `  ·  👤 ${nSolo} solo` : '');
        }
        btnConfirm.disabled = n === 0;
        btnConfirm.style.opacity = n === 0 ? '0.45' : '1';
        btnConfirm.style.cursor  = n === 0 ? 'not-allowed' : 'pointer';
        btnConfirm.textContent = n === 0
          ? '🚪 Leave selection'
          : `🚪 Leave ${n} group${n > 1 ? 's' : ''} ${silentCb.checked ? '🔇' : '🔔'}`;
      };

      // ── "Select" bar ──────────────────────────────────────
      const selectBar = document.createElement('div');
      Object.assign(selectBar.style, {
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        marginBottom: '8px', gap: '6px', flexWrap: 'wrap',
      });

      const selectLabel = document.createElement('span');
      Object.assign(selectLabel.style, { fontSize: '12px', color: '#b5bac1' });
      selectLabel.textContent = 'Select:';

      const btnSelectSolo   = document.createElement('button');
      const btnSelectAll    = document.createElement('button');
      const btnDeselectAll  = document.createElement('button');

      const miniBtnStyle = {
        background: 'transparent', border: '1px solid #4e5058',
        borderRadius: '4px', color: '#b5bac1', fontSize: '11px',
        padding: '3px 8px', cursor: 'pointer', fontWeight: '600',
        transition: 'border-color 0.12s, color 0.12s, background 0.12s',
      };
      [btnSelectSolo, btnSelectAll, btnDeselectAll].forEach(b => {
        Object.assign(b.style, miniBtnStyle);
        b.onmouseenter = () => { b.style.borderColor = '#5865f2'; b.style.color = '#5865f2'; };
        b.onmouseleave = () => { b.style.borderColor = '#4e5058'; b.style.color = '#b5bac1'; };
      });

      btnSelectSolo.textContent   = `👤 Solo${initialSolo > 0 ? ` (${initialSolo})` : ''}`;
      btnSelectSolo.title         = "Select only groups where you're the only member";
      btnSelectAll.textContent    = '✔ All';
      btnSelectAll.title          = 'Select all';
      btnDeselectAll.textContent  = '✘ None';
      btnDeselectAll.title        = 'Deselect all';

      btnSelectSolo.onclick = () => { checkboxMap.forEach(e => { e.checkbox.checked = isSoloGroup(e.group); }); updateSelCount(); };
      btnSelectAll.onclick  = () => { checkboxMap.forEach(e => { e.checkbox.checked = true;  }); updateSelCount(); };
      btnDeselectAll.onclick= () => { checkboxMap.forEach(e => { e.checkbox.checked = false; }); updateSelCount(); };

      if (initialSolo === 0) {
        btnSelectSolo.disabled = true;
        btnSelectSolo.style.opacity = '0.4';
        btnSelectSolo.style.cursor  = 'not-allowed';
      }

      const btnGroup = document.createElement('span');
      Object.assign(btnGroup.style, { display: 'flex', gap: '6px' });
      btnGroup.append(btnSelectSolo, btnSelectAll, btnDeselectAll);
      selectBar.append(selectLabel, btnGroup);

      // ── List ──────────────────────────────────────────────
      const list = document.createElement('div');
      Object.assign(list.style, {
        background: '#1e1f22', borderRadius: '8px',
        padding: '4px 14px', marginBottom: '4px',
        maxHeight: '280px', overflowY: 'auto', textAlign: 'left',
      });

      for (const g of groups) {
        const solo = isSoloGroup(g);

        const item = document.createElement('div');
        item.className = '__glrow' + (solo ? ' __glsolo' : '');
        Object.assign(item.style, {
          display: 'flex', alignItems: 'center', gap: '10px',
          padding: '7px 4px', borderBottom: '1px solid #2b2d31',
          fontSize: '13px', color: '#dbdee1', borderRadius: '4px',
        });

        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.className = '__glcb';
        cb.checked = false;
        cb.onchange = updateSelCount;

        // Open chat button
        const openBtn = document.createElement('button');
        openBtn.textContent = '↗';
        openBtn.className = '__glopen';
        openBtn.title = 'Open this group in Discord';
        Object.assign(openBtn.style, {
          background: 'transparent', border: '1px solid #4e5058',
          borderRadius: '4px', color: '#b5bac1', fontSize: '12px',
          lineHeight: '1', padding: '3px 7px', cursor: 'pointer',
          flexShrink: '0', transition: 'all 0.12s', fontWeight: '700',
        });
        openBtn.onclick = (e) => { e.stopPropagation(); navigateToGroup(g.id); };

        // Per-row delete button (2-step confirm)
        const delBtn = document.createElement('button');
        delBtn.textContent = '🗑';
        delBtn.className = '__gldel';
        delBtn.title = 'Delete this group (click twice to confirm)';
        Object.assign(delBtn.style, {
          background: 'transparent', border: '1px solid #4e5058',
          borderRadius: '4px', color: '#b5bac1', fontSize: '12px',
          lineHeight: '1', padding: '3px 7px', cursor: 'pointer',
          flexShrink: '0', transition: 'all 0.12s', fontWeight: '700',
        });

        let delArmed = false;
        let delTimer = null;
        const resetDelBtn = () => {
          delArmed = false;
          delBtn.textContent = '🗑';
          delBtn.style.borderColor = '#4e5058';
          delBtn.style.color = '#b5bac1';
          delBtn.style.background = 'transparent';
          delBtn.title = 'Delete this group (click twice to confirm)';
          delBtn.disabled = false;
        };

        delBtn.onclick = async (e) => {
          e.stopPropagation();

          // First click → arm the button
          if (!delArmed) {
            delArmed = true;
            delBtn.textContent = '⚠ sure?';
            delBtn.style.borderColor = '#da373c';
            delBtn.style.color = '#da373c';
            delBtn.style.background = 'rgba(218,55,60,0.12)';
            delBtn.title = 'Click again to confirm deletion';
            delTimer = setTimeout(resetDelBtn, 3000);
            return;
          }

          // Second click → perform deletion
          clearTimeout(delTimer);
          delArmed = false;
          delBtn.disabled = true;
          delBtn.textContent = '…';

          const ok = await leaveOne(g, silentCb.checked);

          if (ok) {
            // Animate the row out
            item.style.transition = 'opacity 0.25s, transform 0.25s, max-height 0.25s, padding 0.25s, margin 0.25s';
            item.style.opacity   = '0';
            item.style.transform = 'translateX(24px)';
            item.style.maxHeight = item.offsetHeight + 'px';
            // Force reflow then collapse
            requestAnimationFrame(() => {
              item.style.maxHeight = '0';
              item.style.paddingTop = '0';
              item.style.paddingBottom = '0';
              item.style.borderBottom = 'none';
            });
            setTimeout(() => {
              item.remove();
              checkboxMap.delete(g.id);
              updateSelCount();
            }, 280);
          } else {
            delBtn.textContent = '✕';
            delBtn.style.borderColor = '#da373c';
            delBtn.style.color = '#da373c';
            delBtn.style.background = 'rgba(218,55,60,0.12)';
            delBtn.title = 'Deletion failed — try again';
            setTimeout(resetDelBtn, 2000);
          }
        };

        const ico = document.createElement('div');
        if (g.icon) {
          const img = document.createElement('img');
          img.src = `https://cdn.discordapp.com/channel-icons/${g.id}/${g.icon}.webp?size=32`;
          img.style.cssText = 'width:28px;height:28px;border-radius:50%;flex-shrink:0;';
          ico.append(img);
        } else {
          ico.textContent = '👥';
          Object.assign(ico.style, {
            width: '28px', height: '28px', borderRadius: '50%',
            background: solo ? '#faa61a' : '#5865f2',
            display: 'flex', alignItems: 'center',
            justifyContent: 'center', fontSize: '15px', flexShrink: '0',
          });
        }

        const nameEl = document.createElement('span');
        nameEl.textContent = groupName(g);
        Object.assign(nameEl.style, {
          flex: '1', overflow: 'hidden', textOverflow: 'ellipsis',
          whiteSpace: 'nowrap', cursor: 'pointer', borderRadius: '3px',
          padding: '1px 3px', transition: 'color 0.12s, background 0.12s',
        });
        nameEl.title = 'Open this group';
        nameEl.onmouseenter = () => { nameEl.style.color = '#5865f2'; nameEl.style.background = 'rgba(88,101,242,0.12)'; };
        nameEl.onmouseleave = () => { nameEl.style.color = ''; nameEl.style.background = ''; };
        nameEl.onclick = (e) => { e.stopPropagation(); navigateToGroup(g.id); };

        item.onclick = (e) => {
          if (e.target === cb || e.target === nameEl || e.target === openBtn || e.target === delBtn) return;
          if (openBtn.contains(e.target) || delBtn.contains(e.target)) return;
          cb.checked = !cb.checked;
          updateSelCount();
        };

        let soloBadge = null;
        if (solo) {
          soloBadge = document.createElement('span');
          soloBadge.textContent = '👤 solo';
          Object.assign(soloBadge.style, {
            fontSize: '10px', color: '#faa61a',
            background: 'rgba(250,166,26,0.12)',
            border: '1px solid rgba(250,166,26,0.35)',
            borderRadius: '4px', padding: '1px 5px',
            flexShrink: '0', fontWeight: '600', whiteSpace: 'nowrap',
          });
          soloBadge.title = "You're the only member of this group";
        }

        const cnt = document.createElement('span');
        cnt.textContent = `👤 ${groupSize(g)}`;
        Object.assign(cnt.style, { fontSize: '11px', color: '#b5bac1', flexShrink: '0' });
        cnt.title = `${groupSize(g)} member${groupSize(g) > 1 ? 's' : ''} (you included)`;

        item.append(cb, ico, nameEl);
        if (soloBadge) item.append(soloBadge);
        item.append(cnt, openBtn, delBtn);
        list.append(item);

        checkboxMap.set(g.id, { checkbox: cb, group: g, row: item });
      }

      // ── Silent mode toggle ────────────────────────────────
      const silentRow = document.createElement('label');
      silentRow.className = '__glsilentrow';
      Object.assign(silentRow.style, {
        display: 'flex', alignItems: 'center', gap: '10px',
        padding: '10px 12px', marginTop: '12px',
        background: '#1e1f22', borderRadius: '8px',
        cursor: 'pointer', fontSize: '13px', color: '#dbdee1',
        textAlign: 'left', border: '1px solid #1e1f22',
      });

      const silentCb = document.createElement('input');
      silentCb.type = 'checkbox';
      silentCb.className = '__glcb';
      silentCb.checked = loadSilentPref();
      silentCb.onchange = () => {
        saveSilentPref(silentCb.checked);
        updateSelCount();
      };

      const silentTextWrap = document.createElement('div');
      silentTextWrap.style.cssText = 'flex:1;min-width:0;';

      const silentTitle = document.createElement('div');
      silentTitle.textContent = '🔇 Leave in silent mode';
      silentTitle.style.cssText = 'font-weight:600;color:#fff;margin-bottom:2px;font-size:13px;';

      const silentDesc = document.createElement('div');
      silentDesc.textContent = "No notification will be sent to the other group members.";
      silentDesc.style.cssText = 'font-size:11px;color:#b5bac1;line-height:1.3;';

      silentTextWrap.append(silentTitle, silentDesc);
      silentRow.append(silentCb, silentTextWrap);

      // ── Confirm buttons ───────────────────────────────────
      const btnCancel  = makeBtn('Cancel', '#4e5058', '#6d6f78');
      const btnConfirm = makeBtn('🚪 Leave selection', '#da373c', '#a12d31');
      btnConfirm.disabled = true;
      btnConfirm.style.opacity = '0.45';
      btnConfirm.style.cursor  = 'not-allowed';
      Object.assign(btnConfirm.style, { flex: '2' });

      btnCancel.onclick  = () => cleanup(null);
      btnConfirm.onclick = () => {
        if (btnConfirm.disabled) return;
        const selected = [...checkboxMap.values()]
          .filter(e => e.checkbox.checked)
          .map(e => e.group);
        cleanup({ groups: selected, silent: silentCb.checked });
      };

      row.append(btnCancel, btnConfirm);
      updateSelCount();
      boxContent.append(icon, title, desc, selectBar, selCount, list, silentRow, row);

    }).catch(() => {
      if (!document.body.contains(overlay)) return;
      boxContent.innerHTML = '';
      const errText = document.createElement('div');
      errText.textContent = 'Error while loading groups.';
      Object.assign(errText.style, { fontSize: '14px', color: '#ed4245', marginBottom: '16px' });
      const btnClose = document.createElement('button');
      btnClose.textContent = '✕ Close';
      Object.assign(btnClose.style, {
        padding: '10px 20px', borderRadius: '4px', border: 'none',
        background: '#4e5058', color: '#fff', fontSize: '14px',
        fontWeight: '600', cursor: 'pointer',
      });
      btnClose.onclick = () => cleanup(null);
      boxContent.append(errText, btnClose);
    });
  });
}

// ── Progress overlay ─────────────────────────────────────────
function createProgressOverlay(silent) {
  document.getElementById('__group_progress_overlay')?.remove();

  const overlay = document.createElement('div');
  overlay.id = '__group_progress_overlay';
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
  titleIcon.textContent = '🚪';
  titleIcon.style.fontSize = '18px';

  const titleText = document.createElement('span');
  titleText.textContent = `${silent ? 'Silent' : 'Normal'} leave in progress…`;
  Object.assign(titleText.style, { fontSize: '15px', fontWeight: '700', color: '#fff', flex: '1' });

  const modeBadge = document.createElement('span');
  modeBadge.textContent = silent ? '🔇' : '🔔';
  modeBadge.title = silent ? 'Silent mode enabled' : 'Normal mode — members will be notified';
  Object.assign(modeBadge.style, {
    fontSize: '14px', padding: '2px 6px',
    background: silent ? 'rgba(35,165,90,0.15)' : 'rgba(250,166,26,0.15)',
    border: `1px solid ${silent ? 'rgba(35,165,90,0.4)' : 'rgba(250,166,26,0.4)'}`,
    borderRadius: '4px', flexShrink: '0',
  });

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
  titleRow.append(titleIcon, titleText, modeBadge, btnClose);

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

  const currentGroupLine = document.createElement('div');
  Object.assign(currentGroupLine.style, { fontSize: '12px', color: '#b5bac1', marginTop: '6px', minHeight: '16px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' });

  overlay.append(titleRow, statusLine, barTrack, currentGroupLine);
  document.body.append(overlay);

  const update = (done, total, currentName, errors) => {
    statusLine.textContent = `Left: ${done}/${total}${errors > 0 ? `  ⚠️ ${errors} error${errors > 1 ? 's' : ''}` : ''}`;
    barFill.style.width = `${total > 0 ? Math.round((done / total) * 100) : 0}%`;
    currentGroupLine.textContent = currentName ? `⏳ ${currentName}` : '';
  };

  const finish = (done, total, errors, cancelled = false) => {
    titleText.textContent = cancelled ? 'Cancelled ⛔' : 'Done ✅';
    titleText.style.color  = cancelled ? '#faa61a' : '#23a55a';
    statusLine.textContent = `${done}/${total} group${done > 1 ? 's' : ''} left${errors > 0 ? `  ⚠️ ${errors} error${errors > 1 ? 's' : ''}` : ''}`;
    barFill.style.background = cancelled
      ? 'linear-gradient(90deg, #faa61a, #ffcf72)'
      : 'linear-gradient(90deg, #23a55a, #57f287)';
    barFill.style.width = '100%';
    currentGroupLine.textContent = '';
    setTimeout(() => overlay.remove(), 5000);
  };

  return { update, finish, remove: () => overlay.remove(), isCancelled: () => _cancelled };
}

// ── Leave selected groups (batch) ────────────────────────────
async function leaveAll(groups, silent = true) {
  const total    = groups.length;
  let   left     = 0;
  let   errors   = 0;
  const progress = createProgressOverlay(silent);
  progress.update(0, total, '', 0);
  console.log(`🎛️  Mode: ${silent ? 'SILENT 🔇' : 'NORMAL 🔔'}`);

  for (const group of groups) {
    if (progress.isCancelled()) { console.warn("🚫 Cancelled."); break; }

    const name = groupName(group);
    progress.update(left, total, name, errors);
    console.log(`🚪 Leaving group: ${name} (${group.id})`);

    const url = `${BASE}/channels/${group.id}${silent ? '?silent=true' : ''}`;
    const r = await fetch(url, { method: "DELETE", headers: HEADS });

    if (r.status === 200 || r.status === 204) {
      left++;
      console.log(`  ✅ Left: ${name}`);
    } else if (r.status === 429) {
      const body = await r.json().catch(() => ({}));
      const wait = (body.retry_after ?? 1) * 1000 + 500;
      console.warn(`  ⏳ Rate limit — waiting ${wait}ms`);
      await sleep(wait);
      const r2 = await fetch(url, { method: "DELETE", headers: HEADS });
      if (r2.status === 200 || r2.status === 204) { left++; console.log(`  ✅ Left (retry): ${name}`); }
      else { errors++; console.warn(`  ⚠️  Retry failed (${r2.status}): ${name}`); }
    } else {
      errors++;
      console.warn(`  ⚠️  Failed (${r.status}): ${name}`);
    }

    progress.update(left, total, '', errors);
    await sleep(600 + Math.random() * 200);
  }

  progress.finish(left, total, errors, progress.isCancelled());
  console.log(`\n✅ Done — ${left}/${total} group(s) left (silent: ${silent}).`);
  return left;
}

// ── Entry point ──────────────────────────────────────────────
window.runLeave = async () => {
  try {
    const groupsPromise = fetchGroups();
    const result = await showConfirmDialog(groupsPromise);

    if (!result || !result.groups || result.groups.length === 0) {
      console.log("🚫 Cancelled or nothing selected.");
      return;
    }

    console.log(`▶️  ${result.groups.length} group(s) selected — mode ${result.silent ? 'silent 🔇' : 'normal 🔔'} — starting...`);
    await leaveAll(result.groups, result.silent);
  } catch (e) {
    console.error("❌", e.message);
  }
};

console.log('%c✅ Script loaded!', "color: green; font-weight: bold; font-size: 16px");
console.log('%c🚀 Launching...', "color: cyan; font-size: 14px");
runLeave();
