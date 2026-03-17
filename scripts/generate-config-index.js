const fs = require("fs");
const path = require("path");

const rootDir = path.resolve(__dirname, "..");
const configuratorDir = path.join(rootDir, "data", "configurator");
const projectsPath = path.join(rootDir, "data", "projects.json");
const outputPath = path.join(configuratorDir, "index.json");

function prettifySlug(slug) {
    return slug
        .split(/[-_.]/g)
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" ");
}

function compareVersions(left, right) {
    const leftParts = left.split(/([.-])/).filter(Boolean);
    const rightParts = right.split(/([.-])/).filter(Boolean);
    const maxLength = Math.max(leftParts.length, rightParts.length);

    for (let index = 0; index < maxLength; index += 1) {
        const leftPart = leftParts[index] ?? "";
        const rightPart = rightParts[index] ?? "";
        const leftNumber = Number(leftPart);
        const rightNumber = Number(rightPart);
        const leftIsNumber = leftPart !== "" && Number.isFinite(leftNumber);
        const rightIsNumber = rightPart !== "" && Number.isFinite(rightNumber);

        if (leftIsNumber && rightIsNumber && leftNumber !== rightNumber) {
            return rightNumber - leftNumber;
        }

        if (leftPart !== rightPart) {
            return rightPart.localeCompare(leftPart, "en", { numeric: true, sensitivity: "base" });
        }
    }

    return 0;
}

function buildProjectNameMap() {
    if (!fs.existsSync(projectsPath)) {
        return new Map();
    }

    const projects = JSON.parse(fs.readFileSync(projectsPath, "utf8"));
    return new Map(projects.map((project) => [project.slug, project.name]));
}

function buildConfiguratorIndex() {
    const projectNameMap = buildProjectNameMap();
    const plugins = {};

    const entries = fs.readdirSync(configuratorDir, { withFileTypes: true });
    entries
        .filter((entry) => entry.isDirectory())
        .forEach((entry) => {
            const slug = entry.name;
            const pluginDir = path.join(configuratorDir, slug);
            const versionFiles = fs.readdirSync(pluginDir, { withFileTypes: true })
                .filter((file) => file.isFile() && /\.ya?ml$/i.test(file.name))
                .map((file) => file.name)
                .sort(compareVersions);

            if (!versionFiles.length) {
                return;
            }

            plugins[slug] = {
                name: projectNameMap.get(slug) ?? prettifySlug(slug),
                versions: versionFiles.reduce((accumulator, fileName) => {
                    const version = fileName.replace(/\.ya?ml$/i, "");
                    accumulator[version] = `data/configurator/${slug}/${fileName}`;
                    return accumulator;
                }, {})
            };
        });

    return { plugins };
}

const indexContent = `${JSON.stringify(buildConfiguratorIndex(), null, 2)}\n`;
fs.writeFileSync(outputPath, indexContent, "utf8");
console.log(`Generated ${path.relative(rootDir, outputPath)}`);
