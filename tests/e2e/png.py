"""A small PNG codec for the screenshot tests: 8-bit RGB and RGBA, non-interlaced, every filter type.
Decoding is enough to compare two screenshots; encoding writes the difference image."""
from __future__ import annotations

import struct
import zlib

SIGNATURE = b"\x89PNG\r\n\x1a\n"


def decode(data: bytes) -> tuple[int, int, int, bytearray]:
    """(width, height, channels, pixels) with pixels row-major, `channels` bytes per pixel."""
    if data[:8] != SIGNATURE:
        raise ValueError("not a PNG")
    pos = 8
    width = height = depth = ctype = 0
    idat = bytearray()
    while pos < len(data):
        length, kind = struct.unpack(">I4s", data[pos:pos + 8])
        body = data[pos + 8:pos + 8 + length]
        pos += 12 + length
        if kind == b"IHDR":
            width, height, depth, ctype, _, _, interlace = struct.unpack(">IIBBBBB", body)
            if depth != 8 or ctype not in (2, 6) or interlace:
                raise ValueError(f"unsupported PNG: depth {depth}, colour type {ctype}, interlace {interlace}")
        elif kind == b"IDAT":
            idat += body
        elif kind == b"IEND":
            break
    ch = 3 if ctype == 2 else 4
    raw = zlib.decompress(bytes(idat))
    stride = width * ch
    out = bytearray(height * stride)
    prev = bytearray(stride)
    for y in range(height):
        f = raw[y * (stride + 1)]
        line = bytearray(raw[y * (stride + 1) + 1:(y + 1) * (stride + 1)])
        for x in range(stride):
            a = line[x - ch] if x >= ch else 0
            b = prev[x]
            c = prev[x - ch] if x >= ch else 0
            if f == 1:
                line[x] = (line[x] + a) & 255
            elif f == 2:
                line[x] = (line[x] + b) & 255
            elif f == 3:
                line[x] = (line[x] + ((a + b) >> 1)) & 255
            elif f == 4:
                p = a + b - c
                pa, pb, pc = abs(p - a), abs(p - b), abs(p - c)
                line[x] = (line[x] + (a if pa <= pb and pa <= pc else b if pb <= pc else c)) & 255
        out[y * stride:(y + 1) * stride] = line
        prev = line
    return width, height, ch, out


def encode(width: int, height: int, channels: int, pixels: bytes) -> bytes:
    """A PNG of 8-bit RGB (3) or RGBA (4) pixels, filter 0 on every row."""
    stride = width * channels
    raw = b"".join(b"\x00" + bytes(pixels[y * stride:(y + 1) * stride]) for y in range(height))

    def chunk(kind: bytes, body: bytes) -> bytes:
        return struct.pack(">I", len(body)) + kind + body + struct.pack(">I", zlib.crc32(kind + body) & 0xFFFFFFFF)

    ihdr = struct.pack(">IIBBBBB", width, height, 8, 2 if channels == 3 else 6, 0, 0, 0)
    return SIGNATURE + chunk(b"IHDR", ihdr) + chunk(b"IDAT", zlib.compress(raw, 6)) + chunk(b"IEND", b"")


def compare(a: bytes, b: bytes, threshold: int = 24) -> tuple[float, bytes]:
    """The fraction of pixels whose largest channel difference exceeds `threshold`, and a difference
    image (differing pixels in red on the faded golden)."""
    wa, ha, ca, pa = decode(a)
    wb, hb, cb, pb = decode(b)
    if (wa, ha) != (wb, hb):
        raise ValueError(f"sizes differ: {wa}x{ha} vs {wb}x{hb}")
    diff = bytearray(wa * ha * 3)
    bad = 0
    for k in range(wa * ha):
        da = max(abs(pa[k * ca + c] - pb[k * cb + c]) for c in range(3))
        if da > threshold:
            bad += 1
            diff[3 * k:3 * k + 3] = b"\xff\x00\x00"
        else:
            g = (pa[k * ca] + pa[k * ca + 1] + pa[k * ca + 2]) // 3
            v = 128 + g // 2
            diff[3 * k:3 * k + 3] = bytes((v, v, v))
    return bad / (wa * ha), encode(wa, ha, 3, diff)
