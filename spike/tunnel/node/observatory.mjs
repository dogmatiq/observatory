// Stands in for the Observatory in the tunnel spike: accepts a TLS connection
// from the engine, then acts as the HTTP/2 (gRPC) client on it.
import { readFileSync } from "node:fs";
import tls from "node:tls";
import http2 from "node:http2";
import { createClient } from "@connectrpc/connect";
import { createGrpcTransport } from "@connectrpc/connect-node";
import { createFileRegistry, fromBinary } from "@bufbuild/protobuf";
import { FileDescriptorSetSchema } from "@bufbuild/protobuf/wkt";

const certs = new URL("../certs/", import.meta.url);
const readCert = (name) => readFileSync(new URL(name, certs));
const ca = readCert("ca.pem");

const registry = createFileRegistry(
  fromBinary(FileDescriptorSetSchema, readFileSync(new URL("health.binpb", import.meta.url))),
);
const Health = registry.getService("grpc.health.v1.Health");

const server = tls.createServer(
  { key: readCert("observatory-key.pem"), cert: readCert("observatory.pem") },
  async (outer) => {
    console.log("observatory: engine connected, remote =", outer.remoteAddress);
    try {
      await talk(outer);
      console.log("RESULT: PASS");
    } catch (e) {
      console.log("RESULT: FAIL", e);
      process.exitCode = 1;
    } finally {
      outer.destroy();
      server.close();
    }
  },
);

async function talk(outer) {
  // The HTTP/2 session runs over a second TLS connection (the inner one) that
  // is made on top of the accepted socket (the outer one). Here the Observatory
  // is the TLS client of the inner connection, and presents a client certificate.
  const transport = createGrpcTransport({
    baseUrl: "https://engine.test",
    nodeOptions: {
      ca,
      cert: readCert("client.pem"),
      key: readCert("client-key.pem"),
      createConnection: (authority, options) =>
        tls.connect({
          ...options,
          socket: outer,
          servername: "engine.test",
          ALPNProtocols: ["h2"],
        }),
    },
  });
  const client = createClient(Health, transport);

  const res = await client.check({ service: "spike" });
  console.log("unary check ->", res.status);

  const seen = [];
  for await (const m of client.watch({ service: "spike" })) {
    seen.push(m.status);
    console.log("watch ->", m.status);
    if (seen.length >= 4) break;
  }
  if (seen.length < 4) throw new ErroreadCert("stream ended early");
}

server.listen(7443, () => console.log("observatory: listening"));
