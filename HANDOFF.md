# ShopSRY — Handoff (2026-07-11)

Bu hujjat `dev` branch'ga kiritilgan o'zgarishlarni, lokal ishga tushirish tartibini,
kirish ma'lumotlarini va ma'lum muammolarni tavsiflaydi. Ikkala repoda (frontend va
backend) bir xil nusxasi bor.

- **Frontend**: React (CRA), `shopsry-frontend` — https://github.com/shopsry/shop_frontend
- **Backend**: Express + PostgreSQL, `shopsry-backend` — https://github.com/Tolmas001/shop_backend

Do'kon turi: **kosmetika / beauty e-commerce** (Clinique, Nivea, La Roche-Posay va b.).

---

## 1. Lokal ishga tushirish

### Talablar
- Node.js, PostgreSQL (17), Redis (BullMQ queue'lar uchun)

### Backend
```bash
cd shop_backend
cp .env.exsample .env          # keyin .env ni to'ldiring (pastga qarang)
createdb shop                  # PostgreSQL'da "shop" bazasini yarating
npm install
node server.js                 # yoki: npm run dev   (port 5001)
```

**Muhim `.env` sozlamalari (lokal):**
```
PORT=5001
# DATABASE_URL ni BO'SH qoldiring — u SSL'ni majburlaydi va lokal Postgres bilan ishlamaydi.
# Buning o'rniga PG* o'zgaruvchilaridan foydalaning:
PGHOST=127.0.0.1
PGPORT=5432
PGDATABASE=shop
PGUSER=<lokal postgres useringiz, masalan: ali>
PGPASSWORD=
JWT_SECRET=local_dev_jwt_secret
ADMIN_USERNAME=admin
ADMIN_PASSWORD=admin12345
REDIS_URL=redis://localhost:6379
FRONTEND_URL=http://localhost:3000
```
> `.env` git'ga kiritilmagan (`.gitignore`da). Har bir ishlab chiquvchi o'zi to'ldiradi.

### Frontend
```bash
cd shop_frontend
cp .env.exsample .env
npm install
npm start                      # port 3000
```
**Frontend `.env` (muhim — `/api` prefiksi bo'lishi shart):**
```
REACT_APP_API_URL=http://localhost:5001/api
REACT_APP_BACKEND_URL=http://localhost:5001
REACT_APP_GOOGLE_CLIENT_ID=
```

### Test ma'lumotlarini yaratish (backend)
```bash
cd shop_backend
node scratch/seed_market.js
```
Bu skript:
- 100 ta mahsulotga kategoriyaga mos **yuqori sifatli Unsplash rasmlari** biriktiradi
- **45 ta test mijoz** yaratadi (o'zbekcha ismlar), paroli: `test1234`
- Oxirgi **30 kun bo'ylab ~296 ta buyurtma** generatsiya qiladi (o'sish trendi, real statuslar,
  order_items bilan) — admin dashboard statistikasini "1 oylik jonli savdo" ko'rinishida to'ldiradi

Mahsulotlarning o'zi `seed_cosmetics.js` orqali (100 ta kosmetika mahsuloti) yaratiladi.

---

## 2. Kirish ma'lumotlari
- **Admin**: `admin` / `admin12345`
- **Test mijozlar**: har qanday seed qilingan username / `test1234`
- Admin panel: `/admin/login`

---

## 3. Bu branch'da qilingan ishlar

### A. Kritik bug fixlar (frontend)
1. **Autentifikatsiya buzuq edi** — backend `{accessToken, refreshToken, user}` qaytaradi,
   frontend esa `res.data.token` (undefined) o'qirdi. Natijada **login, admin panel va profil
   umuman ishlamas edi**. `src/context/AppContext.jsx` — `login()` va `googleLogin()` endi
   `res.data.accessToken` ni o'qiydi.
2. **Mahsulot kartalari ko'rinmasdi** — framer-motion `whileInView` re-render'da `opacity: 0.13`
   da qotib qolardi. `src/components/ProductCard.jsx` ishonchli CSS reveal'ga o'tkazildi.
3. **Hero banner bo'sh edi** — framer-motion staggered animatsiya `opacity: 0` da qotardi.
   `src/pages/Home.jsx` — banner CSS-based reveal'ga o'tkazildi.
4. **Toast key warning** — bir vaqtda chiqqan bildirishnomalar bir xil `Date.now()` key olardi.
   Endi unique id (`Date.now()-random`).

### B. Mobil moslashuv (butun ilova)
- **Do'kon**: mobil'da 1 ustun → **2 ustun** grid, compact mahsulot kartalari
- **Savat**: compact item layout (rasm + info bir qatorda, controls pastda)
- **Checkout**: order summary + forma vertical stack
- **Admin dashboard**: stat kartalar **2×2 grid**, daromad raqami sig'adigan qilindi,
  nav horizontal scroll (momentum + scrollbar)
- **Admin jadvallar (14 ta)**: mobil'da **card layout** (`.table-cards` + `data-label`) —
  har qator `LABEL: qiymat` kartaga aylanadi, horizontal scroll yo'q. Buyurtmalar, Mahsulotlar,
  Foydalanuvchilar, Kategoriyalar, Reklama, Promokodlar, Analitika, Inventar va b.
- Action tugmalari kartada to'liq kenglikda; sahifa sarlavhasi + "Yangi" tugma wrap qiladi
- **Horizontal overflow yo'q** (barcha sahifalar 375px ichida)

### C. Umumiy UI/UX yaxshilanishlar (rang o'zgarmagan — asl ko'k brand)
`src/index.css` oxiridagi "UI/UX ENHANCEMENTS" bloki:
- Klaviatura uchun `:focus-visible` fokus ringlari (accessibility)
- `scroll-behavior: smooth`, `prefers-reduced-motion` qo'llab-quvvatlash
- Bosilish (`:active`) feedback, brendli scrollbar, disabled holatlar

### D. Backend
- `scratch/seed_market.js` — yuqoridagi test-data generatori (yagona yangi fayl).
  Backend kodining o'zi (routes, middleware, server.js) **o'zgartirilmagan**.

> **Eslatma**: Dizayn bir bosqichda "warm beauty" (terracotta/krem) palettega o'tkazilgan edi,
> keyin buyurtmachi so'roviga ko'ra **asl ko'k brandga to'liq qaytarildi** (git orqali). Hozirgi
> holatda rang o'zgarishlari yo'q — faqat UI/UX, mobil va bug fixlar.

---

## 4. Ma'lum cheklovlar / keyingi qadamlar
- **Google login** ishlamaydi — `REACT_APP_API_URL`/backend `GOOGLE_CLIENT_ID` bo'sh.
- **SMTP / Payme / Click / VAPID push** — kalitlar `.env`da bo'sh, real integratsiya uchun to'ldirish kerak.
- **Dark mode** — asosan front-facing sahifalar uchun sozlangan; ba'zi admin joylarida
  qo'shimcha sinov foydali bo'lishi mumkin.
- Preview/dev muhitida Unsplash rasmlari ba'zan `ERR_BLOCKED_BY_ORB` beradi — oddiy brauzerda
  (Chrome/Safari) muammosiz ochiladi.
- `seed_market.js` ni qayta ishga tushirish mavjud test buyurtmalarga **qo'shib boradi**
  (tozalamaydi) — kerak bo'lsa oldin `orders`/`order_items`/test `users` ni tozalang.

---

## 5. O'zgargan fayllar

**Frontend (`shop_frontend`):**
- `src/context/AppContext.jsx` — auth token fix, toast key fix
- `src/components/ProductCard.jsx` — reveal fix
- `src/pages/Home.jsx` — hero banner fix
- `src/index.css` — mobil + UI/UX + `.table-cards`
- `src/pages/admin/*.jsx` (14 ta) — jadvallar card layout (`table-cards` + `data-label`)

**Backend (`shop_backend`):**
- `scratch/seed_market.js` — test-data generatori (yagona yangi fayl; backend kodi o'zgarmagan)

🤖 Generated with [Claude Code](https://claude.com/claude-code)
