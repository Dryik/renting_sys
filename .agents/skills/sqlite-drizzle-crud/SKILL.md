---
name: sqlite-drizzle-crud
description: Use when creating SQLite database tables, Drizzle schemas, CRUD services, list screens, forms, validation, and search.
---

# SQLite Drizzle CRUD Skill

Rules:
- Keep SQL/Drizzle logic outside React components.
- Use services or repository functions for database operations.
- Use Zod validation for form inputs.
- Use TypeScript types from schema where possible.
- Use created_at and updated_at on business tables.
- Prefer soft delete or inactive status over permanent deletion.
- Add basic search for list screens.
- Keep forms simple.
- Do not add unnecessary abstraction layers.

For every CRUD module:
1. schema
2. validation
3. service functions
4. list screen
5. create/edit form
6. search
7. empty state
8. basic error handling
