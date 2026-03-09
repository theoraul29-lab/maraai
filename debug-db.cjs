// debug-db.cjs
const Database = require("better-sqlite3");
const db = new Database("C:/Users/admin/Documents/maraai.sqlite");
console.log(
  "Tables:",
  db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all(),
);
