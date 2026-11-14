"""Leitura de um ZIP remoto por requisições HTTP parciais (Range).

Os ZIPs anuais do FIRMS trazem um CSV por país. Como o servidor aceita `Range`,
dá para ler o índice do ZIP e baixar só o CSV do Brasil, sem trazer o arquivo
inteiro (centenas de MB) para o disco.
"""

from __future__ import annotations

import io
import time
import zipfile

import requests


class HttpRangeFile(io.RawIOBase):
    """Arquivo somente leitura e posicionável sobre uma URL que aceita Range."""

    def __init__(self, url: str, session: requests.Session | None = None,
                 timeout: float = 120, max_retries: int = 5, backoff_s: float = 2.0):
        self.url = url
        self.session = session or requests.Session()
        self.timeout = timeout
        self.max_retries = max_retries
        self.backoff_s = backoff_s
        self.bytes_fetched = 0
        head = self.session.head(url, timeout=timeout, allow_redirects=True)
        head.raise_for_status()
        if head.headers.get("accept-ranges", "").lower() != "bytes":
            raise RuntimeError(f"servidor não aceita Range: {url}")
        self.size = int(head.headers["content-length"])
        self.pos = 0

    def readable(self) -> bool:
        return True

    def seekable(self) -> bool:
        return True

    def tell(self) -> int:
        return self.pos

    def seek(self, offset: int, whence: int = io.SEEK_SET) -> int:
        if whence == io.SEEK_SET:
            self.pos = offset
        elif whence == io.SEEK_CUR:
            self.pos += offset
        elif whence == io.SEEK_END:
            self.pos = self.size + offset
        return self.pos

    def readinto(self, buf) -> int:
        if self.pos >= self.size:
            return 0
        end = min(self.pos + len(buf), self.size) - 1
        data = self._get(self.pos, end)
        buf[: len(data)] = data
        self.pos += len(data)
        return len(data)

    def _get(self, start: int, end: int) -> bytes:
        for attempt in range(self.max_retries):
            try:
                r = self.session.get(self.url, headers={"Range": f"bytes={start}-{end}"},
                                     timeout=self.timeout)
                if r.status_code == 206 and len(r.content) == end - start + 1:
                    self.bytes_fetched += len(r.content)
                    return r.content
                err = f"http {r.status_code}, {len(r.content)} bytes"
            except requests.RequestException as e:
                err = type(e).__name__
            time.sleep(self.backoff_s * 2 ** attempt)
        raise RuntimeError(f"falha ao ler bytes {start}-{end} de {self.url}: {err}")


def open_remote_zip(url: str, buffer_mb: int = 4, **kw) -> tuple[zipfile.ZipFile, HttpRangeFile]:
    """Abre o ZIP remoto; devolve o ZipFile e o arquivo bruto (para medir bytes baixados)."""
    raw = HttpRangeFile(url, **kw)
    return zipfile.ZipFile(io.BufferedReader(raw, buffer_size=buffer_mb * 1024 * 1024)), raw
