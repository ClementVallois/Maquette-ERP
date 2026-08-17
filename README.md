# CRA → facture : maquette d'un module d'ERP interne

> ⚠️ Coquille initialisée le 07/08/2026. Le contenu de ce README se remplit **au fil de la construction**, pas à la fin. Les sections marquées _(à écrire)_ sont volontairement vides.

## Le problème métier

Dans une société de conseil, le **compte rendu d'activité** (CRA) est le pivot : le même relevé de jours alimente le suivi d'avancement d'une mission, le staffing, et la facturation du client. Tant qu'il vit dans un tableur ou dans trois outils qui ne se parlent pas, chaque fin de mois est une ressaisie — et chaque ressaisie est une source d'écart entre ce qui a été produit et ce qui est facturé.

Cette maquette prend **une seule chaîne, de bout en bout** : un consultant saisit son CRA, son manager le valide, et cette validation **déclenche la génération d'un projet de facture en régie**.

Périmètre volontairement étroit : deux modules, et **une seule flèche qui franchit la frontière** entre eux.

## Ce que la maquette cherche à démontrer

1. **Une frontière de module réelle, et vérifiée par la CI** — pas une convention de nommage. Le module `facturation` ne peut pas importer l'intérieur du module `temps` ; il réagit à un événement publié par celui-ci. Casser la frontière doit faire **échouer la CI**, pas produire un warning.
2. **Des invariants métier tenus par le code, pas par la discipline**
   - un CRA validé est **immuable** ;
   - les montants sont des **entiers en centimes** — jamais de flottant sur une valeur monétaire ;
   - la numérotation des factures est **séquentielle et sans trou** ;
   - la TVA est arrondie **par taux** — ni par ligne, ni sur le total. C'est la règle fiscale
     française, et c'est ce que le récapitulatif obligatoire en pied de facture publie
     (**ADR-0010**). ⚠️ Les taux, seuils et mentions obligatoires retenus sont ceux connus au
     **17/08/2026** et **n'ont pas été validés par un expert-comptable** : cette maquette n'émet
     rien à un vrai client, et rien ici ne doit être repris en production sans cette validation.
3. **L'autorisation est testée**, par rôle _et_ par périmètre : un manager d'une implantation ne lit pas les marges d'une mission qui n'est pas la sienne, et c'est un test qui le prouve.
4. **Des arbitrages écrits au moment où ils sont pris** → `docs/adr/`. Chaque ADR nomme l'option écartée et le seuil auquel on changerait d'avis.

## Ce que je ne construis pas

Un ERP de cabinet de conseil contient quelques centaines de sujets. Ils ont **tous** été inventoriés
et tranchés avant d'écrire une ligne de domaine — 478 arbitrages, dont **242 écartés ou renvoyés à
l'ERP cible**. Cette section est la partie publique de ce tri : elle dit ce qui manque
**volontairement**, et pourquoi. Un sujet absent d'ici est un oubli ; un sujet listé ici est une
décision.

**Écarté, avec le seuil auquel je changerais d'avis :**

| Sujet                                                                       | Pourquoi pas ici                                                                                                                                                       | Seuil de réouverture                                                                                       |
| --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Objet `Money`, bibliothèque décimale                                        | Un `Tjm` est un nombre entier d'euros, la quantité un nombre entier de demi-journées : l'arithmétique entière est exacte et une classe autour de `+` est du cérémonial | Deuxième devise · prix unitaire à plus de deux décimales · proration (ADR-0002)                            |
| Multi-devise, remises, acomptes, proration                                  | Chacun introduit un arrondi à répartir, donc casse l'exactitude entière ci-dessus                                                                                      | Voir ADR-0002                                                                                              |
| Forfait, unité d'œuvre, abonnement, astreinte                               | Trois moteurs de facturation existent, un seul est démontré. La `InvoiceLine` porte déjà une **origine**, parce que c'est ce qui se rétrofitte le plus mal             | Première mission SOC facturée à l'heure ou à l'unité                                                       |
| Génération de PDF, Factur-X                                                 | La facture est une page HTML imprimable. Un moteur de gabarits est la première source de bugs de Dolibarr                                                              | Dépôt réel sur une plateforme agréée                                                                       |
| Read model, cache, file de jobs, outbox                                     | Deux modules, aucune requête lourde, aucun consommateur hors du processus. Postgres tient le verrou                                                                    | Le premier abonné qui fait un appel réseau (outbox) · un écran qui joint plus de trois tables (read model) |
| Redis, Kafka, RabbitMQ, Elasticsearch, Terraform, Kubernetes, microservices | Aucun n'est justifié par le besoin. **Ne pas ajouter est un choix d'architecture**, pas une lacune                                                                     | Un besoin mesuré, pas anticipé                                                                             |
| ORM (Drizzle, Prisma, Kysely, TypeORM)                                      | `FOR UPDATE`, schémas par module et types Postgres doivent être exprimables sans échappatoire, et aucun ORM ne doit pouvoir remonter dans le domaine                   | —                                                                                                          |
| Framework front (React, Vue), design system, thème sombre                   | Quatre écrans : aucun ne s'amortit. 640 combinaisons visuelles sur un outil de facturation, c'est de l'effort qui ne produit rien                                      | —                                                                                                          |
| Undo sur une facture émise                                                  | **Et c'est la démonstration** : la seule correction d'une facture émise est un avoir                                                                                   | Jamais : c'est une règle légale                                                                            |
| Notes de frais, agenda, ticketing, GED, BPMN, marketplace de modules        | À acheter, déjà en place, ou dérive de périmètre caractérisée                                                                                                          | —                                                                                                          |
| Stock, achats de biens, point de vente, fabrication                         | Sans objet pour du conseil — c'est la moitié de la surface d'Odoo et de Dolibarr qui disparaît                                                                         | —                                                                                                          |
| Mutation testing, e2e, Testcontainers, mode volumétrie                      | Le pipeline de PR doit rester court, sinon il se contourne. Ce qui part en nightly est une décision, pas un reste                                                      | Domaine stable → Stryker sur `domain/` en nightly                                                          |

**Renvoyé à l'ERP cible** (identifié, modélisé quand c'est gratuit, non construit) : facturation
électronique et plateforme agréée · comptabilité, trésorerie, FEC · congés et absences comme module ·
plan de charge et moteur de contraintes de staffing · devis, contrat-cadre, BDC, avenants ·
sous-traitance · dictionnaire d'indicateurs et TACE · reporting analytique · workflow d'approbation
générique et délégation · verrouillage optimiste et `ETag` · SCIM, PAM, recertification, SIEM ·
anti-exfiltration au-delà de la réduction de périmètre · assistant IA et OCR · reprise de
l'existant · hébergement souverain.

**Hors périmètre par construction :**

- le forfait au sens large (seule la **régie** est facturée ici) ;
- l'envoi réel des factures, la comptabilité, les règlements et les relances ;
- la gestion des utilisateurs et l'authentification en production (sélecteur de persona assumé : il
  rend l'autorisation démontrable en trois clics là où un vrai IdP la rendrait invisible).

> **« Pourquoi ne pas installer Odoo ? »** Odoo fait déjà « feuille de temps → facture en régie », et
> c'est la bonne question. La réponse n'est pas fonctionnelle : ce sont les contraintes que l'outil du
> marché ne porte pas — habilitation PASSI par portée **et par date**, règle d'indépendance
> auditeur/remédiation, confidentialité par mission, protection de l'agrégat commercial, export SIEM
> — plus le coût de build comparé à la licence, qu'il vaut mieux chiffrer soi-même avant qu'on le
> fasse. Cette maquette, elle, ne démontre pas une fonctionnalité : elle démontre une **frontière
> tenue par la CI**.

## Architecture

_(à écrire — après les ADR correspondants. Ne pas décrire une architecture qui n'est pas encore arbitrée.)_

## Stack

_(à écrire — la stack se choisit dans un ADR, elle ne se décrète pas dans un README. TypeScript / Node.js / PostgreSQL sont acquis ; le reste est ouvert.)_

## Démarrer

_(à écrire — un `docker compose up` + une commande de migration + une commande de seed, et rien d'autre à savoir.)_

## Jeu de données

_(à écrire — il doit ressembler à la réalité d'un cabinet : plusieurs pôles, plusieurs implantations, régie et forfait, un consultant en intercontrat, une habilitation qui contraint une affectation.)_

## Tests et portes de CI

Une porte qui ne bloque pas un merge est un avertissement, pas une porte. Les cinq suivantes sont
**exigées** par la protection de branche sur `main` : tant que l'une est rouge, le bouton de merge
est désactivé.

| Porte (job CI)          | Commande                                            | Ce qu'elle empêche de merger                                                                                                                                                               |
| ----------------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Module boundary**     | `pnpm run boundaries` + le test négatif             | Un import qui franchit la frontière `timesheet`/`billing`, une flèche jamais déclarée — et une règle **morte** : le test rejoue une violation délibérée et exige qu'elle soit refusée      |
| **Lint, format, types** | `lint` · `format:check` · `typecheck` · `env:check` | Du code hors des règles ESLint (dont les invariants du domaine rendus mécaniques), un formatage divergent, une erreur de type — et une variable de `compose.yml` absente de `.env.example` |
| **Secret scan**         | gitleaks sur l'historique                           | Un secret commité, y compris dans un commit ancien de la branche                                                                                                                           |
| **Dependency scan**     | `pnpm audit` + osv-scanner                          | Une dépendance portant une vulnérabilité connue de niveau haut ou critique                                                                                                                 |
| **SAST**                | Semgrep OSS                                         | Les motifs de vulnérabilité applicative détectables statiquement                                                                                                                           |

> ⚠️ **La porte `Tests` existe mais n'est volontairement pas encore exigée.** `test:cov` mesure la
> couverture du **domaine** contre un seuil de 90 %, et le domaine se réduit aujourd'hui à deux
> fichiers de constantes : le job est rouge, et le rendre vert demanderait soit d'abaisser le seuil,
> soit d'écrire un test qui ne prouve rien. Il devient exigé quand la phase 1 livre le domaine et ses
> tests. C'est écrit ici plutôt que contourné en silence — voir `docs/open-questions.md`.

Les hooks locaux (lefthook) doublent une partie de ces portes **avant** le commit et le push :
gitleaks sur ce qui est indexé — le seul des deux qui empêche réellement la fuite, la CI ne scannant
qu'une fois le secret poussé — puis `typecheck`, `boundaries` et les tests unitaires avant le push.
Les tests d'intégration en sont délibérément absents : un `git push` ne doit pas exiger Docker.
