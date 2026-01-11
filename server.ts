// server.ts
import { createServer } from "http";
import { parse } from "url";
import next from "next";
import { Server } from "socket.io";

const dev = process.env.NODE_ENV !== "production";
const app = next({ dev });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const server = createServer((req, res) => {
    const parsedUrl = parse(req.url!, true);
    handle(req, res, parsedUrl);
  });

  // Initialize Socket.io
  const io = new Server(server);

  io.on("connection", (socket) => {
    console.log("Client connected to Admin OS");
    
    // We will use this later to receive commands from UI
    socket.on("disconnect", () => {
      console.log("Client disconnected");
    });
  });

  // Make IO accessible globally (for our workers later)
  // We will attach this to a global variable or pass it to workers
  (global as any).io = io;

  server.listen(3001, () => {
    console.log("> OGPL Admin Ready on http://localhost:3001");
  });
});