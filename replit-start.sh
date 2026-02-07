#!/bin/bash
# =============================================================================
# Nexus Global Payments Sandbox - Replit Startup Script
# =============================================================================
# This script starts all services natively on Replit (no Docker needed):
#   1. PostgreSQL (via Nix)
#   2. Redis (via Nix)
#   3. Nexus Gateway (Python/FastAPI backend)
#   4. Demo Dashboard (React/Vite frontend)
# =============================================================================

set -e

PGDATA="$HOME/.pg_data"
PGPORT=5432
DB_NAME="nexus_sandbox"
DB_USER="nexus"
DB_PASSWORD="nexus_password"

echo "🌐 Nexus Global Payments Sandbox - Starting on Replit..."
echo "========================================================="

# ── Step 1: Initialize and start PostgreSQL ──────────────────────────────────
if [ ! -d "$PGDATA" ]; then
  echo "📦 Initializing PostgreSQL data directory..."
  initdb -D "$PGDATA" --no-locale --encoding=UTF8
  # Configure PostgreSQL for local connections
  echo "host all all 0.0.0.0/0 md5" >> "$PGDATA/pg_hba.conf"
  echo "local all all trust" >> "$PGDATA/pg_hba.conf"
fi

# Start PostgreSQL if not running
if ! pg_isready -h localhost -p $PGPORT > /dev/null 2>&1; then
  echo "🐘 Starting PostgreSQL..."
  pg_ctl -D "$PGDATA" -l "$HOME/.pg_log" -o "-p $PGPORT" start
  sleep 2
fi

# Create database and user if they don't exist
psql -h localhost -p $PGPORT -U $(whoami) -tc "SELECT 1 FROM pg_roles WHERE rolname='$DB_USER'" postgres | grep -q 1 || \
  psql -h localhost -p $PGPORT -U $(whoami) -c "CREATE USER $DB_USER WITH PASSWORD '$DB_PASSWORD';" postgres
psql -h localhost -p $PGPORT -U $(whoami) -tc "SELECT 1 FROM pg_database WHERE datname='$DB_NAME'" postgres | grep -q 1 || \
  psql -h localhost -p $PGPORT -U $(whoami) -c "CREATE DATABASE $DB_NAME OWNER $DB_USER;" postgres
psql -h localhost -p $PGPORT -U $(whoami) -c "GRANT ALL PRIVILEGES ON DATABASE $DB_NAME TO $DB_USER;" postgres
echo "✅ PostgreSQL ready"

# ── Step 2: Run migrations ───────────────────────────────────────────────────
echo "🗄️  Running database migrations..."
for f in $(ls migrations/*.sql 2>/dev/null | sort); do
  echo "   → $f"
  PGPASSWORD=$DB_PASSWORD psql -h localhost -p $PGPORT -U $DB_USER -d $DB_NAME -f "$f" 2>/dev/null || true
done
echo "✅ Migrations complete"

# ── Step 3: Start Redis ──────────────────────────────────────────────────────
if ! redis-cli ping > /dev/null 2>&1; then
  echo "🔴 Starting Redis..."
  redis-server --daemonize yes --port 6379 --loglevel warning
fi
echo "✅ Redis ready"

# ── Step 4: Install Python dependencies ──────────────────────────────────────
echo "🐍 Installing Python dependencies..."
cd services/nexus-gateway
pip install -q -e "." 2>/dev/null
cd ../..
echo "✅ Python dependencies ready"

# ── Step 5: Install Node.js dependencies ─────────────────────────────────────
echo "⚙️  Installing Node.js dependencies..."
cd services/demo-dashboard
npm install --silent 2>/dev/null
cd ../..
echo "✅ Node.js dependencies ready"

# ── Step 6: Start services in parallel ───────────────────────────────────────
echo ""
echo "🚀 Starting services..."
echo "   Backend:  http://localhost:8000  (FastAPI)"
echo "   Frontend: http://localhost:3000  (Vite)"
echo "   API Docs: http://localhost:8000/docs"
echo "========================================================="
echo ""

# Export environment variables for the backend
export DATABASE_URL="postgresql://$DB_USER:$DB_PASSWORD@localhost:$PGPORT/$DB_NAME"
export REDIS_URL="redis://localhost:6379"
export JWT_SECRET="replit-dev-secret-not-for-production"
export QUOTE_VALIDITY_SECONDS=600
export PAYMENT_TIMEOUT_SECONDS=60
export PYTHONPATH="$(pwd)/services/nexus-gateway"

# Start backend in background
cd services/nexus-gateway
python -m uvicorn src.main:app --host 0.0.0.0 --port 8000 &
BACKEND_PID=$!
cd ../..

# Start frontend (foreground — Replit shows this output)
cd services/demo-dashboard
npx vite --host 0.0.0.0 --port 3000

# Cleanup on exit
kill $BACKEND_PID 2>/dev/null
