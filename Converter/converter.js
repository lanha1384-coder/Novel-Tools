const fileInput = document.getElementById("file");
const output = document.getElementById("output");
const btn = document.getElementById("download");

let state = {
    characters: [],
    characterFiles: [],
};

let finalTxt = "";

let renderMode = {
    open: "{",
    close: "}",
};

const delimiterModes = [
    { name: "{}", open: "{", close: "}" },
    { name: "⟨⟩", open: "⟨", close: "⟩" },
    { name: "⟦⟧", open: "⟦", close: "⟧" },
    { name: "⟪⟫", open: "⟪", close: "⟫" },
    { name: "⟬⟭", open: "⟬", close: "⟭" },
    { name: "⌈⌋", open: "⌈", close: "⌋" },
    { name: "⌊⌉", open: "⌊", close: "⌉" },
    { name: "⌜⌟", open: "⌜", close: "⌟" },
    { name: "⌞⌝", open: "⌞", close: "⌝" },
];

const modeContainer = document.createElement("div");
modeContainer.style.margin = "10px 0";

function renderModeUI() {
    modeContainer.innerHTML = "";
    delimiterModes.forEach((mode, idx) => {
        const label = document.createElement("label");
        label.style.marginRight = "10px";
        label.style.cursor = "pointer";

        const radio = document.createElement("input");
        radio.type = "radio";
        radio.name = "chapterMode";
        radio.value = idx;

        if (mode.open === renderMode.open && mode.close === renderMode.close) {
            radio.checked = true;
        }

        radio.addEventListener("change", () => {
            console.log("[DEBUG] renderMode change:", mode.name);
            renderMode.open = mode.open;
            renderMode.close = mode.close;

            if (window.__lastRender) {
                output.value = render(state.characters);
                console.log("[DEBUG] rerender success after mode change");
            }
        });

        label.appendChild(radio);
        label.appendChild(document.createTextNode(" " + mode.name));
        modeContainer.appendChild(label);
    });
}

document.body.insertBefore(modeContainer, fileInput);
renderModeUI();

let cachedData = {
    title: "",
    creator: "",
    genre: "",
    spine: [],
    finalDescription: "",
    validChapters: [],
    extraFilesInfo: "",
    renderMode,
};

const fileLog = (tag, msg) => console.log(`[DEBUG][${tag}]`, msg);

const render = (characters = []) => {
    let result = "";

    result += `<>\n${cachedData.title}\n</>\n\n`;

    result += `<info>\n`;
    result += `Author: ${cachedData.creator}\n`;
    result += `Genre: ${cachedData.genre}\n`;
    result += `Chapters: ${cachedData.validChapters.length}\n`;
    result += `${cachedData.finalDescription}\n`;
    if (cachedData.extraFilesInfo) {
        result += `\n[File Thừa Được Chỉ Định]:\n${cachedData.extraFilesInfo}`;
    }
    result += `</info>\n\n`;

    result += `[\n`;

    if (characters && characters.length) {
        characters.forEach((c) => {
            result += `- ${c}\n`;
        });
    }

    result += `]\n\n`;

    result += `<list>\n`;

    cachedData.validChapters.forEach((ch, idx) => {
        result += `${ch.title} ${renderMode.open}\n`;
        result += `•\n ${ch.text.trim()}\n`;
        result += `• ${renderMode.close}\n\n`;
    });

    result += `</list>`;

    return result;
};

function tokenizeStructure(str = "") {
    return (
        str
            .toLowerCase()
            .trim()
            .match(/\d+|[a-zA-ZÀ-ỹ]+|[^a-zA-ZÀ-ỹ\d]+/g) || []
    );
}

function normalizeTokens(tokens) {
    return tokens.map((token) => {
        if (/^\d+$/.test(token)) {
            return "[NUMBER]";
        }

        return token;
    });
}

function buildTemplate(samples) {
    if (!samples.length) return [];

    const tokenized = samples.map((s) => normalizeTokens(tokenizeStructure(s)));

    const maxLen = Math.max(...tokenized.map((t) => t.length));

    const template = [];

    for (let i = 0; i < maxLen; i++) {
        const values = tokenized.map((t) => t[i]);

        const first = values[0];

        const same = values.every((v) => v === first);

        template.push(same ? first : "[VAR]");
    }

    return template;
}

function templateScore(value, template) {
    if (!template.length) return 1;

    const tokens = normalizeTokens(tokenizeStructure(value));

    const maxLen = Math.max(tokens.length, template.length);

    let matched = 0;

    for (let i = 0; i < maxLen; i++) {
        if (template[i] === "[VAR]") {
            matched++;
            continue;
        }

        if (tokens[i] === template[i]) {
            matched++;
        }
    }

    return matched / maxLen;
}

fileInput.addEventListener("change", async (e) => {
    try {
        const file = e.target.files[0];
        if (!file) {
            fileLog("FILE", "no file selected (error)");
            return;
        }

        fileLog("FILE", "file selected success");
        const zip = await JSZip.loadAsync(file);
        fileLog("ZIP", "loaded success");
        const parser = new DOMParser();

        state.characterFiles = [];
        const loadCharacters = async (zip, parser) => {
            const allFiles = Object.keys(zip.files);
            const targetPaths = allFiles.filter((path) =>
                /(^|\/)(characters?|character)\.xhtml$/i.test(path),
            );

            if (targetPaths.length === 0) return null;
            state.characterFiles = targetPaths;

            const targetPath = targetPaths[0];
            fileLog("CHAR-DETECT", targetPath);

            const fileData = zip.file(targetPath);
            if (!fileData) return null;

            const html = await fileData.async("string");
            const doc = parser.parseFromString(html, "text/html");

            const pre = doc.querySelector("pre");
            let lines = [];

            if (pre) {
                lines = pre.textContent.split("\n");
            } else {
                lines = [...doc.querySelectorAll("li, p")].map(
                    (el) => el.textContent,
                );
            }

            const cleaned = lines
                .map((l) => l.trim())
                .filter(Boolean)
                .map((line) => line.replace(/^\d+\s*[\.\:\-]\s*/, ""));

            return cleaned;
        };

        const characters = (await loadCharacters(zip, parser)) || [];
        state.characters = characters;

        const container = await zip
            .file("META-INF/container.xml")
            ?.async("string");
        if (!container) {
            fileLog("CONTAINER", "not found (error)");
            output.value = "OPF not found";
            return;
        }

        const opfPathMatch = container.match(/full-path="([^"]+)"/);
        if (!opfPathMatch) return;

        const opfPath = opfPathMatch[1];
        const basePath = opfPath.split("/").slice(0, -1).join("/");
        const opfText = await zip.file(opfPath).async("string");
        const opfXml = parser.parseFromString(opfText, "application/xml");

        const title =
            opfXml.querySelector("title")?.textContent?.trim() || "no title";
        const creator =
            opfXml.querySelector("creator")?.textContent?.trim() || "no author";
        const genreNodes = opfXml.querySelectorAll("subject, dc\\:subject");

        console.log("[DEBUG][GENRE] Raw nodes count:", genreNodes.length);

        const genre = Array.from(genreNodes)
            .map((el, idx) => {
                const text = el.textContent?.trim();
                console.log(`[DEBUG][GENRE][${idx}]`, text);
                return text;
            })
            .filter(Boolean)
            .join(", ");

        console.log("[DEBUG][GENRE] Final parsed genre:", genre);
        const description =
            opfXml.querySelector("description")?.textContent?.trim() ||
            opfXml.querySelector("dc\\:description")?.textContent?.trim() ||
            "";

        const manifestItems = {};
        opfXml.querySelectorAll("manifest item").forEach((item) => {
            manifestItems[item.getAttribute("id")] = item.getAttribute("href");
        });

        const spine = [];
        opfXml.querySelectorAll("spine itemref").forEach((item) => {
            const idref = item.getAttribute("idref");
            if (manifestItems[idref]) spine.push(manifestItems[idref]);
        });

        const stripHTML = (html) => {
            const div = document.createElement("div");
            div.innerHTML = html;
            div.querySelectorAll("script,style,noscript").forEach((el) =>
                el.remove(),
            );
            div.querySelectorAll("br").forEach((el) => el.replaceWith("\n"));
            div.querySelectorAll("p,div,h1,h2,h3,h4,h5,h6,li").forEach((el) =>
                el.append("\n"),
            );
            return div.textContent.replace(/\n{3,}/g, "\n\n").trim();
        };

        const spineFilesData = [];
        for (let i = 0; i < spine.length; i++) {
            const relativePath = spine[i];
            const fullPath = basePath
                ? `${basePath}/${relativePath}`
                : relativePath;
            const fileData = zip.file(fullPath);
            let htmlText = "";
            let parsedDoc = null;
            let fileTitle = "";

            if (fileData) {
                htmlText = await fileData.async("string");
                parsedDoc = parser.parseFromString(htmlText, "text/html");
                fileTitle =
                    parsedDoc
                        .querySelector("h1,h2,h3,h4,h5,h6")
                        ?.textContent?.trim() ||
                    parsedDoc.title?.trim() ||
                    relativePath
                        .split("/")
                        .pop()
                        .replace(/\.x?html$/i, "");
            }

            let fileText = "";

            if (parsedDoc) {
                fileText = stripHTML(parsedDoc.body?.innerHTML || "");

                if (fileTitle) {
                    const normalizedTitle = fileTitle.trim().toLowerCase();

                    const bodyNodes = [
                        ...parsedDoc.querySelectorAll(
                            "h1,h2,h3,h4,h5,h6,p,div,pre,span,li",
                        ),
                    ];

                    const duplicatedTexts = bodyNodes
                        .map((node) => node.textContent?.trim())
                        .filter(
                            (text) =>
                                text && text.toLowerCase() === normalizedTitle,
                        );

                    duplicatedTexts.forEach((text) => {
                        const escaped = text.replace(
                            /[.*+?^${}()|[\]\\]/g,
                            "\\$&",
                        );

                        fileText = fileText.replace(
                            new RegExp(`^\\s*${escaped}\\s*\\n*`, "i"),
                            "",
                        );
                    });
                }
            }

            spineFilesData.push({
                index: i,
                filename: relativePath.split("/").pop(),
                fullPath: fullPath,
                relativePath: relativePath,
                title: fileTitle,
                doc: parsedDoc,
                text: fileText,
            });
        }

        let isV1Success = false;
        let validSpineIndexes = [];
        let extraFilesDetected = [];

        fileLog("DETECT", "Bắt đầu chạy quy trình kiểm tra...");
        let spamFile = spineFilesData.find((f) => {
            if (!f.doc) return false;
            const aTags = f.doc.querySelectorAll("a[href]");
            return aTags.length > 15;
        });

        if (spamFile) {
            fileLog(
                "V1-DETECT",
                `Tìm thấy file nghi vấn chứa spam mã liên kết: ${spamFile.relativePath}`,
            );

            const spamHrefs = Array.from(
                spamFile.doc.querySelectorAll("a[href]"),
            ).map((a) => {
                let hrefAttr = a.getAttribute("href");
                return hrefAttr.split("#")[0];
            });

            spineFilesData.forEach((f) => {
                const isPresentInSpam = spamHrefs.some(
                    (href) =>
                        href === f.relativePath ||
                        f.relativePath.endsWith(href) ||
                        href.endsWith(f.relativePath),
                );

                if (isPresentInSpam && f.index !== spamFile.index) {
                    validSpineIndexes.push(f.index);
                } else {
                    fileLog(
                        "V1-REMOVED",
                        `Loại bỏ chương khuyết/file spam: ${f.relativePath}`,
                    );
                }
            });

            isV1Success = true;
            fileLog(
                "V1-STATUS",
                "Áp dụng thành công Version 1. Không cần chạy quy trình File thừa.",
            );
        }

        if (!isV1Success) {
            fileLog(
                "V2-DETECT",
                "Không tìm thấy cấu trúc V1. Kích hoạt Version 2.",
            );

            const totalFiles = spineFilesData.length;
            let middleFiles = [];

            if (totalFiles > 14) {
                middleFiles = spineFilesData.slice(7, totalFiles - 7);
                if (middleFiles.length < 5) {
                    middleFiles = spineFilesData.slice(
                        Math.floor(totalFiles * 0.25),
                        Math.ceil(totalFiles * 0.75),
                    );
                }
            } else {
                middleFiles = spineFilesData.slice(
                    Math.floor(totalFiles / 4),
                    Math.ceil((totalFiles * 3) / 4),
                );
            }

            const filenameTemplate = buildTemplate(
                middleFiles.map((f) => f.filename),
            );

            const titleTemplate = buildTemplate(
                middleFiles.map((f) => f.title).filter(Boolean),
            );

            const checkV2Match = (fileObj) => {
                const filenameScore = templateScore(
                    fileObj.filename,
                    filenameTemplate,
                );

                let titleScore = 1;

                if (fileObj.title && titleTemplate.length) {
                    titleScore = templateScore(fileObj.title, titleTemplate);
                }

                const filenameValid = filenameScore >= 0.75;

                const titleValid = titleScore >= 0.75;

                if (filenameScore >= 0.9) {
                    return true;
                }

                const finalScore = filenameScore * 0.7 + titleScore * 0.3;

                return finalScore >= 0.75;
            };

            function debugV2(fileObj, filenameTemplate, titleTemplate) {
                console.log("[DEBUG][V2]", {
                    file: fileObj.filename,
                    title: fileObj.title,

                    filenameScore: templateScore(
                        fileObj.filename,
                        filenameTemplate,
                    ),

                    titleScore: templateScore(fileObj.title, titleTemplate),
                });
            }

            spineFilesData.forEach((f) => {
                if (f.index < 7 || f.index >= totalFiles - 7) {
                    debugV2(f, filenameTemplate, titleTemplate);

                    let isNormalChapter = checkV2Match(f);
                    if (isNormalChapter) {
                        validSpineIndexes.push(f.index);
                    } else {
                        extraFilesDetected.push(f);
                        fileLog(
                            "V2-DETECT-EXTRA",
                            `Phát hiện file thừa: ${f.relativePath} | Title: ${f.title}`,
                        );
                    }
                } else {
                    validSpineIndexes.push(f.index);
                }
            });
        }

        let extraRenderedText = "";

        if (!isV1Success && extraFilesDetected.length > 0) {
            fileLog(
                "PROCESS-EXTRA",
                `Bắt đầu xử lý ${extraFilesDetected.length} file thừa.`,
            );

            for (const extraFile of extraFilesDetected) {
                let isCharacterException = state.characterFiles.some(
                    (charPath) =>
                        charPath === extraFile.fullPath ||
                        charPath.endsWith(extraFile.relativePath),
                );

                if (isCharacterException) {
                    fileLog(
                        "EXTRA-EXCEPTION",
                        `Tự động bỏ qua file nhân vật: ${extraFile.relativePath}`,
                    );
                    continue;
                }

                let userChoice = prompt(
                    `Phát hiện FILE THỪA cấu trúc: "${extraFile.filename}"\nTiêu đề: "${extraFile.title}"\n\n` +
                        `Vui lòng nhập số để chọn phương án xử lý:\n` +
                        `1. Không render (Loại bỏ hoàn toàn không hiển thị)\n` +
                        `2. Render vào phần mô tả (<info>)`,
                    "1",
                );

                if (userChoice === "2") {
                    fileLog(
                        "EXTRA-ACTION",
                        `Người dùng chọn: Render vào mục chỉ định <info> cho file ${extraFile.filename}`,
                    );
                    extraRenderedText += `--- File Thừa: ${extraFile.title || extraFile.filename} ---\n${extraFile.text}\n\n`;
                } else {
                    fileLog(
                        "EXTRA-ACTION",
                        `Người dùng chọn: Loại bỏ hoàn toàn file ${extraFile.filename}`,
                    );
                }
            }
        }

        let validChapters = [];
        const normalizeTitle = (title, index) => {
            const cleaned = (title || "").trim();
            const regex = new RegExp(`^\\s*0*${index + 1}[\\.|\\-|\\s]+`, "i");
            return cleaned.replace(regex, "").trim();
        };

        validSpineIndexes.sort((a, b) => a - b);
        validSpineIndexes.forEach((spineIdx) => {
            const fileObj = spineFilesData[spineIdx];
            let chapterTitle = fileObj.title || `Chapter ${spineIdx + 1}`;
            chapterTitle = normalizeTitle(chapterTitle, spineIdx);

            validChapters.push({
                title: chapterTitle,
                text: fileObj.text,
            });
        });

        cachedData = {
            title,
            creator,
            genre,
            spine,
            finalDescription: description,
            validChapters: validChapters,
            extraFilesInfo: extraRenderedText,
        };

        window.__lastRender = true;

        finalTxt = render(state.characters);
        output.value = finalTxt;

        fileLog("RENDER", "Hoàn tất quá trình tối ưu và kết xuất dữ liệu.");
        btn.style.display = "inline-block";
    } catch (err) {
        console.log("[DEBUG][ERROR]", err);
    }
});

btn.addEventListener("click", () => {
    try {
        const blob = new Blob([output.value], { type: "text/plain" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = "converted.txt";
        a.click();
        console.log("[DEBUG][DOWNLOAD] success");
    } catch (err) {
        console.log("[DEBUG][DOWNLOAD-ERROR]", err);
    }
});
