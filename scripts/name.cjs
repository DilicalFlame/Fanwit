"use strict"

const fs = require("node:fs");
const path = require("node:path");
const TOML = require("@iarna/toml");

const [, , developerNameInput, appNameInput] = process.argv;

if (!developerNameInput || !appNameInput) {
    console.error("Usage: node name.cjs <developer_name> <app_name>");
    process.exit(1);
}

const developerName = developerNameInput.trim();
const appName = appNameInput.trim();

if (!developerName) {
    console.error("Developer Name cannot be empty")
    process.exit(1);
}

if (!appName) {
    console.error("App Name cannot be empty")
    process.exit(1);
}

const rootDir = path.resolve(__dirname, "..");
const paths = {
    packageJson: path.join(rootDir, "package.json"),
    tauriConf: path.join(rootDir, "src-tauri", "tauri.conf.json"),
    cargoToml: path.join(rootDir, "src-tauri", "Cargo.toml"),
    cargoLock: path.join(rootDir, "src-tauri", "Cargo.lock"),
    mainRs: path.join(rootDir, "src-tauri", "src", "main.rs"),
    appConstants: path.join(rootDir, "constants", "app.ts"),
}

const updatedFiles = [];

function ensureFileExists(filePath) {
    if (!fs.existsSync(filePath)) {
        throw new Error(`Expected file not found: ${path.relative(rootDir, filePath)}`)
    }
}

function writeFile(filePath, content) {
    fs.writeFileSync(filePath, content, "utf8");
    updatedFiles.push(path.relative(rootDir, filePath));
}

function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function sanitizeIdentifierPart(part, fallback = "app") {
    const cleaned = part.toLowerCase().replace(/[^a-z0-9_-]/g, "");
    return cleaned || fallback;
}

function updateJsonFile(filePath, updateFn) {
    ensureFileExists(filePath);
    const raw = fs.readFileSync(filePath, "utf8");
    const json = JSON.parse(raw);
    const updated = updateFn(json);
    const serialized = `${JSON.stringify(updated, null, "\t")}\n`
    writeFile(filePath, serialized);
}

function updateCargoToml(rawContent, newAppName, newAuthor) {
    const cargo = TOML.parse(rawContent);
    if (!cargo.package) throw new Error("Cargo.toml is missing [package] section");
    if (!cargo.lib) throw new Error("Cargo.toml is missing [lib] section");

    const packageName = cargo.package.name;
    const libName = cargo.lib.name;

    if (typeof packageName !== "string") throw new Error("Unable to find package.name in Cargo.toml");
    if (typeof libName !== "string") throw new Error("Unable to find lib.name in Cargo.toml");

    cargo.package.name = newAppName;
    cargo.package.authors = [newAuthor];
    cargo.lib.name = `${newAppName}_lib`;

    const content = TOML.stringify(cargo);

    return {
        content: content.endsWith("\n") ? content : `${content}\n`,
        packageName,
        libName,
    };
}

function updateCargoLock(rawContent, oldName, newName) {
    const lines = rawContent.split(/\r?\n/);
    let updated = false;
    let currentStart = -1;

    function tryUpdatePackageBlock(start, end) {
        let nameLineIdx = -1;
        let nameValue = "";
        let hasSource = false;
        let hasTauriBuildDep = false;

        for (let i = start + 1; i < end; i += 1) {
            const line = lines[i].trim();
            if (line.startsWith("name = ")) {
                nameLineIdx = i;
                nameValue = line.replace(/^name\s*=\s*"(.+?)"\s*$/, "$1");
            }
            if (line.startsWith("source = ")) hasSource = true;
            if (line.includes('"tauri-build"')) hasTauriBuildDep = true;
        }

        if (nameLineIdx === -1) return false;

        const isExactNameMatch = nameValue === oldName;
        const isLocalRootPackage = !hasSource && hasTauriBuildDep;
        if (isExactNameMatch || isLocalRootPackage) {
            lines[nameLineIdx] = lines[nameLineIdx].replace(/^\s*name\s*=\s*".+?"\s*$/, `name = "${newName}"`);
            return true;
        }
        return false;
    }

    for (let i = 0; i <= lines.length; i += 1) {
        const line = i < lines.length ? lines[i].trim() : "[[package]]";
        if (line == "[[package]]") {
            if (!updated && currentStart !== -1) updated = tryUpdatePackageBlock(currentStart, i);
            currentStart = i;
        }
    }

    return {
        content: lines.join("\n"),
        updated
    };
}

try {
    updateJsonFile(paths.packageJson, (pkg) => {
        pkg.name = appName;
        return pkg;
    });

    // update Cargo.toml
    ensureFileExists(paths.cargoToml);
    const cargoResult = updateCargoToml(
        fs.readFileSync(paths.cargoToml, "utf8"),
        appName,
        developerName
    )
    writeFile(paths.cargoToml, cargoResult.content)

    // update main.rs
    ensureFileExists(paths.mainRs)
    const mainRsRaw = fs.readFileSync(paths.mainRs, "utf8")
    const newLibName = `${appName}_lib`
    let newMainContent = mainRsRaw;
    if (cargoResult.libName && mainRsRaw.includes(cargoResult.libName)) {
        const pattern = new RegExp(escapeRegExp(cargoResult.libName), "g");
        newMainContent = mainRsRaw.replace(pattern, newLibName);
    }

    if (newMainContent !== mainRsRaw) {
        writeFile(paths.mainRs, newMainContent);
    } else if (!mainRsRaw.includes(newLibName)) {
        throw new Error("main.rs does not reference the expected lib name.");
    }

    // update tauri.conf.json
    updateJsonFile(paths.tauriConf, (conf) => {
        conf.productName = appName;
        const developerSegment = sanitizeIdentifierPart(developerName, "dev");
        conf.identifier = `com.${developerSegment}.${appName}`;
        if (conf.app && Array.isArray(conf.app.windows)) {
            conf.app.windows = conf.app.windows.map((window) => ({
                ...window,
                title: appName,
            }));
        }
        return conf;
    });

    // update Cargo.lock
    if (fs.existsSync(paths.cargoLock)) {
        const cargoLockRaw = fs.readFileSync(paths.cargoLock, "utf8");
        const lockResult = updateCargoLock(cargoLockRaw, cargoResult.packageName, appName);
        if (lockResult.updated) {
            writeFile(
                paths.cargoLock,
                lockResult.content.endsWith("\n") ? lockResult.content : `${lockResult.content}\n`,
            );
        }
    }

    // update app constants
    if (fs.existsSync(paths.appConstants)) {
        let content = fs.readFileSync(paths.appConstants, "utf8");
        content = content.replace(/export const APP_NAME = ".*";/, `export const APP_NAME = "${appName}";`);
        content = content.replace(/export const DEVELOPER_NAME = ".*";/, `export const DEVELOPER_NAME = "${developerName}";`);
        writeFile(paths.appConstants, content);
    }

    // DONE!
    console.log("Updated:");
    updatedFiles.forEach((file) => {
        console.log(`- ${file}`);
    })
    console.log("Done!")
} catch (error) {
    console.error(error.message);
    process.exit(1);
}
