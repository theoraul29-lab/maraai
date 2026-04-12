/**
 * Minimal in-memory stub DB for development/test.
 * Replace with real DB wrapper (better-sqlite3 / knex / typeorm) in production.
 */
type Stmt = { run: (...args:any[]) => any; all: (...args:any[]) => any[] };
const stub = {
	prepare: (q:string): Stmt => ({
		run: (..._args:any[]) => ({}),
		all: (..._args:any[]) => []
	})
};
export const db: any = stub;
export default db;
