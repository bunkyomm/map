#!/usr/bin/env python3
"""images/ と audio/ の軽量化（任意）。

- 初回実行時、未加工のオリジナルを originals/images, originals/audio に退避する
  （以後は常に originals/ を元に変換するため、再実行しても画質が劣化しない＝冪等）。
- 画像: 長辺が1200pxを超える場合のみ縮小し、EXIFの向きを反映してから保存する。
  拡張子は維持する（.jpg/.jpeg は品質80で再保存、.webpはwebpのまま再保存）。
- 音声: ffmpeg で 64kbps・モノラルの mp3 に変換する。

使い方:
    python3 tools/optimize_media.py
"""

import shutil
import subprocess
import sys
from pathlib import Path

from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parent.parent
IMAGES_DIR = ROOT / "images"
AUDIO_DIR = ROOT / "audio"
ORIGINALS_IMAGES_DIR = ROOT / "originals" / "images"
ORIGINALS_AUDIO_DIR = ROOT / "originals" / "audio"

MAX_LONG_SIDE = 1200
JPEG_QUALITY = 80
IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".webp"}
AUDIO_BITRATE = "64k"


def ensure_originals_backup():
    if not ORIGINALS_IMAGES_DIR.exists():
        print(f"初回実行: {IMAGES_DIR} を {ORIGINALS_IMAGES_DIR} にバックアップします。")
        shutil.copytree(IMAGES_DIR, ORIGINALS_IMAGES_DIR)
    if not ORIGINALS_AUDIO_DIR.exists():
        print(f"初回実行: {AUDIO_DIR} を {ORIGINALS_AUDIO_DIR} にバックアップします。")
        shutil.copytree(AUDIO_DIR, ORIGINALS_AUDIO_DIR)


def optimize_image(src: Path, dst: Path):
    try:
        with Image.open(src) as im:
            im = ImageOps.exif_transpose(im)
            w, h = im.size
            long_side = max(w, h)
            if long_side > MAX_LONG_SIDE:
                scale = MAX_LONG_SIDE / long_side
                im = im.resize((round(w * scale), round(h * scale)), Image.LANCZOS)

            ext = dst.suffix.lower()
            if ext in (".jpg", ".jpeg"):
                if im.mode != "RGB":
                    im = im.convert("RGB")
                im.save(dst, "JPEG", quality=JPEG_QUALITY, optimize=True)
            elif ext == ".webp":
                im.save(dst, "WEBP", quality=JPEG_QUALITY)
            elif ext == ".png":
                im.save(dst, "PNG", optimize=True)
            else:
                im.save(dst)
        return True
    except Exception as e:
        print(f"  警告: {src.name} の画像変換に失敗しました ({e})", file=sys.stderr)
        return False


def optimize_audio(src: Path, dst: Path):
    tmp = dst.with_suffix(dst.suffix + ".tmp")
    cmd = [
        "ffmpeg", "-y", "-i", str(src),
        "-ac", "1", "-b:a", AUDIO_BITRATE,
        "-f", "mp3", str(tmp),
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        print(f"  警告: {src.name} の音声変換に失敗しました:\n{result.stderr[-500:]}", file=sys.stderr)
        if tmp.exists():
            tmp.unlink()
        return False
    tmp.replace(dst)
    return True


def main():
    if shutil.which("ffmpeg") is None:
        print("エラー: ffmpeg が見つかりません。音声の変換にはffmpegが必要です。", file=sys.stderr)
        sys.exit(1)

    ensure_originals_backup()

    img_ok, img_fail = 0, 0
    for src in sorted(ORIGINALS_IMAGES_DIR.iterdir()):
        if src.suffix.lower() not in IMAGE_EXTS:
            continue
        dst = IMAGES_DIR / src.name
        if optimize_image(src, dst):
            img_ok += 1
        else:
            img_fail += 1

    aud_ok, aud_fail = 0, 0
    for src in sorted(ORIGINALS_AUDIO_DIR.iterdir()):
        if src.suffix.lower() != ".mp3":
            continue
        dst = AUDIO_DIR / src.name
        if optimize_audio(src, dst):
            aud_ok += 1
        else:
            aud_fail += 1

    print(f"\n画像: {img_ok}件 成功 / {img_fail}件 失敗")
    print(f"音声: {aud_ok}件 成功 / {aud_fail}件 失敗")


if __name__ == "__main__":
    main()
