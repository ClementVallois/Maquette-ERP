# CRA → facture : maquette d'un module d'ERP interne

> ⚠️ Coquille initialisée le 07/08/2026. Le contenu de ce README se remplit **au fil de la construction**, pas à la fin. Les sections marquées _(à écrire)_ sont volontairement vides.

## Où en est cette maquette

**Phases 1 et 2 terminées le 18/08/2026** — le plan en compte onze, numérotées 0 à 10
([`docs/BUILD-PLAN.md`](docs/BUILD-PLAN.md)). Ce qui existe aujourd'hui, en TypeScript pur et sans
base de données : le **domaine `timesheet`** — CRA, cycle de vie, calendrier ouvré, règles de
soumission, validation et événement de domaine — et le **domaine `billing`** — arithmétique
monétaire exacte, TVA résolue par territorialité, ligne de facture portant son origine, mentions
légales obligatoires, numérotation, avoir. **La chaîne franchit déjà la frontière** : `billing`
réagit à `timesheet.TimesheetValidated` et produit un projet de facture par client. **Aucun fichier
livré de `billing` — tests compris — n'importe `timesheet`**, et la règle de dépendance l'interdit :
le seul fichier du dépôt qui franchit cette frontière est la violation délibérée de
`packages/billing/src/__boundary-fixture__/`, exclue du build et du lint, qui existe pour que
`tests/boundary-rule.test.ts` prouve que la règle la rejette.

Ce qui n'existe **pas encore** : la base de données (phase 3), **l'autorisation par rôle et par
périmètre** — elle vit dans le dépôt de données, donc elle arrive avec lui en phase 3 — le jeu de
données (phase 4), l'API (phase 5), les écrans (phase 6), l'instance hébergée (phase 8).

Trois fichiers répondent aux questions qu'on se pose en arrivant :
[`CONTEXT.md`](CONTEXT.md) définit le vocabulaire métier (`Tjm`, `régie`, `intercontrat`, `avoir`,
`PASSI`…), [`docs/adr/`](docs/adr/README.md) contient les arbitrages avec l'option écartée, et
[`docs/open-questions.md`](docs/open-questions.md) dit ce qui n'est **pas** tranché.

Pour vérifier soi-même plutôt que me croire. Les versions sont **strictes** (`engine-strict` est
activé, donc la première commande échoue au lieu d'avertir) : **Node ≥ 24.13.1** — la version exacte
est dans `.nvmrc`, `nvm use` suffit — et **pnpm ≥ 11.4.0** :

```sh
pnpm install --frozen-lockfile
pnpm run check      # env, lint, frontière, format, types, tests + couverture
pnpm run boundaries # la frontière de modules seule
```

La section « Démarrer » plus bas (base de données, migrations, seed) s'écrit avec les phases qui
la rendent vraie.

## Le problème métier

Le cabinet modélisé ici est une **société de conseil en cybersécurité** — audit, SOC, GRC, IAM,
sécurité offensive — d'environ 300 consultants, répartis en 5 pôles et 4 implantations. Ce détail
n'est pas décoratif : c'est lui qui porte les contraintes que l'argumentaire de fin de page oppose
à un ERP du marché (habilitation PASSI, indépendance auditeur/remédiation, export SIEM).

Dans une société de conseil, le **compte rendu d'activité** (CRA) est le pivot : le même relevé de jours alimente le suivi d'avancement d'une mission, le staffing, et la facturation du client. Tant qu'il vit dans un tableur ou dans trois outils qui ne se parlent pas, chaque fin de mois est une ressaisie — et chaque ressaisie est une source d'écart entre ce qui a été produit et ce qui est facturé.

Cette maquette prend **une seule chaîne, de bout en bout** : un consultant saisit son CRA, son manager le valide, et cette validation **déclenche la génération des projets de facture en régie** — au pluriel, parce qu'un mois se travaille sur plusieurs missions et que deux missions peuvent être vendues à deux clients différents. Une facture s'adresse à un client et tire sa TVA de la territorialité de celui-ci ; il n'existe donc pas de facture pour deux clients (**ADR-0038**).

Périmètre volontairement étroit : deux modules, et **une seule flèche qui franchit la frontière** entre eux.

## Ce que la maquette cherche à démontrer

1. **Une frontière de module réelle, et vérifiée par la CI** — pas une convention de nommage. Le module de facturation (`packages/billing`) ne peut pas importer l'intérieur du module de saisie des temps (`packages/timesheet`) ; il réagit à un événement publié par celui-ci, dont le contrat vit dans un noyau partagé (`packages/platform`). Casser la frontière doit faire **échouer la CI**, pas produire un warning. Où le vérifier sans me
   croire : la règle est dans [`.dependency-cruiser.cjs`](.dependency-cruiser.cjs) — dont la liste
   `allowed` est ce qui fait échouer aussi une flèche que personne n'a pensé à interdire — et
   [`tests/boundary-rule.test.ts`](tests/boundary-rule.test.ts) prouve, sur des fichiers de violation
   délibérée, qu'elle **rejette**. La CI lance les deux, dans deux étapes séparées.
2. **Des invariants métier tenus par le code, pas par la discipline**
   - un CRA validé est **immuable** ;
   - les montants sont des **entiers en centimes** — jamais de flottant sur une valeur monétaire ;
   - la numérotation des factures est **séquentielle et sans trou** — ⚠️ à ce stade, seule la
     **forme** de la série existe (ADR-0018) ; l'allocation qui la rend réellement sans trou sous
     concurrence est un verrou de ligne dans la transaction d'émission, et c'est **ADR-0007, en
     phase 3** ;
   - la TVA est arrondie **par taux** — ni par ligne, ni sur le total. C'est la règle fiscale
     française, et c'est ce que le récapitulatif obligatoire en pied de facture publie
     (**ADR-0010**). ⚠️ Les taux, seuils et mentions obligatoires retenus sont ceux connus au
     **17/08/2026** et **n'ont pas été validés par un expert-comptable** : cette maquette n'émet
     rien à un vrai client, et rien ici ne doit être repris en production sans cette validation.
3. **L'autorisation sera testée**, par rôle _et_ par périmètre : un manager d'une implantation ne doit pas lire la marge d'une mission qui n'est pas la sienne. ⚠️ **Ce n'est pas encore construit** : l'autorisation vit dans le dépôt de données (ADR-0003), et il n'y a pas encore de dépôt de données — c'est la **phase 3**. Cette ligne est la seule de cette section qui décrive une intention plutôt que du code, et elle le dit.
4. **Des arbitrages écrits au moment où ils sont pris** → `docs/adr/`. Chaque ADR nomme l'option écartée et le seuil auquel on changerait d'avis.

## Ce que je ne construis pas

Un ERP de cabinet de conseil contient quelques centaines de sujets. Ils ont **tous** été inventoriés
et tranchés avant d'écrire une ligne de domaine — 478 arbitrages, dont **242 écartés ou renvoyés à
l'ERP cible**. Cette section est la partie publique de ce tri : elle dit ce qui manque
**volontairement**, et pourquoi. Un sujet absent d'ici est un oubli ; un sujet listé ici est une
décision.

**Écarté, avec le seuil auquel je changerais d'avis :**

| Sujet                                                                       | Pourquoi pas ici                                                                                                                                                                                                                      | Seuil de réouverture                                                                                       |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Objet `Money`, bibliothèque décimale                                        | Un `Tjm` est un nombre entier d'euros, la quantité un nombre entier de demi-journées : l'arithmétique entière est exacte et une classe autour de `+` est du cérémonial                                                                | Deuxième devise · prix unitaire à plus de deux décimales · proration (ADR-0002)                            |
| Multi-devise, remises, acomptes, proration                                  | Chacun introduit un arrondi à répartir, donc casse l'exactitude entière ci-dessus                                                                                                                                                     | Voir ADR-0002                                                                                              |
| Forfait, unité d'œuvre, abonnement, astreinte                               | Trois moteurs de facturation existent, un seul est démontré. La `InvoiceLine` porte déjà une **origine**, parce que c'est ce qui se rétrofitte le plus mal                                                                            | Première mission SOC facturée à l'heure ou à l'unité                                                       |
| Génération de PDF, Factur-X                                                 | La facture est une page HTML imprimable. Un moteur de gabarits est la première source de bugs de Dolibarr                                                                                                                             | Dépôt réel sur une plateforme agréée                                                                       |
| Read model, cache, file de jobs, outbox                                     | Deux modules, aucune requête lourde, aucun consommateur hors du processus. Postgres tient le verrou                                                                                                                                   | Le premier abonné qui fait un appel réseau (outbox) · un écran qui joint plus de trois tables (read model) |
| Redis, Kafka, RabbitMQ, Elasticsearch, Terraform, Kubernetes, microservices | Aucun n'est justifié par le besoin. **Ne pas ajouter est un choix d'architecture**, pas une lacune                                                                                                                                    | Un besoin mesuré, pas anticipé                                                                             |
| ORM (Drizzle, Prisma, Kysely, TypeORM)                                      | `FOR UPDATE`, schémas par module et types Postgres doivent être exprimables sans échappatoire, et aucun ORM ne doit pouvoir remonter dans le domaine                                                                                  | —                                                                                                          |
| Framework front (React, Vue), design system, thème sombre                   | Quatre écrans : aucun ne s'amortit. 640 combinaisons visuelles sur un outil de facturation, c'est de l'effort qui ne produit rien                                                                                                     | —                                                                                                          |
| Avoir partiel                                                               | Une réduction partielle d'une facture émise est arithmétiquement indiscernable d'une remise, et la remise réintroduit un montant à répartir avant arrondi — donc casse l'exactitude entière. Seule l'annulation totale est construite | Voir ADR-0002 et ADR-0036                                                                                  |
| Client hors Union européenne                                                | Quatre territorialités sont modélisées (métropole, DOM avec TVA, DOM hors champ, UE), parce que chacune porte une mention obligatoire différente. Un client suisse ou britannique en porterait une cinquième, non vérifiée ici        | Première mission vendue hors UE                                                                            |
| Undo sur une facture émise                                                  | **Et c'est la démonstration** : la seule correction d'une facture émise est un avoir                                                                                                                                                  | Jamais : c'est une règle légale                                                                            |
| Notes de frais, agenda, ticketing, GED, BPMN, marketplace de modules        | À acheter, déjà en place, ou dérive de périmètre caractérisée                                                                                                                                                                         | —                                                                                                          |
| Stock, achats de biens, point de vente, fabrication                         | Sans objet pour du conseil — c'est la moitié de la surface d'Odoo et de Dolibarr qui disparaît                                                                                                                                        | —                                                                                                          |
| Mutation testing, e2e, Testcontainers, mode volumétrie                      | Le pipeline de PR doit rester court, sinon il se contourne. Ce qui part en nightly est une décision, pas un reste                                                                                                                     | Domaine stable → Stryker sur `domain/` en nightly                                                          |

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

Une porte qui ne bloque pas un merge est un avertissement, pas une porte. Les six suivantes tournent
sur chaque push ; **cinq sont exigées** par la protection de branche sur `main` — tant que l'une est
rouge, le bouton de merge est désactivé. La sixième, `Tests`, est verte depuis la phase 1 et il
reste à la cocher : voir la note sous le tableau.

| Porte (job CI)          | Commande                                            | Ce qu'elle empêche de merger                                                                                                                                                               |
| ----------------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Module boundary**     | `pnpm run boundaries` + le test négatif             | Un import qui franchit la frontière `timesheet`/`billing`, une flèche jamais déclarée — et une règle **morte** : le test rejoue une violation délibérée et exige qu'elle soit refusée      |
| **Lint, format, types** | `lint` · `format:check` · `typecheck` · `env:check` | Du code hors des règles ESLint (dont les invariants du domaine rendus mécaniques), un formatage divergent, une erreur de type — et une variable de `compose.yml` absente de `.env.example` |
| **Secret scan**         | gitleaks sur l'historique                           | Un secret commité, y compris dans un commit ancien de la branche                                                                                                                           |
| **Dependency scan**     | `pnpm audit` + osv-scanner                          | Une dépendance portant une vulnérabilité connue de niveau haut ou critique                                                                                                                 |
| **SAST**                | Semgrep OSS                                         | Les motifs de vulnérabilité applicative détectables statiquement                                                                                                                           |
| **Tests**               | `pnpm run test:cov`                                 | Un invariant du domaine cassé, et une couverture du **domaine** sous 90 % (branches : 85 %) — le seuil ne porte que sur `domain/` et sur le noyau partagé, pas sur le dépôt entier         |

> ✅ **La porte `Tests` est verte depuis la phase 1** (18/08/2026), et pas encore exigée.
> Elle était rouge depuis l'ajout des seuils de couverture, faute de domaine à mesurer : la rendre
> vert plus tôt aurait demandé soit d'abaisser le seuil, soit d'écrire un test qui ne prouve rien.
> La phase 1 livre le domaine `timesheet` et ses tests — 99 % des lignes, 100 % des branches — et
> la porte devient une contrainte réelle. ⚠️ **Étape humaine restante** : l'ajouter à la liste des
> _required checks_ dans la protection de branche GitHub, comme les cinq autres (même geste que la
> tâche 0.5). Historique → `docs/open-questions.md`.

Les hooks locaux (lefthook) doublent une partie de ces portes **avant** le commit et le push. ⚠️ Ils
ne s'installent pas tout seuls : `ignore-scripts` est activé, donc un clone frais n'en a aucun tant
qu'on n'a pas lancé `pnpm exec lefthook install`. Ce qu'ils font :
gitleaks sur ce qui est indexé — le seul des deux qui empêche réellement la fuite, la CI ne scannant
qu'une fois le secret poussé — puis `typecheck`, `boundaries` et `test:cov` (les tests unitaires
**avec le seuil de couverture**, délibérément : une porte qui passe sur une couverture qui s'effondre
n'est pas une porte) avant le push.
Les tests d'intégration en sont délibérément absents : un `git push` ne doit pas exiger Docker.
