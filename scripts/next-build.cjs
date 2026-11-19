const { spawn } = require("child_process");
const path = require("path");

const preload = path.join(__dirname, "readlink-compat.cjs").replace(/\\/g, "/");
const nodeOptions = [process.env.NODE_OPTIONS, `--require "${preload}"`].filter(Boolean).join(" ");
const child = spawn(process.execPath, [require.resolve("next/dist/bin/next"), "build"], {
  stdio: "inherit",
  env: { ...process.env, NODE_OPTIONS: nodeOptions },
  cwd: path.join(__dirname, ".."),
});
child.on("exit", (code) => process.exit(code ?? 1));
