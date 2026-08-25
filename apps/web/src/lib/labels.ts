/**
 * Every French string the SPA renders, in one file.
 *
 * A **deliberate copy** of `apps/api/src/web/labels.ts` (frontend-plan.md Annexe C.8: "labels.ts
 * et format.ts sont des copies dans apps/web — pas de nouveau packages/, pas d'import cross-app").
 * Copied whole rather than trimmed to Phase 3's own screens: the copy deck is already written —
 * 357 lines the API's ADR-0026 already argued for — and every later phase (session selector, Cra
 * grid, pré-facturier, factures, marge) draws from the same sections, so trimming now would only
 * mean re-copying them one phase at a time. It is a copy, not a share: this file may diverge from
 * the API's as the SPA's own screens need, and nothing re-synchronises the two automatically.
 *
 * The point is not translation — there is one language and there will be one (ADR-0026's own
 * argument, unchanged here). It is **review**: a screen's wording is the part of it a
 * non-developer can judge, and wording scattered across components cannot be read as a whole.
 * Here it can, and a term that contradicts `CONTEXT.md` is visible next to the one that does not.
 *
 * The keys are English because they are code; the values are French because they are the screen.
 *
 * `problem.sentences` is the SPA's own equivalent of ADR-0060 ("the screens name a refusal in
 * French, keyed by its `type`, never `problem.title`") — ported unchanged, plus two entries this
 * file adds that the API's copy does not carry: `/problems/client-unparsable-response` and
 * `/problems/client-network-failure` (`lib/api-client.ts`'s `CLIENT_PROBLEM_TYPES`) are
 * synthesized **client-side**, for a failure that never reached a server to have an RFC 9457 body
 * at all — a Vite proxy error page, an HTML error document, offline, DNS. `labels.test.ts` asserts
 * this table is exhaustive against `@erp/contracts`' `API_PROBLEM_TYPES`, against every domain
 * `problemType` declared under `packages/` (scanned the same way `apps/api/src/http/problem.test.ts`
 * does, not copied as a second list that could drift from the one it checks), and against the two
 * client sentinels.
 *
 * The apostrophes are typographic (’, U+2019) and the em dash is real, matching the source file —
 * this SPA renders through React/JSX, which does not escape into HTML entities the way the SSR
 * screens' hand-written renderer does, but the typographic choice is the API copy's and is kept.
 */
export const LABELS = {
  appName: 'CRA → Facture',
  appTagline: 'Maquette d’un module ERP interne',

  nav: {
    skipToContent: 'Aller au contenu',
    main: 'Navigation principale',
  },

  persona: {
    heading: 'Choisir un persona',
    lead: 'Cette maquette n’a pas d’authentification : on choisit une identité, et tout le monde peut choisir n’importe laquelle.',
    warning:
      'Ce n’est pas une connexion. Aucun mot de passe n’est demandé, aucune identité n’est vérifiée, et le sélecteur remplace un fournisseur d’identité pour rendre les règles d’autorisation démontrables en trois clics.',
    choose: 'Prendre ce rôle',
    current: 'Persona en cours',
    change: 'Changer de persona',
    none: 'Aucun persona sélectionné',
    office: 'Implantation',
    role: 'Rôle',
    /** `GET /api/v1/personas` answering an empty list — a live instance edge case, not the "no
     * persona chosen yet" state `none` above already names. */
    emptyTitle: 'Aucun persona disponible',
    emptyBody: 'Cette instance ne propose aucun persona pour le moment.',
    selectError: 'Le persona n’a pas pu être choisi. Réessayez.',
  },

  roles: {
    consultant: 'Consultant',
    manager: 'Manager',
    billing: 'Facturation',
  },

  /**
   * Phase 8 (task 8.4) builds the real screen behind `GET /api/v1/dashboard`. This section exists
   * from Phase 4 on because the nav entry and the placeholder page both need the word — the shell
   * does not wait for the endpoint to exist to say what the destination is called.
   */
  dashboard: {
    heading: 'Tableau de bord',
  },

  cra: {
    heading: 'Mon CRA',
    listHeading: 'Mes CRA',
    nav: 'Mes CRA',
    /**
     * The **manager's** nav-entry wording for the same `/cra` route (frontend-plan.md task 4.3:
     * "manager → Pré-facturier, CRA, Factures, Marge") — deliberately not `nav` above, which is
     * possessive ("Mes CRA", "my CRAs") and wrong for a manager's office-wide list. Two role-scoped
     * `NavEntry`s point at the same path with this distinct label rather than one entry whose text
     * varies by role (`config/navigation.ts`'s own comment explains why).
     */
    navManager: 'CRA',
    day: 'Jour',
    morning: 'Matin',
    afternoon: 'Après-midi',
    mission: 'Mission',
    quantity: 'Quantité',
    totals: 'Totaux du mois',
    slotsNote:
      'Les deux colonnes sont deux demi-journées. Le CRA enregistre « une demi-journée sur A, une demi-journée sur B » : l’ordre matin/après-midi n’est pas conservé, parce qu’il ne change ni la facture ni les totaux.',
    totalsAsOf:
      'Totaux calculés côté serveur, à jour du dernier enregistrement — pas à chaque frappe (ADR-0050).',
    nothing: '—',
    absence: 'Absence',
    flagged: 'Signalé',
    save: 'Enregistrer',
    submit: 'Soumettre au manager',
    period: 'Mois',
    status: 'Statut',
    show: 'Ouvrir',
    notStartedYet: 'Ce mois n’a pas encore été commencé. Remplissez-le, puis enregistrez.',
    nothingRecorded: 'Rien n’est encore saisi sur ce mois.',
    refused: 'Ce CRA a été refusé par le manager. Corrigez-le, puis soumettez-le à nouveau.',
    emptyList: 'Aucun CRA sur cette période.',
    emptyListHint:
      'Ce n’est pas un refus : la liste est bien la vôtre, elle ne contient simplement rien pour ce mois.',
    filter: 'Filtrer par mois',
    apply: 'Filtrer',
    allPeriods: 'Tous les mois',
    nonWorkable: {
      weekend: 'Week-end',
      publicHoliday: 'Férié',
    },
    readOnly: {
      submitted: 'CRA soumis : il est entre les mains du manager et n’est plus modifiable.',
      validated: 'CRA validé : un relevé de temps validé est immuable (ADR-0005).',
      draft: '',
      refused: '',
    },
    statuses: {
      draft: 'Brouillon',
      submitted: 'Soumis',
      validated: 'Validé',
      refused: 'Refusé',
    },
  },

  craPrint: {
    heading: 'Relevé d’activité',
    open: 'Version imprimable',
    openFor: 'du CRA de {name}',
    notValidated:
      'Ce relevé n’est pas signable : le CRA n’a pas encore été validé par le manager, et son contenu peut encore changer.',
    consultant: 'Consultant',
    office: 'Implantation',
    period: 'Mois',
    status: 'Statut',
    validatedBy: 'Validé par',
    validatedOn: 'Validé le',
    day: 'Jour',
    mission: 'Mission / absence',
    quantity: 'Quantité',
    totals: 'Totaux du mois',
    total: 'Total',
    flagged: 'Jours signalés',
    flaggedNote:
      'Jours saisis alors que le calendrier ne les dit pas ouvrés. Ils ne sont pas refusés : le manager les a acceptés en validant.',
    signature: 'Bon pour accord',
    signatureNote:
      'Ce relevé couvre le mois entier du consultant, missions confondues (ADR-0056). Le nom du signataire n’est pas pré-imprimé : il dépend du destinataire, pas du relevé.',
    signatureName: 'Nom et qualité',
    signatureDate: 'Date',
    signatureMark: 'Signature',
    nothingRecorded: 'Aucun jour saisi sur ce mois.',
    back: 'Revenir au CRA',
  },

  preFacturier: {
    heading: 'Pré-facturier',
    nav: 'Pré-facturier',
    lead: 'Ce qui est facturable sur le mois, et pour tout le reste la raison qui bloque. Rien ne se décide ici : l’écran ne fait qu’assembler ce que les deux modules savent (ADR-0053).',
    noPeriod: 'Aucun CRA dans cette implantation, sur aucun mois.',
    noPeriodHint:
      'Ce n’est pas un refus : la liste est bien celle de votre implantation, elle est vide.',
    billable: 'À facturer',
    billableEmpty:
      'Aucune facture en brouillon sur ce mois : soit aucun CRA n’a été validé, soit les jours validés ne sont pas facturables. Le tableau ci-dessous dit lequel des deux.',
    client: 'Client',
    invoiceStatus: 'Statut',
    invoiceNumber: 'N° de facture',
    totalExcludingVat: 'Total HT',
    totalIncludingVat: 'Total TTC',
    notNumberedYet: '—',
    cras: 'Les CRA du mois',
    consultant: 'Consultant',
    craStatus: 'Statut du CRA',
    recorded: 'Jours saisis',
    blocking: 'Ce qui n’est pas facturable',
    nothingBlocking: 'Rien : tous les jours validés sont partis en facture.',
    crasEmpty: 'Aucun CRA sur ce mois dans cette implantation.',
    crasEmptyHint:
      'Ce n’est pas un refus : la liste est bien celle de votre implantation, elle ne contient rien pour ce mois.',
    validate: 'Valider',
    refuse: 'Refuser',
    refusalReason: 'Motif du refus',
    refusalPlaceholder: 'Ce que le consultant doit corriger',
    decide: 'Décision',
    reveal: 'Marge',
    /** Appended to the visible link text, `sr-only`, so nine identical links are nine distinct ones. */
    revealFor: 'de {name}',
    revealNote:
      'Ouvrir une marge affiche le CJM, le TJM et la marge du consultant, et chaque ouverture est journalisée.',
    summaryBillable: 'Facturable ce mois',
    summaryLate: 'Jours en retard',
    summaryCras: 'CRA du mois',
    lateNote:
      'Jours saisis sur un mois clos dont le CRA n’est pas encore validé (ADR-0054). Le mois en cours affiche zéro : rien n’y est en retard, puisque rien n’y est encore dû.',
    lateNoneYet: 'Mois en cours — rien n’est encore dû.',
    lateTag: 'En retard',
    awaitingManager: 'En attente de validation par le manager',
    awaitingConsultant: 'En attente du consultant',
    invoiceStatuses: {
      draft: 'Brouillon',
      issued: 'Émise',
      cancelledByCreditNote: 'Annulée par un avoir',
    },
    declineReasons: {
      notRegie: 'Hors régie — mission au forfait ou interne',
      unknownMission: 'Mission inconnue de la facturation',
      noAgreedRate: 'Aucun TJM en vigueur à cette date',
      unknownClient: 'Client inconnu',
    },
  },

  invoice: {
    heading: 'Facture',
    draftHeading: 'Facture en brouillon',
    nav: 'Factures',
    open: 'Ouvrir la facture',
    openFor: 'de {name}',
    draftNotice:
      'Ce document n’est pas une facture : il n’a ni numéro ni date d’émission, et il changera si le CRA qui l’a produit change. Il devient une facture à l’émission, et plus rien n’y bouge ensuite.',
    seller: 'Émetteur',
    billedTo: 'Facturé à',
    deliveryAddress: 'Adresse de livraison',
    number: 'Numéro de facture',
    issueDate: 'Date d’émission',
    dueDate: 'Date d’échéance',
    supplyPeriod: 'Période d’exécution',
    operationCategory: 'Nature de l’opération',
    operationCategories: {
      services: 'Prestation de services',
      goods: 'Livraison de biens',
      mixed: 'Prestations et livraisons',
    },
    designation: 'Désignation',
    quantity: 'Quantité',
    unitPrice: 'Prix unitaire (demi-journée)',
    vatRate: 'TVA',
    amount: 'Montant HT',
    vatRecap: 'Récapitulatif de TVA',
    vatBase: 'Base HT',
    vatAmount: 'TVA',
    totalExcludingVat: 'Total HT',
    totalVat: 'Total TVA',
    totalIncludingVat: 'Total TTC',
    mentions: 'Mentions obligatoires',
    latePayment:
      'En cas de retard de paiement, application d’intérêts de retard au taux annuel de {rate}, exigibles sans rappel.',
    recoveryIndemnity:
      'Indemnité forfaitaire pour frais de recouvrement en cas de retard : {amount} (art. D441-5 du code de commerce).',
    noDiscount: 'Escompte pour paiement anticipé : aucun.',
    discount: 'Escompte pour paiement anticipé : {rate}.',
    vatOnDebits: 'TVA acquittée sur les débits.',
    vatOnCollection: 'TVA acquittée sur les encaissements.',
    siren: 'SIREN',
    vatNumber: 'N° de TVA intracommunautaire',
    rcs: 'RCS',
    shareCapital: 'Capital social',
    origin: 'Origine des lignes',
    originLine: 'CRA {cra} — {period} — {mission}',
    originNote:
      'Chaque ligne porte le CRA dont elle vient : c’est ce lien, et non une déclaration, qui matérialise la piste d’audit fiable (art. 289-VII du CGI).',
    validatedBy: 'Validé par',
    notCharged: 'Non soumis à TVA',
    issue: 'Émettre la facture',
    issueNote:
      'L’émission alloue un numéro dans une série sans trou et fige le document : rien n’y bouge ensuite. Le formulaire porte sa clé d’idempotence, pour qu’un renvoi ne brûle pas un second numéro (ADR-0059).',
    cannotIssue:
      'Cette facture est déjà émise : elle porte un numéro et une date, et une facture émise ne se modifie pas.',
  },

  margin: {
    heading: 'Marge',
    lead: 'Ces trois valeurs ne figurent dans aucune liste. Elles ne s’obtiennent que par cette lecture, et chaque ouverture est journalisée : qui a lu, quels champs, sur qui.',
    back: 'Revenir au pré-facturier',
    mission: 'Mission',
    quantity: 'Quantité',
    tjm: 'TJM',
    cjm: 'CJM',
    revenue: 'Chiffre d’affaires',
    cost: 'Coût',
    margin: 'Marge',
    total: 'Total du mois',
    noMission:
      'Aucune mission en régie sur ce mois : une mission au forfait n’a pas de TJM daté, et elle est écartée plutôt que comptée à zéro.',
  },

  problem: {
    heading: {
      denied: 'Accès refusé',
      notFound: 'Introuvable',
      conflict: 'Action impossible en l’état',
      invalid: 'Valeur refusée',
      malformed: 'Requête invalide',
      internal: 'Erreur interne',
    },
    /**
     * What each refusal says, in French, keyed by its `type` (ADR-0060 in the API; this table is
     * the SPA's own copy of the same rule). The page never renders `ProblemDetails.title`: that
     * field is the API's, it is English by BUILD-RULES, and it is right where it lives. A type
     * missing from here falls back to the heading for its status — never to the English title,
     * which is the defect ADR-0060 removes.
     *
     * `labels.test.ts` asserts this table covers every `problemType` declared under `packages/`,
     * every `API_PROBLEM_TYPES` value, and the two client-originated sentinels of
     * `lib/api-client.ts` — so a refusal added later, on either side of the HTTP boundary, is
     * found the day it is written rather than rendered in English on a French page.
     */
    sentences: {
      // The API's own — facts about the request, not about the business.
      '/problems/malformed-request': 'La requête n’est pas exploitable en l’état.',
      '/problems/no-persona': 'Aucun persona n’est sélectionné : choisissez une identité d’abord.',
      '/problems/unknown-persona':
        'Le cookie de persona ne désigne aucune identité proposée par cette instance.',
      '/problems/forbidden-origin':
        'Une action modifiante doit venir de cette instance. L’origine de la requête ne correspond pas.',
      '/problems/insufficient-role': 'Votre rôle ne porte pas cette action.',
      '/problems/not-found': 'Cette page ou cet enregistrement n’existe pas.',
      '/problems/idempotency-key-required':
        'Cette action alloue un numéro dans une série sans trou : elle exige une clé d’idempotence.',
      '/problems/idempotency-key-reused':
        'Cette clé d’idempotence a déjà émis un autre document. Rechargez la page pour en obtenir une nouvelle.',
      '/problems/database-unavailable': 'La base de données ne répond pas.',
      '/problems/internal':
        'L’action n’a pas pu aboutir. Citez l’identifiant de corrélation ci-dessous.',

      // Client-originated (lib/api-client.ts's `CLIENT_PROBLEM_TYPES`), never sent by the API —
      // synthesized here because a proxy error page or a `fetch()` rejection never reached a
      // server that could answer with `application/problem+json`, and this page never renders
      // nothing.
      '/problems/client-unparsable-response':
        'La réponse du serveur n’a pas pu être lue. Le serveur applicatif est peut-être indisponible ou en cours de démarrage.',
      '/problems/client-network-failure':
        'La requête n’a pas atteint le serveur. Vérifiez la connexion, puis réessayez.',

      // @erp/platform
      '/problems/invalid-value': 'Cette valeur n’est pas acceptable.',
      '/problems/out-of-scope':
        'Cet enregistrement existe et il est hors de votre périmètre : votre rôle et votre implantation ne le couvrent pas.',

      // @erp/timesheet
      '/problems/unknown-calendar-year':
        'Le calendrier ouvré ne couvre pas cette année : les jours fériés n’y sont pas connus.',
      '/problems/mission-required': 'Un jour travaillé doit porter une mission.',
      '/problems/mission-not-allowed': 'Une absence ne porte pas de mission.',
      '/problems/day-outside-period': 'Ce jour n’appartient pas au mois saisi.',
      '/problems/refusal-reason-required': 'Un refus doit dire ce qu’il faut corriger.',
      '/problems/unknown-mission': 'Cette mission n’existe pas.',
      '/problems/day-overbooked':
        'Une journée compte deux demi-journées : celle-ci est déjà complète.',
      '/problems/validated-cra-is-immutable':
        'Ce CRA est validé : un relevé de temps validé ne se modifie plus (ADR-0005).',
      '/problems/cra-transition-not-allowed':
        'Le CRA n’est pas dans un état qui permet cette action.',
      '/problems/mission-not-running': 'La mission ne tourne pas à cette date.',
      '/problems/not-assigned': 'Le consultant n’est pas affecté à cette mission à cette date.',
      '/problems/missing-habilitation':
        'La mission exige une habilitation que le consultant ne détenait pas ce jour-là.',
      '/problems/cra-incomplete': 'Le mois n’est pas complet au regard du calendrier ouvré.',
      '/problems/self-validation-forbidden':
        'Qui saisit un CRA ne le juge pas — ni pour le valider, ni pour le refuser : c’est la première règle de séparation des tâches (ADR-0006).',
      '/problems/not-the-manager':
        'Le CRA d’un mois se répond — validation comme refus — par le manager de ce mois-là, pas par un autre (ADR-0034).',

      // @erp/billing
      '/problems/payment-terms-too-long':
        'Un délai de règlement au-delà du plafond légal est nul, pas inhabituel (art. L441-10).',
      '/problems/invalid-payment-term': 'Ce délai de règlement n’est pas une forme autorisée.',
      '/problems/no-vat-rate': 'Aucun taux de TVA ne se résout pour cette opération à cette date.',
      '/problems/empty-invoice': 'Une facture sans ligne n’est pas une facture.',
      '/problems/line-outside-invoice-period':
        'Une ligne porte sur un mois qui n’est pas la période d’exécution du document.',
      '/problems/invalid-sequence': 'Le numéro alloué ne suit pas la série.',
      '/problems/invoice-transition-not-allowed':
        'La facture n’est pas dans un état qui permet cette action.',
      '/problems/document-does-not-add-up':
        'Le document ne s’additionne pas : totaux et lignes divergent, il ne part pas.',
      '/problems/cra-already-processed':
        'Ce CRA a déjà produit une facture pour ce client : il n’en produira pas une seconde (ADR-0021).',
      '/problems/not-an-issued-invoice': 'Seule une facture émise peut être corrigée par un avoir.',
      '/problems/validator-cannot-issue':
        'Qui valide un CRA n’émet pas la facture qui en découle : c’est la seconde règle de séparation des tâches (ADR-0006).',
    },

    deniedBy: 'Règle qui a refusé',
    invariant: 'Invariant violé',
    correlationId: 'Identifiant de corrélation',
    correlationHint:
      'À citer en cas de signalement : il relie cette page à la ligne de journal qui la décrit.',
    back: 'Revenir à l’accueil',
  },

  action: {
    continue: 'Continuer',
    /**
     * The accessible name of the close affordance shadcn's `Dialog` and `Sheet` primitives render
     * themselves (`components/ui/dialog.tsx`, `components/ui/sheet.tsx`) — they ship it as a
     * hardcoded English `sr-only` string, which ADR-0060 already refused once on the server-rendered
     * pages ("a French sentence, never the English `title`"). A vendored component is still a
     * component: §2's "aucune chaîne visible en dur" holds inside `components/ui/` too.
     */
    close: 'Fermer',
    /** Same, for `BreadcrumbEllipsis`'s collapsed-crumbs control (`components/ui/breadcrumb.tsx`). */
    more: 'Afficher les niveaux masqués',
  },

  /**
   * The shell itself (frontend-plan.md Phase 4, tasks 4.2-4.4): the sidebar's collapse control,
   * the mobile `Sheet` trigger, the "à venir" placeholder every Phase 6-8 route renders until its
   * own phase builds it, the styled 404, and the copy for a session that stopped resolving after
   * the shell had already rendered (`features/session/session-guard.ts`).
   */
  shell: {
    collapse: 'Réduire la navigation',
    expand: 'Déployer la navigation',
    openMenu: 'Ouvrir le menu',
    closeMenu: 'Fermer le menu',
    breadcrumbHome: 'Accueil',
    comingSoonTitle: 'Cet écran arrive dans une prochaine phase',
    comingSoonBody:
      'Cette page n’est pas encore construite dans la maquette : elle existe dans la navigation pour montrer le périmètre complet, pas pour être ouverte aujourd’hui.',
    notFoundTitle: 'Page introuvable',
    notFoundBody: 'Cette adresse ne correspond à aucun écran de la maquette.',
    notFoundAction: 'Revenir à l’accueil',
    unexpectedErrorBody:
      'Une erreur inattendue a interrompu l’affichage de cette page. Revenez à l’accueil et recommencez.',
    sessionInvalidatedToast: 'Votre persona n’est plus reconnue. Choisissez-en une à nouveau.',
  },

  footer: {
    mockup:
      'Maquette de démonstration. Données synthétiques, aucun client réel, aucun taux réel. Le sélecteur de persona remplace une authentification et ne doit pas être présenté comme telle.',
    source: 'Le code, les décisions (ADR) et le vocabulaire du domaine vivent dans le dépôt.',
  },
} as const;
