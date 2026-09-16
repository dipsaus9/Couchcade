import { routePartykitRequest, Server, type Connection, type ConnectionContext } from "partyserver";

type Env = { Room: DurableObjectNamespace<Room> };

// One Durable Object per room. Relays every message from one client to all the others.
export class Room extends Server<Env> {
  static options = { hibernate: true };

  onConnect(connection: Connection, ctx: ConnectionContext) {
    const role = new URL(ctx.request.url).searchParams.get("role") ?? "unknown";
    connection.setState({ role });
    connection.send(JSON.stringify({ type: "welcome", id: connection.id, role, room: this.name }));
  }

  onMessage(sender: Connection, message: string | ArrayBuffer) {
    this.broadcast(message, [sender.id]);
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/api/health") return Response.json({ ok: true });
    return (await routePartykitRequest(request, env)) ?? new Response("Not found", { status: 404 });
  },
} satisfies ExportedHandler<Env>;
