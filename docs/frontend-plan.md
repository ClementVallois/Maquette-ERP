# Plan front-end — Refonte UI/UX de l'ERP, branchée sur l'API réelle

> Ce document remplace `docs/pre-frontend-plan.md`, qui avait été rédigé sans accès au code.
> Comme son prédécesseur, c'est un **document de travail** (rédigé en français, à destination de
> Clement et de l'agent exécutant) — s'il doit être versionné, la règle « tout en anglais sauf le
> README » de `docs/BUILD-RULES.md` ne doit pas s'appliquer, c'est une exception.

## 0. Contexte et objectif

La version web actuelle (Phase 6, `apps/api/src/web/`) est fonctionnelle et rigoureuse, mais
visuellement volontairement austère : HTML rendu serveur, zéro JavaScript client, deux liens de
navigation, aucun tableau de bord. L'objectif de ce plan est de reconstruire **la partie
interactive** de l'UI avec une stack moderne et un niveau de finition « produit réel », suffisant
pour impressionner un décideur (CEO) lors d'une démonstration.

Trois prémisses distinguent ce plan de son prédécesseur :

1. **Le backend existe, tourne, et fait autorité.** La SPA consomme l'API réelle (`/api/v1/*`)
   avec le cookie persona existant et le **seed déterministe** (période `2026-06`, 4 personas,
   scénarios de démo déjà en place). **Pas de MSW, pas de faker** : les données de démo sont le
   seed, et les contrats d'API sont énumérés en Annexe A — l'agent exécutant ne devine jamais.
2. **Les deux documents imprimables restent rendus serveur.** `GET /facture/:id` (facture avec
   mentions légales) et `GET /releve/:id` (relevé de CRA) sont déjà finis, testés, avec leur print
   CSS. La SPA les ouvre dans un nouvel onglet. Les autres écrans serveur (sélecteur de persona,
   liste/grille CRA, pré-facturier, marge) sont **retirés en Phase 9**, une fois la SPA au niveau.
3. **Le plan contient deux phases hors front** : une mini-tâche ADR (Phase 0 — le dépôt exige un
   ADR pour changer une décision, et le dépôt lui-même est un livrable), et une phase backend
   courte (Phase 5 — trois endpoints de lecture manquants, écrits test-first selon les règles du
   dépôt).

Contrainte structurante découverte dans le code : **il n'y a pas de CORS, et il n'y en aura pas.**
Le contrôle d'`Origin` refuse toute écriture dont l'origine diffère de `API_PUBLIC_ORIGIN`, et le
cookie est `SameSite=Strict`. La SPA est donc **same-origin** : servie par Fastify en production
(Phase 9), derrière le proxy Vite en développement (topologie fixée en Phase 0.3).

Ce document s'adresse à un agent (Claude Opus ou équivalent) qui l'exécute **de manière autonome,
phase par phase**. Chaque phase a des tâches, des sous-tâches et un **critère de sortie (Gate)**
vérifiable. L'agent ne passe pas à la phase suivante tant que le Gate n'est pas satisfait.

## 0bis. Règles de fonctionnement pour l'agent exécutant

1. **Travailler phase par phase, dans l'ordre.** Les tâches à l'intérieur d'une phase peuvent être
   réordonnées si une dépendance l'impose, jamais les phases.
2. **Ne jamais déclarer une phase terminée sans avoir vérifié son Gate.**
3. **Commits** : conventionnels, un commit = une étape défendable à l'oral. Le scope vient de
   l'enum fermé de `commitlint.config.js` (`web` et `api` y sont déjà) ; chaque phase indique ses
   scopes. **Jamais de trailer `Co-Authored-By`** — le hook `commit-msg`
   (`scripts/check-no-co-author.sh` via `lefthook.yml`) le rejette mécaniquement.
4. **Dépendances** : chaque ajout est justifié en une ligne dans le message de PR/commit, et la
   version épinglée doit avoir **au moins 7 jours** (quarantaine pnpm `minimumReleaseAge`).
   Vérifier avec `pnpm view <pkg> time` avant d'épingler.
5. **`lefthook` pre-push exécute `typecheck`, `boundaries`, `test:cov`** — ils restent verts à
   chaque commit, pas seulement en fin de phase. `pnpm run check` est la vérification complète.
6. La rigueur TS du dépôt s'applique à `apps/web` : `strict`, `noUncheckedIndexedAccess`,
   `exactOptionalPropertyTypes`, `verbatimModuleSyntax`, `no-console: error`, pas de `any`.
7. **Côté backend (Phase 5 et 9) : test-first.** Un endpoint = son `*.int.test.ts` contre le vrai
   Postgres, écrit avant la route, commité avec elle (règle du dépôt, ADR-0019).
8. **Aucune hypothèse sur les contrats.** L'ancienne règle « si une info backend manque, fais une
   hypothèse » est supprimée : les contrats sont réels (Annexe A). En cas de doute, lire
   `apps/api/src/routes/` ou appeler l'endpoint contre le seed. Pas de commentaire `// HYPOTHÈSE:`.
9. **Playwright : jamais de `waitForTimeout`.** Attendre un état, pas un délai.
10. **Captures d'écran** (Playwright `page.screenshot()`) à la fin de chaque tâche visuelle
    significative, stockées dans `tests/visual/review/<phase>-<tache>.png` pour revue humaine.
11. **Ne pas étendre le périmètre.** Toute idée hors de la chaîne CRA→facture va dans la section
    « Ce que je ne construis pas » du README, pas dans le code.

## 1. Stack technique retenue

> Choix tranchés par Clement le 24/08/2026 — à ne pas rouvrir sauf blocage technique avéré.

| Brique      | Choix                                                | Justification courte                                                                                                                                 |
| ----------- | ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Framework   | **React + TypeScript (strict)**                      | shadcn/ui et TanStack Router/Table/Form sont React-first ; portages Vue/Svelte moins complets.                                                       |
| Build       | **Vite**                                             | HMR instantané ; `apps/web` est la seule partie du repo avec une étape de build.                                                                     |
| Routing     | **TanStack Router** (file-based, **exports nommés**) | Routes typées, layouts imbriqués. `import-x/no-default-export` reste actif : les fichiers de route exportent `Route` (export nommé), pas de default. |
| Data        | **TanStack Query**                                   | Cache, invalidation, retry — sur l'API réelle.                                                                                                       |
| Tableaux    | **TanStack Table**                                   | Headless, design 100 % custom au-dessus. Pas de TanStack Virtual : le seed tient en une page et l'API cape `limit` à 50.                             |
| Formulaires | **TanStack Form** + **zod v4**                       | zod **4.4.3 est déjà dans le repo** — réutiliser cette version, ne pas en introduire une seconde.                                                    |
| UI kit      | **shadcn/ui** (composants copiés dans le repo)       | Look dense et professionnel, personnalisable à 100 %.                                                                                                |
| Style       | **Tailwind CSS**, quasi zéro CSS custom              | Tokens en variables CSS, convention shadcn.                                                                                                          |
| Icônes      | **lucide-react**                                     | Fourni avec shadcn/ui.                                                                                                                               |
| Animations  | **Transitions CSS + tokens Tailwind**                | Pas de Framer Motion : une dépendance de moins à justifier, les transitions de route se font en CSS.                                                 |
| Tests UI    | **Playwright** + **@axe-core/playwright**            | e2e contre la vraie stack (API + Postgres seedé). L'exclusion e2e du README est levée par la tâche ADR (Phase 0.1).                                  |
| Paquets     | **pnpm** (workspace existant)                        | `apps/web` devient un membre du workspace.                                                                                                           |

Retirés par rapport à l'ancien plan : **MSW**, **@faker-js/faker** (l'API et le seed existent),
**Framer Motion**, **TanStack Virtual** (aucun volume à virtualiser).

## 2. Principes d'architecture transverses (valables dans toutes les phases)

- **`apps/web` ne parle au backend qu'en HTTP.** La règle dependency-cruiser (allowlist) interdit
  tout import de `apps/api` depuis `apps/web` — c'est une erreur de build, pas une convention.
  `apps/web` **peut** importer `@erp/contracts` via son index (`ProblemDetails`,
  `API_PROBLEM_TYPES`) : c'est la seule passerelle typée autorisée, et elle suffit.
- **Les erreurs sont des `application/problem+json` RFC 9457. On branche sur `type`, jamais sur le
  status.** Champs : `type`, `title`, `status`, `detail?`, `instance?`, `invariant?` (409),
  `deniedBy?` (403), `errors?` (400/422, par champ), `correlationId?`. Le mapping type → message
  français vit dans un seul module de libellés.
- **Un seul module de libellés français, `as const`** (`src/lib/labels.ts`), copié du copy deck
  existant `apps/api/src/web/labels.ts` (357 lignes — le travail de rédaction est déjà fait).
  Décision épinglée : **copie, pas partage** — un nouveau membre `packages/` est exclu (intention
  ADR-0015), et la copie UI peut diverger. Aucune chaîne visible en dur dans un composant.
- **Langue et vocabulaire** : l'UI est en **français**. Le langage omniprésent (`CONTEXT.md`) est
  contraignant : `Cra`, `Regie`, `Tjm`, `Cjm`, `Intercontrat`, `Habilitation`, `Pré-facturier` ne
  se traduisent **jamais** (pas de « Timesheet », pas de « Time and materials »). Le sélecteur de
  persona n'est **pas** une authentification et la notice qui le dit reste visible (pas de
  « Login », pas de « User »).
- **Formats métier, non négociables** : argent en **centimes entiers** (`totalTtcCents`), taux de
  TVA en **basis points** (2000 = 20 %, 850 = 8,5 %), quantités en **quarts de journée** (ADR-0069, affichées
  « 0,5 j » / « 1 j »), périodes `YYYY-MM`, dates ISO. Affichage français : virgule décimale,
  `JJ/MM/AAAA`, espace insécable avant €, `Europe/Paris`. Le module `src/lib/format.ts` est le
  **miroir** de `apps/api/src/web/format.ts` (mêmes sorties, testées).
- **`Cjm`, `Tjm` et la marge n'apparaissent jamais dans une vue de liste** (règle BUILD-RULES).
  La marge vit sur son écran dédié, atteint par une navigation explicite — chaque lecture émet un
  log de divulgation côté serveur (ADR-0052). Pas de tooltip, pas de colonne dépliable.
- **Navigation pilotée par configuration** (`src/config/navigation.ts`), filtrée par le **rôle de
  la session**. Ajouter un module = une entrée dans le tableau, jamais du JSX dans la Sidebar.
- **Pattern « feature folder »** identique pour chaque domaine (`session`, `cra`, `pre-facturier`,
  `factures`, `marge`, `dashboard`) : `api.ts` (fonctions fetch), `hooks.ts` (TanStack Query),
  `types.ts`, `components/`. Aucun composant n'appelle `fetch` ni n'importe `api.ts` directement —
  uniquement les hooks.
- **Les états vides, d'erreur et de refus sont des livrables** (règle BUILD-RULES), pas du polish.
  Chaque phase d'écran liste les siens **avec la persona qui les démontre**.
- **L'offre suit le rôle** : un bouton d'action n'est rendu que si le rôle de la session porte
  l'action (comme les écrans serveur le font avec `carries(access, role)`). Et si un lien direct
  contourne l'offre, le 403 `problem+json` est rendu en page d'erreur designée qui nomme
  `deniedBy` — c'est une démonstration, pas un échec.

## 3. Arborescence cible

```
apps/web/
  package.json              # @erp/web, private ; scripts: dev, build, preview, typecheck
  tsconfig.json             # extends ../../tsconfig.base.json + jsx/DOM/bundler
  vite.config.ts            # proxy dev (Phase 0.3), alias @/ → src/
  index.html
  playwright.config.ts
  e2e/                      # specs Playwright (hors src/ : hors périmètre boundaries)
    journeys.spec.ts        # les 6 parcours (Annexe B)
    axe.spec.ts
  src/                      # ⚠ obligatoire : scripts/boundaries.ts cruise apps/*/src/**/*.ts
    main.tsx                #   et échoue si un membre n'a aucune source sous src/
    routes/                 # TanStack Router file-based — exports NOMMÉS (Route)
      __root.tsx
      index.tsx             # / : sélecteur de persona
      _shell.tsx            # layout sidebar + topbar, gardé par la session
      _shell/
        tableau-de-bord.tsx
        cra.index.tsx           # /cra : liste des mois
        cra.$period.tsx         # /cra/2026-06 : la grille
        pre-facturier.tsx       # /pre-facturier?period=
        factures.index.tsx      # /factures — PLURIEL : jamais de collision avec le SSR /facture/:id
        factures.$id.tsx
        marge.$consultantId.tsx # /marge/:id?period=
        dev.composants.tsx      # kitchen sink, dev uniquement
    components/
      ui/                   # composants shadcn générés
      shell/                # Sidebar, Topbar, PageHeader, PersonaBlock
      feedback/             # EmptyState, ErrorState (problem-aware), DeniedState, ConfirmDialog
      data-table/           # DataTable générique + toolbar/pagination
      status-badge.tsx      # badges sur les VRAIS statuts (Phase 2.4)
      stat-card.tsx         # cartes KPI (Phase 2.5)
    features/
      session/   cra/   pre-facturier/   factures/   marge/   dashboard/
        api.ts  hooks.ts  types.ts  components/
    lib/
      api-client.ts         # fetch same-origin, credentials, parsing problem+json
      problems.ts           # ProblemDetails de @erp/contracts, branche sur type
      labels.ts             # copie française du copy deck (as const)
      format.ts             # miroir de apps/api/src/web/format.ts
      query-client.ts
    config/
      navigation.ts
    styles/
      globals.css           # tokens CSS (convention shadcn), imports Tailwind
```

Routes SPA épinglées : `/`, `/tableau-de-bord`, `/cra`, `/cra/$period`, `/pre-facturier`,
`/factures`, `/factures/$id`, `/marge/$consultantId`. URLs en français, cohérentes avec l'existant.

---

## Phase 0 — Cadrage : ADR, direction visuelle, topologie de dev

**Scopes commit : `adr`, `docs`. Aucun code.**

### 0.1 La tâche ADR — une tâche courte, pas une phase de paperasse

Le dépôt exige un ADR pour changer une décision (« a rule that blocks you is either right, or it
needs a new ADR »), et trois décisions bloquent ce plan. Écrire **trois ADR courts** sur le modèle
`docs/adr/0000-template.md` (option rejetée + seuil de reconsidération, comme toujours) :

- **ADR-0062** — remplace **ADR-0009** (HTML serveur, pas de framework front). Argument : le seuil
  de réouverture écrit dans ADR-0009 lui-même (« le premier écran réellement interactif — une
  grille de Cra ») est atteint ; la grille de saisie passe en SPA. Option rejetée : rester en
  server-rendered avec du CSS plus riche (ne produit pas l'interactivité demandée).
- **ADR-0063** — remplace **ADR-0048** (les écrans vivent dans le déployable API). Nouvelle
  décision : l'API **sert** la SPA construite (`apps/web/dist`) en same-origin — un seul
  déployable, toujours — et garde les deux documents imprimables en rendu serveur. Consigner ici
  la topologie de dev (0.3).
- **ADR-0064** — remplace **ADR-0049** (la CSP déclare qu'il n'y a pas de script). Nouvelle CSP
  avec `script-src 'self'` ; la chaîne exacte est figée en Phase 9.2 et recopiée dans cet ADR.

Dans le même passage : amender `README.md` § « Ce que je ne construis pas » (la ligne « Framework
front (React, Vue)… seuil : — » et la ligne excluant les e2e/Playwright), et la table de stack de
`docs/BUILD-RULES.md`. **Numérotation : 0062 et suivants uniquement — 0027-0030 et 0032 sont
réservés aux Phases 7-8, ne jamais y toucher.**

### 0.2 Direction visuelle

Examiner les 5 maquettes de `docs/images/` et produire `docs/direction-visuelle.md`. Ce qu'elles
montrent (constaté, à adapter — pas copier) : **sidebar sombre quasi noire, repliable** (icône +
libellé, état actif marqué) sur **contenu clair neutre** ; topbar avec titre/breadcrumb + bloc
utilisateur à droite ; **cartes KPI** (grand chiffre + libellé) ; **tables blanches denses** avec
**badges de statut arrondis point + libellé**, toolbar recherche/filtres/onglets de vue, footer de
pagination ; formulaire multi-étapes à stepper vertical ; **un seul accent** (famille bleu/indigo —
adapté à une ESN cybersécurité ; éviter l'orange d'une des maquettes) ; sans-serif type Inter ;
rayons 8-12 px ; ombres très légères.

Contenu exigé de la note :

- **Palette** : hex précis mappés sur les **noms de variables shadcn** (`--primary`,
  `--background`, `--muted`, `--destructive`…), pas de « à définir ».
- **Table des couleurs de statut couvrant les VRAIS statuts** (pas des statuts inventés) :
  Cra `draft` / `submitted` / `refused` / `validated` + le tag « en retard » ; facture `draft` /
  `issued` / `cancelledByCreditNote` ; motifs de jours écartés `notRegie` / `unknownMission` /
  `noAgreedRate` / `unknownClient` ; flags `weekend` / `publicHoliday`.
- **Typographie** (police d'interface, échelle) et **layout** (schéma ASCII du shell).
- Garde-fou anti-design « IA générique » conservé de l'ancien plan : base neutre + un accent net,
  pas de crème/terracotta, pas de noir + acide.

### 0.3 Topologie de dev — écrite verbatim, pas improvisée

Le contrôle d'`Origin` compare l'origine du **navigateur** à `API_PUBLIC_ORIGIN`. La décision, à
consigner dans ADR-0063 :

- **Dev** : le serveur Vite `http://127.0.0.1:5173` est l'origine navigateur. `vite.config.ts`
  proxifie `/api`, `/facture`, `/releve`, `/healthz`, `/readyz` vers `http://127.0.0.1:3000`. Le
  `.env` de dev pose `API_PUBLIC_ORIGIN=http://127.0.0.1:5173`. Deux terminaux :
  `pnpm run api:dev` + `pnpm --filter @erp/web dev`.
- **Prod/démo** : Fastify sert `apps/web/dist` sur 3000, `API_PUBLIC_ORIGIN=http://127.0.0.1:3000`
  (ou l'origine publique). Une seule origine, pas de CORS, cookie inchangé.

**Gate de sortie** : les 3 ADR existent et suivent le template ; README et BUILD-RULES amendés ;
`docs/direction-visuelle.md` a des hex concrets et la table de statuts complète ; la topologie de
dev est écrite verbatim (valeurs d'env incluses).

---

## Phase 1 — Socle `apps/web` : scaffolding et intégration outillage

**Scopes commit : `web`, `lint`, `ci`, `deps`.**

### 1.1 Le membre de workspace

- Créer `apps/web/` : `package.json` (`"name": "@erp/web"`, `private: true`, scripts `dev`,
  `build`, `preview`, `typecheck`), `index.html`, `src/main.tsx` minimal, `vite.config.ts` (alias
  `@/` → `src/`, proxy de la Phase 0.3).
- ⚠ **Les sources vivent sous `apps/web/src/`** — `scripts/boundaries.ts` cruise
  `apps/*/src/**/*.ts` et **échoue si un membre n'a aucune source matchée**. Commiter au minimum
  `src/main.tsx` avec le scaffolding.
- Dépendances (React, Vite, TanStack, Tailwind, shadcn CLI, lucide) : chacune justifiée en une
  ligne, version **≥ 7 jours** (`pnpm view <pkg> time`).

### 1.2 tsconfig

- `apps/web/tsconfig.json` étend `../../tsconfig.base.json`, surcharge : `jsx: "react-jsx"`,
  `lib: ["ES2023", "DOM", "DOM.Iterable"]`, `moduleResolution: "bundler"`, `noEmit: true`. Les
  flags stricts du base restent.
- Script `typecheck` local (`tsc -p tsconfig.json --noEmit`) pour que le `typecheck` racine
  (récursif) le ramasse. Vérifier que les globs du `tsconfig.json` racine n'avalent pas
  `apps/web` avec des réglages Node.

### 1.3 ESLint

- Bloc scoped `apps/web/**` dans `eslint.config.js` : enregistrer `apps/web/tsconfig.json` dans
  `parserOptions.projectService` et le resolver d'imports ; ajouter `eslint-plugin-react-hooks`.
- **Décision épinglée** : `import-x/no-default-export` **reste actif** sur `src/**` (TanStack
  Router file-based utilise des exports nommés `Route`) ; il n'est relâché que pour les fichiers
  de config (`vite.config.ts`, `playwright.config.ts`, `tailwind.config.*`). `no-console` reste.

### 1.4 Boundaries

- `pnpm run boundaries` vert avec le nouveau membre : l'allowlist `apps/$1 → apps/$1` et
  `apps/ → packages/*/src/index.ts` couvre déjà `apps/web` ; `.tsx` est déjà dans les extensions
  du resolver.
- **Preuve négative** (à exécuter, pas à commiter) : un import scratch de `apps/api` depuis
  `apps/web` doit faire échouer `pnpm run boundaries`.

### 1.5 Socle Playwright

- devDependencies `@playwright/test` + `@axe-core/playwright` (épinglées ≥ 7 jours).
- `apps/web/playwright.config.ts` : viewport desktop 1440 principal (+ 768 pour la vérification
  responsive du shell), baseURL du dev server, sorties dans `tests/visual/`.
- Test de fumée : l'app démarre, aucune erreur console.

### 1.6 CI

- Étendre `.github/workflows/ci.yml` : le lint/typecheck racine couvre déjà `apps/web` après
  1.2/1.3 (le dire explicitement dans le commit) ; ajouter le build web à un job existant ou
  dédié ; créer le **job Playwright** (service Postgres, migrate + seed, build, run) — il peut
  rester manuel/`workflow_dispatch` jusqu'à la Phase 6 qui le remplit, mais le fichier existe dès
  maintenant. Actions épinglées par SHA comme le reste du workflow.

**Gate de sortie** : `pnpm run check` vert à la racine ; `pnpm --filter @erp/web build` réussit ;
test de fumée Playwright vert ; CI verte.

---

## Phase 2 — Design system

**Scope commit : `web`.**

### 2.1 Tailwind + shadcn

- Installer Tailwind, initialiser shadcn/ui **avec la palette de la Phase 0.2 dès l'init** (pas la
  palette par défaut). Tokens en variables CSS dans `styles/globals.css`, convention shadcn.

### 2.2 Typographie

- Police d'interface **self-hosted** (Inter ou équivalent, via `@fontsource` ou fichiers locaux —
  pas de CDN : la CSP finale n'autorisera que `'self'`). ⚠ **Noter pour la Phase 9.2 : la CSP
  finale doit inclure `font-src 'self'`.**
- Échelle typographique + composants/classes pour les niveaux récurrents (titre de page, titre de
  carte, libellé, texte d'aide).

### 2.3 Composants shadcn

Installer et vérifier avec la palette du projet : `button`, `input`, `select`, `checkbox`,
`label`, `card`, `table`, `tabs`, `dialog`, `sheet`, `dropdown-menu`, `popover`, `tooltip`,
`avatar`, `badge`, `separator`, `skeleton`, `sonner`, `breadcrumb`, `scroll-area`, `alert`,
`alert-dialog`, `collapsible`. (En ajouter au besoin ; ne pas installer ce qui ne sert pas.)

### 2.4 `StatusBadge` — sur les vrais statuts

Un composant unique (point coloré + libellé français), variantes **exactement** sur la table de la
Phase 0.2 : les 4 statuts de Cra + « en retard », les 3 statuts de facture, les 4 motifs de jours
écartés. Libellés depuis `labels.ts` (Phase 3.3) — provisoirement en dur, migrés en Phase 3.

### 2.5 `StatCard` — cartes KPI

Grand chiffre + libellé + éventuel sous-texte, conforme aux maquettes. Les valeurs viendront des
endpoints réels — **pas de deltas « +15 % vs last month » inventés** : le seed n'a qu'une période.

### 2.6 Kitchen sink

Route `dev.composants` (exclue de la nav de prod) montrant chaque composant et chaque variante de
badge/carte. Screenshot Playwright de baseline (`tests/visual/baseline/kitchen-sink.png`).

### 2.7 Tokens de mouvement

Durée/easing standards (150-200 ms, `ease-out`) ; toute animation respecte
`prefers-reduced-motion`.

**Gate de sortie** : baseline kitchen-sink capturée ; aucune couleur en dur dans `components/` ;
`pnpm run check` vert.

---

## Phase 3 — Couche de données et session (API réelle)

**Scope commit : `web`.**

### 3.1 `lib/api-client.ts`

Wrapper fetch fin et typé : base `''` (same-origin — le proxy Vite fait le reste en dev),
`credentials: 'same-origin'`, JSON, en-tête `Accept: application/json`. Toute réponse non-2xx est
parsée en `ProblemDetails` et retournée dans un résultat discriminé (`{ok: true, value} |
{ok: false, problem}`) — pas d'exception non typée.

### 3.2 `lib/problems.ts`

Importer `ProblemDetails` et `API_PROBLEM_TYPES` de `@erp/contracts` (seul import cross-package
autorisé). **Brancher sur `type`, jamais sur `status`** : `/problems/no-persona` → redirection
sélecteur ; `/problems/unknown-persona` → purge cookie + redirection + toast ;
`/problems/out-of-scope` et `/problems/insufficient-role` → `DeniedState` nommant `deniedBy` ;
`errors` (400/422) → erreurs par champ ; `invariant` (409) → message d'état ; `correlationId`
toujours affiché dans les états d'erreur techniques.

### 3.3 `lib/labels.ts`

**Copier** le copy deck français de `apps/api/src/web/labels.ts` (structure `as const`, clés
anglaises / valeurs françaises, apostrophes typographiques), adapté aux besoins de la SPA. Y
inclure le mapping type-de-problème → phrase française (l'équivalent d'ADR-0060). C'est une copie
assumée qui peut diverger — pas de nouveau `packages/`, pas d'import cross-app.

### 3.4 `lib/format.ts`

Réimplémenter en miroir de `apps/api/src/web/format.ts` : `frenchEuros` (centimes → « 1 234,50 € »),
`frenchDate` (`JJ/MM/AAAA`), `frenchMonth` (« juin 2026 »), `frenchWeekday`, `frenchDays`
(quarts de journée → « 0,25 j » / « 12 j »), `frenchPercent` (basis points → « 8,5 % »). **Tests
unitaires vitest alignés sur les cas du `format.test.ts` de l'API** — mêmes entrées, mêmes sorties.

### 3.5 Query client

`staleTime` raisonnable, **retry ≤ 1 et jamais sur un problème 4xx** (un refus métier ne se
rejoue pas). Invalidation par feature après mutation.

### 3.6 Feature `session`

`GET /api/v1/personas`, `GET /api/v1/session`, `POST /api/v1/session/persona {key}`,
`DELETE /api/v1/session/persona`. Type `Role = 'consultant' | 'manager' | 'billing'`. Hook
`useSession` consommé par le shell et les guards.

### 3.7 Types par feature

`types.ts` de chaque feature reprend **exactement** les formes de l'Annexe A. Parse zod v4
optionnel à la frontière pour les deux payloads complexes (détail de Cra, détail de facture).

**Gate de sortie** : tests de `format.ts` verts et alignés sur ceux de l'API ; le kitchen sink (ou
une page scratch) affiche les 4 personas **réellement récupérées** via le proxy dev ;
`pnpm run check` vert.

---

## Phase 4 — Shell, navigation, sélecteur de persona

**Scope commit : `web`.**

### 4.1 Sélecteur de persona (`/`)

Grille de cartes — une par persona (Alice Martin · consultant · Paris ; Bruno Leroy · manager ·
Paris ; Emma Robert · manager · Lyon ; Henri Laurent · billing · Paris) avec badge de rôle et
bureau. La **notice « ceci n'est pas une authentification »** (renvoyée par l'API dans `notice`)
est affichée en évidence. Choisir → `POST /api/v1/session/persona` → redirection
`/tableau-de-bord`. C'est le premier écran de la démo : niveau de finition maximal.

### 4.2 Shell

Layout `_shell` : **sidebar sombre repliable** (mode icônes seules + tooltips), topbar avec titre
de page/breadcrumb et **bloc persona** à droite (nom, rôle, bureau, action « Changer de persona »
→ `DELETE /api/v1/session/persona` → `/`). Zones réservées non peuplées (droite de topbar, pied de
sidebar) pour les extensions futures.

### 4.3 Navigation par configuration

`config/navigation.ts` : entrées typées `{id, label, icon, path, roles}`. Filtrage par rôle de
session : **tous** → Tableau de bord ; **consultant** → Mon CRA ; **manager** → Pré-facturier,
CRA, Factures, Marge ; **billing** → Pré-facturier, Factures. La Sidebar lit exclusivement ce
tableau. Les routes des phases 6-8 pointent provisoirement vers des pages « à venir » soignées.

### 4.4 Guards et états globaux

- Pas de session (ou `/problems/no-persona`) → redirection `/`.
- `/problems/unknown-persona` (cookie périmé/forgé) → `DELETE` session, redirection `/`, toast.
- Page 404 stylée ; error boundary globale rendant un `ProblemDetails` en français avec
  `correlationId`.

### 4.5 Interactions

Entrée de nav active (sous-routes incluses), transition de route légère (tokens 2.7), sidebar en
`Sheet` sous le breakpoint `md`.

**Gate de sortie** : Playwright — pour **chaque** persona, la nav montre exactement les entrées de
son rôle ; un deep-link sans cookie redirige vers `/` ; screenshots du shell par persona ;
`pnpm run check` vert.

---

## Phase 5 — Endpoints de lecture manquants (backend, test-first)

**Scope commit : `api`.** Suivre les patterns existants de `apps/api/src/routes/api.ts` : zod à la
frontière, rôles déclarés en données via `config.access`, refus en problem+json, périmétrage par
bureau dans le repository. **Le `*.int.test.ts` s'écrit avant la route** et s'appuie sur les
valeurs exactes du seed. Les compositions existent déjà côté serveur dans
`apps/api/src/web/pages/*.ts` — les endpoints les **réutilisent**, ils ne réinventent rien.

> **Nommage épinglé** : le paramètre de période s'appelle **`period`** (aligné sur
> `/economics?period=`), pas `periode` (qui reste réservé aux URLs françaises des écrans).

### 5.1 `GET /api/v1/pre-facturier?period=YYYY-MM` — manager, billing

Miroir de la composition de `pages/pre-facturier.ts` (ADR-0053), périmétré au bureau de l'acteur :

```
{ period, summary: { billableCents, lateDays, craCount },
  invoices: [ InvoiceListItem ],
  cras: [ { craId, consultantId, consultantName, status, late, recordedQuarterDays,
            blockingReasons: [string], decidable } ] }
```

Tests : valeurs seedées exactes (Claire soumise, motifs bloquants), 401 sans persona, 403
`insufficient-role` pour un consultant, périmètre : `manager-lyon` ne voit pas Paris.

### 5.2 `GET /api/v1/cras/:period/grid` — consultant

Ce que `pages/cra-grid.ts` calcule côté serveur, exposé en JSON : le squelette du mois (jours,
flags non-travaillables `weekend`/`publicHoliday`) + les missions affectées du consultant sur la
période (`{missionId, name, clientName}`) + l'état courant du Cra s'il existe (statut, lignes,
motif de refus). Tests : mois d'Alice (jour partagé, absence, samedi flaggé), mois vide, 401/403.

### 5.3 `GET /api/v1/dashboard?period=YYYY-MM` — tous rôles connectés

Agrégats **honnêtes** par rôle, calculés depuis les repositories existants — rien d'inventé :

- consultant : statut de mon mois, quarts de journée saisis, jours restants non saisis ;
- manager : Cra soumis en attente de décision, total facturable du bureau (centimes), Cra en retard ;
- billing : factures brouillon / émises (compte), total TTC émis (centimes).

**Interdit : `cjmCents`, `tjmCents`, toute marge** — c'est une vue agrégée, la règle « jamais en
liste » s'applique. Tests par rôle avec les valeurs du seed.

**Gate de sortie** : `pnpm run test:int` vert (nouveaux tests inclus, cas de refus inclus) ;
`pnpm run check` vert ; aucun champ de marge dans les payloads du dashboard (testé).

---

## Phase 5bis — Le quart de journée devient l'unité (backend, ADR-0069)

**Scope commit : `platform`, `timesheet`, `billing`, `api`.** Décidée le 26/08/2026 : l'usage réel
saisit au quart de journée, ce qui est **exactement** le seuil de réouverture qu'ADR-0012 s'était
écrit à lui-même. ADR-0069 le tient. Cette phase passe **avant** la refonte de la grille et se
termine par une suite verte : une grille matricielle qui propose `0,25` à un domaine qui le refuse
n'est pas une étape intermédiaire, c'est un écran cassé.

> **La règle de cette phase** : ce n'est **pas** un `sed`. Un test qui affirme `halfDays: 2` pour
> « une journée pleine » a raison sur l'intention et tort sur la valeur ; renommé en aveugle il
> reste vert et ne prouve plus rien. Chaque assertion se relit. Le seul repère mécanique est la
> constante — `HALF_DAYS_PER_DAY` n'apparaît jamais en littéral `2` dans une règle, ce qui est
> précisément ce qu'ADR-0012 avait acheté en l'exigeant.

### 5bis.1 `@erp/platform` — la valeur

`quarter-days.ts` remplace `half-days.ts` : `QuarterDays`, `QUARTER_DAYS_PER_DAY = 4`, fabrique
`quarterDays()` qui refuse une fraction, un négatif, `NaN`. `MissionHalfDays` (charge utile de
l'événement, `events.ts`) devient `MissionQuarterDays`. Tests de la fabrique d'abord.

### 5bis.2 `@erp/timesheet` — les deux invariants par jour

`CraLine` porte `1` à `4` quarts. `Cra.halfDaysOn` → `quarterDaysOn`. `DayOverbookedError` et
`assertMonthAddsUp`/`IncompleteCraError` lisent la nouvelle constante — leur logique ne bouge pas,
et c'est ce qui rend la migration sûre : les deux bornes d'une journée existent déjà, explicitement,
dans le domaine. Elles ne sont **pas** réécrites côté client (règle 5 de `CLAUDE.md`).

Tests à relire un par un : `cra.test.ts` (surbooking : `2 + 2` devient `4 + 1`), les checks de
soumission (un jour ouvré incomplet), les erreurs typées et leurs messages français.

### 5bis.3 `@erp/billing` — la division

`money.ts` : diviseur `QUARTER_DAYS_PER_DAY`, précondition `tjmCents % 4 !== 0` au **même unique**
site de division. Elle tient pour la même raison qu'avant : un `Tjm` est un nombre entier d'euros
(ADR-0002), donc `tjmCents` est un multiple de 100, donc divisible par 4. `InvoiceLine` :
`quantityQuarterDays`, `unitPriceCents` = prix d'**un quart de journée**, `origin.quarterDays`.
`DeclinedDays` compte en quarts. Le test de référence `unitPrice × quantity === amountCents` reste
le garde-fou.

### 5bis.4 Persistance, migration, seed

Migration **`011-quarter-days.sql`** : `RENAME COLUMN` sur `timesheet.cra_lines.half_days`,
`billing.invoice_lines.quantity_half_days` / `origin_half_days`, `billing.declined_days.half_days`,
et `CHECK` réécrit sur la nouvelle borne. Une migration numérotée, pas une édition de `002`/`003` :
le journal de migrations est l'histoire du schéma. **Aucune migration de données** — le seed est
déterministe et la base se réinitialise (ADR-0022) ; ADR-0069 dit pourquoi c'est la dernière fois.

Le seed est régénéré : une journée pleine vaut `4`, et **au moins un jour du seed est saisi en
quatre quarts**. Il va dans le mois de **juin d'Alice**, qui est `validated` : il traverse donc
toute la chaîne jusqu'à la facture, et prouve la facturation au quart de bout en bout plutôt que
de décorer un écran. Le seed reste validé par zod.

**Ce que le seed ne change pas** : juin reste `validated` pour tout le monde sauf Claire
(`SUBMITTED_NOT_VALIDATED_EMAIL`), délibérément — c'est ce qui donne un historique réel au relevé
imprimable. Le mois **éditable** d'Alice est le mois courant (`2026-08`), vide, et c'est celui que
le parcours J1 saisit (6.8). C'est la moitié « J1 » de la question ouverte du 25/08 sur Annexe B ;
l'autre moitié (J3 de la Phase 7) reste ouverte et se tranche là-bas.

### 5bis.5 `apps/api` — le contrat et deux manques nommés

- `PUT /api/v1/cras/:period/entries` : une entrée par **cellule non vide**, portant `quarterDays`.
  `MAX_ENTRIES` passe de `62` à `124` (4 × 31), pour la même raison qu'il valait `62`.
- **`linesOf` (`apps/api/src/chain/record-month.ts`) change de règle et il faut le dire** : il
  groupait deux entrées identiques d'un même jour en **une** ligne de deux demi-journées, parce que
  deux lignes d'une demi-journée auraient imprimé deux fois la même mission le même jour sur la
  facture. Avec une quantité sur l'entrée, deux entrées pour le même `(day, dayType, missionId)` ne
  sont plus une saisie normale — la matrice n'a qu'une cellule pour ce triplet. Elles se
  **somment** en une ligne unique, ce qui garde la propriété qui compte (une ligne par triplet,
  donc une ligne par cellule) et laisse `DayOverbookedError` refuser le total s'il dépasse la
  journée. Une entrée dupliquée qui produirait deux lignes serait exactement l'aller-retour à perte
  qu'ADR-0066 existait pour empêcher, réapparu une couche plus bas. **Test du cas dupliqué**, écrit
  avant le changement.
- `GET /api/v1/cras/:period/grid` gagne, par mission, **les jours où le consultant y est affecté**
  (`assignableDays`) : c'est ce qui permet à la grille de griser une mission qui démarre le 15
  plutôt que de laisser la saisie échouer à la soumission. La composition sait déjà le calculer —
  `craGridComposition` filtre déjà les missions avec `isAssigned` jour par jour.
- **`validatedBy` entre dans `CraGridComposition`** et dans la réponse : la tâche 6.4 le demandait,
  la composition ne le portait pas, et le manque était consigné dans `open-questions.md` le
  25/08 (défaut D6 de la revue). Il se corrige ici, avec son test d'intégration.
- Écrans SSR conservés (relevé imprimable ADR-0056, pré-facturier), `/dashboard` : `recordedHalfDays`
  → `recordedQuarterDays`.

### 5bis.6 `apps/web` — juste ce qu'il faut pour compiler

`frenchDays` formate des quarts (`3 quarts` → `0,75 j`), et **le défaut D5 se tranche ici** : la
colonne de `/cra` s'intitule « Jours saisis » et affiche des jours — un en-tête « demi-journées » au
dessus de « 21 j » était une contradiction, et l'unité d'affichage se décide **une fois**, dans
`format.ts`. Les types de `features/cra` suivent le contrat. La grille existante n'est pas
retouchée au-delà de la compilation : elle est refaite en Phase 6.

### 5bis.7 Documentation

**La règle du balayage, parce que c'est un jugement et pas un `grep`** : un document **vivant** se
met à jour (`BUILD-RULES.md`, `CONTEXT.md`, `README.md`, `docs/direction-visuelle.md`, ce plan) ; un
document qui est un **enregistrement daté** garde son texte (les ADR, y compris superseded, la prose
des Phases 1 et 2 de `BUILD-PLAN.md`, les lignes déjà écrites de `open-questions.md`,
`PHASE-4-5-CLOSURE.md`). Réécrire un enregistrement, c'est effacer la trace que la décision a
changé — ce que la règle 2 de `docs/adr/README.md` interdit explicitement.

Ce qui bouge, nommément :

- **`docs/BUILD-RULES.md`** (§ « **integer count of half-days** ») : c'est la forme opérante de
  toute décision prise, elle ne peut pas rester en demi-journées une heure de plus que le code.
- **`CONTEXT.md`** : l'entrée `HalfDays` → `QuarterDays`, et **le corps de cinq autres entrées**
  qui énoncent l'unité dans leur prose — `LateDays`, `Tjm`, `InvoiceLine`, `RegieDaysOrigin`,
  `DeclinedDays`. **`HalfDaySlot` disparaît** du vocabulaire : la notion de créneau n'existe plus
  nulle part après ADR-0070.
- **`docs/direction-visuelle.md`** : `tabular-nums` cite les demi-journées ; §4.4 gagne la table de
  couleurs de 6.2.
- **`README.md`** : la ligne « Plus de deux missions dans une même journée » de « Ce que je ne
  construis pas » est **construite** — elle sort, remplacée par ce qui l'a rendue possible ; la
  ligne « Objet `Money` » et la description du mois d'Alice passent au quart. La ligne des types
  d'absence est déjà posée (26/08).

**Gate de sortie** : `pnpm run check` vert, `pnpm run test:int` vert, e2e existants verts ;
`grep -ri "halfday\|half_day" packages apps migrations` ne renvoie plus que des ADR superseded ;
un test de bout en bout qui enregistre **quatre quarts sur une journée** et retrouve quatre lignes.

---

## Phase 6 — Écran vedette : Mon CRA (la grille matricielle)

**Scope commit : `web`.** C'est l'écran qui a fait tomber ADR-0009 — le niveau d'exigence est
maximal ici.

> **Cette phase est rouverte.** Une première Phase 6 a été livrée le 25/08 (liste des mois + grille
> un-jour-par-ligne, deux créneaux par jour). ADR-0069 et ADR-0070 la rouvrent : la forme
> jour-par-ligne était le rendu direct de la demi-journée. Ce qui est **conservé** : la liste des
> mois, la couche de données (`api.ts`, `hooks.ts`), le routage, les quatre états de statut, les
> états vides/refusés. Ce qui est **refait** : la grille elle-même. Ce qui est **supprimé** :
> `features/cra/slots.ts` et ses tests, `LABELS.cra.slotsNote` (ADR-0070).

### 6.1 Liste des mois (`/cra`) — corrections

L'écran reste. Trois corrections issues de la revue du 25/08 :

- en-tête « Jours saisis » et valeurs en jours (D5, tranché en 5bis.6) ;
- le contrôle « Filtrer par mois » n'était demandé nulle part sur une table de deux lignes : il part ;
- l'état vide reste designé (« aucun mois saisi » + ouverture de la période courante).

### 6.2 La grille (`/cra/$period`) — une matrice activités × jours

Données : `GET /api/v1/cras/:period/grid`. Forme : **ADR-0070**.

- **Lignes = activités.** Une par mission sur laquelle le consultant est affecté dans le mois **et
  qui porte au moins un quart saisi**, plus une ligne `Absence`. Une mission sans saisie n'apparaît
  pas d'office : elle s'ajoute (6.3).
- **Colonnes = jours**, tous les jours du mois, dans une zone à défilement horizontal. En-tête sur
  deux niveaux : numéro de semaine, puis initiale du jour + quantième (`L 17`), comme un calendrier
  se lit.
- **Cellules = une quantité en quarts** : vide, `¼`, `½`, `¾`, `1`. `<select>` natif de cinq
  options, chrome OS retiré (`appearance-none`) : une cellule de grille se lit comme une cellule,
  pas comme 124 contrôles de formulaire. **C'est la réparation du défaut D1** — la saisie
  n'est plus un sélecteur de mission large comme un nom de client.
- **Couleurs** — quatre familles, et rien d'inventé :
  | Ce qui est coloré                                                                                   | Source                                                      | Rendu                                                                          |
  | --------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------ |
  | Week-end, jour férié                                                                                | `days[].nonWorkable` (le serveur flagge, il n'interdit pas) | colonne en fond neutre appuyé, en-tête grisé, saisie **toujours possible**     |
  | Absence                                                                                             | ligne `Absence`                                             | teinte propre, réservée, jamais celle d'une mission                            |
  | Mission                                                                                             | une teinte par ligne, stable dans le mois                   | pastille dans l'en-tête de ligne + fond de cellule très clair                  |
  | Jour non affectable sur cette ligne                                                                 | `missions[].assignableDays`                                 | cellule inerte, `aria-disabled`, infobulle « mission non affectée ce jour-là » |
  | Les valeurs exactes vont dans `docs/direction-visuelle.md` §4.4, qui traite déjà les flags de jour. |
- **Deux totaux, lus du même état local** : un total par jour (ligne de pied) et un total du mois
  par activité (dernière colonne). Le total du jour est celui qui porte le sens : il matérialise, à
  la frappe, les deux invariants que le domaine tient déjà — au-dessus d'une journée
  (`DayOverbookedError`), en-dessous à la soumission (`IncompleteCraError`). Un jour ouvré à
  `< 1` est signalé visuellement ; **la grille ne décide de rien**, elle affiche une somme et le
  refus, s'il est dû, vient du domaine (ADR-0070).

**Ce qui n'est pas construit** : la distinction congé payé / RTT / maladie. Le domaine ne connaît
que `worked` et `absence` — une taxonomie d'absences est une valeur, une migration, un seed et des
écrans, pour zéro conséquence sur la facturation (une absence ne produit pas de ligne). Décision du
26/08, et elle part en ligne explicite dans « Ce que je ne construis pas » plutôt que d'être
silencieusement rabotée en une seule couleur « absence ».

### 6.3 Les gestes qui n'existent que sur une matrice

Trois outils par ligne, à droite de l'en-tête de ligne, plus un ajout et une navigation :

- **Remplir les jours ouvrés vides** : pose une journée pleine sur chaque jour **ouvré dont le
  total est nul** et sur lequel la mission est affectable. Ne peut donc jamais surbooker, et ne
  touche jamais un jour déjà saisi.
- **Vider la ligne** : remet le mois de cette activité à zéro, **la ligne reste**.
- **Retirer la ligne** : la ligne disparaît de la grille. Proposé uniquement si la ligne est vide —
  retirer une ligne saisie, c'est vider puis retirer, en deux gestes conscients.
- **Ajouter une activité** : liste les missions affectées dans le mois et non encore affichées
  (`missions[]` les renvoie toutes, y compris celle qui démarre le 15). C'est le cas d'usage nommé
  le 26/08 : le manager met une mission à disposition en cours de mois, le consultant l'ajoute et
  saisit les jours déjà travaillés dessus.
- **Navigation de mois** : `‹ août 2026 ›` dans l'en-tête, deux liens vers `/cra/$period`
  adjacents. Une modification non enregistrée bloque la navigation par une confirmation.

Tous ces gestes sont des opérations d'état local sur une ligne ou une colonne, réconciliées au
`PUT` du mois entier (ADR-0050) et re-lues après écriture (ADR-0067) : aucun d'eux n'écrit tout seul.

### 6.4 Clavier et accessibilité — le contrat gagne une dimension

Flèches dans les **deux** axes (jour précédent/suivant, activité précédente/suivante), `Home`/`End`
sur la ligne, focus toujours visible, cellule focalisée **ramenée dans la zone visible** — la grille
défile horizontalement, il ne suffit plus de donner le focus. Table sémantique : `<caption>` qui
nomme le mois, `scope="col"` sur les 31 dates, `scope="row"` sur l'activité, un label par cellule
qui dit l'activité **et** le jour. Zéro violation critique/sérieuse à l'audit axe : c'est un gate
de phase, pas un item de finition.

### 6.5 Sauvegarder / Soumettre

`PUT /api/v1/cras/:period/entries` — remplace le mois entier, une entrée par cellule non vide
(≤ 124), `submit: boolean`. Écriture **refetch-driven** (ADR-0067), toast dont le verbe reprend le
bouton, `400`/`422` avec `errors` affichés sur la cellule concernée. Un `IncompleteCraError` au
`submit` désigne les jours en cause **dans la ligne de totaux**, là où l'utilisateur les lit.

### 6.6 Les quatre états de statut

- `draft` : éditable, boutons Enregistrer + Soumettre.
- `refused` : bannière avec le motif de refus renvoyé par l'API, grille rééditable.
- `submitted` : lecture seule, bannière « soumis, en attente de décision ».
- `validated` : lecture seule, bannière nommant **`validatedBy`** (livré en 5bis.5 — défaut D6) ;
  lien vers le relevé imprimable SSR `/releve/:id` (nouvel onglet).

**Défaut D3** : la bannière `validated` affichait « (ADR-0005) » et le mot « relevé de temps ». Un
identifiant d'ADR ne s'affiche jamais à un utilisateur, et `Cra` reste `Cra` (`CONTEXT.md`).
Correction dans `lib/labels.ts`.

### 6.7 États limites

- **Mois vide** : grille vierge invitante — les colonnes du mois, la ligne `Absence`, et l'invite
  « ajoutez une activité », pas une page cassée.
- **403 sur un deep-link** : `DeniedState` **centré, aéré, avec une phrase qui explique** — défaut
  D7 : l'écran de refus est la démonstration du modèle d'autorisation (tâche 7.6), pas une carte
  serrée en haut à gauche d'une page vide.
- **Défaut D2** : le titre et le fil d'Ariane nomment le mois (« CRA — août 2026 »). Sur l'écran
  livré le 25/08, rien n'indiquait quel mois était ouvert.
- **Défaut D4** : le fond de la barre latérale s'arrête ~68 px avant le bas du viewport sur les
  quatre captures — défaut du shell (Phase 4), corrigé ici puisqu'il se voit ici.
- **Défaut D8** : la capture `6.5-cra-denied-out-of-scope.png` rend en réalité
  `insufficient-role` ; le vrai `out-of-scope` est produit par le parcours J5 (Phase 7) — la capture
  est renommée à ce moment-là.

### 6.8 Gate de sortie — parcours e2e J1 (réécrit)

Playwright, DB reset en global-setup, workers en série. **Deux périodes, nommées explicitement** —
le mois de juin d'Alice est `validated` donc immuable (ADR-0005), et un parcours qui prétend
l'éditer échoue à la première frappe :

1. `/cra/2026-06` en **lecture** : vérifier le seed **en matrice** (deux missions le 11/06 sur deux
   lignes, la journée en quatre quarts, absence le 18/06, samedi 13/06 flaggé), bannière
   `validated` nommant `validatedBy`, aucune cellule éditable.
2. **Navigation de mois** jusqu'à `/cra/2026-08` (vide, éditable) — le geste de 6.3 est dans le
   gate, pas seulement dans la spec.
3. Ajouter une activité → saisir `¼` dans une cellule → le total du jour le reflète → « Remplir les
   jours ouvrés vides » sur la ligne → Enregistrer → rouvrir, la saisie persiste → Soumettre →
   lecture seule `submitted`.

Audit axe sur la grille : zéro violation critique/sérieuse. Captures des sept états. `pnpm run
check` vert.

---

## Phase 7 — Pré-facturier et Marge

**Scope commit : `web`.**

### 7.1 Pré-facturier (`/pre-facturier?period=`)

Données : Phase 5.1. Sélecteur de période ; **3 `StatCard`** (facturable €, jours en retard,
nombre de Cra) ; table des factures facturables (client, `StatusBadge`, numéro ou « — », HT, TTC,
lien détail) ; table des Cra (consultant, statut + badge « en retard », jours saisis, **motifs
bloquants en liste**, actions).

### 7.2 Valider (manager)

`POST /api/v1/cras/:id/validation` → **dialog de résultat** : factures brouillon créées (une par
client) **et** jours écartés avec leurs motifs en français (`notRegie` / `unknownMission` /
`noAgreedRate` / `unknownClient`). `replayed: true` → toast informatif « déjà validé, résultat
d'origine affiché », pas une erreur.

### 7.3 Refuser (manager)

Dialog avec **motif obligatoire** (l'API exige `reason`, 1-500) ; à la soumission, la ligne passe
en `refused` et le consultant verra la bannière (6.4).

### 7.4 Le rôle billing voit, ne décide pas

Les boutons Valider/Refuser ne sont **pas rendus** pour billing (l'offre suit le rôle). La table
reste entièrement lisible.

### 7.5 Marge (`/marge/$consultantId?period=`) — manager uniquement

`GET /api/v1/consultants/:id/economics?period=`. Navigation **explicite** depuis une ligne du
pré-facturier (jamais un survol — chaque lecture est loggée côté serveur, ADR-0052). Contenu :
`Cjm` en en-tête, table par mission (jours, `Tjm`, CA, coût, marge — via `frenchEuros`),
totaux. **Pas de taux de marge en %** (une division sur de l'argent).

### 7.6 Livrables d'états

- Billing suivant l'URL de marge → **403 `insufficient-role` designé nommant `deniedBy`** — c'est
  la démonstration d'autorisation du dépôt, elle doit être belle.
- Période sans données (2026-07) → pré-facturier vide designé.
- `manager-lyon` deep-linkant un Cra parisien → 403 `out-of-scope` designé.

**Gate de sortie — parcours J2, J3, J5, J6** (série, après J1) :

- **J2** : `manager-paris` (Bruno) → pré-facturier 2026-06 → **valide le mois soumis seedé de
  Claire Dubois** → le dialog montre la facture brouillon (client Réunion, TVA 8,5 %) et les
  éventuels jours écartés.
- **J3** : Bruno → **refuse le mois qu'Alice a soumis en J1**, motif saisi → côté Alice, bannière
  `refused` avec le motif.
- **J5** : `manager-lyon` (Emma) → deep-link d'un Cra parisien → 403 `out-of-scope` designé.
- **J6** : `billing-paris` (Henri) → URL de marge → 403 `insufficient-role` nommant `deniedBy`.
  Axe sur le pré-facturier ; état vide 2026-07 capturé ; `pnpm run check` vert.

---

## Phase 8 — Factures, émission, tableau de bord

**Scope commit : `web`.**

### 8.1 Liste (`/factures`)

`GET /api/v1/invoices`. Table : client, `StatusBadge` (draft/issued/cancelledByCreditNote),
période, numéro (`SEC-2026-000042` ou « — »), TTC (`frenchEuros` ou « — » — **`totalTtcCents` est
`null` tant que la facture n'est pas émise**, c'est voulu). Filtres par statut (onglets de vue
comme sur les maquettes).

### 8.2 Détail (`/factures/$id`)

`GET /api/v1/invoices/:id`. Blocs vendeur / client facturé, faits (numéro, dates, période,
conditions), table des lignes (désignation, origine — mission/Cra —, quantité, PU, montant),
**récapitulatif TVA par taux** (basis points via `frenchPercent`), totaux **uniquement si
`issued`**. Lien « Version imprimable » → **SSR `/facture/:id`** (nouvel onglet).

### 8.3 Émission (billing uniquement)

Dialog de confirmation montrant le récapitulatif + une **`Idempotency-Key` générée**
(`crypto.randomUUID()`, 8-200 caractères respectés) → `POST /api/v1/invoices/:id/issuance` avec
l'en-tête. Succès : numéro `SEC-2026-…` affiché, liste invalidée. `replayed: true` → toast « déjà
émise, numéro d'origine ». Le manager ne voit pas le bouton (offre = rôle) ; une facture déjà
émise avec une **nouvelle** clé renverrait 409 `invoice-transition-not-allowed` — rendu comme état,
pas comme crash.

### 8.4 Tableau de bord (`/tableau-de-bord`)

`GET /api/v1/dashboard` (Phase 5.3). Cartes KPI **par rôle** + liens d'action (« 1 Cra en attente
de votre décision » → pré-facturier). Premier écran vu après le sélecteur : **polish maximal**,
c'est l'ouverture de la démo. Pas de graphique tant qu'il n'y a qu'une période dans les données —
une courbe sur un point serait un mensonge visuel.

### 8.5 Livrable d'état

Sur un seed frais (avant toute validation), la liste des factures est vide → état vide designé,
démontré sur DB reset.

**Gate de sortie — parcours J4** (série, après J2) : `billing-paris` (Henri) → factures → détail
de la brouillon créée en J2 → émettre avec clé → **numéro asserté au format exact
`SEC-2026-\d{6}`** (le seed est déterministe, l'assertion exacte est légitime) → rejouer l'action
→ `replayed` prouvé. Screenshots du dashboard **pour les trois rôles** ; axe sur liste + détail +
dashboard ; `pnpm run check` vert.

---

## Phase 9 — Intégration de service : la SPA servie par l'API

**Scopes commit : `api`, `web`, `ci`.** La phase risquée — tout ce qu'elle touche est nommé ici,
rien n'est découvert en cours de route.

### 9.1 Servir `apps/web/dist`

Ajouter `@fastify/static` (justifié, épinglé ≥ 7 jours). Servir les assets buildés + **fallback
SPA** : tout `GET` qui n'est pas `/api/*`, `/facture/:id`, `/releve/:id`, `/healthz`, `/readyz`
ou un asset renvoie `index.html`. Les deux routes SSR imprimables gardent la priorité.

🔴 **La liste ci-dessus n'est pas une liste de préfixes.** Écrite en `startsWith` — la façon
évidente de lire la phrase — `/factures` (la liste de la SPA, au pluriel) tombe dans l'exclusion
`/facture` et la production sert la route imprimable ou un 404 sur l'écran principal de
facturation. C'est exactement le bug corrigé dans le proxy de dev en tâche 8.1 (Annexe C.9),
rejoué une couche plus bas : le correctif de `vite.config.ts` ne s'applique pas ici, Vite étant
hors-jeu en production. **Implémenter l'exclusion par enregistrement de route, ou par une
correspondance de forme `/:id` exacte — jamais par un test de préfixe nu.**

`apps/web/e2e/routing.spec.ts` porte déjà les assertions (écrites en Phase 8, vérifiées rouges
en retirant le `/` final de `PROXIED_PATHS`) : elles tournent aujourd'hui contre Vite et sont les
mêmes qui attrapent la régression contre le build servi par l'API en 9.6. **Aucune autre du dépôt
ne couvre les deux topologies** — donc tant que 9.6 n'est pas câblé, 9.1 n'est pas vérifié.

### 9.2 La CSP — chaîne exacte, figée dans ADR-0064

Remplacer la constante de `apps/api/src/web/reply.ts` par **exactement** :

```
default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self';
font-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'self';
frame-ancestors 'none'
```

(une seule chaîne pour toutes les réponses — garder deux CSP selon la route a été considéré et
rejeté : deux politiques à tester pour un bénéfice nul). Reporter la chaîne dans ADR-0064. Les
autres en-têtes (`nosniff`, `referrer-policy: same-origin`, `x-frame-options`) ne changent pas.

> ⚠️ **La chaîne ci-dessus a été amendée le 27/08/2026, sur une clause et une seule** :
> `style-src` devient `'self' 'unsafe-inline'` — **ADR-0072**, qui supersède ADR-0064. Motif : Radix
> UI et `sonner` écrivent des attributs `style` au rendu, et un attribut `style` ne peut porter ni
> nonce ni hash. La preuve n'existait pas avant 9.6 : le serveur de dev Vite n'envoie aucun
> en-tête CSP, donc huit phases d'e2e sont passées au vert contre une page sans politique.
> `script-src` reste `'self'` et un test l'assure négativement. La chaîne qui fait foi est celle
> d'ADR-0072, pas celle de ce paragraphe.

### 9.3 Inventaire de retrait — écrans serveur remplacés

**Supprimer** : `pages/persona-selector.ts`, `pages/cra-list.ts`, `pages/cra-grid.ts`,
`pages/pre-facturier.ts`, `pages/margin.ts`, leurs enregistrements dans `web/routes.ts`, et les
helpers devenus morts parmi `fill.ts`, `form-body.ts`, les entrées de `paths.ts` (vérifier avec le
typecheck et la couverture : un helper encore utilisé par les imprimables reste).
**Conserver** : `pages/cra-print.ts`, `pages/invoice.ts`, `shell.ts`, `format.ts`, `labels.ts`,
`render/html.ts`, `problem-page.ts`, `reply.ts`, `representation.ts`, `assets.ts` (adapté — la
feuille `style.css` reste servie pour les imprimables). Le côté API reste l'autorité des
documents imprimables.

### 9.4 Inventaire des tests à mettre à jour — jamais skippés

- `apps/api/src/web/routes.test.ts` : la chaîne CSP exacte (9.2) et les routes retirées (9.3) ;
  le test « assets has no path parameter » évolue avec le handler statique.
- `apps/api/src/web/shell.test.ts`, `accessibility.test.ts` : recentrés sur les imprimables.
- `apps/api/src/web/cra-grid.int.test.ts`, `pre-facturier.int.test.ts` : les assertions d'écrans
  supprimés tombent ; celles qui testaient la **logique** (déjà couverte par les endpoints Phase 5
  et leurs tests) sont vérifiées comme redondantes avant suppression.
- `apps/api/src/web/states.int.test.ts` : la partie sélecteur/cookie reste pertinente via l'API de
  session ; adapter, ne pas perdre les cas (origin check, refus en page).
  Chaque fichier est **mis à jour ou supprimé avec justification dans le commit** — jamais `skip`.

### 9.5 Env et exécution

`.env.example` : commentaire sur les deux topologies (dev 5173 / prod 3000) et `API_PUBLIC_ORIGIN`
correspondant. Ordre de prod : `pnpm --filter @erp/web build` puis `pnpm run api`.

### 9.6 CI

Activer le job Playwright pour de vrai : Postgres service → migrate + seed → build web → API sert
`dist` sur 3000 → suite e2e complète **contre le build servi** (pas Vite).

**Gate de sortie** : suite e2e complète verte contre le build servi par l'API sur 3000 (sans
Vite) — **`routing.spec.ts` en fait partie et est la porte de 9.1** : `GET /factures` et
`GET /factures/:id` en navigation complète rendent l'`index.html` de la SPA, pas la route
imprimable ; `/facture/:id` et `/releve/:id` inchangés en comportement (leurs tests passent) ;
`pnpm run check` et `pnpm run test:int` verts ; la CSP est assertée par les tests mis à jour ;
plus aucune route d'écran interactif SSR ne répond.

---

## Phase 10 — Polish, accessibilité, performance, recette démo

**Scopes commit : `web`, `docs`, `test`.**

### 10.1 Passe de cohérence

Skeletons identiques partout ; toasts (position, durée, style) uniformes ; hover/focus/active
cohérents ; `prefers-reduced-motion` vérifié en émulation Playwright ; « qu'est-ce qui peut être
retiré sans perte ? » — retirer toute décoration qui ne sert ni lisibilité ni hiérarchie.

### 10.2 Accessibilité

Axe sur **tous** les écrans principaux (sélecteur, dashboard ×3 rôles, liste+grille CRA,
pré-facturier, marge, factures liste+détail, états 403/404) : zéro violation critique/sérieuse.
Navigation clavier complète du shell (script Playwright), focus visible en permanence — le niveau
tenu par les écrans serveur (ADR-0061) est le plancher, pas le plafond.

### 10.3 Performance

Code-splitting par route (lazy TanStack Router) ; vérification du bundle (aucun module
disproportionné) ; Lighthouse sur le dashboard et le pré-facturier : Performance et Accessibilité

> 90.

### 10.4 Checklist de démo — `docs/demo-checklist.md`

Le script exact de la démo CEO, appuyé sur le seed, **qui est aussi le spec Playwright final** :
reset DB → sélecteur (notice visible) → Alice : grille (jour partagé du 11/06, samedi flaggé),
édition, soumission → Bruno : dashboard (« en attente »), pré-facturier, **validation de Claire**
(factures + jours écartés), **refus d'Alice** avec motif, écran de marge → Emma : le 403
out-of-scope → Henri : factures, **émission** avec clé (numéro `SEC-2026-…`), version imprimable
(onglet SSR), le 403 marge → retour au sélecteur.

### 10.5 Régression complète

Depuis un `pnpm run setup` froid : `pnpm run check`, `pnpm run test:int`, suite Playwright
complète — tout vert, en un seul enchaînement documenté.

### 10.6 Baseline

Figer les captures de `tests/visual/baseline/` comme référence post-livraison.

**Gate de sortie (= sortie du projet)** : tout vert depuis un environnement froid ; la checklist
de démo est rejouable de bout en bout par le spec final sans intervention manuelle ; revue humaine
des captures `tests/visual/review/` (case à cocher, hors périmètre agent).

---

## Annexe A — Contrat d'API (l'agent ne devine jamais)

### Session (public)

| Méthode + chemin                              | Réponse                                                                                  |
| --------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `GET /api/v1/personas`                        | `{ notice, personas: [{ key, role, displayName, office }] }`                             |
| `GET /api/v1/session`                         | `{ persona: { key, role, displayName, office } \| null }`                                |
| `POST /api/v1/session/persona` body `{ key }` | `200 { persona }` + `Set-Cookie erp_persona` ; `404 /problems/not-found` si clé inconnue |
| `DELETE /api/v1/session/persona`              | `200 { persona: null }` + cookie purgé                                                   |

### Timesheet

| Méthode + chemin                   | Rôles   | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ---------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/v1/cras?limit&offset`    | c, m, b | `limit` 1..50, défaut 20 — **`>50` = 400, pas un clamp**. Hors périmètre = **filtré**, pas refusé. → `{ cras: [{ id, consultantId, officeId, period, status, recordedQuarterDays }] }`                                                                                                                                                                                                                                                                                                                                                |
| `GET /api/v1/cras/:id`             | c, m, b | Cra complet : `lines: [{ day, dayType: 'worked'\|'absence', missionId\|null, quarterDays: 1..4 }]`, `flags: [{ day, reason: 'weekend'\|'publicHoliday' }]`, `status`, `validatedBy\|null`. **404 (n'existe pas) ≠ 403 `/problems/out-of-scope` (existe, pas à vous)** — distinction voulue.                                                                                                                                                                                                                                           |
| `PUT /api/v1/cras/:period/entries` | c       | Body `{ submit: boolean, entries: [{ day, dayType, missionId\|null, quarterDays }] }`, **max 124 entrées, une par cellule non vide, remplace le mois entier**. → `{ craId, status, flags }`                                                                                                                                                                                                                                                                                                                                           |
| `POST /api/v1/cras/:id/validation` | m       | Sans body. → `{ craId, replayed, invoices: [InvoiceListItem], declined: [{ craId, missionId, quarterDays, reason }] }`. **Rejeu = 200 `replayed: true`**, pas un 409.                                                                                                                                                                                                                                                                                                                                                                 |
| `POST /api/v1/cras/:id/refusal`    | m       | Body `{ reason }`, 1-500 caractères. → `{ craId, status: 'refused' }`. Manquait de cette annexe jusqu'à la Phase 7 — le formulaire SSR (`POST /pre-facturier/refus/:id`) existait déjà et appelle le même `refuseCra`, mais aucune route JSON n'exposait le geste ; ajoutée test-first (commit `api`) avant l'écran qui la consomme. Même scoping que `/validation` : Cra hors office → 403 `out-of-scope` ; inexistant → 404 ; motif vide/blanc → 422 `refusal-reason-required` ; mauvais statut → 409 `cra-transition-not-allowed`. |
| `GET /api/v1/cras/:period/grid`    | c       | **Phase 5.2** — squelette du mois + missions affectées + état du Cra.                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |

### Billing

| Méthode + chemin                                | Rôles            | Notes                                                                                                                                                                                                                                                                                                              |
| ----------------------------------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `GET /api/v1/invoices?limit&offset`             | m, b             | → `{ invoices: [{ id, status, supplyPeriod, billedToName, invoiceNumber\|null, issueDate\|null, totalTtcCents\|null }] }`                                                                                                                                                                                          |
| `GET /api/v1/invoices/:id`                      | m, b             | Document complet (`billedTo`, `seller`, `terms`, `mentions`, `lines` avec `origin` et `vat`, `vatBreakdown`). **`totals` est `null` tant que `status ≠ 'issued'`.**                                                                                                                                                |
| `POST /api/v1/invoices/:id/issuance`            | b                | **En-tête `Idempotency-Key` 8-200 obligatoire** (absent → 400 `idempotency-key-required` ; réutilisée ailleurs → 409 `idempotency-key-reused`). → `{ invoiceId, replayed, invoiceNumber, issueDate, totalTtcCents }`. Numéro : `SEC-2026-\d{6}`. Déjà émise + nouvelle clé → 409 `invoice-transition-not-allowed`. |
| `GET /api/v1/consultants/:id/economics?period=` | **m uniquement** | billing → 403. → `{ consultantId, displayName, period, cjmCents, missions: [{ missionId, missionName, quarterDays, tjmCents, revenueCents, costCents, marginCents }], revenueCents, costCents, marginCents }`. Chaque lecture est loggée (divulgation, ADR-0052).                                                  |
| `GET /api/v1/pre-facturier?period=`             | m, b             | **Phase 5.1.**                                                                                                                                                                                                                                                                                                     |
| `GET /api/v1/dashboard?period=`                 | c, m, b          | **Phase 5.3.**                                                                                                                                                                                                                                                                                                     |

### Documents SSR conservés

`GET /facture/:id` (m, b) et `GET /releve/:id` (c, m, b) — pages HTML imprimables, ouvertes dans
un nouvel onglet par la SPA.

### Problèmes (RFC 9457) — brancher sur `type`

- Transport/session : `/problems/malformed-request` (400), `/problems/no-persona` (401),
  `/problems/unknown-persona`, `/problems/forbidden-origin`, `/problems/insufficient-role`,
  `/problems/out-of-scope` (403), `/problems/not-found` (404),
  `/problems/idempotency-key-required` (400), `/problems/idempotency-key-reused` (409).
- Domaine — règle de lecture : **422** = la valeur est refusée par une règle sur les valeurs ;
  **409** = la valeur est bonne, l'**état** la refuse ; **403** = l'acteur ne peut pas, quel qu'il
  soit. Exemples à rendre : `validated-cra-is-immutable`, `cra-transition-not-allowed`,
  `day-overbooked`, `not-assigned`, `missing-habilitation`, `cra-incomplete` (409) ;
  `refusal-reason-required`, `day-outside-period` (422) ; `self-validation-forbidden`,
  `not-the-manager`, `validator-cannot-issue` (403).
- Un 403 ne porte **jamais** de détail sur l'enregistrement (voulu) ; il porte `deniedBy`.

### Le seed (période `2026-06`, déterministe — ADR-0022)

| Persona (clé)      | Qui                             | Sert à démontrer                                                                                                                                             |
| ------------------ | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `consultant-paris` | Alice Martin (Paris/Audit)      | La grille : **jour partagé le 11/06** (2 missions), **une journée en quatre quarts** (ADR-0069), **absence le 18/06**, **samedi 13/06 travaillé et flaggé**. |
| `manager-paris`    | Bruno Leroy (Paris/Audit)       | Validation/refus ; **Claire Dubois (Paris/SOC) a un mois `submitted`** qui attend sa décision (mission Réunion, TVA 8,5 %).                                  |
| `manager-lyon`     | Emma Robert (Lyon/GRC)          | Le 403 `out-of-scope` sur les données parisiennes.                                                                                                           |
| `billing-paris`    | Henri Laurent (Paris, director) | L'émission avec idempotence ; le 403 sur la marge.                                                                                                           |

5 clients (un par cas de TVA : 20 %, 8,5 %, hors champ, autoliquidation UE, interne), 7 missions
(dont une exigeant l'habilitation PASSI et un Forfait — **seule la Regie se facture**), une
consultante en Intercontrat. Reset : `pnpm run db:reset` ; setup froid : `pnpm run setup`.

## Annexe B — Les six parcours e2e

| #   | Persona            | Parcours                                                                                      | Phase |
| --- | ------------------ | --------------------------------------------------------------------------------------------- | ----- |
| J1  | `consultant-paris` | Grille 2026-06 : vérifier le seed, saisir un quart, remplir une ligne, enregistrer, soumettre | 6     |
| J2  | `manager-paris`    | Valider le mois soumis de Claire → factures brouillon + jours écartés                         | 7     |
| J3  | `manager-paris`    | Refuser le mois soumis par Alice (J1), motif → bannière côté Alice                            | 7     |
| J4  | `billing-paris`    | Émettre la facture de J2 avec clé → `SEC-2026-\d{6}`, rejeu prouvé                            | 8     |
| J5  | `manager-lyon`     | Deep-link d'un Cra parisien → 403 `out-of-scope` designé                                      | 7     |
| J6  | `billing-paris`    | URL de marge → 403 `insufficient-role` nommant `deniedBy`                                     | 7     |

Exécution **en série** (base partagée), `db:reset` en global-setup, ordre J1 → {J2, J3} → J4 ;
J5/J6 en lecture seule n'importe où après J1. Le seed déterministe autorise les **assertions
exactes** (numéros, montants) — les utiliser.

## Annexe C — Points épinglés (anti-dérive)

1. **Topologie dev** : Vite 5173 = origine, proxy vers 3000, `API_PUBLIC_ORIGIN=http://127.0.0.1:5173`
   en dev — verbatim en Phase 0.3, consignée dans ADR-0063.
2. **CSP finale** : la chaîne exacte de la Phase 9.2, une seule pour tout, recopiée dans ADR-0064,
   assertée par `routes.test.ts`.
3. **Phase 9** : inventaires de suppression et de tests **fermés** (9.3/9.4) — rien d'autre n'est
   touché, rien n'est skippé.
4. **`period`** pour les paramètres d'API (aligné sur economics) ; `periode`/le français restent
   dans les URLs d'écrans.
5. **`no-default-export` reste actif** sur `apps/web/src/**` ; relâché uniquement pour les
   fichiers de config.
6. **Dépendances** : épinglées ≥ 7 jours (`pnpm view <pkg> time`), justifiées. Jamais MSW, jamais
   faker.
7. **Commits** : scopes de l'enum (`web`, `api`, `adr`, `docs`, `lint`, `ci`, `deps`, `test`),
   jamais de `Co-Authored-By`.
8. **`labels.ts` et `format.ts` sont des copies** dans `apps/web` — pas de nouveau `packages/`,
   pas d'import cross-app ; les tests de `format.ts` s'alignent sur ceux de l'API.
9. **`/factures/$id` (SPA, pluriel) ≠ `/facture/:id` (SSR, singulier)** — jamais de collision.
   ⚠️ **« Jamais de collision » ne veut pas dire « jamais la même URL » : la collision est un
   préfixe.** `'/factures'.startsWith('/facture')` vaut `true`, donc tout aiguillage qui décide
   « est-ce la route imprimable ? » par un test de préfixe nu capture la liste de factures de la
   SPA. Arrivé une fois pour de vrai, dans le proxy de dev (`apps/web/vite.config.ts`, tâche
   8.1) : `/factures` répondait la page `/problems/not-found` de l'API. **Règle** : toute
   exclusion d'un chemin SSR se fait par enregistrement de route, ou par une correspondance de
   forme `/:id` exacte, ou à défaut sur un préfixe **terminé par `/`** — jamais sur `/facture` ou
   `/releve` nus. Gardée par `apps/web/e2e/routing.spec.ts`, qui vérifie les deux sens (la SPA
   répond sur `/factures` et `/factures/:id`, les imprimables répondent toujours sur
   `/facture/:id` et `/releve/:id`) et qui vaut dans les deux topologies — Vite aujourd'hui,
   Fastify dès 9.6.
10. **Playwright** : série, seedé, `db:reset` en global-setup, zéro `waitForTimeout`, assertions
    exactes permises par le seed déterministe.
11. **ADR 0062+** ; 0027-0030 et 0032 réservés, intouchables.
12. **Jamais de `Cjm`/`Tjm`/marge hors de l'écran de marge** — ni dans une liste, ni dans le
    dashboard, ni dans un tooltip.
