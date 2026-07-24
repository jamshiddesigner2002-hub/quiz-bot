"""
FastAPI сервер для Mini App — API и статика.
"""

import json
import os
import random
import string
import uuid

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

import database as db

app = FastAPI(title="Quiz Kiss API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
UPLOAD_DIR = os.path.join(BASE_DIR, "uploads")
WEB_DIR = os.path.join(BASE_DIR, "web")
os.makedirs(UPLOAD_DIR, exist_ok=True)

# Статика
app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")
app.mount("/static", StaticFiles(directory=WEB_DIR), name="static")


def generate_code(length: int = 6) -> str:
    return "".join(random.choices(string.ascii_uppercase + string.digits, k=length))


@app.on_event("startup")
async def startup():
    await db.init_db()


# ── API ────────────────────────────────────────────────

@app.post("/api/quiz")
async def create_quiz(
    title: str = Form(...),
    creator_id: int = Form(0),
    punishment_type: str = Form("kiss"),
    custom_emoji: str = Form(""),
    custom_name: str = Form(""),
):
    if not title.strip():
        raise HTTPException(400, "Название не может быть пустым")
    code = generate_code()
    while await db.get_quiz_by_code(code):
        code = generate_code()
    quiz_id = await db.create_quiz(
        title.strip(), creator_id, code, punishment_type, custom_emoji.strip(), custom_name.strip()
    )
    return {"id": quiz_id, "code": code}


@app.post("/api/quiz/{quiz_id}/question")
async def add_question(
    quiz_id: int,
    text: str = Form(...),
    options: str = Form(...),
    correct_index: int = Form(...),
    photo: UploadFile = File(None),
):
    photo_path = None
    if photo and photo.filename:
        ext = os.path.splitext(photo.filename)[1] or ".jpg"
        filename = f"{uuid.uuid4()}{ext}"
        filepath = os.path.join(UPLOAD_DIR, filename)
        content = await photo.read()
        with open(filepath, "wb") as f:
            f.write(content)
        photo_path = f"/uploads/{filename}"

    options_list = json.loads(options)
    if len(options_list) < 2:
        raise HTTPException(400, "Минимум 2 варианта ответа")

    await db.add_question(quiz_id, text.strip(), options_list, correct_index, photo_path)
    q_count = await db.get_question_count(quiz_id)
    return {"ok": True, "question_count": q_count}


@app.get("/api/quiz/{code}")
async def get_quiz(code: str):
    quiz = await db.get_quiz_by_code(code.upper())
    if not quiz:
        raise HTTPException(404, "Тест не найден")
    questions = await db.get_questions(quiz["id"])
    return {
        "id": quiz["id"],
        "title": quiz["title"],
        "code": quiz["code"],
        "creator_id": quiz["creator_id"],
        "punishment_type": quiz.get("punishment_type") or "kiss",
        "custom_emoji": quiz.get("custom_emoji") or "",
        "custom_name": quiz.get("custom_name") or "",
        "questions": [
            {
                "id": q["id"],
                "text": q["text"],
                "photo": q.get("photo_file_id"),
                "options": q["options"],
                "correct_index": q["correct_index"],
            }
            for q in questions
        ],
    }


@app.get("/api/my-quizzes/{creator_id}")
async def my_quizzes(creator_id: int):
    quizzes = await db.get_quizzes_by_creator(creator_id)
    result = []
    for q in quizzes:
        count = await db.get_question_count(q["id"])
        result.append({
            "id": q["id"],
            "title": q["title"],
            "code": q["code"],
            "question_count": count,
        })
    return result


@app.delete("/api/quiz/{quiz_id}")
async def delete_quiz_endpoint(quiz_id: int):
    await db.delete_quiz(quiz_id)
    return {"ok": True}


# ── Health check (для Render и мониторинга) ────────────

@app.get("/health")
async def health():
    return {"status": "ok"}


# ── Фронтенд (catch-all) ──────────────────────────────

@app.get("/")
async def serve_index():
    return FileResponse(os.path.join(WEB_DIR, "index.html"))


@app.get("/{path:path}")
async def serve_spa(path: str):
    # Не перехватываем API и статику
    if path.startswith(("api/", "uploads/", "static/")):
        raise HTTPException(404)
    return FileResponse(os.path.join(WEB_DIR, "index.html"))
