# EcoPilot AI

An explainable, bounded sustainability co-pilot. It ingests household electricity/water
consumption data, quantifies inefficiencies, detects anomalies with a transparent statistical
method, simulates hypothetical reductions, and produces a prioritised action plan — while
labelling **every** number it surfaces with an *evidence class* so nothing is ever presented as
a measurement when it is an estimate, an assumption, or a simulation.

Built for the **PromptWars: "Build Beyond AI — Engineer Secure, Intelligent and Autonomous
Applications"** challenge.

---

## Quick start

```bash
npm install
npm run dev        # http://localhost:5173
```

No configuration is required to run: with no backend endpoint set, the app executes a fully
deterministic local tool pipeline and says so in the UI.

## Scripts

| Script | Purpose |
| --- | --- |
| `npm run dev` | Vite dev server with HMR |
| `npm run build` | Type-check (`tsc -b`) then produce the production bundle in `dist/` |
| `npm run preview` | Serve the production build locally |
| `npm run lint` | ESLint over the repository |
| `npm run check` | Type-check only (`tsc -b --noEmit`) |
| `npm test` | Run the vitest suite once |
| `npm run test:watch` | Run vitest in watch mode |

## Environment variables

Copy `.env.example` to `.env` and adjust as needed. `.env` files are git-ignored.

| Variable | Scope | Secret? | Description |
| --- | --- | --- | --- |
| `VITE_AGENT_API_URL` | Frontend (bundled) | **No** | Base URL of the secure agent backend, e.g. `https://agent.example.com`. Leave empty to use the deterministic local pipeline. Only `VITE_`-prefixed variables reach the browser. |
| `GEMINI_API_KEY` | **Backend only** | **Yes** | Google Gemini API key. Must never be set in the frontend build or committed. |
| `GEMINI_MODEL` | **Backend only** | No | Gemini model id used by the backend for reasoning. |
| `ALLOWED_ORIGINS` | **Backend only** | No | Comma-separated CORS allow-list containing the deployed UI origin. |

> **Why the key is safe.** The browser never holds a credential. The only client variable is a
> non-secret endpoint URL. All model calls are proxied by the backend, which owns the key and
> enforces the CORS allow-list. See `src/services/api.ts`.

### Backend contract

The frontend expects an HTTPS service exposing:

```
GET  {VITE_AGENT_API_URL}/health
     -> { "geminiConfigured": boolean, "model"?: string }

POST {VITE_AGENT_API_URL}/agent
     body: AgentRequest
     -> AgentResponse        (types in src/types/index.ts)
```

The app degrades honestly: if the backend is unreachable, misconfigured, or reports no Gemini
credentials, it falls back to the local deterministic pipeline and labels the response as such.
It never claims a model answered when one did not.

## Architecture

```
src/
  types/          Shared models + evidence classes (single source of truth)
  services/
    csvParser.ts    Strict CSV validation; nothing is silently repaired
    analytics.ts    Derived metrics + MAD-based anomaly detection
    calculations.ts Pure cost / emissions / simulation formulas
    tools.ts        Bounded tool registry (6 tools, typed argument validation)
    agentService.ts Intent classification, orchestration, response composition
    api.ts          Backend client (timeouts, typed errors, health probe)
    testSuite.ts    In-app regression suite
  store/          zustand store with persisted settings and datasets
  hooks/          Theme, derived analysis, agent health
  components/     UI primitives, dashboards, charts, layout
  pages/          Nine routed workspaces (code-split)
```

### Evidence classes

Every surfaced value carries one of `measured`, `calculated`, `assumption`, `interpretation`,
`simulated`, or `demo`. The UI renders the class alongside the value, so a projected saving can
never be mistaken for a metered reading.

### Bounded autonomy

The agent may only invoke the six registered tools, each validating its own typed arguments
before execution. There is no shell access, no dynamic evaluation, and no unbounded loop.
Objectives outside the supported set are refused with an explanation instead of answered
speculatively.

## Testing

```bash
npm test        # 61 tests across 7 suites
```

Coverage includes CSV validation edge cases (missing columns, empty files, negatives,
non-numeric values, duplicate dates, delimiter and currency handling), cost/emissions/simulation
formulas and clamping, MAD anomaly detection (including the `MAD = 0` degenerate case),
analytics trend/total calculations, the tool registry's security guards (unknown dataset,
out-of-range arguments, unrecognised argument keys), agent orchestration and evidence
labelling, formatting helpers, and a guard on the in-app regression suite.

## Deployment

The build output is a static SPA in `dist/`.

**Vercel** — `vercel.json` is committed and configures the build, the SPA rewrite, immutable
caching for hashed assets, and security headers (CSP, `X-Content-Type-Options`,
`X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`).

**Netlify** — `public/_redirects` provides the SPA fallback. Build command `npm run build`,
publish directory `dist`.

**Any static host** — serve `dist/` and rewrite unknown paths to `/index.html`.

Set `VITE_AGENT_API_URL` in the hosting provider's environment settings before building if you
want the app to talk to a backend. Remember that `VITE_`-prefixed values are public.
