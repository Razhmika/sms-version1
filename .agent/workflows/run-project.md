---
description: How to run the Stock Management System
---

### Prerequisites
1. **Python 3.10+** (Already installed and running)
2. **Node.js & npm** (Required for frontend)
3. **Google API Key** (Set as `GOOGLE_API_KEY` environment variable)

### Running the Backend
The backend is already running on `http://localhost:8000`. 
If you need to restart it:
1. Navigate to the project root.
2. Run: `python -m uvicorn backend.main:app --reload`

### Running the Frontend
1. Open a new terminal.
2. Navigate to the `frontend` directory: `cd frontend`
3. Install dependencies: `npm install`
4. Start the development server: `npm run dev`
5. Open your browser at the URL provided (usually `http://localhost:5173`)

### Initial Setup
The project comes with a seeding route. To populate with sample data, visit:
`http://localhost:8000/seed` (POST request) or use the "Seed" logic already executed by the agent.
