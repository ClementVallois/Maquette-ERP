# Plan de densification — ce qu'on garde, ce qui est optionnel, ce qu'on laisse

**Date :** 2 septembre 2026
**Origine :** `docs/audit-produit-ui-ux.md` (1er septembre 2026), plus quatre constats vérifiés en
base et en code le 2 septembre qui n'y figuraient pas, ou pas sous cette forme.
**Décision de cadrage (Clement, 02/09/2026) :** l'avancement dans `docs/BUILD-PLAN.md` est **mis en
pause** — au moins pour aujourd'hui. L'objet du moment n'est plus la phase suivante, c'est de rendre
la maquette **plus fournie et plus démonstrative à l'écran**. Deux semaines de travail ont produit
une chaîne métier complète mais une surface visible mince ; ce document trie ce qui corrige ça.

> **Langue.** Ce document est en français, comme `docs/audit-produit-ui-ux.md` et `docs/todo.md`, et
> pour la même raison : c'est un document de pilotage adressé à Clement, pas un artefact de code. La
> règle « tout en anglais » de `CLAUDE.md` continue de s'appliquer au code, aux commits et aux ADR.

Ce document **ne modifie aucun code** et **n'ouvre aucune ADR**. Il décide de la répartition ; les
décisions structurelles qu'il rend nécessaires sont nommées ligne par ligne et restent à écrire au
moment où elles seront prises.

---

## 1. Ce que la maquette contient réellement, mesuré

Relevé en base le 02/09/2026 sur un `db:reset && seed` courant, et par lecture du code. Ces chiffres
servent d'assise à tout le reste du document : plusieurs arbitrages de l'audit changent de sens
selon eux.

| Grandeur                                  | Valeur mesurée                                                                                                                                            |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Consultants                               | **48** (1 partie : `departure_date`)                                                                                                                      |
| Répartition par implantation              | Paris 22 · Lyon 20 · **Bordeaux 5** · **Rennes 1**                                                                                                        |
| Répartition par pôle                      | Audit 12 · GRC 11 · SOC 9 · Offensive Security 8 · IAM 8                                                                                                  |
| Missions                                  | **7** — dont 5 en `Regie`, 1 `Forfait`, 1 `Intercontrat`                                                                                                  |
| Clients                                   | **5**                                                                                                                                                     |
| Affectations                              | 45                                                                                                                                                        |
| CRA                                       | 147 validés + 1 soumis, sur **8 périodes distinctes**                                                                                                     |
| Périodes portant des CRA                  | 2016-06 · 2018-06 · 2020-06 · 2022-06 · 2024-06 (3 à 4 CRA chacune) · **2026-06 / 07 / 08 (43 CRA chacune)**                                              |
| Factures                                  | **66** — 2016 : 4 émises · 2018 : 4 brouillons · 2020 : 4 émises · 2022 : 3 brouillons + **1 annulée par avoir** · 2024 : 3 émises · 2026 : 47 brouillons |
| Écrans (routes)                           | 9, plus la page imprimable                                                                                                                                |
| Écrans atteignables **par un consultant** | **3**                                                                                                                                                     |

La dernière ligne est le cœur du sujet.

---

## 2. « On n'a que 3 écrans » — c'est littéralement vrai

`apps/web/src/config/navigation.ts` donne au rôle `consultant` exactement **deux entrées** de
navigation : le tableau de bord et `/cra`. Le parcours complet d'un consultant est donc : tableau de
bord → liste de ses CRA → grille d'un CRA. **Trois écrans** (plus le relevé imprimable, qui
n'apparaît qu'après validation). Neuf routes existent, mais la persona qu'on ouvre en premier en voit
trois, et deux d'entre elles sont des listes.

Les deux autres rôles sont moins mal servis : le manager a **quatre** entrées de navigation et
atteint sept écrans (dont la marge, uniquement par clic depuis une ligne du pré-facturier —
ADR-0052 : chaque lecture est une divulgation journalisée, jamais une destination permanente) ; la
facturation a **trois** entrées et atteint quatre écrans. Ce n'est pas une impression, c'est une
propriété du fichier de navigation.

À quoi s'ajoutent trois causes de vide, toutes vérifiées :

1. **Les tableaux de bord sont trois `StatCard` et une carte d'action.** 199 lignes de composant
   pour, à l'écran, quatre blocs sur une grille de trois colonnes. C'est l'écran d'atterrissage des
   trois personas, et c'est le plus pauvre des neuf.
2. **On est en septembre, et septembre est vide exprès.** Les mois denses du seed sont juin, juillet
   et août 2026. Septembre est laissé vierge **délibérément** pour que le parcours interactif
   créer → soumettre → valider de `apps/web/e2e/journeys.spec.ts` ait un mois vierge où travailler
   (voir `docs/todo.md`, item 2 de la deuxième liste). ⚠️ **« Remplir septembre » n'est donc pas une
   option** : ça casse la suite e2e. Le substitut est D5 ci-dessous.
3. **Une partie des données existantes n'arrive jamais à l'écran** — voir la section suivante.

---

## 3. Cinq constats vérifiés le 02/09, en plus de l'audit

L'audit avait raison sur ses trois P0, mais pas toujours pour la bonne raison. Le premier constat
ci-dessous **corrige une erreur d'analyse** avant d'énoncer ce qui est réellement vrai — et ce qui
l'est colle de plus près au « ça fait vide » du brief que ce que l'audit décrivait. Trois des cinq
constats n'étaient pas dans l'audit du tout — dont le dernier, remonté par Clement le 02/09.

### 3.1 — Aucun montant ne s'affiche pour 54 factures sur 66 ✅

**Correction d'une première lecture erronée.** Une première analyse concluait que le plafond
`?limit=50` de `fetchInvoiceList()` cachait 16 factures. C'est faux : la requête du dépôt porte
`WHERE office_id = $1` — la liste est **toujours scopée à l'implantation**, y compris pour le rôle
facturation. Compté par implantation, aucune ne dépasse le plafond :

| Implantation | Factures | Plafond atteint ? |
| ------------ | -------- | ----------------- |
| Paris        | 29       | non               |
| Lyon         | 23       | non               |
| Bordeaux     | 11       | non               |
| Rennes       | 3        | non               |

Rien n'est donc caché aujourd'hui, et les compteurs des pastilles de filtre sont justes. **Mais
trois faits réels subsistent, et le deuxième est un vrai trou visuel :**

**a) Le plafond tronque en silence — et il saute.** Chaque mois dense ajoute 15 à 16 factures ; Paris
est à 29. Deux mois denses de plus et l'écran de Paris franchit 50 **sans rien afficher qui le
signale** : la liste n'a ni total de résultats, ni pagination, ni indication de troncature, et rien
dans la réponse ne distingue « il y en avait exactement 50 » de « il y en avait 300 ». Le commentaire
de `features/factures/api.ts` justifie le plafond par « le seed tient dans une page » — la prémisse
tient encore, de peu, et rien ne préviendra le jour où elle tombera.
→ **Tranché par Clement le 02/09 : le plafond fixe disparaît, remplacé par une vraie pagination.**
C'est **A12**, qui inventorie les sept emplacements où ce plafond vit. Ce paragraphe décrit donc un
défaut en cours de correction, pas une veille.

**b) 54 factures sur 66 s'affichent sans montant.** Vérifié en base : `total_ttc_cents` est **`NULL`
pour les 54 brouillons** (il n'est écrit qu'à partir de l'émission — c'est la règle corrigée par
l'item 12 de la QA round 2). La colonne TTC de la liste est donc vide sur **20 des 29 lignes de
Paris**, et le pré-facturier a le même trou. C'est le « les écrans sont vides » du brief, au sens
littéral : la donnée manquante n'est pas décorative, c'est **le montant**, sur la majorité des
lignes. Le même vide explique B1 — le dialogue d'émission n'a aucun total à afficher parce qu'aucun
n'est calculé avant l'émission.

**c) L'historique existe partout, mais il est enterré.** Chaque implantation porte bien ses factures
2016 → 2024 (Paris : 2 émises 2016, 2 brouillons 2018, 2 émises 2020, 1 brouillon + **la seule
annulée par avoir** 2022, 1 émise 2024). Elles sont atteignables — mais au bas d'un tableau de 29
lignes **sans tri, sans recherche et sans filtre d'année**, sous 20 brouillons 2026 qui se
ressemblent tous. Et l'unique facture annulée par avoir n'existe qu'à Paris : le manager de Lyon ne
peut pas voir cette démonstration.

### 3.2 — Le sélecteur de mois du pré-facturier n'offre que 3 mois à Paris et Lyon

Déjà nommé dans `docs/todo.md` et `docs/open-questions.md` (ligne du 31/08), re-vérifié en base par
implantation :

| Implantation           | Mois proposés dans le sélecteur       |
| ---------------------- | ------------------------------------- |
| Paris (22 consultants) | 2026-06, 2026-07, 2026-08             |
| Lyon (20)              | 2026-06, 2026-07, 2026-08             |
| **Bordeaux (5)**       | 2016-06 → 2026-08, **les 8 périodes** |
| Rennes (1)             | 2026-06, 2026-07, 2026-08             |

`MAX_MONTHS = 50` (`apps/api/src/composition/pre-facturier.ts`) lit une page de CRA triée par
période décroissante : à Paris et Lyon les trois mois denses la remplissent seuls. Le seuil de
réouverture que le README nommait lui-même (« une implantation dont les CRA dépassent une page ») est
franchi.

### 3.3 — La raison écrite de ne pas faire de graphique n'est plus vraie

`dashboard-screen.tsx` porte, en commentaire d'en-tête : _« No chart: the seed holds one period, and
a curve on one point is the visual lie task 8.4 explicitly refuses. »_ Le seed porte maintenant
**8 périodes de CRA et 6 années de factures**. La prémisse est caduque — mais la **règle** qu'elle
servait (ne pas dessiner de courbe sur un point) reste bonne, et elle contraint le choix de la série
(§5, A2) : 8 périodes dont 5 espacées de 24 mois font une frise honnête, pas une tendance mensuelle.

### 3.4 — Neuf chaînes affichées à l'utilisateur citent un identifiant d'ADR

`apps/web/src/lib/labels.ts` porte, ligne 205, une décision explicite du 25/08 : _« un identifiant
d'ADR ne s'affiche jamais à l'utilisateur »_. Neuf chaînes d'affichage en citent un malgré tout —
`(ADR-0050)`, `(ADR-0004)`, `(ADR-0056)`, `(ADR-0053)`, `(ADR-0054)`, `(ADR-0059)`, `(ADR-0005)`,
`(ADR-0079)`, `(ADR-0006)`. Ce n'est pas une préférence de ton : c'est une décision déjà prise et non
appliquée. C'est aussi le correctif le moins cher de tout l'audit.

---

### 3.5 — Six factures au même client, même mois, même montant : cohérent, mais jamais arbitré ✅

_[todo item 13, remonté par Clement le 02/09]_

**Oui, c'est reproductible, et non, ce n'est pas un bug de code.** Mesuré en base :

| Implantation | Consultant      | HT          | Quarts | Lignes |
| ------------ | --------------- | ----------- | ------ | ------ |
| Paris        | Julien Fabre    | 17 600,00 € | 88     | 1      |
| Paris        | Léa Chevalier   | 17 600,00 € | 88     | 1      |
| Paris        | Antoine Perrin  | 17 600,00 € | 88     | 1      |
| Paris        | Sophie Gauthier | 17 600,00 € | 88     | 1      |
| Paris        | Nicolas Aubert  | 17 600,00 € | 88     | 1      |
| Paris        | Alice Martin    | 17 712,50 € | 88     | 2      |

Six factures « Banque Nationale de Test — 2026-06 », dont **cinq au centime près identiques**. Même
chose en juillet et en août, et 4 factures « Guyane Sécurité Informatique » par mois, et 3
« EuroSecure SPRL ». Vérifié aussi : **les doublons sont toujours à l'intérieur d'une même
implantation** — le discriminant que A7 doit ajouter n'a donc pas besoin de porter le bureau.

Trois causes, à distinguer parce qu'elles ne se corrigent pas au même endroit.

**a) Une facture par CRA validé, c'est la règle écrite.** ADR-0038 : une validation produit une
facture **par client distinct** parmi les missions du mois. Six consultants sur la même mission = six
validations = six factures. Le code fait exactement ce qui est décidé, et l'index unique
`idx_invoices_source_cra_client` confirme que la clé est `(CRA, client)`.

**b) Mais ADR-0038 n'a jamais examiné ce cas.** Relue avec l'item 13 en main : **chacune** de ses
options pèse le cas d'**un CRA couvrant plusieurs clients** — une facture par CRA avec des lignes par
client, une par mission, refuser de valider. Ses deux seuils de réouverture aussi (la clé bon de
commande, la clé période). L'option « **une facture par `(client, période)`, qui accumule ses lignes
au fil des validations** » n'y est ni retenue ni écartée : **elle est absente**. Ce n'est donc pas
une décision avec un seuil, c'est un angle mort que le cadrage de l'ADR a masqué.

Et le défaut par défaut du métier va dans l'autre sens : un cabinet envoie à la Banque Nationale
**une** facture de juin couvrant ses six consultants, pas six documents, six numéros et six
règlements à rapprocher.

⚠️ **Arbitrage de Clement, pas du document.** Les deux branches, avec leur coût réel :

- **Garder `(CRA, client)`.** Le domaine ne bouge pas ; toute la correction est **A7** (un
  discriminant sur la ligne : consultant source, mission, nombre de lignes). ADR-0038 reçoit un
  **amendement** actant que le cas multi-consultants a été examiné et que la clé reste volontairement
  celle-là, avec un seuil. Coût : faible.
- **Agréger sur `(client, période)`.** Une facture brouillon cesse d'être créée d'un coup et devient
  un document qui **accumule des lignes** au fil des validations. Ça touche
  `idx_invoices_source_cra_client`, la garantie d'idempotence qu'ADR-0038 se transmet explicitement à
  elle-même, et le récit « une validation → cette facture » que la démonstration raconte.
  Catégoriquement le plus gros changement du document.

**A7 est nécessaire dans les deux branches** — donc il est sûr de le construire tout de suite, quelle
que soit la décision.

➕ **Et A13 change les enjeux de cet arbitrage sans le trancher.** Aujourd'hui la ligne de facture ne
nomme pas le consultant : six documents identiques envoyés au même client, c'est indéfendable. Six
documents qui **nomment chacun son consultant**, c'est une chose normale à recevoir en régie. A13 ne
répond donc pas à la question « faut-il agréger ? », mais il rend la branche « garder
`(CRA, client)` » **nettement plus défendable** qu'elle ne l'est en l'état. À construire avant de
trancher, pas après.

**c) Les montants identiques sont garantis par le seed, pas par hasard.** Le `Tjm` est un taux **de
mission**, pas de consultant (les tables `grades` et `grade_tjm_defaults` existent mais sont dans
« Écarté » du README). Tout le monde sur une mission facture donc le même taux ; et un mois dense
donne à tout le monde exactement 88 quarts. La collision est **l'issue certaine** du seed actuel.
→ **O1** : faire varier le **nombre de jours travaillés** par consultant casse la collision bien
moins cher que faire varier les taux, et sans toucher à la décision « pas de grille de grades ».

---

## 4. Comment lire les trois colonnes

`CLAUDE.md` impose que tout point soulevé se résolve en **exactement une** de quatre issues : _fix
now_ · _nouvelle ADR_ · _une ligne dans « Ce que je ne construis pas » du README_ · _une ligne dans
`docs/open-questions.md` avec une phase nommée et une date_. Les trois colonnes de ce document s'y
rattachent, elles ne les remplacent pas :

- **Gardé** → _fix now_, avec mention explicite quand une ADR est due avec le code.
- **Optionnel** → rien n'est décidé tant que ce n'est pas pris ; si la session se termine sans que ce
  soit fait, chaque ligne restée ici bascule en ligne `docs/open-questions.md` avec la phase qui la
  tranchera.
- **Laissé de côté** → chaque ligne indique sa destination : ligne README, ligne open-questions, ou
  « déjà tranché » avec le renvoi.

Sans cette colonne de destination, ce fichier serait un quatrième tracker parallèle que la condition
d'arrêt du dépôt ne reconnaît pas.

**Contrainte de séquencement :** rien ici ne doit bloquer la Phase 8 (déploiement) plus tard. Toutes
les lignes retenues sont des changements applicatifs et de données ; aucune ne touche l'hébergement,
les images, ni les ADR-0028 à 0032.

**Colonne « Vérifié » :** ✅ = constaté en code ou en base le 02/09 ; ○ = repris de l'audit sans
re-vérification.

---

## 5. GARDÉ

> ⚠️ **Ce tri a grossi de quatre lignes pendant la session du 02/09**, au fil de décisions de
> Clement prises après la première version : **A11** (le téléphone, qui renverse la recommandation
> desktop-only), **A12** (la fin du plafond de 50, qui promeut l'ancien O3), **A13** (le consultant
> sur la ligne de facture, demande neuve) et **A14** (l'écran d'affectation, qui renverse le refus du
> 01/09). Chacune est écrite **comme un renversement**, avec ce qu'elle remplace — le tableau
> d'ordonnancement du §9 n'est donc pas le produit d'une seule passe, et se lit avec ça en tête.

### Groupe A — ce qui remplit l'écran

Classé par rapport densité visible / effort. Les identifiants entre crochets renvoient à l'audit.

#### A1 — Tableau de bord en trois niveaux, avec file de travail inter-périodes ✅

_[P1.1 + Q1 + P0.2 + D2, plus les trois lignes « Dashboard » du §8 de l'audit]_

L'écran d'atterrissage des trois personas passe de « trois chiffres et un bouton » à trois blocs :

1. **« À faire maintenant »** — la file d'éléments actionnables, **toutes périodes confondues**, avec
   pour chacun : qui, quelle période, l'ancienneté, et un lien vers **l'objet exact** (pas vers un
   écran où il faudra le rechercher). C'est le correctif de fond de P0.2, déjà nommé mais non
   corrigé par ADR-0082 : aujourd'hui le compteur du manager compte les CRA de toutes les périodes,
   mais son bouton ouvre le pré-facturier **de la période affichée** — le compteur dit « il y a du
   travail », le bouton mène à un écran où ce travail n'est pas.
2. **« Ce mois »** — les `StatCard` actuelles, inchangées, reléguées au rang de synthèse.
3. **« Activité récente »** — les dernières transitions du périmètre du rôle (voir A3, même source).

Par rôle : manager = CRA à décider ; consultant = son mois + ses refus ailleurs (déjà partiellement
là via `refusedPeriods`, ADR-0082) ; facturation = brouillons les plus anciens et montants prêts à
émettre.

**Pourquoi en premier :** c'est le seul écran vu par les trois personas, le plus vide des neuf, et il
est vide _en septembre précisément parce que le seed le veut_. Effort : moyen. Pas d'ADR (c'est
l'application d'ADR-0082, pas une nouvelle décision) — sauf si la file introduit un nouvel endpoint,
auquel cas la forme de la réponse se documente comme les autres.

#### A2 — Une frise historique honnête sur les tableaux de bord ✅

_[nouveau — §3.3 ci-dessus ; l'audit ne le proposait pas, il proposait même l'inverse]_

La raison écrite de refuser tout graphique est caduque. Deux séries sont **honnêtes** au sens où la
règle d'origine l'entendait :

- **Factures par année et par statut, 2016 → 2026** — 6 points réels, statuts contrastés (émise,
  brouillon, annulée par avoir). C'est la seule série de la base qui raconte vraiment une histoire.
- **Facturable des trois mois denses (juin, juillet, août 2026)** — 3 barres, **libellées comme trois
  mois**, jamais présentées comme une tendance.

Ce qui reste interdit : une courbe mensuelle sur 12 mois, qui rendrait 3 barres et 9 zéros — le même
mensonge visuel sous un autre nom. Et la frise doit dire ce qu'elle omet (les périodes sans donnée
sont un trou du jeu de démonstration, pas une activité nulle).

**Ce que ça exige :** une **ADR** — on inverse une décision écrite dans le code, avec son option
écartée (« aucun graphique ») et son seuil (« si le jeu de données redevient mono-période, la frise
tombe »). Et charger la compétence `dataviz` avant d'écrire la moindre ligne de graphique. Effort :
moyen. **Impact visuel : le plus fort du document.**

#### A3 — Chronologie métier sur le CRA et sur la facture ✅

_[P2.5 + L5]_

créé → enregistré → soumis → refusé → corrigé → validé → facture créée → émise, avec l'acteur, la
date et la conséquence. Les données existent déjà (`public.domain_events`, les colonnes de statut,
`validatedBy`), donc rien n'est inventé. C'est un bloc riche, qui remplit la hauteur des écrans de
détail, et qui **montre la piste d'audit au lieu de l'affirmer** dans une phrase.

Les identifiants techniques restent dans un second niveau. Effort : moyen. Pas d'ADR si la
chronologie se lit des données déjà persistées ; une ADR si elle exige d'exposer `domain_events` sur
le fil (c'est une surface d'API nouvelle, et elle est lisible par rôle).

#### A4 — Filiation CRA → ligne → TVA → total ✅

_[§6.2 + L3]_

Depuis une ligne de facture, un panneau qui déroule : `jour du CRA → mission → quantité → TJM daté →
ligne HT → groupe de TVA → total TTC`. `InvoiceLine` porte déjà son origine (`cra_id`, `mission_id` —
c'est même l'argument de conformité du README sur l'art. 289-VII du CGI), donc la donnée est là.

C'est simultanément : un écran de plus, une aide, une preuve de calcul, et **le support de
démonstration qui distingue cette maquette d'un CRUD**. Effort : moyen à fort. Pas d'ADR si c'est une
lecture ; une ADR si ça ajoute un endpoint dédié.

#### A5 — Un accès visible à un mois riche depuis un tableau de bord vide ✅

_[D5]_

Corollaire obligatoire de la contrainte « septembre reste vierge » (§2.2). Un lien explicite « Voir
un mois avec des données » vers juin/juillet/août 2026, plutôt qu'un paramètre d'URL que seul celui
qui a écrit le code connaît. Effort : faible. Pas d'ADR.

#### A6 — Faire remonter l'historique : le sélecteur de mois, et un filtre d'année ✅ _(morceau visible de A12)_

_[P0.3 + Q2, scindé en deux moitiés de coût très différent]_

- **A6a — le sélecteur de mois du pré-facturier (§3.2).** Une requête dédiée « périodes disponibles »
  au lieu de dériver les mois d'une page de CRA plafonnée. C'est le seul des sept emplacements de
  A12 où le correctif n'est **pas** une pagination : un sélecteur de mois n'a pas de pages, il a
  besoin de la liste **exhaustive** des périodes — donc une requête distincte, pas un `limit` plus
  généreux. Ce qui se voit : 8 périodes au lieu de 3 à Paris et Lyon. **Gardé.**
- **A6b — un filtre d'année sur la liste des factures (§3.1c).** Rien n'est caché, mais l'historique
  2016 → 2024 est enterré sous 20 brouillons 2026 qui se ressemblent, dans un tableau sans tri ni
  recherche. Un filtre d'année — le même que celui déjà construit pour la liste CRA des managers
  (item 4, `docs/todo.md`, commit `ecaf924`) — fait remonter six années d'un coup, pour un coût
  connu. **Gardé.** Et le filtre doit être **porté par le serveur**, pas par la vue : filtrer une page
  tronquée donne un résultat faux dès que la troncature existe — c'est le point 3 de A12.

**Ce que ça exige :** plus rien en propre — **A6 est absorbé par A12**. A6a (le sélecteur de mois) et
A6b (le filtre d'année porté par le serveur) sont deux des sept emplacements que A12 inventorie, et
l'ADR que A12 appelle couvre les deux. Ils restent listés ici parce que ce sont les deux morceaux qui
**se voient à l'écran** — les six années de factures qui remontent, les 8 périodes du sélecteur au
lieu de 3 — là où le reste de A12 est de la plomberie. À construire avec A12, pas avant.

#### A7 — Brouillons de facture distinguables et ouvrables ✅

_[P1.5 + D4]_

Dans le pré-facturier, plusieurs brouillons portent le même client sans numéro ni total, donc rien ne
dit pourquoi il y en a plusieurs. Afficher un discriminant réel (missions ou consultants sources,
nombre de lignes, date de création) et rendre la ligne ouvrable. Vérifié en base : 47 brouillons 2026
pour 5 clients — la collision est systématique, pas théorique. Effort : faible à moyen. Pas d'ADR.

#### A8 — Contrat de table commun : recherche, tri, total de résultats ✅

_[P1.4 + Q3, moins la pagination serveur]_

Aujourd'hui `data-table.tsx` n'a **ni tri, ni recherche, ni pagination** — son propre commentaire
d'en-tête l'assume au motif que « les listes tiennent en une page », ce qui n'est plus vrai. Un
contrat commun : nombre total de résultats affiché, tri par colonne, état des filtres dans l'URL
(déjà le cas sur la liste CRA), bouton de réinitialisation, colonnes numériques alignées à droite,
état vide spécifique au filtre. Plus une recherche client/numéro sur les factures et une recherche
consultant sur le pré-facturier.

**Pas de cases à cocher** tant qu'aucune action groupée n'existe. Effort : moyen. Pas d'ADR.

#### A9 — La grille CRA lisible sans apprentissage ○

_[P1.3 + Q4, sous-ensemble retenu]_

Retenu : légende compacte escamotable · vraies info-bulles focus/survol sur les actions de ligne ·
**colonne du total mensuel figée** en plus de la colonne d'activité · barre de progression
« X/Y jours ouvrés complets » · « Aller au premier jour incomplet » après un refus.

Le mode semaine (ancien O5) n'est plus ici ni en optionnel : il est **promu avec A11**, dont il est
la moitié desktop — A9 et A11 partagent le même travail de découpage et se construisent ensemble.
Restent en optionnel : « Copier le mois précédent » (O6) et l'annulation de la dernière action de
remplissage (O7). Effort du sous-ensemble retenu : moyen. Pas d'ADR en propre.

#### A10 — Navigation contextuelle sur le détail de facture ○

_[P1.8 + Q6, et la ligne « Détail facture » du §8]_

Titre `Factures → [Client] — [Période]` au lieu de « Factures » ; retour à la liste **en conservant
ses filtres** ; liens vers les CRA sources autorisés (recoupe A4) ; « Version imprimable » présentée
comme action secondaire ouvrant un onglet. Effort : faible. Pas d'ADR.

#### A11 — Le chemin critique du consultant sur téléphone ✅

_[remplace la recommandation « desktop-only » de la première version de ce document — décision de
Clement, 02/09/2026. Absorbe P1.2, R2, R3, R4, et rend O5 et O13 obligatoires.]_

**Ce qui a changé.** La première version proposait d'assumer desktop/tablette et d'écrire une ligne
« pas de téléphone » dans le README, avec pour seuil de réouverture « si la maquette doit être
ouverte depuis un téléphone ». Clement a nommé le cas d'usage qui **est** ce seuil : un consultant
qui remplit son CRA dans le métro. Le seuil est franchi avant d'avoir été écrit ; la ligne README ne
sera donc pas écrite, et cette entrée la remplace.

**Le périmètre, et il est délibérément étroit.** Le téléphone est tenu pour **la chaîne consultant
seulement** :

`sélecteur de persona → tableau de bord → Mes CRA → grille et saisie → soumettre`

Le manager qui décide sur des données de marge et la facturation qui fige un document numéroté
restent du travail de bureau — et ça se défend à voix haute, ce n'est pas une dérobade. Les écrans de
ces deux rôles gardent le comportement actuel sous 768 px.

**Ce que ça coûte, mesuré :**

| Point                           | État vérifié le 02/09                                                                                                                                        | Travail                                           |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------- |
| Cartes de KPI                   | `grid-cols-3` **codé en dur dans 9 endroits**, sans préfixe de point de rupture — trois cartes côte à côte à 390 px                                          | Mécanique, faible risque                          |
| Densité responsive globale      | **29 utilitaires responsive dans toute la SPA** (19 `sm:`, 5 `md:`, 5 `lg:`)                                                                                 | La base est à construire, pas à ajuster           |
| Liste « Mes CRA »               | Tableau                                                                                                                                                      | Passage en cartes sous un point de rupture        |
| **La grille CRA**               | 31 colonnes de jour × `min-w-[2.75rem]` ≈ **1360 px**, plus la colonne d'activité figée → environ **3,5 écrans** de défilement horizontal par ligne à 390 px | **Le vrai travail** — voir l'arbitrage ci-dessous |
| Saisie d'une cellule            | 🟢 **Déjà tactile** : chaque cellule est un `<select>` natif à cinq options (ADR-0068), donc c'est le sélecteur de l'OS qui s'ouvre                          | Rien à faire                                      |
| Actions enregistrer / soumettre | En haut de page                                                                                                                                              | Barre collante en bas                             |

La dernière bonne nouvelle est la plus importante : **le modèle de saisie est déjà natif au tactile,
seule la largeur de la matrice est cassée.** Le travail est un choix de présentation, pas une
réécriture du modèle d'entrée.

⚠️ **Arbitrage de Clement : mode « jour » ou mode « semaine » ?**

- **Mode jour** — on choisit un jour, on voit ses missions, on tape ses quarts. C'est la tranche
  native du téléphone, et elle colle exactement au cas nommé (« remplir hier dans le métro »). La
  grille est déjà missions × jours : un jour est une **coupe d'un modèle qui existe**. 🔴 Mais c'est
  aussi l'option que **ADR-0070 a explicitement rejetée** — voir plus bas, c'est le point dur de
  cette ligne.
- **Mode semaine** (O5) — 7 colonnes plutôt que 31. Correct sur tablette, encore serré à 390 px, mais
  c'est le même travail de découpage et il sert aussi le desktop.

**Recommandation : le mode jour pour le téléphone, le mode semaine comme moitié desktop du même
découpage — sous réserve de l'ADR ci-dessous, qui n'est pas une formalité.** Les deux se construisent sur la même coupe ; le désaccord ne porte que sur la vue par
défaut sous un point de rupture. **O5 cesse d'être optionnel** : c'est la moitié desktop de A11.

**Ce que ça exige côté tests.** `apps/web/playwright.config.ts` n'a **pas de projet téléphone** :
`mobile-shell` est en 768 × 1024 avec un profil **desktop**, et il teste le point de rupture du
`Sheet`, pas un téléphone. Il faut un vrai profil d'appareil à 390 × 844 — donc **O13 cesse d'être
optionnel** — et le parcours créer → soumettre de `journeys.spec.ts` a besoin de sa propre couverture
mobile.

🔴 **ADR obligatoire, et elle renverse une option nommément écartée.** Vérifié dans ADR-0070 : le
mode jour n'est pas une présentation neuve, c'est **exactement son option rejetée n° 2** — « _A
day-detail panel: click a day, edit its four quarters in a side sheet_ ». Elle est écartée pour deux
raisons explicites : ça remplace une surface balayable par 31 allers-retours dans un panneau, et **ça
cache précisément ce qu'un consultant ouvre l'écran pour vérifier — quels jours ne sont pas encore
complets**. On ne peut donc pas ajouter le mode jour en le présentant comme un complément : ce serait
faire rentrer par la fenêtre ce qu'ADR-0070 a mis dehors par la porte.

**Ce que l'ADR aurait à établir**, et l'argument existe :

- La première objection **suppose un viewport où la matrice est balayable**. À 390 px elle ne l'est
  pas — 3,5 écrans de défilement horizontal par ligne (mesuré ci-dessus). Sous un certain point de
  rupture, ADR-0070 compare donc le panneau à une surface balayable **qui n'existe plus**. L'ADR ne
  renverse pas la décision, elle la **borne à un viewport**, ce qu'ADR-0070 n'avait aucune raison de
  faire puisque le téléphone n'était pas dans son périmètre.
- La seconde objection, elle, reste **entièrement valable** et devient une condition : si le mode
  jour cache quels jours sont incomplets, il faut le rendre visible autrement. C'est la barre de
  progression « X/Y jours ouvrés complets » de **A9** — qui cesse d'être un confort et devient le
  prix d'entrée du mode jour.

⚠️ Si cet argument ne convainc pas Clement, **la conséquence est nette** : le mode semaine devient la
seule option, à 7 colonnes sur 390 px, et il faut l'assumer comme serré plutôt que de contourner
ADR-0070 en silence.

Effort : **fort** — c'est la ligne la plus chère du groupe A, et la seule qu'on ne peut pas se
contenter de faire à moitié.

#### A12 — Supprimer le plafond fixe de 50 : une vraie pagination ✅

_[P0.3 + Q2 + O3, promu — décision de Clement, 02/09/2026 : « ça ne peut pas rester comme ça ».
Absorbe l'ancien O3, qui n'est plus optionnel.]_

**Ce qui a changé.** La première version de ce document classait la pagination serveur en optionnel,
au motif qu'aucune implantation ne dépasse encore le plafond (Paris est à 29 factures). Clement
tranche l'inverse, et le raisonnement tient : un plafond fixe qui tronque **en silence** n'est pas
une limite, c'est une bombe à retardement — et §3.1a montrait déjà que deux mois denses de plus
suffisent à ce que Paris le franchisse sans qu'aucun écran ne le dise.

**Où le plafond vit réellement.** Il n'y a pas un endroit à changer, il y en a **sept** — c'est le
premier livrable de cette ligne, avant tout code :

| Emplacement                                      | Constante                         | Rôle                                                                                         |
| ------------------------------------------------ | --------------------------------- | -------------------------------------------------------------------------------------------- |
| `apps/api/src/routes/api.ts:46`                  | `MAX_PAGE_SIZE = 50`              | Plafond partagé par **toutes** les routes de liste sauf `/api/v1/cras`                       |
| `apps/api/src/routes/api.ts:47`                  | `DEFAULT_PAGE_SIZE = 20`          | Taille par défaut si le client ne demande rien                                               |
| `apps/api/src/routes/api.ts:78`                  | `CRA_LIST_MAX_PAGE_SIZE = 200`    | Plafond propre à `/api/v1/cras` (ADR-0081)                                                   |
| `apps/api/src/routes/api.ts:672`                 | `limit: MAX_PAGE_SIZE, offset: 0` | Le pré-facturier lit **une page unique**, en dur                                             |
| `apps/api/src/composition/pre-facturier.ts:22`   | `MAX_MONTHS = 50`                 | Le sélecteur de mois — c'est A6a                                                             |
| `packages/billing/…/pg-invoice-repository.ts:30` | `MAX_PAGE_SIZE = 50`              | Bridage **dur** au dépôt : `Math.min(query.limit, 50)`                                       |
| `packages/timesheet/…/pg-cra-repository.ts:29`   | `MAX_PAGE_SIZE = 200`             | Idem côté CRA                                                                                |
| `apps/web/src/features/factures/api.ts`          | `LIST_LIMIT = 50`                 | Le client demande **exactement** le plafond, et n'a aucun moyen de savoir s'il a été atteint |

Le dernier point est le vrai défaut : le client demande 50, en reçoit 50, et **rien dans la réponse
ne distingue « il y en avait exactement 50 » de « il y en avait 300 »**.

**Ce qu'il faut construire :**

1. Un **compte total** dans la réponse de liste — c'est ce qui rend la troncature observable, et ce
   sans quoi aucune pagination n'a de sens. C'est aussi ce qui rend les compteurs de filtre justes en
   toute circonstance, et ce qui permet d'afficher « 29 résultats » ou « 1–50 sur 300 ».
2. Une **pagination serveur** (`limit`/`offset` déjà présents dans le schéma Zod) exposée par un vrai
   contrôle d'écran, sur la liste des factures, la liste CRA et le pré-facturier.
3. Les **filtres portés par le serveur**, pas par la vue : aujourd'hui le filtre de statut des
   factures s'applique côté client, sur la page déjà chargée. Filtrer une page tronquée donne un
   résultat faux dès que la troncature existe. (C'est A6b, qui devient un morceau de A12 plutôt qu'un
   contournement de A12.)
4. La suppression du bridage dur au dépôt, ou sa transformation en garde-fou explicite très au-dessus
   de la taille de page demandée.

**Ce que ça exige :** une **ADR**, et elle est déjà appelée par son nom. Le seuil de réouverture
d'**ADR-0081** dit textuellement : « le jour où cet écran gagne un contrôle de pagination qui lui est
propre » — c'est le jour même, par décision. Et ADR-0081 nomme aussi la conception à construire à ce
moment-là plutôt que de relever le nombre une troisième fois : le **compte exact**, qu'elle avait
écarté « pour l'instant » faute de contrôle de pagination à servir. La ligne « Pagination du
pré-facturier au-delà d'une page » du README tombe en même temps, et **A6a devient un morceau de
A12** au lieu d'une exception à négocier séparément.

Effort : **moyen à fort** — sept emplacements, deux dépôts, trois écrans, et un contrat de réponse
qui change. Mais il n'y a rien d'incertain dedans : c'est du travail connu, pas une recherche.

#### A13 — La ligne de facture dit **qui** a réalisé la prestation ✅

_[demande de Clement, 02/09/2026 — « faire apparaître ce qu'on facture, pour telle prestation de tel
consultant ». Nouveau, absent de l'audit.]_

**Ce que porte une ligne aujourd'hui**, lu en base :

```
Prestation Audit DORA — Banque Nationale — 2026-06   |  88 quarts  |  200 €  |  17 600,00 €
Prestation Audit DORA — Banque Nationale — 2026-06   |  88 quarts  |  200 €  |  17 600,00 €
```

Mission, période, quantité, prix. **Pas le consultant.** C'est pourquoi deux factures adressées à la
Banque Nationale pour juin sont indiscernables **sur le document lui-même**, et pas seulement dans la
liste : A7 apprend à distinguer deux lignes de tableau, A13 fait que **la facture est un document
correct**. En régie, c'est aussi ce que le client attend de lire — il valide des temps par personne.

**Et c'est presque gratuit.** Vérifié :

- `designation` n'est pas calculée dans `billing` : c'est une **fonction injectée par la racine de
  composition** (`apps/api/src/chain/validate-cra.ts:109`). Le module de facturation ne connaît
  jamais un type « nom de consultant » — **la frontière n'est pas touchée**.
- `event.payload.consultantId` est **déjà dans la portée** de la closure qui construit la chaîne :
  aucune signature à changer.
- `PgReferenceReader.consultantNames()` **existe déjà** (`reference-reader.ts:230`) et n'attend qu'un
  appelant. `apps/api` lit déjà `public.missions` pour la même raison ; lire `public.consultants` est
  le même geste.

⚠️ **Un piège, vérifié :** il y a **deux** callbacks `designation`, pas un —
`apps/api/src/chain/validate-cra.ts:108` et **`scripts/seed.ts:951`**. Ils doivent changer
**ensemble**, sinon les factures historiques du seed et celles créées par l'application affichent
deux formats différents, et c'est précisément le genre d'incohérence qu'un lecteur froid remarque.

Effort : **faible**. Pas d'ADR — la désignation est explicitement « présentation, pas une règle »
(commentaire de `reference-reader.ts:279`), et rien de structurel ne bouge.

#### A14 — L'écran d'affectation des missions aux consultants ✅

_[todo item 8 · Lot 4 de l'audit · ex-O15 — **décision de Clement du 02/09 qui renverse celle du
01/09**. Ce n'est plus une ligne de réouverture : c'est construit.]_

**Ce qui a changé depuis le refus du 01/09.** Rien dans la demande ; ce qui a changé, c'est ce qu'on
sait de son coût. Le refus était motivé par « nouvelle route, nouveau chemin d'écriture, nouvelle
surface d'autorisation, une ADR, à vérifier contre l'habilitation PASSI ». Trois de ces cinq points
sont moins chers que supposé :

- 🟢 **La règle PASSI n'est pas à écrire.** `packages/timesheet/src/domain/reference.ts` porte déjà
  `isAssigned(consultant, mission, date)` et `missingHabilitations(consultant, mission, date)` —
  datées toutes les deux, et la seconde **retourne les habilitations manquantes plutôt qu'un
  booléen**, précisément pour qu'un refus puisse nommer ce qui manque. Le message d'erreur de l'écran
  s'écrit tout seul.
- 🟢 **Aucune ligne du README n'est à retirer.** Vérifié : « Renvoyé à l'ERP cible » nomme « plan de
  charge et **moteur de contraintes de staffing** », pas l'affectation elle-même. Seule la décision
  du 01/09 la différait, et elle est levée.
- 🟢 **La table existe** : `public.assignments (consultant_id, mission_id, from_date, to_date)`.

**Ce qui est réellement nouveau, et ce que l'ADR doit trancher :**

1. **Qui possède l'écriture.** `assignments` est de la donnée de référence `public.*`, lue par les
   deux modules via `PgReferenceReader`, et **écrite par rien d'autre que le seed**. La décision
   n'est pas l'écran, c'est de **rendre la référence mutable**. Deux options à peser : un chemin
   d'écriture dans `timesheet` (qui possède la règle qui la lit), ou une préoccupation de niveau
   composition qu'aucun module ne possède.
2. **Les modifications rétroactives.** C'est l'arête vive, et c'est la question qu'un relecteur
   posera. Raccourcir le `to_date` d'une affectation sous des jours déjà saisis : un CRA **validé**
   est immuable (ADR-0005), donc le passé tient — mais un CRA **soumis** dont des jours tombent hors
   de l'affectation raccourcie devient invalidable, et un **brouillon** devient insoumettable. Soit
   l'écriture refuse quand elle orphelinerait des jours enregistrés, soit l'écran énonce la
   conséquence avant le clic. À trancher, pas à découvrir en production.
3. **L'interaction avec ADR-0079** : aucune affectation ne commence après la `departure_date` d'un
   consultant.

Effort : **fort** — ça reste la ligne la plus grosse du document. Mais c'est désormais la plus grosse
ligne **connue**, pas une ligne ouverte : c'est ça qui a changé depuis le 01/09.

### Groupe B — ce qui n'ajoute pas de densité mais ne peut pas rester en l'état

Deux de ces quatre lignes sont des défauts vérifiés, pas des préférences.

#### B1 — Un montant sur un brouillon : la colonne vide, et l'émission à l'aveugle ✅

_[P0.1 + D1]_

Vérifié : `types.ts` documente `totals` comme `null` tant que `status !== 'issued'`, et
`issuance-dialog.tsx` n'affiche le TTC que `{invoice.totals !== null && …}`. **Donc le dialogue qui
demande de figer irréversiblement un document n'affiche jamais son montant** — mais il affiche une
clé `Idempotency-Key`. C'est la seule action irréversible de la maquette, et c'est celle qui se fait
à l'aveugle.

**Et le même trou se voit ailleurs, en beaucoup plus large.** `total_ttc_cents` est `NULL` pour les
**54 brouillons sur 66** (§3.1b) : la colonne TTC de la liste des factures et celle du pré-facturier
sont donc **vides sur la majorité des lignes**. Ce n'est pas un détail de dialogue, c'est une colonne
de montant blanche sur les deux écrans les plus tabulaires de la maquette — une part directe du « ça
fait vide » du brief.

Correctif, un seul pour les trois endroits : un **aperçu de calcul non contractuel** côté serveur
pour un brouillon, servi à la liste, au pré-facturier et au dialogue. Ce dernier dit client, période,
nombre de lignes, HT, TVA, TTC, et la conséquence irréversible. Clé d'idempotence invisible.

⚠️ **Ce que ça n'a pas le droit d'être :** un montant qui ressemble à un total de facture émise. La
règle « une facture n'a de totaux qu'une fois émise » est un invariant du domaine, pas une lenteur —
l'aperçu doit être visiblement provisoire (libellé, mise en forme) et ne jamais être persisté.
Effort : moyen. **ADR due** — `totals is null until issued` est écrit « verbatim dans la route »
(Annexe A) ; l'aperçu ne se glisse pas à côté d'une règle écrite sans que la décision soit posée.

**Reclassé :** cette ligne est en groupe B parce que c'est d'abord une correction de justesse, mais
sa moitié « colonne TTC » est un gain de densité au même titre que le groupe A. C'est pourquoi elle
est au rang 2 du §9, avant tout le reste du groupe A.

#### B2 — Sortir les identifiants d'ADR des chaînes d'affichage ✅

_[P1.7 + D3]_

Neuf chaînes, contre une décision déjà écrite ligne 205 du même fichier (§3.4). Une phrase métier
d'abord ; l'explication technique va dans la documentation, ou dans un mode « Montrer les coulisses »
réservé à la démonstration. Effort : **faible**. Meilleur rapport crédibilité / coût du document.
Pas d'ADR (application d'une décision existante).

#### B3 — État de sauvegarde persistant sur la grille ○

_[P2.1 + Q5]_

« Modifications non enregistrées » / « Enregistrement… » / « Enregistré à 14:32 » / « Échec —
réessayer », affiché près des actions au lieu d'un toast qui disparaît. Distingue aussi « enregistré »
de « soumis », que la grille confond visuellement. **Pas d'autosave** (il faudrait une stratégie de
conflit, et il brouillerait justement cette distinction). Effort : faible à moyen. Pas d'ADR.

#### B4 — Unités : ce qui reste après la décision D5 du 25/08 ✅

_[P2.2 + Q7 — partiellement déjà résolu]_

Vérification faite : la décision D5 du 25/08 a déjà fixé l'unité d'affichage au jour, une fois pour
toutes, dans `format.ts` (`frenchDays`) — l'audit sous-estime ce qui est fait. **Reste** : la colonne
`quantity` de l'écran de marge, qui n'a pas de suffixe d'unité, et l'absence de définition de TJM et
CJM au point où ces sigles s'affichent (recoupe B5 ci-dessous). Effort : faible. Pas d'ADR.

#### B5 — Glossaire contextuel des termes métier ○

_[L1, et la ligne « Marge » du §8]_

CRA, TJM, CJM, régie, forfait, pré-facturier, habilitation, intercontrat : `CONTEXT.md` les définit
déjà tous, en un seul endroit qui fait autorité. Les exposer depuis les termes eux-mêmes, au clavier
comme au toucher. Classé en B et non en A parce que ça n'ajoute pas de surface, mais c'est peu cher
et ça sert directement le lecteur sans brief — la propriété que `CLAUDE.md` exige à chaque merge.
Effort : faible à moyen. Pas d'ADR.

---

## 6. OPTIONNEL

À prendre si le temps le permet, dans cet ordre. Rien ici n'est engagé ; toute ligne non prise à la
fin de la session bascule en ligne `docs/open-questions.md` avec la phase qui la tranchera.

| ID      | Ligne                                                               | Origine                                               | Pourquoi optionnel                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Effort         |
| ------- | ------------------------------------------------------------------- | ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- |
| **O1**  | **Enrichir le jeu de données : plus de missions et de clients** ✅  | nouveau (§1)                                          | 48 consultants se partagent **5 missions en régie et 5 clients** ; Rennes n'a **qu'un** consultant. Le pré-facturier et les factures répètent donc les cinq mêmes noms, ce qui plafonne la richesse perçue quel que soit le travail d'interface. C'est le levier de densité le moins cher en code — mais il touche le seed, donc `seed:fingerprint`, donc plusieurs assertions e2e (l'item 6 a coûté une réécriture complète de la suite pour cette raison). À prendre **en premier ou pas du tout**. | Moyen          |
| **O2**  | **« Pourquoi ce résultat ? » déterministe**                         | §6.3 + L2                                             | Sur les KPI, la marge, les jours écartés, les statuts : formule, données sources, date de référence, règle appliquée. Très fort pédagogiquement, mais recoupe largement A4 (filiation) et A3 (chronologie) — à faire **après** eux, pour ne pas construire trois fois la même explication.                                                                                                                                                                                                            | Moyen          |
| **O3**  | ~~Pagination serveur visible sur les listes~~                       | P0.3 + Q2                                             | ⬆️ **Promu en Gardé (A12)** le 02/09, décision de Clement : « ça ne peut pas rester comme ça ». N'est plus optionnel.                                                                                                                                                                                                                                                                                                                                                                                 | —              |
| **O4**  | **Confirmation avant validation d'un CRA**                          | P1.6 + §6.6                                           | « Valider » crée directement les brouillons. Une confirmation récapitulative (consultant, période, jours signalés, factures attendues, jours écartés) sécurise l'action **et** enseigne le workflow. Optionnel parce que la validation est déjà réversible en pratique dans une maquette, et que B1 traite l'action réellement irréversible.                                                                                                                                                          | Faible à moyen |
| **O5**  | ~~Mode « semaine » sur la grille CRA~~                              | P1.3                                                  | ⬆️ **Promu en Gardé** : c'est la moitié desktop du découpage de **A11**. N'est plus optionnel.                                                                                                                                                                                                                                                                                                                                                                                                        | —              |
| **O6**  | « Copier le mois précédent » avec aperçu                            | P1.3                                                  | Utile en usage réel, peu visible en démonstration. Ne doit jamais écraser une cellule existante.                                                                                                                                                                                                                                                                                                                                                                                                      | Moyen          |
| **O7**  | Annuler la dernière action de remplissage/vidage                    | P1.3                                                  | Confort de saisie.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Faible à moyen |
| **O8**  | Barre récapitulative collante sur les longs détails                 | P2.3                                                  | Pré-facturier et détail de facture empilent beaucoup de blocs verticaux. Complète A10.                                                                                                                                                                                                                                                                                                                                                                                                                | Faible         |
| **O9**  | « Copier le lien de cette vue »                                     | P2.4                                                  | Les filtres vivent déjà dans l'URL ; il ne manque que le bouton. Les vues nommées n'ont de sens qu'avec de vrais comptes — **elles, c'est non** (§7).                                                                                                                                                                                                                                                                                                                                                 | Faible         |
| **O10** | Parcours guidés facultatifs par persona                             | §6.1 + L4, et la ligne « Sélecteur de persona » du §8 | Quatre scénarios de 3 à 5 étapes depuis le sélecteur de persona (saisir et soumettre · décider · émettre · constater un refus de portée). Excellent pour une démonstration sans accompagnement, mais c'est une couche de produit en soi. Ne doit jamais bloquer l'usage libre.                                                                                                                                                                                                                        | Moyen          |
| **O11** | Action de récupération concrète sur les écrans d'erreur et de refus | ligne « États erreur/refus » du §8                    | Réessayer / revenir / copier la référence de corrélation. Les états existent déjà et sont bons ; il leur manque une sortie.                                                                                                                                                                                                                                                                                                                                                                           | Faible         |
| **O12** | Fil d'Ariane à plusieurs niveaux dans le shell                      | ligne « Shell » du §8                                 | Recoupe A10. À faire avec lui ou pas du tout.                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Faible         |
| **O13** | ~~Tests à 390 × 844 px, zoom 200 %, orientation paysage~~           | R1                                                    | ⬆️ **Promu en Gardé** : **A11** exige un vrai projet Playwright à 390 × 844 avec un profil d'appareil, `mobile-shell` étant en 768 × 1024 sur profil desktop. N'est plus optionnel.                                                                                                                                                                                                                                                                                                                   | —              |
| **O14** | Chronologie des consultations de la marge                           | ligne « Marge » du §8                                 | Chaque lecture de marge est une divulgation journalisée (ADR-0052) ; l'afficher rendrait le contrôle visible plutôt qu'affirmé. Recoupe A3.                                                                                                                                                                                                                                                                                                                                                           | Faible à moyen |
| **O15** | ~~Écran d'affectation des missions aux consultants~~                | todo item 8, `docs/todo.md`                           | ⬆️ **Promu en Gardé (A14)** le 02/09, décision de Clement qui renverse celle du 01/09. Trois des cinq motifs du refus se sont révélés moins chers que supposé (règle PASSI déjà écrite, aucune ligne README à retirer, table existante). N'est plus optionnel.                                                                                                                                                                                                                                        | —              |

---

## 7. LAISSÉ DE CÔTÉ

Identifiants préfixés `X` pour ne pas les confondre avec les `L1`–`L6` du Lot 3 de l’audit, qui sont autre chose. Chaque ligne indique **où elle atterrit** — sans quoi elle serait un report déguisé en décision.

| ID      | Ligne                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Origine                            | Destination                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **X1**  | Tests utilisateurs, mesures d'usage, instrumentation                                                                                                                                                                                                                                                                                                                                                                                                                                       | §9 (les 10 mesures) et §10.5       | ❌ **Sans objet ici.** Il n'y a pas d'utilisateur : c'est une maquette de démonstration, pas un produit en service. Instrumenter des métriques d'usage sur zéro utilisateur serait un décor. → aucune ligne à créer ; le §9 de l'audit est explicitement écarté par ce document.                                                                                                                                                             |
| **X2**  | ~~Support téléphone réel~~                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | R2, R3, R4 + P1.2                  | ⛔ **Annulé le 02/09.** Cette ligne proposait « desktop et tablette uniquement » avec pour seuil de réouverture « si la maquette doit être ouverte depuis un téléphone ». Clement a nommé ce cas d'usage le jour même — un consultant remplissant son CRA dans le métro. Le seuil est franchi avant d'avoir été écrit : **aucune ligne README ne part**, et le sujet remonte en **A11**, avec un périmètre restreint à la chaîne consultant. |
| **X3**  | Bac à sable de scénarios réversible                                                                                                                                                                                                                                                                                                                                                                                                                                                        | §6.5 + L6                          | ❌ **Non.** Un second jeu de données mutable à côté du seed stable, avec remise à zéro, est un sous-système entier — et il double la surface que `seed:fingerprint` doit garantir. → **ligne README**, seuil : « si la maquette devient un support de formation ».                                                                                                                                                                           |
| **X4**  | Assistant IA explicatif                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | §6.7                               | ✅ **Déjà tranché.** Le README le range dans « Renvoyé à l'ERP cible » (« assistant IA et OCR »). L'audit lui-même le classe en dernier et note que les explications déterministes (A3, A4, O2) valent mieux pour moins de risque. → aucune ligne à créer, le renvoi existe.                                                                                                                                                                 |
| **X5**  | Audit RGAA, tests NVDA/JAWS/VoiceOver, déclaration de conformité                                                                                                                                                                                                                                                                                                                                                                                                                           | P2.6 + §2                          | ✅ **Déjà tranché.** Ligne README existante : « l'accessibilité **mécanique** est tenue et testée », l'audit avec technologie d'assistance est explicitement écarté. → aucune ligne à créer. Ne pas revendiquer davantage.                                                                                                                                                                                                                   |
| **X6**  | Vues nommées et enregistrées                                                                                                                                                                                                                                                                                                                                                                                                                                                               | P2.4                               | ❌ **Non** — elles n'ont de sens qu'avec de vrais comptes, et l'authentification de production est hors périmètre par construction. O9 (lien partageable) est le substitut retenu. → couvert par la ligne README existante sur l'authentification.                                                                                                                                                                                           |
| **X7**  | Cases à cocher et actions groupées dans les tables                                                                                                                                                                                                                                                                                                                                                                                                                                         | P1.4                               | ❌ **Non**, et l'audit le dit lui-même : pas de cases à cocher tant qu'aucune action groupée n'existe. → rien à créer.                                                                                                                                                                                                                                                                                                                       |
| **X8**  | Autosave sur la grille CRA                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | P2.1                               | ❌ **Non.** Exige une stratégie de conflit, et brouille la distinction brouillon / soumis que B3 existe précisément pour clarifier. → **ligne README**, seuil : « si la saisie devient assez longue pour qu'une perte soit probable ».                                                                                                                                                                                                       |
| **X9**  | Les dix sujets « ERP cible » du Lot 4 : authentification réelle et cycle de vie des comptes · affectation de missions et contrôle des habilitations · notifications configurables et digest · délégation temporaire des validations · commentaires et boucle de correction structurée · exports CSV/PDF et intégrations comptables · facturation électronique et envoi · paiement, relance, avoir complet · préférences et fuseaux horaires · observabilité produit, support, conservation | §7 Lot 4                           | ✅ **Déjà tranchés, tous les dix**, dans « Ce que je ne construis pas » ou « Renvoyé à l'ERP cible » du README, avec leur seuil. → aucune ligne à créer. Seule exception : **l'affectation de missions est construite** — Gardé **A14**, décision du 02/09. Sa ligne « moteur de contraintes de staffing » au README, elle, reste écartée : A14 affecte, il n'optimise pas un plan de charge.                                                |
| **X10** | Génération de PDF, Factur-X                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Lot 4                              | ✅ **Déjà tranché** — ligne README (« la facture est une page HTML imprimable »).                                                                                                                                                                                                                                                                                                                                                            |
| **X11** | Thème sombre                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | absent de l'audit, souvent demandé | ✅ **Déjà tranché** — ligne README, avec son seuil. Noté ici pour qu'on ne le rouvre pas au nom de la densité visuelle.                                                                                                                                                                                                                                                                                                                      |
| **X12** | Le §10 de l'audit (« ordre recommandé des décisions »)                                                                                                                                                                                                                                                                                                                                                                                                                                     | §10                                | ⛔ **Remplacé par ce document.** Son point 1 (« décider la cible : démonstration ou outil pilote ») est tranché : **démonstration**. Son point 5 (tester cinq utilisateurs) est écarté par X1. Le reste est absorbé dans §5 et §6.                                                                                                                                                                                                           |

---

## 8. Ce qui ne bouge pas

Quatre contraintes que rien dans ce document n'autorise à contourner. Elles ne sont pas des
préférences : trois sont dans `CLAUDE.md` ou `BUILD-RULES.md`, la quatrième est une propriété
mesurée du dépôt.

1. **Septembre 2026 reste vierge dans le seed.** `journeys.spec.ts` en dépend pour son parcours
   créer → soumettre → valider. Tout ce qui « remplit l'écran de septembre » passe par A1 et A5, pas
   par les données. (`docs/todo.md`, item 2 de la deuxième liste.)
2. **La frontière `billing` ⇸ `timesheet` tient.** A3 (chronologie) et A4 (filiation) traversent les
   deux modules par nature : ils se composent dans `apps/api` (racine de composition, ADR-0015), et
   la filiation lit l'origine que `InvoiceLine` porte déjà. Aucune ligne de ce document ne justifie
   une flèche nouvelle ; si l'une semble l'exiger, **c'est la règle qu'on discute, dans une ADR, pas
   le contournement** (`CLAUDE.md`, règle d'architecture 2).
3. **Rien ici ne bloque la Phase 8.** Tous les changements retenus sont applicatifs ou de données ;
   aucun ne touche l'hébergement, l'image, ni les ADR-0028 à 0032. La pause du BUILD-PLAN est une
   décision de Clement, prise ; ce document ne la rediscute pas, il se contente de ne pas la rendre
   coûteuse à lever.
   ↔️ **Une seule ligne argumente dans l'autre sens : A11.** Elle ne bloque toujours pas la Phase 8,
   mais un lien hébergé est précisément ce qu'on ouvre depuis un téléphone en entretien. Si A11
   arrive après la mise en ligne, la première ouverture du lien depuis un mobile se fait sur les
   écrans non adaptés. Argument pour la faire **avant** que le lien parte, pas après.
4. **Le double checkpoint s'applique à ce travail comme au reste** : à chaque commit, chaque tâche,
   chaque lot, les deux questions, et quatre issues possibles pour chaque point soulevé. Une session
   « hors phases » n'est pas une session hors règles.

---

## 9. Ordre d'exécution proposé

Séquence choisie pour que chaque étape soit démontrable seule, et pour que la densité arrive tôt.

| Rang | Lignes                                                                                    | Ce que ça change à l'écran                                                                                                                                                                                           |
| ---- | ----------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | **B2** (identifiants d'ADR hors des chaînes)                                              | Rien en volume, mais c'est une heure de travail contre une décision écrite et non appliquée. À faire d'abord, une fois pour toutes.                                                                                  |
| 2    | **A13** (le consultant sur la ligne de facture)                                           | Deux factures au même client cessent d'être le même document. Effort faible, aucune ADR, frontière intacte — le meilleur rapport valeur/coût du document. ⚠️ Les **deux** callbacks `designation` changent ensemble. |
| 3    | **B1** (aperçu de montant sur un brouillon) — après l'ADR                                 | La colonne TTC cesse d'être blanche sur 54 lignes sur 66, sur les deux écrans les plus tabulaires, et la seule action irréversible cesse de se faire à l'aveugle. Densité **et** justesse dans le même correctif.    |
| 4    | **A1 + A5** (tableau de bord à trois niveaux, accès au mois riche)                        | L'écran d'atterrissage des trois personas cesse d'être vide. Le plus gros gain perçu.                                                                                                                                |
| 5    | **A7** (brouillons distinguables dans les listes)                                         | Complète A13 côté tableau. Sûr à construire **quelle que soit** la décision sur l'item 13 (§3.5).                                                                                                                    |
| 6    | **A2** (frise historique) — après l'ADR                                                   | Le premier écran devient visuellement un produit.                                                                                                                                                                    |
| 7    | **A12**, dont **A6a + A6b** (plafond de 50, pagination, filtres serveur) — après l'ADR    | La troncature devient observable, l'historique remonte : 8 périodes de CRA au lieu de 3 à Paris et Lyon, six années de factures au lieu de deux à l'écran. Sept emplacements, mais rien d'incertain.                 |
| 8    | **A3** (chronologie) puis **A4** (filiation)                                              | Les écrans de détail se remplissent d'information réelle, et la piste d'audit devient visible au lieu d'être affirmée.                                                                                               |
| 9    | **A14** (écran d'affectation) — après l'ADR                                               | **Le seul écran véritablement neuf du document.** C'est aussi ce qui fait le plus pour « il n'y a que 3 écrans », et le manager y gagne une raison d'exister en dehors de la validation.                             |
| 10   | **A11** (chaîne consultant sur téléphone, avec l'ancien O5 et l'ancien O13) — après l'ADR | Un consultant remplit son CRA dans le métro. La ligne la plus chère du groupe A côté interface, et la seule qu'on ne peut pas faire à moitié.                                                                        |
| 11   | **A8 + A10 + B3 + B4 + B5**                                                               | Finition : tables homogènes, navigation contextuelle, état de sauvegarde, unités, glossaire.                                                                                                                         |
| 12   | **A9** (grille CRA desktop)                                                               | Se construit avec A11, dont il partage le découpage.                                                                                                                                                                 |
| 13   | Optionnels restants, dans l'ordre du §6                                                   | O1 (jeu de données) en premier ou pas du tout.                                                                                                                                                                       |

**Six ADR sont dues** avant le code qu'elles couvrent :

| ADR  | Sujet                                                          | État de la décision                                                                                                                                                                                                                                              |
| ---- | -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A2   | La frise historique sur les tableaux de bord                   | 🔴 **Ouvert** — prémisse écrite caduque (§3.3), à acter                                                                                                                                                                                                          |
| B1   | L'aperçu de montant non contractuel sur un brouillon           | 🔴 **Ouvert** — à acter à côté d'une règle écrite verbatim dans la route                                                                                                                                                                                         |
| §3.5 | La clé de facturation : `(CRA, client)` ou `(client, période)` | 🔴 **Ouvert** — amendement d'ADR-0038 dans les deux cas. A13 rend la première branche plus défendable sans trancher                                                                                                                                              |
| A12  | La pagination et la fin du plafond fixe                        | ✅ **Tranché le 02/09** — ADR-0081 nomme elle-même ce seuil et la conception à construire                                                                                                                                                                        |
| A11  | Le mode jour comme présentation de la saisie                   | ⚠️ **Le téléphone est tranché ; jour vs semaine non.** Et le mode jour est **l'option rejetée n° 2 d'ADR-0070** : l'ADR doit la borner à un viewport, pas la contourner                                                                                          |
| A14  | L'écran d'affectation                                          | ✅ **L'écran est tranché ; trois questions internes restent** : qui possède l'écriture sur une donnée de référence jusqu'ici immuable · que fait une modification rétroactive face à un CRA soumis ou brouillon · l'interaction avec `departure_date` (ADR-0079) |

Plus **deux lignes README** à écrire, pour X3 et X8. Deux lignes qu'annonçait la première version
**ne partent pas** : « desktop-only » (voir A11 et X2) et le report de l'affectation (voir A14).

⚠️ Trois de ces six ADR sont des **arbitrages non encore tranchés**, et les trois autres gardent des
questions internes ouvertes — toutes sont de Clement, `CLAUDE.md` est explicite là-dessus. **Les
rangs 1, 2, 4 et 5 sont les seuls qui n'attendent aucune décision de sa part** : si du code doit être
écrit aujourd'hui, il commence là, et le rang 2 est le meilleur premier pas.

---

## 10. Traçabilité — tous les identifiants de l'audit

Contrôle d'exhaustivité. Chaque identifiant de `docs/audit-produit-ui-ux.md` apparaît ici une fois et
une seule. Les alias signalent les endroits où l'audit compte deux fois le même sujet (une fois en
constat, une fois en ligne de lot) — à ne pas lire comme deux chantiers.

| Audit                             | Alias | Sort                                                                                                                                                                                           | Vérifié |
| --------------------------------- | ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| P0.1                              | D1    | Gardé **B1**                                                                                                                                                                                   | ✅      |
| P0.2                              | D2    | Gardé **A1**                                                                                                                                                                                   | ✅      |
| P0.3                              | Q2    | Gardé **A12**, dont **A6a + A6b** · ancien O3 promu avec                                                                                                                                       | ✅      |
| P1.1                              | Q1    | Gardé **A1**                                                                                                                                                                                   | ✅      |
| P1.2                              | R1–R4 | Gardé **A11** (chaîne consultant) · **O5** et **O13** promus avec lui · **X2** annulé                                                                                                          | ✅      |
| P1.3                              | Q4    | Gardé **A9** (sous-ensemble) · **O5, O6, O7**                                                                                                                                                  | ○       |
| P1.4                              | Q3    | Gardé **A8** (tri, recherche) et **A12** (total de résultats, pagination) · **X7** pour les cases à cocher                                                                                     | ✅      |
| P1.5                              | D4    | Gardé **A7**                                                                                                                                                                                   | ✅      |
| P1.6                              | §6.6  | **O4**                                                                                                                                                                                         | ○       |
| P1.7                              | D3    | Gardé **B2**                                                                                                                                                                                   | ✅      |
| P1.8                              | Q6    | Gardé **A10**                                                                                                                                                                                  | ○       |
| P2.1                              | Q5    | Gardé **B3** · **X8** pour l'autosave                                                                                                                                                          | ○       |
| P2.2                              | Q7    | Gardé **B4** (partiellement déjà fait — décision D5 du 25/08)                                                                                                                                  | ✅      |
| P2.3                              | —     | **O8**                                                                                                                                                                                         | ○       |
| P2.4                              | —     | **O9** · **X6** pour les vues nommées                                                                                                                                                          | ○       |
| P2.5                              | L5    | Gardé **A3**                                                                                                                                                                                   | ○       |
| P2.6                              | —     | **X5** (déjà tranché, ligne README)                                                                                                                                                            | ✅      |
| §6.1                              | L4    | **O10**                                                                                                                                                                                        | ○       |
| §6.2                              | L3    | Gardé **A4**                                                                                                                                                                                   | ✅      |
| §6.3                              | L2    | **O2**                                                                                                                                                                                         | ○       |
| §6.4                              | L1    | Gardé **B5**                                                                                                                                                                                   | ○       |
| §6.5                              | L6    | **X3** (ligne README à écrire)                                                                                                                                                                 | ○       |
| §6.6                              | —     | **O4**                                                                                                                                                                                         | ○       |
| §6.7                              | —     | **X4** (déjà renvoyé à l'ERP cible)                                                                                                                                                            | ✅      |
| D5                                | —     | Gardé **A5**                                                                                                                                                                                   | ✅      |
| Lot 4 (10 sujets)                 | —     | **X9** · l'affectation de missions est **construite** : Gardé **A14**                                                                                                                          | ✅      |
| §8 « Sélecteur de persona »       | —     | **O10**                                                                                                                                                                                        | ○       |
| §8 « Dashboard consultant »       | —     | Gardé **A1** (+ B3 pour la dernière sauvegarde, A5 pour le mois rempli)                                                                                                                        | ✅      |
| §8 « Dashboard manager »          | —     | Gardé **A1**                                                                                                                                                                                   | ✅      |
| §8 « Dashboard facturation »      | —     | Gardé **A1**                                                                                                                                                                                   | ✅      |
| §8 « Liste CRA »                  | —     | Gardé **A8**                                                                                                                                                                                   | ✅      |
| §8 « Grille CRA »                 | —     | Gardé **A9** · **O5**                                                                                                                                                                          | ○       |
| §8 « Pré-facturier »              | —     | Gardé **A6a, A7, A8**                                                                                                                                                                          | ✅      |
| §8 « Marge »                      | —     | Gardé **B4, B5** · **O14**                                                                                                                                                                     | ✅      |
| §8 « Liste factures »             | —     | Gardé **A6b, A8**                                                                                                                                                                              | ✅      |
| §8 « Détail facture »             | —     | Gardé **B1, A4, A10**                                                                                                                                                                          | ✅      |
| §8 « États erreur/refus »         | —     | **O11**                                                                                                                                                                                        | ○       |
| §8 « Shell »                      | —     | Gardé **A11** (identité compacte, actions collées) · **O12**                                                                                                                                   | ✅      |
| §9 (10 mesures)                   | —     | **X1** (sans objet)                                                                                                                                                                            | ✅      |
| §10 (8 étapes)                    | —     | **X12** (remplacé par ce document)                                                                                                                                                             | —       |
| **Hors audit — item 8 / O15**     | —     | Gardé **A14** (écran d'affectation) — refus du 01/09 renversé le 02/09                                                                                                                         | ✅      |
| **Hors audit — demande du 02/09** | —     | Gardé **A13** (le consultant sur la ligne de facture)                                                                                                                                          | ✅      |
| **Hors audit — item 13**          | —     | §3.5 : Gardé **A7** (les deux branches) · amendement d'ADR-0038 à trancher (§11.2 bis) · moitié « montants identiques » → **O1**                                                               | ✅      |
| **Hors audit — nouveau**          | —     | **A2** (frise, §3.3) · **B1** dans son ampleur réelle, 54 lignes sans montant (§3.1b) · **A12** dans son inventaire réel, sept emplacements · **O1** (missions et clients, §1) · **B2** (§3.4) | ✅      |

---

## 11. Ce qui reste à trancher par Clement

Ce qui a été **tranché le 02/09** et n'est plus une question : le téléphone pour la chaîne consultant
(A11) · la fin du plafond fixe de 50 (A12) · l'écran d'affectation des missions (A14) · le consultant
sur la ligne de facture (A13). Restent ouverts, cinq points.

1. 🔴 **Item 13 — une facture par CRA, ou une par `(client, période)` ?** (§3.5) Le code est cohérent
   avec ADR-0038 ; ADR-0038 n'a **jamais examiné** le cas multi-consultants. Garder la clé actuelle
   coûte un amendement d'ADR et **A7** ; agréger coûte un brouillon qui accumule ses lignes, l'index
   unique `idx_invoices_source_cra_client` et la garantie d'idempotence. **A7 et A13 sont nécessaires
   dans les deux cas** — ils se construisent sans attendre, et A13 rend la branche « garder »
   nettement plus défendable qu'elle ne l'est aujourd'hui.
2. 🔴 **A11 — mode jour ou mode semaine sous le point de rupture ?** Le mode jour est la coupe native
   du téléphone, mais c'est **l'option rejetée n° 2 d'ADR-0070** (« a day-detail panel »). L'ADR doit
   donc borner ADR-0070 à un viewport — l'argument est que sa première objection suppose une matrice
   balayable, ce qu'elle n'est pas à 390 px — et honorer sa seconde objection en rendant visible
   autrement quels jours sont incomplets (la barre de progression de A9 devient le prix d'entrée). Si
   l'argument ne convainc pas, le mode semaine est la seule option et ses 7 colonnes à 390 px sont à
   assumer comme serrées.
3. 🔴 **A14 — trois questions internes** : qui possède l'écriture sur `public.assignments`, donnée de
   référence lue par les deux modules et jusqu'ici écrite par le seul seed (un chemin dans
   `timesheet`, qui possède la règle qui la lit, ou une préoccupation de niveau composition) · ce que
   fait une modification rétroactive qui orphelinerait des jours déjà saisis sur un CRA soumis ou
   brouillon (refuser l'écriture, ou énoncer la conséquence avant le clic) · l'interdiction d'une
   affectation commençant après une `departure_date` (ADR-0079).
4. 🔴 **A2 et B1 — deux ADR à poser** : la frise historique (une prémisse écrite est caduque) et
   l'aperçu de montant non contractuel sur un brouillon (il se pose à côté d'une règle écrite
   verbatim dans la route, il ne s'y glisse pas).
5. 🟡 **O1 — toucher au seed ou non.** Cinq missions en régie pour 48 consultants plafonnent la
   richesse perçue quoi qu'on fasse à l'interface, et les montants identiques de l'item 13 en sont
   l'issue certaine (§3.5c). Mais l'item 6 a montré ce que coûte un changement de volume : la suite
   e2e complète à réécrire. À prendre **en premier ou pas du tout**.
