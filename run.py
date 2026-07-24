"""
Запуск бота + веб-сервера.
Автоматически определяет окружение:
  - Render.com → использует RENDER_EXTERNAL_URL
  - Локально   → запускает cloudflared тоннель
"""

import asyncio
import logging
import os
import re
import sys

import uvicorn
from dotenv import load_dotenv

load_dotenv()

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

_cf_process = None


async def start_cloudflared(port: int) -> str | None:
    """Запускает cloudflared тоннель и возвращает HTTPS URL."""
    global _cf_process
    try:
        proc = await asyncio.create_subprocess_exec(
            "cloudflared", "tunnel", "--url", f"http://localhost:{port}",
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        _cf_process = proc
        url = None

        async def read_stream(stream, name):
            nonlocal url
            while True:
                try:
                    line = await asyncio.wait_for(stream.readline(), timeout=3.0)
                except asyncio.TimeoutError:
                    continue
                if not line:
                    break
                text = line.decode("utf-8", errors="ignore").strip()
                if text:
                    logger.info(f"  cloudflared[{name}]: {text}")
                match = re.search(r"(https://[a-z0-9\-]+\.trycloudflare\.com)", text)
                if match and not url:
                    url = match.group(1)

        asyncio.create_task(read_stream(proc.stdout, "out"))
        asyncio.create_task(read_stream(proc.stderr, "err"))

        for _ in range(60):
            if url:
                break
            await asyncio.sleep(0.5)

        if url:
            logger.info(f"🌐 Тоннель: {url}")
        return url
    except FileNotFoundError:
        logger.warning("⚠️ cloudflared не найден.")
        return None
    except Exception as e:
        logger.warning(f"⚠️ Ошибка cloudflared: {e}")
        return None


async def main():
    # ── Определяем окружение ───────────────────────────
    render_url = os.getenv("RENDER_EXTERNAL_URL")
    port = int(os.getenv("PORT", 8080))

    if render_url:
        # На Render — URL уже есть (HTTPS)
        if not render_url.startswith("http://") and not render_url.startswith("https://"):
            render_url = "https://" + render_url
        webapp_url = render_url
        logger.info(f"☁️ Render.com обнаружен: {webapp_url}")
    else:
        # Локально — пробуем cloudflared
        webapp_url = os.getenv("WEBAPP_URL", "")
        if not webapp_url:
            logger.info("🔗 Запускаем cloudflared тоннель...")
            webapp_url = await start_cloudflared(port)

        if not webapp_url:
            logger.error("❌ Не удалось создать HTTPS тоннель.")
            logger.error("   Укажите WEBAPP_URL=https://... в файле .env")
            sys.exit(1)

    os.environ["WEBAPP_URL"] = webapp_url
    logger.info(f"📱 Mini App URL: {webapp_url}")

    # ── Импорты ────────────────────────────────────────
    from bot import dp, bot
    from server import app as web_app
    import database as db

    await db.init_db()

    # Очищаем старые вебхуки для стабильного отклика бота
    try:
        await bot.delete_webhook(drop_pending_updates=True)
    except Exception as e:
        logger.warning(f"delete_webhook error: {e}")

    # ── Запуск ─────────────────────────────────────────
    config = uvicorn.Config(
        web_app,
        host="0.0.0.0",
        port=port,
        log_level="info",
    )
    server = uvicorn.Server(config)

    logger.info(f"🚀 Запуск на порту {port}...")

    try:
        await asyncio.gather(
            server.serve(),
            dp.start_polling(bot),
        )
    finally:
        if _cf_process:
            _cf_process.terminate()


if __name__ == "__main__":
    asyncio.run(main())
