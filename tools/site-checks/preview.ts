import { resolve } from "node:path";
import { build, preview } from "vite";

export default async function startPreview() {
  const root = resolve(__dirname, "../../apps/web");
  await build({ root, logLevel: "warn" });
  const server = await preview({ root, preview: { host: "127.0.0.1", port: 0, strictPort: true } });
  const address = server.httpServer.address();
  if (!address || typeof address === "string") {
    await server.close();
    throw new Error("Local preview could not bind to loopback");
  }
  process.env.BUBBLE_CHECK_PREVIEW_URL = `http://127.0.0.1:${address.port}`;
  return () => server.close();
}
