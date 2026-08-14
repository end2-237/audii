# Landing Audii

## Construire

```
npm run landing
```

Deux sorties, parce que les deux destinations n'attendent pas la même chose :

| Fichier | Pour | Contenu |
| --- | --- | --- |
| `docs/index.html` | l'outil Artifact | le corps seul — l'outil fournit l'ossature `<html><head>` |
| `web/index.html` | Vercel, GitHub Pages | le document complet, avec `<head>`, favicon et cartes de partage |

`web/` n'est pas versionné : il se regénère.

## Pourquoi une page autonome

Police, captures et logo sont encodés dans le fichier. Aucun asset externe :
rien à servir à côté, rien qui puisse manquer, et une page entière dès le
premier octet reçu. Le prix est un fichier d'environ 800 Ko, largement
compensé par la compression du serveur.

## Sources

- `index.template.html` — la structure et les styles. C'est le seul fichier à
  éditer à la main.
- `shots/*.jpg` — les six écrans du carrousel. Ce ne sont pas des maquettes :
  ce sont les captures que le test de fumée prend sur l'application qui
  tourne. Pour les rafraîchir, relancer le test et recopier `smoke/*.png`
  converti en JPEG.
- `fonts/inter-latin-wght-normal.woff2` — Inter, recopiée depuis
  `@fontsource-variable/inter`. Elle est versionnée pour que le déploiement
  n'installe aucune dépendance : un `npm install` sur Vercel tirerait
  Electron, deux cents mégaoctets pour lire quarante-huit kilo-octets.
- `og.jpg` — l'image des aperçus de partage.

Les couleurs et la police sont recopiées de `src/renderer/src/styles/app.css`
sans être réinterprétées : la page et l'application doivent rester la même
marque.

## Déployer sur Vercel

`vercel.json` décrit tout : pas d'installation, `node scripts/build-landing.mjs`
comme commande de build, `web/` comme dossier servi.

```
npx vercel        # aperçu
npx vercel --prod # production
```

Ou, depuis vercel.com : « Add New → Project », importer `end2-237/audii`, et
laisser les réglages tels quels — ils sont lus dans `vercel.json`.

Une fois le domaine connu, remplacer `/og.jpg` par une URL absolue dans
`scripts/build-landing.mjs` : certains réseaux sociaux refusent les chemins
relatifs dans les cartes de partage.
