const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// Ensure database directory exists
const dbPath = path.resolve(__dirname, 'database.sqlite');
const db = new Database(dbPath, { verbose: console.log });

// Create Tables
const initDb = () => {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'student', -- student, faculty, admin
      gender TEXT -- male, female
    );

    -- Check if gender column exists, if not add it (for existing databases)
    PRAGMA table_info(users);
  `);
  
  // Better way to add column if it doesn't exist
  try {
    db.exec(`ALTER TABLE users ADD COLUMN gender TEXT;`);
  } catch (e) {
    // Column already exists or other error
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      title TEXT NOT NULL,
      content TEXT,
      isArchived BOOLEAN DEFAULT 0,
      isPublished BOOLEAN DEFAULT 0,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS tags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL
    );

    CREATE TABLE IF NOT EXISTS note_tags (
      note_id INTEGER,
      tag_id INTEGER,
      PRIMARY KEY (note_id, tag_id),
      FOREIGN KEY (note_id) REFERENCES notes (id) ON DELETE CASCADE,
      FOREIGN KEY (tag_id) REFERENCES tags (id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS note_files (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      note_id INTEGER,
      filename TEXT NOT NULL,
      originalName TEXT NOT NULL,
      mimeType TEXT,
      FOREIGN KEY (note_id) REFERENCES notes (id) ON DELETE CASCADE
    );
  `);
  console.log('Database and tables initialized.');
};

initDb();

module.exports = db;
