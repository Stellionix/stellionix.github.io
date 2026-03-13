const totalElement = document.getElementById("downloads-total");
const updatedElement = document.getElementById("stats-updated");
const statElements = Array.from(document.querySelectorAll(".plugin-stat[data-stat-source]"));
const heroElement = document.querySelector(".hero");

function formatNumber(value) {
    return `~${Number(value || 0).toLocaleString("en-US")} times`;
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

function animateNumber(element, targetValue, duration = 900) {
    if (!element || !Number.isFinite(targetValue)) {
        return;
    }

    const start = performance.now();

    function frame(now) {
        const progress = Math.min((now - start) / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3);
        const currentValue = Math.round(targetValue * eased);

        element.textContent = formatNumber(currentValue);

        if (progress < 1) {
            requestAnimationFrame(frame);
        }
    }

    requestAnimationFrame(frame);
}

async function hydrateStat(element) {
    const source = element.dataset.statSource;
    const valueElement = element.querySelector(".plugin-stat-value");
    const label = element.querySelector(".plugin-stat-label")?.textContent?.trim().toLowerCase() ?? "";

    if (!source || !valueElement) {
        return { value: 0, contributesToTotal: false };
    }

    const response = await fetch(source);

    if (!response.ok) {
        throw new Error(`Failed to load badge: ${source}`);
    }

    const svgText = await response.text();
    const value = extractBadgeValue(svgText);

    animateNumber(valueElement, value, label.includes("stars") ? 650 : 850);

    return {
        value,
        contributesToTotal: label === "downloads" || label === "modrinth"
    };
}

async function hydrateStats() {
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
}

hydrateStats().catch(() => {
    if (totalElement) {
        totalElement.textContent = "N/A";
    }

    if (updatedElement) {
        updatedElement.textContent = "Live data unavailable";
    }
});

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

setupHeroParallax();
