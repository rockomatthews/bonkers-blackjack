/** Public testing is explicitly deployed only after the owner's launch condition is resolved. */
export function publicCryptoTestingEnabled(env:Record<string,string|undefined>=process.env){return env.CRYPTO_PUBLIC_TESTING==='1';}
export function cryptoPilotEnabled(env:Record<string,string|undefined>=process.env){return publicCryptoTestingEnabled(env)||(env.CRYPTO_LAB_ENABLED==='1'&&!env.VERCEL);}
