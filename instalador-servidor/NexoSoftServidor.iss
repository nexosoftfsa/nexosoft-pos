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

[Run]
; No "runhidden": se deja visible la consola de PowerShell durante este
; paso para que quien instala vea que esta pasando algo (tarda unos
; minutos: initdb, migraciones, compilacion del cliente Prisma). Ademas
; queda un log permanente en <RaizDatos>\logs\bootstrap.log.
Filename: "powershell.exe"; \
    Parameters: "-NoProfile -ExecutionPolicy Bypass -File ""{app}\scripts\bootstrap-servidor-standalone.ps1"" -NombreComercio ""{code:GetNombreComercio}"" -AdminUsuario ""{code:GetAdminUsuario}"" -AdminPassword ""{code:GetAdminPassword}"" -NodeDir ""{app}\node-portable"" -PostgresDir ""{app}\postgres-portable"" -ServidorDir ""{app}\dist-servidor"" -PuertoPostgres {code:GetPuertoPostgres} -CodigoAccesoRemoto ""{code:GetCodigoAccesoRemoto}"""; \
    StatusMsg: "Configurando el servidor (puede tardar varios minutos)..."; \
    Flags: waituntilterminated

[Code]
var
  PaginaComercio: TInputQueryWizardPage;
  PaginaAdmin: TInputQueryWizardPage;
  PaginaBase: TInputQueryWizardPage;
  PaginaAccesoRemoto: TInputQueryWizardPage;

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
