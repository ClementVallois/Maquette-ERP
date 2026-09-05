# Audit produit, UI/UX et plan d’amélioration

**Date :** 1er septembre 2026  
**Périmètre audité :** SPA interactive CRA → facture, documents imprimables, parcours par persona,
direction visuelle, textes d’interface, états fonctionnels et couverture de tests visible dans le
dépôt.  
**Nature du document :** audit de la maquette existante et propositions. Ce document ne demande
aucune modification de code et ne transforme pas les idées hors périmètre en engagements.

## Statut au 5 septembre 2026

Cet audit n’est plus un plan d’action à exécuter tel quel — il l’a déjà été. `docs/plan-densification.md`
(02/09/2026) en est le **descendant opérationnel** : il a trié chaque constat ci-dessous en Gardé,
Optionnel ou Laissé de côté (sa §10 fait la traçabilité identifiant par identifiant). Les QA rounds 3,
4 et 5 (`docs/qa-rounds.md`, travaillées 03-04/09/2026) ont livré la majorité de ce qui était Gardé.
Un audit plus récent et non versionné, `docs/audit-ceo-readiness-2026-09-05.md` (matériel propriétaire
de Clement, non modifié par cette passe), a repris ce qui restait ouvert et l’a formalisé en
constats **F01 à F15**, avec priorités P0/P1/P2.

**Cette passe (05/09/2026, branche `fix/audit-produit-residuel`) ferme sept de ces résidus,** tous
sans RH/Direction, sans nouveau module et sans agrandir le périmètre (`CLAUDE.md`, règle « ne pas
étendre le périmètre ») :

| Résidu fermé                                                                                                                  | Constat CEO | Item de cet audit                                                          | Commit    |
| ----------------------------------------------------------------------------------------------------------------------------- | ----------- | -------------------------------------------------------------------------- | --------- |
| Unités de la ligne de facture (jours × taux journalier, plus le prix au quart de journée)                                     | F03         | P2.2 (Q7, densification B4)                                                | `f28a267` |
| Récupération sur une page hors-plage (distincte d’un résultat filtré vide)                                                    | F07         | P0.3 (Q2, densification A12)                                               | `e96863d` |
| Une seule action « à faire » sur le mois courant du consultant                                                                | F11         | P1.1 (Q1, densification A1) — complète l’ADR-0097                          | `874b544` |
| Trois textes qui promettaient ce que l’interface ne tient pas                                                                 | F14         | P1.7 (D3, densification B2)                                                | `feb6b7f` |
| File de brouillons de facturation (discriminant consultant, portée des compteurs manager, découverte historique)              | F10         | P0.2 et P1.5 (D2/D4, densification A1/A7)                                  | `c5005b6` |
| Chronologie CRA/facture étiquetée comme jalons courants, pas un historique complet                                            | F12         | P2.5 (L5, densification A3)                                                | `6c29e0e` |
| Portée du tri des tableaux rendue honnête (désactivé sur les trois tables server-paginées plutôt que de mentir sur sa portée) | F06         | P1.4 (Q3, densification A8) — **partiellement traité**, tri global reporté | `9c2d72d` |

**Ce que cette passe ne ferme pas**, faute d’être dans son périmètre confié : F01 (provenance de la
publication), F02 (changement de persona qui efface une session), F04 (caches non invalidés), F05
(imprimable d’une facture annulée), F08 (script de démo), F09 (tests de l’écran d’affectation), F13
(effectif sans affectation dans le graphique de staffing), F15 (réconciliation documentaire). Ils
restent ouverts exactement comme `docs/audit-ceo-readiness-2026-09-05.md` les décrit ; ce document ne
les rouvre pas et ne les referme pas.

Sous chaque intitulé P0/P1/P2 et dans chaque tableau de lot ci-dessous, une ligne datée dit **shipped**
(avec l’ADR ou le commit qui le porte), **superseded** (une direction abandonnée par une décision
plus tardive — ne pas la restaurer pour cocher une case obsolète), ou **still open** (avec un pointeur
vers un identifiant de densification, un numéro F, ou une ligne `docs/open-questions.md`). Le tableau
de maturité n’est pas renoté — une note refaite sans avoir refait tourner l’audit serait une
fabrication ; une ligne juste en dessous nomme seulement quels axes ont bougé, et pourquoi.

## 1. Synthèse exécutive

La maquette est solide sur son cœur de démonstration : elle raconte une chaîne métier complète,
cohérente et crédible, de la saisie d’un CRA jusqu’à l’émission d’une facture. Elle est nettement
au-dessus d’une maquette purement visuelle : les rôles ont des capacités différentes, les portées
d’accès sont visibles, les états vides et refusés sont traités, les invariants métier influencent
réellement l’interface, et les principaux parcours sont testés.

Sa principale faiblesse n’est pas le manque de fonctionnalités métier dans le périmètre annoncé.
C’est le manque de **mise en scène du travail à accomplir** et de **pédagogie intégrée**. Les écrans
montrent correctement les données, mais aident encore peu l’utilisateur à comprendre :

- ce qui mérite son attention maintenant ;
- pourquoi un montant ou un statut existe ;
- quelle est la prochaine action utile ;
- comment remonter d’une facture au CRA qui l’a produite ;
- comment apprendre le processus sans connaître au préalable le vocabulaire du cabinet.

Les priorités les plus importantes sont les suivantes :

1. sécuriser et clarifier l’émission d’une facture en montrant systématiquement le total à émettre
   et en retirant les détails techniques du dialogue ;
2. transformer le tableau de bord en file de travail actionnable, y compris pour les actions venant
   d’un autre mois ;
3. rendre l’historique réellement accessible avec pagination et sélecteurs non tronqués ;
4. assumer soit une expérience desktop, soit une vraie adaptation téléphone : l’entre-deux actuel
   teste une tablette de 768 px, mais pas un mobile courant de 360–430 px ;
5. alléger la charge cognitive de la grille CRA et rendre ses outils compréhensibles sans essai ;
6. retirer de l’interface les références aux ADR, à l’idempotence, au serveur et aux décisions
   d’architecture ;
7. ajouter une couche d’apprentissage progressive : glossaire contextuel, explication des calculs,
   filiation CRA → facture et parcours guidés par rôle.

### Évaluation de maturité

Les notes ci-dessous évaluent la **maquette dans son périmètre déclaré**, pas un ERP de production.

| Axe                                  |  Note | Lecture                                                                                               |
| ------------------------------------ | ----: | ----------------------------------------------------------------------------------------------------- |
| Couverture du parcours CRA → facture | 4,5/5 | Chaîne complète, rôles distincts, décisions et imprimables                                            |
| Cohérence fonctionnelle              | 4,5/5 | Les règles métier structurent réellement l’expérience                                                 |
| Architecture de l’information        | 3,5/5 | Navigation simple, mais les actions inter-périodes et les détails sont mal reliés                     |
| UI et cohérence visuelle             |   4/5 | Design system sobre et homogène ; écrans parfois trop vides ou trop tabulaires                        |
| Ergonomie et productivité            |   3/5 | Bons raccourcis sur le CRA, mais historique, tables et actions critiques restent perfectibles         |
| États, feedback et résilience        |   4/5 | Chargement, vide, erreur, refus, session invalide et confirmations sont bien représentés              |
| Accessibilité                        |   4/5 | Base mécanique sérieuse ; audit RGAA et tests avec lecteurs d’écran non réalisés                      |
| Responsive                           |   2/5 | Menu adapté à 768 px, mais mises en page et tableaux non conçus pour un téléphone                     |
| Pédagogie et aide à l’apprentissage  |   2/5 | Les règles sont visibles, mais rarement expliquées au bon endroit et au bon niveau                    |
| Innovation utile                     | 2,5/5 | Le potentiel de traçabilité est fort, mais encore peu exploité comme outil de compréhension           |
| Préparation à un ERP de production   |   2/5 | Faible par choix explicite : pas d’authentification réelle, notifications, exports, délégations, etc. |

**Note du 05/09/2026 :** ce tableau n’est pas renoté (re-noter un audit qu’on n’a pas fait rejouer
serait une fabrication). Direction seulement, à confirmer par un futur audit qui rejoue la méthode :
**Architecture de l’information** et **Ergonomie et productivité** ont probablement progressé (files
de travail bornées et explicites, récupération de page hors-plage, tri qui ne prétend plus couvrir
ce qu’il ne couvre pas) ; **États, feedback et résilience** aussi (`OrgChartPanel` a maintenant un état
d’échec compact) ; **Pédagogie et aide à l’apprentissage** un peu (chronologie étiquetée honnêtement),
mais reste basse — aucun élément du Lot 3 (glossaire mis à part, déjà livré) n’a été construit par
cette passe. Deux règles distinctes le tiennent fermé : `CLAUDE.md` « ne pas étendre le
périmètre » (générale, elle ne nomme ni §6 ni les lots), et
`docs/audit-ceo-readiness-2026-09-05.md`, qui demande explicitement de ne pas laisser une passe
de finition ouvrir un nouveau chantier produit.

## 2. Méthode et limites de l’audit

L’audit s’appuie sur :

- les routes et composants de la SPA ;
- les contrats d’API consommés par l’interface ;
- les textes centralisés dans `labels.ts` ;
- la direction visuelle et le plan frontend ;
- les captures de référence desktop et tablette ;
- les tests de parcours, de navigation, de mouvement et d’accessibilité ;
- le périmètre déclaré dans le README et les décisions déjà prises dans `docs/todo.md`.

Il ne s’agit pas d’une étude utilisateur. Aucun consultant, manager ou gestionnaire de facturation
n’a été observé en situation. Il n’y a pas non plus de données d’usage, de test sous NVDA, JAWS ou
VoiceOver, ni d’audit RGAA complet. Les constats de compréhension et de charge cognitive doivent
donc être validés par de courts tests utilisateurs.

Le contrôle local `pnpm run check` a validé l’environnement, le lint, les frontières, le formatage
et les types. Sa phase de tests n’a pas été concluante dans cette exécution : une première tentative
a rencontré une collision du répertoire temporaire de couverture, puis une exécution sans
couverture a validé 583 tests mais échoué sur 11 tests qui lancent des outils externes, leur sortie
JSON ayant été tronquée. Les suites e2e n’ont pas été relancées pour cet audit. Ce résultat ne doit
être présenté ni comme un feu vert complet, ni comme la preuve d’une régression fonctionnelle.

## 3. Cartographie fonctionnelle actuelle

### Parcours commun

- sélection parmi quatre personas de démonstration ;
- session mémorisée côté serveur et possibilité de changer de persona ;
- navigation adaptée au rôle ;
- tableau de bord spécifique au rôle ;
- protection des routes et retour explicite au sélecteur lorsque la session n’est plus valide ;
- états de chargement, vide, erreur, accès refusé et corrélation d’erreur ;
- menu latéral repliable sur desktop et tiroir sous 1024 px.

### Consultant

- tableau de bord du mois courant ;
- liste de ses CRA et ouverture d’un autre mois disponible ;
- navigation mois précédent/suivant ;
- grille mission × jour avec quarts de journée ;
- ajout ou retrait d’une activité ;
- remplissage des jours ouvrés vides et vidage d’une ligne ;
- totaux locaux immédiats ;
- signalement des jours incomplets, surchargés, fériés ou travaillés le week-end ;
- sauvegarde puis soumission au manager ;
- protection contre la perte de modifications non enregistrées ;
- correction après refus ;
- lecture seule après soumission ou validation ;
- relevé d’activité imprimable après validation.

### Manager

- tableau de bord avec décisions en attente, montant facturable et retards ;
- pré-facturier par mois ;
- lecture des CRA de l’implantation ;
- filtres multi-consultants, multi-statuts, année et mois ;
- ouverture d’un CRA en lecture seule depuis la liste ou le pré-facturier ;
- validation ou refus motivé ;
- résultat de validation détaillant factures créées et jours écartés ;
- accès explicite et journalisé à la marge d’un consultant ;
- consultation des factures de son périmètre.

### Facturation

- tableau de bord des factures brouillon/émises et du TTC émis ;
- pré-facturier en lecture seule ;
- liste de factures avec filtres d’état et compteurs ;
- détail vendeur, client, mentions, lignes et TVA ;
- émission d’une facture avec protection contre le double envoi ;
- accès à la version imprimable.

### Hors périmètre assumé aujourd’hui

Authentification de production, gestion des utilisateurs, affectation de missions, forfait,
comptabilité, paiements, relances, envoi réel des factures, facturation électronique, notifications,
délégations, plan de charge, exports métier, OCR et assistant IA. Ces absences ne doivent pas être
confondues avec des défauts de la maquette.

## 4. Ce qui fonctionne particulièrement bien

### 4.1 Un récit métier complet

La valeur de la maquette vient de son enchaînement : une saisie produit une décision, la décision
produit une ou plusieurs factures, et les jours non facturables restent expliqués. Ce lien est plus
convaincant qu’une collection d’écrans indépendants.

### 4.2 Des rôles qui changent réellement l’expérience

La navigation, les colonnes, les actions et les refus diffèrent selon le rôle. La marge n’est pas
exposée comme une destination permanente et la facturation ne reçoit pas les boutons de décision du
manager. Cela rend les principes de moindre privilège et de séparation des tâches visibles pendant
la démonstration.

### 4.3 Une bonne gestion des états réels

Les écrans ne supposent pas que tout réussit : mois vierge, liste vide, filtre sans résultat,
permission insuffisante, portée incorrecte, session périmée, CRA refusé, soumission incomplète,
erreur réseau et corrélation sont pris en charge. C’est un vrai point de maturité.

### 4.4 Une grille CRA pensée comme un outil de travail

La grille possède déjà plusieurs détails utiles : colonne activité fixe, semaines, jours non
ouvrés, valeurs au quart de journée, déplacement au clavier, totaux immédiats, remplissage rapide,
indication de surcharge et prévention de la perte de modifications. La transposition mission × jour
est adaptée à une activité de conseil multi-missions.

### 4.5 Une direction visuelle disciplinée

La palette est sobre, les statuts sont sémantiques, les couleurs ne portent jamais seules
l’information, les cartes et tableaux partagent les mêmes règles, et la sidebar crée une structure
stable. L’ensemble ressemble à un produit interne crédible et non à un dashboard décoratif.

### 4.6 Une base d’accessibilité supérieure à la moyenne des maquettes

Lien d’évitement, focus visible, intitulés accessibles, régions défilables atteignables au clavier,
libellés désambiguïsés, réduction des animations, contrôle axe et navigation de la grille au clavier
sont de bons choix. La documentation ne revendique pas abusivement une conformité complète.

### 4.7 Des données de démonstration crédibles

Le volume de consultants, les implantations, l’historique, les statuts variés, le départ d’une
consultante et les mois denses rendent la maquette beaucoup plus convaincante qu’un écran contenant
trois lignes parfaites.

## 5. Constats et recommandations détaillés

### P0 — À corriger avant une démonstration décisionnelle

#### P0.1 — L’émission ne donne pas une synthèse financière suffisante

> **Statut 05/09 :** shipped — Gardé **B1** (densification), confirmé par `docs/audit-ceo-readiness-2026-09-05.md` : « Present in list/detail/issuance with provisional markers. No blind issuance found. »

Une facture brouillon n’expose pas les trois cartes de total, car `totals` est absent tant qu’elle
n’est pas émise. Le dialogue d’émission n’affiche le total TTC que si ce même champ existe. Il peut
donc demander de figer un document sans afficher le montant final dans la confirmation. En revanche,
il montre une clé technique `Idempotency-Key`, qui n’aide pas l’utilisateur à décider.

**Proposition :** faire répondre le serveur avec un aperçu de calcul non contractuel pour le
brouillon et afficher, dans le dialogue : client, période, nombre de lignes, total HT, TVA, TTC et
conséquence irréversible. Garder la clé d’idempotence invisible. Proposer un lien « Revoir les
lignes » et placer l’action d’émission dans une zone visuellement distincte.

**Critère de succès :** la personne peut répondre sans calcul mental à « quel montant et quel client
vais-je figer ? ».

#### P0.2 — Les actions en attente et leur destination ne sont pas toujours alignées

> **Statut 05/09 :** shipped — Gardé **A1** (ADR-0091, item 22 QA round 3 : chaque compteur manager mène à la liste qu’il compte) ; le résidu (discriminant consultant manquant sur la file de facturation, F10) est fermé par cette passe, commit `c5005b6`.

Le tableau de bord manager compte désormais des CRA soumis sur d’autres périodes, mais son bouton
ouvre le pré-facturier sans cibler nécessairement la période concernée. Le compteur dit donc « il y
a du travail », puis peut conduire à un écran où ce travail n’apparaît pas.

**Proposition :** remplacer la seule carte d’action par une mini-file de travail contenant les
éléments actionnables, triés par ancienneté, avec consultant, période, retard éventuel et lien vers
le bon CRA. Conserver les KPI comme synthèse secondaire.

**Critère de succès :** chaque compteur actionnable mène en un clic à une liste contenant exactement
les éléments qu’il compte.

#### P0.3 — Une partie de l’historique existe mais n’est pas atteignable

> **Statut 05/09 :** shipped pour l’essentiel — Gardé **A12** (dont **A6a/A6b**, pagination et sélecteur de mois dédié). Le résidu nommé par F07 (page hors-plage confondue avec un résultat filtré vide) est fermé par cette passe, commit `e96863d`.

Le pré-facturier dérive ses périodes d’une page plafonnée de CRA. Avec le volume actuel, Paris et
Lyon peuvent ne plus proposer les périodes historiques 2016–2024. La liste des factures est elle
aussi plafonnée à 50 sans pagination visible. Un utilisateur peut raisonnablement croire qu’il n’y
a rien de plus.

**Proposition :** créer une requête dédiée aux périodes disponibles, puis une pagination serveur
visible pour les listes. Afficher le total de résultats et la plage courante. Les filtres doivent
porter sur l’ensemble du jeu de données et non uniquement sur la page déjà chargée.

**Critère de succès :** toute donnée autorisée peut être retrouvée sans connaître son URL ni passer
par l’API.

### P1 — Fort impact sur l’usage quotidien

#### P1.1 — Le tableau de bord est un résumé, pas encore un espace de pilotage

> **Statut 05/09 :** shipped — Gardé **A1** (réorganisation en file de travail / « Ce mois » / activité récente). Le résidu nommé par F11 (le CTA « Ouvrir mon CRA » restait dupliqué sur le mois courant, au-delà de ce qu’ADR-0097 avait déjà retiré pour un autre mois) est fermé par cette passe, commit `874b544`.

Le premier écran montre trois cartes et une action. Au début du mois, il est largement vide et donne
peu de raisons d’y rester. Pour une maquette revue le 1er septembre, les zéros du mois courant sont
logiques mais affaiblissent l’impact de la première impression.

**Proposition :** organiser le tableau de bord en trois niveaux :

1. « À faire maintenant » : actions concrètes et inter-périodes ;
2. « Ce mois » : les KPI actuels ;
3. « Activité récente » : dernières transitions importantes, limitées au périmètre du rôle.

Pour la démonstration, ajouter un accès explicite « Voir un mois avec des données » plutôt qu’un
paramètre caché dans l’URL.

#### P1.2 — Le responsive couvre une tablette, pas un téléphone

> **Statut 05/09 :** still open (acceptation, pas implémentation) — Gardé **A11**, décision desktop+mobile prise. `docs/audit-ceo-readiness-2026-09-05.md` : rendu tactile échantillonné et sain, mais aucun parcours dédié saisie→soumission au format tactile promis (390×844) n’a encore couru. Hors périmètre de cette passe ; voir BUILD-PLAN Phase 10.

Le projet « mobile-shell » utilise 768 × 1024 px avec un profil desktop. Le tiroir de navigation est
bien testé, mais les cartes restent sur trois colonnes, les blocs de facture sur deux colonnes, et
les tableaux reposent principalement sur le défilement horizontal. À 360–430 px, la densité devient
problématique.

**Proposition :** choisir explicitement entre :

- **desktop/tablette uniquement**, avec un message honnête sous une largeur minimale ;
- **téléphone supporté**, avec cartes en une colonne, topbar simplifiée, identité compacte, actions
  collées en bas, tableaux transformés en cartes ou colonnes prioritaires, et grille CRA en mode
  semaine plutôt qu’en mois complet.

Ajouter au minimum des tests à 390 × 844 px, zoom 200 % et orientation paysage.

#### P1.3 — La grille CRA impose une forte charge cognitive

> **Statut 05/09 :** shipped pour son cœur — Gardé **A9** (légende, activité/total collants, progression, action « aller au jour incomplet »). Le mode « semaine » (ancien **O5**) est shipped, pas optionnel : la densification l’a promu en Gardé comme moitié desktop de **A11**, et le sélecteur mois/semaine existe (`apps/web/src/features/cra/components/cra-grid-screen.tsx`, `desktopView`). Restent still open les deux vraies optionnelles, **O6** et **O7**, non engagées.

L’écran combine navigation mensuelle, ajout d’activité, codes couleur, week-ends, semaines, outils
par ligne, sélecteurs par cellule, totaux et alertes. Il est efficace une fois appris, mais peu
auto-explicatif. Les icônes de ligne ont un nom accessible, mais pas de libellé ou d’aide visible au
survol/focus. Le mois complet oblige à beaucoup défiler.

**Proposition :**

- ajouter une légende compacte et escamotable ;
- afficher de vraies info-bulles focus/survol sur les actions de ligne ;
- proposer un mode « semaine » en complément du mois ;
- garder la colonne d’activité **et la colonne du total mensuel** fixes ;
- ajouter « Aller au premier jour incomplet » après un refus ;
- afficher une barre de progression « X/Y jours ouvrés complets » ;
- distinguer clairement « enregistré » de « soumis » avec la date de dernière sauvegarde ;
- étudier « Copier le mois précédent » avec aperçu, sans écraser les cellules existantes ;
- permettre d’annuler immédiatement la dernière action de remplissage/vidage.

#### P1.4 — Les tableaux n’offrent pas une ergonomie homogène de données

> **Statut 05/09 :** partiellement traité — Gardé **A8** (filtres, compteurs, pagination livrés) + **A12**. Le tri restait un contrôle qui prétendait trier tout le résultat et n’en triait qu’une page (F06) : cette passe (commit `9c2d72d`) ne le referme pas complètement — elle rend sa portée honnête (désactivé sur les trois tables server-paginées) et reporte le tri global à une ADR non encore écrite, `docs/open-questions.md`, Phase 10/30-09/2026.

La plupart des listes n’ont ni tri par colonne, ni pagination, ni recherche commune, ni choix de
densité. Les filtres sont bons sur la liste CRA manager, mais absents ou plus limités ailleurs.

**Proposition :** définir un contrat commun de table : total de résultats, tri serveur, pagination,
état des filtres dans l’URL, bouton de réinitialisation, colonnes numériques alignées à droite et
état vide spécifique aux filtres. Ajouter une recherche client/numéro aux factures et une recherche
consultant au pré-facturier.

Ne pas ajouter de cases à cocher tant qu’aucune action groupée n’existe.

#### P1.5 — Plusieurs lignes de facture sont difficiles à distinguer

> **Statut 05/09 :** shipped — Gardé **A7** (discriminant consultant sur les listes de factures et le pré-facturier). Le même trou sur la file « à faire maintenant » de facturation (F10) est fermé par cette passe, commit `c5005b6`.

Dans le pré-facturier, plusieurs brouillons peuvent porter le même client, sans numéro ni total.
La ligne n’expose pas assez d’information pour comprendre pourquoi il existe plusieurs documents.

**Proposition :** montrer un discriminant utile : missions ou consultants sources, nombre de lignes,
implantation si nécessaire, date de création, ou un identifiant court de brouillon. Rendre la ligne
ouvrable et non seulement lisible.

#### P1.6 — La validation manager est immédiate malgré ses conséquences

> **Statut 05/09 :** still open, optionnel — **O4** (récapitulatif avant validation) non engagé ; hors périmètre de cette passe et non couvert par un numéro F.

« Valider » déclenche directement la création des brouillons de facture, puis montre le résultat.
C’est fluide, mais sensible à un clic accidentel et moins rassurant qu’une étape de vérification.

**Proposition :** lorsque le CRA contient des jours signalés ou plusieurs clients, ouvrir une
confirmation synthétique : consultant, période, jours, jours signalés, factures attendues et jours
écartés. Pour un CRA simple, conserver une validation rapide mais offrir une annulation très brève
si le domaine le permet ; sinon expliciter l’irréversibilité avant le clic.

#### P1.7 — Les textes exposent l’architecture au lieu d’aider la décision

> **Statut 05/09 :** shipped — Gardé **B2** (les identifiants d’ADR ont largement quitté l’interface normale). Le résidu nommé par F14 (trois textes qui promettaient ce que l’interface ne tient pas : une facture brouillon « qui changera », un rapport CSE « joint ci-dessous », un panneau d’organigramme muet en cas d’échec) est fermé par cette passe, commit `feb6b7f`.

Des messages visibles citent des ADR, « côté serveur », la clé d’idempotence, les modules ou des
détails de piste d’audit. Ces éléments sont intéressants pour une démonstration technique, mais ils
alourdissent un outil métier et donnent l’impression d’une documentation injectée dans le produit.

**Proposition :** écrire d’abord une phrase métier courte. Déplacer l’explication technique dans un
mode « Montrer les coulisses » réservé à la démonstration ou dans la documentation. Exemples :

- « Les totaux se mettent à jour pendant la saisie et sont confirmés à l’enregistrement. »
- « Aucun autre mois n’est disponible dans le calendrier. »
- « Cette action est sécurisée contre les doubles clics. » — uniquement si cette information est
  réellement utile ; sinon ne rien afficher.

#### P1.8 — Le détail de facture manque de navigation contextuelle

> **Statut 05/09 :** shipped — Gardé **A10** (fil d’Ariane contextuel, retour avec filtres, lien imprimable secondaire). Le tri de la table des lignes reste soumis à la même réserve que P1.4 (F06).

Le titre global reste « Factures », le fil d’Ariane ne représente qu’Accueil → Factures, et il n’y
a pas de retour visible vers la liste avec ses filtres. La page locale affiche le client, mais ne
porte pas son identité dans le shell.

**Proposition :** utiliser `Factures → [Client] — [Période]`, conserver le filtre au retour, et
ajouter des liens vers les CRA sources autorisés. Le lien « Version imprimable » doit être présenté
comme une action secondaire avec une icône d’ouverture dans un nouvel onglet.

### P2 — Qualité de vie et finition

#### P2.1 — Sauvegarde et feedback

> **Statut 05/09 :** shipped — Gardé **B3** (état de sauvegarde persistant). F02 (un changement de persona annulé efface la session malgré des modifications visibles à l’écran) reste ouvert, hors périmètre de cette passe.

Le toast « Enregistré » confirme l’action, mais disparaît et n’indique pas quand la version courante
a été sauvegardée. La protection de navigation évite une perte accidentelle, ce qui est déjà bien.

**Proposition :** ajouter un état persistant près des actions : « Modifications non enregistrées »,
« Enregistrement… », « Enregistré à 14:32 », « Échec — réessayer ». Un autosave peut être étudié,
mais seulement avec une stratégie claire de conflit et sans rendre ambiguë la différence entre
brouillon et soumission.

#### P2.2 — Cohérence des unités

> **Statut 05/09 :** shipped — Gardé **B4**, partiellement fait le 25/08 (décision D5, `frenchDays`). Le résidu nommé par F03 (le prix unitaire imprimé au quart de journée à côté d’une quantité déjà convertie en jours) est fermé par cette passe, commit `f28a267` : les deux documents impriment désormais jours × taux journalier, jamais un mélange d’unités.

Le CRA parle en jours, certaines lignes de facture en quarts de journée, et la marge affiche une
quantité brute dont l’unité n’est pas toujours évidente. La cohérence comptable est correcte, mais
la lecture demande une conversion mentale.

**Proposition :** toujours afficher l’unité dans l’en-tête et, lorsque pertinent, la double lecture
`88 quarts = 22 j`. Ajouter une aide contextuelle sur TJM et CJM.

#### P2.3 — Densité et hiérarchie visuelle

> **Statut 05/09 :** still open, optionnel — **O8** non engagé ; hors périmètre de cette passe et non couvert par un numéro F.

Le tableau de bord laisse une grande surface vide, tandis que le pré-facturier et le détail de
facture empilent beaucoup de blocs verticaux. La sidebar réserve aussi un pied vide. Cette retenue
est préférable à des fonctions factices, mais l’espace peut mieux porter l’information utile.

**Proposition :** utiliser la surface libre pour la file de travail et l’activité récente ; ajouter
une barre récapitulative collante sur les longs détails ; conserver la sobriété et éviter les
graphiques inventés.

#### P2.4 — Filtres et vues mémorisées

> **Statut 05/09 :** still open, optionnel — **O9** non engagé (les vues nommées personnelles restent explicitement exclues, **X6**, faute de vrais comptes) ; hors périmètre de cette passe.

Les filtres CRA vivent dans l’URL, ce qui est excellent. Il manque la possibilité de conserver une
vue fréquente telle que « mes consultants, CRA soumis ou refusés ».

**Proposition :** commencer par des liens partageables et un bouton « Copier le lien de cette vue ».
Les vues nommées et personnelles ne deviennent pertinentes qu’avec de vrais comptes.

#### P2.5 — Journal d’activité lisible

> **Statut 05/09 :** shipped, avec réserve — Gardé **A3** (chronologie métier livrée, item 30 QA round 3). Le résidu nommé par F12 (elle ne reconstruit que les colonnes de statut courantes, pas `public.domain_events` — un CRA renvoyé efface son refus précédent de la vue) est traité par cette passe, commit `6c29e0e` : une légende dit maintenant honnêtement ce que le composant montre. Un historique complet adossé aux événements reste une décision non prise ici (voir `docs/plan-densification.md`, item A3, annotation du 05/09).

Le système possède une forte notion de traçabilité, mais l’utilisateur final ne voit pas une
chronologie simple : créé, enregistré, soumis, refusé, corrigé, validé, facture créée puis émise.

**Proposition :** ajouter sur le CRA et la facture une timeline métier concise, avec acteur, date et
conséquence. Les identifiants techniques restent disponibles dans un panneau secondaire.

#### P2.6 — Accessibilité à compléter manuellement

> **Statut 05/09 :** clos par décision, pas par implémentation — une revue manuelle (NVDA/VoiceOver, zoom 200 %, contraste documenté) reste explicitement hors périmètre de la maquette (ligne README « Ce que je ne construis pas », **X5**). Ce n’est pas un gap oublié ; ne pas la rouvrir sans décision de Clement.

Les tests automatiques couvrent les erreurs critiques/sérieuses, mais ne vérifient pas la qualité de
l’ordre de lecture, la compréhension des annonces dynamiques, le zoom, les contrastes réels sur
tous les états ni la fatigue liée à la grille.

**Proposition :** réaliser une revue courte avec NVDA + Firefox et VoiceOver + Safari, un parcours
sans souris, un test à 200 % de zoom et un test de contraste documenté. Inclure les popovers ouverts,
les dialogues après erreur et le défilement horizontal de la grille.

## 6. Innovation orientée apprentissage

> **Statut 05/09 :** cette section correspond au **Lot 3** de `docs/plan-densification.md` (L1-L6)
> et à sa **§6.5/§6.7** exclues. Deux éléments sont **shipped** : 6.2 filiation interactive
> (Gardé **A4**, « Keep this as a strong CEO demonstration moment » per l’audit CEO) et 6.4
> glossaire contextuel (Gardé **B5**). Le reste (6.1, 6.3, 6.6 — Optionnel **O10/O2/O4**, non
> engagés) reste **still open**, et 6.5/6.7 (bac à sable, assistant IA) sont **superseded par
> décision explicite** : `CLAUDE.md` exclut désormais tout le Lot 3/Lot 4 d’une suite à cette passe
> — ne pas les construire pour « finir » cette section.

L’innovation utile ici n’est pas un chatbot posé sur chaque écran. Le produit possède déjà un
excellent matériau pédagogique : règles métier, rôles, événements, calculs et filiation des
données. Il faut rendre ce matériau explorable.

### 6.1 Parcours guidés par scénario

Proposer depuis le sélecteur de persona quatre scénarios facultatifs :

- **Consultant :** compléter puis soumettre un mois ;
- **Manager :** repérer, relire et valider un CRA ;
- **Facturation :** vérifier puis émettre une facture ;
- **Contrôle :** constater un accès refusé hors périmètre.

Chaque scénario indique 3 à 5 étapes, progresse avec les vraies actions et peut être quitté. Il ne
doit pas bloquer l’usage libre.

### 6.2 Filiation interactive des données

Depuis une ligne de facture, ouvrir un panneau montrant :

`jour du CRA → mission → quantité → tarif daté → ligne HT → groupe de TVA → total TTC`.

Cette vue ferait à la fois office d’aide, de preuve de calcul et de support de démonstration. Elle
matérialise la valeur différenciante de la maquette mieux qu’un long texte sur la piste d’audit.

### 6.3 « Pourquoi ce résultat ? »

Sur les KPI, marges, jours écartés et statuts, ajouter une explication en langage métier : formule,
données sources, date de référence et règle appliquée. L’information technique détaillée reste
derrière un second niveau.

### 6.4 Glossaire contextuel

TJM, CJM, CRA, régie, forfait, pré-facturier, habilitation et idempotence ne doivent pas être
supposés connus. Un glossaire accessible depuis les termes, au clavier comme au toucher, peut
expliquer le concept en une phrase et proposer un exemple.

### 6.5 Laboratoire de scénarios réversible

Créer à terme un mode bac à sable séparé des données de démonstration stables : l’utilisateur peut
modifier un TJM, rendre une mission non facturable, fractionner un jour ou changer un taux de TVA,
puis observer les conséquences. Un bouton remet le scénario à zéro.

Ce mode est plus formateur qu’une vidéo, car il permet de construire une intuition causale sans
risquer les données principales.

### 6.6 Comparaison avant/après validation

Au moment de valider, montrer ce qui va changer : statut du CRA, lignes acceptées, lignes écartées,
brouillons créés et accès qui deviennent disponibles. Cette prévisualisation apprend le workflow en
même temps qu’elle sécurise l’action.

### 6.7 Assistant explicatif, seulement en dernier

Un assistant pourrait répondre à « pourquoi ce jour n’est-il pas facturé ? » ou « d’où vient ce
montant ? », mais seulement s’il cite les données et règles exactes de l’écran. Il ne doit ni
inventer une règle, ni effectuer une mutation, ni exposer des informations hors périmètre. Avant
d’envisager de l’IA, les explications déterministes précédentes apportent plus de valeur, pour moins
de risque.

## 7. Plan priorisé

### Lot 0 — Fiabiliser la démonstration

| ID  | Action                                                                             | Impact    | Effort relatif |
| --- | ---------------------------------------------------------------------------------- | --------- | -------------- |
| D1  | Afficher HT, TVA et TTC avant émission ; retirer la clé technique                  | Très fort | Moyen          |
| D2  | Faire pointer chaque action du dashboard vers la bonne période et le bon objet     | Très fort | Moyen          |
| D3  | Remplacer les textes contenant ADR/serveur/idempotence par du langage métier       | Fort      | Faible         |
| D4  | Rendre les brouillons homonymes distinguables et ouvrables depuis le pré-facturier | Fort      | Faible à moyen |
| D5  | Ajouter un accès visible à un mois de démonstration riche depuis un dashboard vide | Moyen     | Faible         |

**Sortie attendue :** aucune action critique sans récapitulatif, aucun compteur sans destination
cohérente, aucune fuite de vocabulaire d’architecture dans le parcours normal.

> **Statut 05/09 :** shipped en entier. D1→**B1**, D2→**A1** (résidu F10 fermé par `c5005b6`),
> D3→**B2** (résidu F14 fermé par `feb6b7f`), D4→**A7** (résidu F10 fermé par `c5005b6`),
> D5→**A5**. Voir la table de traçabilité `docs/plan-densification.md` §10 pour chaque alias.

### Lot 1 — Rendre le travail quotidien efficace

| ID  | Action                                                                  | Impact    | Effort relatif |
| --- | ----------------------------------------------------------------------- | --------- | -------------- |
| Q1  | File de travail inter-périodes sur les dashboards                       | Très fort | Moyen          |
| Q2  | Requête dédiée aux périodes + pagination serveur visible                | Très fort | Moyen à fort   |
| Q3  | Recherche et tri homogènes dans CRA, pré-facturier et factures          | Fort      | Moyen          |
| Q4  | Améliorer la grille : légende, progression, erreurs, colonne total fixe | Fort      | Moyen          |
| Q5  | Afficher l’état de sauvegarde persistant et l’heure                     | Fort      | Faible à moyen |
| Q6  | Ajouter retour contextuel et breadcrumbs de détail                      | Moyen     | Faible         |
| Q7  | Harmoniser l’affichage des unités jours/quarts                          | Moyen     | Faible         |

**Sortie attendue :** une personne trouve n’importe quel élément autorisé, comprend ce qui lui
reste à faire et atteint l’action utile sans détour.

> **Statut 05/09 :** shipped pour l’essentiel, un point partiel. Q1→**A1**, Q2→**A12** (résidu F07
> fermé par `e96863d`), Q4→**A9** (sous-ensemble, extensions optionnelles still open), Q5→**B3**
> (F02 reste ouvert, hors périmètre), Q6→**A10**, Q7→**B4** (résidu F03 fermé par `f28a267`).
> **Q3 reste partiel** : filtres/tri/recherche existent, mais le tri ne portait que sur la page
> chargée (F06) — cette passe (`9c2d72d`) rend sa portée honnête plutôt que de le compléter ; le
> tri global sur les trois tables server-paginées est reporté, `docs/open-questions.md` (Phase 10,
> 30/09/2026).

### Lot 2 — Décider et construire la stratégie responsive

| ID  | Action                                                             | Impact    | Effort relatif |
| --- | ------------------------------------------------------------------ | --------- | -------------- |
| R1  | Tester 390 px, zoom 200 %, paysage et clavier tactile              | Fort      | Faible         |
| R2  | Décider officiellement desktop-only ou mobile supporté             | Très fort | Décision       |
| R3  | Si mobile : cartes empilées, tables adaptatives, identité compacte | Très fort | Fort           |
| R4  | Si mobile : vue hebdomadaire du CRA et actions collées             | Très fort | Fort           |

**Sortie attendue :** aucune promesse implicite de mobile que les écrans métier ne peuvent tenir.

> **Statut 05/09 :** décision prise (R2 : mobile supporté) et largement construit — Gardé **A11**
> (chaîne consultant), **O5/O13** promus avec lui, **X2** (desktop-only) annulé. `docs/audit-ceo-
readiness-2026-09-05.md` a échantillonné un rendu tactile sain (profil iPhone 13, 390×664, sans
> violation axe ni débordement), mais **aucun parcours dédié saisie → soumission tactile** (R1/R4,
> 390×844) n’a encore couru — **still open**, hors périmètre de cette passe, avant l’acceptation du
> 09/09 (BUILD-PLAN Phase 10).

### Lot 3 — Ajouter la couche pédagogique

| ID  | Action                                                | Impact    | Effort relatif |
| --- | ----------------------------------------------------- | --------- | -------------- |
| L1  | Glossaire contextuel des termes métier                | Fort      | Faible à moyen |
| L2  | Explications « Pourquoi ce résultat ? » déterministes | Très fort | Moyen          |
| L3  | Filiation interactive CRA → facture → TVA             | Très fort | Moyen à fort   |
| L4  | Parcours guidés facultatifs par persona               | Fort      | Moyen          |
| L5  | Timeline métier sur CRA et facture                    | Fort      | Moyen          |
| L6  | Bac à sable réversible de scénarios                   | Très fort | Fort           |

**Sortie attendue :** un nouveau lecteur comprend le processus en l’utilisant, sans devoir lire le
README ou les ADR.

> **Statut 05/09 :** mixte, et **CLAUDE.md exclut désormais toute suite à ce lot**. L1→**B5**
> (shipped) et L5→**A3** (shipped, avec la réserve F12 traitée par cette passe, `6c29e0e` — voir
> l’intitulé P2.5 plus haut) et L3→**A4** (shipped) sont livrés. L2/L4/L6 (**O2/O10**, et **X3** pour
> le bac à sable) restent **still open** — non engagés, et ne doivent pas être construits pour
> « finir » cette section : ce serait exactement le nouveau chantier produit que la consigne de ce
> travail interdit.

### Lot 4 — ERP cible, hors maquette actuelle

À prioriser seulement si le produit sort du rôle de démonstrateur :

- authentification réelle et cycle de vie des comptes ;
- affectation de missions et contrôle des habilitations ;
- notifications configurables et digest de fin de mois ;
- délégation temporaire des validations ;
- commentaires et boucle de correction structurée ;
- exports CSV/PDF et intégrations comptables ;
- facturation électronique et envoi ;
- paiement, relance et avoir complet ;
- préférences personnelles, vues enregistrées et fuseaux horaires ;
- observabilité produit, support et politique de conservation.

L’écran d’affectation de missions demandé précédemment appartient à ce lot. Son report explicite est
cohérent : il ouvre un nouveau chemin d’écriture, de nouvelles autorisations et des règles PASSI ;
ce n’est pas une simple page supplémentaire.

> **Statut 05/09 :** l’écran d’affectation en a été **sorti et construit** — Gardé **A14**
> (`/affectations`), seul élément de ce lot à l’être. Le reste de la liste reste **hors maquette par
> décision**, désormais explicite dans `CLAUDE.md` (« What this mockup does NOT build » / README
> « Ce que je ne construis pas ») — ce n’est pas un residu à fermer, c’est un périmètre tenu.

## 8. Recommandations écran par écran

| Écran                 | À conserver                                                        | À améliorer en premier                                                                     |
| --------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| Sélecteur de persona  | Quatre choix clairs, transparence sur l’absence d’authentification | Ajouter le scénario associé à chaque rôle et raccourcir encore le texte de notice          |
| Dashboard consultant  | Statut, jours saisis, jours restants, alertes de refus             | Progression du mois, dernière sauvegarde, accès à un mois rempli, prochaine action unique  |
| Dashboard manager     | KPI adaptés au rôle                                                | File de CRA à décider toutes périodes et liens vers les éléments exacts                    |
| Dashboard facturation | Brouillons, émises, TTC émis                                       | Brouillons les plus urgents, anomalies et montants prêts à émettre                         |
| Liste CRA             | Filtres URL, statuts, ouverture d’un mois                          | Tri, pagination, total de résultats, vues fréquentes                                       |
| Grille CRA            | Matrice, quarts, totaux, clavier, signaux                          | Légende, mode semaine, progression, undo, dernier enregistrement                           |
| Pré-facturier         | Vue croisée factures/CRA, décisions et marge explicites            | Recherche, périodes complètes, brouillons distinguables, actions inter-périodes            |
| Marge                 | Accès volontaire et journalisé, trois KPI                          | Définition TJM/CJM, unité de quantité, explication de calcul et timeline de consultation   |
| Liste factures        | Filtres d’état avec compteurs                                      | Recherche client/numéro, pagination, tri, total filtré                                     |
| Détail facture        | Informations légales, lignes, TVA, imprimable                      | Totaux avant émission, filiation vers CRA, titre contextuel, retour conservant les filtres |
| États erreur/refus    | Messages dédiés et identifiant de corrélation                      | Action de récupération concrète : réessayer, revenir, contacter avec référence copiée      |
| Shell                 | Navigation par rôle, repli desktop, tiroir                         | Vraie stratégie téléphone, identité compacte, breadcrumb à plusieurs niveaux               |

## 9. Mesure de réussite

Avant d’ajouter beaucoup de fonctions, instrumenter quelques mesures simples :

- temps entre l’arrivée et la première action utile ;
- taux de CRA soumis sans erreur au premier essai ;
- nombre de jours incomplets au moment de la soumission ;
- délai médian soumission → décision ;
- nombre de clics dashboard → CRA effectivement actionnable ;
- taux de retour arrière depuis le dialogue d’émission ;
- temps pour retrouver une facture de plus d’un an ;
- fréquence des défilements horizontaux et abandon sur petit écran ;
- usage des aides « Pourquoi ? » et du glossaire ;
- score de réussite sur quatre scénarios utilisateurs courts.

Un test utilisateur de 30 minutes avec deux consultants, deux managers et une personne de la
facturation apporterait plus de valeur qu’une nouvelle série de raffinements purement visuels. Les
tâches à observer sont : saisir un mois multi-missions, corriger un refus, valider un CRA d’un mois
précédent, retrouver une facture historique et expliquer l’origine d’un montant TTC.

## 10. Ordre recommandé des décisions

1. **Décider la cible immédiate :** démonstration desktop ou outil pilote réellement utilisé.
2. **Sécuriser les actions financières** et les destinations des files de travail.
3. **Rendre toutes les données existantes retrouvables** avant d’augmenter encore le volume.
4. **Nettoyer la couche de langage** pour séparer produit métier et démonstration technique.
5. **Tester cinq utilisateurs réels** sur les parcours actuels.
6. **Améliorer la grille et les tables** en fonction des blocages observés.
7. **Ajouter la pédagogie déterministe** — filiation, formules, glossaire, timeline.
8. **N’envisager les fonctions ERP larges ou l’IA** qu’après validation de l’usage du cœur CRA →
   facture.

## Conclusion

La maquette a déjà la qualité la plus difficile à obtenir : elle est cohérente avec le métier et
elle prouve autre chose qu’un style graphique. Le prochain saut de qualité ne viendra pas d’une
sidebar plus riche ou de graphiques supplémentaires. Il viendra d’une meilleure orchestration de
l’attention, d’une explication progressive des règles et d’une navigation directe entre les causes
et leurs conséquences.

En résumé : conserver la sobriété, rendre chaque compteur actionnable, chaque montant explicable,
chaque action irréversible vérifiable et chaque donnée historique retrouvable.
