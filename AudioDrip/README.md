# AudioDrip 🎵

AudioDrip is a premium, highly animated responsive web application for music streaming and caching. It is designed to look awesome and run flawlessly on both Windows desktop browsers and mobile web views.

The application automatically streams audio directly, downloads/caches songs locally for zero-buffer offline playback, and features synced lyrics auto-scrolling alongside an audio canvas frequency visualizer.

---

## 🛠️ Technology Stack

- **Frontend**: React 19, Vite, TypeScript, Tailwind CSS v4, Framer Motion (animations), Lucide React (icons)
- **Backend**: Python 3.13, FastAPI (lifespan manager, stream caching, youtube stream proxying)
- **Database**: PostgreSQL (for song catalogs, behavior transition tallies, decay settings)
- **Downloader**: yt-dlp (background threads)

---

## 📂 Project Structure

```
AudioDrip/
├── AudioDrip/               <-- SwiftUI Mobile Client (Xcode project)
├── Frontend/                <-- React Web Application (Vite + TS + Tailwind v4)
└── Server/                  <-- Python FastAPI Server & Database Modules
```

---

## 🚀 Setup & Installation

Follow these steps to configure your PostgreSQL credentials, ingest the data, and start AudioDrip.

### Step 1: Install Python Dependencies
Open your shell in the `Server` directory:
```bash
cd Server
pip install -r requirements.txt
```

### Step 2: Configure PostgreSQL Connection
1. Open the [Server/.env](file:///C:/Users/sharo/Downloads/AudioDrip/AudioDrip/Server/.env) file.
2. Set your local PostgreSQL credentials:
   ```env
   DB_USER=postgres
   DB_PASSWORD=YOUR_POSTGRESQL_PASSWORD
   DB_HOST=localhost
   DB_PORT=5432
   DB_NAME=audiodrip
   ```

### Step 3: Initialize Database & Ingest History
Run the database builder script to create the tables and import your existing search and behavior transitions history:
```bash
python init_db.py
```
*Note: This will read and import data from the existing local JSON files to preserve your recommendations.*

### Step 4: Run the Server
Start the FastAPI backend (which also hosts the compiled React client):
```bash
python app.py
```
*The server will start at `http://localhost:8000`.*

---

## 📱 Windows & Mobile Access

- **On Windows**: Open any browser and navigate to [http://localhost:8000](http://localhost:8000).
- **On Mobile**: Open your mobile browser (Safari/Chrome) and visit `http://[YOUR_COMPUTER_IP]:8000` (e.g. `http://192.168.1.50:8000`). Make sure your mobile device is connected to the same Wi-Fi network as your Windows machine.

---

## 👨‍💻 Development Commands (Optional)

If you wish to make changes to the React client, you can run the hot-reloading development server:
```bash
cd Frontend
npm install
npm run dev
```
Navigate to `http://localhost:5173`. Any API calls to `/api` will be proxied automatically to the backend on port 8000.

To compile changes and make them live on the FastAPI server:
```bash
npm run build
```
This will compile the assets and write them directly into `Server/static/`.
