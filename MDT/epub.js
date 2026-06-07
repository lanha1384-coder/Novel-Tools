let currentLang = localStorage.getItem("lang") || "vi-vn";
async function exportEPUB() {
    const metaInput = await getEPUBMetadata();
    if (!metaInput) return;
    const zip = new JSZip();
    const tExport = createI18nSnapshot();
    zip.file("mimetype", "application/epub+zip");

    const meta = zip.folder("META-INF");
    meta.file(
        "container.xml",
        `<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
    <rootfiles>
        <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
    </rootfiles>
</container>`,
    );

    const oebps = zip.folder("OEBPS");
    const chaptersXHTML =
        `
        <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml"/>
        <item id="desc" href="description.xhtml" media-type="application/xhtml+xml"/>
        <item id="chars" href="characters.xhtml" media-type="application/xhtml+xml"/>
        <item id="appendix" href="appendix.xhtml" media-type="application/xhtml+xml"/>
` +
        join("\n") +
        STORY_DATA.chapters.map(
            (ch, i) => `
    <item id="chap${i}" href="chap${i}.xhtml" media-type="application/xhtml+xml"/>
`,
        );
    const coverFile = document.getElementById("coverFile")?.files?.[0];
    const hasCover = !!coverFile;

    let manifestExtra = "";
    let spineItems = "";

    if (hasCover) {
        spineItems += `<itemref idref="coverpage"/>`;
    }

    spineItems += `<itemref idref="desc"/>`;
    spineItems += `<itemref idref="chars"/>`;
    spineItems += `<itemref idref="nav"/>`;

    spineItems += STORY_DATA.chapters
        .map((_, i) => `<itemref idref="chap${i}"/>`)
        .join("\n");

    spineItems += `<itemref idref="appendix"/>`;
    if (hasCover) {
        oebps.file("cover.jpg", coverFile);

        oebps.file(
            "cover.xhtml",
            `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
    <title>Cover</title>
</head>
<body style="margin:0;text-align:center;">
    <img src="cover.jpg" style="width:100%;" />
</body>
</html>`,
        );

        manifestExtra += `
            <item id="cover" href="cover.jpg" media-type="image/jpeg"/>
            <item id="coverpage" href="cover.xhtml" media-type="application/xhtml+xml"/>
        `;
    }
    const contentOpf = `
<package version="3.0" xmlns="http://www.idpf.org/2007/opf">

<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">

    <dc:title>${escapeHTML(STORY_DATA.title)}</dc:title>

    <dc:creator>${escapeHTML(metaInput.author)}</dc:creator>

    <dc:language>${getEPUBLang()}</dc:language>

    <dc:description>${escapeHTML(STORY_DATA.description)}</dc:description>

    ${metaInput.subjects
        .map((s) => `<dc:subject>${escapeHTML(s)}</dc:subject>`)
        .join("\n")}

    <meta name="cover" content="cover"/>
</metadata>

<manifest>
    ${chaptersXHTML}
    ${manifestExtra}
</manifest>

<spine>
    ${spineItems}
</spine>

<guide>
    <reference type="cover" title="Cover" href="cover.xhtml"/>
</guide>

</package>`;

    oebps.file("content.opf", contentOpf);
    STORY_DATA.chapters.forEach((ch, i) => {
        const html = `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
    <title>${ch.title}</title>
</head>
<body>
    <h1>${ch.title}</h1>
    <pre>${escapeHTML(cleanChapterBody(ch.body))}</pre>
</body>
</html>`;

        oebps.file(`chap${i}.xhtml`, html);
    });
    oebps.file(
        "nav.xhtml",
        `
<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
    <title>${tExport("epub.toc_title", "Danh sách chương")}</title>
</head>
<body>
    <nav xmlns="http://www.w3.org/1999/xhtml" epub:type="toc">
        <h2>${tExport("epub.toc", "Mục lục")}</h2>
        <ol>
            ${STORY_DATA.chapters
                .map(
                    (ch, i) => `
                <li>
                    <a href="chap${i}.xhtml">${escapeHTML(ch.title)}</a>
                </li>
            `,
                )
                .join("")}
        </ol>
    </nav>
</body>
</html>
`,
    );
    oebps.file(
        "description.xhtml",
        `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
    <title>${tExport("epub.desc_title", "Mô tả")}</title>
</head>
<body>
    <h1>${tExport("epub.description_title", "Mô tả truyện")}</h1>

    <div style="white-space: pre-wrap;">
        ${escapeHTML(STORY_DATA.description)}
    </div>

</body>
</html>`,
    );

    oebps.file(
        "characters.xhtml",
        `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
    <title>${tExport("epub.characters_title", "Nhân vật")}</title>
</head>
<body>
    <h1>${tExport("epub.characters_title", "Danh sách nhân vật")}</h1>

    <pre>${escapeHTML(STORY_DATA.characters.join("\n"))}</pre>
</body>
</html>`,
    );
    const blob = await zip.generateAsync({ type: "blob" });

    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = (STORY_DATA.title || "story") + ".epub";
    a.click();
}
function escapeHTML(str) {
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}
function buildAppendixText(t) {
    return `
== ${t("epub.appendix", "PHỤ LỤC")} ==

${t("epub.total_chapters", "Tổng số chương")}: ${STORY_DATA.chapters.length}

${t("epub.characters", "Danh sách nhân vật")}:
${STORY_DATA.characters.join("\n")}

${t("epub.description", "Mô tả")}:
${STORY_DATA.description}
    `.trim();
}
function cleanChapterBody(text) {
    let t = String(text).trim();

    if (t.startsWith("•")) {
        t = t.slice(1);
    }

    if (t.endsWith("•")) {
        t = t.slice(0, -1);
    }

    return t.trim();
}
function getEPUBLang() {
    return currentLang || "vi";
}
function createI18nSnapshot() {
    const snap = { ...translations };

    return (key, fallback = key) => snap[key] ?? fallback;
}
