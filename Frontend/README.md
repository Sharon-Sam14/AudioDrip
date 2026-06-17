# AudioDrip Frontend 🎨

This folder contains the React web application for AudioDrip, built using **Vite**, **TypeScript**, and **Tailwind CSS v4**.

---

## 🚀 Development Quick Start

Make sure the FastAPI backend server is running in the background on port `8000` (so API requests succeed).

```bash
# 1. Install packages
npm install

# 2. Run hot-reloading dev server
npm run dev
```
Open `http://localhost:5173` in your browser.

---

## 🛠️ Configuration Details

- **Vite Proxy**: Configured in `vite.config.ts` to proxy any requests starting with `/api` to the backend running at `http://localhost:8000`.
- **Tailwind CSS v4**: Installed using the native Vite compiler plugin `@tailwindcss/vite`, meaning zero-config performance. Styles are loaded inside `src/index.css`.
- **Animations**: Uses `framer-motion` for fluid card transitions, page tab shifts, and glowing sliders.

---

## 📦 Bundling for Production

To compile changes and make them live on the FastAPI server:
```bash
npm run build
```
This builds the TypeScript files, runs Vite bundling, and writes the output files directly into the backend static folder `../Server/static/`.
