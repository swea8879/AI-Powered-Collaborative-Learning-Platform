const Database = require('better-sqlite3');
const db = new Database('database.sqlite');
const users = db.prepare('SELECT id, username, role FROM users').all();
console.log(JSON.stringify(users, null, 2));
