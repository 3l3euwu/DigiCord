/*
 * DigiCord, a custom distribution of Vencord
 * Copyright (c) 2025 elee-py
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

import * as DataStore from "@api/DataStore";
import { Logger } from "@utils/Logger";

const logger = new Logger("ExternalThemes", "#a6d189");

export interface ExternalThemeEntry {
    name: string;
    url: string;
    enabled: boolean;
    installedAt: number;
}

interface LoadedExternalTheme extends ExternalThemeEntry {
    styleElement: HTMLStyleElement;
}

const loadedThemes = new Map<string, LoadedExternalTheme>();

const DATASTORE_KEY = "DigiCord_externalThemes";
const STYLE_ROOT_ID = "dicicord-external-themes";

function getStyleRoot(): HTMLElement {
    let root = document.getElementById(STYLE_ROOT_ID);
    if (!root) {
        root = document.createElement("div");
        root.id = STYLE_ROOT_ID;
        root.style.display = "none";
        document.head.appendChild(root);
    }
    return root;
}

function guessThemeName(url: string): string {
    try {
        const u = new URL(url);
        const parts = u.pathname.split("/").filter(Boolean);
        const last = parts[parts.length - 1] ?? "theme";
        return last.replace(/\.css$/i, "").replace(/[-_]/g, " ");
    } catch {
        return "Unknown Theme";
    }
}

export async function installExternalTheme(url: string, name?: string): Promise<ExternalThemeEntry> {
    const normalizedUrl = url.trim();
    const themeName = name?.trim() || guessThemeName(normalizedUrl);

    let css: string;
    try {
        const resp = await fetch(normalizedUrl);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        css = await resp.text();
    } catch (e) {
        throw new Error(`Failed to fetch theme from ${normalizedUrl}: ${e}`);
    }

    if (loadedThemes.has(themeName)) {
        throw new Error(`Theme "${themeName}" is already installed. Uninstall it first.`);
    }

    const styleEl = document.createElement("style");
    styleEl.dataset.dicicordTheme = themeName;
    styleEl.textContent = css;

    const entry: ExternalThemeEntry = {
        name: themeName,
        url: normalizedUrl,
        enabled: true,
        installedAt: Date.now(),
    };

    const loaded: LoadedExternalTheme = {
        ...entry,
        styleElement: styleEl,
    };

    loadedThemes.set(themeName, loaded);
    getStyleRoot().appendChild(styleEl);

    const allEntries = await getExternalThemeEntries();
    allEntries[themeName] = entry;
    await DataStore.set(DATASTORE_KEY, allEntries);

    logger.info(`Installed external theme: ${themeName}`);
    return entry;
}

export async function uninstallExternalTheme(name: string): Promise<void> {
    const loaded = loadedThemes.get(name);
    if (loaded) {
        loaded.styleElement.remove();
        loadedThemes.delete(name);
    }

    const allEntries = await getExternalThemeEntries();
    delete allEntries[name];
    await DataStore.set(DATASTORE_KEY, allEntries);

    logger.info(`Uninstalled external theme: ${name}`);
}

export function toggleExternalTheme(name: string, enabled: boolean): void {
    const loaded = loadedThemes.get(name);
    if (!loaded) return;

    if (enabled) {
        if (!loaded.styleElement.isConnected) {
            getStyleRoot().appendChild(loaded.styleElement);
        }
    } else {
        loaded.styleElement.remove();
    }

    loaded.enabled = enabled;

    getExternalThemeEntries().then(async (allEntries) => {
        if (allEntries[name]) {
            allEntries[name].enabled = enabled;
            await DataStore.set(DATASTORE_KEY, allEntries);
        }
    });
}

export async function reloadExternalTheme(name: string): Promise<void> {
    const loaded = loadedThemes.get(name);
    if (!loaded) return;

    const url = loaded.url;
    await uninstallExternalTheme(name);
    await installExternalTheme(url, name);
}

export async function getExternalThemeEntries(): Promise<Record<string, ExternalThemeEntry>> {
    return (await DataStore.get(DATASTORE_KEY)) ?? {};
}

export function getExternalTheme(name: string): LoadedExternalTheme | undefined {
    return loadedThemes.get(name);
}

export function getAllExternalThemes(): LoadedExternalTheme[] {
    return Array.from(loadedThemes.values());
}

export async function initExternalThemes(): Promise<void> {
    const entries = await getExternalThemeEntries();
    logger.info(`Loading ${Object.keys(entries).length} external themes...`);

    for (const [name, entry] of Object.entries(entries)) {
        if (!entry.enabled) {
            logger.info(`Skipping disabled external theme: ${name}`);
            continue;
        }

        try {
            await installExternalTheme(entry.url, name);
            logger.info(`Loaded external theme: ${name}`);
        } catch (e) {
            logger.error(`Failed to load external theme ${name}\n`, e);
        }
    }
}
