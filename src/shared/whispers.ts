/**
 * Réserve de messages « vivants » d'Audii.
 *
 * L'IA distante écrit le message quand elle est joignable ; sinon on pioche
 * ici. Le repli n'est pas un pis-aller : sans réseau, sans clé, ou en cas de
 * quota dépassé, l'application doit rester habitée — c'est tout l'intérêt de
 * la fonctionnalité.
 *
 * `{title}` et `{artist}` sont remplacés à l'affichage.
 */
import type { Lang } from './i18n'

const fr: string[] = [
  'Je sens que « {title} » va te faire pleurer. Moi c’est déjà le cas 🥲',
  'Celle-là, tu vas la remettre. On parie ? 🔁',
  'Monte le son. Ce couplet ne se murmure pas 🔊',
  'Petite alerte : {artist} est en train de te voler ta soirée 🌙',
  'J’ai vérifié, ce tempo est exactement celui de ton cœur 💓',
  'Ferme les yeux sur le refrain. Fais-moi confiance ✨',
  'C’est le genre de morceau qu’on écoute en regardant par la fenêtre 🚌',
  'Là tout de suite, quelqu’un d’autre écoute la même chose. Vous ne le saurez jamais 🌍',
  'Si tu ne bouges pas la tête, c’est que tu triches 🕺',
  'Attention : après « {title} », le silence va faire bizarre 🤫',
  'Ce morceau a le culot d’être bon un mardi 😌',
  'J’aurais mis celle-ci en premier moi aussi. Bon goût 👏',
  'Le genre de son qui rend la pièce plus grande 🏙️',
  'Ne saute pas l’intro. L’intro, c’est la moitié du travail ⏳',
  'Prépare-toi : {artist} ne fait pas dans la demi-mesure 🔥',
  'Tu as trouvé la bonne chanson pour l’heure qu’il est 🕰️'
]

const en: string[] = [
  'I have a feeling “{title}” is about to make you cry. It already got me 🥲',
  'You’re replaying this one. Want to bet? 🔁',
  'Turn it up. This verse was not written to be whispered 🔊',
  'Heads-up: {artist} is about to steal your whole evening 🌙',
  'Checked it twice — this tempo is exactly your heartbeat 💓',
  'Close your eyes on the chorus. Trust me ✨',
  'This is a staring-out-the-window kind of track 🚌',
  'Right now, someone else is playing this too. You’ll never know who 🌍',
  'If your head isn’t moving, you’re cheating 🕺',
  'Fair warning: after “{title}”, silence is going to feel strange 🤫',
  'This song has the nerve to be great on a Tuesday 😌',
  'I’d have put this one first as well. Good taste 👏',
  'The kind of sound that makes the room feel bigger 🏙️',
  'Don’t skip the intro. The intro is half the job ⏳',
  'Brace yourself — {artist} does not do half measures 🔥',
  'You found the right song for the hour it is 🕰️'
]

const BANK: Record<Lang, string[]> = { fr, en }

/**
 * Un message de repli, différent du précédent quand c'est possible : deux
 * fois la même phrase de suite et l'illusion tombe.
 */
export function pickWhisper(lang: Lang, previous?: string | null): string {
  const bank = BANK[lang] ?? BANK.fr
  const pool = bank.length > 1 && previous ? bank.filter((line) => line !== previous) : bank
  return pool[Math.floor(Math.random() * pool.length)]
}

/** Remplace `{title}` / `{artist}` dans un message (IA ou repli). */
export function fillWhisper(text: string, title: string, artist: string): string {
  return text.replace(/\{title\}/g, title).replace(/\{artist\}/g, artist)
}
