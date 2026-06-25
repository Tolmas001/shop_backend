# ShopSRY Backend

**Express + PostgreSQL** e‑commerce backend.

## 📦 Mahalliy rivojlantirish
```bash
# .env.example ni .env ga nusxa olish
cp .env.exsample .env
# Kerakli lokal PostgreSQL ma'lumotlarini .env ga to'ldiring (agar lokal DB ishlatilsa)
npm install
npm run dev   # nodemon bilan avtomatik qayta yuklash
```

## 🐳 Docker bilan qurish va ishga tushirish
```bash
# Docker imijini qurish
docker build -t shopsry-backend .
# Docker konteynerini ishga tushirish
docker run -p 5002:5002 \
  -e DATABASE_URL=postgresql://<user>:<pass>@<host>:5432/<db> \
  shopsry-backend
```

## 🟢 Render ga joylashtirish
1. Render.com’da **Web Service** yarating, repo (`shop_backend`) ni tanlang.
2. **Environment** → `DATABASE_URL` ni Render PostgreSQL add‑on‑dan olingan connection string bilan qo‘shing.
3. **Deploy** tugmasini bosing. Render `$PORT` ni avtomatik beradi.
4. **Health‑check** URL: `https://<service>.onrender.com/health` → `{ "status": "ok" }`.

## 🌐 Frontend (Vercel) bilan integratsiya
Vercel’da **Environment Variables** ga quyidagilarni qo‘shing va redeploy qiling:
```
REACT_APP_API_URL=https://<service>.onrender.com
REACT_APP_BACKEND_URL=https://<service>.onrender.com
```
Shu bilan frontend Render‑dagi backendga to‘g‘ri yo‘naltiriladi.

## 🛡️ Security & SSL
`database.js` faylida `DATABASE_URL` mavjud bo‘lsa SSL (`rejectUnauthorized: false`) bilan ulanadi – bu Render‑dagi PostgreSQL uchun zarur.

## 📖 Qo‘shimcha
- **CORS** sozlamalari `server.js` da Vercel frontend originiga mos keladi.
- **Health‑check** endpoint (`GET /health`) `server.js` ga qo‘shilgan.
- **Procfile** (`web: npm start`) Render uchun kerak.

---
*Bu README mahalliy, Docker va Render muhitlarida ishlash bo‘yicha to‘liq yo‘riqnoma beradi.*
