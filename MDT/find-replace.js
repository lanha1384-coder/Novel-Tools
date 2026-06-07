(function () {
    let box = null;
    let history = { find: [], replace: [] };
    let undoStack = [];
    let redoStack = [];
    let currentMatchIndex = -1;
    let matches = [];
    let isDragging = false;
    let dragStartX, dragStartY, boxStartX, boxStartY;

    const STORAGE_KEY_FIND = "fnr_history_find";
    const STORAGE_KEY_REPLACE = "fnr_history_replace";

    let globalMouseMoveHandler = null;
    let globalMouseUpHandler = null;
    let globalClickHandler = null;

    function loadHistory() {
        try {
            history.find =
                JSON.parse(localStorage.getItem(STORAGE_KEY_FIND)) || [];
            history.replace =
                JSON.parse(localStorage.getItem(STORAGE_KEY_REPLACE)) || [];
        } catch (e) {
            history = { find: [], replace: [] };
        }
    }

    function saveHistory(type, value) {
        if (!value) return;
        let list = history[type];
        list = list.filter((item) => item !== value);
        list.unshift(value);
        if (list.length > 50) list.pop();
        history[type] = list;
        localStorage.setItem(
            type === "find" ? STORAGE_KEY_FIND : STORAGE_KEY_REPLACE,
            JSON.stringify(list),
        );
        updateHistoryDropdown(type);
    }

    // YÊU CẦU 1: Xuất lịch sử tìm kiếm dưới dạng file JSON cấu trúc {"find": "replace"}
    function exportHistoryJSON() {
        let exportObj = {};
        history.find.forEach((findVal, index) => {
            if (findVal) {
                let replaceVal = history.replace[index];
                exportObj[findVal] =
                    replaceVal !== undefined && replaceVal !== null
                        ? replaceVal
                        : "";
            }
        });

        const dataStr =
            "data:text/json;charset=utf-8," +
            encodeURIComponent(JSON.stringify(exportObj, null, 4));
        const downloadAnchor = document.createElement("a");
        downloadAnchor.setAttribute("href", dataStr);
        downloadAnchor.setAttribute("download", "fnr_history.json");
        document.body.appendChild(downloadAnchor);
        downloadAnchor.click();
        downloadAnchor.remove();
    }

    // YÊU CẦU 2: Nhập dữ liệu từ file JSON hỗ trợ Overwrite và Add (Xử lý trùng lặp)
    function importHistoryJSON(fileEvent) {
        const file = fileEvent.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = function (e) {
            try {
                const importedData = JSON.parse(e.target.result);
                if (
                    typeof importedData !== "object" ||
                    importedData === null ||
                    Array.isArray(importedData)
                ) {
                    alert("Định dạng file JSON không hợp lệ!");
                    return;
                }

                // Lựa chọn Mode Import bằng hộp thoại xác nhận trực quan
                const modeChoice = window.confirm(
                    "Bấm [OK] để chọn chế độ OVERWRITE (Xoá toàn bộ lịch sử cũ).\nBấm [Cancel] để chọn chế độ ADD (Chỉ thêm mới hoặc cập nhật).",
                );

                if (modeChoice) {
                    // CHẾ ĐỘ OVERWRITE
                    history.find = [];
                    history.replace = [];
                    for (const [findVal, replaceVal] of Object.entries(
                        importedData,
                    )) {
                        if (findVal) {
                            history.find.push(findVal);
                            history.replace.push(replaceVal || "");
                        }
                    }
                } else {
                    // CHẾ ĐỘ ADD
                    let askDuplicate = true;
                    let overwriteAllDuplicates = false;

                    for (const [findVal, replaceVal] of Object.entries(
                        importedData,
                    )) {
                        if (!findVal) continue;

                        const existingIndex = history.find.indexOf(findVal);
                        const cleanReplaceVal = replaceVal || "";

                        if (existingIndex !== -1) {
                            // Xử lý khi phát hiện trùng dòng cũ
                            if (askDuplicate) {
                                const confirmOverwrite = window.confirm(
                                    `Phát hiện từ khoá trùng lặp: "${findVal}"\n\nBấm [OK] để Ghi đè (Overwrite) giá trị mới.\nBấm [Cancel] để Giữ nguyên (Keep) giá trị cũ.`,
                                );
                                overwriteAllDuplicates = confirmOverwrite;
                                // Nếu muốn tối ưu không hỏi lại nhiều lần, có thể bỏ comment dòng dưới:
                                // askDuplicate = false;
                            }
                            if (overwriteAllDuplicates) {
                                history.replace[existingIndex] =
                                    cleanReplaceVal;
                            }
                        } else {
                            // Nếu chưa có thì chèn thẳng vào đầu danh sách
                            history.find.unshift(findVal);
                            history.replace.unshift(cleanReplaceVal);
                        }
                    }
                }

                // Giới hạn dung lượng lưu trữ tối đa 50 phần tử
                if (history.find.length > 50)
                    history.find = history.find.slice(0, 50);
                if (history.replace.length > 50)
                    history.replace = history.replace.slice(0, 50);

                // Lưu lại vào bộ nhớ trình duyệt và cập nhật UI
                localStorage.setItem(
                    STORAGE_KEY_FIND,
                    JSON.stringify(history.find),
                );
                localStorage.setItem(
                    STORAGE_KEY_REPLACE,
                    JSON.stringify(history.replace),
                );
                updateHistoryDropdown("find");
                updateHistoryDropdown("replace");
                alert("Đã nhập dữ liệu lịch sử thành công!");
            } catch (err) {
                alert("Lỗi khi đọc file JSON: " + err.message);
            }
        };
        reader.readAsText(file);
        fileEvent.target.value = ""; // Reset input file để có thể chọn lại cùng 1 file
    }

    function saveStateForUndo() {
        if (undoStack.length >= 30) undoStack.shift();
        undoStack.push(JSON.stringify(STORY_DATA));
        redoStack = [];
    }

    function performUndo() {
        if (undoStack.length === 0) return;
        redoStack.push(JSON.stringify(STORY_DATA));
        STORY_DATA = JSON.parse(undoStack.pop());
        if (typeof buildSearchIndex === "function") buildSearchIndex();
        if (typeof renderStory === "function") renderStory();
        findMatches();
    }

    function performRedo() {
        if (redoStack.length === 0) return;
        undoStack.push(JSON.stringify(STORY_DATA));
        STORY_DATA = JSON.parse(redoStack.pop());
        if (typeof buildSearchIndex === "function") buildSearchIndex();
        if (typeof renderStory === "function") renderStory();
        findMatches();
    }

    function injectStyles() {
        if (document.getElementById("fnr-styles")) return;
        const style = document.createElement("style");
        style.id = "fnr-styles";
        style.innerHTML = `
            .fnr-box { position: fixed; top: 20px; right: 20px; width: 380px; background: #1e1e1e; color: #cccccc; border: 1px solid #454545; font-family: Segoe UI, sans-serif; font-size: 13px; z-index: 99999; box-shadow: 0 4px 10px rgba(0,0,0,0.5); user-select: none; border-radius: 4px; }
            .fnr-header { background: #2d2d2d; padding: 6px 10px; cursor: move; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #454545; font-weight: bold; }
            .fnr-body { padding: 10px; display: flex; flex-direction: column; gap: 8px; }
            .fnr-row { display: flex; gap: 6px; align-items: center; position: relative; }
            .fnr-input-wrapper { flex: 1; position: relative; display: flex; align-items: center; }
            .fnr-input { width: 100%; background: #3c3c3c; color: #cccccc; border: 1px solid #3c3c3c; padding: 4px 24px 4px 6px; font-size: 13px; box-sizing: border-box; }
            .fnr-input:focus { border-color: #007acc; outline: none; }
            .fnr-dropdown-btn { position: absolute; right: 4px; background: transparent; border: none; color: #858585; cursor: pointer; padding: 2px; font-size: 10px; }
            .fnr-dropdown-btn:hover { color: #cccccc; }
            .fnr-select-list { position: absolute; top: 100%; left: 0; right: 0; background: #2d2d2d; border: 1px solid #454545; max-height: 150px; overflow-y: auto; z-index: 100000; display: none; box-shadow: 0 4px 8px rgba(0,0,0,0.3); }
            .fnr-select-item { padding: 4px 8px; cursor: pointer; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
            .fnr-select-item:hover { background: #007acc; color: #fff; }
            .fnr-radio-group { display: flex; gap: 10px; padding: 2px 0; }
            .fnr-radio-label { display: flex; align-items: center; gap: 4px; cursor: pointer; }
            .fnr-radio-label input { margin: 0; cursor: pointer; }
            .fnr-btn-group { display: flex; gap: 4px; justify-content: flex-end; }
            .fnr-btn { background: #0e639c; color: #ffffff; border: none; padding: 4px 10px; cursor: pointer; font-size: 12px; border-radius: 2px; min-width: 60px; text-align: center; }
            .fnr-btn:hover { background: #1177bb; }
            .fnr-btn-secondary { background: #3a3a3a; color: #cccccc; }
            .fnr-btn-secondary:hover { background: #4a4a4a; }
            .fnr-counter { font-size: 11px; color: #858585; min-width: 40px; text-align: right; margin-right: 4px; }
            .fnr-divider { height: 1px; background: #454545; margin: 4px 0; }
        `;
        document.head.appendChild(style);
    }

    function createBox() {
        if (box) return;
        injectStyles();
        loadHistory();

        box = document.createElement("div");
        box.className = "fnr-box";
        box.innerHTML = `
            <div class="fnr-header">
                <span data-i18n="edit.title">Find & Replace</span>
                <span style="cursor:pointer;" id="fnr-close-x">×</span>
            </div>
            <div class="fnr-body">
                <div class="fnr-row">
                    <div class="fnr-input-wrapper">
                        <input type="text" id="fnr-find-input" class="fnr-input" placeholder="Find">
                        <button class="fnr-dropdown-btn" id="fnr-find-drop-btn">▼</button>
                        <div class="fnr-select-list" id="fnr-find-list"></div>
                    </div>
                    <div class="fnr-counter" id="fnr-match-counter">0/0</div>
                    <button class="fnr-btn fnr-btn-secondary" style="min-width:30px;padding:4px;" id="fnr-prev-btn" data-i18n="edit.opt.prev">◀</button>
                    <button class="fnr-btn fnr-btn-secondary" style="min-width:30px;padding:4px;" id="fnr-next-btn" data-i18n="edit.opt.next">▶</button>
                </div>
                <div class="fnr-row">
                    <div class="fnr-input-wrapper">
                        <input type="text" id="fnr-replace-input" class="fnr-input" placeholder="Replace">
                        <button class="fnr-dropdown-btn" id="fnr-replace-drop-btn">▼</button>
                        <div class="fnr-select-list" id="fnr-replace-list"></div>
                    </div>
                </div>
                <div class="fnr-radio-group">
                    <label class="fnr-radio-label">
                        <input type="radio" name="fnr-mode" value="all" checked>
                        <span data-i18n="edit.opt.match.all">Match Whole</span>
                    </label>
                    <label class="fnr-radio-label">
                        <input type="radio" name="fnr-mode" value="around">
                        <span data-i18n="edit.opt.match.around">Match Partial</span>
                    </label>
                    <label class="fnr-radio-label">
                        <input type="radio" name="fnr-mode" value="regex">
                        <span data-i18n="edit.opt.regex">Regex</span>
                    </label>
                </div>
                <div class="fnr-btn-group">
                    <button class="fnr-btn" id="fnr-replace-btn" data-i18n="edit.opt.replace">Replace</button>
                    <button class="fnr-btn" id="fnr-replace-all-btn" data-i18n="edit.opt.replace.all">All</button>
                    <button class="fnr-btn fnr-btn-secondary" id="fnr-cancel-btn" data-i18n="edit.opt.cancel">Cancel</button>
                </div>
                <div class="fnr-divider"></div>
                <div class="fnr-btn-group" style="justify-content: flex-start; gap: 6px;">
                    <button class="fnr-btn fnr-btn-secondary" id="fnr-export-btn">Export JSON</button>
                    <button class="fnr-btn fnr-btn-secondary" id="fnr-import-btn">Import JSON</button>
                    <input type="file" id="fnr-file-input" accept=".json" style="display: none;" />
                </div>
            </div>
        `;
        document.body.appendChild(box);
        initEvents();
        if (typeof applyI18n === "function") applyI18n(box);
        updateHistoryDropdown("find");
        updateHistoryDropdown("replace");
        document.getElementById("fnr-find-input").focus();
    }

    function updateHistoryDropdown(type) {
        const listContainer = document.getElementById(`fnr-${type}-list`);
        if (!listContainer) return;
        listContainer.innerHTML = "";
        history[type].forEach((val) => {
            const item = document.createElement("div");
            item.className = "fnr-select-item";
            item.innerText = val;
            item.addEventListener("click", () => {
                const input = document.getElementById(`fnr-${type}-input`);
                input.value = val;
                listContainer.style.display = "none";
                if (type === "find") findMatches();
            });
            listContainer.appendChild(item);
        });
    }

    function closeBox() {
        if (!box) return;

        if (globalMouseMoveHandler)
            document.removeEventListener("mousemove", globalMouseMoveHandler);
        if (globalMouseUpHandler)
            document.removeEventListener("mouseup", globalMouseUpHandler);
        if (globalClickHandler)
            document.removeEventListener("click", globalClickHandler);

        box.remove();
        box = null;
        matches = [];
        currentMatchIndex = -1;
    }

    function getSearchRegex(text, mode) {
        if (!text) return null;
        try {
            if (mode === "regex") return new RegExp(text, "g");
            let escaped = text.replace(/[-\/\\^$*+?.()|[\]{}]/g, "\\$&");
            if (mode === "all") return new RegExp("\\b" + escaped + "\\b", "g");
            if (mode === "around") return new RegExp(escaped, "gi");
        } catch (e) {
            return null;
        }
        return null;
    }

    function findMatches() {
        if (!box) return;
        matches = [];
        const findValue = document.getElementById("fnr-find-input").value;
        if (!findValue) {
            currentMatchIndex = -1;
            updateCounter();
            return;
        }
        const mode = box.querySelector('input[name="fnr-mode"]:checked').value;
        const regex = getSearchRegex(findValue, mode);
        if (!regex) return;

        if (typeof buildSearchIndex === "function") buildSearchIndex();

        if (
            typeof SEARCH_INDEX !== "undefined" &&
            Array.isArray(SEARCH_INDEX)
        ) {
            SEARCH_INDEX.forEach((item) => {
                const text = item.getText();
                let match;
                regex.lastIndex = 0;
                while ((match = regex.exec(text)) !== null) {
                    if (match.index === regex.lastIndex) regex.lastIndex++;
                    matches.push({
                        searchItem: item,
                        start: match.index,
                        end: regex.lastIndex,
                        matchedText: match[0],
                    });
                }
            });
        }

        if (matches.length > 0) {
            if (
                currentMatchIndex === -1 ||
                currentMatchIndex >= matches.length
            ) {
                currentMatchIndex = 0;
            }
            focusMatchOnUI();
        } else {
            currentMatchIndex = -1;
        }
        updateCounter();
    }

    function focusMatchOnUI() {
        if (currentMatchIndex === -1 || matches.length === 0) return;
        const currentMatch = matches[currentMatchIndex];
        const type = currentMatch.searchItem.type;
        const index = currentMatch.searchItem.index;
        let selector = "";

        if (type === "title") selector = "h1, .story-title, #story-title";
        else if (type === "description") selector = "details:nth-of-type(1)";
        else if (type === "characters") selector = "details:nth-of-type(2)";
        else if (type === "chapter-title" || type === "chapter-body") {
            selector = `details[data-index="${index}"]`;
        }

        if (selector) {
            const detailsEl =
                document.querySelector(`#app ${selector}`) ||
                document.querySelector(selector);
            if (detailsEl) {
                if (detailsEl.tagName === "DETAILS") {
                    detailsEl.open = true;
                    const parentDetails =
                        detailsEl.parentElement.closest("details");
                    if (parentDetails) parentDetails.open = true;
                }
                detailsEl.scrollIntoView({
                    behavior: "smooth",
                    block: "center",
                });
            }
        }
    }

    function updateCounter() {
        const counter = document.getElementById("fnr-match-counter");
        if (!counter) return;
        if (matches.length === 0) {
            counter.innerText = "0/0";
        } else {
            counter.innerText = `${currentMatchIndex + 1}/${matches.length}`;
        }
    }

    function navigateMatch(direction) {
        if (matches.length === 0) return;
        if (direction === "next") {
            currentMatchIndex = (currentMatchIndex + 1) % matches.length;
        } else {
            currentMatchIndex =
                (currentMatchIndex - 1 + matches.length) % matches.length;
        }
        focusMatchOnUI();
        updateCounter();
    }

    function replaceSingle() {
        if (currentMatchIndex === -1 || matches.length === 0) return;
        if (typeof STORY_DATA === "undefined") return;

        saveStateForUndo();
        const replaceValue = document.getElementById("fnr-replace-input").value;
        const findValue = document.getElementById("fnr-find-input").value;
        saveHistory("find", findValue);
        saveHistory("replace", replaceValue);

        const match = matches[currentMatchIndex];
        const item = match.searchItem;

        if (item.type === "title") {
            STORY_DATA.title = modifyString(
                STORY_DATA.title,
                match.start,
                match.end,
                replaceValue,
            );
        } else if (item.type === "description") {
            STORY_DATA.description = modifyString(
                STORY_DATA.description,
                match.start,
                match.end,
                replaceValue,
            );
        } else if (item.type === "characters") {
            let fullText = STORY_DATA.characters.join("\n");
            fullText = modifyString(
                fullText,
                match.start,
                match.end,
                replaceValue,
            );
            STORY_DATA.characters = fullText.split("\n");
        } else if (item.type === "chapter-title") {
            item.ref.title = modifyString(
                item.ref.title,
                match.start,
                match.end,
                replaceValue,
            );
            item.ref.edited = true;
        } else if (item.type === "chapter-body") {
            item.ref.body = modifyString(
                item.ref.body,
                match.start,
                match.end,
                replaceValue,
            );
            item.ref.edited = true;
        }

        if (typeof renderStory === "function") renderStory();
        findMatches();
    }

    function replaceAll() {
        const findValue = document.getElementById("fnr-find-input").value;
        if (!findValue || typeof STORY_DATA === "undefined") return;

        saveStateForUndo();
        const replaceValue = document.getElementById("fnr-replace-input").value;
        saveHistory("find", findValue);
        saveHistory("replace", replaceValue);

        const mode = box.querySelector('input[name="fnr-mode"]:checked').value;
        const regex = getSearchRegex(findValue, mode);
        if (!regex) return;

        STORY_DATA.title = STORY_DATA.title.replace(regex, replaceValue);
        STORY_DATA.description = STORY_DATA.description.replace(
            regex,
            replaceValue,
        );

        let charText = STORY_DATA.characters.join("\n");
        STORY_DATA.characters = charText
            .replace(regex, replaceValue)
            .split("\n");

        if (Array.isArray(STORY_DATA.chapters)) {
            STORY_DATA.chapters.forEach((ch) => {
                let isChanged = false;
                if (regex.test(ch.title)) {
                    ch.title = ch.title.replace(regex, replaceValue);
                    isChanged = true;
                }
                if (regex.test(ch.body)) {
                    ch.body = ch.body.replace(regex, replaceValue);
                    isChanged = true;
                }
                if (isChanged) ch.edited = true;
            });
        }

        if (typeof renderStory === "function") renderStory();
        currentMatchIndex = -1;
        findMatches();
    }

    function modifyString(str, start, end, replaceText) {
        return str.substring(0, start) + replaceText + str.substring(end);
    }

    function initEvents() {
        const header = box.querySelector(".fnr-header");

        header.addEventListener("mousedown", (e) => {
            if (e.target.id === "fnr-close-x") return;
            isDragging = true;
            dragStartX = e.clientX;
            dragStartY = e.clientY;
            boxStartX = box.offsetLeft;
            boxStartY = box.offsetTop;
        });

        globalMouseMoveHandler = (e) => {
            if (!isDragging) return;
            box.style.left = `${boxStartX + (e.clientX - dragStartX)}px`;
            box.style.top = `${boxStartY + (e.clientY - dragStartY)}px`;
            box.style.right = "auto";
        };

        globalMouseUpHandler = () => {
            isDragging = false;
        };

        globalClickHandler = (e) => {
            if (box && !box.contains(e.target)) {
                document.getElementById("fnr-find-list").style.display = "none";
                document.getElementById("fnr-replace-list").style.display =
                    "none";
            }
        };

        document.addEventListener("mousemove", globalMouseMoveHandler);
        document.addEventListener("mouseup", globalMouseUpHandler);
        document.addEventListener("click", globalClickHandler);

        document
            .getElementById("fnr-close-x")
            .addEventListener("click", closeBox);
        document
            .getElementById("fnr-cancel-btn")
            .addEventListener("click", closeBox);

        const findInput = document.getElementById("fnr-find-input");
        findInput.addEventListener("input", findMatches);

        box.querySelectorAll('input[name="fnr-mode"]').forEach((radio) => {
            radio.addEventListener("change", findMatches);
        });

        document
            .getElementById("fnr-next-btn")
            .addEventListener("click", () => navigateMatch("next"));
        document
            .getElementById("fnr-prev-btn")
            .addEventListener("click", () => navigateMatch("prev"));
        document
            .getElementById("fnr-replace-btn")
            .addEventListener("click", replaceSingle);
        document
            .getElementById("fnr-replace-all-btn")
            .addEventListener("click", replaceAll);

        // Gắn sự kiện cho các nút xuất nhập dữ liệu mới
        document
            .getElementById("fnr-export-btn")
            .addEventListener("click", exportHistoryJSON);

        const fileInput = document.getElementById("fnr-file-input");
        document
            .getElementById("fnr-import-btn")
            .addEventListener("click", () => fileInput.click());
        fileInput.addEventListener("change", importHistoryJSON);

        const toggleDropdown = (type) => {
            const list = document.getElementById(`fnr-${type}-list`);
            list.style.display =
                list.style.display === "block" ? "none" : "block";
        };

        document
            .getElementById("fnr-find-drop-btn")
            .addEventListener("click", (e) => {
                e.stopPropagation();
                toggleDropdown("find");
            });

        document
            .getElementById("fnr-replace-drop-btn")
            .addEventListener("click", (e) => {
                e.stopPropagation();
                toggleDropdown("replace");
            });
    }

    document.addEventListener("keydown", function (e) {
        const key = e.key.toLowerCase();

        if (e.altKey) {
            if (key === "h") {
                e.preventDefault();
                if (box) {
                    document.getElementById("fnr-find-input").focus();
                } else {
                    createBox();
                }
            } else if (key === "z") {
                e.preventDefault();
                performUndo();
            } else if (key === "y") {
                e.preventDefault();
                performRedo();
            }
        }

        if (e.key === "Escape" && box) {
            closeBox();
        }
    });
})();
