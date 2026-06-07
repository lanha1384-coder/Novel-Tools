const status = document.getElementById("status");
const fileInput = document.getElementById("file");
const clearBtn = document.getElementById("clearFile");
const app = document.getElementById("app");
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
        ["•", "Chưa cập nhật", "•"].forEach((text, i) => {
            const span = document.createElement("span");
            span.className = i === 1 ? "empty-text" : "bullet";
            span.textContent = text;
            div.appendChild(span);
        });
    } else {
        const lines = content.split(/\r?\n/);
        let html = "";
        lines.forEach((line, index) => {
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
document.getElementById("file").addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) return;
    status.textContent = "📂 Đang tải file...";
    status.style.color = "#666";
    app.classList.add("fade-out");
    const reader = new FileReader();
    reader.onload = () => {
        setTimeout(() => {
            try {
                parseText(reader.result);
                hideIntro();
                slideInDetails();
                status.textContent = "✅ Tải thành công";
                status.style.color = "green";
                document.querySelector("h2").style.display = "none";
                document.getElementById("chuy").style.display = "none";
                clearBtn.style.display = "inline-block";
                app.classList.remove("fade-out");
                app.classList.add("fade-in");
            } catch (err) {
                console.error(err);
                status.textContent = "❌ File lỗi hoặc sai format";
                status.style.color = "red";
            }
        }, 160);
    };
    reader.readAsText(file, "utf-8");
    function parseText(text) {
        app.textContent = "";
        const STORAGE_KEY = "opened-chapters";
        let chapterToScroll = null;
        const titleMatch = text.match(/<>\s*([\s\S]*?)\s*<\/>/);
        if (titleMatch) {
            const h1 = document.createElement("h1");
            h1.textContent = titleMatch[1].trim();
            app.appendChild(h1);
            text = text.replace(titleMatch[0], "");
        }
        const descMatch = text.match(/<info>\s*([\s\S]*?)\s*<\/info>/);
        let descriptionContent = "Chưa cập nhật";
        if (descMatch) {
            const cleaned = descMatch[1].trim();
            if (cleaned.length > 0) {
                descriptionContent = cleaned;
            }
            text = text.replace(descMatch[0], "");
        }
        const descDetails = document.createElement("details");
        const descSummary = document.createElement("summary");
        descSummary.textContent = "Mô tả";
        const descDiv = document.createElement("div");
        descDiv.className = "content";
        descDiv.textContent = descriptionContent;
        descDetails.appendChild(descSummary);
        descDetails.appendChild(descDiv);
        enableDetailsAnimation(descDetails);
        app.appendChild(descDetails);
        const listSectionMatch = text.match(/<list>[\s\S]*?<\/list>/);
        let listSection = "";
        let outsideText = text;
        if (listSectionMatch) {
            listSection = listSectionMatch[0];
            outsideText = text.replace(listSection, "");
        }
        let characters = [];
        const listMatch = outsideText.match(/\[\s*([\s\S]*?)\s*\]/);
        if (listMatch) {
            characters = listMatch[1]
                .split("\n")
                .map((l) => l.trim())
                .filter(Boolean);
            outsideText = outsideText.replace(listMatch[0], "");
        }
        if (characters.length === 0) {
            characters = ["Chưa cập nhật"];
        }
        const charDetails = document.createElement("details");
        const charSummary = document.createElement("summary");
        charSummary.textContent = "Danh sách nhân vật";
        const charDiv = document.createElement("div");
        charDiv.className = "content";
        const ul = document.createElement("ul");
        characters.forEach((name) => {
            const li = document.createElement("li");
            li.textContent = name;
            ul.appendChild(li);
        });
        charDiv.appendChild(ul);
        charDetails.appendChild(charSummary);
        charDetails.appendChild(charDiv);
        enableDetailsAnimation(charDetails);
        app.appendChild(charDetails);

        text = outsideText + listSection;
        const listRegex = /<list>([\s\S]*?)<\/list>/g;
        let listChap;
        while ((listChap = listRegex.exec(text)) !== null) {
            const listContent = listChap[1];
            const folder = document.createElement("details");
            const folderSummary = document.createElement("summary");
            folderSummary.textContent = "Danh sách chương";
            const folderContent = document.createElement("div");
            folderContent.className = "content virtual-scroll";
            folder.appendChild(folderSummary);
            folder.appendChild(folderContent);
            enableDetailsAnimation(folder);
            app.appendChild(folder);
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

            const chapters = [];

            let match;

            while ((match = dynamicRegex.exec(listContent)) !== null) {
                let bodyContent = match[2].trim();

                if (bodyContent.startsWith("•")) {
                    bodyContent = bodyContent.replace(/^•\s*/, "");
                }

                if (bodyContent.endsWith("•")) {
                    bodyContent = bodyContent.replace(/\s*•$/, "");
                }

                chapters.push({
                    title: match[1].trim(),
                    body: bodyContent.trim(),
                });
            }
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
            Đang tải chương...
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
                localStorage.setItem(
                    STORAGE_KEY,
                    JSON.stringify([...openedItems]),
                );
            }

            function loadOpened() {
                try {
                    return JSON.parse(
                        localStorage.getItem(STORAGE_KEY) || "[]",
                    );
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

                summary.textContent = chapter.title;

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

                while (
                    end < chapters.length &&
                    visible < viewportHeight + 2000
                ) {
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
        }
        if (chapterToScroll) {
            setTimeout(() => {
                chapterToScroll.scrollIntoView({
                    behavior: "smooth",
                    block: "start",
                });
            }, 300);
        }
    }
});
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
    status.textContent = "";
    history.replaceState(null, "", location.pathname);
    app.classList.remove("fade-in");
    document.querySelector("h2").style.display = "block";
    document.getElementById("chuy").style.display = "block";
    clearBtn.style.display = "none";
});
