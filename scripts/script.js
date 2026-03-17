const totalElement = document.getElementById("downloads-total");
const updatedElement = document.getElementById("stats-updated");
const heroElement = document.querySelector(".hero");
const filterForm = document.getElementById("projects-filters");
const filterResetButton = document.getElementById("filters-reset");
const filterEmptyState = document.getElementById("filters-empty");
const filterDropdowns = Array.from(document.querySelectorAll("[data-filter-dropdown]"));
const siteHeader = document.querySelector(".site-header");
const navToggle = document.querySelector(".nav-toggle");
const siteNav = document.querySelector("#site-nav");
const projectsListElement = document.getElementById("projects-list");

const configuratorSection = document.getElementById("configurator");
const configuratorStatusElement = document.getElementById("configurator-status");
const configuratorHintElement = document.getElementById("configurator-hint");
const configuratorSummaryElement = document.getElementById("configurator-summary");
const configuratorFormElement = document.getElementById("configurator-form");
const configPluginSelect = document.getElementById("config-plugin");
const configVersionSelect = document.getElementById("config-version");
const configDropdowns = Array.from(document.querySelectorAll("[data-config-dropdown]"));
const configOutputElement = document.getElementById("config-output");
const configOutputHighlightElement = document.getElementById("config-output-highlight");
const configOutputFilenameElement = document.getElementById("config-output-filename");
const configCopyButton = document.getElementById("config-copy");
const configDownloadButton = document.getElementById("config-download");

const gameMeta = {
    minecraft: {
        label: "Minecraft",
        icon: "assets/game-minecraft.svg"
    }
};

const priceMeta = {
    free: {
        label: "Free"
    }
};

const platformMeta = {
    bukkit: { label: "Bukkit", icon: "assets/platform-bukkit.png" },
    spigot: { label: "Spigot", icon: "assets/platform-spigot.ico" },
    paper: { label: "Paper", icon: "assets/platform-paper.svg" },
    purpur: { label: "Purpur", icon: "assets/platform-purpur.ico" },
    folia: { label: "Folia", icon: "assets/platform-folia.svg" },
    modrinth: { label: "Modrinth", icon: "assets/platform-modrinth.ico" },
    curseforge: { label: "CurseForge", icon: "assets/platform-curseforge.png" }
};

const secondaryLinkMeta = {
    github: { label: "GitHub", icon: "assets/platform-github.png", iconClass: "" },
    docs: { label: "Docs", icon: "assets/platform-docs.svg", iconClass: "link-icon-docs" }
};

let allProjects = [];
let configCatalog = null;
let activeConfigDocument = null;
let activeConfigMeta = null;
let configOutputDirty = false;
const yamlTextCache = new Map();
const configFieldNodeMap = new Map();

function getProjectCards() {
    return Array.from(document.querySelectorAll(".card[data-game]"));
}

function getStatElements() {
    return Array.from(document.querySelectorAll(".plugin-stat[data-stat-source]"));
}

function getDownloadMenus() {
    return Array.from(document.querySelectorAll(".download-menu"));
}

function formatNumber(value) {
    return `~${Number(value || 0).toLocaleString("en-US")}`;
}

function formatStatNumber(value) {
    return `~${Number(value || 0).toLocaleString("en-US")}`;
}

function parseCompactNumber(rawValue) {
    const normalized = rawValue.trim().toUpperCase();
    const match = normalized.match(/^([\d,.]+)\s*([KM])?$/);

    if (!match) {
        return Number(normalized.replace(/,/g, ""));
    }

    const numeric = Number(match[1].replace(/,/g, ""));
    const suffix = match[2];

    if (suffix === "M") {
        return Math.round(numeric * 1_000_000);
    }

    if (suffix === "K") {
        return Math.round(numeric * 1_000);
    }

    return Math.round(numeric);
}

function extractBadgeValue(svgText) {
    const title = svgText.match(/<title>(.*?)<\/title>/i)?.[1]?.trim() ?? "";
    const aria = svgText.match(/aria-label="([^"]+)"/i)?.[1]?.trim() ?? "";
    const sourceText = title || aria;
    const numberMatch = sourceText.match(/([\d,.]+\s*[KM]?)/i);

    if (!numberMatch) {
        throw new Error("Badge value not found.");
    }

    return parseCompactNumber(numberMatch[1]);
}

function animateNumber(element, targetValue, duration = 900, formatter = formatNumber) {
    if (!element || !Number.isFinite(targetValue)) {
        return;
    }

    const start = performance.now();

    function frame(now) {
        const progress = Math.min((now - start) / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3);
        const currentValue = Math.round(targetValue * eased);

        element.textContent = formatter(currentValue);

        if (progress < 1) {
            requestAnimationFrame(frame);
        }
    }

    requestAnimationFrame(frame);
}

async function hydrateStat(element) {
    const source = element.dataset.statSource;
    const secondarySource = element.dataset.statSourceSecondary;
    const valueElement = element.querySelector(".plugin-stat-value");
    const statKind = element.dataset.statKind ?? "";
    const card = element.closest(".card");

    if (!source || !valueElement) {
        return { value: 0, contributesToTotal: false };
    }

    const sources = [source, secondarySource].filter(Boolean);
    const responses = await Promise.all(sources.map(async (currentSource) => {
        const response = await fetch(currentSource);

        if (!response.ok) {
            throw new Error(`Failed to load badge: ${currentSource}`);
        }

        return response.text();
    }));
    const value = responses.reduce((sum, svgText) => sum + extractBadgeValue(svgText), 0);

    if (card && statKind === "downloads") {
        card.dataset.popularity = String(value);
    }

    animateNumber(valueElement, value, statKind === "stars" ? 650 : 850, formatStatNumber);

    return {
        value,
        contributesToTotal: statKind === "downloads"
    };
}

async function hydrateStats() {
    const statElements = getStatElements();
    const results = await Promise.allSettled(statElements.map(hydrateStat));
    const total = results.reduce((sum, result) => {
        if (result.status === "fulfilled" && result.value.contributesToTotal) {
            return sum + result.value.value;
        }

        return sum;
    }, 0);

    results.forEach((result, index) => {
        if (result.status === "rejected") {
            const valueElement = statElements[index]?.querySelector(".plugin-stat-value");
            if (valueElement) {
                valueElement.textContent = "N/A";
            }
        }
    });

    if (totalElement) {
        total > 0 ? animateNumber(totalElement, total, 1200) : totalElement.textContent = "N/A";
    }

    if (updatedElement) {
        updatedElement.textContent = `Live data - ${new Date().toLocaleDateString("en-US", {
            year: "numeric",
            month: "long",
            day: "numeric"
        })}`;
    }

    updateProjectDisplay();
}

function setupHeroParallax() {
    if (!heroElement || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        return;
    }

    let ticking = false;

    function updateParallax() {
        const rect = heroElement.getBoundingClientRect();
        const viewportHeight = window.innerHeight || document.documentElement.clientHeight;

        if (rect.bottom <= 0 || rect.top >= viewportHeight) {
            document.documentElement.style.setProperty("--hero-parallax-offset", "0px");
            ticking = false;
            return;
        }

        const offset = Math.max(-52, Math.min(52, rect.top * -0.18));
        document.documentElement.style.setProperty("--hero-parallax-offset", `${offset.toFixed(2)}px`);
        ticking = false;
    }

    function requestUpdate() {
        if (ticking) {
            return;
        }

        ticking = true;
        requestAnimationFrame(updateParallax);
    }

    window.addEventListener("scroll", requestUpdate, { passive: true });
    window.addEventListener("resize", requestUpdate);
    requestUpdate();
}

function setupDownloadMenus() {
    const downloadMenus = getDownloadMenus();
    if (!downloadMenus.length) {
        return;
    }

    const closeDelayMs = 380;

    function closeMenu(menu) {
        if (!menu.open) {
            menu.classList.remove("is-open");
            menu.classList.remove("is-closing");
            return;
        }

        menu.classList.remove("is-open");
        menu.classList.add("is-closing");
        window.setTimeout(() => {
            menu.open = false;
            menu.classList.remove("is-closing");
        }, closeDelayMs);
    }

    downloadMenus.forEach((menu) => {
        const summary = menu.querySelector(".menu-button");
        if (!summary) {
            return;
        }

        summary.addEventListener("click", (event) => {
            event.preventDefault();

            const isOpening = !menu.open;
            downloadMenus.forEach((otherMenu) => {
                if (otherMenu !== menu) {
                    closeMenu(otherMenu);
                }
            });

            if (isOpening) {
                menu.classList.remove("is-closing");
                menu.open = true;
                requestAnimationFrame(() => {
                    menu.classList.add("is-open");
                });
                return;
            }

            closeMenu(menu);
        });
    });

    document.addEventListener("click", (event) => {
        downloadMenus.forEach((menu) => {
            if (!menu.contains(event.target)) {
                closeMenu(menu);
            }
        });
    });

    document.addEventListener("keydown", (event) => {
        if (event.key !== "Escape") {
            return;
        }

        downloadMenus.forEach(closeMenu);
    });
}

function syncDropdownSelection(dropdown) {
    const hiddenInput = dropdown.querySelector('input[type="hidden"]');
    const label = dropdown.querySelector("[data-filter-label]");
    const options = Array.from(dropdown.querySelectorAll("[data-filter-option]"));

    if (!hiddenInput || !label || !options.length) {
        return;
    }

    const selectedOption = options.find((option) => (option.dataset.value ?? "") === hiddenInput.value) ?? options[0];
    label.textContent = selectedOption.querySelector("span:last-child")?.textContent?.trim() ?? selectedOption.textContent.trim();

    options.forEach((option) => {
        const isSelected = option === selectedOption;
        option.classList.toggle("is-selected", isSelected);
        option.setAttribute("aria-selected", isSelected ? "true" : "false");
    });
}

function getSelectedValues(name) {
    if (!filterForm) {
        return [];
    }

    return Array.from(filterForm.querySelectorAll(`input[name="${name}"]:checked`)).map((input) => input.value);
}

function getSelectedSelectValue(name) {
    if (!filterForm) {
        return "";
    }

    const input = filterForm.querySelector(`input[type="hidden"][name="${name}"]`);
    return input?.value ?? "";
}

function matchesGroup(cardValues, selectedValues) {
    if (!selectedValues.length) {
        return true;
    }

    return selectedValues.some((value) => cardValues.includes(value));
}

function sortProjectCards(projectCards, sortValue) {
    const sortedCards = [...projectCards];

    sortedCards.sort((leftCard, rightCard) => {
        if (sortValue === "popularity-desc") {
            const popularityDelta = Number(rightCard.dataset.popularity ?? "0") - Number(leftCard.dataset.popularity ?? "0");
            if (popularityDelta !== 0) {
                return popularityDelta;
            }
        }

        if (sortValue === "name-asc") {
            const leftName = leftCard.querySelector("h3")?.textContent?.trim() ?? "";
            const rightName = rightCard.querySelector("h3")?.textContent?.trim() ?? "";
            const nameComparison = leftName.localeCompare(rightName, "en", { sensitivity: "base" });

            if (nameComparison !== 0) {
                return nameComparison;
            }
        }

        return Number(leftCard.dataset.projectIndex ?? "0") - Number(rightCard.dataset.projectIndex ?? "0");
    });

    sortedCards.forEach((card) => {
        projectsListElement?.appendChild(card);
    });
}

function updateProjectDisplay() {
    const projectCards = getProjectCards();
    if (!filterForm || !projectCards.length) {
        return;
    }

    const selectedGame = getSelectedSelectValue("game");
    const selectedPrice = getSelectedSelectValue("price");
    const selectedSort = getSelectedSelectValue("sort");
    const selectedCompatibility = getSelectedValues("compatibility");
    const selectedDownloads = getSelectedValues("downloads");

    let visibleCount = 0;

    projectCards.forEach((card) => {
        const cardGame = [card.dataset.game ?? ""];
        const cardPrice = [card.dataset.price ?? ""];
        const cardCompatibility = (card.dataset.compatibility ?? "").split(",").filter(Boolean);
        const cardDownloads = (card.dataset.downloads ?? "").split(",").filter(Boolean);

        const isVisible =
            matchesGroup(cardGame, selectedGame ? [selectedGame] : []) &&
            matchesGroup(cardPrice, selectedPrice ? [selectedPrice] : []) &&
            matchesGroup(cardCompatibility, selectedCompatibility) &&
            matchesGroup(cardDownloads, selectedDownloads);

        card.classList.toggle("is-hidden", !isVisible);

        if (isVisible) {
            visibleCount += 1;
        }
    });

    sortProjectCards(projectCards, selectedSort);

    if (filterEmptyState) {
        filterEmptyState.hidden = visibleCount > 0;
    }
}

function setupProjectFilters() {
    const projectCards = getProjectCards();
    if (!filterForm || !projectCards.length) {
        return;
    }

    filterForm.addEventListener("change", updateProjectDisplay);

    if (filterResetButton) {
        filterResetButton.addEventListener("click", () => {
            filterForm.reset();
            filterDropdowns.forEach((dropdown) => {
                const hiddenInput = dropdown.querySelector('input[type="hidden"]');
                if (hiddenInput) {
                    hiddenInput.value = hiddenInput.dataset.defaultValue ?? "";
                }
                syncDropdownSelection(dropdown);
            });
            updateProjectDisplay();
        });
    }

    updateProjectDisplay();
}

function setupFilterDropdowns() {
    if (!filterDropdowns.length) {
        return;
    }

    function closeDropdown(dropdown) {
        dropdown.classList.remove("is-open");
        const trigger = dropdown.querySelector("[data-filter-trigger]");
        if (trigger) {
            trigger.setAttribute("aria-expanded", "false");
        }
    }

    filterDropdowns.forEach((dropdown) => {
        const trigger = dropdown.querySelector("[data-filter-trigger]");
        const hiddenInput = dropdown.querySelector('input[type="hidden"]');
        const options = Array.from(dropdown.querySelectorAll("[data-filter-option]"));

        if (!trigger || !hiddenInput || !options.length) {
            return;
        }

        syncDropdownSelection(dropdown);

        trigger.addEventListener("click", () => {
            const isOpen = dropdown.classList.contains("is-open");
            filterDropdowns.forEach(closeDropdown);

            if (!isOpen) {
                dropdown.classList.add("is-open");
                trigger.setAttribute("aria-expanded", "true");
            }
        });

        options.forEach((option) => {
            option.addEventListener("click", () => {
                hiddenInput.value = option.dataset.value ?? "";
                syncDropdownSelection(dropdown);
                hiddenInput.dispatchEvent(new Event("change", { bubbles: true }));
                closeDropdown(dropdown);
            });
        });
    });

    document.addEventListener("click", (event) => {
        filterDropdowns.forEach((dropdown) => {
            if (!dropdown.contains(event.target)) {
                closeDropdown(dropdown);
            }
        });
    });

    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
            filterDropdowns.forEach(closeDropdown);
        }
    });
}

function setupMobileNav() {
    if (!siteHeader || !navToggle || !siteNav) {
        return;
    }

    function closeNav() {
        siteHeader.classList.remove("nav-open");
        navToggle.setAttribute("aria-expanded", "false");
    }

    navToggle.addEventListener("click", () => {
        const isOpen = siteHeader.classList.toggle("nav-open");
        navToggle.setAttribute("aria-expanded", isOpen ? "true" : "false");
    });

    siteNav.querySelectorAll("a").forEach((link) => {
        link.addEventListener("click", () => {
            closeNav();
        });
    });

    document.addEventListener("click", (event) => {
        if (!siteHeader.contains(event.target)) {
            closeNav();
        }
    });

    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
            closeNav();
        }
    });

    window.addEventListener("resize", () => {
        if (window.innerWidth > 640) {
            closeNav();
        }
    });
}

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/\"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function prettifyKey(key) {
    return key
        .split(/[-_.]/g)
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" ");
}

function commentLinesToHtml(commentLines) {
    return commentLines.map((line) => escapeHtml(line)).join("<br>");
}

function parseScalarValue(rawValue) {
    if (rawValue === "true") {
        return true;
    }

    if (rawValue === "false") {
        return false;
    }

    if (rawValue === "null") {
        return null;
    }

    if (/^-?\d+(\.\d+)?$/.test(rawValue)) {
        return Number(rawValue);
    }

    if ((rawValue.startsWith('"') && rawValue.endsWith('"')) || (rawValue.startsWith("'") && rawValue.endsWith("'"))) {
        return rawValue.slice(1, -1);
    }

    return rawValue;
}

function createMapNode(key = null, comments = [], indent = -1) {
    return { type: "map", key, comments, indent, entries: [] };
}

function createScalarNode(key, value, comments = [], indent = 0) {
    return { type: "scalar", key, value, comments, indent };
}

function createListNode(key, items = [], comments = [], indent = 0) {
    return { type: "list", key, items, comments, indent };
}

function inferContainerType(lines, startIndex, parentIndent) {
    for (let index = startIndex; index < lines.length; index += 1) {
        const rawLine = lines[index];
        const trimmed = rawLine.trim();
        if (!trimmed || trimmed.startsWith("#")) {
            continue;
        }

        const indent = rawLine.match(/^\s*/)[0].length;
        if (indent <= parentIndent) {
            return "map";
        }

        return trimmed.startsWith("- ") ? "list" : "map";
    }

    return "map";
}

function parseYamlDocument(text) {
    const lines = text.replace(/\r/g, "").split("\n");
    const root = createMapNode(null, [], -1);
    root.preamble = [];

    let index = 0;
    while (index < lines.length) {
        const trimmed = lines[index].trim();
        if (!trimmed || trimmed.startsWith("#")) {
            root.preamble.push(lines[index]);
            index += 1;
            continue;
        }
        break;
    }

    function parseMap(startIndex, parentIndent, existingNode = createMapNode(null, [], parentIndent)) {
        let currentIndex = startIndex;
        let pendingComments = [];

        while (currentIndex < lines.length) {
            const rawLine = lines[currentIndex];
            const trimmed = rawLine.trim();
            const indent = rawLine.match(/^\s*/)[0].length;

            if (!trimmed) {
                pendingComments = [];
                currentIndex += 1;
                continue;
            }

            if (trimmed.startsWith("#")) {
                pendingComments.push(trimmed.slice(1).trim());
                currentIndex += 1;
                continue;
            }

            if (indent <= parentIndent) {
                break;
            }

            const separatorIndex = trimmed.indexOf(":");
            if (separatorIndex === -1) {
                currentIndex += 1;
                pendingComments = [];
                continue;
            }

            const key = trimmed.slice(0, separatorIndex).trim();
            const rest = trimmed.slice(separatorIndex + 1).trim();
            const comments = pendingComments;
            pendingComments = [];

            if (rest === "") {
                const containerType = inferContainerType(lines, currentIndex + 1, indent);
                if (containerType === "list") {
                    const { node, nextIndex } = parseList(currentIndex + 1, indent, createListNode(key, [], comments, indent));
                    existingNode.entries.push(node);
                    currentIndex = nextIndex;
                    continue;
                }

                const childNode = createMapNode(key, comments, indent);
                const { node, nextIndex } = parseMap(currentIndex + 1, indent, childNode);
                existingNode.entries.push(node);
                currentIndex = nextIndex;
                continue;
            }

            existingNode.entries.push(createScalarNode(key, parseScalarValue(rest), comments, indent));
            currentIndex += 1;
        }

        return { node: existingNode, nextIndex: currentIndex };
    }

    function parseList(startIndex, parentIndent, existingNode = createListNode(null, [], [], parentIndent)) {
        let currentIndex = startIndex;
        while (currentIndex < lines.length) {
            const rawLine = lines[currentIndex];
            const trimmed = rawLine.trim();
            const indent = rawLine.match(/^\s*/)[0].length;

            if (!trimmed || trimmed.startsWith("#")) {
                currentIndex += 1;
                continue;
            }

            if (indent <= parentIndent) {
                break;
            }

            if (!trimmed.startsWith("- ")) {
                break;
            }

            const itemValue = trimmed.slice(2).trim();
            existingNode.items.push(parseScalarValue(itemValue));
            currentIndex += 1;
        }

        return { node: existingNode, nextIndex: currentIndex };
    }

    const { node } = parseMap(index, -1, root);
    return node;
}

function mapNodeToObject(node) {
    if (node.type === "scalar") {
        return node.value;
    }

    if (node.type === "list") {
        return [...node.items];
    }

    return node.entries.reduce((result, entry) => {
        result[entry.key] = mapNodeToObject(entry);
        return result;
    }, {});
}

function collectCommentOptions(commentLines) {
    const options = [];

    commentLines.forEach((line) => {
        const trimmed = line.trim();

        if (trimmed.includes("|") && !trimmed.startsWith("http")) {
            trimmed.split("|").map((part) => part.trim()).filter(Boolean).forEach((part) => {
                if (!options.includes(part)) {
                    options.push(part);
                }
            });
        }

        if (trimmed.startsWith("- ")) {
            const option = trimmed.slice(2).split("=")[0].trim();
            if (option && !options.includes(option)) {
                options.push(option);
            }
        }

        const defaultsMatch = trimmed.match(/defaults?:\s*(.+)$/i);
        if (defaultsMatch) {
            defaultsMatch[1].split(",").map((part) => part.trim()).filter(Boolean).forEach((part) => {
                if (!options.includes(part)) {
                    options.push(part);
                }
            });
        }

        const examplesMatch = trimmed.match(/examples?:\s*(.+)$/i);
        if (examplesMatch) {
            examplesMatch[1].split(",").map((part) => part.trim()).filter(Boolean).forEach((part) => {
                if (!options.includes(part)) {
                    options.push(part);
                }
            });
        }
    });

    return options;
}

function getFieldDefinition(node) {
    if (node.type === "list") {
        return { type: "textarea", format: "list" };
    }

    if (typeof node.value === "boolean") {
        return { type: "boolean" };
    }

    if (typeof node.value === "number") {
        return { type: "number" };
    }

    const options = collectCommentOptions(node.comments);
    if (options.length >= 2) {
        return { type: "select", options };
    }

    return { type: "text" };
}

function hasRenderableChildren(node) {
    return node.entries.some((entry) => entry.type === "scalar" || entry.type === "list" || hasRenderableChildren(entry));
}

function renderNodeField(node, path) {
    const field = getFieldDefinition(node);
    const label = prettifyKey(node.key);
    const note = node.comments.length ? `<div class="config-field-note">${commentLinesToHtml(node.comments)}</div>` : "";
    configFieldNodeMap.set(path, node);

    if (field.type === "boolean") {
        return `<label class="config-toggle"><input type="checkbox" data-config-path="${escapeHtml(path)}" ${node.value ? "checked" : ""}><span class="config-toggle-content"><span class="config-field-label">${escapeHtml(label)}</span>${note}</span></label>`;
    }

    if (field.type === "select") {
        const options = field.options
            .map((option, index) => `<button class="filter-dropdown-option${String(node.value) === option || (index === 0 && node.value === undefined) ? " is-selected" : ""}" type="button" role="option" data-config-generated-option data-value="${escapeHtml(option)}" aria-selected="${String(node.value) === option || (index === 0 && node.value === undefined) ? "true" : "false"}"><span>${escapeHtml(option)}</span></button>`)
            .join("");
        return `<label class="config-field"><span class="config-field-label">${escapeHtml(label)}</span><div class="filter-dropdown config-dropdown config-generated-dropdown" data-config-generated-dropdown><input type="hidden" class="config-field-select" data-config-path="${escapeHtml(path)}" value="${escapeHtml(String(node.value ?? field.options[0] ?? ""))}"><button class="filter-select-wrap config-select-wrap" type="button" data-config-generated-trigger aria-haspopup="listbox" aria-expanded="false"><span class="filter-select-label" data-config-generated-label>${escapeHtml(String(node.value ?? field.options[0] ?? ""))}</span></button><div class="filter-dropdown-menu" role="listbox">${options}</div></div>${note}</label>`;
    }

    if (field.type === "number") {
        return `<label class="config-field"><span class="config-field-label">${escapeHtml(label)}</span><input class="config-field-input" type="number" data-config-path="${escapeHtml(path)}" value="${escapeHtml(node.value)}">${note}</label>`;
    }

    if (field.format === "list") {
        const content = node.items.join("\n");
        return `<label class="config-field"><span class="config-field-label">${escapeHtml(label)}</span><textarea class="config-field-textarea" data-config-path="${escapeHtml(path)}" data-config-format="list">${escapeHtml(content)}</textarea>${note}</label>`;
    }

    return `<label class="config-field"><span class="config-field-label">${escapeHtml(label)}</span><input class="config-field-input" type="text" data-config-path="${escapeHtml(path)}" value="${escapeHtml(node.value)}">${note}</label>`;
}

function renderConfigNode(node, path = "") {
    const currentPath = path ? `${path}.${node.key}` : node.key;

    if (node.type === "scalar" || node.type === "list") {
        return renderNodeField(node, currentPath);
    }

    if (!hasRenderableChildren(node)) {
        return "";
    }

    const description = node.comments.length ? `<p>${commentLinesToHtml(node.comments)}</p>` : "";
    const content = node.entries.map((entry) => renderConfigNode(entry, currentPath)).join("");
    return `<section class="config-group"><div class="config-group-head"><h3>${escapeHtml(prettifyKey(node.key))}</h3>${description}</div>${content}</section>`;
}

function renderConfigRoot(documentNode) {
    const htmlParts = [];
    documentNode.entries.forEach((entry) => {
        htmlParts.push(renderConfigNode(entry, ""));
    });
    return htmlParts.join("");
}

function formatYamlScalar(value) {
    if (typeof value === "number") {
        return String(value);
    }

    if (typeof value === "boolean") {
        return value ? "true" : "false";
    }

    if (value === null) {
        return "null";
    }

    if (value === "") {
        return '""';
    }

    if (/^[A-Za-z0-9_./:-]+$/.test(String(value))) {
        return String(value);
    }

    return JSON.stringify(String(value));
}

function renderYamlComments(commentLines, indent) {
    const indentText = "  ".repeat(indent);
    return commentLines.map((line) => `${indentText}#${line ? ` ${line}` : ""}`).join("\n");
}

function renderYamlNode(node, indent = 0) {
    const indentText = "  ".repeat(indent);
    const parts = [];

    if (node.comments.length) {
        parts.push(renderYamlComments(node.comments, indent));
    }

    if (node.type === "scalar") {
        parts.push(`${indentText}${node.key}: ${formatYamlScalar(node.value)}`);
        return parts.join("\n");
    }

    if (node.type === "list") {
        if (!node.items.length) {
            parts.push(`${indentText}${node.key}: []`);
            return parts.join("\n");
        }

        parts.push(`${indentText}${node.key}:`);
        node.items.forEach((item) => {
            parts.push(`${indentText}  - ${formatYamlScalar(item)}`);
        });
        return parts.join("\n");
    }

    parts.push(`${indentText}${node.key}:`);
    node.entries.forEach((entry, index) => {
        const rendered = renderYamlNode(entry, indent + 1);
        if (index > 0) {
            parts.push("");
        }
        parts.push(rendered);
    });
    return parts.join("\n");
}

function renderYamlDocument(documentNode) {
    const parts = [];

    if (documentNode.preamble?.length) {
        parts.push(documentNode.preamble.join("\n").trimEnd());
    }

    documentNode.entries.forEach((entry, index) => {
        const rendered = renderYamlNode(entry, 0);
        if (!rendered) {
            return;
        }

        if (parts.length > 0 || index > 0) {
            parts.push("");
        }

        parts.push(rendered);
    });

    return `${parts.join("\n").trim()}\n`;
}

function updateNodeFromInput(input) {
    const path = input.dataset.configPath;
    const node = configFieldNodeMap.get(path);
    if (!node) {
        return;
    }

    if (node.type === "list") {
        node.items = input.value
            .split(/\r?\n/)
            .map((item) => item.trim())
            .filter(Boolean);
        return;
    }

    if (typeof node.value === "boolean") {
        node.value = input.checked;
        return;
    }

    if (typeof node.value === "number") {
        const numericValue = Number(input.value);
        node.value = Number.isFinite(numericValue) ? numericValue : 0;
        return;
    }

    node.value = input.value;
}

function setupPageTransitions() {
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion) {
        return;
    }

    document.body.classList.add("is-page-entering");
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            document.body.classList.add("is-page-ready");
            document.body.classList.remove("is-page-entering");
        });
    });

    document.addEventListener("click", (event) => {
        const link = event.target.closest("a[href]");
        if (!link) {
            return;
        }

        if (link.target && link.target !== "_self") {
            return;
        }

        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) {
            return;
        }

        const href = link.getAttribute("href") ?? "";
        if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) {
            return;
        }

        const destination = new URL(link.href, window.location.href);
        const current = new URL(window.location.href);

        if (destination.origin !== current.origin) {
            return;
        }

        const sameDocumentAnchorOnly =
            destination.pathname === current.pathname &&
            destination.search === current.search &&
            destination.hash;

        if (sameDocumentAnchorOnly) {
            return;
        }

        event.preventDefault();
        document.body.classList.add("page-transitioning");
        window.setTimeout(() => {
            window.location.href = destination.href;
        }, 220);
    });
}

function getConfigOutputValue() {
    if (!configOutputElement) {
        return "";
    }

    return "value" in configOutputElement ? configOutputElement.value : configOutputElement.textContent ?? "";
}

function setConfigOutputValue(value, { dirty = false } = {}) {
    if (!configOutputElement) {
        return;
    }

    if ("value" in configOutputElement) {
        configOutputElement.value = value;
    } else {
        configOutputElement.textContent = value;
    }

    configOutputDirty = dirty;
    configOutputElement.dataset.dirty = dirty ? "true" : "false";
    updateConfigOutputHighlight();
    resizeConfigOutput();
}

function updateConfiguratorState(message, status = "") {
    if (configuratorHintElement && message) {
        configuratorHintElement.textContent = message;
    }

    if (configuratorStatusElement && status) {
        configuratorStatusElement.textContent = status;
    }
}

function rebuildConfiguratorForm() {
    configFieldNodeMap.clear();
    renderConfigSummary();
    if (configuratorFormElement) {
        configuratorFormElement.innerHTML = renderConfigRoot(activeConfigDocument);
    }
    setupGeneratedConfigDropdowns();
}

function resizeConfigOutput() {
    if (!configOutputElement || !("style" in configOutputElement)) {
        return;
    }

    configOutputElement.style.height = "auto";
    configOutputElement.style.height = `${configOutputElement.scrollHeight}px`;
    if (configOutputHighlightElement) {
        configOutputHighlightElement.style.height = `${configOutputElement.scrollHeight}px`;
    }
}

function highlightYamlLine(line) {
    const escapedLine = escapeHtml(line);
    const commentIndex = escapedLine.indexOf("#");
    const hasComment = commentIndex >= 0;
    const content = hasComment ? escapedLine.slice(0, commentIndex) : escapedLine;
    const comment = hasComment ? escapedLine.slice(commentIndex) : "";

    const listMatch = content.match(/^(\s*)(-\s+)(.*)$/);
    if (listMatch) {
        const [, indent, marker, remainder] = listMatch;
        return `${indent}<span class="yaml-list-marker">${marker}</span>${highlightYamlValue(remainder)}${comment ? `<span class="yaml-comment">${comment}</span>` : ""}`;
    }

    const keyMatch = content.match(/^(\s*)([^:\n]+)(:\s*)(.*)$/);
    if (keyMatch) {
        const [, indent, key, separator, remainder] = keyMatch;
        return `${indent}<span class="yaml-key">${key}</span><span class="yaml-punctuation">${separator}</span>${highlightYamlValue(remainder)}${comment ? `<span class="yaml-comment">${comment}</span>` : ""}`;
    }

    if (comment) {
        return `${content}<span class="yaml-comment">${comment}</span>`;
    }

    return highlightYamlValue(content);
}

function highlightYamlValue(value) {
    if (!value) {
        return "";
    }

    return value.replace(/"([^"]*)"|'([^']*)'|\b(true|false|null)\b|\b-?\d+(?:\.\d+)?\b/g, (match, doubleQuoted, singleQuoted, keyword) => {
        if (doubleQuoted !== undefined || singleQuoted !== undefined) {
            return `<span class="yaml-string">${match}</span>`;
        }

        if (keyword) {
            return `<span class="yaml-boolean">${match}</span>`;
        }

        return `<span class="yaml-number">${match}</span>`;
    });
}

function updateConfigOutputHighlight() {
    if (!configOutputHighlightElement) {
        return;
    }

    const yaml = getConfigOutputValue() || " ";
    configOutputHighlightElement.innerHTML = yaml
        .split(/\r?\n/)
        .map((line) => highlightYamlLine(line))
        .join("\n");
}

function applyYamlFromEditor() {
    const yaml = getConfigOutputValue();
    if (!yaml.trim()) {
        return false;
    }

    try {
        activeConfigDocument = parseYamlDocument(yaml);
        rebuildConfiguratorForm();
        setConfigOutputValue(renderYamlDocument(activeConfigDocument));
        updateConfiguratorState(`${activeConfigMeta?.name ?? "Preset"} ${activeConfigMeta?.version ?? ""}`.trim(), "Imported YAML");
        return true;
    } catch (error) {
        updateConfiguratorState("Invalid YAML. Fix the editor content before applying it.", "YAML error");
        console.error(error);
        return false;
    }
}

function renderConfigSummary() {
    if (!configuratorSummaryElement) {
        return;
    }

    if (!activeConfigMeta) {
        configuratorSummaryElement.innerHTML = "<h3>Select a preset</h3><p>Choose a plugin and version to open the configuration interface.</p>";
        return;
    }

    configuratorSummaryElement.innerHTML = `<h3>${escapeHtml(activeConfigMeta.name)} ${escapeHtml(activeConfigMeta.version)}</h3><p>Editing the original YAML preset directly. Comments and structure come from the YAML source file, not a JSON schema.</p>`;
}

function updateConfigOutput() {
    if (!activeConfigDocument || !configOutputElement) {
        return;
    }

    if (configOutputDirty && document.activeElement === configOutputElement) {
        return;
    }

    setConfigOutputValue(renderYamlDocument(activeConfigDocument));
    if (configOutputFilenameElement) {
        configOutputFilenameElement.textContent = "config.yml";
    }
}

async function loadTextFile(path) {
    if (yamlTextCache.has(path)) {
        return yamlTextCache.get(path);
    }

    const response = await fetch(path);
    if (!response.ok) {
        throw new Error(`Failed to load file: ${path}`);
    }

    const content = await response.text();
    yamlTextCache.set(path, content);
    return content;
}

async function loadConfigCatalog() {
    const response = await fetch("data/configurator/index.json");
    if (!response.ok) {
        throw new Error("Failed to load configurator index.");
    }

    return response.json();
}

function populateConfigPluginOptions() {
    if (!configPluginSelect || !configCatalog?.plugins) {
        return;
    }

    const dropdown = configPluginSelect.closest("[data-config-dropdown]");
    const menu = dropdown?.querySelector(".filter-dropdown-menu");
    if (!menu) {
        return;
    }

    const entries = Object.entries(configCatalog.plugins);
    menu.innerHTML = entries
        .map(([slug, plugin], index) => `<button class="filter-dropdown-option${index === 0 ? " is-selected" : ""}" type="button" role="option" data-config-option data-value="${escapeHtml(slug)}" aria-selected="${index === 0 ? "true" : "false"}"><span>${escapeHtml(plugin.name ?? slug)}</span></button>`)
        .join("");

    configPluginSelect.value = entries[0]?.[0] ?? "";
    syncConfigDropdownSelection(dropdown);
}

function populateConfigVersionOptions(pluginSlug, preferredVersion = "") {
    if (!configVersionSelect) {
        return;
    }

    const plugin = configCatalog?.plugins?.[pluginSlug];
    const versionMap = plugin?.versions ?? {};
    const versions = Object.keys(versionMap);
    const dropdown = configVersionSelect.closest("[data-config-dropdown]");
    const menu = dropdown?.querySelector(".filter-dropdown-menu");
    if (!menu) {
        return;
    }

    menu.innerHTML = versions
        .map((version, index) => `<button class="filter-dropdown-option${index === 0 ? " is-selected" : ""}" type="button" role="option" data-config-option data-value="${escapeHtml(version)}" aria-selected="${index === 0 ? "true" : "false"}"><span>${escapeHtml(version)}</span></button>`)
        .join("");

    if (!versions.length) {
        configVersionSelect.value = "";
        syncConfigDropdownSelection(dropdown);
        return;
    }

    configVersionSelect.value = versions.includes(preferredVersion) ? preferredVersion : versions[0];
    syncConfigDropdownSelection(dropdown);
}

function syncConfigDropdownSelection(dropdown) {
    const hiddenInput = dropdown?.querySelector('input[type="hidden"]');
    const label = dropdown?.querySelector("[data-config-label]");
    const options = dropdown ? Array.from(dropdown.querySelectorAll("[data-config-option]")) : [];

    if (!hiddenInput || !label || !options.length) {
        return;
    }

    const selectedOption = options.find((option) => (option.dataset.value ?? "") === hiddenInput.value) ?? options[0];
    label.textContent = selectedOption.querySelector("span:last-child")?.textContent?.trim() ?? selectedOption.textContent.trim();

    options.forEach((option) => {
        const isSelected = option === selectedOption;
        option.classList.toggle("is-selected", isSelected);
        option.setAttribute("aria-selected", isSelected ? "true" : "false");
    });
}

function setupConfigDropdowns() {
    if (!configDropdowns.length) {
        return;
    }

    function closeDropdown(dropdown) {
        dropdown.classList.remove("is-open");
        const trigger = dropdown.querySelector("[data-config-trigger]");
        if (trigger) {
            trigger.setAttribute("aria-expanded", "false");
        }
    }

    configDropdowns.forEach((dropdown) => {
        const trigger = dropdown.querySelector("[data-config-trigger]");
        const hiddenInput = dropdown.querySelector('input[type="hidden"]');

        if (!trigger || !hiddenInput) {
            return;
        }

        trigger.addEventListener("click", () => {
            const isOpen = dropdown.classList.contains("is-open");
            configDropdowns.forEach(closeDropdown);

            if (!isOpen) {
                dropdown.classList.add("is-open");
                trigger.setAttribute("aria-expanded", "true");
            }
        });

        dropdown.addEventListener("click", (event) => {
            const option = event.target.closest("[data-config-option]");
            if (!option) {
                return;
            }

            hiddenInput.value = option.dataset.value ?? "";
            syncConfigDropdownSelection(dropdown);
            hiddenInput.dispatchEvent(new Event("change", { bubbles: true }));
            closeDropdown(dropdown);
        });
    });

    document.addEventListener("click", (event) => {
        configDropdowns.forEach((dropdown) => {
            if (!dropdown.contains(event.target)) {
                closeDropdown(dropdown);
            }
        });
    });

    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
            configDropdowns.forEach(closeDropdown);
        }
    });
}

function syncGeneratedConfigDropdownSelection(dropdown) {
    const hiddenInput = dropdown?.querySelector('input[type="hidden"][data-config-path]');
    const label = dropdown?.querySelector("[data-config-generated-label]");
    const options = dropdown ? Array.from(dropdown.querySelectorAll("[data-config-generated-option]")) : [];

    if (!hiddenInput || !label || !options.length) {
        return;
    }

    const selectedOption = options.find((option) => (option.dataset.value ?? "") === hiddenInput.value) ?? options[0];
    label.textContent = selectedOption.querySelector("span:last-child")?.textContent?.trim() ?? selectedOption.textContent.trim();

    options.forEach((option) => {
        const isSelected = option === selectedOption;
        option.classList.toggle("is-selected", isSelected);
        option.setAttribute("aria-selected", isSelected ? "true" : "false");
    });
}

function setupGeneratedConfigDropdowns() {
    configuratorFormElement?.querySelectorAll("[data-config-generated-dropdown]").forEach((dropdown) => {
        syncGeneratedConfigDropdownSelection(dropdown);
    });
}

function hasConfigPreset(slug) {
    return Boolean(configCatalog?.plugins?.[slug]);
}

function renderSecondaryLink(link) {
    const meta = secondaryLinkMeta[link.type];
    if (!meta) {
        return "";
    }

    const iconClass = meta.iconClass ? ` ${meta.iconClass}` : "";
    return `<a class="card-secondary-link" href="${escapeHtml(link.href)}" target="_blank" rel="noreferrer"><img class="link-icon-image${iconClass}" src="${escapeHtml(meta.icon)}" alt=""><span>${escapeHtml(meta.label)}</span><img class="external-link-icon" src="assets/icon-external-link.svg" alt=""></a>`;
}

function renderCompatibilityItem(platform) {
    const meta = platformMeta[platform];
    if (!meta) {
        return "";
    }

    return `<span class="menu-item compatibility-item platform-${escapeHtml(platform)}"><img class="compatibility-icon-image" src="${escapeHtml(meta.icon)}" alt=""><span>${escapeHtml(meta.label)}</span></span>`;
}

function renderDownloadLink(link) {
    const meta = platformMeta[link.platform];
    if (!meta) {
        return "";
    }

    return `<a class="menu-link download-menu-link" href="${escapeHtml(link.href)}" target="_blank" rel="noreferrer"><img class="link-icon-image" src="${escapeHtml(meta.icon)}" alt=""><span>${escapeHtml(meta.label)}</span><img class="external-link-icon" src="assets/icon-external-link.svg" alt=""></a>`;
}

function renderConfigureButton(project) {
    if (!hasConfigPreset(project.slug)) {
        return "";
    }

    return `<a class="card-configure-button" href="yaml-builder.html?plugin=${encodeURIComponent(project.slug)}">Configure YAML</a>`;
}

function renderProjectCard(project) {
    const game = gameMeta[project.game] ?? { label: project.game, icon: "" };
    const price = priceMeta[project.price] ?? { label: project.price };
    const statSources = Array.isArray(project.stats?.sources) ? project.stats.sources : [];
    const descriptionParagraphs = (Array.isArray(project.description) ? project.description : [project.description])
        .filter(Boolean)
        .map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`)
        .join("");
    const statAttributes = [
        `data-stat-kind="${escapeHtml(project.stats?.kind ?? "downloads")}"`,
        `data-stat-source="${escapeHtml(statSources[0] ?? "")}"`
    ];

    if (statSources[1]) {
        statAttributes.push(`data-stat-source-secondary="${escapeHtml(statSources[1])}"`);
    }

    return `<article class="card" data-game="${escapeHtml(project.game)}" data-price="${escapeHtml(project.price)}" data-compatibility="${escapeHtml((project.compatibility ?? []).join(","))}" data-downloads="${escapeHtml((project.downloads ?? []).join(","))}" data-project-index="${escapeHtml(String(project.index ?? 0))}" data-popularity="0">
        <div class="card-header">
            <h3>${escapeHtml(project.name)}</h3>
            <div class="card-meta">
                <span class="game-badge"><img class="game-badge-icon" src="${escapeHtml(game.icon)}" alt=""><span>${escapeHtml(game.label)}</span></span>
                <span class="price-badge"><span class="price-badge-icon" aria-hidden="true">$</span><span>${escapeHtml(price.label)}</span></span>
                <div class="plugin-stats">
                    <div class="plugin-stat" ${statAttributes.join(" ")}>
                        <span class="plugin-stat-value">Loading...</span>
                        <span class="plugin-stat-label" aria-label="Downloads"></span>
                    </div>
                </div>
            </div>
        </div>
        <div class="card-body">
            <div class="card-visual">
                <div class="plugin-logo-wrap">
                    <img class="plugin-logo" src="${escapeHtml(project.logo?.src ?? "")}" alt="${escapeHtml(project.logo?.alt ?? `${project.name} logo`)}">
                </div>
            </div>
            <div class="card-content">
                <div class="card-description">${descriptionParagraphs}</div>
                <div class="card-footer">
                    <div class="card-secondary-links">${(project.secondaryLinks ?? []).map(renderSecondaryLink).join("")}${renderConfigureButton(project)}</div>
                    <div class="card-action-menus">
                        <div class="compatibility-menu">
                            <div class="menu-button compatibility-button"><span>Platforms</span></div>
                            <div class="menu-list compatibility-menu-list">${(project.compatibility ?? []).map(renderCompatibilityItem).join("")}</div>
                        </div>
                        <details class="card-menu download-menu">
                            <summary class="menu-button download-button"><img class="download-button-icon" src="assets/icon-download.svg" alt=""><span>Download</span></summary>
                            <div class="menu-list download-menu-list">${(project.downloadLinks ?? []).map(renderDownloadLink).join("")}</div>
                        </details>
                    </div>
                </div>
            </div>
        </div>
    </article>`;
}

function renderProjects(projects) {
    if (!projectsListElement) {
        return;
    }

    projectsListElement.innerHTML = projects.map(renderProjectCard).join("");
}

async function loadProjects() {
    const response = await fetch("data/projects.json");

    if (!response.ok) {
        throw new Error("Failed to load projects data.");
    }

    return response.json();
}

async function openConfigPreset(pluginSlug, preferredVersion = "") {
    if (!configCatalog?.plugins?.[pluginSlug]) {
        return;
    }

    const plugin = configCatalog.plugins[pluginSlug];
    const versionMap = plugin.versions ?? {};
    const version = versionMap[preferredVersion] ? preferredVersion : Object.keys(versionMap)[0];
    const path = versionMap[version];

    if (!path) {
        return;
    }

    if (configPluginSelect) {
        configPluginSelect.value = pluginSlug;
        syncConfigDropdownSelection(configPluginSelect.closest("[data-config-dropdown]"));
    }
    populateConfigVersionOptions(pluginSlug, version);
    if (configVersionSelect) {
        configVersionSelect.value = version;
        syncConfigDropdownSelection(configVersionSelect.closest("[data-config-dropdown]"));
    }

    if (configuratorHintElement) {
        configuratorHintElement.textContent = "Loading YAML preset...";
    }

    try {
        const yamlText = await loadTextFile(path);
        activeConfigDocument = parseYamlDocument(yamlText);
        activeConfigMeta = {
            slug: pluginSlug,
            name: plugin.name ?? pluginSlug,
            version,
            path
        };
        rebuildConfiguratorForm();
        updateConfigOutput();

        if (configuratorHintElement) {
            configuratorHintElement.textContent = `${activeConfigMeta.name} ${activeConfigMeta.version}`;
        }
    } catch (error) {
        activeConfigDocument = null;
        activeConfigMeta = null;
        renderConfigSummary();
        if (configuratorFormElement) {
            configuratorFormElement.innerHTML = "";
        }
        if (configOutputElement) {
            setConfigOutputValue("# Failed to load the selected YAML preset.");
        }
        if (configuratorHintElement) {
            configuratorHintElement.textContent = "Preset unavailable";
        }
        console.error(error);
    }
}

function getConfiguratorRouteSelection() {
    const params = new URLSearchParams(window.location.search);
    return {
        plugin: params.get("plugin") ?? "",
        version: params.get("version") ?? ""
    };
}

function setupConfigurator() {
    if (!configCatalog?.plugins || !configPluginSelect || !configVersionSelect) {
        if (configuratorHintElement) {
            configuratorHintElement.textContent = "Preset catalog unavailable";
        }
        return;
    }

    populateConfigPluginOptions();
    populateConfigVersionOptions(configPluginSelect.value);

    configPluginSelect.addEventListener("change", async () => {
        populateConfigVersionOptions(configPluginSelect.value);
        await openConfigPreset(configPluginSelect.value, configVersionSelect.value);
    });

    configVersionSelect.addEventListener("change", async () => {
        await openConfigPreset(configPluginSelect.value, configVersionSelect.value);
    });

    configOutputElement?.addEventListener("input", () => {
        configOutputDirty = true;
        configOutputElement.dataset.dirty = "true";
        updateConfigOutputHighlight();
        resizeConfigOutput();
        updateConfiguratorState("Manual YAML edits pending. Click outside the editor to sync the form.", "Manual edit");
    });

    configOutputElement?.addEventListener("paste", () => {
        window.setTimeout(() => {
            configOutputDirty = true;
            configOutputElement.dataset.dirty = "true";
            updateConfigOutputHighlight();
            resizeConfigOutput();
            updateConfiguratorState("YAML pasted. Click outside the editor to import it into the builder.", "YAML pasted");
        }, 0);
    });

    configOutputElement?.addEventListener("scroll", () => {
        if (!configOutputHighlightElement) {
            return;
        }

        configOutputHighlightElement.scrollTop = configOutputElement.scrollTop;
        configOutputHighlightElement.scrollLeft = configOutputElement.scrollLeft;
    });

    configOutputElement?.addEventListener("blur", () => {
        if (!configOutputDirty) {
            return;
        }

        applyYamlFromEditor();
    });

    configuratorFormElement?.addEventListener("input", (event) => {
        const input = event.target.closest("[data-config-path]");
        if (!input) {
            return;
        }

        if (configOutputDirty) {
            updateConfiguratorState("Manual YAML edits discarded after form changes.", "Builder synced");
            configOutputDirty = false;
            configOutputElement.dataset.dirty = "false";
        }

        updateNodeFromInput(input);
        updateConfigOutput();
    });

    configuratorFormElement?.addEventListener("click", (event) => {
        const trigger = event.target.closest("[data-config-generated-trigger]");
        if (trigger) {
            const dropdown = trigger.closest("[data-config-generated-dropdown]");
            const isOpen = dropdown.classList.contains("is-open");
            configuratorFormElement.querySelectorAll("[data-config-generated-dropdown].is-open").forEach((item) => {
                item.classList.remove("is-open");
                item.querySelector("[data-config-generated-trigger]")?.setAttribute("aria-expanded", "false");
            });

            if (!isOpen) {
                dropdown.classList.add("is-open");
                trigger.setAttribute("aria-expanded", "true");
            }
            return;
        }

        const option = event.target.closest("[data-config-generated-option]");
        if (!option) {
            return;
        }

        const dropdown = option.closest("[data-config-generated-dropdown]");
        const hiddenInput = dropdown?.querySelector('input[type="hidden"][data-config-path]');
        if (!hiddenInput) {
            return;
        }

        hiddenInput.value = option.dataset.value ?? "";
        syncGeneratedConfigDropdownSelection(dropdown);
        updateNodeFromInput(hiddenInput);
        updateConfigOutput();
        dropdown.classList.remove("is-open");
        dropdown.querySelector("[data-config-generated-trigger]")?.setAttribute("aria-expanded", "false");
    });

    configuratorFormElement?.addEventListener("change", (event) => {
        const input = event.target.closest("[data-config-path]");
        if (!input) {
            return;
        }

        if (configOutputDirty) {
            updateConfiguratorState("Manual YAML edits discarded after form changes.", "Builder synced");
            configOutputDirty = false;
            configOutputElement.dataset.dirty = "false";
        }

        updateNodeFromInput(input);
        updateConfigOutput();
    });

    configCopyButton?.addEventListener("click", async () => {
        const yaml = getConfigOutputValue();
        if (!yaml.trim()) {
            return;
        }

        try {
            await navigator.clipboard.writeText(yaml);
            configCopyButton.textContent = "Copied";
            window.setTimeout(() => {
                configCopyButton.textContent = "Copy YAML";
            }, 1400);
        } catch {
            configCopyButton.textContent = "Copy failed";
            window.setTimeout(() => {
                configCopyButton.textContent = "Copy YAML";
            }, 1400);
        }
    });

    configDownloadButton?.addEventListener("click", () => {
        const yaml = getConfigOutputValue();
        if (!yaml.trim()) {
            return;
        }

        const blob = new Blob([yaml], { type: "application/x-yaml;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = "config.yml";
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        URL.revokeObjectURL(url);
    });

    document.addEventListener("click", (event) => {
        if (!configuratorFormElement) {
            return;
        }

        configuratorFormElement.querySelectorAll("[data-config-generated-dropdown].is-open").forEach((dropdown) => {
            if (!dropdown.contains(event.target)) {
                dropdown.classList.remove("is-open");
                dropdown.querySelector("[data-config-generated-trigger]")?.setAttribute("aria-expanded", "false");
            }
        });
    });

    document.addEventListener("keydown", (event) => {
        if (event.key !== "Escape" || !configuratorFormElement) {
            return;
        }

        configuratorFormElement.querySelectorAll("[data-config-generated-dropdown].is-open").forEach((dropdown) => {
            dropdown.classList.remove("is-open");
            dropdown.querySelector("[data-config-generated-trigger]")?.setAttribute("aria-expanded", "false");
        });
    });

    const routeSelection = getConfiguratorRouteSelection();
    openConfigPreset(routeSelection.plugin || configPluginSelect.value, routeSelection.version || configVersionSelect.value);
    resizeConfigOutput();
}

async function initProjects() {
    try {
        const [projects, catalog] = await Promise.all([
            projectsListElement ? loadProjects() : Promise.resolve([]),
            loadConfigCatalog().catch(() => null)
        ]);

        configCatalog = catalog;

        if (projectsListElement) {
            allProjects = projects.map((project, index) => ({ ...project, index }));
            renderProjects(allProjects);
            setupDownloadMenus();
            setupProjectFilters();
        }

        setupConfigurator();
        if (projectsListElement) {
            await hydrateStats();
        }
    } catch {
        if (projectsListElement) {
            projectsListElement.innerHTML = "<p>Unable to load projects.</p>";
        }

        if (totalElement) {
            totalElement.textContent = "N/A";
        }

        if (updatedElement) {
            updatedElement.textContent = "Live data unavailable";
        }
    }
}

setupMobileNav();
setupFilterDropdowns();
setupConfigDropdowns();
setupPageTransitions();
setupHeroParallax();
initProjects();
