import pg from 'pg';
import type { QueryResultRow } from 'pg';
export const pool = new pg.Pool({connectionString:process.env.DATABASE_URL});
export async function q<T extends QueryResultRow = QueryResultRow>(text:string, values:unknown[]=[]){return pool.query<T>(text,values)}
