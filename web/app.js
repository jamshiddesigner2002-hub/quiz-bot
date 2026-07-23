/* ═══════════════════════════════════════════════════════
   Quiz Kiss 💋 — Mini App Logic
   ═══════════════════════════════════════════════════════ */

// ── Telegram WebApp ──
const tg = window.Telegram?.WebApp;
let tgUser = null;

if (tg) {
    tg.ready();
    tg.expand();
    tgUser = tg.initDataUnsafe?.user || null;
}

// ── State ──
let currentQuizId = null;
let currentQuizCode = null;
let currentQuizTitle = null;
let questionNumber = 0;
let correctIndex = -1;

// Quiz play state
let playQuiz = null;
let playQuestions = [];
let playCurrent = 0;
let playWrongCount = 0;
let playTotalKisses = 0;
let playAnswered = false;
let playPunishmentType = "kiss";
let selectedPunishmentType = "kiss";

const PUNISHMENTS = {
    kiss: {
        icon: "💋",
        name: "поцелуй",
        emojis: ["💋", "😘", "💕"],
        plural: (n) => pluralizeWord(n, "поцелуйчик", "поцелуйчика", "поцелуйчиков"),
        phrase: (n) => `Ты должен(а) ${n} ${pluralizeWord(n, "поцелуйчик", "поцелуйчика", "поцелуйчиков")}! 😘`
    },
    hug: {
        icon: "🫂",
        name: "обнимашка",
        emojis: ["🫂", "🤗", "💖"],
        plural: (n) => pluralizeWord(n, "обнимашку", "обнимашки", "обнимашек"),
        phrase: (n) => `Ты должен(а) ${n} ${pluralizeWord(n, "обнимашку", "обнимашки", "обнимашек")}! 🫂`
    },
    cheek: {
        icon: "😚",
        name: "поцелуй в щёчку",
        emojis: ["😚", "😽", "💖"],
        plural: (n) => pluralizeWord(n, "поцелуй в щёчку", "поцелуя в щёчку", "поцелуев в щёчку"),
        phrase: (n) => `Ты должен(а) ${n} ${pluralizeWord(n, "поцелуй в щёчку", "поцелуя в щёчку", "поцелуев в щёчку")}! 😚`
    },
    lift: {
        icon: "💑",
        name: "поднять на руки",
        emojis: ["💑", "👩‍❤️‍👨", "✨"],
        plural: (n) => pluralizeWord(n, "поднятие на руки", "поднятия на руки", "поднятий на руки"),
        phrase: (n) => `Ты должен(а) поднять на руки ${n} ${pluralizeWord(n, "раз", "раза", "раз")}! 💑`
    }
};

function getPunishment(type) {
    return PUNISHMENTS[type] || PUNISHMENTS.kiss;
}

function selectPunishment(el) {
    document.querySelectorAll(".punishment-card").forEach(c => c.classList.remove("selected"));
    el.classList.add("selected");
    selectedPunishmentType = el.dataset.type || "kiss";
}

// ── SVG gradient for result circle ──
(function addSvgDefs() {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("width", "0");
    svg.setAttribute("height", "0");
    svg.style.position = "absolute";
    svg.innerHTML = `
        <defs>
            <linearGradient id="resultGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stop-color="#667eea"/>
                <stop offset="100%" stop-color="#ff6b9d"/>
            </linearGradient>
        </defs>`;
    document.body.appendChild(svg);
})();

// ── Init based on URL params ──
(function init() {
    const params = new URLSearchParams(window.location.search);
    const mode = params.get("mode");
    const code = params.get("code");

    if (mode === "create") {
        showScreen("create");
    } else if (mode === "take" && code) {
        loadQuizByCode(code);
    } else if (mode === "take") {
        showScreen("code");
    } else if (mode === "my") {
        loadMyQuizzes();
    }
    // else: show home (default)
})();

// ═══════════════════════════════════════════════════════
//  SCREEN NAVIGATION
// ═══════════════════════════════════════════════════════

function showScreen(id) {
    const screens = document.querySelectorAll(".screen");
    const target = document.getElementById("screen-" + id);
    if (!target) return;

    screens.forEach(s => {
        if (s.classList.contains("active")) {
            s.classList.remove("active");
            s.classList.add("exit");
            setTimeout(() => s.classList.remove("exit"), 350);
        }
    });

    setTimeout(() => {
        target.classList.add("active");
    }, 50);
}

function showLoading(text = "Загрузка...") {
    document.getElementById("loader-text").textContent = text;
    showScreen("loading");
}

// ═══════════════════════════════════════════════════════
//  CREATE QUIZ
// ═══════════════════════════════════════════════════════

async function createQuiz() {
    const titleEl = document.getElementById("quiz-title");
    const title = titleEl.value.trim();
    if (!title) {
        titleEl.focus();
        shakeElement(titleEl);
        return;
    }

    showLoading("Создаём тест...");

    try {
        const form = new FormData();
        form.append("title", title);
        form.append("creator_id", tgUser?.id || 0);
        form.append("punishment_type", selectedPunishmentType);

        const res = await fetch("/api/quiz", { method: "POST", body: form });
        const data = await res.json();

        currentQuizId = data.id;
        currentQuizCode = data.code;
        currentQuizTitle = title;
        questionNumber = 0;

        resetQuestionForm();
        showScreen("questions");
    } catch (e) {
        showToast("Ошибка: " + e.message);
        showScreen("create");
    }
}

function resetQuestionForm() {
    questionNumber++;
    document.getElementById("q-number").textContent = questionNumber;
    document.getElementById("q-text").value = "";

    // Reset photo
    document.getElementById("q-photo").value = "";
    document.getElementById("photo-preview").hidden = true;
    document.getElementById("upload-placeholder").hidden = false;
    document.getElementById("remove-photo-btn").hidden = true;

    // Reset options
    correctIndex = -1;
    const container = document.getElementById("options-container");
    container.innerHTML = "";
    addOptionRow("Вариант 1");
    addOptionRow("Вариант 2");
}

function addOptionRow(placeholder = "") {
    const container = document.getElementById("options-container");
    const idx = container.children.length;

    const row = document.createElement("div");
    row.className = "option-input-row";

    row.innerHTML = `
        <input type="text" class="input option-input" placeholder="${placeholder || 'Вариант ' + (idx + 1)}">
        <button class="radio-btn" data-index="${idx}" onclick="selectCorrect(this)"></button>
        ${idx >= 2 ? '<button class="remove-option-btn" onclick="removeOption(this)">✕</button>' : ''}
    `;

    container.appendChild(row);
}

function addOption() {
    const container = document.getElementById("options-container");
    if (container.children.length >= 8) {
        showToast("Максимум 8 вариантов");
        return;
    }
    addOptionRow();
}

function removeOption(btn) {
    const row = btn.closest(".option-input-row");
    row.remove();
    reindexOptions();
}

function reindexOptions() {
    const container = document.getElementById("options-container");
    const rows = container.querySelectorAll(".option-input-row");
    correctIndex = -1;
    rows.forEach((row, i) => {
        const radio = row.querySelector(".radio-btn");
        radio.dataset.index = i;
        radio.classList.remove("selected");
        const input = row.querySelector(".option-input");
        input.placeholder = "Вариант " + (i + 1);
    });
}

function selectCorrect(btn) {
    document.querySelectorAll(".radio-btn").forEach(b => b.classList.remove("selected"));
    btn.classList.add("selected");
    correctIndex = parseInt(btn.dataset.index);
}

// ── Photo handling ──

document.getElementById("q-photo").addEventListener("change", function (e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function (ev) {
        const preview = document.getElementById("photo-preview");
        preview.src = ev.target.result;
        preview.hidden = false;
        document.getElementById("upload-placeholder").hidden = true;
        document.getElementById("remove-photo-btn").hidden = false;
    };
    reader.readAsDataURL(file);
});

function removePhoto(e) {
    e.stopPropagation();
    document.getElementById("q-photo").value = "";
    document.getElementById("photo-preview").hidden = true;
    document.getElementById("upload-placeholder").hidden = false;
    document.getElementById("remove-photo-btn").hidden = true;
}

// ── Save question ──

async function saveQuestion() {
    const text = document.getElementById("q-text").value.trim();
    if (!text) {
        shakeElement(document.getElementById("q-text"));
        return false;
    }

    const container = document.getElementById("options-container");
    const inputs = container.querySelectorAll(".option-input");
    const options = [];
    for (const inp of inputs) {
        const val = inp.value.trim();
        if (!val) {
            shakeElement(inp);
            return false;
        }
        options.push(val);
    }

    if (options.length < 2) {
        showToast("Минимум 2 варианта");
        return false;
    }

    if (correctIndex < 0 || correctIndex >= options.length) {
        showToast("Выберите правильный ответ ●");
        return false;
    }

    const form = new FormData();
    form.append("text", text);
    form.append("options", JSON.stringify(options));
    form.append("correct_index", correctIndex);

    const photoInput = document.getElementById("q-photo");
    if (photoInput.files[0]) {
        form.append("photo", photoInput.files[0]);
    }

    try {
        const res = await fetch(`/api/quiz/${currentQuizId}/question`, {
            method: "POST",
            body: form,
        });
        const data = await res.json();
        return true;
    } catch (e) {
        showToast("Ошибка сохранения: " + e.message);
        return false;
    }
}

async function saveAndAddMore() {
    const ok = await saveQuestion();
    if (ok) {
        resetQuestionForm();
        window.scrollTo(0, 0);
        showToast("✅ Вопрос " + (questionNumber - 1) + " сохранён");
    }
}

async function saveAndFinish() {
    showLoading("Сохраняем...");
    const ok = await saveQuestion();
    if (ok) {
        // Show created screen
        document.getElementById("created-code").textContent = currentQuizCode;
        document.getElementById("created-quiz-title").textContent = currentQuizTitle;

        const botUsername = tg?.initDataUnsafe?.bot?.username;
        let link;
        if (botUsername) {
            link = `https://t.me/${botUsername}?start=${currentQuizCode}`;
        } else {
            link = `${window.location.origin}?mode=take&code=${currentQuizCode}`;
        }
        document.getElementById("share-link").value = link;

        showScreen("created");
    } else {
        showScreen("questions");
    }
}

function confirmBack() {
    if (questionNumber > 1 || document.getElementById("q-text").value.trim()) {
        if (confirm("Вы уверены? Несохранённый вопрос будет потерян.")) {
            showScreen("home");
        }
    } else {
        showScreen("home");
    }
}

// ═══════════════════════════════════════════════════════
//  SHARE
// ═══════════════════════════════════════════════════════

function copyLink() {
    const link = document.getElementById("share-link").value;
    navigator.clipboard.writeText(link).then(() => {
        showToast("📋 Ссылка скопирована!");
    }).catch(() => {
        // Fallback
        const inp = document.getElementById("share-link");
        inp.select();
        document.execCommand("copy");
        showToast("📋 Скопировано!");
    });
}

function shareQuiz() {
    const link = document.getElementById("share-link").value;
    const text = `🎯 Пройди мой тест "${currentQuizTitle}"!\n💋 За ошибки — поцелуйчики!\n\n${link}`;

    if (tg) {
        // Use Telegram share
        tg.openTelegramLink(`https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent('🎯 Пройди мой тест "' + currentQuizTitle + '"!\n💋 За ошибки — поцелуйчики!')}`);
    } else if (navigator.share) {
        navigator.share({ title: "Quiz Kiss 💋", text: text, url: link });
    } else {
        copyLink();
    }
}

// ═══════════════════════════════════════════════════════
//  TAKE QUIZ
// ═══════════════════════════════════════════════════════

async function loadQuiz() {
    const codeEl = document.getElementById("quiz-code");
    const code = codeEl.value.trim().toUpperCase();
    if (!code) {
        shakeElement(codeEl);
        return;
    }
    await loadQuizByCode(code);
}

async function loadQuizByCode(code) {
    showLoading("Загружаем тест...");

    try {
        const res = await fetch(`/api/quiz/${code}`);
        if (!res.ok) {
            showToast("❌ Тест не найден");
            showScreen("code");
            return;
        }
        const data = await res.json();

        playQuiz = data;
        playQuestions = data.questions;
        playPunishmentType = data.punishment_type || "kiss";
        playCurrent = 0;
        playWrongCount = 0;
        playTotalKisses = 0;
        playAnswered = false;

        showScreen("play");
        renderQuestion();
    } catch (e) {
        showToast("Ошибка: " + e.message);
        showScreen("code");
    }
}

function renderQuestion() {
    if (playCurrent >= playQuestions.length) {
        showResults();
        return;
    }

    const q = playQuestions[playCurrent];
    const total = playQuestions.length;

    // Progress
    const pct = (playCurrent / total) * 100;
    const pConfig = getPunishment(playPunishmentType);
    document.getElementById("progress-fill").style.width = pct + "%";
    document.getElementById("play-counter").textContent = `${playCurrent + 1} / ${total}`;
    const kissBadge = document.querySelector(".kiss-badge");
    if (kissBadge) {
        kissBadge.innerHTML = `${pConfig.icon} <span id="kiss-count">${playTotalKisses}</span>`;
    }

    // Question
    const photoEl = document.getElementById("play-photo");
    if (q.photo) {
        photoEl.src = q.photo;
        photoEl.hidden = false;
    } else {
        photoEl.hidden = true;
    }
    document.getElementById("question-text").textContent = q.text;

    // Options
    const optionsEl = document.getElementById("play-options");
    optionsEl.innerHTML = "";
    playAnswered = false;

    q.options.forEach((opt, i) => {
        const btn = document.createElement("button");
        btn.className = "option-btn";
        btn.textContent = opt;
        btn.onclick = () => handleAnswer(i);
        optionsEl.appendChild(btn);
    });

    // Reset card
    const card = document.getElementById("question-card");
    card.classList.remove("shake", "correct-flash");
}

function handleAnswer(selectedIndex) {
    if (playAnswered) return;

    const q = playQuestions[playCurrent];
    const isCorrect = selectedIndex === q.correct_index;
    const optionBtns = document.querySelectorAll("#play-options .option-btn");
    const card = document.getElementById("question-card");

    if (isCorrect) {
        // Правильно — блокируем всё и переходим дальше
        playAnswered = true;
        optionBtns.forEach(b => b.classList.add("disabled"));
        optionBtns[selectedIndex].classList.add("selected-correct");
        card.classList.add("correct-flash");
        showAnswerOverlay(true, q, 0);
    } else {
        // Неправильно — блокируем только этот вариант, остаёмся на вопросе
        playWrongCount++;
        const kissesAdded = factorial(playWrongCount);
        playTotalKisses += kissesAdded;

        // Выключаем только выбранный неправильный вариант
        optionBtns[selectedIndex].classList.add("selected-wrong");
        optionBtns[selectedIndex].classList.add("disabled");
        card.classList.add("shake");

        // Kiss animation
        createKissRain(kissesAdded, pConfig.emojis);

        // Update counter
        document.getElementById("kiss-count").textContent = playTotalKisses;

        showAnswerOverlay(false, q, kissesAdded);

        // Убираем shake после анимации
        setTimeout(() => card.classList.remove("shake"), 500);
    }
}

function showAnswerOverlay(isCorrect, question, kissesAdded) {
    const overlay = document.getElementById("answer-overlay");
    const content = document.getElementById("overlay-content");

    if (isCorrect) {
        content.innerHTML = `
            <span class="overlay-emoji">✅</span>
            <p class="overlay-title" style="color: var(--success)">Правильно!</p>
            <p class="overlay-subtitle">${question.options[question.correct_index]}</p>
        `;
    } else {
        const pConfig = getPunishment(playPunishmentType);
        content.innerHTML = `
            <span class="overlay-emoji">❌</span>
            <p class="overlay-title" style="color: var(--error)">Неправильно!</p>
            <p class="overlay-subtitle">Попробуй ещё раз! 🤔</p>
            <p class="overlay-kisses">${pConfig.icon} +${kissesAdded} ${pConfig.plural(kissesAdded)}</p>
            <p class="overlay-subtitle">Всего: ${playTotalKisses} ${pConfig.icon}</p>
        `;
    }

    overlay.hidden = false;

    if (isCorrect) {
        // Правильно — через паузу переходим к следующему вопросу
        setTimeout(() => {
            overlay.hidden = true;
            playCurrent++;
            renderQuestion();
        }, 1200);
    } else {
        // Неправильно — просто закрываем оверлей, остаёмся на вопросе
        setTimeout(() => {
            overlay.hidden = true;
        }, 1500);
    }
}

// ═══════════════════════════════════════════════════════
//  RESULTS
// ═══════════════════════════════════════════════════════

function showResults() {
    const total = playQuestions.length;
    const correct = total - playWrongCount;
    const pct = total > 0 ? correct / total : 0;

    // Progress bar to 100%
    document.getElementById("progress-fill").style.width = "100%";

    showScreen("results");

    // Animate score
    document.getElementById("result-score").textContent = correct;
    document.getElementById("result-total").textContent = "/ " + total;
    document.getElementById("result-correct").textContent = correct;
    document.getElementById("result-wrong").textContent = playWrongCount;

    // Circle animation
    const circle = document.getElementById("result-circle");
    const circumference = 2 * Math.PI * 52; // r=52
    const offset = circumference * (1 - pct);
    setTimeout(() => {
        circle.style.strokeDashoffset = offset;
    }, 200);

    // Title
    const titleEl = document.getElementById("result-title");
    if (pct === 1) titleEl.textContent = "🏆 Идеально!";
    else if (pct >= 0.7) titleEl.textContent = "👍 Отлично!";
    else if (pct >= 0.5) titleEl.textContent = "😐 Неплохо";
    else titleEl.textContent = "😅 Можно лучше!";

    // Kisses / Punishment Result
    const kissCard = document.getElementById("kiss-result-card");
    const pConfig = getPunishment(playPunishmentType);
    if (playWrongCount > 0) {
        kissCard.hidden = false;
        const iconEl = document.querySelector(".kiss-big-icon");
        if (iconEl) iconEl.textContent = pConfig.icon;
        document.getElementById("result-kisses").textContent = playTotalKisses;
        document.getElementById("kiss-result-text").textContent = pConfig.phrase(playTotalKisses);

        // Kiss rain celebration
        setTimeout(() => createKissRain(Math.min(playTotalKisses, 30), pConfig.emojis), 800);
    } else {
        kissCard.hidden = true;
    }
}

// ═══════════════════════════════════════════════════════
//  MY QUIZZES
// ═══════════════════════════════════════════════════════

async function loadMyQuizzes() {
    showLoading("Загрузка...");

    const creatorId = tgUser?.id || 0;
    try {
        const res = await fetch(`/api/my-quizzes/${creatorId}`);
        const quizzes = await res.json();
        renderMyQuizzes(quizzes);
        showScreen("my");
    } catch (e) {
        showToast("Ошибка: " + e.message);
        showScreen("home");
    }
}

function renderMyQuizzes(quizzes) {
    const list = document.getElementById("my-quizzes-list");

    if (!quizzes.length) {
        list.innerHTML = `
            <div class="empty-state">
                <span class="empty-state-emoji">📋</span>
                <p>У вас пока нет тестов.<br>Создайте первый!</p>
            </div>
        `;
        return;
    }

    list.innerHTML = quizzes.map(q => `
        <div class="quiz-item" id="quiz-item-${q.id}">
            <div class="quiz-item-info">
                <div class="quiz-item-title">${escapeHtml(q.title)}</div>
                <div class="quiz-item-meta">
                    📊 ${q.question_count} вопросов · 
                    🔑 <span class="quiz-item-code">${q.code}</span>
                </div>
            </div>
            <div class="quiz-item-actions">
                <button class="quiz-action-btn" onclick="copyQuizLink('${q.code}')" title="Копировать ссылку">📋</button>
                <button class="quiz-action-btn delete" onclick="deleteQuiz(${q.id})" title="Удалить">🗑</button>
            </div>
        </div>
    `).join("");
}

function copyQuizLink(code) {
    const botUsername = tg?.initDataUnsafe?.bot?.username;
    let link;
    if (botUsername) {
        link = `https://t.me/${botUsername}?start=${code}`;
    } else {
        link = `${window.location.origin}?mode=take&code=${code}`;
    }
    navigator.clipboard.writeText(link).then(() => showToast("📋 Ссылка скопирована!"));
}

async function deleteQuiz(id) {
    if (!confirm("Удалить тест?")) return;

    try {
        await fetch(`/api/quiz/${id}`, { method: "DELETE" });
        const el = document.getElementById("quiz-item-" + id);
        if (el) {
            el.style.transition = "all 0.3s ease";
            el.style.opacity = "0";
            el.style.transform = "translateX(30px)";
            setTimeout(() => el.remove(), 300);
        }
        showToast("🗑 Тест удалён");
    } catch (e) {
        showToast("Ошибка");
    }
}

// ═══════════════════════════════════════════════════════
//  KISS ANIMATION
// ═══════════════════════════════════════════════════════

function createKissRain(count, emojis = ["💋", "😘", "💕"]) {
    const container = document.getElementById("kiss-container");
    const maxKisses = Math.min(count, 40);

    for (let i = 0; i < maxKisses; i++) {
        setTimeout(() => {
            const kiss = document.createElement("div");
            kiss.className = "floating-kiss";
            kiss.textContent = emojis[Math.floor(Math.random() * emojis.length)];
            kiss.style.left = (5 + Math.random() * 90) + "%";
            kiss.style.animationDuration = (2 + Math.random() * 2.5) + "s";
            kiss.style.fontSize = (22 + Math.random() * 28) + "px";
            container.appendChild(kiss);

            setTimeout(() => kiss.remove(), 5000);
        }, i * 80);
    }
}

// ═══════════════════════════════════════════════════════
//  UTILITIES
// ═══════════════════════════════════════════════════════

function factorial(n) {
    if (n <= 1) return 1;
    let result = 1;
    for (let i = 2; i <= n; i++) result *= i;
    return result;
}

function pluralizeWord(n, one, two, many) {
    const mod10 = n % 10;
    const mod100 = n % 100;
    if (mod100 >= 11 && mod100 <= 19) return many;
    if (mod10 === 1) return one;
    if (mod10 >= 2 && mod10 <= 4) return two;
    return many;
}

function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
}

function shakeElement(el) {
    el.style.animation = "none";
    el.offsetHeight; // reflow
    el.style.animation = "shake 0.4s ease";
    setTimeout(() => el.style.animation = "", 400);
}

// ── Toast ──

function showToast(message) {
    let toast = document.querySelector(".toast");
    if (!toast) {
        toast = document.createElement("div");
        toast.className = "toast";
        document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.classList.add("show");
    setTimeout(() => toast.classList.remove("show"), 2500);
}
