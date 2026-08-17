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
   - la TVA se calcule **par ligne**, pas sur le total.
3. **L'autorisation est testée**, par rôle _et_ par périmètre : un manager d'une implantation ne lit pas les marges d'une mission qui n'est pas la sienne, et c'est un test qui le prouve.
4. **Des arbitrages écrits au moment où ils sont pris** → `docs/adr/`. Chaque ADR nomme l'option écartée et le seuil auquel on changerait d'avis.

## Ce que je ne construis pas

_(à écrire — section obligatoire : elle dit ce qui a été laissé de côté **volontairement**, et pourquoi. Se remplit en même temps que le code, à chaque fois qu'un sujet est écarté.)_

Déjà hors périmètre par construction :

- le forfait au sens large (seule la **régie** est facturée ici) ;
- l'envoi réel des factures, la comptabilité, les règlements et les relances ;
- la gestion des utilisateurs et l'authentification en production (jeu de rôles simulé).

## Architecture

_(à écrire — après les ADR correspondants. Ne pas décrire une architecture qui n'est pas encore arbitrée.)_

## Stack

_(à écrire — la stack se choisit dans un ADR, elle ne se décrète pas dans un README. TypeScript / Node.js / PostgreSQL sont acquis ; le reste est ouvert.)_

## Démarrer

_(à écrire — un `docker compose up` + une commande de migration + une commande de seed, et rien d'autre à savoir.)_

## Jeu de données

_(à écrire — il doit ressembler à la réalité d'un cabinet : plusieurs pôles, plusieurs implantations, régie et forfait, un consultant en intercontrat, une habilitation qui contraint une affectation.)_

## Tests et portes de CI

_(à écrire — lister les portes et ce que chacune empêche de merger.)_
