# bi-backend — Pusula BI API

NestJS 10 tabanlı API. Bkz. kok dizindeki `docs/MIMARI.md` ve `docs/VARSAYIMLAR.md`.

## Kurulum

```bash
npm install
cp .env.example .env
npm run docker:up      # postgres + redis + mailhog
npm run db:generate
npm run db:migrate
npm run start:dev       # http://localhost:3001/api/v1
```

## Komutlar

```bash
npm run lint
npm run typecheck
npm test              # birim testler (vitest)
npm run test:e2e      # entegrasyon testleri (gercek Postgres gerektirir)
npm run build
```

## `@pusula-bi/shared` bagimliligi

Bu repo, ortak Zod semalarini yerel `bi-shared/` paketinden `file:` protokolu ile tuketir
(bkz. `docs/VARSAYIMLAR.md` V2). GitHub'a tasindiktan sonra git bagimliligina cevrilecek.
