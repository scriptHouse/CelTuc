"""CLI del agente.

Subcomandos:

- ``run``      (por defecto) corre el servicio; ``--console`` loguea a pantalla.
- ``diag``     diagnóstico de conexión al reloj y al backend (spec §12).
- ``secrets``  guarda/inspecciona secretos cifrados con DPAPI.
- ``config``   muestra la configuración efectiva (sin secretos).
- ``version``  imprime la versión.
"""
from __future__ import annotations

import argparse
import getpass
import json
import sys
from datetime import datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

from . import AGENT_VERSION, dpapi, paths
from .models_comunes import TOKEN_PREFIJO
from .config import ConfigHolder, Secrets, load_toml
from .logging_config import setup_logging
from .storage.repository import Repository


def _cargar(config_path: Path | None) -> tuple[ConfigHolder, Secrets, Path]:
    ruta = config_path or paths.default_config_path()
    if not ruta.exists() and config_path is None:
        # Modo desarrollo: permitir un config.toml junto al proyecto.
        alternativa = Path("config.toml")
        if alternativa.exists():
            ruta = alternativa
    local = load_toml(ruta)
    holder = ConfigHolder(local)
    secrets = Secrets.load(paths.default_secrets_path(), local)
    return holder, secrets, ruta


def _aplicar_cache_remota(holder: ConfigHolder) -> None:
    """Antes de arrancar, aplica la última config remota conocida (offline-first)."""
    try:
        repo = Repository(paths.default_db_path())
        cacheada = repo.get_cached_remote_config()
        repo.close()
    except Exception:
        return
    if cacheada:
        holder.apply_remote(cacheada)


# --------------------------------------------------------------------- run
def cmd_run(args: argparse.Namespace) -> int:
    from .service.runner import run_agent

    holder, secrets, ruta = _cargar(args.config)
    paths.ensure_dirs()
    _aplicar_cache_remota(holder)
    setup_logging(paths.logs_dir(), holder.current.log_level, console=args.console)

    import logging

    log = logging.getLogger(__name__)
    log.info("Config local: %s", ruta)
    if not secrets.backend_token:
        log.critical("No hay token del backend: correr `hikvision-agent secrets set` o descargar config.toml desde CelTuc")
    if not secrets.hikvision_password:
        log.critical("No hay contraseña del reloj: correr `hikvision-agent secrets set`")

    run_agent(holder, secrets)
    return 0


# -------------------------------------------------------------------- diag
def cmd_diag(args: argparse.Namespace) -> int:
    from .backend.client import BackendClient
    from .hikvision.client import DeviceError, HikvisionClient
    from .hikvision import parser as hik_parser

    holder, secrets, ruta = _cargar(args.config)
    config = holder.current

    # Overrides por línea de comando (para la FASE 1, sin config previa).
    device = config.device
    if args.host or args.username or args.port:
        from dataclasses import replace

        device = replace(
            device,
            host=args.host or device.host,
            username=args.username or device.username,
            port=args.port or device.port,
        )
    password = args.password or secrets.hikvision_password

    print(f"hikvision-agent {AGENT_VERSION} — diagnóstico")
    print(f"Config local: {ruta if ruta.exists() else '(sin config.toml)'}")
    print(f"Reloj: {device.host or '(sin host)'} usuario={device.username}")
    fallas = 0

    if not device.host:
        print("[FAIL] No hay host configurado: usar --host 192.168.1.50")
        return 1
    if not password:
        print("[FAIL] No hay contraseña: usar --password o `secrets set`")
        return 1

    cliente = HikvisionClient(device, password)
    try:
        info = cliente.get_device_info()
        print(f"[OK] Device reachable: {device.host}")
        print("[OK] Authentication successful")
        print(f"[OK] Model: {info.model or '?'}  Serial: {info.serial or '?'}")
        print(f"[OK] Firmware: {info.firmware or '?'}")
    except DeviceError as exc:
        print(f"[FAIL] {exc}")
        return 1

    try:
        hora = cliente.get_device_time()
        local = datetime.now(ZoneInfo(device.timezone)).isoformat(timespec="seconds")
        print(f"[OK] Hora del reloj: {hora or '?'}  (notebook: {local})")
    except DeviceError as exc:
        print(f"[WARN] No se pudo leer la hora del reloj: {exc}")

    tz = ZoneInfo(device.timezone)
    fin = datetime.now(tz)
    inicio = fin - timedelta(days=args.days)
    crudos: list[dict] = []
    try:
        for item in cliente.search_events(inicio, fin):
            crudos.append(item)
            if len(crudos) >= args.max_events:
                break
        print(f"[OK] Events query successful — Found {len(crudos)} events (últimos {args.days} días)")
    except DeviceError as exc:
        print(f"[FAIL] Búsqueda de eventos: {exc}")
        fallas += 1

    if crudos:
        primero = crudos[0]
        print("\nPayload original del primer evento:")
        print(json.dumps(primero, indent=2, ensure_ascii=False, default=str))
        parseado = hik_parser.parse_event_item(primero, info.serial or device.host, device.timezone)
        if parseado:
            print(
                f"\nParseado → empleado={parseado.employee_number} tipo={parseado.event_type} "
                f"método={parseado.verification_method} fecha={parseado.occurred_at.isoformat()}"
            )
        else:
            print("\n[WARN] El primer registro no parsea como fichada (¿evento de sistema?)")

    if args.save_fixture:
        destino = Path(args.save_fixture)
        alias: dict[str, str] = {}
        pagina = {
            "AcsEvent": {
                "searchID": "captura-diag",
                "responseStatusStrg": "OK",
                "numOfMatches": len(crudos),
                "totalMatches": len(crudos),
                "InfoList": (
                    [_anonimizar(i, alias) for i in crudos] if args.anonymize else crudos
                ),
            }
        }
        destino.parent.mkdir(parents=True, exist_ok=True)
        destino.write_text(json.dumps(pagina, indent=2, ensure_ascii=False, default=str), encoding="utf-8")
        print(f"\n[OK] Fixture guardado en {destino}")

    if config.backend.base_url and secrets.backend_token:
        try:
            remoto = BackendClient(config.backend, secrets.backend_token).get_config()
            print(f"[OK] Backend CelTuc respondió (config remota v{remoto.get('config', remoto).get('version', '?')})")
        except Exception as exc:
            print(f"[WARN] Backend: {exc}")
    else:
        print("[WARN] Backend sin configurar todavía (base_url/token): se prueba solo el reloj")

    print("\nDiagnóstico " + ("con fallas" if fallas else "completo sin fallas"))
    return 1 if fallas else 0


def _anonimizar(item: dict, alias: dict) -> dict:
    """Quita datos personales del fixture, conservando su forma.

    En este reloj el "numero de empleado" suele ser el NOMBRE de la persona
    (`employeeNoString: "Nacho"`), asi que tambien hay que seudonimizarlo o el
    fixture termina con datos reales en el repositorio. El mapa `alias` es
    compartido entre items para que la misma persona conserve el mismo alias
    y el fixture siga siendo util para probar el agrupado por empleado.
    """
    copia = dict(item)
    if copia.get("name"):
        copia["name"] = "EMPLEADO"
    numero = copia.get("employeeNoString")
    if numero:
        copia["employeeNoString"] = alias.setdefault(numero, f"EMP{len(alias) + 1}")
    for clave in ("pictureURL", "faceURL", "thermalData", "cardNo"):
        copia.pop(clave, None)
    return copia


# ----------------------------------------------------------------- secrets
def cmd_secrets(args: argparse.Namespace) -> int:
    ruta = paths.default_secrets_path()
    if args.accion == "set":
        paths.ensure_dirs()
        actuales = dpapi.load_secrets(ruta)
        print("Guardado cifrado con DPAPI.")
        print("  Enter        = mantener el valor actual")
        print("  un guion (-) = borrar el guardado")
        password = getpass.getpass("Contraseña del reloj Hikvision: ").strip()
        token = getpass.getpass("Token del agente (asist_…): ").strip()

        if password == "-":
            actuales.pop("hikvision_password", None)
        elif password:
            actuales["hikvision_password"] = password

        if token == "-":
            # Sin esto no habia forma de QUITAR un token mal pegado: dejarlo
            # vacio conservaba el viejo, y el guardado le gana al config.toml.
            actuales.pop("backend_token", None)
        elif token:
            invalidos = {c for c in token if not c.isascii() or c.isspace()}
            if invalidos:
                print()
                print(f"[ERROR] El token tiene caracteres inválidos: {''.join(sorted(invalidos))!r}")
                print("        Suele ser el símbolo del prompt copiado sin querer.")
                print("        No se guardó nada. Copiá solo el token (empieza con `asist_`).")
                return 1
            if not token.startswith(TOKEN_PREFIJO):
                print(f"[AVISO] El token no empieza con `{TOKEN_PREFIJO}`. Se guarda igual, "
                      "pero revisá que sea el correcto.")
            actuales["backend_token"] = token
        dpapi.save_secrets(ruta, actuales)
        print(f"[OK] Secretos guardados en {ruta}")

        # Confirmar QUE quedó guardado: antes decía "OK" aunque se hubieran
        # dejado los dos campos vacíos, y el agente arrancaba sin poder leer
        # el reloj sin que nadie se enterara hasta ver el panel en rojo.
        tiene_clave = bool(actuales.get("hikvision_password"))
        tiene_token = bool(actuales.get("backend_token"))
        print(f"     Contraseña del reloj: {'guardada' if tiene_clave else 'FALTA'}")
        print(f"     Token del agente:     {'guardado' if tiene_token else 'no guardado'}")
        if not tiene_clave:
            print()
            print("[AVISO] Sin la contraseña del reloj el agente no puede leer las")
            print("        fichadas. Volvé a correr `hikvision-agent secrets set`.")
        if not tiene_token:
            print("        (El token puede venir en config.toml: eso también sirve.)")
        return 0

    # status
    if not dpapi.puede_leerse(ruta):
        print(f"Archivo: {ruta}")
        print("[FALTA PERMISO] La carpeta es solo para SYSTEM y administradores.")
        print("  Volvé a correr esto desde una terminal abierta como Administrador.")
        return 1

    guardados = dpapi.load_secrets(ruta)
    existe = ruta.exists()
    print(f"Archivo: {ruta} ({'existe' if existe else 'no existe'})")
    print(f"Contraseña del reloj: {'guardada' if guardados.get('hikvision_password') else 'FALTA'}")
    print(f"Token del backend:    {'guardado' if guardados.get('backend_token') else 'FALTA (¿viene en config.toml?)'}")
    return 0


# ------------------------------------------------------------------ config
def cmd_config(args: argparse.Namespace) -> int:
    holder, secrets, ruta = _cargar(args.config)
    _aplicar_cache_remota(holder)
    config = holder.current
    efectiva = {
        "config_local": str(ruta),
        "agent_id": config.agent_id,
        "hikvision": {
            "host": config.device.host,
            "port": config.device.port,
            "username": config.device.username,
            "poll_seconds": config.device.poll_seconds,
            "overlap_seconds": config.device.overlap_seconds,
            "initial_backfill_days": config.device.initial_backfill_days,
            "timezone": config.device.timezone,
            "password": "(guardada)" if secrets.hikvision_password else "(FALTA)",
        },
        "backend": {
            "base_url": config.backend.base_url,
            "sync_seconds": config.backend.sync_seconds,
            "batch_size": config.backend.batch_size,
            "heartbeat_seconds": config.backend.heartbeat_seconds,
            "token": "(guardado)" if secrets.backend_token else "(FALTA)",
        },
        "logging": {"level": config.log_level},
        "config_remota_version": config.remote_version,
    }
    print(json.dumps(efectiva, indent=2, ensure_ascii=False))
    return 0


# -------------------------------------------------------------------- main
def main(argv: list[str] | None = None) -> int:
    # Consolas Windows suelen venir en cp1252: forzamos UTF-8 para los acentos.
    for flujo in (sys.stdout, sys.stderr):
        try:
            flujo.reconfigure(encoding="utf-8")
        except Exception:
            pass

    parser = argparse.ArgumentParser(prog="hikvision-agent", description="Agente de asistencia CelTuc")
    parser.add_argument("--config", type=Path, default=None, help="Ruta a config.toml")
    sub = parser.add_subparsers(dest="comando")

    p_run = sub.add_parser("run", help="Correr el agente (por defecto)")
    p_run.add_argument("--console", action="store_true", help="Loguear también a pantalla")

    p_diag = sub.add_parser("diag", help="Diagnóstico de conexión (spec §12)")
    p_diag.add_argument("--host")
    p_diag.add_argument("--username")
    p_diag.add_argument("--port", type=int)
    p_diag.add_argument("--password")
    p_diag.add_argument("--days", type=int, default=1, help="Días hacia atrás a consultar (def. 1)")
    p_diag.add_argument("--max-events", type=int, default=50)
    p_diag.add_argument("--save-fixture", metavar="RUTA", help="Guardar payload real como fixture JSON")
    p_diag.add_argument("--anonymize", action="store_true", help="Anonimizar nombres en el fixture")

    p_secrets = sub.add_parser("secrets", help="Secretos locales (DPAPI)")
    p_secrets.add_argument("accion", choices=["set", "status"])

    sub.add_parser("config", help="Mostrar configuración efectiva")
    sub.add_parser("version", help="Mostrar versión")

    args = parser.parse_args(argv)
    comando = args.comando or "run"
    if comando == "run" and not hasattr(args, "console"):
        args.console = False

    if comando == "version":
        print(AGENT_VERSION)
        return 0
    if comando == "run":
        return cmd_run(args)
    if comando == "diag":
        return cmd_diag(args)
    if comando == "secrets":
        return cmd_secrets(args)
    if comando == "config":
        return cmd_config(args)
    parser.print_help()
    return 2


if __name__ == "__main__":
    sys.exit(main())
