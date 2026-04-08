// ============================================
// CryptoCreatures - Solana Utilities
// Server-side: verify transactions, send SOL from escrow
// ============================================
import { Connection, PublicKey, Keypair, Transaction, SystemProgram, LAMPORTS_PER_SOL } from '@solana/web3.js';

const RPC_URL = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';
const PLATFORM_FEE_PERCENT = 5; // 5% fee on sales

let _connection = null;
export function getConnection() {
  if (!_connection) _connection = new Connection(RPC_URL, 'confirmed');
  return _connection;
}

let _escrowKeypair = null;
export function getEscrowKeypair() {
  if (!_escrowKeypair) {
    const secretStr = process.env.ESCROW_WALLET_SECRET;
    if (!secretStr) throw new Error('ESCROW_WALLET_SECRET not configured');
    const secretArray = JSON.parse(secretStr);
    _escrowKeypair = Keypair.fromSecretKey(Uint8Array.from(secretArray));
  }
  return _escrowKeypair;
}

export function getEscrowPublicKey() {
  return getEscrowKeypair().publicKey.toBase58();
}

/**
 * Verify a SOL transfer transaction on-chain
 * Checks: confirmed, correct amount, correct sender, correct receiver (escrow)
 */
export async function verifyTransaction(txSignature, expectedSender, expectedAmountSOL) {
  const conn = getConnection();

  // Wait for confirmation with timeout
  let attempts = 0;
  let txInfo = null;
  while (attempts < 30) {
    txInfo = await conn.getTransaction(txSignature, {
      commitment: 'confirmed',
      maxSupportedTransactionVersion: 0,
    });
    if (txInfo) break;
    await new Promise(r => setTimeout(r, 1000));
    attempts++;
  }

  if (!txInfo) return { valid: false, error: 'Transaction not found or not confirmed' };
  if (txInfo.meta?.err) return { valid: false, error: 'Transaction failed on-chain' };

  // Check that the escrow wallet received the correct amount
  const escrowPubkey = getEscrowKeypair().publicKey.toBase58();
  const accountKeys = txInfo.transaction.message.accountKeys ||
    txInfo.transaction.message.staticAccountKeys;

  const keys = accountKeys.map(k => k.toBase58 ? k.toBase58() : k.toString());
  const escrowIdx = keys.indexOf(escrowPubkey);
  const senderIdx = keys.indexOf(expectedSender);

  if (escrowIdx === -1) return { valid: false, error: 'Escrow wallet not in transaction' };
  if (senderIdx === -1) return { valid: false, error: 'Expected sender not in transaction' };

  // Check balance changes
  const preBalances = txInfo.meta.preBalances;
  const postBalances = txInfo.meta.postBalances;
  const escrowReceived = (postBalances[escrowIdx] - preBalances[escrowIdx]) / LAMPORTS_PER_SOL;

  // Allow 0.1% tolerance for rounding
  const tolerance = expectedAmountSOL * 0.001;
  if (escrowReceived < expectedAmountSOL - tolerance) {
    return { valid: false, error: `Insufficient amount: received ${escrowReceived} SOL, expected ${expectedAmountSOL} SOL` };
  }

  return { valid: true, amountReceived: escrowReceived };
}

/**
 * Send SOL from escrow wallet to a recipient (seller payout)
 */
export async function sendSOLFromEscrow(recipientAddress, amountSOL) {
  const conn = getConnection();
  const escrowKeypair = getEscrowKeypair();

  const transaction = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: escrowKeypair.publicKey,
      toPubkey: new PublicKey(recipientAddress),
      lamports: Math.round(amountSOL * LAMPORTS_PER_SOL),
    })
  );

  transaction.feePayer = escrowKeypair.publicKey;
  const { blockhash } = await conn.getLatestBlockhash('confirmed');
  transaction.recentBlockhash = blockhash;

  transaction.sign(escrowKeypair);
  const signature = await conn.sendRawTransaction(transaction.serialize());
  await conn.confirmTransaction(signature, 'confirmed');

  return signature;
}

/**
 * Calculate platform fee and seller payout
 */
export function calculateFees(priceSOL) {
  const fee = priceSOL * (PLATFORM_FEE_PERCENT / 100);
  const sellerPayout = priceSOL - fee;
  return { fee: Math.round(fee * 1e9) / 1e9, sellerPayout: Math.round(sellerPayout * 1e9) / 1e9 };
}

/**
 * Get SOL balance for an address
 */
export async function getBalance(address) {
  const conn = getConnection();
  const balance = await conn.getBalance(new PublicKey(address));
  return balance / LAMPORTS_PER_SOL;
}
