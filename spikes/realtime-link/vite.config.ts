import type { IncomingMessage, ServerResponse } from "node:http";
import { defineConfig, type Plugin } from "vite";

// CC-3.13 throwaway spike: a tiny local signalling mailbox so the phone and
// the TV page can trade one WebRTC offer/answer through the Vite dev server
// itself (docs/architecture/realtime-link.md, "signal through the local Vite
// dev server"). One attempt is held at a time; a fresh "Start" tap on the
// phone posts a new offer and the previous answer is dropped.

interface Envelope {
  attemptId: number;
  sdp: string;
}

function readJsonBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch (err) {
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    });
    req.on("error", reject);
  });
}

function sendJson(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify(body));
}

function signallingMailbox(): Plugin {
  let offer: Envelope | null = null;
  let offerToken = 0;
  let answer: Envelope | null = null;
  let answerToken = 0;

  return {
    name: "realtime-link-signalling",
    configureServer(server) {
      // Registered directly (not returned as a post-hook), so this runs
      // before Vite's own middlewares -- otherwise /tv and /phone 404.
      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url ?? "/", "http://localhost");
        const { pathname, searchParams } = url;

        if (req.method === "GET" && pathname === "/tv") {
          req.url = "/tv.html";
          next();
          return;
        }
        if (req.method === "GET" && pathname === "/phone") {
          req.url = "/phone.html";
          next();
          return;
        }

        if (pathname === "/api/offer" && req.method === "POST") {
          const body = await readJsonBody(req);
          offer = { attemptId: Number(body.attemptId), sdp: String(body.sdp) };
          offerToken += 1;
          answer = null; // a fresh attempt invalidates any stale answer
          res.statusCode = 204;
          res.end();
          return;
        }
        if (pathname === "/api/offer" && req.method === "GET") {
          const since = Number(searchParams.get("since") ?? 0);
          if (offer && offerToken > since) {
            sendJson(res, 200, { token: offerToken, ...offer });
            return;
          }
          res.statusCode = 204;
          res.end();
          return;
        }

        if (pathname === "/api/answer" && req.method === "POST") {
          const body = await readJsonBody(req);
          const attemptId = Number(body.attemptId);
          if (offer && offer.attemptId === attemptId) {
            answer = { attemptId, sdp: String(body.sdp) };
            answerToken += 1;
          }
          res.statusCode = 204;
          res.end();
          return;
        }
        if (pathname === "/api/answer" && req.method === "GET") {
          const since = Number(searchParams.get("since") ?? 0);
          const attemptId = Number(searchParams.get("attemptId") ?? -1);
          if (answer && answerToken > since && answer.attemptId === attemptId) {
            sendJson(res, 200, { token: answerToken, ...answer });
            return;
          }
          res.statusCode = 204;
          res.end();
          return;
        }

        next();
      });
    },
  };
}

export default defineConfig({
  plugins: [signallingMailbox()],
  server: {
    // Bind on the LAN too, not just localhost -- the cloudflared quick tunnel
    // in the README points at this port from the phone.
    host: true,
    allowedHosts: [".trycloudflare.com"],
  },
});
