const Database = require('better-sqlite3');
const db = new Database('database.sqlite');
const rows = db.prepare('SELECT * FROM note_files').all();
console.log(JSON.stringify(rows, null, 2));
