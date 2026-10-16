import {defineConfig} from '@playwright/test';
export default defineConfig({
 testDir:'./tests/crypto-browser',timeout:60000,expect:{timeout:10000},workers:1,reporter:'list',
 use:{baseURL:'http://127.0.0.1:3108',headless:true,trace:'retain-on-failure'},
 webServer:{command:'npx next dev --hostname 127.0.0.1 --port 3108',url:'http://127.0.0.1:3108',reuseExistingServer:false,env:{CRYPTO_LAB_ENABLED:'1',DATA_DIR:'.data/crypto-browser-test'},timeout:120000},
});
