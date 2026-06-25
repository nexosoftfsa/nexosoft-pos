// Genera un único archivo portable: nexosoft-maqueta.html
// Embebe styles.css + app.js + el logo (1 sola vez) dentro de un HTML autocontenido.
// Abrilo en cualquier tablet/celular, sin internet.
// Uso:  node build-standalone.js
const fs = require("fs");
const path = require("path");

const dir = __dirname;
let html = fs.readFileSync(path.join(dir, "index.html"), "utf8");
const css = fs.readFileSync(path.join(dir, "styles.css"), "utf8");
const js = fs.readFileSync(path.join(dir, "app.js"), "utf8");

// Usamos funciones de reemplazo para no interpretar caracteres especiales ($).
html = html.replace('<link rel="stylesheet" href="styles.css" />', function () {
  return "<style>\n" + css + "\n</style>";
});
html = html.replace('<script src="app.js"></script>', function () {
  return "<script>\n" + js + "\n</script>";
});

const logoPath = path.join(dir, "assets", "logo.png");
if (fs.existsSync(logoPath)) {
  const dataUri = "data:image/png;base64," + fs.readFileSync(logoPath).toString("base64");
  // Deduplicado: quitamos los src y seteamos el logo una vez por JS (archivo liviano).
  html = html.split('src="assets/logo.png"').join('data-logo="1"');
  const inject =
    "<script>(function(){var L=" + JSON.stringify(dataUri) +
    ";document.querySelectorAll('img[data-logo]').forEach(function(i){i.src=L;});})();</script>";
  html = html.replace("</body>", function () { return inject + "\n</body>"; });
  console.log("✓ Logo embebido 1 vez (deduplicado) desde assets/logo.png");
} else {
  console.log("• No hay assets/logo.png -> se usa el logo provisorio.");
}

const out = path.join(dir, "nexosoft-maqueta.html");
fs.writeFileSync(out, html, "utf8");
console.log("✓ Generado: " + out + " (" + (Buffer.byteLength(html, "utf8") / 1024).toFixed(0) + " KB)");
console.log("  Envialo a la tablet/celular y abrilo en el navegador (funciona offline).");
