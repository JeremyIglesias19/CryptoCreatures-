import { query } from '@/lib/db';
import { NextResponse } from 'next/server';
import { getAuthenticatedPrivyId } from '@/lib/privyAuth';

// GET /api/marketplace/listings - Browse marketplace
export async function GET(req) {
  const url = new URL(req.url);
  const type = url.searchParams.get('type') || 'all'; // all, fixed, auction
  const rarity = url.searchParams.get('rarity') || 'all';
  const sort = url.searchParams.get('sort') || 'newest'; // newest, price_asc, price_desc, ending_soon
  const myListings = url.searchParams.get('mine') === 'true';
  const privyId = await getAuthenticatedPrivyId(req);

  let conditions = ["ml.status = 'active'"];
  let params = [];
  let paramIdx = 1;

  if (myListings && privyId) {
    const playerRes = await query('SELECT id FROM players WHERE privy_id = $1', [privyId]);
    if (playerRes.rows.length > 0) {
      conditions.push(`ml.seller_id = $${paramIdx++}`);
      params.push(playerRes.rows[0].id);
    }
  }

  if (type !== 'all') {
    conditions.push(`ml.listing_type = $${paramIdx++}`);
    params.push(type);
  }

  if (rarity !== 'all') {
    conditions.push(`c.rarity = $${paramIdx++}`);
    params.push(rarity);
  }

  let orderBy = 'ml.created_at DESC';
  if (sort === 'price_asc') orderBy = 'COALESCE(ml.price_sol, ml.current_bid_sol) ASC';
  if (sort === 'price_desc') orderBy = 'COALESCE(ml.price_sol, ml.current_bid_sol) DESC';
  if (sort === 'ending_soon') orderBy = 'ml.expires_at ASC NULLS LAST';

  const sql = `
    SELECT ml.*,
           c.name, c.rarity, c.types, c.hp, c.atk, c.def, c.spd, c.ability, c.attacks,
           p.username as seller_username, p.wallet_address as seller_wallet,
           bp.username as bidder_username
    FROM marketplace_listings ml
    JOIN creatures c ON c.id = ml.creature_id
    JOIN players p ON p.id = ml.seller_id
    LEFT JOIN players bp ON bp.id = ml.current_bidder_id
    WHERE ${conditions.join(' AND ')}
    ORDER BY ${orderBy}
    LIMIT 50
  `;

  try {
    const result = await query(sql, params);

    // Check expired auctions
    const now = new Date();
    for (const listing of result.rows) {
      if (listing.listing_type === 'auction' && listing.expires_at && new Date(listing.expires_at) < now) {
        listing.status = 'expired';
      }
    }

    return NextResponse.json({ listings: result.rows });
  } catch (err) {
    console.error('[MARKETPLACE] Error:', err);
    return NextResponse.json({ error: 'Error fetching listings' }, { status: 500 });
  }
}

// POST /api/marketplace/listings - Create a new listing
export async function POST(req) {
  const privyId = await getAuthenticatedPrivyId(req);
  if (!privyId) return NextResponse.json({ error: 'No auth' }, { status: 401 });

  const body = await req.json();
  const { creatureId, listingType, priceSol, minBidSol, durationHours } = body;

  if (!creatureId || !listingType) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
  }
  if (!['fixed', 'auction'].includes(listingType)) {
    return NextResponse.json({ error: 'Invalid listing type' }, { status: 400 });
  }
  if (listingType === 'fixed' && (!priceSol || priceSol <= 0)) {
    return NextResponse.json({ error: 'Price must be > 0' }, { status: 400 });
  }
  if (listingType === 'auction' && (!minBidSol || minBidSol <= 0)) {
    return NextResponse.json({ error: 'Min bid must be > 0' }, { status: 400 });
  }

  try {
    const playerRes = await query('SELECT id FROM players WHERE privy_id = $1', [privyId]);
    if (playerRes.rows.length === 0) return NextResponse.json({ error: 'Player not found' }, { status: 404 });
    const playerId = playerRes.rows[0].id;

    // Verify creature ownership and not already listed
    const creatureRes = await query(
      'SELECT id, listed FROM creatures WHERE id = $1 AND owner_id = $2', [creatureId, playerId]
    );
    if (creatureRes.rows.length === 0) {
      return NextResponse.json({ error: 'Creature not found or not yours' }, { status: 403 });
    }
    if (creatureRes.rows[0].listed) {
      return NextResponse.json({ error: 'Creature already listed' }, { status: 400 });
    }

    const expiresAt = listingType === 'auction' && durationHours
      ? new Date(Date.now() + (durationHours || 24) * 3600000)
      : null;

    // Create listing and mark creature as listed
    const listingRes = await query(`
      INSERT INTO marketplace_listings (seller_id, creature_id, listing_type, price_sol, min_bid_sol, expires_at)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `, [playerId, creatureId, listingType,
        listingType === 'fixed' ? priceSol : null,
        listingType === 'auction' ? minBidSol : null,
        expiresAt]);

    await query('UPDATE creatures SET listed = true WHERE id = $1', [creatureId]);

    return NextResponse.json({ listing: listingRes.rows[0] });
  } catch (err) {
    console.error('[MARKETPLACE] Create error:', err);
    return NextResponse.json({ error: 'Error creating listing' }, { status: 500 });
  }
}

// DELETE /api/marketplace/listings - Cancel a listing
export async function DELETE(req) {
  const privyId = await getAuthenticatedPrivyId(req);
  if (!privyId) return NextResponse.json({ error: 'No auth' }, { status: 401 });

  const body = await req.json();
  const { listingId } = body;

  try {
    const playerRes = await query('SELECT id FROM players WHERE privy_id = $1', [privyId]);
    if (playerRes.rows.length === 0) return NextResponse.json({ error: 'Player not found' }, { status: 404 });
    const playerId = playerRes.rows[0].id;

    const listingRes = await query(
      "SELECT * FROM marketplace_listings WHERE id = $1 AND seller_id = $2 AND status = 'active'",
      [listingId, playerId]
    );
    if (listingRes.rows.length === 0) {
      return NextResponse.json({ error: 'Listing not found or not yours' }, { status: 404 });
    }

    const listing = listingRes.rows[0];

    // If auction has bids, can't cancel (need to refund first)
    if (listing.listing_type === 'auction' && listing.current_bidder_id) {
      return NextResponse.json({ error: 'Cannot cancel auction with active bids' }, { status: 400 });
    }

    await query("UPDATE marketplace_listings SET status = 'cancelled' WHERE id = $1", [listingId]);
    await query('UPDATE creatures SET listed = false WHERE id = $1', [listing.creature_id]);

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[MARKETPLACE] Cancel error:', err);
    return NextResponse.json({ error: 'Error cancelling listing' }, { status: 500 });
  }
}
