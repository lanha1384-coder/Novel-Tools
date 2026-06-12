const fileInput = document.getElementById("file");
const output = document.getElementById("output");
const btn = document.getElementById("download");

let finalTxt = "";
const getDisplayWidth = (str = "") => {
    let width = 0;

    for (const ch of str) {
        const code = ch.codePointAt(0);

        if (
            (code >= 0x1100 && code <= 0x115f) || // Hangul Jamo
            (code >= 0x2e80 && code <= 0xa4cf) || // CJK
            (code >= 0xac00 && code <= 0xd7a3) || // Hangul
            (code >= 0xf900 && code <= 0xfaff) || // CJK Compat
            (code >= 0xfe10 && code <= 0xfe6f) || // Fullwidth punct
            (code >= 0xff01 && code <= 0xff60) || // Fullwidth ASCII
            (code >= 0xffe0 && code <= 0xffe6) ||
            (code >= 0x3000 && code <= 0x303f) || // CJK punctuation
            (code >= 0x3040 && code <= 0x309f) || // Hiragana
            (code >= 0x30a0 && code <= 0x30ff) || // Katakana
            (code >= 0x31f0 && code <= 0x31ff)
        ) {
            width += 2;
        } else {
            width += 1;
        }
    }

    return width;
};
const padDisplayEnd = (str, targetWidth) => {
    const currentWidth = getDisplayWidth(str);

    if (currentWidth >= targetWidth) {
        return str;
    }

    return str + " ".repeat(targetWidth - currentWidth);
};
const wrapDisplayText = (text, maxWidth = 80) => {
    const lines = [];

    for (const rawLine of text.split("\n")) {
        let current = "";
        let currentWidth = 0;

        for (const ch of rawLine) {
            const w = getDisplayWidth(ch);

            if (currentWidth + w > maxWidth) {
                lines.push(current);
                current = ch;
                currentWidth = w;
            } else {
                current += ch;
                currentWidth += w;
            }
        }

        lines.push(current);
    }

    return lines.join("\n");
};
const splitterBox = document.createElement("div");
splitterBox.style.margin = "10px 0";

const splitterLength = document.createElement("input");

splitterLength.type = "number";
splitterLength.min = "1";
splitterLength.value = "11";

splitterLength.style.marginLeft = "15px";
splitterLength.style.width = "80px";

const splitterLengthLabel = document.createElement("label");
splitterLengthLabel.textContent = " Width: ";
splitterLengthLabel.appendChild(splitterLength);

const splitterOptions = [
    { label: "Dash (-----)", value: "dash" },
    { label: "Equal (=====)", value: "equal" },
    { label: "Star (***** )", value: "star" },
    { label: "Wave (~~~~~)", value: "wave" },
    { label: "Box (*====*)", value: "box" },
];

splitterOptions.forEach((opt) => {
    const label = document.createElement("label");
    label.style.marginRight = "10px";

    const radio = document.createElement("input");
    radio.type = "radio";
    radio.name = "splitter";
    radio.value = opt.value;

    label.appendChild(radio);
    label.appendChild(document.createTextNode(" " + opt.label));

    splitterBox.appendChild(label);
});
splitterBox.appendChild(splitterLengthLabel);

fileInput.parentNode.insertBefore(splitterBox, btn);

const getSplitter = () => {
    const selected = document.querySelector("input[name='splitter']:checked");

    let width = parseInt(splitterLength.value, 10);

    if (isNaN(width)) {
        width = 11;
    }

    switch (selected?.value) {
        case "dash":
            width = Math.max(3, width);
            return "\n" + "-".repeat(width) + "\n\n";

        case "equal":
            width = Math.max(3, width);
            return "\n" + "=".repeat(width) + "\n\n";

        case "star":
            width = Math.max(3, width);
            return "\n" + "*".repeat(width) + "\n\n";

        case "wave":
            width = Math.max(3, width);
            return "\n" + "~".repeat(width) + "\n\n";

        case "box":
            width = Math.max(1, width);
            return "\n*" + "=".repeat(width - 2) + "*\n\n";

        default:
            return "\n\n\n";
    }
};

fileInput.addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const zip = await JSZip.loadAsync(file);

    const container = await zip.file("META-INF/container.xml").async("string");

    const opfPathMatch = container.match(/full-path="([^"]+)"/);
    if (!opfPathMatch) {
        output.value = t("opf_not_found");
        return;
    }

    const opfPath = opfPathMatch[1];
    const opfText = await zip.file(opfPath).async("string");

    const parser = new DOMParser();
    const opfXml = parser.parseFromString(opfText, "application/xml");

    const title =
        opfXml.querySelector("title")?.textContent || t("book.no_title");

    const creator =
        opfXml.querySelector("creator")?.textContent || t("book.no_author");

    const getMetaContent = (xml, selector) =>
        xml.querySelector(selector)?.textContent?.trim() || "";

    const description =
        getMetaContent(opfXml, "description") ||
        getMetaContent(opfXml, "dc\\:description") ||
        getMetaContent(opfXml, "meta[name='description']");

    const comment =
        getMetaContent(opfXml, "meta[name='comment']") ||
        getMetaContent(opfXml, "dc\\:comment");

    const genreNodes = opfXml.querySelectorAll("subject, dc\\:subject");

    console.log("[DEBUG][GENRE] nodes found:", genreNodes.length);

    const genreList = Array.from(genreNodes)
        .map((el, idx) => {
            const text = el.textContent?.trim();

            console.log(`[DEBUG][GENRE][${idx}] raw:`, text);

            return text;
        })
        .filter(Boolean);

    const genre = genreList.join(", ");

    console.log("[DEBUG][GENRE] final:", genre);
    console.log("[DEBUG][GENRE] array:", genreList);

    const manifestItems = {};
    opfXml.querySelectorAll("manifest item").forEach((item) => {
        manifestItems[item.getAttribute("id")] = item.getAttribute("href");
    });

    const spine = [];
    opfXml.querySelectorAll("spine itemref").forEach((item) => {
        const idref = item.getAttribute("idref");
        if (manifestItems[idref]) spine.push(manifestItems[idref]);
    });

    const basePath = opfPath.split("/").slice(0, -1).join("/");

    const stripHTML = (html) => {
        const div = document.createElement("div");
        div.innerHTML = html;

        div.querySelectorAll("script,style,noscript").forEach((el) =>
            el.remove(),
        );

        const blockTags = div.querySelectorAll("p,div,br,h1,h2,h3,h4,h5,h6,li");

        blockTags.forEach((el) => {
            if (el.tagName === "BR") {
                el.replaceWith("\n");
            } else {
                el.append("\n");
            }
        });

        return div.textContent
            .replace(/\n\s+\n/g, "\n\n")
            .replace(/\n{3,}/g, "\n\n")
            .trim();
    };

    const isFakeChapter = (text, title, doc) => {
        if (!text || text.length < 200) return true;

        const normalized = text.toLowerCase();

        const tocSignals = ["table of contents", "mục lục", "contents"];
        const tocHits = tocSignals.filter((s) => normalized.includes(s)).length;
        if (tocHits >= 2 && text.length < 3000) return true;

        const aTags = doc.querySelectorAll("a");
        const linkCount = aTags.length;

        if (linkCount > 10) return true;

        const linkRatio = linkCount / (text.length || 1);
        if (linkRatio > 0.02) return true;

        return false;
    };

    const firstTenLengths = [];

    for (let i = 0; i < Math.min(10, spine.length); i++) {
        const filePath = basePath ? `${basePath}/${spine[i]}` : spine[i];

        const file = zip.file(filePath);
        if (!file) continue;

        const html = await file.async("string");
        const doc = parser.parseFromString(html, "text/html");

        const text = stripHTML(doc.body?.innerHTML || "");

        firstTenLengths.push({
            index: i,
            length: text.length,
            text,
        });
    }

    const avgLength =
        firstTenLengths.reduce((sum, x) => sum + x.length, 0) /
        (firstTenLengths.length || 1);

    const descriptionIndexes = new Set(
        firstTenLengths
            .filter((x) => x.length < avgLength * 0.3)
            .map((x) => x.index),
    );

    let extraDescription = firstTenLengths
        .filter((x) => descriptionIndexes.has(x.index))
        .map((x) => x.text)
        .join("\n\n");

    let chaptersTxt = "";

    for (let i = 0; i < spine.length; i++) {
        const filePath = basePath ? `${basePath}/${spine[i]}` : spine[i];

        const file = zip.file(filePath);
        if (!file) continue;

        const html = await file.async("string");
        const doc = parser.parseFromString(html, "text/html");

        const headings = [...doc.querySelectorAll("h1,h2,h3,h4,h5,h6")]
            .map((el) => el.textContent?.trim())
            .filter(Boolean);

        const chapterTitle =
            headings.find((t) => t.length < 120) ||
            doc.title?.trim() ||
            `${t("chapter")} ${i + 1}`;
        doc.querySelectorAll("h1,h2,h3,h4,h5,h6").forEach((el) => el.remove());

        const text = stripHTML(doc.body?.innerHTML || "")
            .split("\n")
            .filter(
                (line) =>
                    line.trim().toLowerCase() !== chapterTitle.toLowerCase(),
            )
            .join("\n");

        if (descriptionIndexes.has(i)) {
            continue;
        }

        if (isFakeChapter(text, chapterTitle, doc)) continue;

        chaptersTxt += `${chapterTitle}\n${text}\n{{SPLITTER}}`;
    }

    const makeTitleBox = (text) => {
        const middle = `|| ${text} ||`;

        const width = getDisplayWidth(middle);

        const line = "*" + "=".repeat(width - 2) + "*";

        return `${line}\n${middle}\n${line}`;
    };
    const wrapText = (text, width = 90) => {
        if (!text) return "";
        const words = text.split(" ");
        let lines = [],
            line = "";

        for (const w of words) {
            if ((line + w).length > width) {
                lines.push(line.trim());
                line = w + " ";
            } else {
                line += w + " ";
            }
        }

        if (line) lines.push(line.trim());
        return lines.join("\n");
    };

    const makeInfoBox = (text, maxBoxWidth = 80) => {
        const wrapped = wrapDisplayText(text, maxBoxWidth);

        const lines = wrapped.split("\n");

        const maxWidth = Math.max(...lines.map((l) => getDisplayWidth(l)));

        const border = "*" + "-".repeat(maxWidth) + "*";

        return (
            border +
            "\n" +
            lines.map((l) => `|${padDisplayEnd(l, maxWidth)}|`).join("\n") +
            "\n" +
            border
        );
    };

    const finalDescription = [description, comment, extraDescription]
        .filter(Boolean)
        .join("\n\n");
    finalTxt =
        makeTitleBox(title) +
        "\n\n" +
        makeInfoBox(
            `${t("author")}: ${creator} | ${t("genre")}: ${genre} | ${t("chapter.count")}: ${spine.length}\n\n${t("description")}:\n${finalDescription}`,
        ) +
        `\n{{SPLITTER}}` +
        chaptersTxt;
    renderOutput();
    btn.style.display = "inline-block";
});

const renderOutput = () => {
    const splitter = getSplitter();
    output.value = finalTxt.replaceAll("{{SPLITTER}}", splitter);
};

splitterBox.addEventListener("change", renderOutput);
splitterLength.addEventListener("input", renderOutput);

btn.addEventListener("click", () => {
    const blob = new Blob([output.value], {
        type: "text/plain",
    });

    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "converted.txt";
    a.click();
});
