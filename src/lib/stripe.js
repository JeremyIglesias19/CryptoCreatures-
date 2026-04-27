import Stripe from 'stripe';

// Cliente Stripe server-side. Se inicializa lazy para no romper builds sin la env.
let _stripe = null;

export function getStripe() {
  if (_stripe) return _stripe;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error('STRIPE_SECRET_KEY no esta configurada en las variables de entorno');
  }
  _stripe = new Stripe(key, {
    apiVersion: '2024-10-28.acacia',
    typescript: false,
  });
  return _stripe;
}

// Constantes de producto
export const EGG_PRICE_EUR = 5;
export const EGG_PRICE_CENTS = EGG_PRICE_EUR * 100;
export const EGG_PRODUCT_NAME = 'Huevo CryptoCreatures';
export const EGG_PRODUCT_DESCRIPTION =
  'Abre un huevo y obten una criatura NFT aleatoria para tu coleccion.';
