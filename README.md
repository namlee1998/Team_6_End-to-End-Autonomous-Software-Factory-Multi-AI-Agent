# AIDLC Control Platform (Team 6)

Welcome to the **End-to-End Autonomous Software Factory** built by Team 6. This project is a cutting-edge platform designed to completely automate the Software Development Life Cycle (SDLC) using multi-AI agents, LangGraph state management, and an interactive React-based dashboard.

## Overview

The platform consists of three main components:
1. **AI Agents (`/agents`)**: A Python/LangGraph backend that powers 5 specialized AI Agents (Intent, PO, UX, DEV, QA).
2. **Backend (`/backend`)**: A Node.js/Express service that acts as an API gateway, connects to Supabase, and proxies real-time Server-Sent Events (SSE).
3. **Frontend (`/frontend`)**: A React/Vite dashboard providing a premium UI for Human-in-the-loop (HITL) gate approvals, real-time logging, and artifact viewing.

## Getting Started

### 1. Prerequisites
- Node.js (v18+)
- Python (3.10+)
- Supabase account and project

### 2. Environment Setup
You must configure the environment variables for each service.
- **Backend**: Copy `backend/.env.example` to `backend/.env` and fill in your `SUPABASE_URL` and `SUPABASE_SECRET_KEY`.
- **Frontend**: Copy `frontend/.env.example` to `frontend/.env`.
- **Agents**: Copy `agents/.env.example` to `agents/.env` and provide your `OPENAI_API_KEY` (and `OPENAI_API_BASE` if using a custom gateway like Litellm).

### 3. Running the Services

You need three terminal windows to run the system:

**Terminal 1 (Backend):**
```bash
cd backend
npm install
npm run dev
```

**Terminal 2 (AI Agents):**
```bash
cd agents
pip install -r requirements.txt
python main.py
```

**Terminal 3 (Frontend):**
```bash
cd frontend
npm install
npm run dev
```

Visit `http://localhost:5173` in your browser. Use the mock admin credentials (`admin@vfs.com` / `admin123`) if configured, or your Supabase auth credentials.

## License
MIT License
