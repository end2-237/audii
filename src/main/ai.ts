/**
 * Petites phrases d'ambiance écrites par un modèle distant (Groq).
 *
 * L'appel vit dans le process principal : le renderer n'a jamais la clé en
 * main, et on évite les restrictions CSP/CORS de la fenêtre. Toute panne —
 * réseau coupé, quota dépassé, modèle retiré — renvoie `null`, et le
 * renderer bascule sur la réserve locale (`shared/whispers.ts`). Cette
 * fonctionnalité ne doit jamais bloquer ni faire attendre l'écoute.
 */
import type { Lang } from '../shared/i18n'

const ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions'

/**
 * Clé scellée dans le binaire à la compilation (esbuild `define`, alimenté
 * par le secret `AUDII_GROQ_KEY` de la CI). Elle n'est jamais versionnée.
 *
 * ⚠️ Une clé embarquée dans un binaire distribué reste extractible : elle
 * vaut clé publique. Elle est là pour que la fonctionnalité marche dès
 * l'installation, sans configuration. Elle ne quitte pas le process
 * principal (le bundle du renderer ne la voit pas) et se surcharge par la
 * variable d'environnement `AUDII_GROQ_KEY` ou par le réglage `groqKey`,
 * pour être remplacée sans recompiler le jour où elle est révoquée.
 *
 * Vide, l'application se rabat sur ses phrases locales : le manque de clé
 * n'est pas une panne.
 */
const BUNDLED_KEY = process.env.AUDII_BUNDLED_GROQ_KEY ?? ''

/** Clé effective : réglage utilisateur, puis environnement, puis celle scellée. */
export const resolveKey = (fromSettings: string): string =>
  fromSettings.trim() || process.env.AUDII_GROQ_KEY?.trim() || BUNDLED_KEY

/**
 * Modèles essayés dans l'ordre. Les identifiants Groq sont régulièrement
 * retirés du catalogue : plutôt que d'en figer un seul, on descend la liste
 * jusqu'à ce qu'un réponde, et on retient celui qui a marché.
 */
const MODELS = ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'gemma2-9b-it']

/** Au-delà, on n'attend pas : le morceau est déjà lancé. */
const TIMEOUT_MS = 6000

let preferredModel: string | null = null

export interface WhisperContext {
  title: string
  artist: string
  album: string
  genre: string
  bpm: number | null
  lang: Lang
  playlist: string
}

const PROMPT: Record<Lang, string> = {
  fr:
    "Tu es Audii, un lecteur de musique qui parle à son utilisateur comme un ami. " +
    "Écris UNE seule phrase courte (18 mots maximum) sur le morceau qui commence, " +
    "avec exactement un emoji à la fin. Tutoie. Sois complice, drôle ou touchant, " +
    "jamais publicitaire. N'invente pas de faits sur l'artiste. Ne mets pas de guillemets " +
    "autour de ta réponse et n'ajoute aucune explication.",
  en:
    'You are Audii, a music player that talks to its user like a friend. ' +
    'Write ONE short sentence (18 words max) about the track that is starting, ' +
    'ending with exactly one emoji. Be warm, funny or moving, never advertising. ' +
    'Do not invent facts about the artist. Do not wrap your answer in quotes and ' +
    'do not add any explanation.'
}

function describe(context: WhisperContext): string {
  const parts = [
    `${context.lang === 'fr' ? 'Titre' : 'Title'} : ${context.title}`,
    `${context.lang === 'fr' ? 'Artiste' : 'Artist'} : ${context.artist || '?'}`
  ]
  if (context.album) parts.push(`Album : ${context.album}`)
  if (context.genre) parts.push(`${context.lang === 'fr' ? 'Genre' : 'Genre'} : ${context.genre}`)
  if (context.bpm) parts.push(`Tempo : ${context.bpm} BPM`)
  if (context.playlist) parts.push(`Playlist : ${context.playlist}`)
  return parts.join('\n')
}

/** Nettoie la réponse : le modèle ajoute parfois des guillemets ou un préfixe. */
function tidy(raw: string): string | null {
  const line = raw.trim().split('\n').find((item) => item.trim().length > 0)
  if (!line) return null
  const cleaned = line
    .trim()
    .replace(/^["“«']\s*/, '')
    .replace(/\s*["”»']$/, '')
    .trim()
  // Une phrase, pas un paragraphe : au-delà, le modèle a ignoré la consigne.
  if (cleaned.length < 4 || cleaned.length > 220) return null
  return cleaned
}

/**
 * `unreachable` distingue une panne réseau d'un refus du modèle : inutile de
 * dérouler toute la liste de modèles quand c'est la connexion qui manque —
 * ce serait trois délais d'attente avant de rendre la main.
 */
type Attempt = { text: string } | 'rejected' | 'unreachable'

async function callModel(model: string, key: string, context: WhisperContext): Promise<Attempt> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        temperature: 1.05,
        top_p: 0.95,
        max_tokens: 70,
        messages: [
          { role: 'system', content: PROMPT[context.lang] ?? PROMPT.fr },
          { role: 'user', content: describe(context) }
        ]
      })
    })
    // 401/429 comme 404 : le modèle ne répondra pas, on passe au suivant.
    if (!response.ok) return 'rejected'
    const payload = (await response.json()) as { choices?: { message?: { content?: string } }[] }
    const content = payload.choices?.[0]?.message?.content
    const text = typeof content === 'string' ? tidy(content) : null
    return text ? { text } : 'rejected'
  } catch {
    // Coupure réseau, DNS, proxy, délai dépassé : le repli local prend la main.
    return 'unreachable'
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Demande une phrase au modèle. Renvoie `null` dès que quelque chose cloche
 * — l'appelant a toujours de quoi afficher sans nous.
 */
export async function requestWhisper(context: WhisperContext, key: string): Promise<string | null> {
  if (!key) return null
  const candidates = preferredModel ? [preferredModel, ...MODELS.filter((m) => m !== preferredModel)] : MODELS
  for (const model of candidates) {
    const attempt = await callModel(model, key, context)
    if (attempt === 'unreachable') return null
    if (attempt !== 'rejected') {
      preferredModel = model
      return attempt.text
    }
  }
  return null
}
