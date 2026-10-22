import {defineConfig} from '@playwright/test';
export default defineConfig({
 testDir:'./tests/crypto-browser',timeout:60000,expect:{timeout:10000},workers:1,reporter:'list',
 use:{baseURL:'http://127.0.0.1:3108',headless:true,trace:'retain-on-failure'},
 webServer:{command:'npm run build && npx next start --hostname 127.0.0.1 --port 3108',url:'http://127.0.0.1:3108',reuseExistingServer:false,env:{CRON_SECRET:'isolated-test-only-not-production',BONKERS_SITE_ORIGIN:'http://127.0.0.1:3108',BONKERS_LOCAL_STORE:'1',BONKERS_LOCAL_DIR:'/tmp/bonkers-shared-house-e2e-'+Date.now(),BONKERS_RPC_URL:'http://127.0.0.1:'+(process.env.BONKERS_E2E_RPC_PORT??'18550'),BONKERS_DEALER_KEY:'0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',BONKERS_HOUSE_ADDRESS:'0x70997970C51812dc3A010C7d01b50e0d17dc79C8',CRYPTO_LAB_ENABLED:'1',DATA_DIR:'.data/crypto-browser-test'},timeout:120000},
});
