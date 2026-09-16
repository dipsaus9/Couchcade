import { DurableObject } from "cloudflare:workers";

/**
 * One Durable Object per probe room. Sockets use the Hibernation API, so every
 * incoming message is a separate `webSocketMessage` invocation.
 */
export class ProbeRoom extends DurableObject {
  async fetch(request) {
    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("Expected a WebSocket upgrade", { status: 426 });
    }
    const { 0: client, 1: server } = new WebSocketPair();
    this.ctx.acceptWebSocket(server);
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws, message) {
    // Outgoing messages are free, so every incoming message gets an ack.
    ws.send(`ack:${message}`);
  }

  async webSocketClose(ws, code) {
    ws.close(code, "bye");
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/ws") {
      const room = url.searchParams.get("room") ?? "probe";
      const stub = env.PROBE_ROOM.get(env.PROBE_ROOM.idFromName(room));
      return stub.fetch(request);
    }

    if (url.pathname === "/rate-limit") {
      const { success } = await env.PROBE_LIMITER.limit({ key: "probe" });
      return Response.json({ success }, { status: success ? 200 : 429 });
    }

    return new Response("Not found", { status: 404 });
  },
};
