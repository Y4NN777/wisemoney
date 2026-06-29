<p align="center">
  <img src="./apps/web/public/logo.svg" alt="WiseMoney" width="260" />
</p>

<p align="center">
  Finance personnelle locale-first. Suivez votre argent, planifiez, et utilisez l'IA seulement quand vous le décidez.
</p>

<p align="center">
  <strong>PWA en ligne : <a href="https://wisemoney.y7labs.studio/">wisemoney.y7labs.studio</a></strong> · <strong>Edge Go pas encore déployé</strong>
</p>

# WiseMoney

WiseMoney est une PWA mobile-first pour la gestion des finances personnelles.
Les données financières restent d'abord sur l'appareil, dans un journal local
chiffré, et les fonctions d'IA restent séparées du suivi quotidien.

L'application est déjà en ligne sur
[wisemoney.y7labs.studio](https://wisemoney.y7labs.studio/), servie comme PWA via
Vercel. L'edge Go managé existe dans ce repo pour l'authentification et le proxy
IA managé, mais il n'est pas encore déployé. Tant que cet edge n'est pas en ligne,
les appels IA en mode managé restent réservés au développement local; le mode avec
clé personnelle reste le chemin sans backend.

## Dans l'application

- Tableau de bord, saisie rapide, budgets, objectifs, transactions récurrentes et paramètres.
- Dettes & Créances : suivi des dettes et créances avec motif, montant, date,
  statut et rappels sur les créances non soldées.
- Stockage local chiffré avec Dexie / IndexedDB et Web Crypto.
- Installation PWA, notification de mise à jour service worker, et build web en ligne sur Vercel.
- Edge Go optionnel pour l'authentification, les assertions de consentement et le routage IA.

## Déploiement actuel

| Surface | Statut |
| --- | --- |
| PWA web | En ligne sur [wisemoney.y7labs.studio](https://wisemoney.y7labs.studio/) |
| Edge Go | Pas encore déployé |
| Postgres pour l'auth edge | Local/dev uniquement |
| Mode IA avec clé personnelle | Ne dépend pas de l'edge |

## Lancer en local

```bash
pnpm install
pnpm dev
```

L'application web tourne sur `http://localhost:5173`.

## Edge managé en local

Nécessaire seulement pour le mode IA managé.

```bash
cp .env.example .env
docker compose up -d postgres
migrate -path services/edge/migrations -database "$DATABASE_URL" up
docker compose build edge
docker compose up -d edge
```

L'edge tourne sur `http://localhost:8080`.

## Dépôt

| Chemin | Rôle |
| --- | --- |
| `apps/web/` | PWA React + TypeScript. Logique métier et stockage local chiffré. |
| `services/edge/` | Edge Go pour auth, consentement, rate limit et proxy IA. |
| `docs/` | Produit, architecture, threat model, ADRs, diagrammes et runbooks. |
| `docker-compose.yml` | Stack locale Postgres + edge pour le développement du mode managé. |

## Documentation

Commencez par [docs/README.md](./docs/README.md). La posture sécurité est
documentée dans [SECURITY.md](./SECURITY.md) et [docs/THREAT_MODEL.md](./docs/THREAT_MODEL.md).

La vérification des conditions de traitement des données par les fournisseurs IA
reste un prérequis avant toute extension du mode managé :
[runbook provider terms](./docs/runbooks/provider-terms-verification.md).
