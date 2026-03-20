import { createClient } from "@libsql/client";

const databaseUrl = process.env.TURSO_DATABASE_URL;
const authToken = process.env.TURSO_AUTH_TOKEN;

if (!databaseUrl) {
  throw new Error("Missing TURSO_DATABASE_URL environment variable.");
}

export const turso = createClient({
  url: databaseUrl,
  authToken,
});

const schemaStatements: string[] = [
  `CREATE TABLE IF NOT EXISTS accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    expires_at INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_used_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS events (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    is_public INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'setup'
      CHECK (status IN ('setup', 'registration', 'qualifying', 'tournament', 'paused', 'completed', 'archived')),
    location TEXT,
    starts_at TEXT,
    completed_at TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS divisions (
    id TEXT PRIMARY KEY,
    event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    min_age INTEGER,
    max_age INTEGER,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(event_id, name)
  )`,
  `CREATE TABLE IF NOT EXISTS racers (
    id TEXT PRIMARY KEY,
    first_name TEXT NOT NULL,
    last_name TEXT,
    display_name TEXT NOT NULL,
    age INTEGER,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS cars (
    id TEXT PRIMARY KEY,
    event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    division_id TEXT NOT NULL REFERENCES divisions(id) ON DELETE RESTRICT,
    racer_id TEXT NOT NULL REFERENCES racers(id) ON DELETE RESTRICT,
    car_number INTEGER NOT NULL,
    car_name TEXT NOT NULL,
    registration_status TEXT NOT NULL DEFAULT 'registered'
      CHECK (registration_status IN (
        'registered',
        'checked_in',
        'approved',
        'changes_requested',
        'scratched'
      )),
    checked_in_at TEXT,
    scratched_at TEXT,
    scratch_reason TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(event_id, car_number)
  )`,
  `CREATE TABLE IF NOT EXISTS inspections (
    id TEXT PRIMARY KEY,
    car_id TEXT NOT NULL UNIQUE REFERENCES cars(id) ON DELETE CASCADE,
    overall_status TEXT NOT NULL DEFAULT 'pending'
      CHECK (overall_status IN ('pending', 'approved', 'changes_requested', 'scratched')),
    weight_oz REAL,
    length_in REAL,
    width_in REAL,
    height_in REAL,
    ground_clearance_in REAL,
    body_material_status TEXT CHECK (body_material_status IN ('pass', 'fail', 'n/a')),
    wheels_status TEXT CHECK (wheels_status IN ('pass', 'fail', 'n/a')),
    axles_status TEXT CHECK (axles_status IN ('pass', 'fail', 'n/a')),
    lubricants_status TEXT CHECK (lubricants_status IN ('pass', 'fail', 'n/a')),
    inspector_name TEXT,
    inspector_notes TEXT,
    inspected_at TEXT,
    approved_at TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS phases (
    id TEXT PRIMARY KEY,
    event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    division_id TEXT REFERENCES divisions(id) ON DELETE CASCADE,
    phase_type TEXT NOT NULL
      CHECK (phase_type IN ('practice', 'qualifying', 'tournament', 'tie_breaker')),
    name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending'
      CHECK (status IN ('pending', 'active', 'paused', 'completed', 'cancelled')),
    tournament_format TEXT
      CHECK (tournament_format IN ('single_elimination', 'round_robin', 'custom')),
    seeding_method TEXT
      CHECK (seeding_method IN ('average_time', 'best_time', 'manual')),
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS races (
    id TEXT PRIMARY KEY,
    phase_id TEXT NOT NULL REFERENCES phases(id) ON DELETE CASCADE,
    race_number INTEGER NOT NULL,
    round_number INTEGER,
    group_number INTEGER,
    heat_set_key TEXT,
    source_race_id TEXT REFERENCES races(id) ON DELETE SET NULL,
    race_status TEXT NOT NULL DEFAULT 'pending'
      CHECK (race_status IN ('pending', 'staging', 'locked', 'running', 'finished', 'void')),
    locked_at TEXT,
    lock_token TEXT,
    official_attempt_id TEXT,
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(phase_id, race_number)
  )`,
  `CREATE TABLE IF NOT EXISTS race_lanes (
    id TEXT PRIMARY KEY,
    race_id TEXT NOT NULL REFERENCES races(id) ON DELETE CASCADE,
    lane_number INTEGER NOT NULL,
    car_id TEXT REFERENCES cars(id) ON DELETE RESTRICT,
    seed_number INTEGER,
    staging_position INTEGER,
    UNIQUE(race_id, lane_number),
    UNIQUE(race_id, car_id)
  )`,
  `CREATE TABLE IF NOT EXISTS race_attempts (
    id TEXT PRIMARY KEY,
    race_id TEXT NOT NULL REFERENCES races(id) ON DELETE CASCADE,
    attempt_number INTEGER NOT NULL,
    attempt_status TEXT NOT NULL DEFAULT 'captured'
      CHECK (attempt_status IN ('captured', 'official', 'superseded', 'discarded')),
    source TEXT NOT NULL
      CHECK (source IN ('timer', 'manual', 'import', 'restored')),
    timer_session_id TEXT REFERENCES timer_sessions(id) ON DELETE SET NULL,
    supersedes_attempt_id TEXT REFERENCES race_attempts(id) ON DELETE SET NULL,
    rerun_reason TEXT,
    operator_name TEXT,
    captured_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(race_id, attempt_number)
  )`,
  `CREATE TABLE IF NOT EXISTS race_attempt_lane_results (
    id TEXT PRIMARY KEY,
    attempt_id TEXT NOT NULL REFERENCES race_attempts(id) ON DELETE CASCADE,
    lane_number INTEGER NOT NULL,
    car_id TEXT REFERENCES cars(id) ON DELETE RESTRICT,
    result_code TEXT NOT NULL
      CHECK (result_code IN ('finished', 'dnf', 'dq', 'empty')),
    time_ms INTEGER,
    place_in_attempt INTEGER,
    raw_time_text TEXT,
    UNIQUE(attempt_id, lane_number)
  )`,
  `CREATE TABLE IF NOT EXISTS seeds (
    id TEXT PRIMARY KEY,
    phase_id TEXT NOT NULL REFERENCES phases(id) ON DELETE CASCADE,
    car_id TEXT NOT NULL REFERENCES cars(id) ON DELETE RESTRICT,
    seed_number INTEGER NOT NULL,
    source TEXT NOT NULL
      CHECK (source IN ('qualifying_average', 'manual_override', 'replacement')),
    qualifying_avg_time_ms INTEGER,
    qualifying_best_time_ms INTEGER,
    qualifying_runs_count INTEGER NOT NULL DEFAULT 0,
    is_tie_break_seed INTEGER NOT NULL DEFAULT 0,
    replaced_car_id TEXT REFERENCES cars(id) ON DELETE SET NULL,
    notes TEXT,
    UNIQUE(phase_id, seed_number),
    UNIQUE(phase_id, car_id)
  )`,
  `CREATE TABLE IF NOT EXISTS timer_sessions (
    id TEXT PRIMARY KEY,
    event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    device_name TEXT,
    port_path TEXT,
    baud_rate INTEGER,
    mode TEXT NOT NULL DEFAULT 'live'
      CHECK (mode IN ('live', 'practice')),
    connection_status TEXT NOT NULL DEFAULT 'connected'
      CHECK (connection_status IN ('connected', 'disconnected', 'error')),
    connected_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    disconnected_at TEXT,
    last_heartbeat_at TEXT,
    error_message TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS timer_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timer_session_id TEXT NOT NULL REFERENCES timer_sessions(id) ON DELETE CASCADE,
    race_id TEXT REFERENCES races(id) ON DELETE SET NULL,
    attempt_id TEXT REFERENCES race_attempts(id) ON DELETE SET NULL,
    direction TEXT NOT NULL CHECK (direction IN ('in', 'out')),
    payload_text TEXT,
    payload_hex TEXT,
    parsed_message_type TEXT,
    received_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    action TEXT NOT NULL,
    actor_name TEXT,
    reason TEXT,
    before_json TEXT,
    after_json TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE INDEX IF NOT EXISTS idx_cars_event_division_status
    ON cars(event_id, division_id, registration_status)`,
  `CREATE INDEX IF NOT EXISTS idx_races_phase_status_number
    ON races(phase_id, race_status, race_number)`,
  `CREATE INDEX IF NOT EXISTS idx_race_lanes_car
    ON race_lanes(car_id)`,
  `CREATE INDEX IF NOT EXISTS idx_attempts_race_captured
    ON race_attempts(race_id, captured_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_attempt_lane_car
    ON race_attempt_lane_results(car_id)`,
  `CREATE INDEX IF NOT EXISTS idx_seeds_phase_seed
    ON seeds(phase_id, seed_number)`,
  `CREATE INDEX IF NOT EXISTS idx_timer_logs_session_time
    ON timer_logs(timer_session_id, received_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_audit_logs_event_time
    ON audit_logs(event_id, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_sessions_account_expires
    ON sessions(account_id, expires_at DESC)`,
];

let initialized = false;
let initializationPromise: Promise<void> | null = null;

async function ensureEventColumns() {
  const tableInfo = await turso.execute("PRAGMA table_info(events)");
  const columns = new Set(tableInfo.rows.map((row) => String(row.name ?? "")));

  if (!columns.has("is_public")) {
    await turso.execute("ALTER TABLE events ADD COLUMN is_public INTEGER NOT NULL DEFAULT 0");
  }
  if (!columns.has("lane_count")) {
    await turso.execute("ALTER TABLE events ADD COLUMN lane_count INTEGER NOT NULL DEFAULT 2");
  }
}

async function ensurePhaseColumns() {
  const tableInfo = await turso.execute("PRAGMA table_info(phases)");
  const columns = new Set(tableInfo.rows.map((row) => String(row.name ?? "")));

  if (!columns.has("bracket_json")) {
    await turso.execute("ALTER TABLE phases ADD COLUMN bracket_json TEXT");
  }
}

export async function ensureDatabaseSchema() {
  if (initialized) {
    return;
  }

  if (!initializationPromise) {
    initializationPromise = (async () => {
      await turso.execute("PRAGMA foreign_keys = ON");

      for (const sql of schemaStatements) {
        await turso.execute(sql);
      }

      await ensureEventColumns();
      await ensurePhaseColumns();
      await turso.execute(
        "CREATE INDEX IF NOT EXISTS idx_events_public_created ON events(is_public, created_at DESC)"
      );

      initialized = true;
    })().finally(() => {
      initializationPromise = null;
    });
  }

  await initializationPromise;
}

export async function ensureAccountsTable() {
  await ensureDatabaseSchema();
}
