# 🎧 Audii — édition Desktop

Lecteur audio adaptatif universel. **Cette version est le lecteur desktop (Windows / macOS / Linux)** :
elle lit les **vrais fichiers audio du PC** et embarque le moteur rythmique Audii.
Les sources en streaming (Audiomack, SoundCloud, Spotify/YouTube SDK) et le Motion-Sync mobile
viendront après validation de cette base.

---

## Ce que fait cette version

| Pilier | État | Détail |
| --- | --- | --- |
| **Lecteur fichiers locaux** | ✅ | Scan récursif des dossiers, lecture des tags (titre / artiste / album / année / genre / BPM), extraction des pochettes, lecture MP3 · FLAC · M4A · AAC · WAV · OGG · Opus · WMA · AIFF |
| **Lock-Vibe** | ✅ | Enchaînement du morceau suivant sur la signature rythmique du morceau en cours |
| **Sélecteur d'énergie** | ✅ | Curseur Rest → Chill → Flow → Focus → Hype, qui déforme le tempo cible (±20 %) |
| **Tap-Tempo** | ✅ | Clic sur le pad ou touche `T`, 3-4 fois, pour imposer un BPM |
| **Noise Sense / Smart Dim** | ✅ | Le micro mesure le bruit ambiant ; au-dessus du seuil le volume tombe à 20 %, puis remonte en fondu |
| **Analyse locale du tempo** | ✅ | Estimation BPM + énergie en local, sans réseau, mise en cache sur disque |
| **Splash screen** | ✅ | Fenêtre animée pendant le scan de la bibliothèque |
| **Playlists tempo automatiques** | ✅ | Une playlist par tranche de 10 BPM, triable du plus rapide au plus lent ou l'inverse |
| **« Continuer sur ce rythme »** | ✅ | Sur la page du morceau : ce qui peut suivre, classé par tempo **et** style |
| **Profil local & reprise d'écoute** | ✅ | Écran d'accueil, et l'app rouvre sur le morceau et la seconde où vous l'aviez laissée |
| **Coups de cœur** | ✅ | Les titres aimés forment leur propre playlist, en haut de la barre latérale |
| **Thème clair / sombre / système** | ✅ | Bascule instantanée depuis la barre de titre ou le panneau moteur |
| **Français / English** | ✅ | Interface entièrement traduite des deux côtés, bascule dans les réglages |
| **Mini-lecteur flottant** | ✅ | À la réduction : un bandeau au-dessus des autres fenêtres, repliable en pastille |
| **Motion-Sync (cadence de marche)** | ⏳ | Mobile uniquement — hors périmètre desktop |
| **Streaming Audiomack / SoundCloud / Spotify** | ⏳ | Prochaine itération |
| **Paiement Mobile Money** | ⏳ | Prochaine itération |

Aucune donnée ne quitte la machine : pas de compte, pas de réseau, pas de télémétrie.

---

## Récupérer le `.exe` Windows

Le binaire est produit par GitHub Actions à chaque push (workflow **Build Windows**) :

1. Onglet **Actions** du dépôt → dernier run de `Build Windows`.
2. Section **Artifacts** en bas de page :
   - `Audii-Setup-Windows` → `Audii-Setup-0.1.0.exe`, l'installateur NSIS (choix du dossier, raccourcis bureau et menu Démarrer) ;
   - `Audii-Portable-Windows` → `Audii-0.1.0-portable.exe`, à lancer sans installation.
3. Décompresser le zip téléchargé, puis lancer le `.exe`.

> Le binaire n'est pas signé : SmartScreen affichera un avertissement au premier lancement
> (*Informations complémentaires* → *Exécuter quand même*). Une signature de code Authenticode
> supprimera cet écran quand un certificat sera disponible.

Un tag `v*` (`git tag v0.1.0 && git push --tags`) publie en plus une **Release GitHub** avec les deux `.exe`.

---

## Développement

```bash
npm install
npm run dev          # Vite + Electron avec rechargement à chaud du renderer
npm run build        # icônes + process principal + interface
npm start            # build puis lancement du binaire local
npm run typecheck    # TypeScript strict (renderer + main)
npm run pack:win     # .exe local (nécessite Windows ou wine)
```

Au premier lancement, Audii pointe automatiquement le dossier **Musique** de l'utilisateur.
Le bouton `+` de la barre latérale et le panneau **Moteur Audii** permettent d'ajouter
ou de retirer d'autres dossiers.

### Bibliothèque de test

```bash
node scripts/make-fixtures.mjs          # génère ~/Music avec 8 WAV tagués (72 → 150 BPM)
```

### Test de fumée automatisé

```bash
AUDII_SMOKE=./smoke xvfb-run -a npx electron .
```

L'application démarre pour de vrai, scanne la bibliothèque, lance un morceau, vérifie que
la lecture avance, arme Lock-Vibe, contrôle l'estimation de BPM, parcourt les onglets et
écrit des captures d'écran dans `./smoke`. Sortie non nulle en cas d'échec — c'est ce que
la CI exécute sur chaque push.

---

## Architecture

```
src/
├── main/          process principal Electron (Node)
│   ├── index.ts       fenêtres, splash, IPC, cycle de vie
│   ├── library.ts     scan récursif + lecture des tags (music-metadata)
│   ├── protocol.ts    protocole audii:// (streaming local avec requêtes Range)
│   ├── store.ts       persistance JSON (réglages, bibliothèque, cache d'analyse)
│   ├── mini.ts        fenêtre flottante du mini-lecteur
│   └── smoke.ts       test de fumée piloté par variable d'environnement
├── preload/       pont contextIsolation → window.audii
├── shared/        types partagés + dictionnaire de traductions
└── renderer/      interface React (maquette Audii)
    ├── src/audio/     lecture, analyse BPM, familles de style, playlists tempo
    ├── src/state/     contexte applicatif
    ├── src/components/
    └── src/styles/
```

Quelques choix structurants :

- **`audii://` plutôt que `file://`** : le renderer garde `webSecurity` activé et n'accède
  qu'aux dossiers déclarés par l'utilisateur. Le handler répond en `206 Partial Content`,
  indispensable pour se déplacer dans un morceau.
- **Pochettes sur disque** (`userData/covers`), dédupliquées par album : le fichier
  `library.json` reste léger même avec des milliers de titres.
- **Analyse du tempo en tâche de fond**, un morceau à la fois, résultats mis en cache et
  invalidés par la date de modification du fichier.
- **Zéro dépendance à l'exécution** : `music-metadata` et React sont bundlés, le paquet
  final ne contient que `dist/`.

### Estimation du tempo

Décodage → enveloppe RMS (fenêtres ~11 ms) → fonction d'attaque → autocorrélation sur les
décalages correspondant à 60-200 BPM → pondération log-normale centrée sur 120 BPM.

Un signal périodique corrèle aussi bien à `T` qu'à `2T` : l'ambiguïté d'octave (72 vs 144 BPM)
est inhérente et connue de tous les détecteurs de tempo. La pondération choisit l'octave la
plus plausible musicalement. Le tag `TBPM` du fichier, s'il existe, est toujours prioritaire.

Mesuré sur la bibliothèque de test (`scripts/make-fixtures.mjs`) :

| Attendu | 72 | 88 | 92 | 104 | 110 | 118 | 128 | 150 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Estimé | 72 | 87 | 92 | 103 | 110 | 117 | 129 | 152 |

### Rester dans le style

Enchaîner au BPM seul ferait passer d'un gospel à un morceau de drill parce que les deux
tournent à 140. Chaque titre est donc rangé dans une famille musicale déduite de son tag de
genre (afro, hip-hop, R&B, électro, gospel, reggae, latino…), avec repli sur l'artiste,
l'album et le dossier quand le tag manque — ce qui est fréquent sur des fichiers récupérés
sur WhatsApp.

Le score d'enchaînement pèse **55 % de style et 45 % de tempo**, et le réglage
« Rester dans le style » restreint carrément les candidats au même univers dès qu'il y en a
au moins trois. La pastille de style affichée dans « Continuer sur ce rythme » rend le
garde-fou visible.

### Noise Sense

Le micro alimente un `AnalyserNode` (annulation d'écho activée pour que la musique ne se
déclenche pas elle-même). Une ligne de base du niveau calme de la pièce est suivie en
continu ; au-delà du seuil, le gain descend à 20 % en attaque rapide et remonte
progressivement 1,8 s après le retour au calme. Le micro n'est jamais connecté à la sortie
et rien n'est enregistré.

L'écoute tourne sur un `setInterval`, pas sur `requestAnimationFrame` : le navigateur ne
produit plus d'images quand la fenêtre est réduite, ce qui gèlerait la surveillance. La
fenêtre désactive aussi `backgroundThrottling`, sinon Chromium ralentit les minuteries des
fenêtres masquées.

---

## Raccourcis clavier

| Touche | Action |
| --- | --- |
| `Espace` | Lecture / pause |
| `←` / `→` | Reculer / avancer de 5 s |
| `Ctrl + ←` / `Ctrl + →` | Morceau précédent / suivant |
| `T` | Tap-Tempo |
| `Ctrl + F` | Recherche |

---

## Langues

L'interface est disponible en **français** et en **anglais**, intégralement — y compris les
messages du splash et du scan, qui viennent du process principal. La bascule se trouve dans
le panneau **Moteur Audii** et sur l'écran d'accueil. Le dictionnaire unique vit dans
`src/shared/i18n.ts` ; ajouter une langue revient à y ajouter une table.

Le test de fumée vérifie qu'aucun mot français ne subsiste après bascule en anglais.

---

Propulsé par **Buyticle**.
