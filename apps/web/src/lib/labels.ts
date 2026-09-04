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
  appName: 'Maquette ERP',
  demo: {
    title: 'Données de démonstration',
    body: 'Toutes les données sont synthétiques. Cette instance est réinitialisée chaque nuit : toute modification sera effacée.',
  },
  glossary: {
    open: 'Définition : {term}',
    cra: {
      label: 'CRA',
      definition:
        'Compte rendu d’activité mensuel : le relevé des jours travaillés d’un consultant.',
    },
    tjm: {
      label: 'TJM',
      definition:
        'Taux journalier moyen convenu avec le client pour un consultant sur une mission. Il est daté.',
    },
    cjm: {
      label: 'CJM',
      definition:
        'Coût journalier moyen du consultant pour l’entreprise. Cette donnée est réservée au management de son implantation.',
    },
    regie: {
      label: 'Régie',
      definition: 'Facturation des jours réellement travaillés, multipliés par le TJM applicable.',
    },
    forfait: {
      label: 'Forfait',
      definition:
        'Montant convenu pour un livrable, indépendant des jours travaillés. Ce modèle n’est pas facturé dans cette maquette.',
    },
    preFacturier: {
      label: 'Pré-facturier',
      definition:
        'Vue mensuelle de ce qui est facturable et, pour chaque jour qui ne l’est pas, de la raison qui bloque.',
    },
    habilitation: {
      label: 'Habilitation',
      definition:
        'Qualification certifiée qu’un consultant doit détenir pour être affecté à certaines missions.',
    },
    intercontrat: {
      label: 'Intercontrat',
      definition:
        'Période sans mission client, enregistrée ici sur une mission interne au forfait afin de conserver un CRA complet.',
    },
  },
  appTagline: 'Maquette d’un module ERP interne',

  nav: {
    skipToContent: 'Aller au contenu',
    main: 'Navigation principale',
  },

  pagination: {
    range: '{first}–{last} sur {total} résultats',
    perPage: 'Par page',
    previous: 'Page précédente',
    next: 'Page suivante',
  },

  timeline: {
    heading: 'Chronologie métier',
    submitted: 'CRA soumis',
    refused: 'CRA refusé',
    validated: 'CRA validé',
    drafted: 'Brouillon de facture créé',
    issued: 'Facture émise',
  },

  persona: {
    sessionInvalidatedTitle: 'Session interrompue',
    heading: 'Choisir un persona',
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
    /** The one place a visitor is told this is not authentication (item 1, QA round 1). The API
     * says the same thing in English on `GET /api/v1/personas`, for a client that never renders
     * a screen; French display copy lives here, per ADR-0026. */
    notice:
      'Cette maquette n’a pas d’authentification : on choisit une identité, et tout le monde peut choisir n’importe laquelle.',
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
    /** Task 8.4: one screen, three roles, never the same three cards — `DashboardScreen` picks
     * the block below matching `data.role`, the wire's own discriminant. */
    consultant: {
      monthStatus: 'Statut du mois',
      monthStatusNone: 'Non commencé',
      recorded: 'Jours saisis',
      remaining: 'Jours restants à saisir',
      hints: {
        none: 'Ce mois n’a pas encore été commencé.',
        draft: 'Votre saisie est en brouillon : elle n’a pas encore été envoyée à votre manager.',
        submitted: 'Votre mois est soumis, en attente de la décision de votre manager.',
        validated: 'Votre mois est validé.',
        refused: 'Votre mois a été refusé : une correction est attendue.',
      },
      open: 'Ouvrir mon CRA',
      /**
       * ADR-0082: `refusedPeriods` may name a period other than the one already reported by
       * `hints.refused` above — `{month}` interpolated with `frenchMonth(period)`, one sentence
       * per period since each opens a different Cra.
       */
      refusedElsewhere: 'Le CRA de {month} a été refusé : une correction est attendue.',
      openRefused: 'Ouvrir ce CRA',
    },
    manager: {
      pending: 'CRA en attente de décision',
      billable: 'Facturable ce mois',
      late: 'CRA en retard',
      /** `{count}` interpolated — the plan's own example sentence (task 8.4: « 1 Cra en attente
       * de votre décision »), singular/plural chosen at the call site. */
      pendingSentenceOne: '1 CRA en attente de votre décision.',
      pendingSentenceMany: '{count} CRA en attente de votre décision.',
      // ADR-0082: this counts across every period, not just the one shown — "ce mois" would be
      // false the moment a pending Cra sits in another month.
      pendingSentenceNone: 'Aucun CRA n’attend votre décision.',
      open: 'Ouvrir le pré-facturier',
      /** One work-queue row's action — opens that row's own period, not the one on screen
       * (the bug the queue exists to fix: the counter used to point at the displayed month).
       * Item 21, QA round 3: renamed from "Décider" and now opens the consultant's CRA directly
       * (`/cra/$period/$consultantId`) instead of the pré-facturier — a manager reads the month
       * before deciding, "Vérifier" names that first step. */
      decide: 'Vérifier',
    },
    billing: {
      draft: 'Factures en brouillon',
      issued: 'Factures émises',
      totalIssued: 'Total TTC émis',
      draftSentenceOne: '1 facture en brouillon, prête à émettre.',
      draftSentenceMany: '{count} factures en brouillon, prêtes à émettre.',
      draftSentenceNone: 'Aucune facture en brouillon ce mois.',
      open: 'Voir les factures',
    },
    /** Rank A1/A5: the three tiers every role's dashboard now shares — an actionable queue first,
     * the former `StatCard` trio demoted under it, then recent activity. */
    queue: {
      now: 'À faire maintenant',
      nowEmpty: 'Rien n’attend une action.',
      thisMonth: 'Ce mois',
      recentActivity: 'Activité récente',
      recentActivityEmpty: 'Aucune activité récente.',
      /** `{days}` interpolated, 0 reading as "aujourd’hui" at the call site. */
      ageToday: 'Aujourd’hui',
      ageOneDay: 'Depuis 1 jour',
      ageManyDays: 'Depuis {days} jours',
      emptyMonthNotice:
        'Ce mois ne contient aucune donnée : c’est un mois en cours, pas un défaut.',
      seeMonthsWithData: 'Voir un mois avec des données',
    },
    /** Rank A2 — manager/billing only. Two honest series, never a twelve-month curve (the header
     * comment of `invoice-history-chart.tsx` explains why a chart was refused until now). */
    history: {
      heading: 'Historique des factures',
      byYearTitle: 'Factures par année et par statut',
      byYearCaption:
        'Six années où cette implantation a eu au moins une facture — les années sans barre n’ont eu aucune facture, ce n’est pas une donnée manquante.',
      byYearAxisLabel: 'Nombre de factures',
      denseMonthsTitle: 'Facturable — juin, juillet, août 2026',
      denseMonthsCaption:
        'Trois mois, pas une tendance : le jeu de données ne couvre densément que ces trois mois de 2026.',
      denseMonthsAxisLabel: 'Facturable HT',
      tableCaption: 'Les mêmes chiffres, en tableau.',
      year: 'Année',
      total: 'Total',
      /** Item 23, QA round 3 — the eye/eye-off affordance (`VisibilityToggle`) on this section. */
      hide: 'Masquer les graphiques',
      show: 'Afficher les graphiques',
    },
    /** Item 3, QA round 5 (ADR-0098): the manager's own replacement for the invoice-history charts
     * above, which are not relevant to a manager's own question ("who is staffed on what, right
     * now"). Billing renders no chart at all — see `chartsUnavailable` below. */
    staffing: {
      heading: 'Répartition de l’équipe',
      /** States plainly that this is "now", not the period the rest of the screen is showing —
       * ADR-0098's own reasoning for why the figure is not scoped to `period`. */
      caption: 'Aujourd’hui, pas la période affichée ci-dessus.',
      onMission: 'En mission',
      intercontrat: 'Intercontrat',
      empty: 'Aucun consultant actif dans cette implantation.',
      hide: 'Masquer la répartition de l’équipe',
      show: 'Afficher la répartition de l’équipe',
    },
    /** Item 3, QA round 5: billing's deliberate empty state where the invoice-history charts used
     * to render — a stated absence, not a silent hole in the layout. */
    chartsUnavailable: {
      heading: 'Graphiques',
      body: 'Aucun graphique pour ce rôle pour le moment.',
    },
    /** Item 17, QA round 3: the dashboard's "informations CSE / vie de l’entreprise" module — a
     * small rotating carousel of authored company-news messages, every role. */
    companyNews: {
      heading: 'Informations CSE / vie de l’entreprise',
      hide: 'Masquer les informations CSE',
      show: 'Afficher les informations CSE',
      previous: 'Message précédent',
      next: 'Message suivant',
      /** `{index}`/`{total}` interpolated — a dot's own accessible name. */
      goToMessage: 'Aller au message {index} sur {total}',
      /** Said in the interface, not only in the README: the attachment is a file name, and this
       * mockup has no document store to open it from. */
      attachmentNotProvided: '(document non fourni dans la maquette)',
    },
    /** Item 18, QA round 3: the dashboard's org-chart panel, consultant and manager only — billing
     * has no place in this org chart in the seed (the one billing persona is the director every
     * manager reports to, not a subject of this read). */
    orgChart: {
      heading: 'Mon équipe',
      manager: 'Manager',
      noManager: 'Aucun manager renseigné.',
      reports: 'Équipe ({count})',
      noReports: 'Aucun rattachement direct.',
    },
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
    /** The matrix's row-header column (ADR-0070: rows are activities, not days). */
    activity: 'Activité',
    totals: 'Totaux du mois',
    /** The matrix's per-day total row, and the total-per-day column header on the totals panel
     * (Phase 6.2's "deux totaux, lus du même état local"). */
    dayTotal: 'Total du jour',
    monthTotal: 'Total du mois',
    weekTotal: 'Total semaine',
    totalsAsOf: 'Totaux à jour du dernier enregistrement.',
    /**
     * The SPA's own note, distinct from `totalsAsOf` above: that sentence describes the
     * server-rendered screen (ADR-0009/ADR-0050), which has no client script and genuinely cannot
     * recompute between saves. This screen does (task 6.2), so reusing `totalsAsOf` here would have
     * the UI describe a behaviour it does not have — a new key, not a shared one, is the fix.
     */
    totalsLive:
      'Totaux recalculés à chaque modification ; confirmés par le serveur à l’enregistrement.',
    // D5 (revue du 25/08, tranché en 5bis.6): l'unité d'affichage est le jour, décidée une fois
    // dans format.ts (frenchDays). Un en-tête « Demi-journées » au-dessus d'une valeur « 21 j »
    // était la contradiction — la colonne s'intitule comme celle du pré-facturier.
    recorded: 'Jours saisis',
    submittedToast: 'Soumis',
    saveState: {
      dirty: 'Modifications non enregistrées',
      saving: 'Enregistrement…',
      saved: 'Enregistré à {time}',
      submitted: 'Soumis à {time}',
      failed: 'Échec de l’enregistrement — réessayez.',
      unchanged: 'Aucune modification en attente',
    },
    nothing: '—',
    absence: 'Absence',
    flagged: 'Signalé',
    save: 'Enregistrer',
    submit: 'Soumettre au manager',
    period: 'Mois',
    status: 'Statut',
    show: 'Ouvrir',
    consultant: 'Consultant',
    notStartedYet: 'Ce mois n’a pas encore été commencé. Remplissez-le, puis enregistrez.',
    nothingRecorded: 'Rien n’est encore saisi sur ce mois.',
    refused: 'Ce CRA a été refusé par le manager. Corrigez-le, puis soumettez-le à nouveau.',
    /** Item 31, QA round 3: prefixes the manager's free-text refusal reason wherever it is shown
     * verbatim (the consultant's own CRA, and the manager's read of it), so the reason reads as a
     * labelled field rather than an unattributed sentence. */
    refusalReasonPrefix: 'Motif : ',
    emptyList: 'Aucun CRA sur cette période.',
    emptyListHint:
      'Ce n’est pas un refus : la liste est bien la vôtre, elle ne contient simplement rien pour ce mois.',
    /** Item 7 (QA round 1) — the manager-only consultant/status filter on `/cra`. A consultant
     * persona never sees this (they have one CRA) and neither does a billing one, so these
     * strings render for a manager and nobody else. */
    filters: {
      consultantLabel: 'Consultants',
      consultantPlaceholder: 'Rechercher un consultant…',
      consultantNoMatch: 'Aucun consultant ne correspond à cette recherche.',
      consultantNoneSelected: 'Tous les consultants',
      statusLabel: 'Statut',
      clear: 'Effacer les filtres',
      emptyTitle: 'Aucun CRA ne correspond à ces filtres.',
      emptyBody: 'Essayez de retirer un consultant, un statut, une année ou un mois du filtre.',
      /** Item 4 (QA round 2): year and month, independent of each other and of the two above. */
      yearLabel: 'Année',
      yearAll: 'Toutes les années',
      monthLabel: 'Mois',
      monthAll: 'Tous les mois',
    },
    /** task 6.1: the two-row list needed no filter; this replaces it with the control item 2
     * actually asked for — opening a month that has no `Cra` row yet. */
    openAnotherMonth: 'Ouvrir un autre mois',
    openAnotherMonthHint:
      'Choisissez un mois à venir pour commencer sa saisie à partir d’une grille vide.',
    openAnotherMonthPlaceholder: 'Choisir un mois…',
    noOtherMonthToOpen: 'Aucun autre mois n’est disponible dans le calendrier.',
    nonWorkable: {
      weekend: 'Week-end',
      publicHoliday: 'Férié',
    },
    readOnly: {
      submitted: 'CRA soumis : il est entre les mains du manager et n’est plus modifiable.',
      // D3 (revue du 25/08): un identifiant d'ADR ne s'affiche jamais à l'utilisateur, et « Cra »
      // reste « Cra » — pas « relevé de temps » (CONTEXT.md). `validatedByLabel` complète cette
      // phrase avec le nom du manager, lu sur `validatedBy` (défaut D6).
      validated: 'Ce CRA est validé, et un CRA validé est immuable.',
      draft: '',
      refused: '',
    },
    /** `{name}` is interpolated at the call site — the same convention `craPrint.openFor` and
     * `margin.revealFor` already use below. */
    validatedByLabel: 'Validé par {name}.',
    statuses: {
      draft: 'Brouillon',
      submitted: 'Soumis',
      validated: 'Validé',
      refused: 'Refusé',
    },
    matrix: {
      /** `<caption>` (task 6.4: "un caption qui nomme le mois") — `{month}` interpolated. */
      caption: 'CRA — {month}',
      previousMonth: 'Mois précédent',
      nextMonth: 'Mois suivant',
      previousWeek: 'Semaine précédente',
      nextWeek: 'Semaine suivante',
      weekPosition: 'Semaine {current} sur {count}',
      fillEmptyWorkdays: 'Remplir les jours ouvrés vides',
      clearRow: 'Vider la ligne',
      removeRow: 'Retirer la ligne',
      addActivity: 'Ajouter une activité',
      addActivityPlaceholder: 'Choisir une mission…',
      noActivityToAdd: 'Toutes les missions affectées ce mois-ci figurent déjà dans la grille.',
      notAssignableThisDay: 'Mission non affectée ce jour-là.',
      /** task 6.2's day-total signal (`isDayOverbooked`, `matrix.ts`) — never a blocker: the
       * domain's own `DayOverbookedError` is what actually refuses the write on save.
       * `dayOverbookedColumn` is the short marker under the day number in the header (mirrors
       * `nonWorkable`/`flagged`'s own one-word style); `dayOverbooked` is the fuller sentence for
       * the total cell's `aria-label`/`title`. */
      dayOverbookedColumn: 'Dépassement',
      dayOverbooked:
        'Ce jour dépasse une journée complète : la saisie sera refusée à l’enregistrement.',
      /** The `< 1 j` counterpart, in amber rather than red because it is a month still being
       * filled, not a save that cannot succeed (`isDayIncomplete`, `matrix.ts`). A day nobody has
       * typed into stays neutral until a refused submission names it. */
      dayIncompleteColumn: 'À compléter',
      dayIncomplete:
        'Ce jour ouvré n’atteint pas une journée complète : le mois ne pourra pas être soumis tant qu’il y manque quelque chose.',
      /** Item 28, QA round 3: a consultant-side warning, never a block — time entered on a
       * weekend or un jour férié happens in this business (the manager's own `flagged`/
       * `nonWorkable` markers exist for exactly this) and the submission still goes through.
       * `{count}` interpolated, singular/plural chosen at the call site. */
      nonWorkableEnteredOne:
        '1 jour saisi tombe un week-end ou un jour férié — la soumission reste possible, mais votre manager le verra signalé.',
      nonWorkableEnteredMany:
        '{count} jours saisis tombent un week-end ou un jour férié — la soumission reste possible, mais votre manager les verra signalés.',
      /** Same fact, read by the manager instead of the consultant who entered it — the read-only
       * CRA detail view (`manager-cra-grid-screen.tsx`), not only the validate dialog. */
      nonWorkableEnteredManagerOne: '1 jour de ce mois tombe un week-end ou un jour férié.',
      nonWorkableEnteredManagerMany:
        '{count} jours de ce mois tombent un week-end ou un jour férié.',
      /** Accessible names for the five-option `<select>` a cell is (ADR-0068, ADR-0070) — never
       * the raw fraction glyph alone, which reads as nothing to a screen reader. */
      quantityOptions: {
        empty: 'Aucune saisie',
        quarter: 'Un quart de journée',
        half: 'Une demi-journée',
        threeQuarters: 'Trois quarts de journée',
        full: 'Une journée entière',
      },
      unsavedChangesConfirm:
        'Des modifications ne sont pas enregistrées sur ce mois. Changer de mois maintenant les perdra. Continuer ?',
      /** A9's progress bar — `{completed}`/`{total}` interpolated, counted over workable days only
       * (`isDayComplete`, `matrix.ts`). */
      workdaysComplete: '{completed}/{total} jours ouvrés complets',
      /** A9's post-refusal action: focuses the earliest day named by `/problems/cra-incomplete`
       * (`missingDaysFrom`, `missing-days.ts`). Shown only once that set is non-empty. */
      goToFirstIncompleteDay: 'Aller au premier jour incomplet',
      /** A9's collapsible legend — trigger text and the swatch sentences below reuse the existing
       * `nonWorkable` / `dayOverbooked*` / `dayIncomplete*` / `flagged` strings, so only the
       * heading and the toggle need their own key. */
      legendToggle: 'Légende',
      /** A9's desktop month/week toggle — reuses A11's own `compact` slicing (`calendarWeeks`,
       * `WeekNavigator`), so only the two labels and the group's own name are new. */
      viewLabel: 'Affichage du tableau',
      viewMonth: 'Mois',
      viewWeek: 'Semaine',
      /** O7: single-level undo on the row tools' own "remplir"/"vider" — the button reads
       * "{undo} — {action}", `action` being `fillEmptyWorkdays`/`clearRow` re-used verbatim with
       * the row's name appended, so this key stays the one bare word. */
      undo: 'Annuler',
      /** O6 — "Copier le mois précédent", with a preview (`copy-previous-month-dialog.tsx`): never
       * overwrites a cell already carrying something, built on the row tools' own
       * `fillEmptyWorkdays`. */
      copyPreviousMonth: 'Copier le mois précédent',
      copyPreviousMonthDialog: {
        title: 'Copier le mois précédent',
        lead: 'Les missions qui portaient du temps saisi en {month} sont proposées ci-dessous, sur les jours ouvrés encore vides de ce mois-ci. Rien d’existant n’est remplacé.',
        loadError: 'Le mois précédent n’a pas pu être chargé.',
        empty: 'Rien à copier depuis le mois précédent.',
        daysToFill: '{days} j',
        confirm: 'Copier',
        cancel: 'Annuler',
      },
    },
    /** ADR-0071 — a manager's read-only view of a named consultant's month. `{name}` interpolated. */
    managerView: {
      banner: 'Vous consultez le CRA de {name}, en lecture seule.',
      backToList: 'Retour à la liste',
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
      'Ce relevé couvre le mois entier du consultant, missions confondues. Le nom du signataire n’est pas pré-imprimé : il dépend du destinataire, pas du relevé.',
    signatureName: 'Nom et qualité',
    signatureDate: 'Date',
    signatureMark: 'Signature',
    nothingRecorded: 'Aucun jour saisi sur ce mois.',
    back: 'Revenir au CRA',
  },

  preFacturier: {
    heading: 'Pré-facturier',
    nav: 'Pré-facturier',
    lead: 'Ce qui est facturable sur le mois, et pour tout le reste la raison qui bloque. Rien ne se décide ici : l’écran ne fait qu’assembler ce que les deux modules savent.',
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
    /** Rank A7: the discriminant that tells two drafts to the same client apart. */
    invoiceConsultant: 'Consultant',
    invoiceMissions: 'Mission(s)',
    invoiceLines: 'Lignes',
    invoiceCreatedAt: 'Créée le',
    invoiceOpen: 'Ouvrir',
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
      'Jours saisis sur un mois clos dont le CRA n’est pas encore validé. Le mois en cours affiche zéro : rien n’y est en retard, puisque rien n’y est encore dû.',
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
    period: 'Mois',
    searchConsultant: 'Rechercher un consultant',
    searchConsultantPlaceholder: 'Nom du consultant…',
    search: 'Rechercher',
    clearSearch: 'Effacer',
    searchEmpty: 'Aucun résultat pour ce consultant',
    searchEmptyBody: 'Effacez la recherche pour retrouver tous les CRA et factures du mois.',
    /** task 7.2's result dialog — drafted invoices **and** declined days, French reasons, and the
     * `replayed: true` case rendered as information rather than as a second success. */
    validateDialog: {
      title: 'Validation du CRA de {name}',
      invoicesHeading: 'Factures brouillon créées',
      noInvoices:
        'Aucune facture créée : tous les jours de ce CRA sont écartés ci-dessous, pour un motif de facturation.',
      declinedHeading: 'Jours écartés',
      noDeclined: 'Aucun jour écarté : tout ce qui a été validé part en facture.',
      declinedQuantity: '{days} sur la mission {mission}',
      close: 'Fermer',
    },
    validateSuccessToast: 'CRA validé.',
    validateReplayedToast: 'Ce CRA était déjà validé : résultat d’origine affiché.',
    /** O4: a récapitulatif before the (otherwise instant) "Valider" — never a second confirmation
     * of an already-reversible action past this point, only of one that immediately drafts an
     * invoice per client. `{name}` interpolated; the recap lines themselves are built by each
     * caller from what it already has on hand (`ValidateConfirmDialog`'s own `facts` prop) rather
     * than a fixed schema this key would have to describe. */
    validateConfirmDialog: {
      title: 'Valider le CRA de {name} ?',
      lead: 'Cette action est immédiate et fige le mois : plus aucune saisie n’est possible après, et un brouillon de facture est créé pour chaque client concerné.',
      confirm: 'Valider',
      cancel: 'Annuler',
      periodFactLabel: 'Période',
      /** Item 28, QA round 3: a weekend/holiday entry made visually loud (a banner, not a plain
       * `<dl>` row a manager could validate past without reading) — `{count}` interpolated,
       * singular/plural chosen at the call site. Shown only where the count is known
       * (`manager-cra-grid-screen.tsx`'s own `data.flags`); the pré-facturier's own row-level
       * "Valider" does not have this data — `PreFacturierCraRow` computes no `CraFlag`, by design.
       * That asymmetry is real and stays (ADR-0095); what ADR-0095 closes is its *silence* —
       * `flaggedDaysNotComputed` below is what the pré-facturier's caller shows instead of
       * nothing. */
      flaggedDaysWarningOne:
        '1 jour de ce mois tombe un week-end ou un jour férié — vérifiez-le avant de valider.',
      flaggedDaysWarningMany:
        '{count} jours de ce mois tombent un week-end ou un jour férié — vérifiez-les avant de valider.',
      /** The muted counterpart to the two warnings above, for `flaggedDaysCount: null`. ADR-0095. */
      flaggedDaysNotComputed:
        'Les jours tombant un week-end ou un jour férié ne sont pas vérifiés dans cette liste — ouvrez le CRA pour les vérifier avant de valider.',
      clientsFactLabel: 'Clients avec du temps saisi ce mois',
      recordedDaysFactLabel: 'Jours saisis',
      lateFactLabel: 'Signalé en retard',
      yes: 'Oui',
      no: 'Non',
    },
    /** task 7.3 — the reason is mandatory (1-500 chars, `POST /api/v1/cras/:id/refusal`); the
     * client-side "empty" message reuses the domain's own sentence
     * (`problem.sentences['/problems/refusal-reason-required']`) rather than a second wording for
     * the same rule. */
    refuseDialog: {
      title: 'Refuser le CRA de {name}',
      lead: 'Le consultant verra ce motif sur son CRA et pourra corriger avant de le soumettre à nouveau.',
      reasonLabel: 'Motif du refus',
      confirm: 'Confirmer le refus',
      cancel: 'Annuler',
    },
    refuseSuccessToast: 'CRA refusé.',
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
    lines: 'Lignes',
    designation: 'Désignation',
    quantity: 'Quantité',
    unitPrice: 'Prix unitaire (quart de journée)',
    vatRate: 'TVA',
    amount: 'Montant HT',
    vatRecap: 'Récapitulatif de TVA',
    vatBase: 'Base HT',
    vatAmount: 'TVA',
    totalExcludingVat: 'Total HT',
    totalVat: 'Total TVA',
    totalIncludingVat: 'Total TTC',
    provisionalTotals: 'Montants provisoires — figés à l’émission.',
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
    lineage: {
      heading: 'Filiation des montants',
      lead: 'Dépliez une ligne pour suivre son calcul depuis les jours saisis jusqu’au total de la facture.',
      line: 'Ligne {number}',
      cra: 'Jours du CRA',
      mission: 'Mission',
      quantityAndRate: 'Quantité × TJM daté',
      lineExcludingVat: 'Ligne HT',
      vatGroup: 'Groupe de TVA',
      invoiceIncludingVat: 'Facture TTC',
      unavailable: 'Groupe indisponible',
    },
    validatedBy: 'Validé par',
    notCharged: 'Non soumis à TVA',
    issue: 'Émettre la facture',
    issueNote:
      'L’émission alloue un numéro dans une série sans trou et fige le document : rien n’y bouge ensuite. Le formulaire porte sa clé d’idempotence, pour qu’un renvoi ne brûle pas un second numéro.',
    cannotIssue:
      'Cette facture est déjà émise : elle porte un numéro et une date, et une facture émise ne se modifie pas.',

    /** Task 8.1's list. `client`/`status`/`ttc` are the table's own column headers — `status`
     * reuses no cross-feature import, `StatusBadge` already carries its own label
     * (`LABELS.preFacturier.invoiceStatuses`, `components/status-badge.tsx`). */
    client: 'Client',
    ttc: 'TTC',
    /** `GET /api/v1/invoices` has no server-side status filter (Annexe A: `limit`/`offset`
     * only) — these are a client-side **view** over one fetched page, task 8.1's own "onglets de
     * vue", not a query. */
    filters: {
      all: 'Toutes',
      draft: 'Brouillon',
      issued: 'Émises',
      cancelledByCreditNote: 'Annulées',
    },
    search: 'Rechercher',
    searchPlaceholder: 'Client ou numéro de facture…',
    searchAction: 'Rechercher',
    year: 'Année',
    allYears: 'Toutes',
    clearFilters: 'Effacer les filtres',
    emptyTitle: 'Aucune facture',
    emptyBody:
      'Cette implantation n’a encore validé aucun CRA facturable : une facture apparaît ici dès qu’un manager valide un mois en régie (task 7.2).',
    /** The *other* empty case (task 8.1): invoices exist, none match the selected tab — a
     * one-line `DataTable` `emptyState`, not the full designed-empty-state treatment 8.5 owns for
     * "this implantation has never issued a single document". */
    filterEmptyBody: 'Aucune facture dans cet état.',

    /** Task 8.2's detail. `printable` opens the SSR `/facture/:id` (Annexe C.9: singular, never
     * this route's own plural `/factures/$id`) in a new tab. `terms` renders the payment
     * condition itself (`PaymentTerms`, on the wire) — never a computed due date:
     * `Invoice.dueDateFrom` lives in `packages/billing`, off limits to `apps/web` (§2), and
     * `docs/open-questions.md`'s Phase 3 checkpoint (point 3) already named `dueDate`'s absence
     * from the route as a finding for whichever phase first needed it, not an invitation to
     * recompute it client-side. */
    printable: 'Version imprimable',
    backToList: 'Retour à la liste',
    paymentTerms: 'Conditions',
    terms: {
      net: 'Net à {days} jours',
      endOfMonth: 'Fin de mois, à {days} jours',
    },

    /** Task 8.3 — billing only. `{name}` interpolated with `billedToName`, the same convention
     * `preFacturier.validateDialog.title`/`refuseDialog.title` already use. */
    issueDialog: {
      title: 'Émettre la facture de {name}',
      confirm: 'Émettre',
      cancel: 'Annuler',
    },
    issueSuccessToast: 'Facture émise : {number}.',
    issueReplayedToast: 'Cette facture était déjà émise : numéro d’origine affiché.',
  },

  assignment: {
    nav: 'Affectations',
    current: 'Affectations en cours',
    upcoming: 'À venir',
    consultants: 'Consultants',
    new: 'Nouvelle affectation',
    edit: 'Modifier les dates',
    formLead:
      'Le périmètre, les dates de mission et les habilitations sont vérifiés à l’enregistrement.',
    consultant: 'Consultant',
    mission: 'Mission',
    from: 'Du',
    to: 'Au',
    chooseConsultant: 'Choisir un consultant…',
    chooseMission: 'Choisir une mission…',
    create: 'Affecter',
    save: 'Enregistrer',
    cancelEdit: 'Annuler la modification',
    noHabilitation: 'Cette mission ne demande aucune habilitation particulière.',
    requiredHabilitations: 'Habilitations requises : {names}.',
    createdToast: 'Affectation créée.',
    updatedToast: 'Affectation mise à jour.',
    list: 'Affectations de l’implantation',
    listLead: 'Les affectations passées restent visibles dans l’historique.',
    filters: { current: 'En cours', all: 'Toutes' },
    empty: 'Aucune affectation dans cette vue',
    emptyBody: 'Créez une affectation ou affichez l’historique complet.',
    currentBadge: 'En cours',
    upcomingBadge: 'À venir',
    endedBadge: 'Terminée',
    openEnded: 'sans date de fin',
    editFor: 'Modifier l’affectation de {name}',
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
    noMissionTitle: 'Aucune mission facturée ce mois',
    noMission:
      'Aucune mission en régie sur ce mois : une mission au forfait n’a pas de TJM daté, et elle est écartée plutôt que comptée à zéro.',
    /** O2 — the one "Pourquoi ce résultat ?" surface built (marge only, per the plan's own note
     * that it recoupe A3/A4 elsewhere): the formula, the reference date and the applied rule,
     * read straight off `apps/api/src/economics/consultant-economics.ts` rather than restated
     * from memory. `{date}` interpolated with the last day of the period (ADR-0034: both dated
     * rates resolve there). */
    whyResult: {
      trigger: 'Pourquoi ces montants ?',
      title: 'Comment ces montants sont calculés',
      revenueFormula: 'Chiffre d’affaires = somme, par mission, de (jours travaillés × TJM daté)',
      costFormula: 'Coût = jours travaillés (toutes missions) × CJM daté',
      marginFormula: 'Marge = Chiffre d’affaires − Coût',
      referenceDate:
        'Date de référence : {date}, le dernier jour du mois — c’est la date à laquelle le TJM et le CJM en vigueur sont recherchés.',
    },
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
      '/problems/assignment-invalid-range':
        'La date de fin doit être postérieure ou égale à la date de début.',
      '/problems/assignment-after-departure':
        'Cette affectation atteint ou dépasse la date de départ du consultant.',
      '/problems/assignment-outside-mission':
        'Les dates choisies sortent de la période de la mission.',
      '/problems/assignment-missing-habilitation':
        'Le consultant ne possède pas toutes les habilitations requises pendant cette affectation.',
      '/problems/assignment-overlap':
        'Une affectation à cette mission couvre déjà tout ou partie de ces dates.',
      '/problems/assignment-recorded-days':
        'Cette modification laisserait hors affectation des jours déjà enregistrés dans un CRA.',

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
      '/problems/day-overbooked': 'Une journée ne peut pas dépasser le volume horaire prévu.',
      '/problems/validated-cra-is-immutable':
        'Ce CRA est validé : un relevé de temps validé ne se modifie plus.',
      '/problems/cra-transition-not-allowed':
        'Le CRA n’est pas dans un état qui permet cette action.',
      '/problems/mission-not-running': 'La mission ne tourne pas à cette date.',
      '/problems/not-assigned': 'Le consultant n’est pas affecté à cette mission à cette date.',
      '/problems/missing-habilitation':
        'La mission exige une habilitation que le consultant ne détenait pas ce jour-là.',
      '/problems/cra-incomplete': 'Le mois n’est pas complet au regard du calendrier ouvré.',
      '/problems/cra-after-departure': 'Ce mois commence après le départ du consultant.',
      '/problems/self-validation-forbidden':
        'Qui saisit un CRA ne le juge pas — ni pour le valider, ni pour le refuser : c’est la première règle de séparation des tâches.',
      '/problems/not-the-manager':
        'Le CRA d’un mois se répond — validation comme refus — par le manager de ce mois-là, pas par un autre.',

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
        'Ce CRA a déjà produit une facture pour ce client : il n’en produira pas une seconde.',
      '/problems/not-an-issued-invoice': 'Seule une facture émise peut être corrigée par un avoir.',
      '/problems/validator-cannot-issue':
        'Qui valide un CRA n’émet pas la facture qui en découle : c’est la seconde règle de séparation des tâches.',
    },

    deniedBy: 'Règle qui a refusé',
    invariant: 'Invariant violé',
    correlationId: 'Identifiant de corrélation',
    correlationHint:
      'À citer en cas de signalement : il relie cette page à la ligne de journal qui la décrit.',
    back: 'Revenir à l’accueil',
    /** O11: a concrete way out of an `ErrorState`, alongside the existing `action` link —
     * `retry` re-runs the query that failed, `copyCorrelationId` puts the id on the clipboard so
     * it can be pasted into a report without retyping it. */
    retry: 'Réessayer',
    copyCorrelationId: 'Copier l’identifiant',
    correlationIdCopied: 'Identifiant copié',
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
    /** A table's trailing action column, `sr-only`-headed: its own row action already carries a
     * visible verb (`LABELS.cra.show`, …), so the header only needs to be named for a screen reader
     * walking column headers, not repeated visibly over every row's button. */
    tableActions: 'Actions',
    /** O9 (`components/copy-link-button.tsx`): the filters already live in the URL — this copies
     * `window.location.href` verbatim, nothing serialized here. */
    copyLink: 'Copier le lien de cette vue',
    linkCopied: 'Lien copié',
    linkCopyFailed: 'Impossible de copier le lien.',
  },

  /**
   * The shell itself (frontend-plan.md Phase 4, tasks 4.2-4.4): the sidebar's collapse control,
   * the mobile `Sheet` trigger, the "à venir" placeholder every Phase 6-8 route renders until its
   * own phase builds it, the styled 404, and the invalidated-session copy.
   */
  shell: {
    collapse: 'Réduire la navigation',
    expand: 'Déployer la navigation',
    openMenu: 'Ouvrir le menu',
    closeMenu: 'Fermer le menu',
    breadcrumbHome: 'Accueil',
    /** Not "arrive dans une prochaine phase": no remaining phase of this build makes screens, and
     * the README states these three as deliberate placeholders rather than unfinished work. */
    comingSoonTitle: 'Cet écran n’est pas construit dans cette maquette',
    comingSoonBody:
      'Cette page n’est pas encore construite dans la maquette : elle existe dans la navigation pour montrer le périmètre complet, pas pour être ouverte aujourd’hui.',
    notFoundTitle: 'Page introuvable',
    notFoundBody: 'Cette adresse ne correspond à aucun écran de la maquette.',
    notFoundAction: 'Revenir à l’accueil',
    unexpectedErrorBody:
      'Une erreur inattendue a interrompu l’affichage de cette page. Revenez à l’accueil et recommencez.',
    sessionInvalidated: 'Votre persona n’est plus reconnue. Choisissez-en une à nouveau.',
  },

  /** Item 20, QA round 3: three placeholder pages under a small sidebar group, every role
   * (`ALL_ROLES` in `config/navigation.ts`) — each renders `ComingSoon`, no screen behind it yet. */
  selfService: {
    mesInformationsNav: 'Mes informations',
    mesNotesDeFraisNav: 'Mes notes de frais',
    mesAbsencesNav: 'Mes demandes d’absence',
  },

  footer: {
    mockup:
      'Maquette de démonstration. Données synthétiques, aucun client réel, aucun taux réel. Le sélecteur de persona remplace une authentification et ne doit pas être présenté comme telle.',
    source: 'Le code, les décisions (ADR) et le vocabulaire du domaine vivent dans le dépôt.',
  },
} as const;
