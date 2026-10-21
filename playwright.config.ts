import { defineConfig, devices } from '@playwright/test';
const port=Number(process.env.CLEARPATH_TEST_PORT??5173);
if(!Number.isInteger(port)||port<1024||port>65535)throw new Error('Invalid CLEARPATH_TEST_PORT');
const baseURL=`http://127.0.0.1:${port}`;
export default defineConfig({testDir:'./tests/browser',workers:1,timeout:90000,expect:{timeout:12000},fullyParallel:false,use:{baseURL,trace:'retain-on-failure'},projects:[{name:'desktop',use:{...devices['Desktop Chrome']}},{name:'mobile',use:{...devices['iPhone 13'],defaultBrowserType:'chromium'}}],webServer:{command:`node scripts/run-framework.mjs dev --port ${port}`,url:baseURL,reuseExistingServer:true,timeout:120000}});


