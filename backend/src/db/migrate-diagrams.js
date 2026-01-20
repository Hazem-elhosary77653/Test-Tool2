const Database = require('better-sqlite3');
const path = require('path');
require('dotenv').config();

const dbPath = process.env.DB_PATH || path.join(__dirname, '../../database.db');
const db = new Database(dbPath);

console.log(`Running diagram migrations on ${dbPath}...`);

// 1. Update/Create diagrams table
db.exec(`
  CREATE TABLE IF NOT EXISTS diagrams (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    group_id INTEGER,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    diagram_type VARCHAR(50), -- flowchart, sequence, class, etc.
    mermaid_code TEXT,
    is_public INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (group_id) REFERENCES story_groups(id) ON DELETE SET NULL
  )
`);

// 2. Create brd_diagrams linking table
db.exec(`
  CREATE TABLE IF NOT EXISTS brd_diagrams (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    brd_id TEXT NOT NULL,
    diagram_id TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (brd_id) REFERENCES brd_documents(id) ON DELETE CASCADE,
    FOREIGN KEY (diagram_id) REFERENCES diagrams(id) ON DELETE CASCADE,
    UNIQUE(brd_id, diagram_id)
  )
`);

console.log('✅ Diagram migrations completed successfully.');
process.exit(0);
