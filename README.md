# Console d'administration — Payment Service

Console Next.js du service de paiement mutualisé (SebPay) : gestion des services, supervision des
transactions et des transferts, tableau de bord, file « à régulariser » et explorateur d'API.

- Console : `https://payment-service.mrjuste.online` (hébergée sur Vercel)
- API : `https://payment-service-api.mrjuste.online/v1` — contrat dans le dépôt backend
  (`docs/contract/openapi.yaml`, `docs/contract/CONTRAT_API.md`)

## Stack

| Élément | Version |
|---|---|
| Next.js (App Router) | 16.4.5 |
| React | 19.3.1 |
| TypeScript (strict, `noUncheckedIndexedAccess`) | 5.9.3 |
| Tailwind CSS | 4.3.5 |
| ESLint (`eslint-config-next`) | 10.14.0 |
| Vitest | 4.1.12 |
| Node.js | 22 |

Versions épinglées exactement (pas de `^`). Le lockfile se régénère avec **npm 11**
(`npx npm@11.21.2 install`) : npm 10 bute sur un bug de résolution des dépendances pairs ;
`npm ci` (npm 10 ou 11) l'accepte ensuite.

## Démarrer

```bash
npm ci
npm run dev        # http://localhost:3000
```

Sans Node local : `docker run --rm -it -p 3000:3000 -v "$PWD":/app -w /app node:22-bookworm-slim sh -c "npm ci && npm run dev -- -H 0.0.0.0"`.

| Commande | Rôle |
|---|---|
| `npm run lint` | ESLint, zéro avertissement toléré |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Vitest |
| `npm run build` | Build de production (sortie `standalone`) |
| `npm run check` | lint + typage + tests |

## Secrets

Aucun secret dans le code ni dans le dépôt. Ils viennent de **Doppler**, projet dédié à la console
(configs `dev`, `stg`, `prd`), distinct du projet backend : la console n'a jamais accès aux clés
SebPay. La clé admin de l'API n'est utilisée **que côté serveur** Next.js (route handlers / server
actions), jamais envoyée au navigateur.

## Sécurité

- En-têtes sur toutes les pages : CSP restrictive (`frame-ancestors 'none'`, aucune ressource
  tierce), HSTS, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, `Permissions-Policy`,
  pas d'en-tête `X-Powered-By`. La CSP passera par nonce avec le proxy d'authentification.
- Console jamais indexée (`robots: noindex, nofollow`).
- Image Docker : sortie `standalone`, utilisateur non-root, npm / corepack / yarn retirés, scan Trivy
  (HIGH / CRITICAL bloquants) en CI.

## Conventions Git

Mêmes règles que le backend, vérifiées par les hooks (`.githooks`, activés par `npm ci` / `npm install`
via `core.hooksPath`) et par la CI :

- une branche par cas d'usage : `<type>/<cas-d-usage>` (ex. `feat/admin-services`) ;
- commits : `<type>(<cas-d-usage>): <tâche effectuée>`, sujet ≤ 100 caractères, ligne vide avant le corps ;
- **20 fichiers modifiés au maximum par branche** ;
- jamais de commit direct sur `main`.

Types : `feat`, `fix`, `chore`, `ci`, `docs`, `test`, `refactor`, `perf`, `build`.

| Hook | Vérifications |
|---|---|
| `pre-commit` | pas sur `main`, nom de branche, limite de fichiers (avec l'index), lint |
| `commit-msg` | format du message |
| `pre-push` | nom de branche, limite de fichiers, typage, tests |

## CI (GitHub Actions)

| Job | Contenu |
|---|---|
| `guards` | Nom de branche, messages de commit, limite de 20 fichiers (PR) |
| `quality` | lint, typage, tests, build |
| `security` | `npm audit` (dépendances de production, HIGH et plus), gitleaks sur tout l'historique |
| `image` | Build Docker, scan Trivy, smoke test de démarrage |

## Feuille de route

1. Secrets Doppler côté serveur et client API admin (`server-only`)
2. Connexion Google (liste blanche d'adresses), CSP par nonce
3. Déploiement Vercel (preview par PR, production sur `main`)
4. Services · Transactions · Tableau de bord · Utilisateurs · Transferts · À régulariser · Explorateur d'API
