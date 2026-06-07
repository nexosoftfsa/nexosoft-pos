// Servidor estático mínimo (sin dependencias) para ver la maqueta en una tablet.
// Uso:  node serve.js     -> luego, desde la tablet: http://<IP-de-esta-PC>:5173
const http = require("http");
const fs = require("fs");
const path = require("path");

const root = __dirname;
const port = process.env.PORT || 5173;
const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css",
  ".js": "text/javascript",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".ico": "image/x-icon",
};

http
  .createServer((req, res) => {
    let p = decodeURIComponent(req.url.split("?")[0]);
    if (p === "/") p = "/index.html";
    const fp = path.join(root, p);
    if (!fp.startsWith(root)) {
      res.writeHead(403);
      return res.end("403");
    }
    fs.readFile(fp, (err, data) => {
      if (err) {
        res.writeHead(404);
        return res.end("No encontrado");
      }
      res.writeHead(200, { "Content-Type": types[path.extname(fp)] || "application/octet-stream" });
      res.end(data);
    });
  })
  .listen(port, () => {
    console.log("Maqueta NexoSoft -> http://localhost:" + port);
    console.log("Desde una tablet en la misma red, usá la IP de esta PC, ej: http://192.168.0.10:" + port);
  });
