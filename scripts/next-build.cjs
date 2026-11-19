const { spawn } = require("child_process");
const path = require("path");

const env = { ...process.env };
if (process.platform === "win32") {
  const preload = path.join(__dirname, "readlink-compat.cjs").replace(/\\/g, "/");
  env.NODE_OPTIONS = [process.env.NODE_OPTIONS, `--require "${preload}"`].filter(Boolean).join(" ");
}
const child = spawn(process.execPath, [require.resolve("next/dist/bin/next"), "build"], {
  stdio: "inherit",
  env,
  cwd: path.join(__dirname, ".."),
});
child.on("exit", (code) => process.exit(code ?? 1));
