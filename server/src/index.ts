import { RoomDO } from "./roomDO";

export { RoomDO };

export interface Env {
  ASSETS: {
    fetch: (request: Request | string) => Promise<Response>;
  };
  ROOM_DO: {
    idFromName: (name: string) => {
      get: (id: unknown) => {
        fetch: (request: Request) => Promise<Response>;
      };
    };
    get: (id: unknown) => {
      fetch: (request: Request) => Promise<Response>;
    };
  };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // WebSocket route: /ws/:code
    if (url.pathname.startsWith("/ws/")) {
      const parts = url.pathname.split("/").filter(Boolean);
      const roomCode = parts[1] || "default_room";

      const doId = env.ROOM_DO.idFromName(roomCode);
      const stub = env.ROOM_DO.get(doId);
      return stub.fetch(request);
    }

    // Default route: Static Assets (index.html, JS, CSS)
    return env.ASSETS.fetch(request);
  },
};
