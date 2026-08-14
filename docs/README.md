# Landing Audii

`index.html` est une page autonome (police, captures et logo inclus en
data-URI) : aucun asset externe, aucun CDN. Elle se sert directement depuis
GitHub Pages, réglé sur ce dossier `docs/`.

Elle n'est pas écrite à la main : `index.template.html` porte la structure,
et le script d'injection remplace les jetons `__FONT__`, `__IMG_*__`,
`__VUES__` et les icônes par leur contenu encodé. Les captures viennent du
test de fumée (`smoke/`), donc de vraies exécutions de l'application, pas de
maquettes.

Les couleurs et la police sont recopiées de `src/renderer/src/styles/app.css`
sans être réinterprétées : la page et l'application doivent rester la même
marque.
