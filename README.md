# Console d'administration — Payment Service

Console Next.js du service de paiement mutualisé (prestataire : FeexPay) : gestion des services, supervision des
transactions et des transferts, tableau de bord, file « à régulariser » et explorateur d'API.

- Console : `https://payment-service.mrjuste.online` (hébergée sur Vercel)
- API : `https://payment-service-api.mrjuste.online/v1` — contrat dans le dépôt backend
  (`docs/contract/openapi.yaml`, `docs/contract/CONTRAT_API.md`)

## Stack

| Élément | Version |
|---|---|
| Next.js (App Router) | 16.4.5 |
| zod (validation des réponses de l'API) | 4.6.7 |
| NextAuth (connexion Google) | 4.24.15 |
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
(configs `dev`, `stg`, `prd`), distinct du projet backend : la console n'a jamais accès aux clés du
prestataire de paiement.

| Secret | Rôle |
|---|---|
| `PAYMENT_API_URL` | URL de base de l'API, sans `/v1` (`https://payment-service-api.mrjuste.online`) ; https obligatoire, `http://localhost` admis hors production |
| `ADMIN_API_KEY` | clé admin de l'API (≥ 32 caractères), **la même** que dans la config Doppler du backend |

- **Déploiement** : seule la variable `DOPPLER_TOKEN` (jeton de service en lecture seule, une
  config) est définie chez l'hébergeur ; `src/lib/server/secrets.ts` télécharge les secrets par
  l'API Doppler, les garde 5 min en mémoire (rotation sans redéploiement) et ne cite jamais une
  valeur dans une erreur.
- **Local** : `NEXTAUTH_URL=http://localhost:3000 doppler run -p <projet-console> -c dev -- npm run dev`. Les variables injectées ne sont
  acceptées que hors production et seulement sous `doppler run` (`DOPPLER_CONFIG` présent).

## Connexion (Google, liste blanche)

- **Google uniquement** (NextAuth 4, `src/lib/server/auth.ts`) : adresse **vérifiée** par Google et
  présente dans `ADMIN_EMAILS`, choix du compte toujours proposé. Session JWT chiffrée de 8 h.
- **Proxy** (`src/proxy.ts`, avant chaque page) : session obligatoire (sauf `/login` et la documentation publique `/docs/*`, dont le jeton est vérifié par l'API), adresse revérifiée contre la
  liste blanche à **chaque requête** (retirer une adresse dans Doppler coupe l'accès sous 5 min,
  sans attendre la fin de la session) ; routes `/api/*` sans session → `401` JSON.
- **CSP par nonce** posée par le proxy : seuls les scripts émis par Next.js pour la réponse
  s'exécutent (`strict-dynamic`), aucune ressource tierce, `frame-ancestors 'none'`.
- Retour après connexion limité aux chemins internes (pas de redirection ouverte).

| Secret Doppler | Rôle |
|---|---|
| `AUTH_SECRET` | ≥ 32 caractères aléatoires (`openssl rand -base64 48`) : chiffre les sessions |
| `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` | client OAuth Google « Application Web » |
| `ADMIN_EMAILS` | adresses autorisées, séparées par des virgules |

Variable **non secrète** à définir chez l'hébergeur et en local : `NEXTAUTH_URL` (URL publique de la
console, ex. `https://payment-service.mrjuste.online` ; `http://localhost:3000` en local).

Client OAuth (Google Cloud Console → *API et services* → *Identifiants*) : type *Application Web*,
URI de redirection autorisées `https://payment-service.mrjuste.online/api/auth/callback/google` et
`http://localhost:3000/api/auth/callback/google`.

## Appels à l'API

`src/lib/server/api-client.ts` (`import "server-only"` : toute importation depuis un composant
client fait échouer le build) :

```ts
import { z } from "zod";
import { api } from "@/lib/server/api-client";

const page = await api.admin("/admin/services", {
  query: { status: "active", page: 1 },
  schema: z.object({ data: z.array(Service), meta: ListMeta }),
});
```

- chemins relatifs à `/v1` uniquement, redirections refusées : la clé admin ne peut partir ailleurs ;
- `Idempotency-Key` sur toute écriture (à réutiliser pour réessayer la même opération) ;
- réponse validée par zod (`INVALID_RESPONSE` si elle s'écarte du contrat) ;
- erreurs en `ApiError` : `status`, `code` du contrat, `message`, `details`, `requestId`
  (`NETWORK_ERROR` / `TIMEOUT` si l'API est injoignable).
- Le prestataire (FeexPay aujourd'hui) n'est jamais nommé en dur : la console affiche ce que l'API renvoie.

## Sécurité

- En-têtes sur toutes les pages : CSP par nonce (voir *Connexion*), HSTS, `X-Frame-Options: DENY`,
  `Referrer-Policy: no-referrer`, `Permissions-Policy`, pas d'en-tête `X-Powered-By`.
- Fermée par défaut : sans secrets Doppler valides, aucune page n'est servie.
- Console jamais indexée (`robots: noindex, nofollow`).
- Image Docker : sortie `standalone`, utilisateur non-root, npm / corepack / yarn retirés, scan Trivy
  (HIGH / CRITICAL bloquants) en CI.

## Rendu Markdown

Les descriptions du contrat sont rendues par `src/lib/markdown.tsx` (paragraphes, listes,
tableaux, `code`, **gras**) en éléments React : aucun HTML n'est interprété, pas de
`dangerouslySetInnerHTML`.

## Graphiques

Courbes en SVG sans bibliothèque (`src/components/dashboard/line-chart.tsx`, calculs dans
`src/lib/chart.ts`) : une seule échelle, lignes de 2 px, graduations rondes, trous pour les valeurs
absentes (jamais d'interpolation inventée), légende dès deux séries, réticule et info-bulle à la
souris et au clavier (flèches), vue tableau. Palette catégorielle validée pour **4 séries au plus**,
en clair et en sombre (contrôles daltonisme et contraste) : couleur fixe par service, dans l'ordre
de la sélection. Deux teintes passent sous 3:1 sur fond clair : la légende et la vue tableau
compensent. Jetons de couleur dans `src/app/globals.css`.

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
| `image` | Build Docker, scan Trivy, smoke test (démarrage, fermée par défaut sans secrets) |
| `deploy` | `main` uniquement : build et déploiement Vercel (`--prebuilt --prod`), attente de la révision sur `/api/health`, contrôle de `/login` et de la redirection de `/` |

Déploiement Vercel (réglages, secrets, Google, DNS, retour arrière) : [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md).
`GET /api/health` (public, sans secret) renvoie la révision construite (`CONSOLE_REVISION`, figée au build).

## Écrans

| Écran | Chemin | Contenu |
|---|---|---|
| Services | `/services` | liste (recherche, statut, pagination), statistiques par service |
| Nouveau service | `/services/new` | création ; identifiant, clé API et secret webhook affichés **une seule fois** |
| Détail d'un service | `/services/{id}` | identifiants et activité, rotation de la clé API (période de grâce) et du secret webhook, activation / désactivation, configuration (URL de notification, hôtes de retour, transferts et plafonds) |
| Tableau de bord (accueil) | `/dashboard` | indicateurs par devise (encaissé, décaissé frais compris, frais, solde disponible, paiements, retraits, taux de réussite, en attente) pour tous les services ou un seul ; courbe d'une métrique au choix sur 7 j / 30 j / 90 j / 12 mois ou une période personnalisée (heure du Bénin, 366 jours max), par heure, jour, semaine ou mois, avec jusqu'à 4 services comparés ; vue tableau des valeurs |
| Transactions | `/transactions` | recherche exacte (UUID, référence client ou prestataire), filtres combinables (service, statut, type, moyen, période à l'heure du Bénin, utilisateur, transfert), tri, pagination ; filtres conservés dans l'URL |
| Détail d'une transaction | `/transactions/{id}` | opération, parties (numéros masqués), références prestataire, historique, notifications envoyées au service (tentatives, dernier code), métadonnées, rattachement à un transfert ; revérification auprès du prestataire si elle est en attente |
| Utilisateurs | `/users` | recherche par UUID exact, filtre par service ; services fréquentés, nombre de transactions, montants payés |
| Détail d'un utilisateur | `/users/{id}` | activité et totaux payés / reçus par service et par devise ; liens vers ses transactions et ses transferts |
| Transferts | `/transfers` | recherche exacte, filtres (statut, service, période, utilisateur payeur ou bénéficiaire), raccourci « en revue » |
| Détail d'un transfert | `/transfers/{id}` | payeur et bénéficiaire (numéros masqués), montants et frais, mouvements (toutes les tentatives), historique avec motifs ; pour un transfert en revue : relancer le versement ou rembourser le payeur avec un motif obligatoire |
| Explorateur d'API | `/api-explorer` | remplace Swagger UI : catalogue `GET /v1/meta/endpoints` groupé par tag, recherche, fiche dépliable par endpoint (description du processus, authentification, idempotence, en-têtes et paramètres, schéma du corps en arbre de champs, exemple, exemple `curl` avec des emplacements pour les clés, réponses avec exemples), badge « Bientôt » pour une route prévue |
| Liens publics | `/api-explorer/links` | partager la documentation sans compte : création (destinataire, expiration facultative), copie, activation / désactivation, suppression, compteur de visites |
| Documentation publique | `/docs/{jeton}` | **sans session**, lecture seule, routes d'intégration uniquement (jamais `/admin/*`), non indexée ; lien désactivé, expiré ou inconnu : « Lien indisponible » sans autre détail |
| À régulariser | `/reviews` | dossiers ouverts par défaut (onglets ouverts / clos / tous), filtre par type ; badge du nombre de dossiers ouverts dans la navigation |
| Détail d'un dossier | `/reviews/{id}` | constat lisible (montants dans leur devise, dates), suivi (signalements, clôture), liens vers la transaction et le service ; clôture avec note obligatoire (5 à 500 caractères, confirmation), sans jamais modifier la transaction |

Organisation : pages en composants serveur (`src/app/(console)`), écritures par **actions serveur**
(`actions.ts`) qui revérifient la session admin, valident les identifiants reçus et réutilisent la
clé d'idempotence du formulaire. Les secrets ne transitent qu'une fois, dans la réponse de l'action ;
rien n'est stocké côté console. Un bandeau signale une API injoignable, un prestataire indisponible
ou le mode sandbox (`/v1/ready`).

## Feuille de route

1. ~~Secrets Doppler côté serveur et client API admin (`server-only`)~~
2. ~~Connexion Google (liste blanche d'adresses), CSP par nonce~~
3. ~~Déploiement Vercel (production sur `main`, après toute la CI)~~
4. ~~Services~~ · ~~Transactions~~ · ~~Tableau de bord~~ · ~~Utilisateurs~~ · ~~Transferts~~ · ~~À régulariser~~ · ~~Explorateur d'API~~
