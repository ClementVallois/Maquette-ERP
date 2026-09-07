/** French copy for the printable documents, their shell, and HTML problem pages. */
export const LABELS = {
  appName: 'Maquette ERP',

  nav: {
    skipToContent: 'Aller au contenu',
  },

  persona: {
    change: 'Changer de persona',
    none: 'Aucun persona sélectionné',
  },

  roles: {
    consultant: 'Consultant',
    manager: 'Manager',
    billing: 'Facturation',
  },

  cra: {
    nav: 'Mes CRA',
    nothing: '—',
    absence: 'Absence',
    nonWorkable: {
      weekend: 'Week-end',
      publicHoliday: 'Férié',
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
    flaggedNote:
      'Jours saisis alors que le calendrier ne les dit pas ouvrés. Ils ne sont pas refusés : le manager les a acceptés en validant.',
    signature: 'Bon pour accord',
    signatureNote:
      'Ce relevé couvre le mois entier du consultant, missions confondues. Le nom du signataire n’est pas pré-imprimé : il dépend du destinataire, pas du relevé.',
    signatureName: 'Nom et qualité',
    signatureDate: 'Date',
    signatureMark: 'Signature',
    nothingRecorded: 'Aucun jour saisi sur ce mois.',
  },

  preFacturier: {
    nav: 'Pré-facturier',
  },

  invoice: {
    heading: 'Facture',
    draftHeading: 'Facture en brouillon',
    draftNotice:
      'Ce document n’est pas une facture : il n’a ni numéro ni date d’émission. Il est produit à partir d’un CRA validé, donc déjà figé — mais son statut et ses montants restent provisoires tant qu’il n’est pas émis. Il devient une facture à l’émission, et plus rien ne bouge ensuite.',
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
    unitPrice: 'Prix unitaire (jour)',
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
    notCharged: 'Non soumis à TVA',
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
     * What each refusal says, in French, keyed by its `type`. The page never renders
     * `ProblemDetails.title`: that field is the API's, it is English by BUILD-RULES, and it is
     * right where it lives. A type missing from here falls back to the heading for its status —
     * never to the English title, which is the defect this table removes.
     *
     * `problem.test.ts` asserts this table covers every `problemType` declared under `packages/`
     * plus every `API_PROBLEM_TYPES` value, so a refusal added later is found the day it is
     * written.
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

      // @erp/platform
      '/problems/invalid-value': 'Cette valeur n’est pas acceptable.',
      '/problems/out-of-scope':
        'Cet enregistrement existe et il est hors de votre périmètre : votre rôle et votre implantation ne le couvrent pas.',

      // @erp/timesheet
      '/problems/unknown-calendar-year':
        'Le calendrier ouvré ne couvre pas cette année : les jours fériés ne sont pas connus.',
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
  },

  footer: {
    mockup:
      'Maquette de démonstration. Données synthétiques, aucun client réel, aucun taux réel. Le sélecteur de persona remplace une authentification et ne doit pas être présenté comme telle.',
    source: 'Le code, les décisions (ADR) et le vocabulaire du domaine vivent dans le dépôt.',
  },
} as const;
