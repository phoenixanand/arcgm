import pg from 'pg';
import 'dotenv/config';
export const pool = new pg.Pool({connectionString:process.env.DATABASE_URL});
export async function q<T=any>(text:string, values:any[]=[]){return pool.query<T>(text,values)}
