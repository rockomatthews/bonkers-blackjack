import Club from "../src/Club";
import {publicCryptoTestingEnabled} from "../shared/crypto/access";
export default function Page() {
  return <Club cryptoTestingEnabled={publicCryptoTestingEnabled()} />;
}
