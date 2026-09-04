1. Ne conserver qu'une de ces versions dans la page d'accueil, celle qui se trouve dans la bulle (en anglais). Mais remplacer le texte par la version française. : Cette maquette n’a pas d’authentification : on choisit une identité, et tout le monde peut choisir n’importe laquelle.
   These are demonstration personas, not accounts. Anyone may select any of them; there is no authentication in this mockup.

2. Quand on clique sur le rôle à prendre, il y a un bref instant où on voit le placeholder/skeletton de la page des rôles avant la transition vers la page d'accueil du rôle. Il faut éviter ce comportement, que ce soit ici ou dans l'application entière, afin d'éviter d'avoir un écran qui clignotte.

3. Pour un manager, dans ka page du pré-facturier qui contient les CRA à valider, il faut pouvoir ouvrir le CRA afin de le visualiser pour pouvoir le valider/refuser. On ne doit pas être obligés de passer par le menu CRA pour ça.

4. Avoir une couleur différente par rôle pour les badges Consultant/Manager/Facturation

5. Ajouter une favicon pertinente

6. Add more consultants. Not ones that we can pick in the role selector.
   But each manager should have at least 10 consultants. The data for each consultant should vary but some should have data from 2016 until now. Some should also have quit the company between, so we must handle that case properly.
   Add a CRA for july and august in the seed, because the maquette will not be reviewed until september, so it should feel like there is a lot of data.
   Add more managers too, again, not selectable, but so that it can make it so we have more historic data. Same goes for the factures, we must have more than one, with an history of it from 2016, with some in different status.

7. The manager should have a consultant search bar/selector/filter in the CRA view. Tha way, he can filter on both the consultant(s), the status (it not exclusive, a manager will want to see for X consultants all of the CRA not validated for example)

8. The filter in the facture screen should be a bit more pretty because it's one big bar with titles in it "emise, en attente, etc" it's not obvious that we can click them individually.

---

## État au 31/08/2026, fin de session 2 (branche `fix/qa-round-1`, 4 commits locaux non poussés)

**Le point 6 est terminé — les 8 points de la liste sont maintenant faits et commités.**

- Points 1, 2, 3, 4, 5, 7, 8 : faits entièrement, testés (unit + intégration + e2e Playwright +
  axe), commités un par un (session précédente).
- Point 6, calendrier : fait. Table des jours fériés étendue 2016–2027 (ADR-0078).
- Point 6, départ d'un consultant : fait. Colonne `departure_date` (migration 012), invariant
  domaine dans `Cra.open` (ADR-0079), lecteurs mis à jour, tests négatifs.
- Point 6, volume réel : fait cette session. 39 nouveaux consultants + 1 nouveau manager (Karim,
  Bordeaux), aucun sélectionnable dans le picker. Bruno et Emma dépassent largement le seuil de 10
  (20 chacun). 4 vétérans (Julien, Camille, Théo, Marine) depuis 2016 avec historique épars (un
  Cra tous les 24 mois), Marine ayant quitté le 31/12/2022. CRA denses juin/juillet/août 2026 pour
  tout consultant actif, sauf le mois d'août d'Alice (laissé vide exprès pour les tests e2e
  interactifs). Historique de factures depuis 2016 : plusieurs statuts (brouillon, émise, annulée
  par avoir) — ADR-0080. `time pnpm run seed` mesuré à ~3,3 s, très en dessous du budget de 60 s :
  rien à couper.
- Point 6, plafond `limit=50` : corrigé. `GET /api/v1/cras` a son propre plafond à 200
  (ADR-0081), `/api/v1/invoices` reste à 50 (non mesuré, non touché).
- `pnpm run seed:fingerprint` relancé, reproductible sur deux `db:reset && seed` propres (rien à
  committer, le script n'écrit pas de fichier).
- Suite e2e Playwright complète (journeys + desktop + mobile-shell) repassée entièrement au vert
  après réécriture de plusieurs assertions cassées par le nouveau volume de données (voir
  `docs/open-questions.md`, section "Wave 2 outcome — item 6 steps 3–4" pour le détail).

- Relecture (advisor) après les 3 commits ci-dessus : un vrai trou trouvé et documenté (pas corrigé
  en code, hors périmètre de l'item 6). Le sélecteur de mois du pré-facturier
  (`composition/pre-facturier.ts`, `MAX_MONTHS = 50` — un plafond différent de celui d'ADR-0081 sur
  `/api/v1/cras`) lit une page de CRA triée par mois décroissant : pour Paris et Lyon, les seuls
  CRA denses juin/juillet/août 2026 remplissent déjà cette page, donc les périodes historiques
  2016–2024 des vétérans n'apparaissent plus du tout dans le sélecteur — vérifié en base. C'est
  exactement le seuil que le README nommait déjà pour rouvrir ce sujet ("une implantation dont les
  CRA dépassent une page") : franchi par cette session, pas corrigé (le correctif attendu est un
  écran/requête dédié, hors périmètre). Le README (ligne "Pagination du pré-facturier…") et
  `docs/open-questions.md` (nouvelle ligne 31/08/2026) pointent maintenant l'un vers l'autre.
  ADR-0080 et ADR-0081 ont aussi reçu chacun un renvoi/paragraphe manquant (README → ADR-0080 sur
  l'avoir ; ADR-0081 → la deuxième moitié de la règle BUILD-RULES sur la pagination, pas seulement
  la première). Commit `32dc004`, documentation seule, aucun code touché.

**Pour la prochaine session** : rien en attente côté code sur `fix/qa-round-1`. Le point ouvert
réel est le sélecteur de mois du pré-facturier ci-dessus (docs/open-questions.md, ligne du
31/08/2026) — pas un blocage, mais nommé pour ne pas être redécouvert à l'aveugle. Le détail complet
(décisions, alternatives rejetées, ce qui a été mesuré) est dans `docs/open-questions.md`, sections
"Wave 2 plan — item 6" et "Wave 2 outcome — item 6 steps 3–4 shipped" (juste après), et dans les
ADR-0078 à ADR-0081. **4 commits locaux, non poussés, pas de merge sur `main`** — à pousser/merger
quand Clement le décide.

To do :

1. ✅ FAIT — commit `eae29d2`. Mesuré en direct (Playwright bounding boxes contre un dev server
   tournant) : la boîte du bouton faisait exactement 56px, pile la hauteur de la barre (`h-14`) —
   0px de marge des deux côtés, avec le contenu (deux lignes de texte, la seconde portant la boîte
   du `RoleBadge`) qui remplissait déjà tout l'espace sous l'ancien `py-1.5`. Remplacé par
   `py-[3px]` plus un nouveau `my-[3px]` : ~3px de marge réelle mesurée de chaque côté, sans
   toucher aux 56px sur lesquels le reste de la barre est construit. Pas un invariant garanti —
   noté dans le commentaire (si `RoleBadge` grossit un jour, rien ne rattrape le bouton). Pas
   d'ADR (correctif CSS, pas une décision structurelle).

   Un peu de marge en haut et en bas autour du bouton de selecteur de rôle dans la barre en haut à droite. Les bordures du bouton sont sur les bordures de la barre du haut, ce n'est pas joli.

2. ✅ FAIT — commit `9e96f1f`. Confirmé : seule Alice était exclue (`DENSE_PERIOD_EXCLUSIONS`,
   maintenant supprimé — plus personne d'autre n'était concerné). Alice a maintenant un août
   dense comme tout le monde. `EDIT_PERIOD` (journeys.spec.ts) déplacé 2026-08 → 2026-09 (mois en
   cours, naturellement vierge car hors `DENSE_PERIODS`) ; le test "item 3" qui réservait déjà
   2026-09 comme mois vierge déplacé vers 2026-10. `axe.spec.ts` et `CLAUDE.md` § Dataset shape
   mis à jour en conséquence. Vérifié : `db:reset` ×2 + `seed:fingerprint` identiques, e2e
   `journeys` (20/20) et `axe` (18/18 desktop, 15/15+3 skip mobile-shell) verts — à `--workers=2`
   sur cette machine (7,5 Go RAM, déjà en swap) : le run par défaut produit ~14 timeouts
   aléatoires sans rapport avec ce changement (mêmes échecs sur des écrans jamais touchés,
   différents d'un run à l'autre). Pas d'ADR (fixture, décision déjà tranchée par la consigne).

   Il n'y a pas de mois d'aout rempli pour Alice Martin (et peut-être pour d'autres consultants) alors qu'on est en septembre

3. ✅ FAIT — commit `322e621`, ADR-0083. Cause réelle (trouvée en instrumentant, pas supposée) :
   cocher une case navigue vers une nouvelle URL, ce qui faisait repasser `isPending` à `true` et
   `CraListScreen` remplaçait tout son arbre de rendu par `<ListSkeleton />` — démontant le
   popover et réinitialisant son propre état `open`. Corrigé avec `placeholderData:
keepPreviousData` sur `craListQueryOptions` : les lignes de la page précédente restent
   affichées pendant le refetch, donc rien ne démonte le popover. Ce correctif change
   l'interaction normale (le popover reste ouvert), ce qui a exposé une vraie course (deux
   `onChange` dans le même tick calculant leur sélection depuis le même `consultantIds`/`statuses`
   devenu obsolète) — corrigée par `toggleDiff`/`applyDiff` (ADR-0083), avec un test e2e qui
   échoue sans le correctif et passe avec. Vérifié : suite `journeys` complète verte deux fois de
   suite (23/23), `pnpm run check` vert, `pnpm run test:int` vert.

   Le selecteur de consultants se referme dès qu'on souhaite en cocher un dans la page CRA d'un manager

4. ✅ FAIT — commit `ecaf924`. Deux filtres indépendants (année seule, mois seul, ou les deux — ET
   logique entre eux), en plus des filtres consultants/statut existants. Domaine :
   `CraListQuery.year`/`.month` (`packages/timesheet`) ; SQL via `left(period,4)`/`right(period,2)`
   (`period` est du texte `YYYY-MM`, pas un vrai type date — commentaire de la migration 002).
   API : `GET /api/v1/cras?year=&month=` (bornes 2000-2100 / 1-12, Zod). Web : deux `Select`
   (même composant que items 7+10, donc même position/animation), sélecteurs URL-owned comme les
   filtres existants. Vérifié en direct : `year=2016` → exactement Julien Fabre + Marine Girard
   (juin 2016) sur Paris ; `year=1900`/`month=13` → 400 ; combinaison ET correcte. 4 nouveaux
   tests d'intégration API + 1 test e2e (narrows séparément, ET ensemble, survit au reload) + 1
   test unitaire (`frenchMonthName`). Un vrai piège trouvé en creusant : le serveur `api:dev` de
   dev tournait depuis avant mes changements et `node --watch` n'avait PAS repris les modifications
   de `packages/timesheet` — plusieurs minutes perdues à croire le filtre cassé alors que c'était
   un serveur dev périmé (redémarrage propre → tout fonctionne). Vérifié : suite `journeys`
   complète verte (25/25) après reset propre, `pnpm run check` vert, `pnpm run test:int` vert
   (16/16 fichiers, 209/209 tests). Pas d'ADR (extension directe d'un filtre déjà décidé — item 7,
   QA round 1 — pas une nouvelle décision structurelle).

   Il faut aussi un filtre par année et/ou mois dans la page de CRA des managers

5. ✅ FAIT — commit `b522755`, ADR-0082. Règle implémentée : un CRA dans un état actionnable
   (`submitted` = en attente de décision manager, `refused` = correction attendue du consultant)
   reste visible quel que soit le mois affiché. `pendingDecisions`/`lateCras` (manager) lisent
   maintenant `unit.cras.list({ actor, statuses, ... })` sans filtre de période (plafonné à
   `CRA_LIST_MAX_PAGE_SIZE = 200`, ADR-0081) au lieu de la seule période demandée ; `billableCents`
   reste scopé à la période demandée (c'est un vrai montant mensuel, pas un état actionnable). Le
   consultant gagne un champ `refusedPeriods` (liste des périodes actuellement refusées), affiché
   comme une alerte par période autre que celle affichée, avec un lien direct vers son CRA. Tests :
   2 nouveaux cas d'intégration (`dashboard.int.test.ts`) + 1 nouveau test e2e (`journeys.spec.ts`,
   réutilise le refus de J3). Vérifié en direct (curl, dev topology) : dashboard manager sur
   septembre (vide) affiche quand même `pendingDecisions:1, lateCras:1` venant de juin. Non
   corrigé, nommé dans l'ADR et dans `docs/open-questions.md` (ligne du 31/08 mise à jour) : le
   bouton « Ouvrir le pré-facturier » du manager ouvre toujours la période demandée, pas
   directement celle où se trouve l'élément en attente — pas de nouvelle phase créée, le correctif
   attendu est le même que celui déjà nommé pour le sélecteur de mois du pré-facturier.

   Il faut faire en sorte d'afficher les CRA soumis et non-validés dans le dashboard d'un manager même s'il n'est pas du mois en cours. Si le consultant le soumet un vendredi 31/08, le manager ne va l'ouvrir qu'à partir du lundi suivant, qui sera en septembre, avec le code actuel, ça n'apparait pas dans son dashboard des CRA à valider. J'imagine qu'il en va de même pour le dashboard du consultant, qui ne voit pas que le mois précédent a été refusé si on est le mois suivant. Il faut que les dashboards ne soient pas filtrés sur le mois en cours j'imagine.

6. ✅ INVESTIGUÉ, AUCUN DÉFAUT TROUVÉ — commit `39fa1de`. `curl` contre un `pnpm --filter @erp/web
dev` tournant répond 200 `image/svg+xml` exactement sur le href déclaré ; le `<link>` est bien
   présent dans le HTML servi sur `/`, `/cra` et `/tableau-de-bord` ; aucun `public/favicon.*`
   parasite n'existe ; et le test `routing.spec.ts` "item 5" (déjà existant) affirme le même
   200/content-type sur le projet dev — relancé, vert. Chromium headless ne fait **jamais** de
   requête favicon (vérifié : 124 requêtes sur un chargement complet de page, zéro liée au
   favicon), donc l'icône d'onglet d'un vrai navigateur n'est pas observable depuis cet
   environnement. Rien à corriger côté code. Ajouté `sizes="any"` au `<link>` existant en
   durcissement standard peu coûteux — pas un correctif d'un bug reproduit, puisqu'aucun ne l'a
   été. Deux explications réelles restent possibles et seul Clement peut les vérifier (nommées
   dans le commentaire du fichier) : un onglet ouvert depuis avant `b157327`, ou le cache favicon
   par origine du navigateur — à confirmer en fenêtre privée. Pas d'ADR (aucune décision prise).

   Ajouter une favicon pertinente, y compris en dev. Je ne la vois pas.

7. ✅ FAIT — commit `991347d`, avec item 10. `ui/select.tsx`'s `SelectContent` avait par défaut le
   positionnement Radix `item-aligned`, qui superpose délibérément l'option sélectionnée sur le
   trigger (comportement `<select>` natif) et supprime l'animation d'ouverture/fermeture déjà
   écrite dans ce même fichier. Bascule du défaut vers `popper` (même famille que `Popover`,
   utilisé par le multi-select consultants) — un seul changement dans le composant partagé, pas
   une reconstruction : le CSS du mode popper existait déjà, inutilisé. Vérifié en direct
   (Playwright, dev server) : le panneau démarre maintenant au bord bas du trigger, même largeur,
   liste complète affichée (contre 3/14 mois visibles avant, superposés). 2 tests e2e permanents
   ajoutés (`motion.spec.ts`) : positionnement + `prefers-reduced-motion` (même paire que Dialog).
   Vérifié : `motion.spec.ts` vert (7/7) desktop + mobile-shell, `desktop` complet vert (44/45, le
   seul échec un flake axe/motion préexistant confirmé sans lien en le relançant seul), `journeys`
   complet vert (23/23).

   The "Ouvrir un autre mois" selector is a bit weird to use. The list goes over the "Choisir un mois", not under. And it feels like we are using two differents tools between the selector and the selector list, it's not the same design.

8. ❌ DÉLIBÉRÉMENT REPORTÉ — décision de Clement, 01/09/2026. Item 8 (écran d'affectation de
   missions aux consultants) sort du périmètre de cette session : pas commencé, pas de scaffolding
   laissé dans la branche. Categoriquement plus gros que tout le reste combiné (nouvelle route,
   nouveau chemin d'écriture, nouvelle surface d'autorisation, un ADR, à vérifier contre « Ce que
   je ne construis pas » et contre l'habilitation PASSI). Pas de ligne `docs/open-questions.md` —
   décision du propriétaire du produit, pas une question ouverte.

   Il faut ajouter la possibilité, pour un manager d'affecter des missions à des consultants. Il faut donc un écran qui le permette.

9. ✅ FAIT — commit `7455638`. Cause réelle confirmée en direct (`page.on('request'/'load')`, pas
   supposée) : `useMutation`'s hook-level `onSuccess` s'exécute toujours avant celui du site
   d'appel — donc `useClearPersona`'s `invalidateOnPersonaChange` lançait son `invalidateQueries()`
   non filtré pendant que l'écran encore affiché (le tableau de bord d'un manager, par ex.) avait
   encore sa requête liée à la persona active, une frame avant que `navigate({to:'/'})` ne la
   démonte. Cette requête active se relançait immédiatement contre un cookie que la mutation venait
   de supprimer côté serveur — un échec garanti. `session-guard.ts` réagit globalement à toute
   erreur de cache par `window.location.assign('/')` : un vrai rechargement dur par-dessus la
   navigation client déjà en cours. L'écran blanc était le document qui se détruisait pour ce
   rechargement ; le second skeleton, le remount qui suivait. Corrigé en passant `refetchType:
'none'` à cet `invalidateQueries()`, pour `useClearPersona` seulement (`useSelectPersona`
   inchangé — son propre refetch actif réussit puisqu'il tourne sous le cookie que la mutation
   vient de POSER). Tout reste marqué stale (la protection anti-fuite inter-persona de l'item 1,
   QA round 1, n'est pas affectée — vérifié, son test passe toujours), rien ne se relance de façon
   synchrone. Test e2e discriminant ajouté (`journeys.spec.ts`, « item 9 ») : échoue sans le
   correctif (une requête document = le rechargement dur), passe avec. Vérifié : suite `journeys`
   verte deux fois de suite (24/24), `pnpm run check` vert, `pnpm run test:int` vert. Pas d'ADR
   (correctif de bug, pas une nouvelle décision structurelle).

   Lors du changement de persona, les écrans apparaissent ainsi : skeletton/placeholder persona selector -> blank screen (empty) -> skeletton/placeholder persona selector -> real persona selector. The white/empty page shouldn't happen. The skeletton/placeholder should be displayed only if it's taking a bit too long before displaying the real persona selector I think. Can you fix at least the empty screen flash and rework the skeletton logic if it's flawed?

10. ✅ FAIT — commit `991347d`, avec item 7. Même cause, même correctif (`SelectContent`'s
    `position` par défaut → `popper`) : le sélecteur de mission de la page CRA utilise le même
    composant partagé que le sélecteur de mois. « Deux designs différents » (Tanstack vs Popover)
    résolu en unifiant sur `popper`, qui aligne visuellement `Select` sur `Popover`. L'animation
    d'ouverture/fermeture demandée est incluse (les classes existaient déjà dans le composant,
    juste jamais activées). Vérifié en direct sur `/cra/2026-09` (le sélecteur « Choisir une
    mission... ») en plus du sélecteur de mois — même comportement, même vérification que l'item 7.

    Tout comme le point 7, le selecteur de mission dans la page du CRA est bizarre, la mission apparait sur le placeholder, pas en dessous. On dirait aussi qu'il s'agit de deux designs différents ou deux outils différents, l'un tanstack l'autre custom ou je en sais pas quoi. Il faut uniformiser ces selecteurs. Je trouve que ça se comporte mieux sur le selecteur de consultants sur la page de CRA des managers. Il faudra peut-être repartir de ça (et encore, il manque encore une petite animation d'ouverture/fermeture du selecteur sur celui-ci).

11. ✅ FAIT — commit `322e621`, avec item 3. `MultiSelectCombobox` a perdu l'icône `CheckIcon`
    redondante à côté de la case à cocher et la liste de badges redondante qui répétait les mêmes
    noms sélectionnés — la case à cocher est maintenant le seul endroit qui répond « lesquels ».
    Vérifié par un test e2e dédié (`journeys.spec.ts`, « items 3 + 11 ») : un seul `svg` par ligne
    cochée, chaque nom sélectionné apparaît une seule fois dans le popover.

    Le selecteur de consultants dans la page des managers affiche à la fois une case à cocher, une petite icone de validation à droite quand la personne est sélectionnée et également un liste avec des labels des personnes sélectionnées. Ca fait un peut trop chargé, il ne faut garder que les cases à cocher, pas les icones à la droite du nom

12. ✅ FAIT — commit `d649f72`. Root cause confirmed: `#upsertInvoice` gated `totals` on
    `status === 'issued'` instead of `!== 'draft'`, so a `cancelledByCreditNote` invoice was
    written with null totals and could never be reconstituted (500 on
    `GET /api/v1/invoices/:id` and `/api/v1/pre-facturier`). Same wrong shape found and fixed in
    the API's own invoice DTO (`apps/api/src/routes/api.ts`) — would have kept hiding totals in
    the JSON response even after the persistence fix. The SSR printable `/facture/:id` page was
    never affected (`Invoice.totals` getter falls back to computing from lines, never throws).
    Regression test added (repo int test: save via `cancelByCreditNote()`, read back). No ADR
    (bug fix, not a decision). Verified live after `db:reset`: both endpoints 200, SSR page 200.
    `pnpm run check`, `test:int`, and the full `journeys` e2e project (20/20) all green.

13. On a plusieurs factures pour un même client pour une même période avec un même montant. Est-ce normal ? Si ce n'est pas le cas, il faut corriger. -> DONE, we added for which consultant it was invoiced.

14. ✅ FAIT — commit `f17241e`. « Maquette ERP » partout où le nom apparaissait : `package.json`,
    le `<title>`, la barre latérale, le README, les libellés serveur (`apps/api/src/web/labels.ts`)
    et client (`apps/web/src/lib/labels.ts`) — les deux fichiers de libellés existent et comptent
    tous les deux.

15. ✅ FAIT — commit `bca3091`. Favicon redessinée, plus les replis PNG et apple-touch qui
    manquaient. Le test de `routing.spec.ts` qui vérifiait qu'un `<link rel="icon">` répond 200 en
    SVG a été resserré sur `[type="image/svg+xml"]` — sans ça il tombait sur le premier PNG déclaré
    et n'aurait plus vérifié ce qu'il annonce.

16. ✅ FAIT — commits `3f21a1b` puis `2cb6fcd` (PR #17, mergée sur `main` séparément), ADR-0088.
    Cause **mesurée**, pas déduite : le vhost nginx entier était limité par un seul
    `limit_req zone=erp_maquette rate=10r/s burst=20`, dimensionné pour un humain qui clique. Une
    seule route SPA demande le document plus des dizaines de chunks en parallèle ; au-delà du
    vingtième, nginx répondait sa **propre page HTML 503**, donc le navigateur recevait `text/html`
    en demandant un module JavaScript et le refusait au titre du `X-Content-Type-Options: nosniff`
    de l'application — exactement les `NS_ERROR_CORRUPTED_CONTENT` et les « disallowed MIME type »
    de la liste. Mesuré avant correctif : 60 requêtes parallèles sur un seul asset donnaient
    exactement 20 × 200 puis 40 × 503 ; après, 60 × 200. Livré : `location ^~ /assets/` sur une
    seconde zone (`100r/s burst=200`, toujours limitée), `immutable` sur les assets et `no-cache`
    explicite sur le shell, et `z.config({ jitless: true })` pour la ligne « Missing 'unsafe-eval' »
    (Zod 4 sonde le JIT avec `Function('')`, se rabat correctement, mais le navigateur journalise
    le refus avant). Vérifié en production : trois rechargements forcés de `/tableau-de-bord`, zéro
    erreur console, zéro requête en échec. ⚠️ **Deux lignes de la liste n'ont jamais été à nous** :
    `content.js:74` et `node.js:416` sont les scripts d'une extension de navigateur — à revérifier
    en navigation privée, extensions coupées.

17. ✅ FAIT — commits `e2717f2` puis `106c90d`, ADR-0092. Module « Informations CSE / vie de
    l'entreprise » : cinq messages au plus, défilement avec minuterie visible, image et pièce
    jointe possibles, repli persisté **par persona**
    (`erp:dashboard-company-news-hidden-at:${personaKey}`, via `lib/local-preference.ts`, lecture et
    écriture sous `try`/`catch`) et réapparition automatique à la publication d'un nouveau message.
    `106c90d` corrige deux défauts trouvés en repassant sur le lot : la boucle RAF de progression
    re-rendait tout le tableau de bord ~60 fois par seconde indéfiniment (rendant tout screenshot
    non déterministe), et la zone de message n'avait pas de hauteur minimale. Les trois
    illustrations ne sont **jamais** inlinées (ADR-0092) : sous `data:`, la CSP de production
    (`img-src 'self'`) les refuserait, et ça ne se voit que sur un build servi.

18. ✅ FAIT — commit `35d5202`, test `b5a63fb`, ADR-0090. `GET /api/v1/team` : pour un consultant
    son N+1, pour un manager ses N-1 **et** son N+1. Aucun SQL nouveau — `hierarchy()` (jusqu'ici
    utilisé côté écriture seulement) et `consultantsOfOffice()`. La décision réelle est
    l'ADR-0090 : les N-1 d'un manager sont l'**intersection** de son implantation et de sa chaîne
    hiérarchique, parce que le seed porte deux rattachements inter-implantations (Gabrielle,
    Bordeaux → Bruno, Paris) et que tout le reste de l'API est borné à `actor.officeId`. Test
    d'autorisation **par rôle et par portée** ajouté (`team.int.test.ts`) : chacun des trois filtres
    — implantation, hiérarchie, `departure_date` — a été retiré pour de vrai et fait tomber au moins
    un test. Les deux moitiés de l'ADR-0079 sont vérifiées séparément : Marine est absente de
    l'effectif courant **et** son CRA de 2022 reste lisible par le même manager.

19. ✅ FAIT — commit `5342d50`. Le bouton de copie accuse la copie sur lui-même (icône et libellé),
    en plus du toast.

20. ✅ FAIT — commit `2f11d74`. Trois pages `ComingSoon` — « Mes informations », « Mes notes de
    frais », « Mes demandes d'absence » — visibles pour les trois rôles, en fin de menu.
    `shell.spec.ts` assertait la liste **exacte** des entrées de nav par rôle : les quatre listes
    ont été mises à jour, pas assouplies. Le README dit maintenant explicitement que ce sont des
    emplacements assumés, pour qu'un lecteur froid ne trouve pas la contradiction avec la section
    « Ce que je ne construis pas » tout seul.

21. ✅ FAIT — commit `6aac97a`. « Décider » devient « Vérifier » et ouvre le CRA du consultant
    directement, plus le pré-facturier.

22. ✅ FAIT — commit `2a446ad`, tests `0153c78`, ADR-0091. Les deux cartes pointent sur `/cra`
    filtré sur exactement ce qu'elles comptent, et **omettent** `year`/`month` au lieu de les
    laisser sur la période affichée (ADR-0082 : ces compteurs ne sont jamais bornés à une période)
    — c'est le piège de l'item, une carte à 3 au-dessus d'une liste à 1. « En retard » n'avait
    aucun équivalent : `beforePeriod` a été ajouté de bout en bout (port de domaine, SQL, route,
    schéma de recherche), ce qui est une décision et a donc un ADR. Cinq tests d'intégration, dont
    l'égalité qui compte : `lateCras` et la liste que la carte ouvre renvoient le même nombre.
    Vérifié aussi en direct dans un navigateur (carte 1 / liste 1 ligne, sur les deux cartes).

23. ✅ FAIT — commit `82c45c4`. Zone des graphiques repliable, même icône œil / œil barré que le
    module d'information, choix persisté **par persona**
    (`erp:dashboard-charts-visible:${personaKey}`, même helper, même `try`/`catch`).

24. ✅ FAIT — commit `f4a797c`. Le déclencheur du filtre d'années est élargi ; « Toutes les années »
    ne se coupe plus.

25. ✅ FAIT — commit `78ebefb`, **et vérifié dans un vrai navigateur cette session**, ce que le
    commit d'origine laissait ouvert. La colonne « Période d'exécution » trie sur la clé brute
    `YYYY-MM` via un `sortingFn` explicite plutôt que sur la détection automatique de type de
    TanStack. Mesuré sur `/factures` : ascendant donne juin → juillet → août 2026 (chronologique —
    l'ordre alphabétique donnerait août, juillet, juin), descendant l'inverse.

26. ✅ FAIT — commit `835a406`. Le texte « Week-end » / « Jour férié » quitte l'en-tête de colonne ;
    la couleur de fond porte la distinction et une légende sous le tableau l'explique. Le texte
    reste en `sr-only`, donc un lecteur d'écran a toujours l'information. ⚠️ **C'est cet item qui a
    causé l'item 34** : `sr-only` est `position: absolute`, et rien entre lui et le bloc conteneur
    initial n'était positionné — voir l'ADR-0089. L'assertion e2e correspondante a été **mise à
    jour, pas supprimée** : elle vérifie maintenant le nom accessible _et_ le contenu du `sr-only`.

27. ✅ FAIT — commit `bb55ce6`. Message reformulé. ⚖️ **Un arbitrage à confirmer** : l'énoncé donnait
    la phrase cible **sans** point final, et elle est livrée **avec**. Toutes les autres entrées de
    `problem.sentences`, dans les deux fichiers de libellés, se terminent par un point, ses voisines
    immédiates comprises — le point a été lu comme tombé par inadvertance à la rédaction de l'item,
    pas comme une consigne de casser la convention du fichier. Si c'était bien une consigne, c'est un
    caractère à retirer.

28. ✅ FAIT (une moitié), ⚠️ **une moitié ouverte** — commit `0645aa5`. Le warning à la soumission
    et le repérage visuel côté manager sont faits, y compris dans la boîte de confirmation ouverte
    depuis le CRA détaillé. **Le bouton « Valider » du pré-facturier n'a pas le warning** :
    `PreFacturierCraRow` ne calcule aucun `CraFlag` par ligne (résumé léger et paginé, par
    conception), et l'ajouter voudrait dire charger les lignes et le calendrier de chaque CRA
    listé. Coût non mesuré, donc non tranché ici → ligne dans `docs/open-questions.md` datée du
    04/09/2026, à décider d'ici le 30/09/2026.

29. ✅ FAIT — commit `6001d36`. Bouton d'action de l'alerte centré verticalement, avec l'espace en
    dessous qui manquait.

30. ✅ FAIT — commits `ec5f4f0`, `0d2229f`, `fde6fdb`. Chronologie horizontale à partir de `sm`,
    bulles colorées par statut, connecteur centré. Les deux commits suivants sont des corrections
    trouvées en **repassant** sur le lot : le connecteur s'arrêtait 20px avant la bulle suivante
    (le `px-2` du `<li>` et le `gap-1` de l'`<ol>`, que le calcul `left-1/2 w-full` de la ligne ne
    lit pas — l'espacement a déménagé sur l'enveloppe du texte), et quatre filtres `:visible`
    ajoutés en e2e reposaient sur une prémisse fausse (`getByRole` exclut déjà `display:none`).
    Revérifié cette session dans un navigateur à 375 / 640 / 1440 px, sur une facture à deux
    évènements et sur une facture annulée par avoir à trois : connecteurs centrés et joignant les
    bulles dans tous les cas.

31. ✅ FAIT — commits `4a8033e` puis `c98b2e4`. « Motif : » préfixe le message du manager sur le CRA
    refusé, et aussi dans la chronologie métier — un troisième site d'affichage que l'énoncé ne
    nommait pas. Vérifié dans le constructeur `craTimeline` que `detail` n'est jamais rempli que
    pour le type `refused`, donc préfixer inconditionnellement y est sans risque.

Focus sur le design mobile :

32. ✅ FAIT — commit `0c1ba33`. `denied-state.tsx`, `error-state.tsx`, `empty-state.tsx`, vérifiés
    avec le vrai CSS compilé à 375 et 768 px sur le contenu le plus défavorable (le `problemType` le
    plus long, un `correlationId` uuidv7 complet). Deux vrais défauts : les lignes du `<dl>` de
    `DeniedState` étaient en `justify-between`, donc un `problemType` long se repliait
    indépendamment de son libellé et les deux moitiés se décalaient — elles sont empilées
    maintenant ; et le bouton de copie du `correlationId` restait collé au bout de la ligne, orphelin,
    dès que l'identifiant passait à la ligne — c'est du texte au fil maintenant, qui se replie d'un
    bloc. `empty-state.tsx` n'avait rien à corriger.

33. ✅ FAIT — commit `d2af17d`, **et le vrai cas `?from=` vérifié cette session**, ce que le commit
    d'origine n'avait pas fait (sa maquette de test codait un fil en dur). Le fil d'Ariane est
    `hidden lg:block` — le même seuil que le burger de `topbar.tsx` et que `sidebar.tsx`, pas `sm` —
    donc en dessous de 1024 px il ne reste que le `<h1>` tronqué. `display:none` le retire aussi de
    l'arbre d'accessibilité, plutôt que de le laisser annoncé sans être vu. Au-dessus, la liste
    passe en `flex-nowrap`, chaque miette sauf la dernière est `shrink-0`, et seule la dernière
    (nom du client + mois) tronque. Mesuré sur le vrai lien à trois miettes
    (Accueil → Pré-facturier → « Banque Nationale de Test — août 2026 ») à 375 / 768 / 1023 / 1024
    / 1440 px : la barre fait exactement 56 px partout, le fil est `none` en dessous de 1024 et
    `block` au-dessus, aucun débordement.

34. ✅ FAIT — commits `10168c9`, `c317de5`, test `c53426e`, ADR-0089. **Une seule cause pour
    l'essentiel, et c'est l'item 26 de ce même lot qui l'a introduite** : `sr-only` est
    `position: absolute`, rien entre lui et le bloc conteneur initial n'était positionné, donc les
    libellés lecteur-d'écran des jours non ouvrés (et le `<caption>`, depuis toujours) échappaient
    au conteneur de défilement et agrandissaient le **document**. Mesuré : `scrollWidth` de 1367 à
    768 px, 1615 à 1024 et à 1440, et `window.scrollTo(600, 0)` déplaçait vraiment la vue. Isolé en
    basculant chaque candidat un par un : `position: relative` sur le conteneur ramène le document à
    sa largeur, `overflow-x: hidden` non. `cra-quantity-cell.tsx` décrivait ce piège depuis la phase
    6 (et le contournait par `aria-label`) ; son commentaire disait « aucun ancêtre ici n'est
    positionné » comme un fait présent, ce qui a cessé d'être vrai — corrigé dans la foulée.
    Deux écrans restaient cassés **à 375 px seulement** (`c317de5`), invisibles à la largeur de 768
    où la passe précédente avait mesuré : le formulaire d'Affectations (une colonne de grille sous
    `lg`, dont le minimum automatique se résolvait sur l'`<option>` la plus large des `<select>` —
    466 px dans une page de 351), et la barre de progression du CRA (`shrink-0` à côté d'un libellé
    `text-nowrap`, 424 px indivisibles).

35. ✅ FAIT — commit `e29f1f6`, ADR-0089. Même défaut que l'item 34, à 90 degrés. Le shell est
    `h-dvh overflow-hidden` avec `<main>` pour unique conteneur de défilement : le document n'est
    censé défiler ni horizontalement ni verticalement, et il faisait les deux. Mesuré à 375 px :
    `scrollHeight` du document à 2545 pour `/pre-facturier` (contre 812 de fenêtre), 1464 pour le
    tableau de bord, 1526 pour les factures — d'où le « on scrolle plus bas que ce que prévoit la
    page », le plus visible sur l'écran qui a le plus de tableaux. `relative` sur `<main>`. Vérifié
    sur trois personas, huit routes, deux largeurs : le document fait exactement la hauteur de la
    fenêtre partout, `window.scrollTo(0, 5000)` laisse `scrollY` à 0, et aucune page n'a d'espace
    vide sous son dernier élément.

36. ✅ FAIT — commit `ffc2a14`. À 375 px les cartes « Émetteur » et « Facturé à » tenaient côte à
    côte dans ~170 px chacune : « N° de TVA intracommunautaire » prenait trois lignes à gauche, sa
    valeur débordait de la carte à droite, « Adresse de livraison » se repliait sur sept lignes, et
    les deux moitiés se repliaient indépendamment. Une seule colonne sous `sm`, libellé au-dessus de
    la valeur, côte à côte et valeur à droite à partir de `sm`. `break-words` sur la valeur n'est pas
    cosmétique : un numéro de TVA est un mot insécable plus large que la carte, et il poussait le
    conteneur de défilement du shell de côté (`main.scrollWidth` 468 contre 375 — 375 maintenant).
    Le squelette de chargement reçoit le même `sm:grid-cols-2`, pour ne plus annoncer deux colonnes
    que la page chargée n'utilise pas à cette largeur. Les montants sont intacts : récapitulatif de
    TVA et totaux gardent leurs colonnes tabulaires alignées à droite, aucun ne se replie au milieu
    d'un nombre.

**Garde-fou ajouté pour 34 et 35** : `apps/web/e2e/responsive.spec.ts`, projet Playwright dédié,
vérifie sur quatre largeurs (375 / 768 / 1024 / 1440) et tous les écrans en lecture seule que le
document ne défile sur aucun axe, que `<main>` ne défile pas horizontalement, et qu'aucune page n'a
d'espace vide sous son dernier élément. Les deux correctifs `relative` sont indépendants et le test
le prouve : retirer celui de `<main>` fait tomber 17 des 20 cas, retirer celui de la grille CRA en
fait tomber 3 — et pas les mêmes.

To do général :

37. Il faut revoir la page d'affectation des missions pour avoir une barre de recherche d'un consultant,
