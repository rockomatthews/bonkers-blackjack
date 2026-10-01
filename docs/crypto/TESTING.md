# Private crypto testing

Public `main` stays play-money. Both testing pages return 404 unless explicitly enabled locally, and always return 404 on Vercel. Neither is linked from the public navigation.

## Open the running owner test

Open http://127.0.0.1:3107/crypto-pilot in Chrome (or another browser with your Ethereum wallet extension).

1. Select **0x8A0182c099A618583e9EF98716DAcF739b3BD944** and connect on **Base mainnet**.
2. The wallet needs native Base USDC and Base ETH. Initial funding is **85.01 USDC**: 75 house reserve + 10.01 player balance. Reserve is held in your test vault, not a charge. Gas is consumed. Balances read on October 1 were zero USDC and zero ETH; recheck before testing.
3. Deploy owner-only contracts. Review the transaction in your wallet. No automatic signing or private-key import is used.
4. Approve and fund. Each step waits for a successful receipt; a rejected step can be resumed. Approval covers the exact funding deficit.
5. Deal a 5 USDC hand, then hit/stand/double/split when legal and sufficiently funded. The initial fee is 0.01 USDC. Top up with the funding button if testing multiple splits requires more available funds.
6. Download the receipt after settlement. **Resume / recover** processes the next dealer step or claims the contract's timeout recovery after the deadline. Do not clear browser storage while a hand is open: it contains the committed operator seed. Losing it requires timeout recovery.
7. **Withdraw all unlocked funds** returns the player balance and free house funds to your wallet. Finish/recover active rounds before withdrawing reserved funds.

This is an UNAUDITED owner-only test. The connected owner performs both operator and player actions. It verifies fund movement and contract replay, not independent production dealer operation. Base mainnet wagers are hard-restricted by the contract to its owner and at most 5 USDC. The owner browser retains the operator seed until reveal; no wallet secret key is stored. Contract deadlines are short (30-second player turns, 60-second operator steps); wallet confirmation delays can require timeout recovery.

## Local Base fork (no real value)

```
npm run crypto:lab
```

This starts Anvil on 127.0.0.1:8547, forks Base, deploys the contracts locally, funds local USDC balances, starts the persistent dealer worker, and serves Next on 127.0.0.1:3107. Its chain ID is **31337** so the local wallet path cannot accidentally send to Base. The upstream Base RPC is read-only. A private RPC can be set with `BASE_FORK_RPC_URL`; do not commit it.

The default directory `.data/crypto-lab` is ignored by Git and retains private seeds and receipts. The launcher refuses to overwrite an existing run. For a new run, use a new `CRYPTO_LAB_DIR`, and stop the old run first so the ports are free. The current launcher does not restore an Anvil chain after shutdown; preserve the files as evidence, then start a fresh directory. Worker restart against a still-running fork replays actions from chain events.

Open http://127.0.0.1:3107/crypto-lab. The configured wallet receives **1,000 simulated USDC and local ETH** on the fork. Connect it, approve and deposit 100 USDC, play, then withdraw. These balances do not exist on real Base.

Checks:
```
npm test
npm run contracts:test
npm run typecheck
npm run build
npm run crypto:verify-lab
npm run crypto:verify-pilot
```

The browser verification scripts impersonate the owner ONLY on verified localhost Anvil instances. `crypto:verify-pilot` uses a second temporary local fork with chain ID 8453 to test the exact mainnet screen; it does not broadcast to Base. Evidence is written under `docs/crypto/evidence/` and labels this distinction explicitly. The lab check expects a fresh player balance; use a fresh run to repeat it.

After Solidity changes, run `npm run crypto:artifact` to regenerate the wallet-deployable creation code, then re-run the pilot verification. Never deploy a stale artifact.

## Still outside this test

No multi-asset conversion is enabled. Direct connected-wallet USDC needs no Privy account or conversion provider. BTC/ETH/SOL/USDT funding needs a separately integrated and approved conversion route. Public production needs independent protocol/contract audit, eligibility requirements, production RPC/indexer/reorg handling, durable jobs, sponsored scoped sessions, operational deployment, and a separate reviewed release. This pilot must not be relabeled as production merely by merging it.

To serve only the owner mainnet screen without starting Anvil, run `npm run crypto:pilot` (stop any server already using port 3107 first). This merely serves the UI; it never deploys or funds anything automatically.

### Any-wallet update

Any Ethereum-compatible wallet can now connect on Base. The previously specified owner address is no longer a login or wagering allowlist. Each wallet's browser self-test is separate; existing mainnet contracts cannot be upgraded by this source change. A different wallet completed the browser flow on a local fork. Every wallet may withdraw **its own** unlocked balance. Only the treasury can withdraw free house funds.

Public-site links are prepared behind `CRYPTO_PUBLIC_TESTING=1`, currently disabled pending resolution of the owner's license-before-use requirement. This supersedes the earlier statement that the pilot unconditionally returns 404 on Vercel. The local Anvil page remains local-only.
