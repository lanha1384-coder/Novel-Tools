const status = document.getElementById("status");
const fileInput = document.getElementById("file");
const clearBtn = document.getElementById("clearFile");
const app = document.getElementById("app");

let isAnimating = false;
let currentArrayBuffer = null;
let currentStatusState = "";
let currentEpubData = null; // BIẾN TOÀN CỤC: Lưu trữ data thô sau khi parse thành công

function setStatus(state) {
    currentStatusState = state;
    if (state === "loading") {
        status.textContent = t(
            "reader.status_loading",
            "📂 Đang tải file EPUB...",
        );
        status.style.color = "#666";
    } else if (state === "success") {
        status.textContent = t("reader.status_success", "✅ Tải thành công");
        status.style.color = "green";
    } else if (state === "error") {
        status.textContent = t(
            "reader.status_error",
            "❌ File lỗi hoặc sai format EPUB",
        );
        status.style.color = "red";
    } else {
        status.textContent = "";
    }
}

function escapeHtml(str) {
    return str
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
}

function renderChapter(div, content, scrollContainer) {
    div.dataset.loaded = "1";
    div.textContent = "";
    const isEmpty = content.split(/\r?\n/).every((line) => {
        const t = line.trim();
        return t === "" || t === "•";
    });
    if (isEmpty) {
        div.classList.add("empty");
        ["•", t("reader.not_updated", "Chưa cập nhật"), "•"].forEach(
            (text, i) => {
                const span = document.createElement("span");
                span.className = i === 1 ? "empty-text" : "bullet";
                span.textContent = text;
                div.appendChild(span);
            },
        );
    } else {
        const lines = content.split(/\r?\n/);
        let html = "";
        filename = lines.forEach((line, index) => {
            const trimmed = line.trim();
            if (trimmed === "•") {
                html += `<span class="bullet">•</span>`;
                return;
            }
            if (trimmed === "") {
                html += "<br><br>";
                return;
            }
            html += escapeHtml(line);
            html += "<br><br>";
        });
        html = html.replace(/(<br><br>)+$/, "");
        div.innerHTML = html;
        div.classList.add("chapter-content");
    }
}

function enableDetailsAnimation(details) {
    const content = details.querySelector(":scope > .content");
    if (!content) return;
    details.addEventListener("click", (e) => {
        const summary = e.target.closest("summary");
        if (!summary || summary.parentElement !== details) return;
        e.preventDefault();
        const isOpen = details.hasAttribute("open");
        if (!isOpen) {
            isAnimating = true;
            details.setAttribute("open", "");
            details.dispatchEvent(new Event("toggle"));
            content.style.maxHeight = "0px";
            requestAnimationFrame(() => {
                content.style.maxHeight = content.scrollHeight + "px";
                content.addEventListener("transitionend", function handler() {
                    content.style.maxHeight = "none";
                    isAnimating = false;
                    content.removeEventListener("transitionend", handler);
                });
            });
        } else {
            isAnimating = true;
            const startHeight = content.scrollHeight;
            content.style.maxHeight = startHeight + "px";
            requestAnimationFrame(() => {
                content.style.maxHeight = "0px";
            });
            function finishClose() {
                details.removeAttribute("open");
                details.dispatchEvent(new Event("toggle"));
                isAnimating = false;
                content.removeEventListener("transitionend", finishClose);
            }
            content.addEventListener("transitionend", finishClose);
            setTimeout(finishClose, 700);
        }
    });
}

// ==================== XỬ LÝ ĐỔI NGÔN NGỮ ====================
if (typeof onI18nChange === "function") {
    onI18nChange((lang) => {
        // 1. Cập nhật lại chuỗi trạng thái loading/success/error
        if (currentStatusState) setStatus(currentStatusState);

        // 2. CHỈ RENDER LẠI UI dựa trên data có sẵn, KHÔNG parse lại file zip nữa
        if (currentEpubData) {
            renderEpub();
        }
    });
}

document.getElementById("file").addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setStatus("loading");
    app.classList.add("fade-out");

    const reader = new FileReader();
    reader.onload = async () => {
        currentArrayBuffer = reader.result;
        setTimeout(async () => {
            try {
                // Bước 1: Chỉ parse bóc tách dữ liệu
                await parseEpub(currentArrayBuffer);

                // Bước 2: Tiến hành render ra DOM ngoài cùng
                renderEpub();

                hideIntro();
                slideInDetails();
                setStatus("success");

                if (document.querySelector("h2"))
                    document.querySelector("h2").style.display = "none";
                if (document.getElementById("chuy"))
                    document.getElementById("chuy").style.display = "none";

                clearBtn.style.display = "inline-block";
                app.classList.remove("fade-out");
                app.classList.add("fade-in");
            } catch (err) {
                console.error(err);
                setStatus("error");
            }
        }, 160);
    };
    reader.readAsArrayBuffer(file);
});

// ==================== HÀM 1: CHỈ ĐẢM NHIỆM PARSE DATA THÔ ====================
async function parseEpub(arrayBuffer) {
    const zip = await JSZip.loadAsync(arrayBuffer);

    const containerXmlText = await zip
        .file("META-INF/container.xml")
        .async("text");
    const parser = new DOMParser();
    const containerDoc = parser.parseFromString(containerXmlText, "text/xml");
    const opfPath = containerDoc
        .querySelector("rootfile")
        .getAttribute("full-path");

    const opfDir = opfPath.substring(0, opfPath.lastIndexOf("/"))
        ? opfPath.substring(0, opfPath.lastIndexOf("/")) + "/"
        : "";

    const opfText = await zip.file(opfPath).async("text");
    const opfDoc = parser.parseFromString(opfText, "text/xml");

    const titleEl = opfDoc.getElementsByTagName("dc:title")[0];
    const creatorEl = opfDoc.getElementsByTagName("dc:creator")[0];
    const descriptionEl = opfDoc.getElementsByTagName("dc:description")[0];
    const subjectEls = opfDoc.getElementsByTagName("dc:subject");

    const storyTitle = titleEl ? titleEl.textContent.trim() : null;
    const author = creatorEl ? creatorEl.textContent.trim() : null;
    const description = descriptionEl ? descriptionEl.textContent.trim() : null;

    let genres = [];
    for (let i = 0; i < subjectEls.length; i++) {
        if (subjectEls[i].textContent.trim()) {
            genres.push(subjectEls[i].textContent.trim());
        }
    }

    const manifestItems = {};
    const manifestEls = opfDoc.querySelectorAll("manifest > item");
    let characterHref = null;

    manifestEls.forEach((item) => {
        const href = item.getAttribute("href");
        const id = item.getAttribute("id");
        manifestItems[id] = href;

        if (
            href &&
            (href.toLowerCase().includes("character") ||
                href.toLowerCase().includes("nhan-vat"))
        ) {
            characterHref = href;
        }
    });

    let characterText = null;
    if (characterHref) {
        try {
            const charFileRelativePath = opfDir + characterHref;
            const charFile = zip.file(charFileRelativePath);

            if (charFile) {
                const charHtmlText = await charFile.async("text");
                const charDoc = parser.parseFromString(
                    charHtmlText,
                    "text/html",
                );

                charDoc
                    .querySelectorAll("script, style, title, h1, h2, h3")
                    .forEach((el) => el.remove());

                let rawCharText = "";
                const charParagraphs =
                    charDoc.querySelectorAll("p, div, li, br");
                if (charParagraphs.length > 0) {
                    charParagraphs.forEach((p) => {
                        if (p.tagName.toLowerCase() === "br") {
                            rawCharText += "\n";
                        } else {
                            const text = p.textContent.trim();
                            if (text) rawCharText += text + "\n";
                        }
                    });
                } else {
                    rawCharText = charDoc.body ? charDoc.body.textContent : "";
                }

                rawCharText = rawCharText.trim();
                if (rawCharText) {
                    characterText = rawCharText;
                }
            }
        } catch (charErr) {
            console.warn("Không thể đọc file danh sách nhân vật:", charErr);
        }
    }

    const spineEls = opfDoc.querySelectorAll("spine > itemref");
    const chapters = [];

    for (let i = 0; i < spineEls.length; i++) {
        const idref = spineEls[i].getAttribute("idref");
        const href = manifestItems[idref];
        if (!href) continue;
        if (href === characterHref) continue;

        const fileRelativePath = opfDir + href;
        const chapterFile = zip.file(fileRelativePath);
        if (!chapterFile) continue;

        const chapterHtmlText = await chapterFile.async("text");
        const chapDoc = parser.parseFromString(chapterHtmlText, "text/html");

        let chapTitle = null;
        let isFallbackTitle = false;
        const titleTag = chapDoc.querySelector("title");
        if (titleTag && titleTag.textContent.trim()) {
            chapTitle = titleTag.textContent.trim();
        }

        const headerTag = chapDoc.querySelector("h1, h2, h3, h4, h5, h6");
        if (headerTag && headerTag.textContent.trim()) {
            if (
                !chapTitle ||
                (storyTitle &&
                    chapTitle.toLowerCase() === storyTitle.toLowerCase())
            ) {
                chapTitle = headerTag.textContent.trim();
            }
            headerTag.remove();
        }

        if (!chapTitle) {
            isFallbackTitle = true; // Đánh dấu để hàm render tự sinh tên theo ngôn ngữ hiện tại
        }

        chapDoc.querySelectorAll("script, style").forEach((el) => el.remove());

        let bodyText = "";
        const paragraphs = chapDoc.querySelectorAll("p, div, br");
        if (paragraphs.length > 0) {
            paragraphs.forEach((p) => {
                if (p.tagName.toLowerCase() === "br") {
                    bodyText += "\n";
                } else {
                    const text = p.textContent.trim();
                    if (text) bodyText += text + "\n";
                }
            });
        } else {
            bodyText = chapDoc.body ? chapDoc.body.textContent : "";
        }

        bodyText = bodyText.trim();
        if (bodyText.startsWith("•")) bodyText = bodyText.replace(/^•\s*/, "");
        if (bodyText.endsWith("•")) bodyText = bodyText.replace(/\s*•$/, "");

        chapters.push({
            title: chapTitle,
            isFallbackTitle: isFallbackTitle,
            fallbackIndex: i + 1,
            body: bodyText,
        });
    }

    // Gán dữ liệu thô vào biến global để tái sử dụng
    currentEpubData = {
        storyTitle,
        author,
        description,
        genres,
        characterText,
        chapters,
    };
}

function renderEpub() {
    if (!currentEpubData) return;

    app.textContent = "";
    const STORAGE_KEY = "opened-chapters";
    let chapterToScroll = null;

    const { storyTitle, author, description, genres, characterText, chapters } =
        currentEpubData;

    // 1. Tiêu đề truyện
    const h1 = document.createElement("h1");
    h1.textContent =
        storyTitle || t("reader.untitled_story", "Truyện không có tiêu đề");
    app.appendChild(h1);

    // 2. Khối chi tiết Mô tả
    const descDetails = document.createElement("details");
    const descSummary = document.createElement("summary");
    descSummary.setAttribute("data-i18n", "reader.description_title");

    const descDiv = document.createElement("div");
    descDiv.className = "content";
    descDiv.style.whiteSpace = "pre-line";

    const txtAuthor = author || t("reader.not_updated", "Chưa cập nhật");
    const txtDesc = description || t("reader.not_updated", "Chưa cập nhật");
    const arrGenres =
        genres.length > 0 ? genres : [t("reader.not_updated", "Chưa cập nhật")];

    let metaContent = `${t("reader.meta_author", "Tác giả:")} ${txtAuthor}\n`;
    metaContent += `${t("reader.meta_genres", "Thể loại:")}\n${arrGenres.map((g) => `- ${g}`).join("\n")}\n\n`;
    metaContent += `${t("reader.description_title", "Mô tả")}:\n${txtDesc}`;
    descDiv.textContent = metaContent;

    descDetails.appendChild(descSummary);
    descDetails.appendChild(descDiv);
    enableDetailsAnimation(descDetails);
    app.appendChild(descDetails);

    const charDetails = document.createElement("details");
    const charSummary = document.createElement("summary");
    charSummary.setAttribute("data-i18n", "reader.character_list");
    const charDiv = document.createElement("div");
    charDiv.className = "content";
    charDiv.style.whiteSpace = "pre-line";

    charDiv.textContent =
        characterText || t("reader.not_updated", "Chưa cập nhật");
    charDetails.appendChild(charSummary);
    charDetails.appendChild(charDiv);
    enableDetailsAnimation(charDetails);
    app.appendChild(charDetails);

    const folder = document.createElement("details");
    const folderSummary = document.createElement("summary");
    folderSummary.setAttribute("data-i18n", "reader.chapter_list");
    const folderContent = document.createElement("div");
    folderContent.className = "content virtual-scroll";
    folder.appendChild(folderSummary);
    folder.appendChild(folderContent);
    enableDetailsAnimation(folder);
    app.appendChild(folder);

    const ITEM_HEIGHT = 40;
    const EXPANDED_HEIGHT = 600;
    const BUFFER = 20;

    const openedItems = new Set();
    const renderedBodies = new Map();

    function getItemHeight(index) {
        return openedItems.has(index) ? EXPANDED_HEIGHT : ITEM_HEIGHT;
    }

    function getOffset(index) {
        let total = 0;
        for (let i = 0; i < index; i++) {
            total += getItemHeight(i);
        }
        return total;
    }

    async function lazyRenderContent(container, chapter) {
        container.innerHTML = `
            <div class="chapter-loading">
                ${t("reader.chapter_loading", "Đang tải chương...")}
            </div>
        `;
        await new Promise((resolve) => {
            requestAnimationFrame(() => {
                setTimeout(resolve, 100);
            });
        });
        renderChapter(container, chapter.body, folderContent);
    }

    function saveOpened() {
        localStorage.setItem(STORAGE_KEY, JSON.stringify([...openedItems]));
    }

    function loadOpened() {
        try {
            return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
        } catch {
            return [];
        }
    }

    function createChapterItem(index) {
        const chapter = chapters[index];
        const details = document.createElement("details");
        details.className = "virtual-chapter";

        if (openedItems.has(index)) {
            details.open = true;
        }

        const summary = document.createElement("summary");

        summary.textContent = chapter.isFallbackTitle
            ? `${t("reader.chapter_prefix", "Chương")} ${chapter.fallbackIndex}`
            : chapter.title;

        details.appendChild(summary);

        const content = document.createElement("div");
        content.className = "content";
        details.appendChild(content);

        if (openedItems.has(index)) {
            if (renderedBodies.has(index)) {
                content.innerHTML = renderedBodies.get(index);
            } else {
                lazyRenderContent(content, chapter).then(() => {
                    renderedBodies.set(index, content.innerHTML);
                });
            }
        }

        summary.addEventListener("click", async (e) => {
            e.preventDefault();
            if (openedItems.has(index)) {
                openedItems.delete(index);
                saveOpened();
                renderVisible();
                return;
            }
            openedItems.add(index);
            saveOpened();
            renderVisible();

            requestAnimationFrame(async () => {
                const current = folderContent.querySelector(
                    `[data-chapter="${index}"] .content`,
                );
                if (!current) return;
                await lazyRenderContent(current, chapter);
                renderedBodies.set(index, current.innerHTML);
            });
        });

        details.dataset.chapter = index;
        return details;
    }

    function renderVisible() {
        const scrollTop = folderContent.scrollTop;
        const viewportHeight = folderContent.clientHeight;
        folderContent.innerHTML = "";

        let start = 0;
        let offset = 0;

        while (start < chapters.length) {
            const h = getItemHeight(start);
            if (offset + h >= scrollTop) {
                break;
            }
            offset += h;
            start++;
        }

        let end = start;
        let visible = 0;

        while (end < chapters.length && visible < viewportHeight + 2000) {
            visible += getItemHeight(end);
            end++;
        }

        start = Math.max(0, start - BUFFER);
        end = Math.min(chapters.length, end + BUFFER);

        const top = document.createElement("div");
        top.className = "vs-spacer";
        top.style.height = getOffset(start) + "px";
        folderContent.appendChild(top);

        for (let i = start; i < end; i++) {
            const item = createChapterItem(i);
            item.style.minHeight = getItemHeight(i) + "px";
            folderContent.appendChild(item);
        }

        const bottom = document.createElement("div");
        bottom.className = "vs-spacer";
        const totalHeight = getOffset(chapters.length);
        bottom.style.height = totalHeight - getOffset(end) + "px";
        folderContent.appendChild(bottom);
        applyI18n();
    }

    let scrollRAF = null;
    folderContent.addEventListener("scroll", () => {
        if (scrollRAF) return;
        scrollRAF = requestAnimationFrame(() => {
            scrollRAF = null;
            renderVisible();
        });
    });

    loadOpened().forEach((i) => openedItems.add(i));
    renderVisible();

    if (chapterToScroll) {
        setTimeout(() => {
            chapterToScroll.scrollIntoView({
                behavior: "smooth",
                block: "start",
            });
        }, 300);
    }

    wrapSlideItems();
    requestAnimationFrame(() => {
        applyI18n();
    });
}

function wrapSlideItems() {
    const chuy = document.getElementById("chuy");
    if (chuy && !chuy.dataset.wrapped) {
        chuy.dataset.wrapped = "1";
        [...chuy.children].forEach((el) => {
            const wrapper = document.createElement("div");
            wrapper.className = "slide-item show";
            wrapper.appendChild(el);
            chuy.appendChild(wrapper);
        });
    }
    document.querySelectorAll("#app > details").forEach((details) => {
        if (details.dataset.wrapped) return;
        details.dataset.wrapped = "1";
        const wrapper = document.createElement("div");
        wrapper.className = "slide-item show";
        details.parentNode.insertBefore(wrapper, details);
        wrapper.appendChild(details);
    });
}

clearBtn.addEventListener("click", () => {
    slideOutDetails();
    showIntro();
    fileInput.value = "";
    app.textContent = "";
    setStatus("");
    currentArrayBuffer = null;
    currentEpubData = null;
    history.replaceState(null, "", location.pathname);
    app.classList.remove("fade-in");

    if (document.querySelector("h2"))
        document.querySelector("h2").style.display = "block";
    if (document.getElementById("chuy"))
        document.getElementById("chuy").style.display = "block";

    clearBtn.style.display = "none";
});
function handleLanguageChange() {
    if (currentStatusState) setStatus(currentStatusState);

    if (currentEpubData) {
        renderEpub();
    }
}
