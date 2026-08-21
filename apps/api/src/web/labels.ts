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

  footer: {
    mockup:
      'Maquette de démonstration. Données synthétiques, aucun client réel, aucun taux réel. Le sélecteur de persona remplace une authentification et ne doit pas être présenté comme telle.',
    source: 'Le code, les décisions (ADR) et le vocabulaire du domaine vivent dans le dépôt.',
  },
} as const;
