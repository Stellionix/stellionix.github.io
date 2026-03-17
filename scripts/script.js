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
    bukkit: {
        label: "Bukkit",
        icon: "assets/platform-bukkit.png"
    },
    spigot: {
        label: "Spigot",
        icon: "assets/platform-spigot.ico"
    },
    paper: {
        label: "Paper",
        icon: "assets/platform-paper.svg"
    },
    purpur: {
        label: "Purpur",
        icon: "assets/platform-purpur.ico"
    },
    folia: {
        label: "Folia",
        icon: "assets/platform-folia.svg"
    },
    modrinth: {
        label: "Modrinth",
        icon: "assets/platform-modrinth.ico"
    },
    curseforge: {
        label: "CurseForge",
        icon: "assets/platform-curseforge.png"
    }
};

const secondaryLinkMeta = {
    github: {
        label: "GitHub",
        icon: "assets/platform-github.png",
        iconClass: ""
    },
    docs: {
        label: "Docs",
        icon: "assets/platform-docs.svg",
        iconClass: "link-icon-docs"
    }
};

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
                    <div class="card-secondary-links">${(project.secondaryLinks ?? []).map(renderSecondaryLink).join("")}</div>
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

async function initProjects() {
    if (!projectsListElement) {
        return;
    }

    try {
        const projects = await loadProjects();
        renderProjects(projects.map((project, index) => ({ ...project, index })));
        setupDownloadMenus();
        setupProjectFilters();
        await hydrateStats();
    } catch {
        projectsListElement.innerHTML = "<p>Unable to load projects.</p>";

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
setupHeroParallax();
initProjects();
