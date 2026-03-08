# API Contract Sync

This project keeps `/v1/app/meta` route inventory and `docs/openapi.json` in sync using a shared source contract.

## Source of truth

- `src/server/contract/routes.js`: route inventory + OpenAPI operation metadata.
- `src/server/contract/openapi.js`: OpenAPI 3.1 builder (`OPENAPI_SPEC`).

## Flow

1. Edit routes in `src/server/contract/routes.js`.
2. Regenerate OpenAPI document:
   - `npm run generate:openapi`
3. Run validations:
   - `npm test`

`test/openapi-contract.test.js` verifies:

- `/v1/app/meta` route inventory equals generated contract route list.
- `docs/openapi.json` equals generated `OPENAPI_SPEC`.
