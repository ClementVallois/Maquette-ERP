# CLAUDE.md — règles de ce dépôt

Maquette d'un module d'ERP interne : **saisie et validation d'un CRA → génération d'un projet de facture en régie**. Le « pourquoi » est dans `README.md`, les arbitrages dans `docs/adr/`.

## Règles d'architecture (non négociables)

1. **Deux modules, une seule flèche.** `temps` et `facturation` sont étanches. `facturation` **n'importe rien** de l'intérieur de `temps` : il réagit à l'événement `temps.CRAValidé`. Toute autre dépendance croisée est un bug, pas un raccourci.
2. **La frontière est vérifiée mécaniquement.** Une règle de dépendance en CI la fait respecter. Si une modification exige de contourner la règle, c'est la règle qu'on discute — dans un ADR — pas le contournement qu'on écrit.
3. **Le domaine est en TypeScript pur.** Pas de framework, pas d'ORM, pas d'accès réseau ni disque dans le domaine : il se teste sans base de données.
4. **Jamais de flottant sur une valeur monétaire.** Entiers en centimes. La TVA se calcule par ligne.
5. **Un invariant métier se tient dans le domaine**, pas dans un contrôleur ni dans une contrainte de base seule (la base peut le doubler, pas le porter).

## Règles de travail

- **Un arbitrage structurant → un ADR**, écrit **au moment** de l'arbitrage (`docs/adr/`, gabarit `0000-template.md`). Chaque ADR nomme l'**option écartée** et le **seuil auquel on changerait d'avis**.
- **Ne pas élargir le périmètre.** Toute idée hors chaîne CRA → facture va dans la section « Ce que je ne construis pas » du README, pas dans le code.
- **Pas de test qui ne prouve rien.** Priorité : invariants du domaine, franchissement de la frontière, autorisation par rôle **et** par périmètre.
- **Les messages de commit comptent** : l'historique fait partie du livrable. Un commit = un pas défendable à voix haute. **Aucun co-auteur autre que Clement Vallois** — pas de trailer `Co-Authored-By`, quelle que soit la façon dont le code a été produit.
- **Ne rien ajouter au README qui ne soit pas encore vrai** (ni stack ni archi tant que l'ADR n'est pas écrit).
