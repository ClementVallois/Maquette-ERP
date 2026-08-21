# CRA → facture : maquette d'un module d'ERP interne

> ⚠️ Coquille initialisée le 07/08/2026. Ce README se remplit **au fil de la construction**, pas à
> la fin : une section décrit ce qui existe le jour où elle est écrite, et une section absente est
> une chose non construite. Les chiffres portent leur date ou la commande qui les recompte — un
> nombre écrit une fois est faux quelques commits plus tard, et ce README en a porté quatre.

## Où en est cette maquette

**Phases 1 à 5 terminées** — le plan en compte onze, numérotées 0 à 10
([`docs/BUILD-PLAN.md`](docs/BUILD-PLAN.md)). Les phases 1 à 3 datent du 19/08/2026, la 4 et la 5
du 21/08/2026.

Les **domaines**, en TypeScript pur et sans base de données : `timesheet` — CRA, cycle de vie,
calendrier ouvré, règles de soumission, validation et événement de domaine — et `billing` —
arithmétique monétaire exacte, TVA résolue par territorialité, ligne de facture portant son origine,
mentions légales obligatoires, numérotation, avoir.

La **persistance**, depuis la phase 3 : des migrations SQL numérotées (`ls migrations/`) et un
runner rejouable, un schéma PostgreSQL par module, les dépôts `PgCraRepository` et
`PgInvoiceRepository`, la numérotation sans trou sous un verrou de ligne (ADR-0007), les événements
de domaine écrits **dans la même transaction** que ce qui les émet (ADR-0020), et le traitement d'un
CRA rendu idempotent (ADR-0021).

Le **jeu de données**, depuis la phase 4 : un seed déterministe qui pilote les agrégats du domaine
au lieu d'écrire des lignes en dur (ADR-0022) — section « Jeu de données » plus bas.

L'**API**, depuis la phase 5 : `/api/v1` sur Fastify, un sélecteur de persona à la place d'une
authentification (ADR-0023), et la chaîne complète CRA → facture en une transaction. Comment la
lancer : section « Démarrer » plus bas.

Les compteurs de tests se recomptent plutôt qu'ils ne se croient : `pnpm run test` pour les tests
unitaires, `pnpm run test:int` pour ceux qui tournent contre un vrai PostgreSQL. Au **21/08/2026**,
395 et 93.

**La chaîne franchit déjà la frontière** : `billing` réagit à `timesheet.TimesheetValidated` et
produit un projet de facture par client. **Aucun fichier livré de `billing` — tests compris —
n'importe `timesheet`**, et la règle de dépendance l'interdit.

Un ensemble de fichiers du dépôt franchit **délibérément** une frontière, tous exclus du build et du
lint, tous là pour que [`tests/boundary-rule.test.ts`](tests/boundary-rule.test.ts) prouve que la
règle les rejette. Pour les compter :
`find . -path ./node_modules -prune -o -path '*__boundary-fixture__*' -name '*.ts' -print`. Deux
méritent d'être nommés : `packages/billing/src/__boundary-fixture__/` viole la frontière `billing`
→ `timesheet` nommément, et `packages/__boundary-fixture__/undeclared-module/` est un module
qu'aucune règle ne mentionne — il prouve que la liste `allowed` **refuse par défaut**, ce qui est la
moitié la plus facile à perdre.

Ce qui n'existe **pas encore** : les écrans (phase 6), le durcissement de la CI (phase 7),
l'instance hébergée (phase 8). Il n'y a donc **aucune interface web** : tout se voit en HTTP, et la
section « Démarrer » dit comment.

Quatre fichiers répondent aux questions qu'on se pose en arrivant.
[`CONTEXT.md`](CONTEXT.md) définit le vocabulaire — métier (`Tjm`, `régie`, `intercontrat`, `avoir`,
`PASSI`…) et technique (`Persona`, `Role`, `Actor`) ; [`docs/adr/`](docs/adr/README.md) contient les
arbitrages avec, pour chacun, l'option écartée et le seuil de réouverture ;
[`docs/BUILD-RULES.md`](docs/BUILD-RULES.md) est la forme vérifiable de ces arbitrages — ce qu'on a
le droit d'écrire dans ce dépôt et ce qu'on n'a pas le droit d'y écrire ; et
[`docs/open-questions.md`](docs/open-questions.md) dit ce qui n'est **pas** tranché, avec la phase
qui le tranchera.

⚠️ Ces quatre fichiers sont **en anglais**, ce README seul est en français. C'est délibéré et la
règle est dans `CLAUDE.md` : le code, les commits et les arbitrages en anglais, le README dans la
langue du lecteur qui ouvre ce dépôt sans brief.

Pour vérifier soi-même plutôt que me croire. Les versions sont **strictes** (`engine-strict` est
activé, donc la première commande échoue au lieu d'avertir) : **Node ≥ 24.13.1** — la version exacte
est dans `.nvmrc`, `nvm use` suffit — et **pnpm ≥ 11.4.0** :

```sh
pnpm install --frozen-lockfile
pnpm run env:init   # crée .env depuis .env.example — .env est gitignoré, un clone frais n'en a pas
pnpm run check      # env, lint, frontière, format, types, tests + couverture
pnpm run boundaries # la frontière de modules seule
```

`env:init` n'est pas optionnel sur un clone frais : `check` commence par vérifier `.env` et
s'arrête s'il n'existe pas. Aucune de ces trois commandes ne demande Docker. Pour la base de
données et les tests d'intégration, voir « Démarrer » plus bas.

## Le problème métier

Le cabinet modélisé ici est une **société de conseil en cybersécurité** — audit, SOC, GRC, IAM,
sécurité offensive — d'environ 300 consultants, répartis en 5 pôles et 4 implantations. Ce détail
n'est pas décoratif : c'est lui qui porte les contraintes que l'argumentaire de fin de page oppose
à un ERP du marché (habilitation PASSI, indépendance auditeur/remédiation, export SIEM).

Dans une société de conseil, le **compte rendu d'activité** (CRA) est le pivot : le même relevé de jours alimente le suivi d'avancement d'une mission, le staffing, et la facturation du client. Tant qu'il vit dans un tableur ou dans trois outils qui ne se parlent pas, chaque fin de mois est une ressaisie — et chaque ressaisie est une source d'écart entre ce qui a été produit et ce qui est facturé.

Cette maquette prend **une seule chaîne, de bout en bout** : un consultant saisit son CRA, son manager le valide, et cette validation **déclenche la génération des projets de facture en régie** — au pluriel, parce qu'un mois se travaille sur plusieurs missions et que deux missions peuvent être vendues à deux clients différents. Une facture s'adresse à un client et tire sa TVA de la territorialité de celui-ci ; il n'existe donc pas de facture pour deux clients (**ADR-0038**).

Périmètre volontairement étroit : deux modules, et **une seule flèche qui franchit la frontière** entre eux.

## Ce que la maquette cherche à démontrer

1. **Une frontière de module réelle, et vérifiée par la CI** — pas une convention de nommage. Le module de facturation (`packages/billing`) ne peut pas importer l'intérieur du module de saisie des temps (`packages/timesheet`) ; il réagit à un événement publié par celui-ci, dont le contrat vit dans un noyau partagé (`packages/platform`). Casser la frontière fait **échouer le job**, pas produire un warning. Où le vérifier sans me
   croire : la règle est dans [`.dependency-cruiser.cjs`](.dependency-cruiser.cjs) — dont la liste
   `allowed` est ce qui fait échouer aussi une flèche que personne n'a pensé à interdire — et
   [`tests/boundary-rule.test.ts`](tests/boundary-rule.test.ts) prouve, sur des fichiers de violation
   délibérée, qu'elle **rejette**. La CI lance les deux, dans deux étapes séparées.
   ⚠️ « Échouer » veut dire que le job passe au rouge, **pas** que le bouton de merge se verrouille :
   la protection de branche GitHub n'est pas disponible sur ce plan, aucune porte n'est donc
   exigée sur `main`, et c'est écrit ici plutôt que 110 lignes plus bas
   (**[ADR-0040](docs/adr/0040-ci-gates-are-advisory-while-the-repository-is-private.md)**, et la
   section « Tests et portes de CI » y revient en détail).
2. **Des invariants métier tenus par le code, pas par la discipline**
   - un CRA validé est **immuable** ;
   - les montants sont des **entiers en centimes** — jamais de flottant sur une valeur monétaire ;
   - la numérotation des factures est **séquentielle et sans trou** — construit en phase 3
     (**ADR-0007**) : la forme de la série vient d'ADR-0018, et l'allocation est un `SELECT … FOR
UPDATE` sur la ligne de compteur, dans la transaction d'émission. Jamais une `SEQUENCE`
     PostgreSQL : `nextval` n'est pas transactionnel, donc un rollback laisse un trou. Un test
     lance deux émissions concurrentes et exige zéro trou et zéro doublon ;
   - la TVA est arrondie **par taux** — ni par ligne, ni sur le total. C'est la règle fiscale
     française, et c'est ce que le récapitulatif obligatoire en pied de facture publie
     (**ADR-0010**). ⚠️ Les taux, seuils et mentions obligatoires retenus sont ceux connus au
     **17/08/2026** et **n'ont pas été validés par un expert-comptable** : cette maquette n'émet
     rien à un vrai client, et rien ici ne doit être repris en production sans cette validation.
3. **L'autorisation est construite et testée par rôle _et_ par périmètre.** Le filtrage vit dans le dépôt de données (**ADR-0003**), au seul endroit par où les données entrent, et la règle est écrite **une fois** dans le noyau partagé (`readScope`) parce que les deux modules l'appliquent. Trois rôles — `consultant`, `manager`, `billing` (**ADR-0023**) — croisés avec l'implantation : un consultant ne voit que ses propres mois, un manager ceux de son implantation, personne d'autre qu'un manager ne voit une marge. La démonstration a **les deux temps** que l'ADR-0003 exige, et elle se rejoue en trois requêtes (section « Démarrer ») : la même URL répond `200` sous `manager-paris` et **`403` sous `manager-lyon`, en nommant la règle qui a refusé** (`deniedBy`), et un enregistrement qui n'existe pas répond `404` — trois faits différents, trois réponses différentes. `manager-paris` et `manager-lyon` sont deux **personas** : des identités sélectionnables au lieu d'une authentification, chacune un rôle exercé dans une implantation (`Persona` et `Role` dans [`CONTEXT.md`](CONTEXT.md), 🇬🇧). Deux d'entre elles partagent le rôle `manager` dans deux implantations différentes, et c'est précisément ce qui rend le refus reproductible en trois clics au lieu d'être affirmé. Le 403 ne publie **rien** de ce qu'il cache (**ADR-0042**), et un test l'assure. `Cjm`, `Tjm` et marge n'apparaissent dans aucune projection de liste : ils ne sont servis que par une **lecture unitaire dédiée dont chaque accès est journalisé** — acteur, rôle, cible, et le **nom** des champs lus, jamais leur valeur (**ADR-0043**, **ADR-0024**). La pagination est plafonnée dans la route _et_ dans le dépôt.

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

Cinq paquets, et **une seule flèche** entre les deux modules métier.

```
packages/timesheet ──┐
                     ├──▶ packages/platform   (noyau partagé : vocabulaire transporté,
packages/billing  ───┘                         contrat d'événement, portée d'autorisation)
packages/contracts                            (ce qui circule sur le fil : problem+json)
apps/api                                      (racine de composition : compose les modules,
                                               n'est importé par aucun)
```

- **`timesheet`** et **`billing`** sont **scellés** (**ADR-0001**). `billing` n'importe rien de
  `timesheet` : il réagit à `timesheet.TimesheetValidated`, dont le contrat vit dans
  `platform`. Toute autre flèche entre les deux est un bug, pas un raccourci.
- **`platform`** est le noyau partagé (**ADR-0033**) : ce que les deux modules doivent nommer de la
  même façon parce que ça circule entre eux — l'événement, `Actor`, la matrice de portée
  (`readScope`), les dates civiles, les erreurs typées. Il ne contient aucune règle propre à un
  module.
- **`contracts`** tient ce qui est publié sur le fil et rien d'autre : la forme RFC 9457
  `problem+json` et les identifiants de problème que l'API possède. Il est séparé de `platform`
  parce qu'un client HTTP en a besoin et n'a aucune raison de connaître le domaine.
- **`apps/api`** est la **racine de composition** (**ADR-0015**) : elle instancie les dépôts,
  ouvre la transaction, branche l'abonné sur l'émetteur. Un module ne l'importe jamais — la règle
  de dépendance nomme la flèche inverse pour que son échec se lise bien.
- Par module : `domain` → `application` → `infrastructure`, dépendances vers l'intérieur
  uniquement. Le `domain` n'importe **rien** d'externe, pas même un builtin Node : il se teste sans
  base de données.

Ce n'est pas une flèche décorative : elle est vérifiée mécaniquement à chaque `pnpm run boundaries`,
et le test négatif prouve qu'elle **refuse**.

## Stack

Chaque ligne vient d'un arbitrage écrit, avec l'option écartée et le seuil de réouverture.

| Choix                                                   | ADR      | Option écartée                                                                   |
| ------------------------------------------------------- | -------- | -------------------------------------------------------------------------------- |
| **TypeScript** strict, **Node.js** ≥ 24.13.1            | —        | —                                                                                |
| **Fastify**                                             | ADR-0008 | NestJS — un conteneur d'injection et des décorateurs pour une douzaine de routes |
| **HTML rendu serveur**, aucun framework front           | ADR-0009 | React/Vue et une étape de build front pour quatre écrans                         |
| **PostgreSQL 18**, SQL écrit à la main                  | ADR-0011 | Un ORM — `FOR UPDATE` et les schémas par module doivent rester lisibles          |
| Migrations : fichiers `.sql` numérotés + runner         | ADR-0011 | Un outil de migration tiers                                                      |
| **Montants en centimes entiers**                        | ADR-0002 | Un objet `Money`, une bibliothèque décimale                                      |
| **Zod** aux frontières, et nulle part ailleurs          | ADR-0042 | Une validation qui redescend dans le domaine                                     |
| **Vitest** · **pino** · **pnpm** workspaces             | —        | —                                                                                |
| **Sélecteur de persona** au lieu d'une authentification | ADR-0023 | Un vrai IdP, qui rendrait l'autorisation invisible en démonstration              |

**Absents, et c'est un choix** : Redis, Kafka, RabbitMQ, Elasticsearch, Terraform, Kubernetes,
microservices, tout ORM, toute bibliothèque décimale, toute file de jobs, React, Vue, génération de
PDF, OpenTelemetry, Testcontainers. La section « Ce que je ne construis pas » donne le seuil de
chacun.

## Démarrer

Une commande, qui fait les cinq étapes : `.env`, sa vérification, PostgreSQL, les migrations, le
seed.

```sh
pnpm install --frozen-lockfile
pnpm run setup      # env:init + env:check + docker compose + migrate + seed
pnpm run api        # l'API sur http://127.0.0.1:3000
```

`pnpm run db:reset` rejoue les trois dernières étapes depuis une base vide. Les étapes séparément,
si l'une échoue :

```sh
pnpm run db:up      # PostgreSQL 18 via docker compose, attend qu'il soit healthy
pnpm run migrate    # applique les migrations en attente, rejouable sans effet
pnpm run seed       # le jeu de données déterministe (ADR-0022)
pnpm run test:int   # les tests d'intégration contre ce PostgreSQL
```

`pnpm run db:up` crée deux rôles distincts : `erp_migration` possède le schéma et l'applique,
`erp_app` s'y connecte avec les seuls droits `SELECT/INSERT/UPDATE/DELETE`. Les tests d'intégration
utilisent `erp_app` — un test qui passerait en propriétaire du schéma ne prouverait rien sur ce que
l'application aura le droit de faire.

Sans base de données, `pnpm run check` reste complet et vert : seuls les tests d'intégration
demandent Docker.

### Voir la chaîne, et voir l'autorisation refuser

Il n'y a **pas encore d'écrans** — ils arrivent en phase 6. Tout se voit en HTTP, sur
`http://127.0.0.1:3000`.

⚠️ **`127.0.0.1` et non `localhost`.** Ce sont la même machine et **deux origines différentes** :
une requête d'écriture venue d'une autre origine que `API_PUBLIC_ORIGIN` est refusée
`403 /problems/forbidden-origin`, ce qui est la posture CSRF assumée (ADR-0023). Les deux valeurs
doivent coïncider dans `.env`, et l'API imprime au démarrage l'origine à ouvrir.

Une identité s'acquiert en choisissant une **persona** — il n'y a pas de mot de passe, c'est le
sujet même d'ADR-0023, et c'est annoncé plutôt que caché.

```sh
# Les personas offertes par cette instance
curl -s http://127.0.0.1:3000/api/v1/personas

# En choisir une : le cookie signé revient dans la réponse
curl -s -c jar.txt -X POST http://127.0.0.1:3000/api/v1/session/persona \
  -H 'Origin: http://127.0.0.1:3000' -H 'Content-Type: application/json' \
  -d '{"key":"manager-paris"}'

# Le mois d'un consultant de son implantation : 200
curl -s -b jar.txt http://127.0.0.1:3000/api/v1/cras
```

Les **deux temps de la démonstration d'ADR-0003**, sur la **même** URL — prenez l'`id` d'un CRA
renvoyé ci-dessus :

```sh
# 1. manager-paris le lit                       → 200
# 2. la même URL sous manager-lyon              → 403, avec "deniedBy" qui nomme la règle
# 3. un id qui n'existe pas, sous manager-paris → 404
```

Trois faits différents, trois réponses différentes — et le `403` ne publie **rien** de ce qu'il
cache. Puis la chaîne elle-même : `POST /api/v1/cras/{id}/validation` valide le mois et fait
apparaître les projets de facture **dans la même transaction**, et
`POST /api/v1/invoices/{id}/issuance` — avec un en-tête `Idempotency-Key`, obligatoire parce que
c'est la seule route qui consomme un numéro d'une série sans trou — émet le document.

Les routes complètes sont dans [`apps/api/src/routes/`](apps/api/src/routes/), et chacune **déclare
les rôles qui la portent** au lieu de les comparer dans son corps.

## Jeu de données

`pnpm run seed` remplit une base qui ressemble à un cabinet plutôt qu'à une table de test : cinq
pôles, quatre implantations (Paris, Lyon, Rennes, Bordeaux), des missions en **régie** et au
**forfait** — seule la régie est facturée —, un consultant en **intercontrat**, et une
**habilitation PASSI** portée par un auditeur et exigée par une mission qualifiée.

Deux propriétés en font un livrable et pas un script de confort (**ADR-0022**) :

- **Il pilote les agrégats du domaine.** Chaque CRA passe les vraies règles de soumission, chaque
  facture est produite par `draftInvoicesFrom`. Un invariant resserré casse ici avant de casser
  chez un utilisateur — et le seed a déjà servi à ça.
- **Il est déterministe.** Mêmes entrées, mêmes identifiants, à chaque exécution : les
  identifiants sont des UUIDv7 dérivés d'un instant figé et d'un compteur (**ADR-0041**), ce qui
  permet à un ADR ou à une capture d'écran de citer un id. La CI le vérifie plutôt que de
  l'affirmer : elle relance le seed et **compare l'empreinte des deux passes**
  (`pnpm run seed:fingerprint`) — un hash de contenu et un compte de lignes par table. Une passe
  non idempotente déplace un compte, une passe non déterministe déplace tous les identifiants.

Le mois d'Alice est **volontairement irrégulier** : une journée partagée entre ses deux missions
(une demi-journée sur chacune), une journée d'absence, et un **samedi travaillé donc signalé**. Ce
n'est pas de la décoration — la journée partagée est la raison structurelle pour laquelle la mission
est portée par la _ligne_ et non par le _jour_, et le jeu de données ne l'exerçait pas jusqu'à la
phase 6. Les deux missions d'Alice étant vendues au **même client**, la journée partagée produit une
seconde _ligne_ sur une facture, pas une seconde facture (ADR-0038).

Ce que juin 2026 ne peut pas montrer : un **jour férié** signalé. Il n'y en a aucun ce mois-là
(ADR-0004 place l'Ascension au 14/05 et la Pentecôte au 25/05) ; c'est le calendrier, pas un oubli.

## Tests et portes de CI

Une porte qui ne bloque pas un merge est un avertissement, pas une porte. Le mot « avertissement »
sert ici deux fois, pour deux choses différentes, et il vaut mieux les séparer tout de suite :

1. **Une règle qui reste verte sur une violation** — le `warn` de dependency-cruiser au lieu de son
   `error`. C'est le sens du mot en tête de ce README (« casser la frontière fait échouer le job,
   pas produire un warning »), et **ce piège-là est fermé** : les neuf jobs ci-dessous
   échouent réellement, et `tests/boundary-rule.test.ts` le prouve sur des violations délibérées.
2. **Une porte qui échoue sans rien empêcher.** C'est le sens de la phrase d'ouverture, et
   **c'est l'état actuel des neuf** — écrit ici plutôt que sous-entendu.

Elles tournent sur chaque push et sur chaque pull request, et elles passent au rouge. Mais la seule
chose capable de désactiver le bouton de merge — la _protection de branche_ GitHub — exige un compte
**Pro** ou un dépôt **public** ; celui-ci est privé sur le plan gratuit. **Aucun check n'est donc
exigé sur `main`** : la règle « rien ne merge en rouge » est tenue par l'auteur, pas par la
plateforme. Ce README a affirmé le contraire — « cinq sont exigées » — depuis la phase 0, et
c'était faux : la bascule n'était pas en attente, elle était indisponible. Décision, option écartée
et seuil → **[ADR-0040](docs/adr/0040-ci-gates-are-advisory-while-the-repository-is-private.md)**.
La bascule est gratuite le jour où le dépôt devient public, et coûte alors une case à cocher par
job (`grep -E '^  [a-z-]+:$' .github/workflows/ci.yml` les liste ; neuf au 21/08/2026).

| Porte (job CI)                  | Commande                                            | Ce qu'elle fait passer au rouge                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ------------------------------- | --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Module boundary**             | `pnpm run boundaries` + le test négatif             | Un import qui franchit la frontière `timesheet`/`billing`, une flèche jamais déclarée — et une règle **morte** : le test rejoue une violation délibérée et exige qu'elle soit refusée                                                                                                                                                                                                                                                                                                                                                                                                                          |
| **Lint, format, types**         | `lint` · `format:check` · `typecheck` · `env:check` | Du code hors des règles ESLint (dont les invariants du domaine rendus mécaniques), un formatage divergent, une erreur de type — et une variable de `compose.yml` absente de `.env.example`                                                                                                                                                                                                                                                                                                                                                                                                                     |
| **Secret scan**                 | gitleaks sur l'historique                           | Un secret commité, y compris dans un commit ancien de la branche                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| **Dependency scan**             | `pnpm audit` + osv-scanner                          | Une dépendance portant une vulnérabilité connue de niveau haut ou critique                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| **SAST**                        | Semgrep OSS                                         | Les motifs de vulnérabilité applicative détectables statiquement                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| **Tests**                       | `pnpm run test:cov`                                 | Un invariant du domaine cassé, et une couverture du **domaine** sous 90 % (branches : 85 %) — le seuil ne porte que sur `domain/` et sur le noyau partagé, pas sur le dépôt entier                                                                                                                                                                                                                                                                                                                                                                                                                             |
| **Integration tests**           | `pnpm run test:int` sur un vrai PostgreSQL          | Une requête SQL fausse, une colonne manquante, une règle d'autorisation par périmètre qui ne refuse plus — les tests tournent contre le schéma réel, appliqué par le runner de migrations                                                                                                                                                                                                                                                                                                                                                                                                                      |
| **Migrations replayed twice**   | `pnpm run migrate` deux fois de suite               | Un runner de migrations non idempotent : le second passage doit être un no-op. ⚠️ Cette porte ne vérifie **pas** que les migrations sont additives — un `DROP COLUMN` dans un fichier `007` passerait les deux passages au vert, puisque le runner saute les versions déjà inscrites dans `schema_migrations`. La règle additive reste tenue à la relecture ; ce qui est mécanique ici, c'est le rejeu                                                                                                                                                                                                         |
| **Cold setup (migrate + seed)** | `migrate` + `seed` deux fois + `seed:fingerprint`   | Un seed qui n'est ni idempotent ni déterministe : la porte relance le seed et **diffe l'empreinte des deux passes** (un hash de contenu et un compte de lignes par table), puis relit chaque table en tant que rôle `erp_app` pour vérifier que le rôle de moindre privilège voit ce que le propriétaire du schéma a écrit. ⚠️ Elle ré-implémente les sous-commandes de `pnpm run setup` au lieu de lancer le script composite, faute de `docker compose` sous un conteneur de service : un `setup` cassé par une faute de frappe passerait au vert. C'est une limite ouverte, datée, et la phase 7 la tranche |

> ✅ **Les neuf sont vertes**, et chacune l'est devenue en livrant ce qu'elle mesure plutôt qu'en
> baissant son seuil. `Tests` est restée **rouge de la phase 0 à la phase 1** : le seuil de
> couverture existait avant le domaine à mesurer, et la rendre verte plus tôt aurait demandé soit
> d'abaisser le seuil, soit d'écrire un test qui ne prouve rien. `Integration tests` et
> `Migrations replayed twice` arrivent avec la phase 3, dans la même PR que le code qu'elles
> testent — et toutes deux ont échoué à leur premier run sur une pull request, pour une raison qui
> n'avait rien à voir avec le code : `pnpm run migrate` chargeait un `.env` absent du runner.
> Historique complet → `docs/open-questions.md`.
>
> ⚠️ Aucune de ces neuf n'empêche un merge aujourd'hui, pour la raison donnée plus haut : la
> protection de branche n'est pas disponible sur ce plan. C'est une limite assumée et datée
> (ADR-0040), pas une case oubliée.

Les hooks locaux (lefthook) rejouent une partie de ces portes **avant** le commit et le push — et depuis ADR-0040 ils ne les doublent plus, ils sont **le seul arrêt mécanique** qui précède un merge, puisque aucun des neuf ne le bloque. ⚠️ Ils
ne s'installent pas tout seuls : `ignore-scripts` est activé, donc un clone frais n'en a aucun tant
qu'on n'a pas lancé `pnpm exec lefthook install`. Ce qu'ils font :
gitleaks sur ce qui est indexé — le seul des deux qui empêche réellement la fuite, la CI ne scannant
qu'une fois le secret poussé — puis `typecheck`, `boundaries` et `test:cov` (les tests unitaires
**avec le seuil de couverture**, délibérément : une porte qui passe sur une couverture qui s'effondre
n'est pas une porte) avant le push.
Les tests d'intégration en sont délibérément absents : un `git push` ne doit pas exiger Docker.
