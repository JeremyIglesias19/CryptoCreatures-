import { query } from '@/lib/db';
import { NextResponse } from 'next/server';
import { verifyTransaction, sendSOLFromEscrow, calculateFees } from '@/lib/solana';

// POST /api/marketplace/bid - Place a bid on an auction
export async function POST(req) {
  const privyId = req.headers.get('x-privy-id');
  if (!privyId) return NextResponse.json({ error: 'No auth' }, { status: 401 });

  const { listingId, bidAmountSol, txSignature, walletAddress } = await req.json();
  if (!listingId || !bidAmountSol || !txSignature) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
  }

  try {
    const playerRes = await query('SELECT * FROM players WHERE privy_id = $1', [privyId]);
    if (playerRes.rows.length === 0) return NextResponse.json({ error: 'Player not found' }, { status: 404 });
    const bidder = playerRes.rows[0];

    // Update wallet address in DB if provided and different
    const senderAddress = walletAddress || bidder.wallet_address;
    if (walletAddress && walletAddress !== bidder.wallet_address) {
      await query('UPDATE players SET wallet_address = $1 WHERE id = $2', [walletAddress, bidder.id]);
    }

    // Get auction listing
    const listingRes = await query(
      "SELECT * FROM marketplace_listings WHERE id = $1 AND status = 'active' AND listing_type = 'auction'",
      [listingId]
    );
    if (listingRes.rows.length === 0) {
      return NextResponse.json({ error: 'Auction not found or ended' }, { status: 404 });
    }
    const listing = listingRes.rows[0];

    // Check expiry
    if (listing.expires_at && new Date(listing.expires_at) < new Date()) {
      return NextResponse.json({ error: 'Auction has expired' }, { status: 400 });
    }

    // Can't bid on your own
    if (listing.seller_id === bidder.id) {
      return NextResponse.json({ error: 'Cannot bid on your own auction' }, { status: 400 });
    }

    // Check bid amount meets minimum
    const minRequired = listing.current_bid_sol > 0
      ? parseFloat(listing.current_bid_sol) * 1.05 // 5% minimum increment
      : parseFloat(listing.min_bid_sol);

    if (bidAmountSol < minRequired) {
      return NextResponse.json({ error: `Bid must be at least ${minRequired.toFixed(4)} SOL` }, { status: 400 });
    }

    // Verify the Solana transaction
    const verification = await verifyTransaction(txSignature, senderAddress, bidAmountSol);
    if (!verification.valid) {
      return NextResponse.json({ error: `Transaction verification failed: ${verification.error}` }, { status: 400 });
    }

    // Refund previous bidder
    if (listing.current_bidder_id && listing.current_bid_sol > 0) {
      const prevBidderRes = await query('SELECT wallet_address FROM players WHERE id = $1', [listing.current_bidder_id]);
      const prevWallet = prevBidderRes.rows[0]?.wallet_address;
      if (prevWallet) {
        try {
          const refundTx = await sendSOLFromEscrow(prevWallet, parseFloat(listing.current_bid_sol));
          // Mark previous bid as refunded
          await query(
            "UPDATE bids SET refunded = true, refund_tx = $1 WHERE listing_id = $2 AND bidder_id = $3 AND refunded = false",
            [refundTx, listingId, listing.current_bidder_id]
          );
        } catch (refundErr) {
          console.error('[MARKETPLACE] Refund error:', refundErr);
          // Continue anyway - manual refund later
        }
      }
    }

    // Record the bid
    await query(`
      INSERT INTO bids (listing_id, bidder_id, amount_sol, tx_signature)
      VALUES ($1, $2, $3, $4)
    `, [listingId, bidder.id, bidAmountSol, txSignature]);

    // Update listing with new highest bid
    await query(`
      UPDATE marketplace_listings
      SET current_bid_sol = $1, current_bidder_id = $2
      WHERE id = $3
    `, [bidAmountSol, bidder.id, listingId]);

    return NextResponse.json({
      success: true,
      bidAmount: bidAmountSol,
      listingId,
    });
  } catch (err) {
    console.error('[MARKETPLACE] Bid error:', err);
    return NextResponse.json({ error: 'Error placing bid' }, { status: 500 });
  }
}

// POST /api/marketplace/bid/claim - Claim an expired auction (winner or seller)
export async function PUT(req) {
  const privyId = req.headers.get('x-privy-id');
  if (!privyId) return NextResponse.json({ error: 'No auth' }, { status: 401 });

  const { listingId } = await req.json();

  try {
    const playerRes = await query('SELECT * FROM players WHERE privy_id = $1', [privyId]);
    if (playerRes.rows.length === 0) return NextResponse.json({ error: 'Player not found' }, { status: 404 });

    const listingRes = await query(
      "SELECT * FROM marketplace_listings WHERE id = $1 AND status = 'active' AND listing_type = 'auction'",
      [listingId]
    );
    if (listingRes.rows.length === 0) {
      return NextResponse.json({ error: 'Auction not found' }, { status: 404 });
    }
    const listing = listingRes.rows[0];

    // Must be expired
    if (!listing.expires_at || new Date(listing.expires_at) > new Date()) {
      return NextResponse.json({ error: 'Auction not yet expired' }, { status: 400 });
    }

    // If no bids, return creature to seller
    if (!listing.current_bidder_id) {
      await query("UPDATE marketplace_listings SET status = 'expired' WHERE id = $1", [listingId]);
      await query('UPDATE creatures SET listed = false WHERE id = $1', [listing.creature_id]);
      return NextResponse.json({ success: true, result: 'no_bids', message: 'No bids — creature returned' });
    }

    // Pay seller from escrow
    const { fee, sellerPayout } = calculateFees(parseFloat(listing.current_bid_sol));
    const sellerRes = await query('SELECT wallet_address FROM players WHERE id = $1', [listing.seller_id]);
    const sellerWallet = sellerRes.rows[0]?.wallet_address;

    let sellerTx = null;
    if (sellerWallet && sellerPayout > 0) {
      try {
        sellerTx = await sendSOLFromEscrow(sellerWallet, sellerPayout);
      } catch (payErr) {
        console.error('[MARKETPLACE] Auction payout error:', payErr);
      }
    }

    // Transfer creature to winner
    await query('UPDATE creatures SET owner_id = $1, listed = false WHERE id = $2', [listing.current_bidder_id, listing.creature_id]);

    // Update listing
    await query(`
      UPDATE marketplace_listings
      SET status = 'sold', buyer_id = $1, seller_tx = $2, platform_fee = $3, sold_at = NOW()
      WHERE id = $4
    `, [listing.current_bidder_id, sellerTx, fee, listingId]);

    // Record transaction
    await query(`
      INSERT INTO marketplace_transactions (listing_id, tx_type, from_player_id, to_player_id, creature_id, amount_sol, tx_signature)
      VALUES ($1, 'auction_win', $2, $3, $4, $5, $6)
    `, [listingId, listing.current_bidder_id, listing.seller_id, listing.creature_id, listing.current_bid_sol, sellerTx]);

    return NextResponse.json({
      success: true,
      result: 'sold',
      buyer: listing.current_bidder_id,
      amount: listing.current_bid_sol,
      sellerPayout,
    });
  } catch (err) {
    console.error('[MARKETPLACE] Claim error:', err);
    return NextResponse.json({ error: 'Error claiming auction' }, { status: 500 });
  }
}
