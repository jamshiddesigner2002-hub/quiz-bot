"""
Telegram-бот (Mini App версия).
Открывает веб-приложение через WebApp кнопки.
"""

import logging
import os

from dotenv import load_dotenv

from aiogram import Bot, Dispatcher, Router
from aiogram.filters import Command
from aiogram.types import (
    InlineKeyboardButton,
    InlineKeyboardMarkup,
    Message,
    WebAppInfo,
)

import database as db

load_dotenv()

BOT_TOKEN = os.getenv("BOT_TOKEN")
if not BOT_TOKEN:
    raise ValueError("❌ Установите BOT_TOKEN в файле .env")

bot = Bot(token=BOT_TOKEN)
dp = Dispatcher()
router = Router()
dp.include_router(router)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def get_webapp_url() -> str:
    """Берёт URL из переменной окружения (устанавливается в run.py через ngrok)."""
    return os.environ.get("WEBAPP_URL", os.getenv("WEBAPP_URL", "http://localhost:8080"))


@router.message(Command("start"))
async def cmd_start(message: Message):
    if message.from_user:
        await db.register_user(message.from_user.id)

    webapp_url = get_webapp_url()
    args = message.text.split()

    # Deep link — прохождение теста по ссылке
    if len(args) > 1:
        code = args[1].upper()
        quiz = await db.get_quiz_by_code(code)
        if quiz:
            q_count = await db.get_question_count(quiz["id"])
            kb = InlineKeyboardMarkup(inline_keyboard=[
                [InlineKeyboardButton(
                    text="🎯 Начать тест",
                    web_app=WebAppInfo(url=f"{webapp_url}?mode=take&code={code}"),
                )],
            ])
            await message.answer(
                f"🎯 Тест: <b>{quiz['title']}</b>\n"
                f"📊 Вопросов: {q_count}\n\n"
                f"Нажмите кнопку, чтобы начать! 💋",
                parse_mode="HTML",
                reply_markup=kb,
            )
            return

    # Главное меню
    kb = InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(
            text="📝 Создать тест",
            web_app=WebAppInfo(url=f"{webapp_url}?mode=create"),
        )],
        [InlineKeyboardButton(
            text="🎯 Пройти тест",
            web_app=WebAppInfo(url=f"{webapp_url}?mode=take"),
        )],
        [InlineKeyboardButton(
            text="📋 Мои тесты",
            web_app=WebAppInfo(url=f"{webapp_url}?mode=my"),
        )],
    ])

    await message.answer(
        "👋 Привет! Я бот для создания тестов!\n\n"
        "📝 <b>Создай тест</b> с фото и вариантами\n"
        "🎯 <b>Пройди тест</b> друга по коду\n"
        "💋 Выбирай или создавай свои наказания за ошибки!\n\n"
        "Выбери действие 👇",
        parse_mode="HTML",
        reply_markup=kb,
    )


@router.message(Command("broadcast"))
async def cmd_broadcast(message: Message):
    text = message.text.replace("/broadcast", "").strip()
    if not text:
        text = (
            "🎉 <b>ОБНОВЛЕНИЕ БОТА!</b>\n\n"
            "✨ В боте появились новые супер-функции:\n"
            "• Выбирай готовые наказания (Поцелуи 💋, Обнимашки 🫂, В щёчку 😚, На руки 👩‍❤️‍👨)\n"
            "• Создавай <b>СВОЙ ВАРИАНТ</b> со своим эмодзи и названием!\n\n"
            "Нажми «📝 Создать тест» чтобы попробовать! 👇"
        )

    users = await db.get_all_user_ids()
    webapp_url = get_webapp_url()
    kb = InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(
            text="📝 Создать тест",
            web_app=WebAppInfo(url=f"{webapp_url}?mode=create"),
        )],
    ])

    sent = 0
    for uid in users:
        try:
            await bot.send_message(uid, text, parse_mode="HTML", reply_markup=kb)
            sent += 1
        except Exception:
            pass

    await message.answer(f"📢 Уведомления об обновлении отправлены ({sent} пользователей)!")


async def start_bot():
    """Запуск поллинга бота."""
    await db.init_db()
    logger.info("🤖 Бот запущен!")
    await dp.start_polling(bot)
