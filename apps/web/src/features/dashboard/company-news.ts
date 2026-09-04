// A plain import, resolved to a same-origin URL and never inlined as a `data:` URI despite being
// well under Vite's default inline threshold — `vite.config.ts`'s own `assetsInlineLimit`
// override for `news-*.svg` is what guarantees that (its comment explains why a `?url` suffix
// alone did not).
import newsFormation from '@/assets/news-formation.svg';
import newsSecurite from '@/assets/news-securite.svg';
import newsTeam from '@/assets/news-team.svg';

/**
 * Item 17, QA round 3: static, authored content for the dashboard's "informations CSE / vie de
 * l'entreprise" module — there is no CMS or admin screen behind it (out of scope for this
 * mockup, same reasoning `README.md`'s "What I'm not building" gives for everything this repo
 * does not construct), so the messages live here rather than behind a fetch. Six entries, though
 * the module only ever shows the five most recent (`recentCompanyNews` below) — enough to prove
 * that cut actually filters something, not just a number that happens to match the array length.
 *
 * The three images are `import`ed, not written as `/src/assets/...` string literals: only an
 * `import` puts a file in Vite's module graph, which is what makes it content-hashed into
 * `dist/assets/` at build time (`apps/web/index.html`'s own comment on the favicon has the full
 * reasoning) — a literal path string in a plain data module is invisible to that pipeline and
 * would 404 in production despite working in dev.
 */

export interface CompanyNewsMessage {
  readonly id: string;
  readonly title: string;
  readonly body: string;
  /** ISO date, `YYYY-MM-DD` — this module has no time-of-day concept, same as everywhere else in
   * this app a bare day is what a business record carries. */
  readonly publishedAt: string;
  readonly author: string;
  /** An imported same-origin asset (`src/assets/`, CSP `img-src 'self'`), never a hand-written
   * URL. `| null`, not optional: every caller has to handle the absence explicitly instead of an
   * easy-to-miss `undefined` check. */
  readonly imageSrc: string | null;
  readonly attachment: { readonly label: string; readonly href: string } | null;
}

const MESSAGES: readonly CompanyNewsMessage[] = [
  {
    id: 'cse-cr-aout',
    title: 'CSE — compte-rendu de la réunion du 27 août',
    body: 'Budget culture reconduit pour le dernier trimestre, chèques cadeaux de fin d’année votés à l’unanimité, et un point sur l’avancement du nouvel accord télétravail. Le compte-rendu complet est joint ci-dessous.',
    publishedAt: '2026-09-01',
    author: 'Le CSE',
    imageSrc: null,
    attachment: { label: 'CR-CSE-2026-08-27.pdf', href: '/documents/cr-cse-2026-08-27.pdf' },
  },
  {
    id: 'securite-phishing',
    title: 'Alerte sécurité interne — campagne de phishing ciblant les cabinets de conseil',
    body: 'Plusieurs cabinets du secteur ont signalé des emails frauduleux imitant des demandes de notes de frais urgentes. Ne cliquez sur aucun lien de ce type et transférez tout message suspect à securite-interne@secureco.test avant de le supprimer.',
    publishedAt: '2026-08-29',
    author: 'RSSI — Direction de la sécurité',
    imageSrc: newsSecurite,
    attachment: null,
  },
  {
    id: 'formation-catalogue',
    title: 'Nouveau catalogue de formations — rentrée 2026',
    body: 'Douze nouvelles sessions ouvertes ce trimestre, dont une préparation PASSI, un module offensive security avancé et deux parcours sur la conformité RGPD/NIS2. Inscriptions via le formulaire RH jusqu’au 30 septembre.',
    publishedAt: '2026-08-22',
    author: 'Direction des ressources humaines',
    imageSrc: newsFormation,
    attachment: { label: 'Catalogue-formations-S2-2026.pdf', href: '/documents/catalogue-formations-s2-2026.pdf' },
  },
  {
    id: 'mutuelle-nouvelle-offre',
    title: 'Mutuelle d’entreprise — nouvelle grille de garanties au 1er janvier',
    body: 'La renégociation annuelle aboutit à une meilleure prise en charge dentaire et optique, sans hausse de cotisation. Le comparatif détaillé sera présenté lors d’une réunion d’information le 15 octobre.',
    publishedAt: '2026-08-18',
    author: 'Direction des ressources humaines',
    imageSrc: null,
    attachment: { label: 'Grille-garanties-2027.pdf', href: '/documents/grille-garanties-2027.pdf' },
  },
  {
    id: 'seminaire-annuel',
    title: 'Séminaire annuel — save the date, 20-21 novembre à Lyon',
    body: 'Deux jours de conférences internes, d’ateliers par practice et de soirée d’équipe. Les inscriptions ouvrent le 15 septembre ; les frais de déplacement depuis les autres implantations sont pris en charge.',
    publishedAt: '2026-08-10',
    author: 'Direction générale',
    imageSrc: newsTeam,
    attachment: null,
  },
  {
    id: 'arrivees-ete',
    title: 'Arrivées de l’été — bienvenue à nos nouveaux collaborateurs',
    body: 'Six nouvelles recrues ont rejoint les practices Audit, SOC et Offensive Security à Paris, Lyon et Bordeaux depuis juin. Leurs profils sont présentés sur l’intranet.',
    publishedAt: '2026-07-28',
    author: 'Direction des ressources humaines',
    imageSrc: null,
    attachment: null,
  },
] as const;

/** The five most recent, most recent first — `publishedAt` is `YYYY-MM-DD`, which already sorts
 * chronologically as plain text (same reasoning item 25 relies on for `period`). */
export function recentCompanyNews(): readonly CompanyNewsMessage[] {
  return [...MESSAGES]
    .sort((left, right) => right.publishedAt.localeCompare(left.publishedAt))
    .slice(0, 5);
}
