# Exponer `admin-web` a internet con Cloudflare Tunnel

Procedimiento **operativo**, no código del repo (ver [ADR-0052](adr/0052-acceso-remoto-admin-web-cloudflare-tunnel.md)
para la decisión y los prerrequisitos de seguridad que ya están resueltos en
`cloud-api`: rate-limiting, lockout de cuenta, `trust proxy`). Opcional — solo
para el comercio que quiera que el dueño vea el panel de reportes desde
afuera de la LAN. Sin este paso, todo sigue funcionando igual que antes,
solo accesible desde la red del local (ver [instalacion-primer-cliente.md](instalacion-primer-cliente.md)).

Requiere: el servidor de sucursal ya instalado y corriendo (`http://localhost:3000/api/v1/health`
respondiendo `ok`), y una cuenta gratuita de Cloudflare con un dominio
propio del comercio agregado (puede ser un subdominio barato, no hace falta
que sea el dominio "principal" del negocio).

## 1. Instalar `cloudflared` en la PC de Caja

Descargar el instalador de Windows desde
https://github.com/cloudflare/cloudflared/releases (el `.msi` más reciente)
y ejecutarlo. Verificar:

```powershell
cloudflared --version
```

## 2. Autenticar y crear el túnel

```powershell
cloudflared tunnel login
# abre el navegador, elegir el dominio del comercio y autorizar

cloudflared tunnel create nexosoft-<nombre-comercio>
# guarda un archivo de credenciales en %USERPROFILE%\.cloudflared\<TUNNEL_ID>.json
# -- NUNCA subir ese archivo al repo ni a ningún lado público
```

## 3. Configurar el ingress (a qué apunta el túnel)

Crear `%USERPROFILE%\.cloudflared\config.yml`:

```yaml
tunnel: <TUNNEL_ID>
credentials-file: C:\Users\<usuario>\.cloudflared\<TUNNEL_ID>.json

ingress:
  - hostname: panel.<dominio-del-comercio>.com
    service: http://localhost:3000
  - service: http_status:404
```

## 4. DNS

```powershell
cloudflared tunnel route dns nexosoft-<nombre-comercio> panel.<dominio-del-comercio>.com
```

Cloudflare crea el CNAME solo — no hace falta tocar nada en el panel de DNS
a mano.

## 5. Correrlo como servicio de Windows (arranca solo, se reinicia solo)

```powershell
cloudflared service install
```

Verificar: `https://panel.<dominio-del-comercio>.com/api/v1/health` tiene
que responder `ok` desde afuera de la LAN (probar con datos móviles, no
Wi-Fi del local).

## 6. Restringir CORS al dominio del túnel

En `apps\cloud-api\.env` (en el servidor), agregar:

```
CORS_ORIGINS=https://panel.<dominio-del-comercio>.com
```

Reiniciar el servicio de `cloud-api` (`Restart-Service nexosoft-cloud-api` o
el nombre que haya quedado registrado en la instalación) para que tome la
variable nueva. Sin este paso, CORS sigue abierto a cualquier origen — no
rompe nada, pero no suma la protección extra.

## 7. Verificación final

- Abrir `https://panel.<dominio-del-comercio>.com` desde un celular con
  datos móviles (no Wi-Fi del local) y loguearse como ADMIN/SUPERVISOR.
- Confirmar que el layout se ve bien en el celular (nav como menú
  hamburguesa, tablas con scroll horizontal si hace falta — Fase 15.B).
- Probar el lockout: 6 intentos de login seguidos con contraseña incorrecta
  tienen que devolver 429 en el sexto (ver ADR-0052).

## Notas

- El túnel no expone ningún puerto del router del comercio — toda la
  conexión sale desde la PC hacia Cloudflare, nunca al revés. No hace falta
  tocar el router/firewall del ISP.
- Si el comercio da de baja el servicio o cambia de PC, `cloudflared
  service uninstall` y repetir desde el paso 2 con la PC nueva (el túnel en
  sí puede reusarse, solo cambia dónde corre `cloudflared`).
- Las credenciales del túnel (`<TUNNEL_ID>.json`) y `config.yml` viven fuera
  del repo, en el perfil de Windows del servidor — igual criterio que
  cualquier secreto (CLAUDE.md §5).
