import { query } from '@/lib/db';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const result = await query(
      'SELECT id, username, elo, wins, losses FROM players ORDER BY elo DESC LIMIT 100'
    );
    return NextResponse.json({ players: result.rows });
  } catch (err) {
    return NextResponse.json({ players: [] });
  }
}
