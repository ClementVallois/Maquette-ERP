# Deux rôles de plus : RH et Direction — base de travail

**Date :** 2 septembre 2026
**Origine :** demande de Clement du 02/09/2026, après le lancement du chantier de densification.
**Relation aux autres documents :** `docs/plan-densification.md` répondait à « ça fait vide » **à
périmètre constant** — mieux montrer ce qui existe. Ce document répond à la question suivante, qui
est différente : « ça ne fait pas encore un ERP ». Les deux se cumulent et ne se contredisent pas.

> **Langue.** Français, comme `docs/audit-produit-ui-ux.md`, `docs/plan-densification.md` et
> `docs/todo.md`, et pour la même raison : document de pilotage adressé à Clement, pas artefact de
> code. La règle « tout en anglais » de `CLAUDE.md` continue de s'appliquer au code, aux commits et
> aux ADR.

**Ce document ne modifie aucun code et n'ouvre aucune ADR.** Il mesure l'existant, nomme ce que
chaque fonctionnalité coûte, et dit **quelle décision écrite elle rouvre et à quel seuil**. Les
arbitrages structurels sont ceux de Clement (`CLAUDE.md`) et restent à écrire au moment où ils sont
pris. Tous les relevés ci-dessous sont datés du 02/09/2026, par lecture du code et des migrations.

---

## 1. Le registre de la réponse, et pourquoi il n'est pas « voici neuf idées »

La demande cite neuf domaines : facturation, plan de charge, contrôle des consultants, gestion RH,
congés, recrutement / fin de contrat, contrôle et conformité, clients, missions. Listés à plat, ce
sont neuf chantiers indiscernables et le document ne sert à rien.

Ils ne sont pas indiscernables. Mesurés contre ce dépôt, ils se rangent en **trois tiers de coût
très inégaux**, et la moitié de la demande tombe dans le tier le moins cher — celui où **les données
existent déjà, sont écrites par le seed, et n'ont aucun écran à elles**. C'est exactement
l'argument qui a porté le chantier de densification (B1 : 54 factures sans montant affiché ;
A7 : des brouillons indiscernables alors que la donnée était là), et il vaut ici à plus grande
échelle.

Le tri de ce document est donc :

1. ce qui existe en base et n'a pas d'écran à soi → **du produit pour le prix d'une lecture** ;
2. ce qui se dérive de l'existant sans migration → **du produit pour le prix d'une requête** ;
3. ce qui exige une migration **et** rouvre un refus écrit au README → **une décision avant du
   code**.

Et une contrainte transverse qui précède les trois : **un verrou de portée** que ni RH ni Direction
ne peut contourner, et qui est la vraie première tâche. Elle fait l'objet du §3.

---

## 2. L'ancrage : ces deux rôles sont ceux du brief

Ce n'est pas une extension opportuniste. Le brief de l'entretien à venir nomme le périmètre élargi
en toutes lettres : **remplacer Skillup** (formation et gestion RH), **BoondManager** (ERP d'ESN :
staffing, CRA, facturation) et **Welcome to the Jungle** (recrutement, ATS), plus « **risques et
rentabilité consultants, disponibilités, ATS** ».

Cartographié sur la demande du 02/09 :

| Brief                      | Rôle qui le porte | Domaines de la demande                                    |
| -------------------------- | ----------------- | --------------------------------------------------------- |
| Remplacer **BoondManager** | Direction + RH    | plan de charge, rentabilité, missions, clients            |
| Remplacer **Skillup**      | RH                | gestion RH, congés, habilitations, fin de contrat         |
| Remplacer **WTTJ** / ATS   | RH                | recrutement                                               |
| **Risques et rentabilité** | Direction         | contrôle des consultants, conformité, facturation agrégée |
| **Disponibilités**         | Direction + RH    | plan de charge, `Intercontrat`                            |

Deux rôles suffisent à couvrir les cinq lignes. C'est la raison de ne pas en inventer un troisième :
le dépôt démontre qu'**un rôle est une capacité, pas un organigramme** (ADR-0023), et trois rôles de
plus diluerait la démonstration au lieu de l'étendre.

---

## 3. Le verrou structurel : aujourd'hui, aucun rôle ne peut lire hors de son implantation

**C'est la découverte qui structure tout le reste, et elle précède chaque fonctionnalité de ce
document.**

`packages/platform/src/scope.ts` est la porte unique par laquelle passe **toute** lecture des deux
modules. Sa fonction `assertMayRead` contient ceci :

```ts
if (scope === 'none') throw new OutOfScopeError(resource);
if (record.officeId !== actor.officeId) throw new OutOfScopeError(resource);
```

La deuxième ligne n'est conditionnée par rien. **Elle refuse toute lecture hors implantation pour
tous les rôles, sans exception**, parce qu'au moment où elle a été écrite aucun rôle n'existait dont
la portée ne fût pas une implantation. `ReadScope` n'a que trois valeurs — `none`, `own`, `office` —
et il n'y a pas de quatrième.

Or un directeur qui ne voit que Paris n'est pas un directeur, et une RH qui ne voit qu'une
implantation sur quatre ne remplace pas Skillup. **Les deux rôles demandés sont les premiers dont la
portée est le cabinet.**

### Ce que ça coûte, précisément

| Point                                                         | Fichier                                           | Nature                                                            |
| ------------------------------------------------------------- | ------------------------------------------------- | ----------------------------------------------------------------- |
| `ReadScope` gagne une quatrième valeur (`firm`)               | `packages/platform/src/scope.ts`                  | Mécanique                                                         |
| Le test d'implantation devient conditionnel à la portée       | `packages/platform/src/scope.ts`, `assertMayRead` | **Le cœur du sujet** — c'est la règle d'autorisation qu'on touche |
| `ROLES` passe de trois à cinq valeurs                         | `packages/platform/src/actor.ts:12`               | Mécanique                                                         |
| La matrice `READ_SCOPE` gagne deux lignes                     | `packages/platform/src/scope.ts`                  | **La décision de fond** — voir §4.3                               |
| ⚠️ Un test existant affirme le contraire de ce qu'on va faire | `packages/platform/src/actor.test.ts:14`          | À réécrire **avec son ADR**, jamais en silence                    |

Cette dernière ligne mérite d'être lue telle quelle. Le test dit :

```ts
expect(ROLES).not.toContain('director');
```

Il a été écrit **exprès** pour interdire ce que ce document propose. C'est le meilleur signe que le
dépôt fait ce qu'il prétend faire, et c'est aussi la raison pour laquelle ce point ne peut pas être
traité comme une formalité d'implémentation.

### Le rapport à ADR-0023, honnêtement

ADR-0023 écrit, à propos de `public.consultants.role` dont la valeur `director` existe déjà en
base : « _one of the three values, `director`, is not a capability in this chain at all_ ».

C'était **vrai de la chaîne d'alors**. La chaîne était `CRA → facture` ; un directeur n'y a
effectivement aucun geste à poser. La demande du 02/09 **élargit la chaîne**, et un directeur a des
gestes à poser dans la chaîne élargie. Ce n'est pas un contre-argument à ADR-0023 : c'est un
changement de prémisse, ce pour quoi un seuil de réouverture existe.

⚠️ **Mais il faut le dire comme il est : c'est un renversement, pas une précision.** ADR-0023 tient
séparés deux vocabulaires — le rôle d'organigramme (`consultant | manager | director`, écrit par le
seed, jamais lu par l'API) et le rôle d'autorisation (`consultant | manager | billing`). Ajouter
`direction` aux seconds fait **se rejoindre les deux vocabulaires** sur une valeur. L'ADR à écrire
doit dire lequel des deux gagne le mot, et pourquoi la colonne HR ne devient pas pour autant une
source d'autorisation — sans quoi on réintroduit exactement l'ambiguïté qu'ADR-0023 a payée pour
éviter.

> Le précédent formel existe et il est récent : le chantier de densification a dû borner ADR-0070 à
> un viewport plutôt que la contredire. Même geste ici, à ceci près qu'il porte sur la règle
> d'autorisation et non sur une présentation — donc avec une exigence de preuve supérieure, pas
> inférieure.

---

## 4. Les deux rôles, définis dans le vocabulaire du dépôt

`CONTEXT.md` est l'autorité : un terme ne s'écrit pas dans le code avant d'y être. Les définitions
ci-dessous sont donc rédigées **au format de ses entrées**, prêtes à y être portées le jour où la
décision est prise.

### 4.1 — `Rh`

> **Rh** (🇫🇷 gardé) : le rôle qui tient le dossier des personnes — `Grade` daté et `Cjm`,
> `Habilitation` et son échéance, rattachement au manager, arrivée et `Departure`. Il lit **tout le
> cabinet**, jamais une seule implantation, et il ne lit **aucune** `Invoice` ni aucune marge : ce
> qu'un consultant coûte est son affaire, ce qu'il rapporte ne l'est pas.
> _Éviter_ : HumanResources, People, Staff, Admin

Gardé en français par la même règle que `Cra`, `Tjm`, `Intercontrat` : « RH » est le mot du cabinet,
et « HR » ferait entrer un vocabulaire d'organigramme anglo-saxon là où le dépôt en tient un
français.

### 4.2 — `Direction`

> **Direction** (🇫🇷 gardé) : le rôle qui lit le cabinet consolidé — chiffre d'affaires facturé et
> à facturer, marge par `Mission`, `Client`, `Practice` et `Office`, taux d'occupation et
> `Intercontrat`. Il lit partout, et **une lecture de marge individuelle reste une divulgation
> journalisée** (ADR-0052) : la portée s'élargit, le contrôle ne se lève pas.
> _Éviter_ : CEO, Executive, Admin, SuperUser, Director

La dernière phrase est le point de conception qui rend ce rôle intéressant à montrer plutôt que
banal. Un rôle qui lit tout sans contrepartie est un `SuperUser`, et un `SuperUser` ne démontre
rien. Un rôle qui lit tout **et dont chaque lecture individuelle sensible laisse une trace** démontre
que le contrôle d'ADR-0052 est un contrôle et non un effet de bord de la portée.

### 4.3 — La matrice de portée proposée

🔴 **C'est l'arbitrage de fond de ce document.** La proposition ci-dessous est argumentée, pas
tranchée : `RESOURCES` passerait de trois valeurs (`cra`, `invoice`, `economics`) à quatre, et
`READ_SCOPE` de trois lignes à cinq.

| Rôle            | `cra`    | `invoice`  | `economics` (Tjm, CA, marge) | `people` (Grade, Cjm, Habilitation) |
| --------------- | -------- | ---------- | ---------------------------- | ----------------------------------- |
| `consultant`    | `own`    | `none`     | `none`                       | `own`                               |
| `manager`       | `office` | `office`   | `office`                     | `office`                            |
| `billing`       | `office` | `office`   | `none`                       | `none`                              |
| **`rh`**        | `firm`   | **`none`** | **`none`**                   | **`firm`**                          |
| **`direction`** | `firm`   | `firm`     | `firm`                       | `firm`                              |

**Pourquoi une quatrième ressource plutôt que d'élargir `economics`.** Aujourd'hui `economics` porte
en un seul mot le `Tjm` (ce que le consultant rapporte) **et** le `Cjm` (ce qu'il coûte). Les deux
sont servis par la même lecture dédiée à `apps/api/src/economics/consultant-economics.ts`, et
ADR-0043 explique pourquoi cette lecture vit à la racine de composition : la marge a deux termes qui
appartiennent à deux propriétaires différents.

Ce document propose de **rendre cette dualité lisible dans la matrice de portée** : `people` porte le
coût, `economics` porte le revenu. La conséquence est une ligne qu'on peut défendre à voix haute et
qui se teste en une assertion :

> **La RH voit ce qu'un consultant coûte et jamais ce qu'il rapporte. La facturation voit ce qu'il
> rapporte et jamais ce qu'il coûte. Aucune des deux ne peut calculer la marge ; seuls le manager,
> dans son implantation, et la direction, sur le cabinet, le peuvent.**

C'est la même démonstration que « un manager de Lyon ne lit pas la marge de Paris », sur l'autre axe.
Elle est plus forte que l'actuelle, parce qu'elle oppose deux rôles **sur la même donnée** au lieu
d'opposer deux implantations.

⚠️ **Le prix à payer, et il est réel.** Séparer `people` d'`economics` veut dire que le `Cjm` cesse
d'être servi par la seule lecture d'ADR-0052 : il aura deux chemins de lecture, celui de la marge et
celui de la fiche RH. ADR-0052 protège **l'agrégat** (« ce qui doit être coûteux, c'est d'en
collecter huit cents, pas d'en lire un ») ; un répertoire RH qui liste 48 consultants avec leur `Cjm`
**est** l'agrégat, et il annulerait le contrôle. La conception qui tient — et qui doit être dans
l'ADR, pas découverte à l'écran — est que **le répertoire RH ne porte pas le `Cjm`** : il se lit sur
la fiche, une personne à la fois, journalisée, exactement comme la marge.

---

## 5. Tier 1 — les données sont là, et aucune n'a d'écran à elle

Relevé par lecture des migrations **et de leurs lecteurs sur `feat/densification` au 02/09**, pas
sur `main` : la branche en cours a passé vingt-quatre commits à mettre à l'écran de la donnée
jusque-là inexploitée, et une mesure faite contre `main` serait fausse d'autant.

La distinction qui suit est celle qui compte, et elle est plus étroite que « aucun écran » :

- **Apparaît quelque part** — la valeur est visible, en passant, sur un écran qui parle d'autre
  chose. Un `Tjm` recopié sur une ligne de facture, un nom de client en tête d'un relevé.
- **A un écran à soi** — la table est consultable pour elle-même, avec son historique daté, ses
  filtres et son tri.

Aucune des dix lignes ci-dessous ne passe le second test.

| Donnée écrite par le seed                                         | Migration | Apparaît aujourd'hui                                                                       | Écran à soi  |
| ----------------------------------------------------------------- | --------- | ------------------------------------------------------------------------------------------ | ------------ |
| `public.clients` — SIREN, TVA intra, **territorialité**, adresses | 001       | ✅ Mentions légales du relevé imprimable (`web/pages/invoice.ts`), nom sur les listes      | ❌ **Aucun** |
| `public.missions` — modèle de facturation, début, **fin**         | 001       | ⚠️ Le **nom** seulement (grille, facture). Modèle, dates, fin : nulle part                 | ❌ **Aucun** |
| `public.mission_tjm` — le `Tjm` **daté**                          | 001       | ⚠️ Le `Tjm` **recopié** sur la ligne de facture (ADR-0034). L'historique daté : nulle part | ❌ **Aucun** |
| `public.manager_attachments` — qui manage qui, **daté**           | 001       | ❌ Non — sert la règle d'ADR-0034 (le manager du mois), invisible                          | ❌ **Aucun** |
| `public.domain_events` — `correlation_id`, `causation_id`, JSONB  | 004       | ❌ **Non, par personne** — seuls les tests le relisent (vérifié)                           | ❌ **Aucun** |
| `public.grades`, `public.grade_tjm_defaults`                      | 007       | ❌ **Non, par personne** — le README l'écrit noir sur blanc                                | ❌ **Aucun** |
| `public.consultant_grades` — le `Cjm`, daté                       | 007       | ⚠️ Le `Cjm` courant sur l'écran de marge (ADR-0043). L'historique daté : nulle part        | ❌ **Aucun** |
| `public.habilitations`, `consultant_habilitations.**expires_at**` | 007       | ❌ Non — sert la règle de soumission, invisible. **`expires_at` n'est lu nulle part**      | ❌ **Aucun** |
| `public.mission_habilitations`                                    | 007       | ❌ Non — même règle, même invisibilité                                                     | ❌ **Aucun** |
| `public.consultants.departure_date`                               | 012       | ⚠️ Par son effet : le `Roster` exclut (ADR-0077). La date elle-même : nulle part           | ❌ **Aucun** |

Deux constats de ce tableau valent d'être isolés, parce qu'ils portent l'argument :

1. **`domain_events` n'a aucun lecteur applicatif** — vérifié : hors tests, seul l'écrivain existe.
   Et la branche courante vient de construire **deux chronologies à la main** (`api.ts:286` pour le
   CRA, `api.ts:614` pour la facture) **à partir des colonnes de statut** — `submitted_at`,
   `refusal_at`, `validated_at`. Un journal d'événements avec corrélation et causation est écrit
   depuis ADR-0020, et on a reconstitué l'histoire ailleurs faute de le lire.
2. **Aucune donnée datée n'est consultable dans le temps.** `mission_tjm`, `consultant_grades`,
   `manager_attachments`, `consultant_habilitations` sont **toutes** historisées avec
   `from_date` / `to_date`, et **aucune** n'expose son historique : on ne voit jamais que la valeur
   en vigueur, quand on la voit. Or l'historisation datée est un des points d'architecture les plus
   défendables du dépôt (ADR-0034 : « le CRA de mars est validé par le manager de mars »). Il est
   entièrement invisible à l'écran.

### 5.1 — Les écrans que ce tier produit

| Écran                            | Rôle          | Contenu, entièrement issu de l'existant                                                                                                                                                                                                                                                                                                                          |
| -------------------------------- | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Répertoire des consultants**   | Rh, Direction | 48 lignes, filtrables par `Office`, `Practice`, `Grade`, `Habilitation`, statut (actif / parti). Réutilise le contrat de table commun d'A8 (recherche, tri, pagination serveur) livré au rang 11. **Sans `Cjm`** — voir §4.3                                                                                                                                     |
| **Fiche consultant (RH)**        | Rh            | Grade daté et son historique · `Cjm` (lecture journalisée) · habilitations et échéances · rattachement manager daté · affectations passées et en cours · arrivée et départ                                                                                                                                                                                       |
| **Conformité des habilitations** | Rh, Direction | Habilitations **expirées** et **expirant sous 90 jours** · consultants affectés à une mission exigeant une habilitation qu'ils ne détiennent pas ou plus. `isAssigned` / `missingHabilitations` sont **déjà écrites** dans le domaine (`packages/timesheet/src/domain/submission-checks.ts`), où elles tiennent la règle de soumission, et A14 les a réutilisées |
| **Portefeuille clients**         | Direction     | Les 5 clients, leur territorialité, leur CA facturé et à facturer, leur part du CA total (concentration)                                                                                                                                                                                                                                                         |
| **Catalogue des missions**       | Direction, Rh | Les 7 missions, modèle de facturation, `Tjm` en vigueur et son historique daté, effectif affecté, **date de fin** — donc les missions qui s'achèvent                                                                                                                                                                                                             |
| **Journal de conformité**        | Direction, Rh | `domain_events` en clair : quel événement, quand, par quelle chaîne de causalité. **La piste d'audit cesse d'être affirmée dans le README pour devenir regardable.**                                                                                                                                                                                             |

Le journal de conformité mérite d'être signalé à part. Le dépôt écrit un journal d'événements de
domaine avec `correlation_id` et `causation_id` depuis ADR-0020, **personne ne le relit**, et
l'argumentaire du README repose en partie dessus. Pour un cabinet de cybersécurité, c'est
probablement l'écran le plus on-brand de tout le document, et il ne coûte qu'une lecture paginée.

---

## 6. Tier 2 — une lecture dérivée, aucune migration

Rien ici n'ajoute une colonne. Tout se calcule à partir de `assignments`, `cra_lines`, `mission_tjm`,
`consultant_grades` et du calendrier ouvré (`packages/timesheet/src/domain/working-calendar.ts`,
jours fériés 2016-2027 par ADR-0078).

| Fonctionnalité                     | Rôle          | Comment elle se dérive                                                                                                                                                                                  |
| ---------------------------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Plan de charge**                 | Direction, Rh | `assignments` (datées) × calendrier ouvré, par consultant et par mois, sur N mois glissants. 45 affectations existent                                                                                   |
| **Taux d'`Intercontrat`**          | Direction, Rh | `Intercontrat` est **déjà modélisé** comme une mission `Forfait` interne (ADR-0046), donc le temps non vendu est **déjà dans les CRA**. Aucun concept de disponibilité à inventer : c'est une somme     |
| **Taux d'activité (TACE)**         | Direction     | Quarts de journée en `Regie` ÷ quarts ouvrés, par consultant / pôle / implantation / période. Les 8 périodes du seed le rendent traçable dans le temps                                                  |
| **Rentabilité agrégée**            | Direction     | `lineAmountCents` (revenu) − `cjm_cents` × quarts (coût), agrégé par mission, client, pôle, implantation. Les deux termes sont déjà calculés à l'unité par `consultant-economics.ts`                    |
| **Contrôle de complétude des CRA** | Rh, Direction | Qui n'a pas soumis, à quelle date d'échéance, depuis combien de périodes. La donnée est le statut du CRA, déjà indexé                                                                                   |
| **Missions arrivant à échéance**   | Direction     | `missions.end_date` croisée avec les affectations : combien de consultants tombent en `Intercontrat` à cette date si rien n'est resigné. **C'est le « risque » du brief, et il se calcule aujourd'hui** |
| **Concentration client**           | Direction     | Part du CA par client sur les 6 années de factures du seed. 5 clients : la concentration est visible, ce qui rend l'indicateur démonstratif plutôt que décoratif                                        |

⚠️ **Une réserve honnête sur la densité de ces écrans.** Le seed compte **7 missions dont 5 en
`Regie`, 5 clients, et Rennes n'a qu'un seul consultant**. Un plan de charge sur 5 missions et une
concentration client sur 5 clients seront **justes mais maigres**. Enrichir le seed (O1 du plan de
densification) a été écarté parce que toucher au volume de `consultants`, `cras` ou `invoices`
oblige à réécrire les assertions e2e — l'item 6 l'a démontré. Deux nuances mesurées :

- `pnpm run seed:fingerprint` vérifie le **déterminisme** du seed (deux exécutions, même empreinte),
  pas une valeur de référence figée. **Ajouter des lignes ne le casse pas** tant que les
  identifiants restent déterministes. Le coût d'O1 était les assertions e2e, jamais l'empreinte.
- Ajouter des **clients et des missions** ne change ni le nombre de consultants, ni le nombre de
  CRA, ni les mois denses. C'est un volume beaucoup moins couplé aux assertions e2e que ne l'était
  l'expansion du roster. 🟡 À vérifier avant de s'y engager, mais l'écarter d'office par analogie
  avec l'item 6 serait une erreur de raisonnement.

---

## 7. Tier 3 — migration **et** réouverture d'un refus écrit

Ici, on ne peut plus coder avant de décider. Chaque ligne nomme le refus qu'elle rouvre et le seuil
que le dépôt s'est lui-même donné.

### 7.1 — Les congés

**Ce que le README refuse aujourd'hui**, ligne « Types d'absence (congé payé, RTT, maladie) » :
le domaine ne connaît que `worked` et `absence` (`cra_lines.day_type`, contrainte `CHECK` en
migration 002), et distinguer un CP d'un RTT coûterait « une valeur de plus, une migration, un seed
et des écrans, pour **zéro conséquence sur la facturation** ».

**Le seuil qu'il s'est donné, verbatim** :

> « Premier solde de congés à tenir dans l'outil, ou première règle métier qui dépend du motif (un
> RTT décompté d'un compteur, un arrêt maladie qui suspend une mission) — à ce moment-là le motif
> porte une conséquence et cesse d'être une couleur »

Un module RH qui tient des soldes de congés **est** ce seuil, mot pour mot. C'est la réouverture la
mieux fondée du document : le dépôt a écrit d'avance la condition, et la demande la remplit.

**Coût réel :** une table de types d'absence · l'extension de la contrainte `CHECK` sur `day_type`
· une table de soldes et de mouvements · une demande de congé avec son circuit d'approbation · les
écrans. ⚠️ Et un vrai invariant de domaine — un solde ne descend pas sous zéro, une demande
approuvée pose des jours d'absence sur un CRA qui n'est pas encore ouvert. **C'est le seul chantier
de ce document qui justifie un module scellé plutôt qu'une lecture à la racine de composition**
(voir §9).

### 7.2 — Arrivées et fins de contrat

`public.consultants` porte `departure_date` (ADR-0079) et **ne porte pas de date d'arrivée**. Le
départ est modélisé, l'arrivée ne l'est pas — asymétrie logique tant que la chaîne était
`CRA → facture`, intenable pour un module RH.

**Coût :** une colonne `hire_date` (même forme qu'ADR-0079, nullable, sans reprise) · les écrans
d'arrivées et de départs à venir · une liste de contrôle d'entrée / de sortie si l'on veut aller
au-delà de la date. Le départ, lui, **fonctionne déjà** : il retire du `Roster` sans rien effacer, et
l'invariant `CraAfterDepartureError` le tient dans le domaine.

### 7.3 — Le recrutement (ATS)

**Le plus gros poste du document, et de loin.** Rien n'existe : ni candidat, ni poste ouvert, ni
étape de pipeline, ni entretien. Le README range le sujet dans les dix « ERP cible » du Lot 4.

**Coût :** au moins trois tables neuves · un cycle de vie avec ses transitions · la conversion d'un
candidat en `Consultant` à l'embauche (qui rejoint §7.2) · un écran de pipeline. Et une question de
fond : un ATS est **un produit en soi**, pas un module d'ERP — c'est la raison pour laquelle il reste
un outil séparé, acheté sur étagère, dans la plupart des ESN.

🟡 **Recommandation :** si le recrutement doit être montré, le réduire à ce qui touche la chaîne
existante — **le poste ouvert et la date d'arrivée prévue, qui alimentent le plan de charge**. Un
consultant qui arrive en novembre est une capacité future ; c'est ça qui intéresse la direction, et
ça se construit sans pipeline d'entretiens. Le pipeline complet, lui, reste hors périmètre avec son
seuil.

### 7.4 — L'écriture des données de référence

**Ce n'est pas une fonctionnalité, c'est une question ouverte que ce document aggrave.**

ADR-0031 fait du seed **l'unique écrivain** des données de référence. Le rang 9 (A14, écran
d'affectation) a déjà ouvert cette porte pour `public.assignments`, et `docs/plan-densification.md`
a enregistré la question sans la trancher : « qui possède l'écriture sur `public.assignments`,
donnée de référence lue par les deux modules et jusqu'ici écrite par le seul seed ».

Gérer les clients, les missions et le dossier RH **en écriture** élargit exactement la même brèche à
`public.clients`, `public.missions`, `public.mission_tjm`, `public.consultants`. La question ne
change pas de nature, elle change d'échelle — et il vaut mieux la trancher une fois pour toutes que
quatre fois de suite.

🟢 **Conséquence pratique, et elle est confortable :** **tous les écrans du tier 1 et du tier 2 sont
en lecture seule.** Aucun ne dépend de cette décision. On peut construire l'intégralité des §5 et §6
pendant que la question reste ouverte, et n'ouvrir l'écriture que quand elle est tranchée.

---

## 8. Le sélecteur de personas : quatre entrées, pas cinq

ADR-0023 fixe **exactement quatre** personas et argumente chacune. L'item 6 de la QA (31/08) a tenu
ce nombre à quatre **en portant le roster à 48 consultants**, et `CLAUDE.md` le réaffirme dans sa
section « Dataset shape » : « the persona picker, which stays at **exactly four** entries ».

Deux rôles de plus, c'est **six personas**. Ce n'est pas un détail d'implémentation : c'est un nombre
que le dépôt a défendu deux fois par écrit.

L'argument de tenue existe et il est le même que celui d'ADR-0023 pour `manager-lyon` : une persona
n'existe que si elle rend **vérifiable par le lecteur** une affirmation d'autorisation. Appliqué
ici :

- `rh-national` rend vérifiable « la RH lit les 4 implantations **et** se voit refuser une facture »
  — deux appels, un 200 et un 403 ;
- `direction` rend vérifiable « la portée s'élargit, le contrôle de divulgation ne se lève pas ».

Chacune paie donc sa place au même prix que `manager-lyon`. ⚠️ Mais la décision reste celle de
Clement, et elle a un coût d'écran : le sélecteur passe de quatre cartes à six, et
`ADR-0023` ainsi que la section « Dataset shape » de `CLAUDE.md` doivent être amendées **ensemble**,
sous peine de laisser deux documents affirmer un nombre que le code contredit.

---

## 9. Où ce code doit vivre — et pourquoi ce n'est pas un troisième module

Question d'architecture, à trancher avant la première ligne, parce que s'en apercevoir après coûte
une réécriture.

Le dépôt existe pour démontrer **deux modules scellés et une flèche** (`timesheet` → événement →
`billing`). La tentation naturelle est un troisième package `@erp/hr`. Le précédent du dépôt dit
autre chose, et il est explicite :

- `apps/api/src/economics/consultant-economics.ts` — la marge **ne vit dans aucun module** parce que
  ses deux termes appartiennent à deux propriétaires différents (ADR-0043) ;
- `apps/api/src/staffing/assignment-admin.ts` — l'affectation, livrée au rang 9, vit également à la
  racine de composition.

**La règle qui s'en dégage : une lecture qui croise les modules se compose dans `apps/api`
(ADR-0015) ; un invariant métier vit dans un module.** Appliquée à ce document :

| Chantier                                        | Où                                                                                                                            |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Tous les écrans du tier 1 et du tier 2 (§5, §6) | **`apps/api`**, racine de composition. Ce sont des lectures agrégées, elles ne portent aucun invariant                        |
| Le verrou de portée (§3)                        | **`packages/platform`** — c'est déjà là que vit `scope.ts`, et les deux modules le lisent                                     |
| L'écriture des données de référence (§7.4)      | Ouvert — c'est précisément la question                                                                                        |
| **Les congés (§7.1)**                           | **Le seul candidat légitime à un module scellé** : « un solde ne descend pas sous zéro » est un invariant, pas une projection |

Autrement dit : **la quasi-totalité de ce document ne crée aucun module et ne dessine aucune flèche
nouvelle.** La frontière `billing` ⇸ `timesheet` n'est pas touchée. C'est ce qui rend l'ensemble
compatible avec ce que le dépôt existe pour prouver — et si une ligne semblait exiger une flèche
nouvelle, `CLAUDE.md` est explicite : **on discute la règle dans une ADR, pas le contournement.**

---

## 10. Ordre d'exécution proposé

Séquence choisie pour que la densité arrive tôt et que rien n'attende une décision qu'il n'a pas
besoin d'attendre.

| Lot | Contenu                                                                          | Dépend d'une décision ? | Ce que ça change à l'écran                                                                                       |
| --- | -------------------------------------------------------------------------------- | ----------------------- | ---------------------------------------------------------------------------------------------------------------- |
| 0   | **Le verrou de portée** : `ReadScope.firm`, deux rôles, la matrice, les personas | 🔴 **Oui** — §3, §4.3   | Rien seul. **Précondition de tout le reste** : rien du lot 1+ ne peut être lu hors implantation sans lui         |
| 1   | **Tableau de bord Direction** + rentabilité agrégée + concentration client       | Non (après lot 0)       | L'écran d'atterrissage le plus dense du dépôt, sur 6 années de factures et 8 périodes qui existent déjà          |
| 2   | **Répertoire + fiche consultant + conformité des habilitations** (Rh)            | Non (après lot 0)       | Le rôle RH devient réel en trois écrans, tous en lecture, sur des tables déjà écrites                            |
| 3   | **Plan de charge** + `Intercontrat` + TACE                                       | Non                     | La ligne « disponibilités » du brief, et le premier écran qui se projette dans le futur plutôt que dans le passé |
| 4   | **Clients + missions** (lecture) + missions arrivant à échéance                  | Non                     | Deux écrans neufs sur deux tables jamais affichées, et le « risque » du brief devient un chiffre                 |
| 5   | **Journal de conformité** (`domain_events`)                                      | Non                     | La piste d'audit cesse d'être affirmée et devient regardable. Le plus on-brand pour un cabinet de cybersécurité  |
| 6   | **Contrôle de complétude des CRA** (Rh, Direction)                               | Non                     | Complète le lot 2 ; recoupe le pré-facturier existant                                                            |
| 7   | **Arrivées / fins de contrat** (`hire_date`)                                     | 🟡 Migration            | Symétrise ADR-0079 et alimente le plan de charge en capacité future                                              |
| 8   | **Congés**                                                                       | 🔴 **Oui** — §7.1       | Le plus gros chantier de domaine. Seuil du README atteint mot pour mot                                           |
| 9   | **Écriture** des données de référence (clients, missions, RH)                    | 🔴 **Oui** — §7.4       | Transforme des écrans de lecture en gestion. À trancher **une fois**, pas quatre                                 |
| 10  | **Recrutement**                                                                  | 🔴 **Oui** — §7.3       | À réduire au poste ouvert + date d'arrivée prévue, ou à laisser dehors                                           |

**Les lots 1 à 6 ne dépendent que du lot 0.** C'est six écrans neufs, tous en lecture seule, tous sur
des données qui existent déjà en base — pour une seule décision d'architecture en amont.

---

## 11. Ce qui reste dehors, et où ça atterrit

| Sujet                                               | Sort                                                                                                                                                                                                                                                                        |
| --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Authentification réelle, gestion des comptes        | ❌ Hors périmètre **par construction** (README). Deux rôles de plus ne changent rien : le sélecteur de persona reste assumé et annoncé comme tel                                                                                                                            |
| Paie, notes de frais, formation, entretiens annuels | ❌ Dérive de périmètre. « Remplacer Skillup » ne veut pas dire réimplémenter Skillup — ligne README avec seuil                                                                                                                                                              |
| Moteur d'optimisation de staffing                   | ❌ Le README l'écarte déjà (« plan de charge et **moteur de contraintes** de staffing »). Le lot 3 **montre** la charge, il ne l'**optimise** pas                                                                                                                           |
| Pipeline ATS complet                                | 🟡 §7.3 — à réduire ou à laisser dehors, avec seuil                                                                                                                                                                                                                         |
| Grille tarifaire par grade (`grade_tjm_defaults`)   | 🟡 Le README a son seuil : « première négociation tarifaire menée dans l'outil, ou premier devis calculé depuis une grille ». **Le lot 2 l'affiche sans l'appliquer** — montrer une table n'est pas s'en servir pour facturer, et la distinction doit être écrite à l'écran |
| Remplir septembre 2026 dans le seed                 | ❌ **Interdit** : `journeys.spec.ts` dépend d'un mois vierge. Contrainte reprise telle quelle du plan de densification                                                                                                                                                      |

---

## 12. Ce qui reste à trancher par Clement

Six décisions, dans l'ordre où elles bloquent.

1. 🔴 **La quatrième valeur de `ReadScope` et la matrice de portée** (§3, §4.3). C'est la règle
   d'autorisation qu'on touche, et un test existant — `packages/platform/src/actor.test.ts:14` —
   affirme aujourd'hui le contraire. **ADR obligatoire**, avec son option rejetée et son seuil.
   Sous-question qui a plus de conséquences qu'elle n'en a l'air : **`people` comme quatrième
   ressource, ou élargissement d'`economics` ?** La première rend démontrable « la RH voit le coût,
   la facturation voit le revenu, ni l'une ni l'autre la marge » ; la seconde est moins de code et
   démontre moins.
   ⚠️ **Et une question que le premier relecteur posera : dans quelle implantation est la RH ?** Une
   portée `firm` fait sauter la comparaison d'implantation dans `assertMayRead`, donc
   `actor.officeId` devient une donnée morte pour ces deux rôles — alors que le type `Actor`
   l'exige et que la persona doit bien être rattachée à un consultant seedé quelque part.
   L'ADR doit dire si le champ reste porté et ignoré, ou si `Actor` change de forme. Le laisser
   vestigial sans le dire est exactement le genre d'ambiguïté qu'ADR-0023 a payé pour éviter.
2. 🔴 **`direction` ou `director` ?** Le mot existe déjà en base dans `public.consultants.role`, que
   l'API ne lit jamais (ADR-0023). L'ADR doit dire lequel des deux vocabulaires garde le mot, et
   pourquoi la colonne HR ne devient pas pour autant une source d'autorisation.
3. 🔴 **Quatre personas ou six** (§8). Nombre défendu par écrit deux fois — ADR-0023 et la section
   « Dataset shape » de `CLAUDE.md`. Les deux se modifient ensemble ou pas du tout.
4. 🔴 **Les congés : on franchit le seuil ou non** (§7.1). Le README a écrit d'avance la condition et
   la demande la remplit. C'est le seul chantier de ce document qui crée un module de domaine.
5. 🔴 **L'écriture des données de référence** (§7.4). A14 a déjà entrouvert la porte pour
   `assignments` sans trancher. À décider une fois pour les quatre tables, pas quatre fois.
6. 🟡 **Le seed : clients et missions.** Le tier 2 est juste mais maigre sur 5 clients et 5 missions
   en `Regie`. Contrairement à O1, ajouter des **clients et des missions** ne touche ni le nombre de
   consultants, ni les CRA, ni les mois denses — et `seed:fingerprint` vérifie le déterminisme, pas
   une valeur figée. À vérifier contre les assertions e2e avant de s'y engager, mais **ne pas
   l'écarter par simple analogie avec l'item 6**.
