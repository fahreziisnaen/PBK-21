// Unit tests never open a real database connection — that's what
// tests/e2e/ is for, against the local Postgres started via scripts/db.sh
// or docker-compose.yml. They only need DATABASE_URL to be a syntactically
// valid string so importing src/lib/prisma.ts — pulled in transitively by
// modules such as src/lib/activity-context.ts — doesn't trip the startup
// guard added there (see finding "no DATABASE_URL guard" in the final
// review). A real DATABASE_URL already set in the environment is left
// untouched.
process.env.DATABASE_URL ??= 'postgresql://test:test@localhost:5432/test?schema=public';
