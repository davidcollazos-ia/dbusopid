"""Serve the local Leaflet Infodestinos dashboard and compressed data files."""
from __future__ import annotations

import argparse
import json
import webbrowser
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlsplit


ROOT = Path(__file__).resolve().parent
DATA = ROOT / "Data"
LAYER_NAMES = {"municipios", "provincias", "comarcas"}


class VisorHandler(SimpleHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def do_GET(self) -> None:
        path = unquote(urlsplit(self.path).path)
        if path in {"/", "/visor", "/visor.html", "/mapa"}:
            self.path = "/visor_capas.html"
            return super().do_GET()
        if path in {"/analisis", "/analisis.html"}:
            self.path = "/visor.html"
            return super().do_GET()
        if path == "/api/stats":
            return self._send_file(DATA / "visor_estadisticas.json", "application/json; charset=utf-8")
        if path.startswith("/data/") and path.endswith(".geojson"):
            name = path.removeprefix("/data/").removesuffix(".geojson")
            if name not in LAYER_NAMES:
                return self.send_error(404, "Capa no encontrada")
            compressed = DATA / f"visor_{name}.geojson.gz"
            return self._send_file(compressed, "application/geo+json", encoding="gzip")
        return super().do_GET()

    def _send_file(self, path: Path, content_type: str, encoding: str | None = None) -> None:
        if not path.is_file():
            self.send_error(503, f"Falta {path.name}. Ejecuta primero python build_visor_stats.py")
            return
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(path.stat().st_size))
        self.send_header("Cache-Control", "public, max-age=3600")
        if encoding:
            self.send_header("Content-Encoding", encoding)
            self.send_header("Vary", "Accept-Encoding")
        self.end_headers()
        with path.open("rb") as stream:
            while chunk := stream.read(1024 * 1024):
                self.wfile.write(chunk)

    def log_message(self, format: str, *args) -> None:
        print(f"[{self.log_date_time_string()}] {format % args}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Servidor local del visor geográfico de Infodestinos")
    parser.add_argument("--host", default="127.0.0.1", help="Dirección de escucha (por defecto: 127.0.0.1)")
    parser.add_argument("--port", type=int, default=8000, help="Puerto HTTP (por defecto: 8000)")
    parser.add_argument("--no-browser", action="store_true", help="No abrir el navegador automáticamente")
    args = parser.parse_args()

    stats_path = DATA / "visor_estadisticas.json"
    print("Visor Infodestinos listo")
    if stats_path.exists():
        with stats_path.open(encoding="utf-8") as stream:
            stats = json.load(stream)
        print(f"Estadísticas preparadas: {sum(stats['totals'].values()):,} registros")
    else:
        print("Modo geográfico: las estadísticas todavía no están preparadas")
    print(f"Abre: http://{args.host}:{args.port}/")
    server = ThreadingHTTPServer((args.host, args.port), VisorHandler)
    try:
        if not args.no_browser:
            webbrowser.open(f"http://{args.host}:{args.port}/")
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nDeteniendo el visor…")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
