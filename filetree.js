/**
 * ======================================================
 * File Tree Generator (Node.js)
 * ======================================================
 *
 * 📝 Tutorial / How To Use:
 *
 * 1. Save this file as `filetree.js` in your project root.
 * 2. Run with:  node filetree.js
 * 3. By default, it prints a tree structure of your project
 *    while ignoring common folders like `node_modules`.
 *
 * ======================================================
 * ⚙️ Customization:
 *
 * 👉 Exclude folders or files:
 *    - Open the "EXCLUDE_LIST" below and add names.
 *    - Examples:
 *        "node_modules"   → exclude folder
 *        ".git"           → exclude folder
 *        "secret.txt"     → exclude specific file
 *
 * 👉 Change start directory:
 *    - Default is current folder `.`
 *    - Change the line at bottom:
 *        printTree("src");   // Only show src folder
 *
 * 👉 Limit depth (optional):
 *    - Set MAX_DEPTH to a number (e.g., 2 = show only 2 levels).
 *    - Set MAX_DEPTH = Infinity to remove limit.
 *
 * ======================================================
 * Example Usage:
 *
 *   node filetree.js
 *
 *   Output:
 *   ├── package.json
 *   ├── src
 *   │   ├── index.js
 *   │   └── utils
 *   │       └── helper.js
 *   └── README.md
 *
 * ======================================================
 */

import fs from "fs";
import path from "path";


// ✅ EDIT THIS LIST TO IGNORE FILES/FOLDERS
const EXCLUDE_LIST = ["node_modules", "temp", "staging", ".next", ".git", ".DS_Store", "dist", ".VSCodeCounter", "mega-test", "api.http", "deploy.ps1", "Docs.txt", "fileTree.js", "reset-and-run.ps1", "rough"];

// ✅ Change tree depth (Infinity = no limit)
const MAX_DEPTH = Infinity;

function printTree(dir, prefix = "", depth = 0) {
  if (depth > MAX_DEPTH) return;

  const files = fs.readdirSync(dir).filter(f => !EXCLUDE_LIST.includes(f));

  files.forEach((file, i) => {
    const isLast = i === files.length - 1;
    const fullPath = path.join(dir, file);
    const stats = fs.statSync(fullPath);

    console.log(`${prefix}${isLast ? "└── " : "├── "}${file}`);

    if (stats.isDirectory()) {
      printTree(fullPath, prefix + (isLast ? "    " : "│   "), depth + 1);
    }
  });
}

// Start from current folder
printTree(".");