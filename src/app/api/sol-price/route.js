import { NextResponse } from 'next/server';

// Cache SOL price for 5 minutes to avoid rate limiting
let cachedPrice = null;
let cachedAt = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export async function GET() {
  const now = Date.now();

  // Return cached price if fresh
  if (cachedPrice && (now - cachedAt) < CACHE_TTL) {
    return NextResponse.json({ priceEUR: cachedPrice, cached: true });
  }

  try {
    const res = await fetch(
      'https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=eur',
      { next: { revalidate: 300 } } // 5 min cache
    );
    const data = await res.json();
    const priceEUR = data?.solana?.eur;

    if (priceEUR) {
      cachedPrice = priceEUR;
      cachedAt = now;
      return NextResponse.json({ priceEUR });
    }

    // Fallback price if API fails
    return NextResponse.json({ priceEUR: cachedPrice || 130, fallback: true });
  } catch (err) {
    console.error('[SOL-PRICE] Error fetching price:', err);
    return NextResponse.json({ priceEUR: cachedPrice || 130, fallback: true });
  }
}
