// list-r2-files.js
import 'dotenv/config';
import { S3Client, ListObjectsV2Command } from "@aws-sdk/client-s3";

console.log("SCRIPT STARTED");


console.log("R2_ACCESS_KEY:", process.env.R2_ACCESS_KEY ? "OK" : "MISSING");
console.log("R2_SECRET_KEY:", process.env.R2_SECRET_KEY ? "OK" : "MISSING");


const r2 = new S3Client({
  region: "auto",
  endpoint: "https://d91bf15958ef1e29431aa55937bd99b9.r2.cloudflarestorage.com",
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY,
    secretAccessKey: process.env.R2_SECRET_KEY,
  },
});

async function list(prefix) {
  const res = await r2.send(
    new ListObjectsV2Command({
      Bucket: "ogpl-items",
      Prefix: prefix,
    })
  );

  return res.Contents?.map(o => o.Key) ?? [];
}

(async () => {
  const keys = await list("plugins/wp-social-ninja-pro/3.20.1/tree");
  console.log(keys);
})();