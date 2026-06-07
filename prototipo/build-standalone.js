// Genera un único archivo portable: nexosoft-maqueta.html
// Embebe el logo (assets/logo.png) como data URI UNA sola vez, para que el
// archivo no dependa de nada externo y sea liviano. Abrilo en cualquier tablet,
// sin internet.
// Uso:  node build-standalone.js
const fs = require("fs");
const path = require("path");

const dir = __dirname;
let html = fs.readFileSync(path.join(dir, "index.html"), "utf8");

const logoPath = path.join(dir, "assets", "logo.png");
if (fs.existsSync(logoPath)) {
  const b64 = fs.readFileSync(logoPath).toString("base64");
  const dataUri = "data:image/png;base64," + b64;
  // Deduplicado: quitamos los src y seteamos el logo una vez por JS (archivo liviano).
  html = html.split('src="assets/logo.png"').join('data-logo="1"');
  const inject =
    "<script>(function(){var L=" +
    JSON.stringify(dataUri) +
    ";document.querySelectorAll('img[data-logo]').forEach(function(i){i.src=L;});})();</script>";
  html = html.replace("</body>", inject + "\n</body>");
  console.log("✓ Logo embebido 1 vez (deduplicado) desde assets/logo.png");
} else {
  console.log("• No hay assets/logo.png -> se usa el logo provisorio (igual queda autocontenido).");
}

const out = path.join(dir, "nexosoft-maqueta.html");
fs.writeFileSync(out, html, "utf8");
const kb = (Buffer.byteLength(html, "utf8") / 1024).toFixed(0);
console.log("✓ Generado: " + out + " (" + kb + " KB)");
console.log("  Envialo a la tablet (WhatsApp/email/Drive/cable) y abrilo en el navegador.");
