# Deploy: Vercel + Render + MongoDB Atlas

## 1) Backend (Render)
- Create a new Web Service from this repo.
- Render reads `render.yaml` automatically.
- Set env vars in Render dashboard:
  - `MONGODB_URI` (Atlas connection string)
  - `CLIENT_URL` (your Vercel URL, e.g. `https://your-app.vercel.app`)
  - `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`
  - `CLOUDINARY_CLOUD_NAME`
  - `CLOUDINARY_API_KEY`
  - `CLOUDINARY_API_SECRET`
  - `CLOUDINARY_FOLDER` (optional, defaults to `art-painting-inventory`)
- Deploy and copy backend URL (example: `https://art-inventory-api.onrender.com`).

## 2) Frontend (Vercel)
- Import this repo into Vercel.
- Vercel will use `vercel.json`.
- Add env var:
  - `VITE_API_URL=https://art-inventory-api.onrender.com/api`
- Deploy.

## 3) CORS
- Ensure backend `CLIENT_URL` exactly matches your Vercel domain.
- Multiple domains supported via comma-separated list.

## 4) Verify
- Backend health: `https://<render-domain>/api/health`
- Frontend login and CRUD should work.
