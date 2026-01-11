import { analyze } from './core/analyzer/index';
import path from 'path';

// CHANGE THIS to a real folder path on your machine that contains an unzipped plugin
const TEST_PATH = path.resolve('/home/clint/temp/woocommerce-distance-rate-shipping'); 

async function run() {
  console.log("Testing Analyzer...");
  const result = await analyze(TEST_PATH, (msg) => console.log("LOG:", msg));
  console.log(JSON.stringify(result, null, 2));
}

run();