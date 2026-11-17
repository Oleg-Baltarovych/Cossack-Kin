// Smoke check (plan M1-01): Node runs the pure core directly (type stripping, `.ts` imports), as balance-sim will.
// `node tools/hello-core.ts` prints one line and exits 0.
import { Big } from '../src/core/big.ts';

const v = Big.from(1.15).pow(100);
console.log(`core ok: 1.15^100 = ${v.toString()}`);
