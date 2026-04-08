import { query } from '@/lib/db';
import { NextResponse } from 'next/server';

// DEV ONLY - Add gems to a player
export async function POST(request) {
  try {
    const { privyId, amount = 10000 } = await request.json();

    const result = await query(
      'UPDATE players SET gems = gems + $1 WHERE privy_id = $2 RETURNING gems',
      [amount, privyId]
    );

    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'Player not found' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      gems: result.rows[0].gems,
      added: amount
    });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
