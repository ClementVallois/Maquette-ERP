# Maquette ERP : la chaîne CRA → facture d'un module d'ERP interne

> ⚠️ Ossature initialisée le 07/08/2026. Ce README se remplit **au fil de la construction**, pas à
> la fin : une section décrit ce qui existe le jour où elle est écrite, et une section absente est
> une chose non construite. Les chiffres portent leur date ou la commande qui les recompte — un
> nombre écrit une fois est faux quelques commits plus tard, et ce README en a porté quatre.

## Où en est cette maquette

**Phases 1 à 6 terminées** — le plan en compte onze, numérotées 0 à 10
([`docs/BUILD-PLAN.md`](docs/BUILD-PLAN.md)). Les phases 1 à 3 datent du 19/08/2026, la 4 et la 5
du 21/08/2026, la 6 du 22/08/2026.

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
unitaires, `pnpm run test:int` pour ceux qui tournent contre un vrai PostgreSQL. Au **22/08/2026**,
511 et 167.

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

Les **écrans** existent depuis la phase 6. Sept pages rendues par le serveur — sélecteur de
persona, mois d'un consultant, grille de saisie, pré-facturier, marge, facture imprimable, relevé de
CRA imprimable — plus la page qui rend un refus. Aucune étape de build front, aucun script envoyé
au navigateur (ADR-0009, ADR-0025) : c'est vrai du code d'aujourd'hui, et **la décision a bougé le
24/08/2026** — ADR-0062 remplace ADR-0009 et fait passer l'interface interactive en SPA React (les
deux imprimables restent rendus par le serveur). Rien n'en est écrit ; voir « pas encore » juste en
dessous. **Le point d'entrée est `http://127.0.0.1:3000/`**, le sélecteur de persona : tout le reste
s'atteint en cliquant depuis là. La section « Démarrer » dit comment lancer l'instance, et la même
chaîne se voit en HTTP ou à l'écran, au choix.

**L'instance tourne : [https://erp.clementvallois.fr](https://erp.clementvallois.fr)** — déployée le
03/09/2026. La chaîne complète de la phase 8 est en service sur l'hôte : l'image publiée par la CI
et tirée par digest, PostgreSQL sur un réseau privé sans port publié, les migrations et le seed en
conteneurs éphémères, le minuteur systemd qui interroge GHCR, et la remise à zéro nocturne
(ADR-0032 — les données sont synthétiques et repartent de zéro chaque nuit à 03h30).

Restent la passe de relecture documentaire (phase 9) et le gel (phase 10). La phase 0 — outillage,
CI, règles d'écriture — précède les autres et est faite.

**L'interface interactive en SPA React est livrée** — décidée le 24/08/2026, écrite depuis, et
couverte par les tests Playwright de `apps/web/e2e/`. Elle a son plan de construction
([`docs/frontend-plan.md`](docs/frontend-plan.md)), sa direction visuelle
([`docs/direction-visuelle.md`](docs/direction-visuelle.md)) et ses trois arbitrages — ADR-0062
(React), ADR-0063 (servie par la même instance Fastify, même origine) et ADR-0064 (la CSP admet un
script). Les deux documents imprimables, eux, n'ont pas bougé. ⚠️ Ces deux documents de plan sont
en anglais, contrairement à ce que cette phrase a longtemps annoncé ; la passe de relecture de la
phase 9 tranche s'ils sont traduits ou assumés tels quels.

Quatre fichiers répondent aux questions qu'on se pose en arrivant. [`CONTEXT.md`](CONTEXT.md)
définit le vocabulaire — métier (`Tjm`, `Cjm`, `pré-facturier`, `régie`, `intercontrat`, `avoir`,
`PASSI`…) et technique (`Persona`, `Role`, `Actor`) ; [`docs/adr/`](docs/adr/README.md) contient les
arbitrages avec, pour chacun, l'option écartée et le seuil de réouverture ;
[`docs/BUILD-RULES.md`](docs/BUILD-RULES.md) est la forme vérifiable de ces arbitrages — ce qu'on a
le droit d'écrire dans ce dépôt et ce qu'on n'a pas le droit d'y écrire ; et
[`docs/open-questions.md`](docs/open-questions.md) dit ce qui n'est **pas** tranché, avec la phase
qui le tranchera.

⚠️ Ces quatre fichiers sont **en anglais**, ce README seul est en français. C'est délibéré et la
règle est dans `CLAUDE.md` : le code, les commits et les arbitrages en anglais, le README dans la
langue du lecteur qui ouvre ce dépôt sans brief.

Le reste de `docs/` est du **journal de construction**, pas de la documentation d'arrivée :
[`docs/BUILD-PLAN.md`](docs/BUILD-PLAN.md) est l'ordre et le calendrier des phases,
[`docs/PHASE-4-5-CLOSURE.md`](docs/PHASE-4-5-CLOSURE.md) est le relevé des revues de ces deux
phases-là (les suivantes sont closes dans `open-questions.md`, ce qui est une incohérence de forme
assumée), [`docs/frontend-plan.md`](docs/frontend-plan.md) et
[`docs/direction-visuelle.md`](docs/direction-visuelle.md) sont le plan et la direction visuelle de
la SPA à construire, et [`docs/agents/`](docs/agents/) décrit l'outillage d'agents utilisé pour
construire le dépôt. Rien n'y est nécessaire pour comprendre la maquette.

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

ℹ️ **Le conteneur PostgreSQL publie `POSTGRES_PORT`, `5433` par défaut** — et non `5432`, pour ne
pas entrer en conflit avec une instance déjà installée. Si `pnpm run setup` échoue sur
`Bind for 0.0.0.0:5433 failed: port is already allocated`, c'est qu'autre chose l'occupe : changez
`POSTGRES_PORT` dans `.env`, `DATABASE_URL` porte le même port et `pnpm run env:check` vérifie que
les deux concordent.

## Le problème métier

Le cabinet modélisé ici est une **société de conseil en cybersécurité** — audit, SOC, GRC, IAM,
sécurité offensive — d'environ 300 consultants, répartis en 5 pôles et 4 implantations. Ce détail
n'est pas décoratif : c'est lui qui porte les contraintes que l'argumentaire de fin de page oppose
à un ERP du marché (habilitation PASSI, indépendance auditeur/remédiation, export SIEM).

Dans une société de conseil, le **compte rendu d'activité** (CRA) est le pivot : le même relevé de
jours alimente le suivi d'avancement d'une mission, le staffing, et la facturation du client. Tant
qu'il vit dans un tableur ou dans trois outils qui ne se parlent pas, chaque fin de mois est une
ressaisie — et chaque ressaisie est une source d'écart entre ce qui a été produit et ce qui est
facturé.

Cette maquette prend **une seule chaîne, de bout en bout** : un consultant saisit son CRA, son
manager le valide, et cette validation **déclenche la génération des projets de facture en régie** —
au pluriel, parce qu'un mois se travaille sur plusieurs missions et que deux missions peuvent être
vendues à deux clients différents. Une facture s'adresse à un client et tire sa TVA de la
territorialité de celui-ci ; il n'existe donc pas de facture pour deux clients (**ADR-0038**).

Périmètre volontairement étroit : deux modules, et **une seule flèche qui franchit la frontière** entre eux.

## Ce que la maquette cherche à démontrer

1. **Une frontière de module réelle, et vérifiée par la CI** — pas une convention de nommage. Le
   module de facturation (`packages/billing`) ne peut pas importer l'intérieur du module de saisie des
   temps (`packages/timesheet`) ; il réagit à un événement publié par celui-ci, dont le contrat vit
   dans un noyau partagé (`packages/platform`). Casser la frontière fait **échouer le job**, pas
   produire un warning. Où le vérifier sans me
   croire : la règle est dans [`.dependency-cruiser.cjs`](.dependency-cruiser.cjs) — dont la liste
   `allowed` est ce qui fait échouer aussi une flèche que personne n'a pensé à interdire — et
   [`tests/boundary-rule.test.ts`](tests/boundary-rule.test.ts) prouve, sur des fichiers de violation
   délibérée, qu'elle **rejette**. La CI lance les deux, dans deux étapes séparées.
   ✅ « Échouer » veut dire que le job passe au rouge **et** que le bouton de merge se verrouille :
   le dépôt est public depuis le 03/09/2026, la protection de branche est active sur `main`,
   **quatorze** checks y sont exigés (administrateurs compris) et le merge en rouge est impossible
   — pas tenu par l'auteur, tenu par la plateforme
   (**[ADR-0086](docs/adr/0086-the-gates-become-blocking-on-a-public-repository.md)**, qui
   remplace l'ADR-0040 ; la section « Tests et portes de CI » y revient en détail).
2. **Des invariants métier tenus par le code, pas par la discipline**
   - un CRA validé est **immuable** ;
   - les montants sont des **entiers en centimes** — jamais de flottant sur une valeur monétaire ;
   - la numérotation des factures est **séquentielle et sans trou** — construit en phase 3
     (**ADR-0007**) : la forme de la série vient d'ADR-0018, et l'allocation est un `SELECT … FOR
UPDATE` sur la ligne de compteur, dans la transaction d'émission. Jamais une `SEQUENCE`
     PostgreSQL : `nextval` n'est pas transactionnel, donc un rollback laisse un trou. Un test
     lance deux émissions concurrentes et exige zéro trou et zéro doublon. La série qui n'a pas de
     trou est le **compteur** (`billing.numbering_series`, par entité et par exercice) : depuis que
     le jeu de données contient une facture annulée par un avoir, `billing.invoices.invoice_number`
     saute un numéro — celui que l'avoir a consommé et que personne ne stocke, ADR-0057 ayant
     supprimé la table qui l'aurait stocké
     (**[ADR-0080](docs/adr/0080-seed-volume-reuses-missions-and-writes-a-gap.md)**). C'est ce à
     quoi ressemble une annulation réelle, pas un défaut du compteur ;
   - la TVA est arrondie **par taux** — ni par ligne, ni sur le total. C'est la règle fiscale
     française, et c'est ce que le récapitulatif obligatoire en pied de facture publie
     (**ADR-0010**). ⚠️ Les taux, seuils et mentions obligatoires retenus sont ceux connus au
     **17/08/2026** et **n'ont pas été validés par un expert-comptable** : cette maquette n'émet
     rien à un vrai client, et rien ici ne doit être repris en production sans cette validation.
3. **L'autorisation est construite et testée par rôle _et_ par périmètre.** Le filtrage vit dans le
   dépôt de données (**ADR-0003**), au seul endroit par où les données entrent, et la règle est écrite
   **une fois** dans le noyau partagé (`readScope`) parce que les deux modules l'appliquent. Trois
   rôles — `consultant`, `manager`, `billing` (**ADR-0023**) — croisés avec l'implantation : un
   consultant ne voit que ses propres mois, un manager ceux de son implantation, personne d'autre qu'un
   manager ne voit une marge. La démonstration a **les deux temps** que l'ADR-0003 exige, et elle se
   rejoue en trois requêtes (section « Démarrer ») : la même URL répond `200` sous `manager-paris` et
   **`403` sous `manager-lyon`, en nommant le refus dans un champ dédié** (`deniedBy`), et un enregistrement
   qui n'existe pas répond `404` — trois faits différents, trois réponses différentes. `manager-paris`
   et `manager-lyon` sont deux **personas** : des identités sélectionnables au lieu d'une
   authentification, chacune un rôle exercé dans une implantation (`Persona` et `Role` dans
   [`CONTEXT.md`](CONTEXT.md), 🇬🇧). Deux d'entre elles partagent le rôle `manager` dans deux
   implantations différentes, et c'est précisément ce qui rend le refus reproductible en trois clics au
   lieu d'être affirmé. Le 403 ne publie **rien** de ce qu'il cache (**ADR-0042**), et un test
   l'assure. `Cjm`, `Tjm` et marge n'apparaissent dans aucune projection de liste : ils ne sont servis
   que par une **lecture unitaire dédiée dont chaque accès est journalisé** — acteur, rôle, cible, et
   le **nom** des champs lus, jamais leur valeur (**ADR-0043**, **ADR-0024**). La pagination est
   plafonnée dans la route _et_ dans le dépôt.

4. **Des arbitrages écrits au moment où ils sont pris** → `docs/adr/`. Chaque ADR nomme l'option écartée et le seuil auquel on changerait d'avis.

## Ce que je ne construis pas

Un ERP de cabinet de conseil contient quelques centaines de sujets. Ils ont **tous** été inventoriés
et tranchés avant d'écrire une ligne de domaine — 478 arbitrages, dont **242 écartés ou renvoyés à
l'ERP cible**. Cette section est la partie publique de ce tri : elle dit ce qui manque
**volontairement**, et pourquoi. Un sujet absent d'ici est un oubli ; un sujet listé ici est une
décision.

**Écarté, avec le seuil auquel je changerais d'avis :**

| Sujet                                                                         | Pourquoi pas ici                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Seuil de réouverture                                                                                                                                                                                                                             |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Types d'absence (congé payé, RTT, maladie)                                    | Le domaine ne connaît que `worked` et `absence`, et la grille de saisie colore les deux — plus le week-end et le jour férié, que le calendrier sait déjà. Distinguer un CP d'un RTT, c'est une valeur de plus, une migration, un seed et des écrans, pour **zéro conséquence sur la facturation** : une absence ne produit aucune ligne de facture, quel que soit son motif. La demande a été posée le 26/08/2026 et refusée ici plutôt que rabotée en silence en une seule couleur « absence »                                                                                                                                                                                                                                                                                                                                                                                | Premier solde de congés à tenir dans l'outil, ou première règle métier qui dépend du motif (un RTT décompté d'un compteur, un arrêt maladie qui suspend une mission) — à ce moment-là le motif porte une conséquence et cesse d'être une couleur |
| Grille de grades et `Tjm` par défaut                                          | Les tables `public.grades` et `public.grade_tjm_defaults` sont créées et seedées, et **rien ne les lit** : le `Tjm` qui facture est celui de la mission, daté, jamais un défaut de grade. Une grille de tarifs par séniorité est une décision commerciale, pas une règle de la chaîne CRA → facture. `public.consultant_grades` a un lecteur, lui — c'est le `Cjm` que la marge lit (ADR-0043)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Première négociation tarifaire menée dans l'outil, ou premier devis calculé depuis une grille (ADR-0051)                                                                                                                                         |
| Objet `Money`, bibliothèque décimale                                          | Un `Tjm` est un nombre entier d'euros, la quantité un nombre entier de quarts de journée : l'arithmétique entière est exacte et une classe autour de `+` est du cérémonial                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Deuxième devise · prix unitaire à plus de deux décimales · proration (ADR-0002)                                                                                                                                                                  |
| Multi-devise, remises, acomptes, proration                                    | Chacun introduit un arrondi à répartir, donc casse l'exactitude entière ci-dessus                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Voir ADR-0002                                                                                                                                                                                                                                    |
| Forfait, unité d'œuvre, abonnement, astreinte                                 | Trois moteurs de facturation existent, un seul est démontré. La `InvoiceLine` porte déjà une **origine**, parce que c'est ce qui se rétrofitte le plus mal                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Première mission SOC facturée à l'heure ou à l'unité                                                                                                                                                                                             |
| Génération de PDF, Factur-X                                                   | La facture est une page HTML imprimable. Un moteur de gabarits est la première source de bugs de Dolibarr                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Dépôt réel sur une plateforme agréée                                                                                                                                                                                                             |
| Read model, cache, file de jobs, outbox                                       | Deux modules, aucune requête lourde, aucun consommateur hors du processus. Postgres tient le verrou                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Le premier abonné qui fait un appel réseau (outbox) · un écran qui joint plus de trois tables (read model)                                                                                                                                       |
| Redis, Kafka, RabbitMQ, Elasticsearch, Terraform, Kubernetes, microservices   | Aucun n'est justifié par le besoin. **Ne pas ajouter est un choix d'architecture**, pas une lacune                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Un besoin mesuré, pas anticipé                                                                                                                                                                                                                   |
| ORM (Drizzle, Prisma, Kysely, TypeORM)                                        | `FOR UPDATE`, schémas par module et types Postgres doivent être exprimables sans échappatoire, et aucun ORM ne doit pouvoir remonter dans le domaine                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | —                                                                                                                                                                                                                                                |
| Thème sombre (bascule utilisateur clair/sombre)                               | Ce plan construit une seule palette. Un second jeu de tokens testé sur chaque composant double l'effort visuel pour un outil à usage interne, pas pour un produit grand public                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Première demande réelle d'un utilisateur en usage prolongé, ou premier composant shadcn où les deux jeux de tokens existent déjà sans coût supplémentaire                                                                                        |
| Avoir partiel                                                                 | Une réduction partielle d'une facture émise est arithmétiquement indiscernable d'une remise, et la remise réintroduit un montant à répartir avant arrondi — donc casse l'exactitude entière. Seule l'annulation totale est construite                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Voir ADR-0002 et ADR-0036                                                                                                                                                                                                                        |
| Client hors Union européenne                                                  | Quatre territorialités sont modélisées (métropole, DOM avec TVA, DOM hors champ, UE), parce que chacune porte une mention obligatoire différente. Un client suisse ou britannique en porterait une cinquième, non vérifiée ici                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Première mission vendue hors UE                                                                                                                                                                                                                  |
| Undo sur une facture émise                                                    | **Et c'est la démonstration** : une facture émise ne se modifie pas, et le domaine refuse la transition. La seule correction possible est un avoir                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Jamais : c'est une règle légale                                                                                                                                                                                                                  |
| Émission d'un avoir : persistance et écran                                    | La règle **est** construite et testée — `Invoice.cancelByCreditNote()` refuse tout ce qui n'est pas une facture émise, et c'est ce refus qui tient l'immutabilité — mais rien ne persiste ni n'affiche l'avoir. La chaîne démontrée s'arrête à la facture ; corriger est en aval, et la table `billing.credit_notes`, écrite par personne, est partie avec ADR-0057 (le seed le démontre depuis item 6 QA round 1 : un avoir réel, numéroté, jamais stocké — ADR-0080)                                                                                                                                                                                                                                                                                                                                                                                                         | Première facture émise à corriger sur une instance — même seuil que le premier document _envoyé_ (ADR-0055, ADR-0056)                                                                                                                            |
| Pagination du pré-facturier au-delà d'une page                                | La liste est plafonnée à cinquante lignes (ADR-0003) : il n'y a pas de « tout afficher ». Cinquante partout sauf sur `GET /api/v1/cras`, passée à deux cents par ADR-0081 — le plafond est par route depuis item 6, plus « le même partout ». Le sélecteur de mois est lui aussi lu sur une page de CRA triée par mois décroissant — il peut donc omettre un mois **ancien**, jamais un mois récent, ce qui est le comportement attendu d'un sélecteur de période. Une implantation de neuf consultants tient très largement dedans. **Item 6 (QA round 1, 31/08/2026) a fait grossir le seed au-delà de ce cas** : Paris et Lyon dépassent maintenant les cinquante lignes, et le sélecteur de mois pour ces deux implantations n'offre plus les périodes historiques (2016 à 2024) — le seuil ci-contre est atteint, pas encore corrigé. Suivi dans `docs/open-questions.md` | Une implantation dont les CRA dépassent une page — c'est le seuil que nomme déjà ADR-0053 pour cet écran, et le correctif est une requête dédiée pour le sélecteur plus une pagination visible, pas un plafond plus haut                         |
| Audit RGAA, déclaration de conformité, test avec une technologie d'assistance | L'accessibilité **mécanique** est tenue et testée : une langue déclarée, un lien d'évitement en tête de tabulation, un anneau de focus visible jamais supprimé, un label par contrôle, un `scope` par en-tête de tableau, un texte de lien désambiguïsé par sa ligne (ADR-0061). Ce qui n'est **pas** tenu : aucun audit des 106 critères RGAA, aucune déclaration de conformité, aucun passage sous NVDA / JAWS / VoiceOver, aucun ratio de contraste publié — la palette a été choisie pour le contraste, le chiffre n'est pas revendiqué                                                                                                                                                                                                                                                                                                                                    | Premier usage réel en interne, pilote ou déploiement en cabinet · ou premier composant que HTML natif ne fournit pas (combobox, arbre, modale), là où ARIA devient nécessaire plutôt que décoratif                                               |
| Notes de frais, agenda, ticketing, GED, BPMN, marketplace de modules          | À acheter, déjà en place, ou dérive de périmètre caractérisée                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | —                                                                                                                                                                                                                                                |
| Stock, achats de biens, point de vente, fabrication                           | Sans objet pour du conseil — c'est la moitié de la surface d'Odoo et de Dolibarr qui disparaît                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | —                                                                                                                                                                                                                                                |
| Testcontainers, mode volumétrie                                               | Une seule base à gérer (`compose.yml` la décrit déjà, ADR-0019) et aucune charge mesurée à simuler. Le mutation testing a quitté cette ligne : Stryker tourne sur `domain/` en nightly depuis la phase 7 (ADR-0027), hors du pipeline de PR pour la même raison que les deux qui restent ici — un pipeline de PR trop long se contourne                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Testcontainers : un second conteneur à orchestrer dans le même run. Volumétrie : un besoin de charge mesuré, pas anticipé                                                                                                                        |

**Renvoyé à l'ERP cible** (identifié, modélisé quand c'est gratuit, non construit) : facturation
électronique et plateforme agréée · comptabilité, trésorerie, FEC · congés et absences comme module ·
plan de charge et moteur de contraintes de staffing · devis, contrat-cadre, BDC, avenants ·
sous-traitance · dictionnaire d'indicateurs et TACE · reporting analytique · workflow d'approbation
générique et délégation · verrouillage optimiste et `ETag` · SCIM, PAM, recertification, SIEM ·
anti-exfiltration au-delà de la réduction de périmètre · assistant IA et OCR · reprise de
l'existant · hébergement souverain ou certifié de l'ERP cible (la maquette publique sur le VPS
personnel ne revendique ni l'un ni l'autre, ADR-0028).

**Hors périmètre par construction :**

- le forfait au sens large (seule la **régie** est facturée ici) ;
- l'envoi réel des factures, la comptabilité, les règlements et les relances ;
- la gestion des utilisateurs et l'authentification en production (sélecteur de persona assumé : il
  rend l'autorisation démontrable en trois clics là où un vrai IdP la rendrait invisible).

Trois entrées de menu — **Mes informations**, **Mes notes de frais**, **Mes demandes d'absence** —
existent pourtant dans la barre latérale de chaque rôle et ouvrent une page « à venir ». C'est
volontaire : un ERP interne les porte toutes les trois, et les montrer à leur place situe la chaîne
CRA → facture dans l'outil dont elle n'est qu'un module. Elles sont des **maquettes d'emplacement**,
pas des écrans inachevés : aucune n'a de domaine, de table ni d'API derrière elle, et les deux
dernières figurent au-dessus comme non construites. Une page qui affiche honnêtement qu'elle n'existe
pas encore vaut mieux qu'un menu qui ment sur le périmètre de l'outil.

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

| Choix                                                                                                             | ADR                          | Option écartée                                                                                  |
| ----------------------------------------------------------------------------------------------------------------- | ---------------------------- | ----------------------------------------------------------------------------------------------- |
| **TypeScript** strict, **Node.js** ≥ 24.13.1                                                                      | —                            | —                                                                                               |
| **Fastify**                                                                                                       | ADR-0008                     | NestJS — un conteneur d'injection et des décorateurs pour une douzaine de routes                |
| **HTML rendu serveur** pour les deux imprimables ; **React + TypeScript** en SPA pour l'interactif (à construire) | ADR-0062 (remplace ADR-0009) | Vue — shadcn/ui n'y existe qu'en portage communautaire, et ce code-là est recopié dans le dépôt |
| **PostgreSQL 18**, SQL écrit à la main                                                                            | ADR-0011                     | Un ORM — `FOR UPDATE` et les schémas par module doivent rester lisibles                         |
| Migrations : fichiers `.sql` numérotés + runner                                                                   | ADR-0011                     | Un outil de migration tiers                                                                     |
| **Montants en centimes entiers**                                                                                  | ADR-0002                     | Un objet `Money`, une bibliothèque décimale                                                     |
| **Zod** aux frontières, et nulle part ailleurs                                                                    | ADR-0042                     | Une validation qui redescend dans le domaine                                                    |
| **Vitest** · **pino** · **pnpm** workspaces                                                                       | —                            | —                                                                                               |
| **Sélecteur de persona** au lieu d'une authentification                                                           | ADR-0023                     | Un vrai IdP, qui rendrait l'autorisation invisible en démonstration                             |

**Absents, et c'est un choix** : Redis, Kafka, RabbitMQ, Elasticsearch, Terraform, Kubernetes,
microservices, tout ORM, toute bibliothèque décimale, toute file de jobs, Vue, génération de
PDF, OpenTelemetry, Testcontainers. La section « Ce que je ne construis pas » donne le seuil de
chacun.

## Démarrer

Une commande, qui fait les cinq étapes : `.env`, sa vérification, PostgreSQL, les migrations, le
seed.

```sh
pnpm install --frozen-lockfile
pnpm run setup                  # env:init + env:check + docker compose + migrate + seed
pnpm --filter @erp/web build    # sans ça, `/` renvoie 404 : dist/ n'est pas versionné
pnpm run api                    # l'API sur http://127.0.0.1:3000
```

Les **deux topologies** — dev (Vite sur 5173, deux processus) et prod/démo (Fastify seul sur 3000,
ADR-0063) — leurs commandes, et le `403 /problems/forbidden-origin` qui suit quand on les mélange :
[`docs/running.md`](docs/running.md).

`pnpm run db:reset` rejoue les trois dernières étapes depuis une base vide. Les étapes séparément,
si l'une échoue :

```sh
pnpm run db:up      # PostgreSQL 18 via docker compose, attend qu'il soit healthy
pnpm run migrate    # applique les migrations en attente, rejouable sans effet
pnpm run seed       # ⚠️ VIDE les trois schémas, puis réécrit le jeu déterministe (ADR-0022)
pnpm run test:int   # les tests d'intégration contre ce PostgreSQL
```

`pnpm run db:up` crée deux rôles distincts : `erp_migration` possède le schéma et l'applique,
`erp_app` s'y connecte avec les seuls droits `SELECT/INSERT/UPDATE/DELETE`. Les tests d'intégration
utilisent `erp_app` — un test qui passerait en propriétaire du schéma ne prouverait rien sur ce que
l'application aura le droit de faire.

Sans base de données, `pnpm run check` reste complet et vert : seuls les tests d'intégration
demandent Docker.

### Voir la chaîne, et voir l'autorisation refuser

Deux façons de voir la même chaîne : **à l'écran**, ou en HTTP. Les deux passent par
`http://127.0.0.1:3000`.

**À l'écran** — ouvrez **<http://127.0.0.1:3000/>** dans un navigateur. Vous arrivez sur le
sélecteur de persona ; choisissez `manager-paris`, et la navigation mène au pré-facturier, d'où un
mois se valide ou se refuse. `billing-paris` est la persona qui émet une facture ;
`consultant-paris` est celle qui saisit un mois. Changer de persona se fait depuis l'en-tête de
chaque page. Rien à installer côté navigateur : les pages sont du HTML rendu par le serveur, sans
script.

⚠️ **`127.0.0.1` et non `localhost`.** La panne est trompeuse : sous `localhost` les pages
s'affichent normalement (`200`), et seule la **première écriture** est refusée — un bouton qui ne
fait rien sur une application qui a l'air de marcher. Ce sont la même machine et **deux origines
différentes** :
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
# 2. la même URL sous manager-lyon              → 403, avec "deniedBy" qui porte le refus
# 3. un id qui n'existe pas, sous manager-paris → 404
```

Trois faits différents, trois réponses différentes — et le `403` ne publie **rien** de ce qu'il
cache. Puis la chaîne elle-même, en deux écritures :

```sh
# 1. Le manager valide le mois. Les projets de facture apparaissent dans la MÊME transaction,
#    un par client. `{cra-id}` est l'`id` d'un CRA `submitted` renvoyé par la commande précédente.
curl -s -b jar.txt -X POST http://127.0.0.1:3000/api/v1/cras/{cra-id}/validation \
  -H 'Origin: http://127.0.0.1:3000'

# 2. Les projets ainsi créés, pour en prendre un `id`
curl -s -b jar.txt http://127.0.0.1:3000/api/v1/invoices

# 3. L'émission est portée par `billing`, pas par `manager` : il faut changer de persona
curl -s -c jar.txt -X POST http://127.0.0.1:3000/api/v1/session/persona \
  -H 'Origin: http://127.0.0.1:3000' -H 'Content-Type: application/json' \
  -d '{"key":"billing-paris"}'

# 4. Émission. L'en-tête `Idempotency-Key` est obligatoire — c'est la seule route qui consomme
#    un numéro d'une série sans trou. Rejouez la commande telle quelle : même numéro, "replayed".
curl -s -b jar.txt -X POST http://127.0.0.1:3000/api/v1/invoices/{invoice-id}/issuance \
  -H 'Origin: http://127.0.0.1:3000' -H 'Idempotency-Key: demo-0001'
```

⚠️ **Deux en-têtes, et les oublier donne un refus qui ressemble à une panne.** `Origin` est
obligatoire sur **toute** écriture (`403 /problems/forbidden-origin`, posture CSRF d'ADR-0023), et
`Idempotency-Key` l'est sur l'émission (`400 /problems/idempotency-key-required`). Les deux refus
nomment eux-mêmes leur correctif dans leur `detail` — mais ils sont attendus, pas cassés. De même,
l'étape 4 sous `manager-paris` répond `403 /problems/insufficient-role` : c'est l'autorisation par
rôle qui fonctionne, et c'est pour cela que l'étape 3 existe.

Les routes complètes sont dans [`apps/api/src/routes/`](apps/api/src/routes/) pour l'API et dans
[`apps/api/src/web/routes.ts`](apps/api/src/web/routes.ts) pour les écrans, et chacune **déclare les
rôles qui la portent** au lieu de les comparer dans son corps.

## Jeu de données

`pnpm run seed` remplit une base qui ressemble à un cabinet plutôt qu'à une table de test : cinq
pôles, quatre implantations (Paris, Lyon, Rennes, Bordeaux), des missions en **régie** et au
**forfait** — seule la régie est facturée —, un consultant en **intercontrat**, et une
**habilitation PASSI** portée par un auditeur et exigée par une mission qualifiée.

**Le volume, depuis item 6 (QA round 1, 31/08/2026)** — parce qu'un cabinet de neuf consultants sur
un seul mois n'exerce ni la pagination, ni les filtres, ni l'historique :

- **48 personnes** dans `public.consultants`, dont **3 managers**. Quatre d'entre elles seulement
  sont sélectionnables dans le choix de persona (ADR-0023) ; les autres existent pour peupler les
  listes de leur manager — les deux managers sélectionnables en comptent une vingtaine chacun.
- **Juin, juillet et août 2026 sont denses** : chaque consultant actif y a un CRA. **Septembre est
  volontairement vide** — c'est le mois en cours, celui qu'un lecteur remplit lui-même en suivant
  la démonstration.
- **Quatre vétérans portent un historique épars jusqu'à 2016** (un CRA tous les deux ans), sur des
  missions dont la date de début a été reculée d'autant. **L'une d'eux a quitté le cabinet** fin
  2022 (`departure_date`,
  **[ADR-0079](docs/adr/0079-departure-is-a-nullable-date-with-a-domain-invariant.md)**) : ses CRA
  et ses factures restent lisibles, et elle n'apparaît dans aucune liste de l'effectif actuel. Le
  calendrier des jours fériés couvre 2016–2027 pour que ces mois-là soient calculables
  (**[ADR-0078](docs/adr/0078-the-holiday-table-extends-to-2016-2027.md)**).
- **66 factures depuis 2016**, en **brouillon**, **émise** et **annulée par avoir** — émises par la
  vraie voie du domaine, dans l'ordre des périodes
  (**[ADR-0080](docs/adr/0080-seed-volume-reuses-missions-and-writes-a-gap.md)**).

Ce volume a déplacé une limite réelle plutôt que de rester décoratif : `GET /api/v1/cras` a
désormais son propre plafond à deux cents lignes, mesuré, quand toutes les autres listes restent à
cinquante (**[ADR-0081](docs/adr/0081-cra-list-gets-its-own-higher-page-cap.md)**).

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
(deux quarts de journée sur chacune), une journée d'absence, un **samedi travaillé donc signalé**,
et une seconde journée partagée à trois quarts contre un (ADR-0069). Ce n'est pas de la décoration
— la journée partagée est la raison structurelle pour laquelle la mission est portée par la _ligne_
et non par le _jour_, et le jeu de données ne l'exerçait pas jusqu'à la phase 6 ; le partage 3/1
est ce qui fait qu'une ligne de facture porte une quantité qui n'est pas un multiple de quatre, et
qui prouve donc la facturation au quart plutôt que de l'illustrer. Les deux missions d'Alice étant
vendues au **même client**, chaque journée partagée produit une seconde _ligne_ sur une facture,
pas une seconde facture (ADR-0038).

Ce que **juin** 2026 ne peut pas montrer : un **jour férié** signalé. Il n'y en a aucun ce mois-là
(ADR-0004 place l'Ascension au 14/05 et la Pentecôte au 25/05) ; c'est le calendrier, pas un oubli.
Juillet, lui, en porte un — le 14 — et il est dense depuis item 6 : la maquette montre donc bien un
jour férié signalé, mais pas sur le mois d'Alice.

## Tests et portes de CI

Une porte qui ne bloque pas un merge est un avertissement, pas une porte. Le mot « avertissement »
sert ici deux fois, pour deux choses différentes, et il vaut mieux les séparer tout de suite :

1. **Une règle qui reste verte sur une violation** — le `warn` de dependency-cruiser au lieu de son
   `error`. C'est le sens du mot en tête de ce README (« casser la frontière fait échouer le job,
   pas produire un warning »), et **ce piège-là est fermé** : les jobs ci-dessous échouent
   réellement, et `tests/boundary-rule.test.ts` le prouve sur des violations délibérées.
2. **Une porte qui échoue sans rien empêcher.** C'était l'état de ce dépôt jusqu'au 03/09/2026, et
   **ce piège-là est fermé aussi** — écrit ici plutôt que sous-entendu.

Elles tournent sur chaque push et sur chaque pull request, elles passent au rouge, **et depuis le
03/09/2026 un rouge verrouille le merge**. La seule chose capable de désactiver le bouton — la
_protection de branche_ GitHub — exige un compte **Pro** ou un dépôt **public** ; celui-ci est
devenu public, et la bascule a été faite le jour même. **Quatorze checks sont exigés sur `main`**,
`enforce_admins` compris, donc la règle « rien ne merge en rouge » ne repose plus sur l'auteur.
Décision, option écartée et seuil →
**[ADR-0086](docs/adr/0086-the-gates-become-blocking-on-a-public-repository.md)**, qui remplace
l'**[ADR-0040](docs/adr/0040-ci-gates-are-advisory-while-the-repository-is-private.md)** — laquelle
disait l'état antérieur, et disait aussi que ce README avait affirmé le contraire (« cinq sont
exigées ») depuis la phase 0 alors que la bascule n'était pas en attente mais indisponible.

Les quatorze se lisent avec
`gh api repos/ClementVallois/Maquette-ERP/branches/main/protection --jq '.required_status_checks.contexts'`.
Le tableau ci-dessous décrit les **dix** que porte `ci.yml` ; les quatre autres viennent des trois
autres workflows du dépôt — `Analyze` (CodeQL, `codeql.yml`), `Shell scripts` et
`Build and boot the image` / `Deploy script --dry-run` (`image.yml`, arrivés avec la phase 8).

| Porte (job CI)                  | Commande                                                                            | Ce qu'elle fait passer au rouge                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ------------------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Module boundary**             | `pnpm run boundaries` + le test négatif                                             | Un import qui franchit la frontière `timesheet`/`billing`, une flèche jamais déclarée — et une règle **morte** : le test rejoue une violation délibérée et exige qu'elle soit refusée                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| **Lint, format, types**         | `lint` · `format:check` · `typecheck` · `env:check`                                 | Du code hors des règles ESLint (dont les invariants du domaine rendus mécaniques), un formatage divergent, une erreur de type — et une variable de `compose.yml` absente de `.env.example`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| **Secret scan**                 | gitleaks sur l'historique                                                           | Un secret commité, y compris dans un commit ancien de la branche                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| **Dependency scan**             | `pnpm audit` + osv-scanner                                                          | Une dépendance portant une vulnérabilité connue. Les deux étapes n'ont **pas** le même seuil, et c'est délibéré : `pnpm audit --audit-level=high` ne tombe qu'en haut ou critique, osv-scanner **n'a pas de plancher de sévérité** et tombe sur tout ce qu'OSV connaît. La porte est l'union des deux — c'est osv-scanner qui l'a fait passer au rouge pour la première fois le 31/08/2026, sur un avis **modéré** (GHSA-q8mj-m7cp-5q26, `qs`) que `pnpm audit` avait laissé passer. Le plancher n'a pas été ajouté pour faire repasser la porte au vert : le correctif a été pris (`pnpm-workspace.yaml`, `overrides`), procédure → [`docs/vulnerability-management.md`](docs/vulnerability-management.md)                                                                                                  |
| **SAST**                        | Semgrep OSS                                                                         | Les motifs de vulnérabilité applicative détectables statiquement                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| **Tests**                       | `pnpm run test:cov`                                                                 | Un invariant du domaine cassé, et une couverture du **domaine** sous 90 % (branches : 85 %) — le seuil ne porte que sur `domain/` et sur le noyau partagé, pas sur le dépôt entier                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| **Integration tests**           | `pnpm run test:int` sur un vrai PostgreSQL                                          | Une requête SQL fausse, une colonne manquante, une règle d'autorisation par périmètre qui ne refuse plus — les tests tournent contre le schéma réel, appliqué par le runner de migrations                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| **Playwright (apps/web)**       | `playwright test` contre le build servi par l'API                                   | Une régression d'un parcours SPA de bout en bout (persona → grille → pré-facturier → facture), rejouée contre `apps/web/dist` servi par Fastify sur le port 3000 — la seule topologie qui envoie la vraie `Content-Security-Policy` de l'application, jamais contre le serveur de dev Vite. Arrivée avec la phase 9.6 du plan front-end ; sa ligne manquait ici jusqu'à la phase 7                                                                                                                                                                                                                                                                                                                                                                                                                           |
| **Migrations replayed twice**   | `pnpm run migrate` deux fois de suite                                               | Un runner de migrations non idempotent : le second passage doit être un no-op. ⚠️ Cette porte ne vérifie **pas** que les migrations sont additives — un `DROP COLUMN` dans un fichier `007` passerait les deux passages au vert, puisque le runner saute les versions déjà inscrites dans `schema_migrations`. La règle additive reste tenue à la relecture ; ce qui est mécanique ici, c'est le rejeu                                                                                                                                                                                                                                                                                                                                                                                                       |
| **Cold setup (migrate + seed)** | `pnpm run setup` (le vrai composite) + `seed` une seconde fois + `seed:fingerprint` | Un seed qui n'est ni idempotent ni déterministe : la porte relance le seed et **diffe l'empreinte des deux passes** (un hash de contenu et un compte de lignes par table), puis relit chaque table en tant que rôle `erp_app` pour vérifier que le rôle de moindre privilège voit ce que le propriétaire du schéma a écrit. Depuis la phase 7, ce job lance le **script composite lui-même** (`env:init`, `env:check`, `docker compose up -d --wait`, `migrate`, `seed`) plutôt que de le ré-implémenter : `ubuntu-latest` fournit Docker et le plugin Compose directement sur le runner, ce que les autres jobs base de données n'utilisent pas (ils tournent contre un conteneur `services:`, qui n'a pas de `docker compose` à lancer). Un `setup` cassé par une faute de frappe passe désormais au rouge |

> ✅ **Les dix sont vertes**, et chacune l'est devenue en livrant ce qu'elle mesure plutôt qu'en
> baissant son seuil. `Tests` est restée **rouge de la phase 0 à la phase 1** : le seuil de
> couverture existait avant le domaine à mesurer, et la rendre verte plus tôt aurait demandé soit
> d'abaisser le seuil, soit d'écrire un test qui ne prouve rien. `Integration tests` et
> `Migrations replayed twice` arrivent avec la phase 3, dans la même PR que le code qu'elles
> testent — et toutes deux ont échoué à leur premier run sur une pull request, pour une raison qui
> n'avait rien à voir avec le code : `pnpm run migrate` chargeait un `.env` absent du runner.
> `Playwright (apps/web)` arrive avec la phase 9.6 du plan front-end. Historique complet →
> `docs/open-questions.md`.
>
> ✅ La réserve du 28/08/2026 sur `Cold setup (migrate + seed)` est levée. Le job venait d'être
> réécrit pour lancer le composite réel, et cette version-là **n'avait jamais tourné sur un runner
> GitHub** : la branche qui la portait ne pouvait pas déclencher sa propre pull request. Elle a
> tourné verte sur chaque pull request depuis. Elle n'est donc plus seulement recoupée avec la
> liste logicielle documentée d'`ubuntu-latest`, elle est observée verte sur la plateforme.
>
> ✅ Depuis le 03/09/2026, chacune de ces dix empêche un merge — elles font partie des quatorze
> checks exigés sur `main`, `enforce_admins` compris (ADR-0086). La réserve qui figurait ici, « aucune
> de ces dix n'empêche un merge », décrivait l'état antérieur et n'est plus vraie.

Les hooks locaux (lefthook) rejouent une partie de ces portes **avant** le commit et le push. De
l'ADR-0040 à l'ADR-0086 ils ont été **le seul arrêt mécanique** qui précédait un merge, puisque
aucune porte ne le bloquait ; depuis le 03/09/2026 ils doublent des portes qui bloquent vraiment, ce
qui les remet dans leur rôle normal — échouer sur le poste plutôt que sur un runner, deux minutes
plus tôt. ⚠️ Ils
ne s'installent pas tout seuls : `ignore-scripts` est activé, donc un clone frais n'en a aucun tant
qu'on n'a pas lancé `pnpm exec lefthook install`. Ce qu'ils font :
gitleaks sur ce qui est indexé — le seul des deux qui empêche réellement la fuite, la CI ne scannant
qu'une fois le secret poussé — puis `typecheck`, `boundaries` et `test:cov` (les tests unitaires
**avec le seuil de couverture**, délibérément : une porte qui passe sur une couverture qui s'effondre
n'est pas une porte) avant le push.
Les tests d'intégration en sont délibérément absents : un `git push` ne doit pas exiger Docker.

### Nightly — ce qui ne tourne jamais sur une PR

Un mécanisme de plus, mais pas une onzième porte du tableau ci-dessus (qui en compte dix) :
`.github/workflows/nightly.yml`
lance **Stryker en mutation testing sur `packages/*/src/domain/**` uniquement**, une fois par jour,
jamais sur une pull request — la couverture dit _combien_ du domaine un test touche, le score de
mutation dit _si_ l'assertion qui le touche verrait une mauvaise réponse. Décision, option écartée
et seuils → **[ADR-0027](docs/adr/0027-nightly-gates-and-what-the-pr-pipeline-never-runs.md)**.

Premier score réel, mesuré localement le 28/08/2026 (`pnpm exec stryker run`) : **72,80 %**
(`billing` 67,75 %, `timesheet` 79,07 %) — sous le seuil de couverture du domaine (90 %/85 %), ce
que ce gate existe justement à rendre visible plutôt qu'à masquer. Le seuil de rupture du job
(`break: 70` dans `stryker.config.json`) est fixé quelques points sous ce score réel, pas abaissé
pour le faire passer. ⚠️ **`schedule:` ne se déclenche pas tant que ce fichier n'est pas sur la
branche par défaut** — GitHub n'exécute pas un cron sur une branche qui n'est pas `main`. Ce
workflow n'a donc **jamais tourné**, ni sur son horaire ni autrement : `workflow_dispatch` le rend
déclenchable à la main dès qu'il sera sur `main`, mais le score ci-dessus vient d'un
`pnpm exec stryker run` lancé en local, avec la même configuration et non par la plateforme. Ne pas
lire « dix jobs verts » plus haut comme couvrant ce onzième mécanisme — il n'y figure pas.

### Renovate, et la procédure de gestion des vulnérabilités

`renovate.json5` (racine du dépôt) est **committé** : mises à jour groupées, cadence fixe
hebdomadaire, Node et pnpm exclus de l'automatisation, alertes de vulnérabilité ouvertes **à tout
moment**, sans attendre la cadence. Décision, option écartée et seuil →
**[ADR-0075](docs/adr/0075-the-vulnerability-management-procedure-and-where-it-lives.md)**.

⚠️ **L'application GitHub Renovate n'est pas installée sur ce dépôt** — vérifié le 28/08/2026 :
aucun webhook, aucune pull request ouverte par le bot, dépôt privé. Installer une App GitHub est
une action de plateforme, à faire depuis github.com : ni la CI ni un script de ce dépôt ne peut la
déclencher, et elle n'est pas faite. Ce README dit
donc ce qui est vrai — la configuration est committée et correcte — et pas ce qui ne l'est pas
encore — que Renovate tourne. C'est le précédent d'ADR-0040 appliqué une seconde fois plutôt que
réinventé : ce dépôt a déjà affirmé une porte qui n'a jamais été réellement active (la protection
de branche, « cinq sont exigées », fausse de la phase 0 au 19/08/2026) et ne voulait pas répéter
l'erreur pour Renovate.

Ce que fait la porte `Dependency scan` du tableau ci-dessus quand elle passe au rouge — qui
décide, sur quel critère une exception se justifie, et où elle est écrite — est une procédure à
part entière, pas une phrase de plus ici : **[`docs/vulnerability-management.md`](docs/vulnerability-management.md)**.
