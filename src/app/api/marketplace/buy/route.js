import { query } from '@/lib/db';
import { NextResponse } from 'next/server';
import { verifyTransaction, sendSOLFromEscrow, calculateFees } from '@/lib/solana';

// POST /api/marketplace/buy - Buy a fixed-price listing
export async function POST(req) {
  const privyId = req.headers.get('x-privy-id');
  if (!privyId) return NextResponse.json({ error: 'No auth' }, { status: 401 });

  const { listingId, txSignature, walletAddress } = await req.json();
  if (!listingId || !txSignature) {
    return NextResponse.json({ error: 'Missing listingId or txSignature' }, { status: 400 });
  }

  try {
    // Get buyer
    const playerRes = await query('SELECT * FROM players WHERE privy_id = $1', [privyId]);
    if (playerRes.rows.length === 0) return NextResponse.json({ error: 'Player not found' }, { status: 404 });
    const buyer = playerRes.rows[0];

    // Update wallet address in DB if provided and different
    const senderAddress = walletAddress || buyer.wallet_address;
    if (walletAddress && walletAddress !== buyer.wallet_address) {
      await query('UPDATE players SET wallet_address = $1 WHERE id = $2', [walletAddress, buyer.id]);
    }

    // Get listing
    const listingRes = await query(
      "SELECT * FROM marketplace_listings WHERE id = $1 AND status = 'active' AND listing_type = 'fixed'",
      [listingId]
    );
    if (listingRes.rows.length === 0) {
      return NextResponse.json({ error: 'Listing not found or already sold' }, { status: 404 });
    }
    const listing = listingRes.rows[0];

    // Can't buy your own
    if (listing.seller_id === buyer.id) {
      return NextResponse.json({ error: 'Cannot buy your own listing' }, { status: 400 });
    }

    // Verify the Solana transaction using the actual wallet that sent the tx
    const verification = await verifyTransaction(txSignature, senderAddress, parseFloat(listing.price_sol));
    if (!verification.valid) {
      return NextResponse.json({ error: `Transaction verification failed: ${verification.error}` }, { status: 400 });
    }

    // Calculate fees and pay seller
    const { fee, sellerPayout } = calculateFees(parseFloat(listing.price_sol));
    const sellerRes = await query('SELECT wallet_address FROM players WHERE id = $1', [listing.seller_id]);
    const sellerWallet = sellerRes.rows[0]?.wallet_address;

    let sellerTx = null;
    if (sellerWallet && sellerPayout > 0) {
      try {
        sellerTx = await sendSOLFromEscrow(sellerWallet, sellerPayout);
      } catch (payErr) {
        console.error('[MARKETPLACE] Seller payout error:', payErr);
        // Log the issue but still complete the sale - manual payout can be done later
      }
    }

    // Transfer creature ownership
    await query('UPDATE creatures SET owner_id = $1, listed = false WHERE id = $2', [buyer.id, listing.creature_id]);

    // Update listing
    await query(`
      UPDATE marketplace_listings
      SET status = 'sold', buyer_id = $1, tx_signature = $2, seller_tx = $3, platform_fee = $4, sold_at = NOW()
      WHERE id = $5
    `, [buyer.id, txSignature, sellerTx, fee, listing.id]);

    // Record transaction
    await query(`
      INSERT INTO marketplace_transactions (listing_id, tx_type, from_player_id, to_player_id, creature_id, amount_sol, tx_signature)
      VALUES ($1, 'sale', $2, $3, $4, $5, $6)
    `, [listing.id, buyer.id, listing.seller_id, listing.creature_id, listing.price_sol, txSignature]);

    return NextResponse.json({
      success: true,
      creature_id: listing.creature_id,
      paid: listing.price_sol,
      fee,
      sellerPayout,
      sellerTx,
    });
  } catch (err) {
    console.error('[MARKETPLACE] Buy error:', err);
    return NextResponse.json({ error: 'Error processing purchase' }, { status: 500 });
  }
}
