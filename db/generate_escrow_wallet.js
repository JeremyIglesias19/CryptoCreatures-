// Run ONCE: node db/generate_escrow_wallet.js
// Generates a Solana keypair for the escrow/treasury wallet
// Add the output to your .env file

const { Keypair } = require('@solana/web3.js');
const bs58 = require('bs58');

const keypair = Keypair.generate();
console.log('\n=== CryptoCreatures Escrow Wallet ===');
console.log(`Public Key:  ${keypair.publicKey.toBase58()}`);
console.log(`Secret Key:  [${keypair.secretKey.toString()}]`);
console.log('\nAdd this to your .env file:');
console.log(`ESCROW_WALLET_SECRET=[${keypair.secretKey.toString()}]`);
console.log(`NEXT_PUBLIC_ESCROW_WALLET=${keypair.publicKey.toBase58()}`);
console.log('\nThen fund it with devnet SOL:');
console.log(`solana airdrop 5 ${keypair.publicKey.toBase58()} --url devnet`);
