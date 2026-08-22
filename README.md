# bi-backend — PiLens API

NestJS 10 tabanlı API. Bkz. kok dizindeki `docs/MIMARI.md` ve `docs/VARSAYIMLAR.md`.

## Kurulum

Gelistirme ortaminda Docker **kullanilmiyor** (bkz. `docs/VARSAYIMLAR.md` V3) — sadece deploy
asamasinda dockerize edilecek. Makinende zaten calisan yerel Postgres 16 ve Redis gerekir:

```bash
npm install
createdb pilens_bi                # yerel Postgres'te bir kere
cp .env.example .env              # DATABASE_URL'i yerel kullanicina gore duzenle
npm run db:generate
npm run db:migrate
npm run start:dev                 # http://localhost:3001/api/v1
```

Port 3001 baskasi tarafindan kullaniliyorsa `PORT=3002 npm run start:dev` gibi farkli bir port
sec ve `bi-frontend/.env` icindeki `VITE_API_BASE_URL`'i buna gore guncelle.

### Demo verisi (satis sunumu icin)

```bash
npm run seed:demo
```

`demo@pilens.com` / `DemoPiLens2026!` girisiyle, 3 sektorden (perakende satis, kargo/
lojistik, klinik randevu) ornek veri + hazir panolarla dolu bir "Demo Sirket" kiracisi
olusturur. Idempotenttir — tekrar calistirinca onceki demo kiraciyi silip yeniden kurar.

## Komutlar

```bash
npm run lint
npm run typecheck
npm test              # birim testler (vitest)
npm run test:e2e      # entegrasyon testleri (gercek Postgres gerektirir)
npm run seed:demo     # demo kiraci + ornek veri + hazir panolar
npm run build
```

## Zod semalari

Bu repo kendi Zod semalarini tutar, `bi-frontend` ile paylasilan bir paket yoktur
(bkz. `docs/VARSAYIMLAR.md` V2 — revize). `QuerySpec` semasi `src/modules/query/dto/query-spec.dto.ts`
altindadir.
