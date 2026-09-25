import { readFileSync } from "node:fs";
import { verifyReceipt } from "../shared/protocol";
const path = process.argv[2];
if (!path) throw Error("Usage: npx tsx scripts/verify-receipt.ts receipt.json");
const result = await verifyReceipt(JSON.parse(readFileSync(path, "utf8")));
console.log(result);
if (!result.valid) process.exitCode = 1;
