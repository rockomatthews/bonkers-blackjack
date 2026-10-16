import Club from '../src/Club';
import LiveLobby from '../src/LiveLobby';
import {siteMode} from '../shared/site-mode';
import {publicCryptoTestingEnabled} from '../shared/crypto/access';
export const dynamic='force-dynamic';
export default function Page(){return siteMode()==='live'?<LiveLobby/>:<Club cryptoTestingEnabled={publicCryptoTestingEnabled()}/>;}
