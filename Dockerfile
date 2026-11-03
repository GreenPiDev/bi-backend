FROM mcr.microsoft.com/playwright:v1.62.1-noble AS build
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install
COPY . .
RUN npx prisma generate
RUN npm run build
# Surum kimligi: derlenmis kod + migration icerigi hash'i. Ayni imajdan calisan tum instance'lar
# ayni degeri gorur (bkz. src/core/http/app-version.ts); kod degismedikce degismez.
RUN find dist prisma -type f -print0 | sort -z | xargs -0 sha256sum | sha256sum | cut -c1-16 > BUILD_ID

# Playwright base image ships Chromium + all OS-level deps pre-installed, matching the
# exact playwright npm version below (see PDF export: dashboard-pdf.service.ts, quote-pdf.service.ts).
FROM mcr.microsoft.com/playwright:v1.62.1-noble
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json* ./
RUN npm install --omit=dev --ignore-scripts
COPY --from=build /app/dist ./dist
COPY --from=build /app/BUILD_ID ./BUILD_ID
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build /app/node_modules/@prisma ./node_modules/@prisma

EXPOSE 3011
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/src/main.js"]
