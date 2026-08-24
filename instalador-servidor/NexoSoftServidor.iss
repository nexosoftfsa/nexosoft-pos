; Instalador de servidor NexoSoft (Fase 13.C).
;
; Deja el cloud-api funcionando de punta a punta en la PC de un comercio,
; sin necesitar Node.js, PostgreSQL, Git ni pnpm ya instalados: todo va
; embebido (Node y PostgreSQL portables, mas el cloud-api ya compilado) y
; funciona sin internet en el local. Pide solo lo que es unico de esa PC:
; el nombre del comercio y el usuario/clave del primer ADMIN.
;
; Requiere antes de compilar (una sola vez, o cuando se bumpea la version
; de Node/Postgres):
;   .\scripts\release\armar-paquete-servidor.ps1
;   .\scripts\release\preparar-runtimes-instalador.ps1
;
; Compilar con Inno Setup 6 (ISCC.exe), parado en la raiz del repo:
;   & "$env:LOCALAPPDATA\Programs\Inno Setup 6\ISCC.exe" instalador-servidor\NexoSoftServidor.iss

#define MyAppName "NexoSoft Servidor"
; Se puede pisar en build time con /DMyAppVersion=X.Y.Z (ver
; scripts/release/publicar-instalador-servidor.ps1).
#ifndef MyAppVersion
  #define MyAppVersion "0.1.0"
#endif
#define MyAppPublisher "NexoSoft"

[Setup]
; GUID fijo: no regenerar -- es lo que le permite a Inno detectar que una
; reinstalacion es una actualizacion de LA MISMA app, no una nueva.
AppId={{7C6E2C6A-6C8B-4B7B-9C5E-2B7C9E9B5C1A}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
DefaultDirName=C:\NexoSoft-Servidor
DefaultGroupName=NexoSoft Servidor
DisableProgramGroupPage=yes
; Necesita administrador: registra tareas programadas y una regla de
; firewall. Con esto Inno pide UAC una sola vez para todo el instalador.
PrivilegesRequired=admin
ArchitecturesInstallIn64BitMode=x64compatible
OutputDir=Output
OutputBaseFilename=NexoSoft-Servidor-{#MyAppVersion}-Setup
Compression=lzma2/max
SolidCompression=yes
WizardStyle=modern
DisableWelcomePage=no
DisableReadyPage=no

[Languages]
Name: "spanish"; MessagesFile: "compiler:Languages\Spanish.isl"

[Files]
; El cloud-api ya compilado (Fase 13.A) -- sin codigo fuente ni .env.
Source: "..\dist-servidor\*"; DestDir: "{app}\dist-servidor"; Flags: recursesubdirs createallsubdirs ignoreversion; Excludes: ".env,logs\*"
; Runtimes portables (Fase 13.C, ver preparar-runtimes-instalador.ps1).
Source: "runtime\node-portable\*"; DestDir: "{app}\node-portable"; Flags: recursesubdirs createallsubdirs ignoreversion
Source: "runtime\postgres-portable\*"; DestDir: "{app}\postgres-portable"; Flags: recursesubdirs createallsubdirs ignoreversion
; Conector del tunel de acceso remoto (Fase 17.A, ADR-0055). Va embebido
; para no depender de bajarlo en la PC del cliente.
Source: "runtime\cloudflared\cloudflared.exe"; DestDir: "{app}\cloudflared"; Flags: ignoreversion
; Scripts de bootstrap (Fase 13.B).
Source: "..\scripts\instalacion\bootstrap-servidor-standalone.ps1"; DestDir: "{app}\scripts"; Flags: ignoreversion
Source: "..\scripts\instalacion\instalar-servicio-servidor.ps1"; DestDir: "{app}\scripts"; Flags: ignoreversion
Source: "..\scripts\instalacion\abrir-firewall-servidor.ps1"; DestDir: "{app}\scripts"; Flags: ignoreversion
Source: "..\scripts\instalacion\actualizador-servidor.ps1"; DestDir: "{app}\scripts"; Flags: ignoreversion
Source: "..\scripts\instalacion\instalar-acceso-remoto.ps1"; DestDir: "{app}\scripts"; Flags: ignoreversion
Source: "..\scripts\instalacion\configurar-suscripcion.ps1"; DestDir: "{app}\scripts"; Flags: ignoreversion
Source: "..\scripts\instalacion\detener-servidor.ps1"; DestDir: "{app}\scripts"; Flags: ignoreversion
; Y otra vez, sin copiar: PrepareToInstall lo necesita ANTES de que empiece la
; copia de archivos, que es cuando {app}\scripts todavia tiene la version
; vieja (o no existe).
Source: "..\scripts\instalacion\detener-servidor.ps1"; Flags: dontcopy

[Run]
; No "runhidden": se deja visible la consola de PowerShell durante este
; paso para que quien instala vea que esta pasando algo (tarda unos
; minutos: initdb, migraciones, compilacion del cliente Prisma). Ademas
; queda un log permanente en <RaizDatos>\logs\bootstrap.log.
Filename: "powershell.exe"; \
    Parameters: "-NoProfile -ExecutionPolicy Bypass -File ""{app}\scripts\bootstrap-servidor-standalone.ps1"" -NombreComercio ""{code:GetNombreComercio}"" -AdminUsuario ""{code:GetAdminUsuario}"" -AdminPassword ""{code:GetAdminPassword}"" -NodeDir ""{app}\node-portable"" -PostgresDir ""{app}\postgres-portable"" -ServidorDir ""{app}\dist-servidor"" -PuertoPostgres {code:GetPuertoPostgres} -CodigoAccesoRemoto ""{code:GetCodigoAccesoRemoto}"""; \
    StatusMsg: "Configurando el servidor (puede tardar varios minutos)..."; \
    Flags: waituntilterminated

[UninstallRun]
; Mismo motivo que PrepareToInstall: no se pueden borrar archivos que un
; proceso vivo tiene abiertos.
Filename: "powershell.exe"; \
    Parameters: "-NoProfile -ExecutionPolicy Bypass -File ""{app}\scripts\detener-servidor.ps1"" -RaizInstalacion ""{app}"""; \
    Flags: runhidden; RunOnceId: "DetenerServidorNexoSoft"

[Code]
var
  PaginaComercio: TInputQueryWizardPage;
  PaginaAdmin: TInputQueryWizardPage;
  PaginaBase: TInputQueryWizardPage;
  PaginaAccesoRemoto: TInputQueryWizardPage;

{ Version del servidor NexoSoft ya instalada en esta PC, leida de la clave de
  desinstalacion que escribe el propio Inno. Vacio si no hay ninguna. }
function VersionYaInstalada(): String;
var
  Valor: String;
begin
  Result := '';
  if RegQueryStringValue(HKLM, 'SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\{7C6E2C6A-6C8B-4B7B-9C5E-2B7C9E9B5C1A}_is1', 'DisplayVersion', Valor) then
    Result := Valor;
end;

{ Frena la instalacion si en la PC ya hay una version MAS NUEVA.

  Instalar un servidor viejo sobre uno nuevo deja codigo viejo contra una
  base de datos que ya fue migrada por el nuevo: las migraciones de Prisma
  van para adelante, no para atras. Ya paso una vez en la PC de un cliente
  (se llevo un instalador compilado con el numero de version del POS, 0.1.17,
  cuando ahi ya corria el servidor 0.4.0). }
function InitializeSetup(): Boolean;
var
  Instalada: String;
  VerInstalada, VerNueva: Int64;
begin
  Result := True;
  Instalada := VersionYaInstalada();
  if Instalada = '' then exit;
  if not StrToVersion(Instalada, VerInstalada) then exit;
  if not StrToVersion('{#MyAppVersion}', VerNueva) then exit;
  if ComparePackedVersion(VerInstalada, VerNueva) > 0 then begin
    MsgBox('En esta PC ya esta instalado el servidor NexoSoft ' + Instalada + ', que es MAS NUEVO que el ' +
           '{#MyAppVersion}' + ' que estas por instalar.' + #13#10 + #13#10 +
           'Poner una version mas vieja sobre una mas nueva puede romper la base de datos del comercio, ' +
           'porque las migraciones ya aplicadas no se pueden deshacer.' + #13#10 + #13#10 +
           'Conseguí el instalador de la ultima version del SERVIDOR (ojo: el servidor y el POS tienen ' +
           'numeraciones distintas) y volve a intentar.', mbError, MB_OK);
    Result := False;
  end;
end;

{ Baja el servidor que ya esta corriendo ANTES de empezar a copiar archivos.

  Sin esto, reinstalar sobre una instalacion andando moria a mitad de camino:
  Windows no deja reemplazar un archivo que un proceso vivo tiene abierto, y
  postgres.exe mantiene cargados los .dll de postgres-portable\bin. El
  instalador mostraba "DeleteFile fallo; codigo 5. Acceso denegado" sobre
  icudt67.dll, con las tres salidas malas: reintentar (falla igual), omitir el
  archivo (deja un PostgreSQL con binarios de dos versiones distintas) o
  cancelar (con archivos ya reemplazados).

  Si no se puede detener, se aborta ACA, antes de tocar un solo archivo: es
  preferible no instalar a dejar la instalacion por la mitad. El bootstrap del
  final vuelve a levantar las tareas. }
function PrepareToInstall(var NeedsRestart: Boolean): String;
var
  Codigo: Integer;
begin
  Result := '';
  { En una PC limpia no hay nada corriendo que parar. }
  if VersionYaInstalada() = '' then exit;

  ExtractTemporaryFile('detener-servidor.ps1');
  if not Exec('powershell.exe',
              '-NoProfile -ExecutionPolicy Bypass -File "' + ExpandConstant('{tmp}\detener-servidor.ps1') +
              '" -RaizInstalacion "' + ExpandConstant('{app}') + '"',
              '', SW_HIDE, ewWaitUntilTerminated, Codigo) then begin
    Result := 'No se pudo ejecutar el paso que detiene el servidor. Cerra el instalador y avisale a NexoSoft.';
    exit;
  end;
  if Codigo <> 0 then
    Result := 'No se pudo detener el servidor que esta corriendo en esta PC, asi que no se toco ningun archivo.' + #13#10 + #13#10 +
              'Reinicia la PC y volve a correr este instalador ANTES de abrir el POS.';
end;

procedure InitializeWizard;
begin
  PaginaComercio := CreateInputQueryPage(wpSelectDir,
    'Datos del comercio', 'Como se llama el comercio',
    'Este nombre va a aparecer en el panel y en los tickets. Se puede corregir despues desde la Configuracion del sistema.');
  PaginaComercio.Add('Nombre del comercio:', False);

  PaginaAdmin := CreateInputQueryPage(PaginaComercio.ID,
    'Primer usuario', 'Usuario administrador',
    'Vas a usar este usuario y clave para entrar la primera vez. Va a tener permisos de Administrador; despues podes crear mas usuarios desde el sistema.');
  PaginaAdmin.Add('Usuario (por ejemplo: admin):', False);
  PaginaAdmin.Add('Contraseña (minimo 8 caracteres):', True);
  PaginaAdmin.Add('Confirmar contraseña:', True);

  PaginaBase := CreateInputQueryPage(PaginaAdmin.ID,
    'Base de datos', 'Puerto de PostgreSQL',
    'NexoSoft instala su PROPIO PostgreSQL, aparte de cualquier otro que ya haya en esta PC.' + #13#10 +
    'Dejalo en 5432 salvo que esta PC YA tenga un PostgreSQL instalado (por ejemplo del sistema anterior del comercio): en ese caso pone otro puerto libre, como 5433, para no interferir con el existente.');
  PaginaBase.Add('Puerto:', False);
  PaginaBase.Values[0] := '5432';

  PaginaAccesoRemoto := CreateInputQueryPage(PaginaBase.ID,
    'Acceso remoto (opcional)', 'Ver el panel desde afuera del local',
    'Si contrataste el acceso remoto, pega aca el codigo de activacion que te dimos: el panel de reportes va a quedar disponible desde cualquier lugar, con su propia direccion.' + #13#10 +
    'Si no lo tenes, dejalo vacio: todo el sistema funciona igual y el panel se ve desde la red del local. Se puede activar despues desde el POS (Configuracion > Acceso remoto).');
  PaginaAccesoRemoto.Add('Codigo de activacion:', False);
end;

{ El codigo de activacion es base64 (ver generar-codigo-acceso-remoto.ps1).
  Se valida el juego de caracteres para cazar en el acto un copiado a medias
  o un texto pegado por error, en vez de fallar recien al final. }
function CodigoAccesoRemotoValido(Codigo: String): Boolean;
var
  i: Integer;
  c: Char;
begin
  Result := False;
  if Length(Codigo) < 20 then exit;
  for i := 1 to Length(Codigo) do begin
    c := Codigo[i];
    if not (((c >= 'A') and (c <= 'Z')) or ((c >= 'a') and (c <= 'z')) or
            ((c >= '0') and (c <= '9')) or (c = '+') or (c = '/') or (c = '=')) then exit;
  end;
  Result := True;
end;

function NextButtonClick(CurPageID: Integer): Boolean;
var
  Puerto: Integer;
begin
  Result := True;
  if CurPageID = PaginaComercio.ID then begin
    if Trim(PaginaComercio.Values[0]) = '' then begin
      MsgBox('Ingresa el nombre del comercio.', mbError, MB_OK);
      Result := False;
    end;
  end;
  if CurPageID = PaginaAdmin.ID then begin
    if Trim(PaginaAdmin.Values[0]) = '' then begin
      MsgBox('Ingresa un usuario.', mbError, MB_OK);
      Result := False;
    end else if Length(PaginaAdmin.Values[1]) < 8 then begin
      MsgBox('La contraseña tiene que tener al menos 8 caracteres.', mbError, MB_OK);
      Result := False;
    end else if PaginaAdmin.Values[1] <> PaginaAdmin.Values[2] then begin
      MsgBox('Las contraseñas no coinciden.', mbError, MB_OK);
      Result := False;
    end;
  end;
  if CurPageID = PaginaBase.ID then begin
    Puerto := StrToIntDef(Trim(PaginaBase.Values[0]), -1);
    if (Puerto < 1) or (Puerto > 65535) then begin
      MsgBox('Ingresa un puerto valido (entre 1 y 65535). Si no sabes, dejalo en 5432.', mbError, MB_OK);
      Result := False;
    end;
  end;
  if CurPageID = PaginaAccesoRemoto.ID then begin
    if (Trim(PaginaAccesoRemoto.Values[0]) <> '') and
       (not CodigoAccesoRemotoValido(Trim(PaginaAccesoRemoto.Values[0]))) then begin
      MsgBox('Ese codigo de activacion no parece completo. Copialo de nuevo entero, o dejalo vacio para instalar sin acceso remoto.', mbError, MB_OK);
      Result := False;
    end;
  end;
end;

function GetNombreComercio(Param: String): String;
begin
  Result := PaginaComercio.Values[0];
end;

function GetAdminUsuario(Param: String): String;
begin
  Result := PaginaAdmin.Values[0];
end;

function GetAdminPassword(Param: String): String;
begin
  Result := PaginaAdmin.Values[1];
end;

function GetPuertoPostgres(Param: String): String;
begin
  Result := Trim(PaginaBase.Values[0]);
end;

function GetCodigoAccesoRemoto(Param: String): String;
begin
  Result := Trim(PaginaAccesoRemoto.Values[0]);
end;

procedure CurPageChanged(CurPageID: Integer);
var
  Contenido: AnsiString;
  Lineas: TArrayOfString;
  ArchivoIp: String;
begin
  if CurPageID = wpFinished then begin
    ArchivoIp := ExpandConstant('{commonappdata}\NexoSoft\ip-servidor.txt');
    if FileExists(ArchivoIp) and LoadStringFromFile(ArchivoIp, Contenido) then begin
      Lineas := StringSplit(Contenido, [#13#10], stExcludeEmpty);
      if GetArrayLength(Lineas) >= 2 then begin
        WizardForm.FinishedLabel.Caption :=
          'El servidor de NexoSoft ya esta funcionando y arranca solo con Windows.' + #13#10 + #13#10 +
          'Panel: http://localhost:' + Lineas[1] + '/' + #13#10 +
          'Desde otra PC o celular en la misma red: http://' + Lineas[0] + ':' + Lineas[1] + '/' + #13#10 + #13#10 +
          'Usa esa segunda direccion (con la IP) para configurar el POS en Deposito u Oficina.';
      end;
    end;
  end;
end;
