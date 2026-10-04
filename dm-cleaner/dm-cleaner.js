// ============================================================
//  Discord — Suppression de messages DM (console Chrome)
//  Auto-détecte le DM ouvert et se lance automatiquement
// ============================================================

const isValidToken = t => typeof t === "string" && /^[A-Za-z0-9_-]{20,}\.[\w-]{4,}\.[\w-]{20,}$/.test(t);

// ── Extraction automatique du token ──────────────────────────
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
            try {
              const t = val.getToken();
              if (isValidToken(t)) { token = t; break; }
            } catch (_) {}
          }
          if (token) break;
        }
      }
    ]);
    webpackChunkdiscord_app.pop();
    if (token) { console.log("🔑 Token via webpack"); return token; }
  } catch (_) {}

  try {
    for (const key of Object.keys(window)) {
      try {
        const val = window[key];
        if (isValidToken(val)) { console.log("🔑 Token via window." + key); return val; }
      } catch (_) {}
    }
  } catch (_) {}

  throw new Error("Token introuvable — es-tu bien connecté sur discord.com/app ?");
})();

// ── Détection du DM actif via DOM ────────────────────────────
function getCurrentChannelInfo() {
  const activeWrapper = document.querySelector('.interactiveSelected__972a0');
  if (!activeWrapper) return null;
  const link = activeWrapper.querySelector('a.link__972a0[href^="/channels/@me/"]');
  if (!link) return null;
  const channelId = link.href.split("/").at(-1);
  const nameEl = link.querySelector('[class*="overflowTooltip"]');
  const name = nameEl?.textContent?.trim() ?? null;
  return { channelId, name, type: 1 };
}

// ─────────────────────────────────────────────────────────────
//  Délai adaptatif avec plancher DYNAMIQUE
//
//  Ancien problème : le plancher était figé. Après un 429 on
//  respectait le retry_after, puis on retombait immédiatement
//  au même rythme → accumulation de rate limits.
//
//  Nouveau comportement :
//    - Chaque 429 monte le plancher de +400 ms (cumulatif).
//    - Chaque succès descend délai (−20 ms) ET plancher (−10 ms).
//    - Délai post-429 = max(retry_after + 800 ms, plancher + 600 ms).
//
//  Valeurs de départ (plus conservatrices) :
//    total=30  → start≈775  floor≈560
//    total=100 → start≈1200 floor≈900
//    total=300 → start≈1950 floor≈1300
//    total=500 → start≈2500 floor≈2000 (plafonnés)
// ─────────────────────────────────────────────────────────────
class AdaptiveDelay {
  #delay; #floor;
  static MAX            = 8000;
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
    const fromRetry = retrySec * 1000 + 800;
    this.#delay = Math.min(AdaptiveDelay.MAX, Math.max(fromRetry, this.#floor + 600));
  }

  get current() { return this.#delay; }
  get floorMs() { return this.#floor; }
}

// ─────────────────────────────────────────────────────────────
//  Pop-up de confirmation
//  - S'ouvre immédiatement avec juste "Chargement..."
//  - Échap / clic extérieur ferment dès l'ouverture
//  - Une fois la promesse résolue, construit le vrai contenu
//  - Retourne les messages à supprimer, ou null si annulé
// ─────────────────────────────────────────────────────────────
function showConfirmDialog(label, msgsPromise) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.id = '__dm_cleaner_overlay';
    Object.assign(overlay.style, {
      position: 'fixed', inset: '0', background: 'rgba(0,0,0,0.75)',
      zIndex: '99999', display: 'flex', alignItems: 'center',
      justifyContent: 'center', fontFamily: '"gg sans", "Noto Sans", sans-serif',
    });

    const box = document.createElement('div');
    Object.assign(box.style, {
      background: '#313338', borderRadius: '12px', padding: '28px 32px',
      width: '420px', boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
      color: '#dbdee1', textAlign: 'center',
    });

    // ── État initial : juste "Chargement..." ──
    const loadingText = document.createElement('div');
    loadingText.textContent = 'Chargement...';
    Object.assign(loadingText.style, { fontSize: '14px', color: '#b5bac1' });

    const cleanup = (result) => { overlay.remove(); resolve(result); };
    overlay.onclick = (e) => { if (e.target === overlay) cleanup(null); };
    overlay.addEventListener('keydown', (e) => { if (e.key === 'Escape') cleanup(null); });

    box.append(loadingText);
    overlay.append(box);
    document.body.append(overlay);
    overlay.tabIndex = -1;
    overlay.focus();

    // ── Résolution → construire le vrai contenu ──
    msgsPromise.then(msgs => {
      if (!document.body.contains(overlay)) return;

      box.innerHTML = '';

      const makeBtn = (text, bg, hoverBg) => {
        const b = document.createElement('button');
        b.textContent = text;
        Object.assign(b.style, {
          flex: '1', padding: '10px', borderRadius: '4px', border: 'none',
          background: bg, color: '#fff', fontSize: '14px', fontWeight: '600', cursor: 'pointer',
        });
        b.onmouseenter = () => b.style.background = hoverBg;
        b.onmouseleave = () => b.style.background = bg;
        return b;
      };

      const icon = document.createElement('div');
      Object.assign(icon.style, { fontSize: '40px', marginBottom: '12px' });

      const title = document.createElement('div');
      Object.assign(title.style, { fontSize: '20px', fontWeight: '700', color: '#fff', marginBottom: '10px' });

      const desc = document.createElement('div');
      Object.assign(desc.style, { fontSize: '14px', color: '#b5bac1', marginBottom: '6px' });

      const nameEl = document.createElement('div');
      nameEl.textContent = label;
      Object.assign(nameEl.style, {
        fontSize: '15px', fontWeight: '600', color: '#fff',
        background: '#1e1f22', borderRadius: '6px', padding: '6px 12px',
        margin: '0 auto 20px', display: 'inline-block', maxWidth: '100%', wordBreak: 'break-all',
      });

      const row = document.createElement('div');
      Object.assign(row.style, { display: 'flex', gap: '12px', justifyContent: 'center' });

      if (msgs.length === 0) {
        icon.textContent = '💬';
        title.textContent = 'Aucun message à supprimer';
        desc.textContent = "Vous n'avez envoyé aucun message avec :";
        const btnClose = makeBtn('✕ Fermer', '#4e5058', '#6d6f78');
        btnClose.style.flex = '0 0 auto';
        btnClose.style.minWidth = '120px';
        btnClose.onclick = () => cleanup(null);
        row.append(btnClose);
      } else {
        const n = msgs.length;
        icon.textContent = '🗑️';
        title.textContent = 'Supprimer vos messages ?';
        desc.textContent = `Vous allez supprimer vos ${n} message${n > 1 ? 's' : ''} avec :`;
        const btnCancel  = makeBtn('Annuler', '#4e5058', '#6d6f78');
        const btnConfirm = makeBtn('🗑️ Supprimer', '#da373c', '#a12d31');
        btnCancel.onclick  = () => cleanup(null);
        btnConfirm.onclick = () => cleanup(msgs);
        row.append(btnCancel, btnConfirm);
      }

      box.append(icon, title, desc, nameEl, row);

    }).catch(() => {
      if (!document.body.contains(overlay)) return;
      box.innerHTML = '';
      const errText = document.createElement('div');
      errText.textContent = 'Erreur lors du chargement des messages.';
      Object.assign(errText.style, { fontSize: '14px', color: '#ed4245', marginBottom: '16px' });
      const btnClose = document.createElement('button');
      btnClose.textContent = '✕ Fermer';
      Object.assign(btnClose.style, {
        padding: '10px 20px', borderRadius: '4px', border: 'none',
        background: '#4e5058', color: '#fff', fontSize: '14px', fontWeight: '600', cursor: 'pointer',
      });
      btnClose.onclick = () => cleanup(null);
      box.append(errText, btnClose);
    });
  });
}

// ── Overlay de progression ────────────────────────────────────
function createProgressOverlay(dmLabel = '') {
  document.getElementById('__dm_progress_overlay')?.remove();

  const overlay = document.createElement('div');
  overlay.id = '__dm_progress_overlay';
  Object.assign(overlay.style, {
    position: 'fixed', bottom: '28px', right: '28px', zIndex: '99999',
    fontFamily: '"gg sans", "Noto Sans", sans-serif',
    background: '#313338', borderRadius: '12px', padding: '18px 22px',
    width: '340px', boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
    color: '#dbdee1', userSelect: 'none',
  });

  let _cancelled = false;

  const titleRow = document.createElement('div');
  Object.assign(titleRow.style, { display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' });

  const titleIcon = document.createElement('span');
  titleIcon.textContent = '🗑️';
  titleIcon.style.fontSize = '18px';

  const titleText = document.createElement('span');
  titleText.textContent = 'Suppression en cours…';
  Object.assign(titleText.style, { fontSize: '15px', fontWeight: '700', color: '#fff', flex: '1' });

  const btnClose = document.createElement('button');
  btnClose.textContent = '✕ Annuler';
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
    titleText.textContent = 'Annulation…';
    titleText.style.color = '#faa61a';
  };
  titleRow.append(titleIcon, titleText, btnClose);

  const fetchLine = document.createElement('div');
  Object.assign(fetchLine.style, { fontSize: '13px', color: '#b5bac1', marginBottom: '10px', minHeight: '18px' });
  fetchLine.textContent = 'Récupération des messages…';

  const statusLine = document.createElement('div');
  Object.assign(statusLine.style, {
    fontSize: '14px', fontWeight: '600', color: '#fff',
    marginBottom: '12px', letterSpacing: '0.02em', minHeight: '20px',
  });

  const barTrack = document.createElement('div');
  Object.assign(barTrack.style, { background: '#1e1f22', borderRadius: '99px', height: '8px', overflow: 'hidden', marginBottom: '10px' });
  const barFill = document.createElement('div');
  Object.assign(barFill.style, {
    height: '100%', width: '0%',
    background: 'linear-gradient(90deg, #da373c, #ff6b6b)',
    borderRadius: '99px', transition: 'width 0.3s ease',
  });
  barTrack.append(barFill);

  const etaRow = document.createElement('div');
  Object.assign(etaRow.style, { fontSize: '12px', color: '#b5bac1', marginBottom: '6px', minHeight: '16px' });
  etaRow.textContent = 'Estimation : —';

  const metaRow = document.createElement('div');
  Object.assign(metaRow.style, {
    display: 'flex', justifyContent: 'space-between',
    alignItems: 'center', fontSize: '12px', color: '#b5bac1', marginTop: '8px',
  });

  const dmNameSpan = document.createElement('span');
  Object.assign(dmNameSpan.style, {
    display: 'flex', alignItems: 'center', gap: '5px',
    maxWidth: '190px', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis',
  });
  const dmIcon = document.createElement('span');
  dmIcon.textContent = '💬';
  dmIcon.style.fontSize = '11px';
  const dmText = document.createElement('span');
  dmText.textContent = dmLabel || '—';
  Object.assign(dmText.style, { overflow: 'hidden', textOverflow: 'ellipsis' });
  dmNameSpan.append(dmIcon, dmText);

  const rightSpan = document.createElement('span');
  Object.assign(rightSpan.style, { display: 'flex', gap: '8px', alignItems: 'center' });
  const errSpan = document.createElement('span');
  const rateLimitSpan = document.createElement('span');
  Object.assign(rateLimitSpan.style, { color: '#faa61a', fontWeight: '600' });
  const speedSpan = document.createElement('span');
  rightSpan.append(errSpan, rateLimitSpan, speedSpan);

  metaRow.append(dmNameSpan, rightSpan);
  overlay.append(titleRow, fetchLine, statusLine, barTrack, etaRow, metaRow);
  document.body.append(overlay);

  let smoothedEta = null;
  const ETA_ALPHA = 0.15;

  const startDeleting = (total) => {
    fetchLine.textContent = `${total} message${total > 1 ? 's' : ''} trouvé${total > 1 ? 's' : ''}`;
  };

  const update = (done, total, errors, elapsed, rateLimits = 0) => {
    const mm = String(Math.floor(elapsed / 60)).padStart(2, '0');
    const ss = String(elapsed % 60).padStart(2, '0');
    statusLine.textContent = `Message supprimé : ${done}/${total}  [${mm}:${ss}]`;
    barFill.style.width = `${total > 0 ? Math.round((done / total) * 100) : 0}%`;
    errSpan.textContent = errors > 0 ? `⚠️ ${errors} erreur${errors > 1 ? 's' : ''}` : '';
    rateLimitSpan.textContent = rateLimits > 0 ? `rate limits : ${rateLimits}` : '';
    speedSpan.textContent = done > 0 && elapsed > 0 ? `${(done / elapsed).toFixed(1)} msg/s` : '';

    if (done > 0 && elapsed > 0) {
      const rawEta = Math.max(0, (total - done) / (done / elapsed));
      smoothedEta = smoothedEta === null ? rawEta : ETA_ALPHA * rawEta + (1 - ETA_ALPHA) * smoothedEta;
      const etaSec = Math.round(smoothedEta);
      etaRow.textContent = `Estimation : ${String(Math.floor(etaSec / 60)).padStart(2,'0')}m ${String(etaSec % 60).padStart(2,'0')}s`;
    } else {
      etaRow.textContent = 'Estimation : —';
    }
  };

  const finish = (done, total, errors, elapsed, cancelled = false) => {
    const mm = String(Math.floor(elapsed / 60)).padStart(2, '0');
    const ss = String(elapsed % 60).padStart(2, '0');
    titleText.textContent = cancelled ? 'Annulé ⛔' : 'Suppression terminée ✅';
    titleText.style.color = cancelled ? '#faa61a' : '#23a55a';
    statusLine.textContent = `${done}/${total} supprimé${done > 1 ? 's' : ''}  •  durée : ${mm}:${ss}`;
    barFill.style.background = cancelled
      ? 'linear-gradient(90deg, #faa61a, #ffcf72)'
      : 'linear-gradient(90deg, #23a55a, #57f287)';
    barFill.style.width = cancelled ? `${total > 0 ? Math.round((done / total) * 100) : 0}%` : '100%';
    errSpan.textContent = errors > 0 ? `⚠️ ${errors} erreur${errors > 1 ? 's' : ''}` : '';
    speedSpan.textContent = '';
    etaRow.textContent = '';
    setTimeout(() => overlay.remove(), 5000);
  };

  return { update, finish, startDeleting, remove: () => overlay.remove(), isCancelled: () => _cancelled };
}

// ─────────────────────────────────────────────────────────────
const BASE  = "https://discord.com/api/v10";
const HEADS = { Authorization: TOKEN, "Content-Type": "application/json" };
const sleep = ms => new Promise(r => setTimeout(r, ms));

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

async function getMe() {
  const r = await apiFetch(`${BASE}/users/@me`);
  if (!r.ok) throw new Error(`Profil inaccessible (${r.status}) — token invalide ?`);
  return r.json();
}

async function fetchMyMessages(channelId, userId) {
  let all = [], lastId = null;
  console.log("📥 Récupération des messages...");
  while (true) {
    const url = new URL(`${BASE}/channels/${channelId}/messages`);
    url.searchParams.set("limit", "100");
    if (lastId) url.searchParams.set("before", lastId);
    const r = await apiFetch(url.toString());
    if (r.status === 403) { console.error("❌ Accès refusé (403)"); break; }
    if (r.status === 404) { console.error("❌ Channel introuvable (404)"); break; }
    if (!r.ok)            { console.error(`❌ Erreur ${r.status}`); break; }
    const batch = await r.json();
    if (!batch.length) break;
    // Filtre : auteur + types supprimables seulement (0=DEFAULT, 19=REPLY, 20=SLASH)
    all.push(...batch.filter(m => m.author.id === userId && [0, 19, 20].includes(m.type)));
    lastId = batch.at(-1).id;
    console.log(`  → ${all.length} de mes messages trouvés...`);
    if (batch.length < 100) break;
  }
  return all;
}

async function deleteAll(channelId, msgs, label = '') {
  const total    = msgs.length;
  let deleted    = 0;
  let errors     = 0;
  let rateLimits = 0;
  const startTs  = Date.now();

  console.log(`🗑️  Suppression de ${total} message(s)...`);

  const progress = createProgressOverlay(label);
  progress.startDeleting(total);

  const delay = new AdaptiveDelay(total);

  const timerInterval = setInterval(() => {
    const elapsed = Math.floor((Date.now() - startTs) / 1000);
    progress.update(deleted, total, errors, elapsed, rateLimits);
  }, 1000);

  for (const msg of msgs) {
    if (progress.isCancelled()) {
      console.warn("🚫 Suppression annulée par l'utilisateur.");
      break;
    }

    while (true) {
      const r = await fetch(`${BASE}/channels/${channelId}/messages/${msg.id}`, {
        method: "DELETE",
        headers: HEADS,
      });

      if (r.status === 204) {
        deleted++;
        delay.onSuccess();
        progress.update(deleted, total, errors, Math.floor((Date.now() - startTs) / 1000), rateLimits);
        console.log(`  ✅ [${deleted}/${total}] supprimé`);
        break;

      } else if (r.status === 403 || r.status === 404) {
        errors++;
        console.warn(`  ⚠️  skip — statut ${r.status}`);
        break;

      } else if (r.status === 429) {
        rateLimits++;
        const body = await r.json().catch(() => ({}));
        const retrySec = body.retry_after ?? 1;
        delay.onRateLimit(retrySec);
        console.warn(`  ⏳ Rate limit — attente ${retrySec}s · plancher désormais ${delay.floorMs}ms (total : ${rateLimits})`);
        await sleep(delay.current);

      } else {
        console.warn(`  🔄 statut ${r.status} — nouvel essai dans 2s…`);
        await sleep(2000);
      }
    }

    if (!progress.isCancelled()) await sleep(delay.current);
  }

  clearInterval(timerInterval);
  const elapsed = Math.floor((Date.now() - startTs) / 1000);
  progress.finish(deleted, total, errors, elapsed, progress.isCancelled());
  return deleted;
}

// ─────────────────────────────────────────────────────────────
window.run = async (manualChannelId) => {
  try {
    let channelId, label;

    if (manualChannelId) {
      channelId = String(manualChannelId);
      label = channelId;
    } else {
      const info = getCurrentChannelInfo();
      if (!info?.channelId) {
        console.error("❌ Impossible de détecter le DM — navigue vers un DM puis réessaie.");
        return;
      }
      channelId = info.channelId;
      label = info.name ?? channelId;
    }

    const me = await getMe();
    console.log(`👤 ${me.username} (${me.id})`);

    // Lancer le fetch ET ouvrir la popup immédiatement en parallèle
    const msgsPromise = fetchMyMessages(channelId, me.id);
    const msgs = await showConfirmDialog(label, msgsPromise);

    // null = annulé ou 0 message
    if (!msgs) { console.log("🚫 Annulé."); return; }

    console.log(`📌 DM ID : ${channelId} — ${msgs.length} message(s) à supprimer`);
    const n = await deleteAll(channelId, msgs, label);
    console.log(`\n✅ Terminé — ${n}/${msgs.length} message(s) supprimé(s).`);
  } catch(e) {
    console.error("❌", e.message);
  }
};

console.log('%c✅ Script chargé !', "color: green; font-weight: bold; font-size: 16px");
console.log('%c🚀 Lancement automatique...', "color: cyan; font-size: 14px");
run();
