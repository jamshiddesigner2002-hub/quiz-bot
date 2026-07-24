import aiosqlite
import json
import os

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "quizzes.db")


async def init_db():
    """Создаёт таблицы если их нет."""
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute("""
            CREATE TABLE IF NOT EXISTS quizzes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                creator_id INTEGER NOT NULL,
                code TEXT UNIQUE NOT NULL,
                punishment_type TEXT DEFAULT 'kiss',
                custom_emoji TEXT,
                custom_name TEXT
            )
        """)
        # Безопасно добавляем новые колонки если база уже существовала
        for col in [("punishment_type", "TEXT DEFAULT 'kiss'"), ("custom_emoji", "TEXT"), ("custom_name", "TEXT")]:
            try:
                await db.execute(f"ALTER TABLE quizzes ADD COLUMN {col[0]} {col[1]}")
            except Exception:
                pass  # Колонка уже есть

        await db.execute("""
            CREATE TABLE IF NOT EXISTS questions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                quiz_id INTEGER NOT NULL,
                text TEXT NOT NULL,
                photo_file_id TEXT,
                options TEXT NOT NULL,
                correct_index INTEGER NOT NULL,
                FOREIGN KEY (quiz_id) REFERENCES quizzes(id) ON DELETE CASCADE
            )
        """)
        await db.execute("""
            CREATE TABLE IF NOT EXISTS sessions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                quiz_id INTEGER NOT NULL,
                user_id INTEGER NOT NULL,
                current_question INTEGER DEFAULT 0,
                wrong_count INTEGER DEFAULT 0,
                total_kisses INTEGER DEFAULT 0,
                completed INTEGER DEFAULT 0,
                FOREIGN KEY (quiz_id) REFERENCES quizzes(id)
            )
        """)
        await db.commit()


# ── Тесты ──────────────────────────────────────────────

async def create_quiz(
    title: str,
    creator_id: int,
    code: str,
    punishment_type: str = "kiss",
    custom_emoji: str = "",
    custom_name: str = "",
) -> int:
    """Создаёт тест и возвращает его id."""
    async with aiosqlite.connect(DB_PATH) as db:
        cursor = await db.execute(
            "INSERT INTO quizzes (title, creator_id, code, punishment_type, custom_emoji, custom_name) VALUES (?, ?, ?, ?, ?, ?)",
            (title, creator_id, code, punishment_type, custom_emoji, custom_name),
        )
        await db.commit()
        return cursor.lastrowid


async def add_question(
    quiz_id: int,
    text: str,
    options: list[str],
    correct_index: int,
    photo_file_id: str | None = None,
) -> int:
    """Добавляет вопрос к тесту."""
    async with aiosqlite.connect(DB_PATH) as db:
        cursor = await db.execute(
            "INSERT INTO questions (quiz_id, text, photo_file_id, options, correct_index) "
            "VALUES (?, ?, ?, ?, ?)",
            (quiz_id, text, photo_file_id, json.dumps(options, ensure_ascii=False), correct_index),
        )
        await db.commit()
        return cursor.lastrowid


async def get_quiz_by_code(code: str) -> dict | None:
    """Находит тест по коду."""
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute("SELECT * FROM quizzes WHERE code = ?", (code,))
        row = await cursor.fetchone()
        if row:
            return dict(row)
        return None


async def get_questions(quiz_id: int) -> list[dict]:
    """Возвращает все вопросы теста."""
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute(
            "SELECT * FROM questions WHERE quiz_id = ? ORDER BY id", (quiz_id,)
        )
        rows = await cursor.fetchall()
        result = []
        for row in rows:
            d = dict(row)
            d["options"] = json.loads(d["options"])
            result.append(d)
        return result


async def get_quizzes_by_creator(creator_id: int) -> list[dict]:
    """Возвращает все тесты пользователя."""
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute(
            "SELECT * FROM quizzes WHERE creator_id = ? ORDER BY id DESC", (creator_id,)
        )
        rows = await cursor.fetchall()
        return [dict(r) for r in rows]


async def delete_quiz(quiz_id: int):
    """Удаляет тест и его вопросы."""
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute("DELETE FROM questions WHERE quiz_id = ?", (quiz_id,))
        await db.execute("DELETE FROM sessions WHERE quiz_id = ?", (quiz_id,))
        await db.execute("DELETE FROM quizzes WHERE id = ?", (quiz_id,))
        await db.commit()


async def get_question_count(quiz_id: int) -> int:
    """Возвращает количество вопросов в тесте."""
    async with aiosqlite.connect(DB_PATH) as db:
        cursor = await db.execute(
            "SELECT COUNT(*) FROM questions WHERE quiz_id = ?", (quiz_id,)
        )
        row = await cursor.fetchone()
        return row[0]


# ── Сессии прохождения ─────────────────────────────────

async def create_session(quiz_id: int, user_id: int) -> int:
    """Создаёт сессию прохождения теста."""
    async with aiosqlite.connect(DB_PATH) as db:
        # Удаляем старую незавершённую сессию если есть
        await db.execute(
            "DELETE FROM sessions WHERE quiz_id = ? AND user_id = ? AND completed = 0",
            (quiz_id, user_id),
        )
        cursor = await db.execute(
            "INSERT INTO sessions (quiz_id, user_id) VALUES (?, ?)",
            (quiz_id, user_id),
        )
        await db.commit()
        return cursor.lastrowid


async def get_session(session_id: int) -> dict | None:
    """Возвращает сессию по id."""
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute("SELECT * FROM sessions WHERE id = ?", (session_id,))
        row = await cursor.fetchone()
        if row:
            return dict(row)
        return None


async def update_session(session_id: int, **kwargs):
    """Обновляет поля сессии."""
    async with aiosqlite.connect(DB_PATH) as db:
        sets = ", ".join(f"{k} = ?" for k in kwargs)
        values = list(kwargs.values()) + [session_id]
        await db.execute(f"UPDATE sessions SET {sets} WHERE id = ?", values)
        await db.commit()
