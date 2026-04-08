import { query } from '@/lib/db';
import { NextResponse } from 'next/server';

// GET /api/marketplace/trades - Get trade proposals for current player
export async function GET(req) {
  const privyId = req.headers.get('x-privy-id');
  if (!privyId) return NextResponse.json({ error: 'No auth' }, { status: 401 });

  try {
    const playerRes = await query('SELECT id FROM players WHERE privy_id = $1', [privyId]);
    if (playerRes.rows.length === 0) return NextResponse.json({ error: 'Player not found' }, { status: 404 });
    const playerId = playerRes.rows[0].id;

    // Get trades where I'm the proposer or receiver
    const tradesRes = await query(`
      SELECT tp.*,
             pp.username as proposer_username,
             rp.username as receiver_username,
             pc.name as proposer_creature_name, pc.rarity as proposer_creature_rarity,
             pc.types as proposer_creature_types, pc.hp as proposer_creature_hp,
             pc.atk as proposer_creature_atk, pc.def as proposer_creature_def,
             pc.spd as proposer_creature_spd, pc.ability as proposer_creature_ability,
             pc.attacks as proposer_creature_attacks,
             rc.name as receiver_creature_name, rc.rarity as receiver_creature_rarity,
             rc.types as receiver_creature_types, rc.hp as receiver_creature_hp,
             rc.atk as receiver_creature_atk, rc.def as receiver_creature_def,
             rc.spd as receiver_creature_spd, rc.ability as receiver_creature_ability,
             rc.attacks as receiver_creature_attacks
      FROM trade_proposals tp
      JOIN players pp ON pp.id = tp.proposer_id
      JOIN players rp ON rp.id = tp.receiver_id
      JOIN creatures pc ON pc.id = tp.proposer_creature_id
      JOIN creatures rc ON rc.id = tp.receiver_creature_id
      WHERE (tp.proposer_id = $1 OR tp.receiver_id = $1)
      ORDER BY tp.created_at DESC
      LIMIT 50
    `, [playerId]);

    return NextResponse.json({ trades: tradesRes.rows, playerId });
  } catch (err) {
    console.error('[TRADES] Error:', err);
    return NextResponse.json({ error: 'Error fetching trades' }, { status: 500 });
  }
}

// POST /api/marketplace/trades - Create a trade proposal
export async function POST(req) {
  const privyId = req.headers.get('x-privy-id');
  if (!privyId) return NextResponse.json({ error: 'No auth' }, { status: 401 });

  const { myCreatureId, targetCreatureId, message } = await req.json();
  if (!myCreatureId || !targetCreatureId) {
    return NextResponse.json({ error: 'Missing creature IDs' }, { status: 400 });
  }

  try {
    const playerRes = await query('SELECT id FROM players WHERE privy_id = $1', [privyId]);
    if (playerRes.rows.length === 0) return NextResponse.json({ error: 'Player not found' }, { status: 404 });
    const proposerId = playerRes.rows[0].id;

    // Verify I own my creature and it's not listed
    const myCreatureRes = await query(
      'SELECT id, listed FROM creatures WHERE id = $1 AND owner_id = $2', [myCreatureId, proposerId]
    );
    if (myCreatureRes.rows.length === 0) {
      return NextResponse.json({ error: 'Your creature not found' }, { status: 403 });
    }
    if (myCreatureRes.rows[0].listed) {
      return NextResponse.json({ error: 'Your creature is listed on marketplace' }, { status: 400 });
    }

    // Get target creature and its owner
    const targetRes = await query(
      'SELECT id, owner_id, listed FROM creatures WHERE id = $1', [targetCreatureId]
    );
    if (targetRes.rows.length === 0) {
      return NextResponse.json({ error: 'Target creature not found' }, { status: 404 });
    }
    if (targetRes.rows[0].listed) {
      return NextResponse.json({ error: 'Target creature is listed on marketplace' }, { status: 400 });
    }
    if (targetRes.rows[0].owner_id === proposerId) {
      return NextResponse.json({ error: 'Cannot trade with yourself' }, { status: 400 });
    }

    const receiverId = targetRes.rows[0].owner_id;

    // Check no duplicate pending trade
    const existingRes = await query(
      `SELECT id FROM trade_proposals
       WHERE proposer_id = $1 AND receiver_creature_id = $2 AND status = 'pending'`,
      [proposerId, targetCreatureId]
    );
    if (existingRes.rows.length > 0) {
      return NextResponse.json({ error: 'You already have a pending trade for this creature' }, { status: 400 });
    }

    const tradeRes = await query(`
      INSERT INTO trade_proposals (proposer_id, receiver_id, proposer_creature_id, receiver_creature_id, message)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `, [proposerId, receiverId, myCreatureId, targetCreatureId, message || null]);

    return NextResponse.json({ trade: tradeRes.rows[0] });
  } catch (err) {
    console.error('[TRADES] Create error:', err);
    return NextResponse.json({ error: 'Error creating trade' }, { status: 500 });
  }
}

// PUT /api/marketplace/trades - Accept or reject a trade
export async function PUT(req) {
  const privyId = req.headers.get('x-privy-id');
  if (!privyId) return NextResponse.json({ error: 'No auth' }, { status: 401 });

  const { tradeId, action } = await req.json(); // action: 'accept' | 'reject'
  if (!tradeId || !['accept', 'reject'].includes(action)) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  try {
    const playerRes = await query('SELECT id FROM players WHERE privy_id = $1', [privyId]);
    if (playerRes.rows.length === 0) return NextResponse.json({ error: 'Player not found' }, { status: 404 });
    const playerId = playerRes.rows[0].id;

    const tradeRes = await query(
      "SELECT * FROM trade_proposals WHERE id = $1 AND status = 'pending'", [tradeId]
    );
    if (tradeRes.rows.length === 0) {
      return NextResponse.json({ error: 'Trade not found or already resolved' }, { status: 404 });
    }
    const trade = tradeRes.rows[0];

    // Only receiver can accept/reject. Proposer can cancel (reject).
    if (action === 'accept' && trade.receiver_id !== playerId) {
      return NextResponse.json({ error: 'Only the receiver can accept' }, { status: 403 });
    }
    if (action === 'reject' && trade.receiver_id !== playerId && trade.proposer_id !== playerId) {
      return NextResponse.json({ error: 'Not your trade' }, { status: 403 });
    }

    if (action === 'reject') {
      await query(
        "UPDATE trade_proposals SET status = $1, resolved_at = NOW() WHERE id = $2",
        [trade.proposer_id === playerId ? 'cancelled' : 'rejected', tradeId]
      );
      return NextResponse.json({ success: true, status: 'rejected' });
    }

    // ACCEPT: verify both creatures still exist and owned by correct players
    const pCreature = await query(
      'SELECT id, owner_id, listed FROM creatures WHERE id = $1', [trade.proposer_creature_id]
    );
    const rCreature = await query(
      'SELECT id, owner_id, listed FROM creatures WHERE id = $1', [trade.receiver_creature_id]
    );

    if (pCreature.rows.length === 0 || rCreature.rows.length === 0) {
      await query("UPDATE trade_proposals SET status = 'cancelled', resolved_at = NOW() WHERE id = $1", [tradeId]);
      return NextResponse.json({ error: 'One of the creatures no longer exists' }, { status: 400 });
    }
    if (pCreature.rows[0].owner_id !== trade.proposer_id || rCreature.rows[0].owner_id !== trade.receiver_id) {
      await query("UPDATE trade_proposals SET status = 'cancelled', resolved_at = NOW() WHERE id = $1", [tradeId]);
      return NextResponse.json({ error: 'Creature ownership has changed' }, { status: 400 });
    }
    if (pCreature.rows[0].listed || rCreature.rows[0].listed) {
      return NextResponse.json({ error: 'One of the creatures is listed on marketplace' }, { status: 400 });
    }

    // Swap ownership
    await query('UPDATE creatures SET owner_id = $1 WHERE id = $2', [trade.receiver_id, trade.proposer_creature_id]);
    await query('UPDATE creatures SET owner_id = $1 WHERE id = $2', [trade.proposer_id, trade.receiver_creature_id]);

    // Update trade status
    await query("UPDATE trade_proposals SET status = 'accepted', resolved_at = NOW() WHERE id = $1", [tradeId]);

    // Record transactions
    await query(`
      INSERT INTO marketplace_transactions (trade_id, tx_type, from_player_id, to_player_id, creature_id)
      VALUES ($1, 'trade', $2, $3, $4), ($1, 'trade', $3, $2, $5)
    `, [tradeId, trade.proposer_id, trade.receiver_id, trade.proposer_creature_id, trade.receiver_creature_id]);

    return NextResponse.json({ success: true, status: 'accepted' });
  } catch (err) {
    console.error('[TRADES] Resolve error:', err);
    return NextResponse.json({ error: 'Error resolving trade' }, { status: 500 });
  }
}
