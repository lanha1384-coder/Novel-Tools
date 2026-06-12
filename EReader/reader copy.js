const state = {
    zip: null,
    opfPath: "",
    basePath: "",
    spine: [],
    manifest: {},
    toc: [],
    currentChapterIndex: 0,
    currentPageIndex: 0,
    maxPagesInChapter: 1,
    theme: "light",
    pageMode: "single",
    fontSize: 25,
    fontPercent: 100,
    autoScrollInterval: null,
    tiltFlip: false,
    overrideVol: true,
    isDragging: false,
    dragStart: { x: 0, y: 0 },
    pinchStartDist: 0,
    currentUtterance: null,
    bookId: null,
    tts: {
        voices: [],
        voice: null,
        rate: 1,
        volume: 1,
        enabled: false,
        paused: false,
    },
    blobUrls: [],
    orientationHandler: null,
    ux: {
        lineSpacing: 1.5,
        margin: 40,
        paraSpacing: 1,
        hyphenation: false,
        justification: "left",
        brightness: 100,
        texture: "none",
    },
    bookmarks: [],
    highlights: [],
};

function getBookProgress(bookId) {
    const all = JSON.parse(
        localStorage.getItem("epub_reader_progress") || "{}",
    );

    return all[bookId] || null;
}

function saveBookProgress() {
    if (!state.bookId) return;

    const all = JSON.parse(
        localStorage.getItem("epub_reader_progress") || "{}",
    );

    all[state.bookId] = {
        chapterIndex: state.currentChapterIndex,
        pageIndex: state.currentPageIndex,
        updatedAt: Date.now(),
    };

    localStorage.setItem("epub_reader_progress", JSON.stringify(all));
}

function clearBookProgress(bookId) {
    const all = JSON.parse(
        localStorage.getItem("epub_reader_progress") || "{}",
    );

    delete all[bookId];

    localStorage.setItem("epub_reader_progress", JSON.stringify(all));
}

document
    .getElementById("file-input")
    .addEventListener("change", handleFileSelect);
window.addEventListener("resize", handleResize);
setupGlobalInteractions();
updateFontScale(100);
window.addEventListener("DOMContentLoaded", async () => {
    const localBookId = localStorage.getItem("selected_local_book_id");
    if (!localBookId) {
        window.location.href = "index.html";
        return;
    }
    if (localBookId) {
        localStorage.removeItem("selected_local_book_id");

        document.getElementById("book-title").innerText =
            "Đang lấy sách từ thư viện cục bộ...";

        try {
            const DB_NAME = "EpubReaderLocalDB";
            const request = indexedDB.open(DB_NAME, 1);

            request.onsuccess = function (e) {
                const db = e.target.result;
                const transaction = db.transaction("bookshelf", "readonly");
                const store = transaction.objectStore("bookshelf");
                const getReq = store.get(localBookId);

                getReq.onsuccess = async function () {
                    const bookRecord = getReq.result;
                    if (bookRecord && bookRecord.fileBlob) {
                        console.log(
                            "Tìm thấy sách cục bộ, đang nạp vào pipeline giải nén cũ...",
                        );

                        const mockEvent = {
                            target: {
                                files: [bookRecord.fileBlob],
                            },
                        };
                        await handleFileSelect(mockEvent);
                    }
                };
            };
        } catch (err) {
            console.error("Không thể tự động tải sách từ Library:", err);
        }
    }
});
function cleanupListeners() {
    if (state.orientationHandler) {
        window.removeEventListener(
            "deviceorientation",
            state.orientationHandler,
        );
        state.orientationHandler = null;
    }
}
async function handleFileSelect(e) {
    const file = e.target.files[0];
    if (!file) return;

    document.getElementById("book-title").innerText = t(
        "ereader.processing_epub",
    );
    cleanupListeners();
    try {
        const arrayBuffer = await file.arrayBuffer();
        state.zip = await JSZip.loadAsync(arrayBuffer);

        const containerXmlStr = await state.zip
            .file("META-INF/container.xml")
            .async("string");
        const parser = new DOMParser();
        const containerDoc = parser.parseFromString(
            containerXmlStr,
            "text/xml",
        );
        state.opfPath = containerDoc
            .querySelector("rootfile")
            .getAttribute("full-path");

        if (state.opfPath.includes("/")) {
            state.basePath =
                state.opfPath.substring(0, state.opfPath.lastIndexOf("/")) +
                "/";
        } else {
            state.basePath = "";
        }

        const opfStr = await state.zip.file(state.opfPath).async("string");
        const opfDoc = parser.parseFromString(opfStr, "text/xml");

        parseMetadata(opfDoc);
        await loadCoverImage(opfDoc);
        parseManifestAndSpine(opfDoc);

        if (state.tocFile) {
            if (state.tocFile.endsWith(".ncx")) {
                state.toc = await parseNCX(state.tocFile);
            } else {
                state.toc = await parseNavXhtml(state.tocFile);
            }
        }

        if (!state.toc.length) {
            state.toc = await buildTOCFromContent();
        }

        const saved = getBookProgress(state.bookId);

        if (saved) {
            state.currentChapterIndex = saved.chapterIndex || 0;
            state.currentPageIndex = saved.pageIndex || 0;
        } else {
            state.currentChapterIndex = 0;
            state.currentPageIndex = 0;
        }

        await loadChapter(state.currentChapterIndex, true);

        buildTocDOM();
        state.bookmarks = JSON.parse(
            localStorage.getItem(`epub_bookmarks_${state.bookId}`) || "[]",
        );
        state.highlights = JSON.parse(
            localStorage.getItem(`epub_highlights_${state.bookId}`) || "[]",
        );
        const savedUX = localStorage.getItem(`epub_ux_${state.bookId}`);
        if (savedUX) {
            state.ux = JSON.parse(savedUX);
            Object.keys(state.ux).forEach((key) =>
                changeUXSetting(key, state.ux[key]),
            );
        }
    } catch (err) {
        alert(t("ereader.epub_parse_error") + err.message);
        document.getElementById("book-title").innerText = t(
            "ereader.file_processing_error",
        );
        console.error(err);
    }
}

function parseMetadata(xml) {
    const title =
        xml.querySelector("title")?.textContent || t("ereader.unknown_title");
    state.bookId = title.trim().replace(/\s+/g, " ").toLowerCase();
    const author =
        xml.querySelector("creator")?.textContent ||
        t("ereader.unknown_author");
    const subjects = [...xml.querySelectorAll("subject, dc\\:subject")]
        .map((el) => el.textContent?.trim())
        .filter(Boolean);

    const subject = subjects.length
        ? subjects.join(", ")
        : t("ereader.general_subject");
    const description =
        xml.querySelector("description")?.textContent ||
        t("ereader.no_description");

    document.getElementById("book-title").innerText = title;
    document.getElementById("meta-author").innerText = author;
    document.getElementById("meta-subject").innerText = subject;
    document.getElementById("meta-description").innerText = description;
}

async function loadCoverImage(opfDoc) {
    try {
        let coverHref = null;

        const coverMeta = opfDoc.querySelector('meta[name="cover"]');

        if (coverMeta) {
            const coverId = coverMeta.getAttribute("content");
            const coverItem = opfDoc.querySelector(
                `manifest > item[id="${coverId}"]`,
            );

            if (coverItem) {
                coverHref = coverItem.getAttribute("href");
            }
        }

        if (!coverHref) {
            const manifestItems = [
                ...opfDoc.querySelectorAll("manifest > item"),
            ];

            const possibleCover = manifestItems.find((item) => {
                const href = (item.getAttribute("href") || "").toLowerCase();
                return href.includes("cover");
            });

            if (possibleCover) {
                coverHref = possibleCover.getAttribute("href");
            }
        }

        if (!coverHref) return;

        const fullCoverPath = resolveRelativePath(state.basePath, coverHref);

        const coverFile = state.zip.file(fullCoverPath);

        if (!coverFile) return;

        const blob = await coverFile.async("blob");
        const coverUrl = URL.createObjectURL(blob);

        document.getElementById("meta-cover").innerHTML = `
            <img
                src="${coverUrl}"
                alt="Cover"
                style="
                    width: 160px;
                    height: 224px;
                    object-fit: cover;
                    border-radius: 6px;
                    box-shadow: 0 2px 8px rgba(0,0,0,.2);
                "
            />
        `;
    } catch (err) {
        console.warn("Không thể tải ảnh bìa:", err);
    }
}

function parseManifestAndSpine(xml) {
    state.manifest = {};
    const items = xml.querySelectorAll("manifest > item");
    items.forEach((item) => {
        state.manifest[item.getAttribute("id")] = item.getAttribute("href");
    });

    const itemrefs = xml.querySelectorAll("spine > itemref");
    state.spine = [];
    itemrefs.forEach((ref) => {
        const idref = ref.getAttribute("idref");
        if (state.manifest[idref]) {
            state.spine.push(state.manifest[idref]);
        }
    });

    state.toc = [];
    state.tocFile = null;

    const tocItem = Array.from(items).find((i) => {
        const mediaType = i.getAttribute("media-type") || "";
        const properties = i.getAttribute("properties") || "";
        const id = i.getAttribute("id") || "";

        return (
            properties.includes("nav") ||
            mediaType === "application/x-dtbncx+xml" ||
            id.toLowerCase().includes("toc") ||
            id.toLowerCase().includes("ncx")
        );
    });

    if (tocItem) {
        state.tocFile = tocItem.getAttribute("href");
    }
    state.spine.forEach((href, idx) => {
        state.toc.push({
            title: `${t("ereader.chapter")} ${idx + 1}: ${href.split("/").pop()}`,
            href: href,
            index: idx,
        });
    });
}

async function parseNCX(href) {
    const path = resolveRelativePath(state.basePath, href);

    const file = state.zip.file(path);

    if (!file) return [];

    const xml = await file.async("string");

    const doc = new DOMParser().parseFromString(xml, "text/xml");

    return [...doc.querySelectorAll("navPoint")].map((p) => {
        return {
            title: p.querySelector("text")?.textContent || "Untitled",

            href: p.querySelector("content")?.getAttribute("src") || "",
        };
    });
}

async function parseNavXhtml(href) {
    const path = resolveRelativePath(state.basePath, href);

    const file = state.zip.file(path);

    if (!file) return [];

    const html = await file.async("string");

    const doc = new DOMParser().parseFromString(html, "text/html");

    return [...doc.querySelectorAll("nav a")]
        .map((a) => ({
            title: a.textContent.trim(),
            href: a.getAttribute("href"),
        }))
        .filter((x) => x.href);
}

async function buildTOCFromContent() {
    const result = [];

    for (const href of state.spine) {
        const path = resolveRelativePath(state.basePath, href);

        const file = state.zip.file(path);

        if (!file) continue;

        const html = await file.async("string");

        const doc = new DOMParser().parseFromString(html, "text/html");

        const title =
            doc.querySelector("h1")?.textContent ||
            doc.querySelector("h2")?.textContent ||
            doc.querySelector("title")?.textContent ||
            href.split("/").pop();

        result.push({
            title: title.trim(),
            href,
        });
    }

    return result;
}
function clearBlobUrls() {
    if (!state.blobUrls) return;

    state.blobUrls.forEach((url) => URL.revokeObjectURL(url));
    state.blobUrls = [];
}
async function loadChapter(index, preservePage = false) {
    if (index < 0 || index >= state.spine.length) return;
    state.currentChapterIndex = index;

    const chapterHref = state.spine[index];
    const fullPath = resolveRelativePath(state.basePath, chapterHref);
    clearBlobUrls();
    const fileEntry = state.zip.file(fullPath);

    if (!fileEntry) {
        document.getElementById("chapter-content").innerHTML =
            '<p>t("ereader.chapter_not_found")</p>';
        return;
    }

    let htmlStr = await fileEntry.async("string");

    htmlStr = await resolveEmbeddedAssets(htmlStr, fullPath);

    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlStr, "text/html");
    const bodyContent = doc.body ? doc.body.innerHTML : htmlStr;

    const contentEl = document.getElementById("chapter-content");
    const cleanHTML = DOMPurify.sanitize(bodyContent);
    contentEl.innerHTML = cleanHTML;

    contentEl.style.transform = `translateX(0px)`;

    if (!preservePage) {
        state.currentPageIndex = 0;
    }

    setTimeout(() => {
        recalculatePagination();

        state.currentPageIndex = Math.min(
            state.currentPageIndex,
            state.maxPagesInChapter - 1,
        );

        renderCurrentPagePosition();
        updateStatusBar();
    }, 150);
}

async function resolveEmbeddedAssets(htmlContent, currentChapterFullPath) {
    const currentDir =
        currentChapterFullPath.substring(
            0,
            currentChapterFullPath.lastIndexOf("/"),
        ) + "/";
    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlContent, "text/html");
    const images = doc.querySelectorAll("img, image");

    for (let img of images) {
        let srcAttr =
            img.tagName.toLowerCase() === "image" ? "xlink:href" : "src";
        let rawSrc = img.getAttribute(srcAttr);
        if (
            rawSrc &&
            !rawSrc.startsWith("data:") &&
            !rawSrc.startsWith("http")
        ) {
            let absoluteImgPath = resolveRelativePath(currentDir, rawSrc);
            let imgFile = state.zip.file(absoluteImgPath);
            if (imgFile) {
                let blob = await imgFile.async("blob");
                let blobUrl = URL.createObjectURL(blob);
                state.blobUrls.push(blobUrl);
                if (img.tagName.toLowerCase() === "image") {
                    let newImg = document.createElement("img");
                    newImg.src = blobUrl;
                    img.parentNode.replaceChild(newImg, img);
                } else {
                    img.setAttribute("src", blobUrl);
                }
            }
        }
    }
    return doc.documentElement.innerHTML;
}

function resolveRelativePath(base, relative) {
    let stack = base.split("/"),
        parts = relative.split("/");
    stack.pop();
    for (let i = 0; i < parts.length; i++) {
        if (parts[i] == ".") continue;
        if (parts[i] == "..") stack.pop();
        else stack.push(parts[i]);
    }
    return stack.filter((p) => p !== "").join("/");
}

function recalculatePagination() {
    const contentEl = document.getElementById("chapter-content");
    const viewEl = document.getElementById("reader-view");

    const totalWidth = contentEl.scrollWidth;
    const viewWidth = viewEl.clientWidth - 80;

    state.maxPagesInChapter = Math.ceil(totalWidth / (viewWidth + 40));
    if (state.maxPagesInChapter < 1) state.maxPagesInChapter = 1;
}

function navigatePage(direction) {
    const contentEl = document.getElementById("chapter-content");
    const viewEl = document.getElementById("reader-view");
    const stepWidth = viewEl.clientWidth - 40;

    let targetPage = state.currentPageIndex + direction;

    if (targetPage < 0) {
        if (state.currentChapterIndex > 0) {
            state.currentChapterIndex--;
            loadChapter(state.currentChapterIndex).then(() => {
                state.currentPageIndex = state.maxPagesInChapter - 1;
                renderCurrentPagePosition();
            });
        }
        return;
    } else if (targetPage >= state.maxPagesInChapter) {
        if (state.currentChapterIndex < state.spine.length - 1) {
            navigateChapter(1);
        }
        return;
    }

    state.currentPageIndex = targetPage;
    renderCurrentPagePosition();
    saveBookProgress();
}

function renderCurrentPagePosition() {
    const contentEl = document.getElementById("chapter-content");
    const viewEl = document.getElementById("reader-view");
    const multiplier = state.pageMode === "double" ? 2 : 1;
    const stepWidth = viewEl.clientWidth - 40;

    const offset = -(state.currentPageIndex * stepWidth);
    contentEl.style.transform = `translateX(${offset}px)`;
    updateStatusBar();
}

function navigateChapter(direction) {
    let targetChapter = state.currentChapterIndex + direction;
    if (targetChapter >= 0 && targetChapter < state.spine.length) {
        state.currentPageIndex = 0;
        loadChapter(targetChapter);
    }
}

function jumpToProgress(e) {
    const rect = document
        .getElementById("progress-container")
        .getBoundingClientRect();
    const clickRatio = (e.clientX - rect.left) / rect.width;
    const targetChapterIndex = Math.floor(clickRatio * state.spine.length);
    loadChapter(targetChapterIndex);
}

function updateStatusBar() {
    document.getElementById("chapter-mark-indicator").innerText =
        `${t("ereader.chapter")} ${state.currentChapterIndex + 1} / ${state.spine.length} (${t("ereader.page")} ${state.currentPageIndex + 1}/${state.maxPagesInChapter})`;

    const globalProgress =
        (state.currentChapterIndex / state.spine.length) * 100;
    document.getElementById("progress-bar").style.width = `${globalProgress}%`;
    document.getElementById("progress-percent").innerText =
        `${Math.round(globalProgress)}%`;
}

function handleResize() {
    recalculatePagination();
    renderCurrentPagePosition();
}

function setupGlobalInteractions() {
    const viewEl = document.getElementById("reader-center");

    let swipe = {
        active: false,
        startX: 0,
        startY: 0,
        isTouch: false,
        threshold: 60,
        locked: false,
    };

    function handleSwipeEnd(dx, dy) {
        if (swipe.locked) return;

        if (Math.abs(dx) < swipe.threshold || Math.abs(dx) < Math.abs(dy)) {
            return;
        }

        swipe.locked = true;

        if (dx > 0) {
            navigatePage(-1);
        } else {
            navigatePage(1);
        }

        setTimeout(() => {
            swipe.locked = false;
        }, 250);
    }

    window.addEventListener("keydown", (e) => {
        if (e.ctrlKey && (e.key === "=" || e.key === "+")) {
            e.preventDefault();
            adjustFontSize(2);
        }
        if (e.ctrlKey && e.key === "-") {
            e.preventDefault();
            adjustFontSize(-2);
        }

        if (state.overrideVol) {
            if (e.key === "VolumeUp") navigatePage(-1);
            if (e.key === "VolumeDown") navigatePage(1);
        }
    });

    viewEl.addEventListener("mousedown", (e) => {
        if (e.button !== 0 && e.button !== 2) return;

        swipe.active = true;
        swipe.isTouch = false;
        swipe.startX = e.clientX;
        swipe.startY = e.clientY;
        swipe.button = e.button;
    });

    window.addEventListener("mousemove", (e) => {
        if (!swipe.active) return;

        const dx = e.clientX - swipe.startX;
        const dy = e.clientY - swipe.startY;
    });

    window.addEventListener("mouseup", (e) => {
        if (!swipe.active) return;

        const dx = e.clientX - swipe.startX;
        const dy = e.clientY - swipe.startY;

        swipe.active = false;
        handleSwipeEnd(dx, dy);
    });

    viewEl.addEventListener(
        "touchstart",
        (e) => {
            if (e.touches.length !== 1) return;

            swipe.active = true;
            swipe.isTouch = true;
            swipe.startX = e.touches[0].clientX;
            swipe.startY = e.touches[0].clientY;
        },
        { passive: true },
    );

    viewEl.addEventListener(
        "touchmove",
        (e) => {
            if (!swipe.active || e.touches.length !== 1) return;

            const dx = e.touches[0].clientX - swipe.startX;

            if (Math.abs(dx) > 10) {
                e.preventDefault();
            }
        },
        { passive: false },
    );

    viewEl.addEventListener("touchend", (e) => {
        if (!swipe.active) return;

        const touch = e.changedTouches[0];
        const dx = touch.clientX - swipe.startX;
        const dy = touch.clientY - swipe.startY;

        swipe.active = false;
        handleSwipeEnd(dx, dy);
    });

    document.addEventListener(
        "contextmenu",
        (e) => {
            e.preventDefault();
        },
        true,
    );

    state.orientationHandler = (e) => {
        if (!state.tiltFlip) return;

        if (e.gamma > 25) {
            debounceTilt(() => navigatePage(1));
        } else if (e.gamma < -25) {
            debounceTilt(() => navigatePage(-1));
        }
    };

    window.addEventListener("deviceorientation", state.orientationHandler);

    setTimeout(() => {
        if ("speechSynthesis" in window) {
            const voices = window.speechSynthesis.getVoices();
            const selector = document.getElementById("tts-voice");

            selector.innerHTML = voices
                .map(
                    (v) =>
                        `<option value="${v.name}">${v.name} (${v.lang})</option>`,
                )
                .join("");
        }
    }, 500);

    initTTS();
}

let tiltCooldown = false;
function debounceTilt(callback) {
    if (tiltCooldown) return;
    tiltCooldown = true;
    callback();
    setTimeout(() => (tiltCooldown = false), 1500);
}

function toggleSettingsMenu() {
    const overlay = document.getElementById("settings-overlay");
    const isHidden = overlay.style.display !== "block";
    overlay.style.display = isHidden ? "block" : "none";
    if (isHidden) {
        document.body.classList.add("settings-active");
    } else {
        document.body.classList.remove("settings-active");
        closeAllCornerDropdowns();
    }
}

function toggleOverlay(id, show) {
    document.getElementById(id).style.display = show ? "block" : "none";
}

function toggleDropdown(id) {
    const el = document.getElementById(id);
    el.style.display = el.style.display === "flex" ? "none" : "flex";
}

function closeAllCornerDropdowns() {
    document
        .querySelectorAll(".dropdown-menu")
        .forEach((el) => (el.style.display = "none"));
}

function toggleTheme() {
    state.theme = state.theme === "light" ? "dark" : "light";
    document.body.setAttribute("data-theme", state.theme);
}

function togglePageMode() {
    state.pageMode = state.pageMode === "single" ? "double" : "single";
    document.body.className =
        state.pageMode === "single" ? "mode-single" : "mode-double";
    recalculatePagination();
    renderCurrentPagePosition();
}

function adjustFontSize(delta) {
    state.fontSize = Math.max(12, Math.min(36, state.fontSize + delta));

    document.getElementById("chapter-content").style.fontSize =
        `${state.fontSize}px`;

    document.getElementById("font-size-display").textContent =
        `${state.fontSize}px`;

    setTimeout(() => {
        recalculatePagination();
        renderCurrentPagePosition();
    }, 100);
}
function updateFontScale(percent) {
    state.fontPercent = parseInt(percent);

    const fontPx = Math.round(25 * (state.fontPercent / 100));

    state.fontSize = fontPx;

    document.getElementById("chapter-content").style.fontSize = `${fontPx}px`;

    document.getElementById("font-size-display").textContent =
        `${state.fontPercent}%`;

    setTimeout(() => {
        recalculatePagination();
        renderCurrentPagePosition();
    }, 100);
}
function changeCustomStyle(type, value) {
    const content = document.getElementById("chapter-content");
    if (type === "bg")
        document.getElementById("reader-view").style.backgroundColor = value;
    if (type === "text") content.style.color = value;
    if (type === "font") content.style.fontFamily = value;
}

function toggleTextDecoration(style) {
    const content = document.getElementById("chapter-content");
    content.classList.toggle(`text-${style}`);
}

function toggleAutoScroll(secondsPerPage) {
    if (state.autoScrollInterval) {
        clearInterval(state.autoScrollInterval);
        state.autoScrollInterval = null;
    }

    let sec = parseInt(secondsPerPage);
    if (sec > 0) {
        state.autoScrollInterval = setInterval(() => {
            navigatePage(1);
        }, sec * 1000);
    }
}

function buildTocDOM() {
    const listEl = document.getElementById("toc-panel");

    if (!listEl) return;

    listEl.innerHTML = state.toc
        .map((item) => {
            const chapterIndex = state.spine.findIndex(
                (s) => s.split("#")[0] === item.href.split("#")[0],
            );

            return `
                <li onclick="
                    loadChapter(${chapterIndex});
                    toggleOverlay('toc-overlay', false);
                ">
                    ${item.title}
                </li>
            `;
        })
        .join("");
}

function speakText(text) {
    if (!text || !("speechSynthesis" in window)) return;

    window.speechSynthesis.cancel();

    if (state.currentUtterance) {
        state.currentUtterance.onend = null;
        state.currentUtterance.onerror = null;
        state.currentUtterance = null;
    }

    const u = new SpeechSynthesisUtterance(text);

    u.voice = state.tts.voice;
    u.rate = state.tts.rate;
    u.volume = state.tts.volume;

    u.onend = () => {
        state.tts.enabled = false;
        state.currentUtterance = null;
    };

    state.currentUtterance = u;
    window.speechSynthesis.speak(u);

    state.tts.enabled = true;
}
function initTTS() {
    if (!("speechSynthesis" in window)) return;

    const loadVoices = () => {
        state.tts.voices = window.speechSynthesis.getVoices();

        const selector = document.getElementById("tts-voice");
        selector.innerHTML = state.tts.voices
            .map(
                (v) =>
                    `<option value="${v.name}">
                        ${v.name} (${v.lang})
                    </option>`,
            )
            .join("");

        state.tts.voice = state.tts.voices[0] || null;
    };

    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;
}
document.getElementById("tts-voice").addEventListener("change", (e) => {
    const name = e.target.value;
    state.tts.voice = state.tts.voices.find((v) => v.name === name);
});
function toggleTTS() {
    const text = document.getElementById("chapter-content").innerText;

    if (!state.tts.enabled) {
        speakText(text);
    } else {
        window.speechSynthesis.cancel();
        state.tts.enabled = false;
    }
}
document.getElementById("tts-volume").addEventListener("input", (e) => {
    state.tts.volume = parseFloat(e.target.value);
});

document.getElementById("tts-speed").addEventListener("input", (e) => {
    state.tts.rate = parseFloat(e.target.value);
});
function changeUXSetting(key, value) {
    state.ux[key] = value;
    const contentEl = document.getElementById("chapter-content");
    const viewEl = document.getElementById("reader-view");

    switch (key) {
        case "lineSpacing":
            contentEl.style.lineHeight = value;
            break;
        case "margin":
            viewEl.style.paddingLeft = `${value}px`;
            viewEl.style.paddingRight = `${value}px`;
            break;
        case "paraSpacing":
            contentEl
                .querySelectorAll("p")
                .forEach((p) => (p.style.marginBottom = `${value}em`));
            break;
        case "hyphenation":
            contentEl.style.hyphens = value ? "auto" : "none";
            contentEl.style.webkitHyphens = value ? "auto" : "none";
            break;
        case "justification":
            contentEl.style.textAlign = value;
            break;
        case "brightness":
            updateBrightnessOverlay(value);
            break;
        case "texture":
            applyTextureTheme(value);
            break;
    }

    setTimeout(() => {
        recalculatePagination();
        renderCurrentPagePosition();
    }, 100);

    localStorage.setItem(`epub_ux_${state.bookId}`, JSON.stringify(state.ux));
}

function updateBrightnessOverlay(value) {
    let overlay = document.getElementById("app-brightness-overlay");
    if (!overlay) {
        overlay = document.createElement("div");
        overlay.id = "app-brightness-overlay";
        overlay.style =
            "position:fixed;top:0;left:0;width:100vw;height:100vh;pointer-events:none;z-index:99999;mix-blend-mode:multiply;";
        document.body.appendChild(overlay);
    }
    const opacity = (100 - value) / 100;
    overlay.style.backgroundColor = `rgba(0, 0, 0, ${opacity * 0.8})`;
}

function applyTextureTheme(textureType) {
    const viewEl = document.getElementById("reader-view");
    viewEl.classList.remove("texture-sepia", "texture-paper");
    if (textureType !== "none") {
        viewEl.classList.add(`texture-${textureType}`);
    }
}
function createHighlight(color = "yellow", hasNote = false) {
    const selection = window.getSelection();
    if (selection.isCollapsed || !selection.toString().trim()) return;

    const text = selection.toString();
    let note = "";
    if (hasNote) {
        note = prompt("Nhập ghi chú cho đoạn text này:", "") || "";
    }

    const highlightItem = {
        id: Date.now(),
        chapterIndex: state.currentChapterIndex,
        text: text,
        color: color,
        note: note,
        createdAt: Date.now(),
    };

    state.highlights.push(highlightItem);
    saveUserData();

    const range = selection.getRangeAt(0);
    const span = document.createElement("span");
    span.className = `epub-hl hl-${color}`;
    span.style.backgroundColor = color === "sepia" ? "#dfd491" : color;
    span.setAttribute("data-id", highlightItem.id);
    if (note) span.title = `Ghi chú: ${note}`;
    range.surroundContents(span);

    selection.removeAllRanges();
}

function toggleBookmark() {
    if (!state.bookId) return;
    const contentEl = document.getElementById("chapter-content");
    const textSnippet =
        contentEl.innerText.substring(0, 60).replace(/\n/g, " ") + "...";

    const existingIdx = state.bookmarks.findIndex(
        (b) =>
            b.chapterIndex === state.currentChapterIndex &&
            b.pageIndex === state.currentPageIndex,
    );

    if (existingIdx >= 0) {
        state.bookmarks.splice(existingIdx, 1);
    } else {
        state.bookmarks.push({
            chapterIndex: state.currentChapterIndex,
            pageIndex: state.currentPageIndex,
            textSnippet: textSnippet,
            time: Date.now(),
        });
    }
    saveUserData();
    renderBookmarksList();
}
async function searchFullTextInBook(keyword) {
    if (!keyword || keyword.trim().length < 2) return [];
    const cleanKeyword = keyword.toLowerCase().trim();
    const results = [];

    // Hiển thị loading UI nếu cần
    console.log("Đang tìm kiếm toàn văn...");

    for (let i = 0; i < state.spine.length; i++) {
        const href = state.spine[i];
        const path = resolveRelativePath(state.basePath, href);
        const fileEntry = state.zip.file(path);
        if (!fileEntry) continue;

        const htmlStr = await fileEntry.async("string");
        const parser = new DOMParser();
        const doc = parser.parseFromString(htmlStr, "text/html");
        const textContent = doc.body
            ? doc.body.textContent
            : doc.documentElement.textContent;

        let index = textContent.toLowerCase().indexOf(cleanKeyword);
        while (index !== -1) {
            const start = Math.max(0, index - 40);
            const end = Math.min(
                textContent.length,
                index + cleanKeyword.length + 40,
            );
            const snippet = textContent
                .substring(start, end)
                .replace(/\s+/g, " ")
                .trim();

            results.push({
                chapterIndex: i,
                chapterTitle: state.toc[i]?.title || `Chương ${i + 1}`,
                snippet: `...${snippet}...`,
                charOffset: index,
            });

            index = textContent.toLowerCase().indexOf(cleanKeyword, index + 1);
        }
    }
    return results;
}
function exportUserDataBackup() {
    const allProgress = JSON.parse(
        localStorage.getItem("epub_reader_progress") || "{}",
    );

    const backupData = {
        progress: allProgress[state.bookId] || null,
        bookmarks: state.bookmarks,
        highlights: state.highlights,
        ux: state.ux,
        exportedAt: Date.now(),
    };

    const dataStr =
        "data:text/json;charset=utf-8," +
        encodeURIComponent(JSON.stringify(backupData));
    const downloadAnchor = document.createElement("a");
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute(
        "download",
        `epub_backup_${state.bookId || "data"}.json`,
    );
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
}

function importUserDataBackup(fileEvent) {
    const file = fileEvent.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function (e) {
        try {
            const data = JSON.parse(e.target.result);
            if (data.ux) state.ux = data.ux;
            if (data.bookmarks) state.bookmarks = data.bookmarks;
            if (data.highlights) state.highlights = data.highlights;

            if (data.progress && state.bookId) {
                const allProgress = JSON.parse(
                    localStorage.getItem("epub_reader_progress") || "{}",
                );
                allProgress[state.bookId] = data.progress;
                localStorage.setItem(
                    "epub_reader_progress",
                    JSON.stringify(allProgress),
                );
                state.currentChapterIndex = data.progress.chapterIndex;
                state.currentPageIndex = data.progress.pageIndex;
            }

            saveUserData();
            loadChapter(state.currentChapterIndex, true);
            alert("Đồng bộ dữ liệu thành công!");
        } catch (err) {
            alert("Lỗi cấu trúc tệp backup: " + err.message);
        }
    };
    reader.readAsText(file);
}

function saveUserData() {
    if (!state.bookId) return;
    localStorage.setItem(
        `epub_bookmarks_${state.bookId}`,
        JSON.stringify(state.bookmarks),
    );
    localStorage.setItem(
        `epub_highlights_${state.bookId}`,
        JSON.stringify(state.highlights),
    );
}
