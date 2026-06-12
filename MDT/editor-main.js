function uiT(key, fallback) {
    return typeof t === "function" ? t(key, fallback) : fallback;
}
document.getElementById("resetBtn").addEventListener("click", () => {
    STORY_DATA = {
        title: "",
        description: "",
        characters: [],
        chapters: [],
    };
    document.getElementById("app").innerHTML = "";
    toggleCreateButton(true);
});

let ORIGINAL_TEXT = "";
let STORY_DATA = {
    title: "",
    description: "",
    characters: [],
    chapters: [],
};

function buildSearchIndex() {
    SEARCH_INDEX = [];

    SEARCH_INDEX.push({
        type: "title",
        ref: STORY_DATA,
        getText: () => STORY_DATA.title,
    });

    SEARCH_INDEX.push({
        type: "description",
        ref: STORY_DATA,
        getText: () => STORY_DATA.description,
    });

    SEARCH_INDEX.push({
        type: "characters",
        ref: STORY_DATA,
        getText: () => STORY_DATA.characters.join("\n"),
    });

    STORY_DATA.chapters.forEach((ch, i) => {
        SEARCH_INDEX.push({
            type: "chapter-title",
            ref: ch,
            index: i,
            getText: () => ch.title,
        });

        SEARCH_INDEX.push({
            type: "chapter-body",
            ref: ch,
            index: i,
            getText: () => ch.body,
        });
    });
}

function cleanBlankLines(str) {
    return str
        .split(/\r?\n/)
        .filter((line) => line.trim() !== "")
        .join("\n");
}

function downloadFile(filename, text) {
    const blob = new Blob([text], { type: "text/plain" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
}

function saveDetailsState() {
    return Array.from(document.querySelectorAll("details")).map((d) => d.open);
}

function restoreDetailsState(state) {
    const details = document.querySelectorAll("#app details");

    details.forEach((d) => {
        const i = d.dataset.index;
        if (state[i]) d.open = true;
    });
}
async function getEPUBMetadata() {
    const author = await openTextModal(uiT("epub.author", "Nhập tác giả:"), "");

    if (author === null) return null;

    const subjects = await openTextModal(
        uiT("epub.subject", "Nhập thể loại (mỗi dòng 1 thể loại):"),
        "",
    );

    if (subjects === null) return null;

    return {
        author: author.trim(),
        subjects: subjects
            .split("\n")
            .map((s) => s.trim())
            .filter(Boolean),
    };
}
function openTextModal(title, defaultValue = "") {
    return new Promise((resolve) => {
        const modal = document.getElementById("textModal");
        const input = document.getElementById("modalInput");
        const titleEl = document.getElementById("modalTitle");

        titleEl.textContent = title;
        input.value = defaultValue;

        modal.style.display = "block";

        document.getElementById("modalOk").onclick = () => {
            modal.style.display = "none";
            resolve(input.value);
        };

        document.getElementById("modalCancel").onclick = () => {
            modal.style.display = "none";
            resolve(null);
        };
    });
}
function attachEditButton(container, getter, setter, flagIndex = null) {
    const btn = document.createElement("button");
    btn.textContent = uiT("ui.edit", "Edit");
    btn.className = "edit-btn";

    btn.onclick = (e) => {
        if (e.target.classList.contains("alt-checkbox")) return;
        if (container.querySelector(".edit-area")) return;

        const original = getter();

        const textarea = document.createElement("textarea");
        textarea.className = "edit-area";
        textarea.value = original;

        const controls = document.createElement("div");
        controls.className = "edit-controls";

        const confirm = document.createElement("button");
        confirm.textContent = uiT("ui.confirm", "Confirm");
        confirm.className = "confirm-btn";

        const cancel = document.createElement("button");
        cancel.textContent = uiT("ui.cancel", "Cancel");
        cancel.className = "cancel-btn";

        confirm.onclick = () => {
            const val = textarea.value;
            setter(val);
            if (flagIndex !== null) {
                STORY_DATA.chapters[flagIndex].edited = true;
            }
            requestAnimationFrame(() => renderStory());
        };

        cancel.onclick = () => requestAnimationFrame(() => renderStory());

        controls.appendChild(confirm);
        controls.appendChild(cancel);

        container.innerHTML = "";
        container.appendChild(textarea);
        container.appendChild(controls);
    };

    container.appendChild(btn);
}
function renumberChapters() {
    STORY_DATA.chapters.forEach((ch, i) => {
        ch.title = ch.title.replace(/^\d+\.\s*/, "");

        ch.title = i + 1 + "." + ch.title;
    });
}
let RENDER_LOCK = false;
function renderStory() {
    if (RENDER_LOCK) return;
    RENDER_LOCK = true;
    const oldState = saveDetailsState();
    const app = document.getElementById("app");
    app.replaceChildren();

    const top = document.createElement("div");
    top.className = "top-actions";

    const epubBtn = document.createElement("button");
    epubBtn.setAttribute("data-i18n", "export.epub");

    epubBtn.onclick = exportEPUB;

    top.appendChild(epubBtn);

    const fullBtn = document.createElement("button");
    fullBtn.setAttribute("data-i18n", "download.all");

    fullBtn.onclick = () => {
        let output = "";

        output += "<>" + STORY_DATA.title + "</>\n";
        output += "===========\n";
        output +=
            "<info>\n" +
            cleanBlankLines(STORY_DATA.description) +
            "\n</info>\n";
        output += "===========\n";
        output += "[\n" + STORY_DATA.characters.join("\n") + "\n]\n";
        output += "===========\n";
        output += "<list>\n";

        STORY_DATA.chapters.forEach((ch) => {
            output += ch.title + "{\n" + cleanBlankLines(ch.body) + "\n}\n";
        });

        output += "</list>";
        function fileName(name) {
            return String(name)
                .trim()
                .replace(/[<>:"/\\|?*\x00-\x1F]/g, "")
                .replace(/\s+/g, "_");
        }
        downloadFile(fileName(STORY_DATA.title) + "_full.txt", output);
    };

    const editedBtn = document.createElement("button");
    editedBtn.setAttribute("data-i18n", "download.changed");

    editedBtn.onclick = () => {
        let output = "";

        output += "<>" + STORY_DATA.title + "</>\n";
        output +=
            "<info>\n" +
            cleanBlankLines(STORY_DATA.description) +
            "\n</info>\n";
        output += "[\n" + STORY_DATA.characters.join("\n") + "\n]\n";
        output += "<list>\n";

        STORY_DATA.chapters.forEach((ch) => {
            if (ch.edited) {
                output += ch.title + "{\n" + cleanBlankLines(ch.body) + "\n}\n";
            }
        });

        output += "</list>";
        function fileName(name) {
            return String(name)
                .trim()
                .replace(/[<>:"/\\|?*\x00-\x1F]/g, "")
                .replace(/\s+/g, "_");
        }
        downloadFile(fileName(STORY_DATA.title) + "_edited.txt", output);
    };

    top.appendChild(fullBtn);
    top.appendChild(editedBtn);
    app.appendChild(top);

    const titleEl = document.createElement("h1");
    titleEl.textContent = STORY_DATA.title;

    attachEditButton(
        titleEl,
        () => STORY_DATA.title,
        (val) => (STORY_DATA.title = val),
    );

    app.appendChild(titleEl);

    const descDetails = document.createElement("details");
    const sum = document.createElement("summary");
    sum.setAttribute("data-i18n", "ui.description");

    const descDiv = document.createElement("div");
    descDiv.className = "content";
    descDiv.textContent = STORY_DATA.description;

    attachEditButton(
        descDiv,
        () => STORY_DATA.description,
        (val) => (STORY_DATA.description = val),
    );

    descDetails.appendChild(sum);
    descDetails.appendChild(descDiv);
    app.appendChild(descDetails);

    const charDetails = document.createElement("details");
    const charSum = document.createElement("summary");
    charSum.setAttribute("data-i18n", "ui.characters");

    const charDiv = document.createElement("div");
    charDiv.className = "content";
    charDiv.textContent = STORY_DATA.characters.join("\n");

    attachEditButton(
        charDiv,
        () => STORY_DATA.characters.join("\n"),
        (val) => (STORY_DATA.characters = val.split("\n")),
    );

    charDetails.appendChild(charSum);
    charDetails.appendChild(charDiv);
    app.appendChild(charDetails);

    const listDetails = document.createElement("details");
    const listSum = document.createElement("summary");
    listSum.setAttribute("data-i18n", "ui.chapters");
    listDetails.appendChild(listSum);

    const addBtn = document.createElement("button");
    addBtn.textContent = "➕ " + uiT("ui.add_chapter", "Thêm chương");
    addBtn.className = "edit-btn";
    addBtn.style.marginBottom = "10px";

    addBtn.onclick = () => {
        STORY_DATA.chapters.push({
            title: "Chương mới",
            body: "",
            edited: true,
        });
        renumberChapters();
        requestAnimationFrame(() => renderStory());
    };
    listDetails.appendChild(addBtn);

    STORY_DATA.chapters.forEach((ch, index) => {
        const chDetails = document.createElement("details");
        chDetails.dataset.index = index;
        const chSum = document.createElement("summary");
        chSum.textContent = ch.title;

        const controlSpan = document.createElement("span");
        controlSpan.style.marginLeft = "10px";

        const upBtn = document.createElement("button");
        upBtn.textContent = "⬆";
        upBtn.className = "edit-btn";
        upBtn.onclick = (e) => {
            e.stopPropagation();
            if (index > 0) {
                const temp = STORY_DATA.chapters[index];
                STORY_DATA.chapters[index] = STORY_DATA.chapters[index - 1];
                STORY_DATA.chapters[index - 1] = temp;
                renumberChapters();
                requestAnimationFrame(() => renderStory());
            }
        };

        const downBtn = document.createElement("button");
        downBtn.textContent = "⬇";
        downBtn.className = "edit-btn";
        downBtn.onclick = (e) => {
            e.stopPropagation();
            if (index < STORY_DATA.chapters.length - 1) {
                const temp = STORY_DATA.chapters[index];
                STORY_DATA.chapters[index] = STORY_DATA.chapters[index + 1];
                STORY_DATA.chapters[index + 1] = temp;

                renumberChapters();
                requestAnimationFrame(() => renderStory());
            }
        };

        const delBtn = document.createElement("button");
        delBtn.textContent = "🗑";
        delBtn.className = "edit-btn";
        delBtn.onclick = (e) => {
            e.stopPropagation();
            if (
                confirm(
                    uiT("ui.confirm_delete_chapter", "Xoá chương này luôn hả?"),
                )
            ) {
                STORY_DATA.chapters.splice(index, 1);
                renumberChapters();
                requestAnimationFrame(() => renderStory());
            }
        };

        controlSpan.appendChild(upBtn);
        controlSpan.appendChild(downBtn);
        controlSpan.appendChild(delBtn);

        chSum.appendChild(controlSpan);

        attachEditButton(
            chSum,
            () => ch.title,
            (val) => {
                ch.title = val;
                ch.edited = true;
            },
            index,
        );

        const chDiv = document.createElement("div");
        chDiv.className = "content";

        function renderChapterContent(div, content) {
            div.innerHTML = "";

            const lines = content.split(/\r?\n/);

            const isEmpty = lines.every((line) => {
                const t = line.trim();
                return t === "" || t === "•";
            });

            if (isEmpty) {
                div.classList.add("empty");

                const bulletTop = document.createElement("span");
                bulletTop.className = "bullet";
                bulletTop.textContent = "•";

                const emptyText = document.createElement("span");
                emptyText.className = "empty-text";
                emptyText.textContent = uiT("ui.not_updated", "Chưa cập nhật");

                const bulletBottom = document.createElement("span");
                bulletBottom.className = "bullet";
                bulletBottom.textContent = "•";

                div.appendChild(bulletTop);
                div.appendChild(emptyText);
                div.appendChild(bulletBottom);
            } else {
                lines.forEach((line) => {
                    const trimmed = line.trim();

                    if (trimmed === "•") {
                        const span = document.createElement("span");
                        span.className = "bullet";
                        span.textContent = "•";
                        div.appendChild(span);
                        return;
                    }

                    if (trimmed === "") {
                        div.appendChild(document.createElement("br"));
                        div.appendChild(document.createElement("br"));
                        return;
                    }

                    const text = document.createTextNode(line);
                    div.appendChild(text);
                    div.appendChild(document.createElement("br"));
                    div.appendChild(document.createElement("br"));
                });
            }
        }

        renderChapterContent(chDiv, ch.body);

        attachEditButton(
            chDiv,
            () => ch.body,
            (val) => {
                ch.body = val;
                ch.edited = true;
            },
            index,
        );

        chDetails.appendChild(chSum);
        chDetails.appendChild(chDiv);
        listDetails.appendChild(chDetails);
    });

    app.appendChild(listDetails);
    restoreDetailsState(oldState);
    buildSearchIndex();
    applyI18n();
    RENDER_LOCK = false;
}

document.getElementById("file").addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
        ORIGINAL_TEXT = reader.result;
        parseText(ORIGINAL_TEXT);
        requestAnimationFrame(() => renderStory());
        toggleCreateButton(false);
    };
    reader.readAsText(file, "utf-8");
});

function parseText(text) {
    const titleMatch = text.match(/<>\s*([\s\S]*?)\s*<\/>/);
    const descMatch = text.match(/<info>\s*([\s\S]*?)\s*<\/info>/);
    const charMatch = text.match(/\[\s*([\s\S]*?)\s*\]/);
    const listMatch = text.match(/<list>([\s\S]*?)<\/list>/);

    STORY_DATA.title = titleMatch ? titleMatch[1].trim() : "";
    STORY_DATA.description = descMatch
        ? descMatch[1].trim()
        : uiT("story.not_updated", "Chưa cập nhật");
    STORY_DATA.characters = charMatch ? charMatch[1].trim().split("\n") : [];
    STORY_DATA.chapters = [];

    if (listMatch) {
        const content = listMatch[1];

        const delimiters = [
            { open: "\\{", close: "\\}" },
            { open: "⟨", close: "⟩" },
            { open: "⟦", close: "⟧" },
            { open: "⟪", close: "⟫" },
            { open: "⟬", close: "⟭" },
            { open: "⌈", close: "⌋" },
            { open: "⌊", close: "⌉" },
            { open: "⌜", close: "⌟" },
            { open: "⌞", close: "⌝" },
        ];

        const openChars = delimiters
            .map((d) => d.open.replace("\\", ""))
            .join("");
        const allOpenPatterns = delimiters.map((d) => d.open).join("|");

        const dynamicRegex = new RegExp(
            `([^\\n${openChars}]+)(?:${allOpenPatterns})([\\s\\S]*?)(?:\\}|⟩|⟧|⟫|⟭|⌋|⌉|⌟|⌝)`,
            "g",
        );

        let m;
        while ((m = dynamicRegex.exec(content)) !== null) {
            let bodyContent = m[2].trim();

            if (bodyContent.startsWith("•")) {
                bodyContent = bodyContent.replace(/^•\s*/, "");
            }
            if (bodyContent.endsWith("•")) {
                bodyContent = bodyContent.replace(/\s*•$/, "");
            }

            STORY_DATA.chapters.push({
                title: m[1].trim(),
                body: bodyContent.trim(),
                edited: false,
            });
        }
    }
    renumberChapters();
}
document
    .getElementById("createStoryBtn")
    .addEventListener("click", async () => {
        const title = prompt(uiT("prompt.title", "Nhập tiêu đề truyện:"));
        if (!title) return;

        const desc = await openTextModal(
            uiT("prompt.description", "Nhập mô tả truyện:"),
            "",
        );

        if (desc === null) return;

        const charInput = await openTextModal(
            uiT("prompt.characters", "Nhập danh sách nhân vật:"),
            "",
        );

        if (charInput === null) return;

        STORY_DATA = {
            title: title.trim(),
            description: desc.trim(),
            characters: charInput
                .split("\n")
                .map((c) => c.trim())
                .filter((c) => c !== ""),
            chapters: [
                {
                    title: "1.Chương mở đầu",
                    body: "•\nNội dung chương ở đây\n•",
                    edited: true,
                },
            ],
        };

        requestAnimationFrame(() => renderStory());
        toggleCreateButton(false);
    });
function toggleCreateButton(show) {
    const btn = document.getElementById("createStoryBtn");
    if (!btn) return;
    btn.style.display = show ? "inline-block" : "none";
}
function updateStory(part, value) {
    STORY_DATA[part] = value;
    buildSearchIndex();
    renderStory(false);
}

function updateChapter(index, patch) {
    Object.assign(STORY_DATA.chapters[index], patch);
    buildSearchIndex();
    renderStory(false);
}

function moveChapter(from, to) {
    const temp = STORY_DATA.chapters[from];
    STORY_DATA.chapters[from] = STORY_DATA.chapters[to];
    STORY_DATA.chapters[to] = temp;
    renumberChapters();
    buildSearchIndex();
    renderStory(false);
}

function deleteChapter(index) {
    STORY_DATA.chapters.splice(index, 1);
    renumberChapters();
    buildSearchIndex();
    renderStory(false);
}
function applyI18n() {
    document.querySelectorAll("[data-i18n]").forEach((el) => {
        const key = el.getAttribute("data-i18n");
        if (!key) return;
        el.textContent = t(key);
    });
}
onI18nChange(() => {
    renderStory();
});
