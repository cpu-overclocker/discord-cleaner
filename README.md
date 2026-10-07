<div align="center">

# 🛠 Discord Tools

**Gérez vos amis, groupes et DM Discord depuis une interface unifiée, propre et native.**

![Version](https://img.shields.io/badge/version-1.3-5865f2?style=flat-square)
![Platform](https://img.shields.io/badge/platform-Discord%20Web-5865f2?style=flat-square)
![Language](https://img.shields.io/badge/language-JavaScript-f7df1e?style=flat-square)

</div>

---

## ✨ Pourquoi l'utiliser ?

- **Interface native** — S'intègre parfaitement à Discord (thème, polices, animations).
- **Statuts en direct** — Pastilles de présence (🟢 En ligne, 🟡 Absent, 🔴 DND, ⚫ Hors ligne) actualisées toutes les 15 secondes.
- **Nettoyage complet** — Suppression de vos messages, fermeture des DM, retrait d'amis et départ de groupes.
- **Anti rate-limit** — Backoff adaptatif pour éviter les blocages de l'API Discord.
- **Historique persistant** — Suivi de toutes vos actions (survit aux rechargements de la page).

---

## 🗂️ Les 4 onglets

### 👥 Amis
> Recherche, tri, filtres avancés (date d'ajout, type d'avatar, statut en ligne).
- Retrait individuel ou en masse.
- Option : nettoyer les messages du DM avant de retirer l'ami.
- Option : fermer automatiquement le DM dans la barre latérale.

### 👥 Groupes
> Filtres : Solo, Nommé, Inactif (90j+), Récent, Ancien.
- Départ individuel ou en masse.
- **Mode silencieux** : quitter sans notifier les autres membres.
- Option : supprimer vos messages avant de quitter.

### 💬 Non-amis
> Liste tous les DM avec des personnes hors de votre liste d'amis.
- Filtres : Avec / Sans mes messages, Vide, Nouveau compte, Sans avatar, Statut.
- Scan approfondi pour détecter les conversations vraiment vides.
- Nettoyage et fermeture en un clic.

### 📜 Historique
> Journal complet : amis retirés, groupes quittés, DM nettoyés.
- Recherche et filtres par type (Amis / Groupes / Non-amis).
- Statistiques en direct (nombre d'actions, total de messages supprimés).

---

## 🚀 Installation

1. Ouvrez **Discord** dans votre navigateur (`discord.com/app`).
2. Ouvrez la **console DevTools** (`F12` → onglet Console).
3. Copiez le contenu de `discord-tools.js` et collez-le dans la console.
4. Appuyez sur **Entrée**. Le panneau Discord Tools apparaît.

> 💡 **Astuce** : Utilisable comme bookmarklet ou via Tampermonkey / Violentmonkey.

---

## 🔒 Confidentialité

- Aucun serveur externe, aucune analyse, aucun suivi.
- Votre token ne quitte jamais votre navigateur.
- Tout s'exécute localement sur `discord.com`.

---

<div align="center">
<i>Fait avec ❤️ pour la communauté Discord</i>
</div>