/**
 * Every string a visitor reads, in one file (ADR-0026).
 *
 * The point is not translation — there is one language and there will be one. It is **review**: a
 * screen's wording is the part of it a non-developer can judge, and wording scattered across
 * fifteen template functions cannot be read as a whole. Here it can, and a term that contradicts
 * `CONTEXT.md` is visible next to the one that does not.
 *
 * The keys are English because they are code; the values are French because they are the screen.
 * That split is the whole of ADR-0026.
 *
 * The apostrophes are typographic (`’`, U+2019), and not out of fussiness: a straight `'` is one of
 * the five characters the renderer escapes, so it reaches the page as `&#39;` — correct, and ugly
 * in the one file whose job is to be read.
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
  },

  roles: {
    consultant: 'Consultant',
    manager: 'Manager',
    billing: 'Facturation',
  },

  cra: {
    heading: 'Mon CRA',
    listHeading: 'Mes CRA',
    nav: 'Mes CRA',
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
    revealTitle: 'Ouvrir le CJM, le TJM et la marge — cet accès est journalisé',
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
    deniedBy: 'Règle qui a refusé',
    invariant: 'Invariant violé',
    correlationId: 'Identifiant de corrélation',
    correlationHint:
      'À citer en cas de signalement : il relie cette page à la ligne de journal qui la décrit.',
    back: 'Revenir à l’accueil',
  },

  action: {
    continue: 'Continuer',
  },

  footer: {
    mockup:
      'Maquette de démonstration. Données synthétiques, aucun client réel, aucun taux réel. Le sélecteur de persona remplace une authentification et ne doit pas être présenté comme telle.',
    source: 'Le code, les décisions (ADR) et le vocabulaire du domaine vivent dans le dépôt.',
  },
} as const;
