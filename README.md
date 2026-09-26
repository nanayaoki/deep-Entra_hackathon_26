# VSS Avlokan Portal

## Supabase database

The database layer lives in `supabase/migrations` and is intentionally split into ordered migrations:

1. `20260926000100_vss_avlokan_core.sql` creates enums, identity tables, monthly records, section tables, flags, audit records, and indexes.
2. `20260926000200_vss_avlokan_security.sql` creates role helper functions, audit triggers, Row-Level Security policies, and the private Palak photo bucket policies.
3. `20260926000300_vss_avlokan_views.sql` creates explainable flag refresh logic, dashboard views, and grading queues.

### Run locally

Install the Supabase CLI, then from the project root run:

```bash
supabase login
supabase init
supabase start
supabase db reset
```

The migration files run in timestamp order. For a local demo dataset, run the seed after the migrations:

```bash
supabase db seed
```

The seed creates 15 demo students and six months of sample records. Every seeded student uses the password `Avlokan@123`. It writes directly to `auth.users` and is for local demos only; production accounts must be created through Supabase Auth and then extended in `profiles` and `students`.

### Generate frontend types

After linking the project, generate TypeScript types for the React app:

```bash
supabase link --project-ref YOUR_PROJECT_REF
supabase gen types typescript --linked > src/database.types.ts
```

The current React UI is still using its local prototype state. The next integration step is to install `@supabase/supabase-js`, create a Supabase client, and replace that state with queries against these tables and views.

## Frontend development

This project uses React, TypeScript, and Vite.

This template provides a minimal setup to get React working in Vite with HMR and some Oxlint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the Oxlint configuration

If you are developing a production application, we recommend enabling type-aware lint rules by installing `oxlint-tsgolint` and editing `.oxlintrc.json`:

```json
{
  "$schema": "./node_modules/oxlint/configuration_schema.json",
  "plugins": ["react", "typescript", "oxc"],
  "options": {
    "typeAware": true
  },
  "rules": {
    "react/rules-of-hooks": "error",
    "react/only-export-components": ["warn", { "allowConstantExport": true }]
  }
}
```

See the [Oxlint rules documentation](https://oxc.rs/docs/guide/usage/linter/rules) for the full list of rules and categories.
