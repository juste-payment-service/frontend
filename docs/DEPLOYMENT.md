# Déploiement — console sur Vercel

Chaîne : **PR fusionnée dans `main`** → CI (garde-fous, lint, typage, tests, build, audit, gitleaks,
image Docker + Trivy) → job `deploy` : `vercel pull` → `vercel build --prod` (commit figé dans
l'application) → `vercel deploy --prebuilt --prod`, puis la CI attend la nouvelle révision sur
`/api/health` et vérifie que `/login` répond (secrets Doppler valides, CSP par nonce) et que `/`
redirige vers la connexion.

Vercel ne déploie **jamais** de lui-même (`vercel.json` : `git.deploymentEnabled = false`) : seul un
commit qui a passé toute la CI part en ligne.

| Élément | Valeur |
|---|---|
| Console | `https://payment-service.mrjuste.online` |
| API | `https://payment-service-api.mrjuste.online` (staging, sandbox FeexPay) |
| Secrets | Doppler, projet de la console, config `stg` |

> L'environnement **Production** de ce projet Vercel sert pour l'instant la console de **staging**
> (secrets Doppler `stg`). La vraie production aura son propre projet ou domaine et la config `prd`.

## 1. Doppler (projet de la console, config `stg`)

| Secret | Valeur |
|---|---|
| `PAYMENT_API_URL` | `https://payment-service-api.mrjuste.online` |
| `ADMIN_API_KEY` | **la même** valeur que `ADMIN_API_KEY` dans la config `stg` du backend |
| `AUTH_SECRET` | `openssl rand -base64 48` |
| `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` | client OAuth Google (étape 2) |
| `ADMIN_EMAILS` | adresses autorisées, séparées par des virgules |

Créer ensuite un **service token** en lecture seule sur la config `stg` : c'est le seul secret confié
à Vercel.

## 2. Google Cloud (client OAuth)

*API et services → Identifiants → Créer → ID client OAuth* : type **Application Web**.
URI de redirection autorisées :

- `https://payment-service.mrjuste.online/api/auth/callback/google`
- `http://localhost:3000/api/auth/callback/google` (développement)

Écran de consentement : type *Externe* (ou *Interne* avec Google Workspace), portées par défaut
(`openid`, `email`, `profile`). Seules les adresses de `ADMIN_EMAILS` pourront entrer.

## 3. Vercel

1. *Add New → Project* → importer `juste-payment-service/frontend` (framework Next.js détecté,
   réglages de build par défaut, Node.js 22).
2. *Settings → Environment Variables*, environnement **Production** uniquement :

   | Variable | Valeur |
   |---|---|
   | `DOPPLER_TOKEN` | service token Doppler (étape 1) — cocher *Sensitive* |
   | `NEXTAUTH_URL` | `https://payment-service.mrjuste.online` |

3. *Settings → Domains* : ajouter `payment-service.mrjuste.online`, puis créer chez le registrar
   l'enregistrement **CNAME** indiqué par Vercel. TLS est géré par Vercel.
4. *Settings → Deployment Protection* : laisser *Standard Protection* (le domaine de production est
   public, la connexion Google est imposée par la console ; les URL de déploiement restent protégées).
5. Identifiants pour la CI :
   - *Account Settings → Tokens* : créer un token limité à l'équipe du projet ;
   - *Project Settings → General* : **Project ID** ; *Team Settings → General* : **Team ID**
     (ou `.vercel/project.json` après `vercel link` en local).

## 4. GitHub (dépôt frontend)

*Settings → Environments → New environment* : `staging`.

| Type | Nom | Valeur |
|---|---|---|
| Secret | `VERCEL_TOKEN` | token Vercel (étape 3.5) |
| Variable | `VERCEL_ORG_ID` | Team ID |
| Variable | `VERCEL_PROJECT_ID` | Project ID |
| Variable | `CONSOLE_URL` | `https://payment-service.mrjuste.online` |

## 5. Backend

Rien à changer : la console appelle l'API **depuis le serveur** (pas de CORS nécessaire) avec la clé
admin lue dans Doppler.

## Vérifier

```bash
curl -s https://payment-service.mrjuste.online/api/health   # {"status":"ok","revision":"<12 car. du commit>"}
curl -sI https://payment-service.mrjuste.online/ | head -1  # 307 → /login
```

## Revenir en arrière

Vercel → *Deployments* → déploiement précédent → *Instant Rollback* (ou *Promote to Production*).
