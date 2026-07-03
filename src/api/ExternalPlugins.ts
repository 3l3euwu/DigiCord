/*
 * DigiCord, a custom distribution of Vencord
 * Copyright (c) 2025 elee-py
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

import { addChatBarButton, removeChatBarButton } from "@api/ChatButtons";
import { registerCommand, unregisterCommand } from "@api/Commands";
import { addContextMenuPatch, removeContextMenuPatch } from "@api/ContextMenu";
import * as DataStore from "@api/DataStore";
import { addMemberListDecorator, removeMemberListDecorator } from "@api/MemberListDecorators";
import { addMessageAccessory, removeMessageAccessory } from "@api/MessageAccessories";
import { addMessageDecoration, removeMessageDecoration } from "@api/MessageDecorations";
import { addMessageClickListener, addMessagePreEditListener, addMessagePreSendListener, removeMessageClickListener, removeMessagePreEditListener, removeMessagePreSendListener } from "@api/MessageEvents";
import { addMessagePopoverButton, removeMessagePopoverButton } from "@api/MessagePopover";
import { addProfileBadge, removeProfileBadge } from "@api/Badges";
import { enableStyle, disableStyle } from "@api/Styles";
import { Logger } from "@utils/Logger";
import { Patch, Plugin, PluginDef } from "@utils/types";
import { FluxDispatcher } from "@webpack/common";
import { patches } from "@webpack/patcher";

const logger = new Logger("ExternalPlugins", "#ff6b6b");

// ── Settings types ────────────────────────────────────────────────────────

export const ExtOptionType = {
    STRING: 0,
    NUMBER: 1,
    BOOLEAN: 2,
    SELECT: 3,
    SLIDER: 4,
} as const;

export type ExtOptionType = typeof ExtOptionType[keyof typeof ExtOptionType];

export interface ExtSettingDef {
    type: ExtOptionType;
    description: string;
    displayName?: string;
    default?: any;
    options?: { label: string; value: string | number | boolean; default?: boolean; }[];
    markers?: number[];
    stickToMarkers?: boolean;
    placeholder?: string;
}

export type ExtSettingsDefinition = Record<string, ExtSettingDef>;

export interface ExtPluginSettings {
    def: ExtSettingsDefinition;
}

// ── Entry types ───────────────────────────────────────────────────────────

export interface ExternalPluginEntry {
    name: string;
    url: string;
    enabled: boolean;
    installedAt: number;
    settingsDef?: ExtSettingsDefinition;
}

interface LoadedExternalPlugin extends ExternalPluginEntry {
    plugin: Plugin;
    settingsValues: Record<string, any>;
    settingsDef?: ExtSettingsDefinition;
}

const loadedPlugins = new Map<string, LoadedExternalPlugin>();
const DATASTORE_KEY = "DigiCord_externalPlugins";
const SETTINGS_KEY = "DigiCord_extPluginSettings";

// ── Settings persistence ──────────────────────────────────────────────────

async function loadSettingsValues(pluginName: string): Promise<Record<string, any>> {
    const all: Record<string, Record<string, any>> = (await DataStore.get(SETTINGS_KEY)) ?? {};
    return all[pluginName] ?? {};
}

async function saveSettingsValues(pluginName: string, values: Record<string, any>): Promise<void> {
    const all: Record<string, Record<string, any>> = (await DataStore.get(SETTINGS_KEY)) ?? {};
    all[pluginName] = values;
    await DataStore.set(SETTINGS_KEY, all);
}

function buildSettingsProxy(pluginName: string, def: ExtSettingsDefinition, values: Record<string, any>) {
    // Fill defaults
    for (const [key, settingDef] of Object.entries(def)) {
        if (values[key] === undefined && settingDef.default !== undefined) {
            values[key] = settingDef.default;
        }
    }

    return new Proxy(values, {
        get(target, prop: string) {
            return target[prop];
        },
        set(target, prop: string, value) {
            const old = target[prop];
            target[prop] = value;

            if (old !== value) {
                saveSettingsValues(pluginName, { ...target });

                // Call onChange if defined
                const settingDef = def[prop];
                if (settingDef && (settingDef as any).onChange) {
                    try {
                        (settingDef as any).onChange(value, old);
                    } catch (e) {
                        logger.error(`${pluginName}: Error in setting ${prop}.onChange\n`, e);
                    }
                }
            }
            return true;
        },
    });
}

// ── Global API object exposed on window.DigiCord ──────────────────────────

function buildGlobalApi() {
    const getWebpack = () => require("@webpack");
    const getCommon = () => require("@webpack/common");

    return {
        // ── Plugin registration ──
        registerPlugin(pluginDef: PluginDef & Record<PropertyKey, any>) {
            const name = pluginDef.name;
            if (!name) {
                logger.error("External plugin must have a name!");
                return;
            }

            // Extract settings definition if present
            let settingsDef: ExtSettingsDefinition | undefined;
            if (pluginDef.settings?.def) {
                settingsDef = pluginDef.settings.def as ExtSettingsDefinition;
            }

            const plugin: Plugin = {
                ...pluginDef,
                name,
                started: false,
            } as Plugin;

            if (!window.__dicicord_internal) window.__dicicord_internal = {};
            window.__dicicord_internal[name] = plugin;

            // Also store settings def
            if (settingsDef) {
                window.__dicicord_internal_settings = window.__dicicord_internal_settings ?? {};
                window.__dicicord_internal_settings[name] = settingsDef;
            }

            logger.info(`Registered external plugin: ${name}`);
        },

        definePlugin(pluginDef: PluginDef & Record<PropertyKey, any>) {
            this.registerPlugin(pluginDef);
            return pluginDef;
        },

        // ── PluginManager helpers ──
        addPatch(patch: Omit<Patch, "plugin">, pluginName: string) {
            const fullPatch: Patch = { ...patch, plugin: pluginName };
            if (!Array.isArray(fullPatch.replacement)) {
                fullPatch.replacement = [fullPatch.replacement];
            }
            patches.push(fullPatch);
        },

        removePatch(find: string | RegExp, pluginName: string) {
            const idx = patches.findIndex(p => p.plugin === pluginName && p.find === find);
            if (idx !== -1) patches.splice(idx, 1);
        },

        // ── Settings helpers ──
        Settings: (() => {
            const s = require("@api/Settings");
            return {
                get store() { return s.Settings; },
                get plain() { return s.PlainSettings; },
            };
        })(),

        // ── DataStore (IndexedDB) ──
        DataStore: {
            async get<T = any>(pluginName: string, key: string): Promise<T | undefined> {
                return DataStore.get<T>(`DigiCord_ext_${pluginName}_${key}`);
            },
            async set(pluginName: string, key: string, value: any): Promise<void> {
                return DataStore.set(`DigiCord_ext_${pluginName}_${key}`, value);
            },
            async del(pluginName: string, key: string): Promise<void> {
                return DataStore.del(`DigiCord_ext_${pluginName}_${key}`);
            },
        },

        Logger: Logger,

        ContextMenu: {
            addPatch: addContextMenuPatch,
            removePatch: removeContextMenuPatch,
        },

        MessageEvents: {
            addPreSendListener: addMessagePreSendListener,
            removePreSendListener: removeMessagePreSendListener,
            addPreEditListener: addMessagePreEditListener,
            removePreEditListener: removeMessagePreEditListener,
            addClickListener: addMessageClickListener,
            removeClickListener: removeMessageClickListener,
        },

        Commands: {
            register(cmd: any, pluginName: string) {
                return registerCommand(cmd, pluginName);
            },
            unregister(name: string) {
                return unregisterCommand(name);
            },
        },

        Badges: { add: addProfileBadge, remove: removeProfileBadge },
        ChatButtons: { add: addChatBarButton, remove: removeChatBarButton },
        MessagePopover: { add: addMessagePopoverButton, remove: removeMessagePopoverButton },
        MessageAccessories: { add: addMessageAccessory, remove: removeMessageAccessory },
        MessageDecorations: { add: addMessageDecoration, remove: removeMessageDecoration },
        MemberListDecorators: { add: addMemberListDecorator, remove: removeMemberListDecorator },

        Styles: { enable: enableStyle, disable: disableStyle },

        get FluxDispatcher() { return getCommon().FluxDispatcher; },

        get Webpack() {
            const w = getWebpack();
            return {
                find: w.find,
                findAll: w.findAll,
                findByProps: w.findByProps,
                findByPropsLazy: w.findByPropsLazy,
                findByCode: w.findByCode,
                findByCodeLazy: w.findByCodeLazy,
                findByStoreName: w.findByStoreName,
                filters: w.filters,
                waitFor: w.waitFor,
                waitForComponent: w.waitForComponent,
                wreq: w.wreq,
                cache: w.cache,
            };
        },

        get React() { return getCommon().React; },

        get UI() {
            const c = getCommon();
            return {
                Button: c.Button,
                Forms: c.Forms,
                TextInput: c.TextInput,
                TextArea: c.TextArea,
                Switch: c.Switch,
                Select: c.Select,
                SearchableSelect: c.SearchableSelect,
                Tooltip: c.Tooltip,
                TabBar: c.TabBar,
                Slider: c.Slider,
                Dialog: c.Dialog,
                Clickable: c.Clickable,
                openModal: c.openModal,
                showModalLazy: c.showModalLazy,
                showToast: c.showToast,
                Toasts: c.Toasts,
            };
        },

        get Stores() {
            const c = getCommon();
            return {
                UserStore: c.UserStore,
                ChannelStore: c.ChannelStore,
                GuildStore: c.GuildStore,
                MessageStore: c.MessageStore,
                SelectedChannelStore: c.SelectedChannelStore,
                SelectedGuildStore: c.SelectedGuildStore,
                GuildMemberStore: c.GuildMemberStore,
                PresenceStore: c.PresenceStore,
                RelationshipStore: c.RelationshipStore,
                EmojiStore: c.EmojiStore,
            };
        },

        // ── Settings type constants for plugin authors ──
        OptionType: ExtOptionType,
    };
}

// ── Install the global API on window ──────────────────────────────────────

function installGlobalApi() {
    if (window.DigiCord) return;
    window.DigiCord = buildGlobalApi();
    logger.info("Installed global DigiCord API on window.DigiCord");
}

// ── Plugin lifecycle ──────────────────────────────────────────────────────

function startExternalPlugin(loaded: LoadedExternalPlugin): boolean {
    const p = loaded.plugin;
    if (p.started) return true;

    try {
        // Inject settings store into the plugin before calling start()
        if (loaded.settingsDef) {
            const proxy = buildSettingsProxy(p.name, loaded.settingsDef, loaded.settingsValues);
            (p as any).store = proxy;
        }

        if (p.start) p.start();
        p.started = true;

        if (p.patches) {
            for (const patch of p.patches) {
                const fullPatch: Patch = { ...patch, plugin: p.name };
                if (!Array.isArray(fullPatch.replacement)) {
                    fullPatch.replacement = [fullPatch.replacement];
                }
                patches.push(fullPatch);
            }
        }

        if (p.commands) {
            for (const cmd of p.commands) {
                registerCommand(cmd, p.name);
            }
        }

        if (p.flux) {
            for (const [event, handler] of Object.entries(p.flux)) {
                if (!handler) continue;
                const wrappedHandler = function () {
                    try {
                        const res = handler.apply(p, arguments as any);
                        return res instanceof Promise
                            ? res.catch(e => logger.error(`${p.name}: Error in flux handler ${event}\n`, e))
                            : res;
                    } catch (e) {
                        logger.error(`${p.name}: Error in flux handler ${event}\n`, e);
                    }
                };
                FluxDispatcher.subscribe(event as any, wrappedHandler);
                p.flux[event] = wrappedHandler as any;
            }
        }

        if (p.contextMenus) {
            for (const navId in p.contextMenus) {
                addContextMenuPatch(navId, p.contextMenus[navId]);
            }
        }

        if (p.userProfileBadge) addProfileBadge(p.userProfileBadge);
        if (p.chatBarButton) addChatBarButton(p.name, p.chatBarButton.render, p.chatBarButton.icon);
        if (p.messagePopoverButton) addMessagePopoverButton(p.name, p.messagePopoverButton.render, p.messagePopoverButton.icon);
        if (p.renderMessageAccessory) addMessageAccessory(p.name, p.renderMessageAccessory);
        if (p.renderMessageDecoration) addMessageDecoration(p.name, p.renderMessageDecoration);
        if (p.renderMemberListDecorator) addMemberListDecorator(p.name, p.renderMemberListDecorator);
        if (p.onBeforeMessageSend) addMessagePreSendListener(p.onBeforeMessageSend);
        if (p.onBeforeMessageEdit) addMessagePreEditListener(p.onBeforeMessageEdit);
        if (p.onMessageClick) addMessageClickListener(p.onMessageClick);
        if (p.managedStyle) enableStyle(p.managedStyle);

        logger.info(`Started external plugin: ${p.name}`);
        return true;
    } catch (e) {
        logger.error(`Failed to start external plugin ${p.name}\n`, e);
        return false;
    }
}

function stopExternalPlugin(p: Plugin): boolean {
    if (!p.started) return true;

    try {
        if (p.stop) p.stop();
        p.started = false;

        if (p.patches) {
            for (const patch of p.patches) {
                const idx = patches.findIndex(pp => pp.plugin === p.name && pp.find === patch.find);
                if (idx !== -1) patches.splice(idx, 1);
            }
        }

        if (p.commands) {
            for (const cmd of p.commands) {
                unregisterCommand(cmd.name);
            }
        }

        if (p.flux) {
            for (const [event, handler] of Object.entries(p.flux)) {
                if (handler) FluxDispatcher.unsubscribe(event as any, handler);
            }
        }

        if (p.contextMenus) {
            for (const navId in p.contextMenus) {
                removeContextMenuPatch(navId, p.contextMenus[navId]);
            }
        }

        if (p.userProfileBadge) removeProfileBadge(p.userProfileBadge);
        if (p.chatBarButton) removeChatBarButton(p.name);
        if (p.messagePopoverButton) removeMessagePopoverButton(p.name);
        if (p.renderMessageAccessory) removeMessageAccessory(p.name);
        if (p.renderMessageDecoration) removeMessageDecoration(p.name);
        if (p.renderMemberListDecorator) removeMemberListDecorator(p.name);
        if (p.onBeforeMessageSend) removeMessagePreSendListener(p.onBeforeMessageSend);
        if (p.onBeforeMessageEdit) removeMessagePreEditListener(p.onBeforeMessageEdit);
        if (p.onMessageClick) removeMessageClickListener(p.onMessageClick);
        if (p.managedStyle) disableStyle(p.managedStyle);

        logger.info(`Stopped external plugin: ${p.name}`);
        return true;
    } catch (e) {
        logger.error(`Failed to stop external plugin ${p.name}\n`, e);
        return false;
    }
}

// ── Execute a .js file and collect registered plugins ─────────────────────

async function executePluginScript(code: string): Promise<{ plugins: Plugin[], settingsDefs: Record<string, ExtSettingsDefinition> }> {
    installGlobalApi();

    window.__dicicord_internal = {};
    window.__dicicord_internal_settings = {};

    try {
        const fn = new Function(code);
        fn();
    } catch (e) {
        logger.error("Failed to execute plugin script:", e);
        throw e;
    }

    await new Promise(r => setTimeout(r, 50));

    const plugins: Plugin[] = [];
    if (window.__dicicord_internal) {
        for (const [name, plugin] of Object.entries(window.__dicicord_internal)) {
            plugins.push(plugin as Plugin);
        }
    }

    const settingsDefs: Record<string, ExtSettingsDefinition> = window.__dicicord_internal_settings ?? {};

    window.__dicicord_internal = {};
    window.__dicicord_internal_settings = {};

    return { plugins, settingsDefs };
}

// ── Public API ────────────────────────────────────────────────────────────

export async function installExternalPlugin(url: string): Promise<ExternalPluginEntry> {
    const normalizedUrl = url.trim();

    let code: string;
    try {
        const resp = await fetch(normalizedUrl);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        code = await resp.text();
    } catch (e) {
        throw new Error(`Failed to fetch plugin from ${normalizedUrl}: ${e}`);
    }

    // Strip leading JSDoc metadata block (/** ... */) if present
    if (code.startsWith("/**")) {
        const endIdx = code.indexOf("*/");
        if (endIdx !== -1) {
            code = code.substring(endIdx + 2).trim();
        }
    }

    let result: { plugins: Plugin[], settingsDefs: Record<string, ExtSettingsDefinition> };
    try {
        result = await executePluginScript(code);
    } catch (e: any) {
        const msg = e?.message ?? String(e);
        if (msg.includes("require is not defined") || msg.includes("fs") || msg.includes("path")) {
            throw new Error(
                "This plugin uses Node.js APIs (require, fs, path) which don't work in DigiCord. " +
                "This is likely a BetterDiscord plugin. DigiCord plugins must use DigiCord.* APIs instead.\n" +
                `Original error: ${msg}`
            );
        }
        throw new Error(`Failed to execute plugin script: ${msg}`);
    }

    if (result.plugins.length === 0) {
        throw new Error(
            "No plugin registered! Make sure your .js file calls DigiCord.registerPlugin({...}).\n\n" +
            "Example:\n" +
            "DigiCord.registerPlugin({\n" +
            "  name: 'MyPlugin',\n" +
            "  description: '...',\n" +
            "  authors: [{ name: 'You', id: 123 }],\n" +
            "  start() { console.log('Started!'); },\n" +
            "  stop() { console.log('Stopped!'); }\n" +
            "});"
        );
    }

    const plugin = result.plugins[0];
    const pluginName = plugin.name;

    if (!pluginName) {
        throw new Error("Plugin must have a name property!");
    }

    if (loadedPlugins.has(pluginName)) {
        throw new Error(`Plugin "${pluginName}" is already installed. Uninstall it first.`);
    }

    const settingsDef = result.settingsDefs[pluginName];

    // Load saved settings values
    const settingsValues = await loadSettingsValues(pluginName);

    const loaded: LoadedExternalPlugin = {
        name: pluginName,
        url: normalizedUrl,
        enabled: true,
        installedAt: Date.now(),
        plugin,
        settingsDef,
        settingsValues,
    };

    const started = startExternalPlugin(loaded);
    loaded.enabled = started;
    loadedPlugins.set(pluginName, loaded);

    const entry: ExternalPluginEntry = {
        name: pluginName,
        url: normalizedUrl,
        enabled: started,
        installedAt: loaded.installedAt,
        settingsDef,
    };

    const allEntries = await getExternalPluginEntries();
    allEntries[pluginName] = entry;
    await DataStore.set(DATASTORE_KEY, allEntries);

    logger.info(`Installed external plugin: ${pluginName}`);
    return entry;
}

export async function uninstallExternalPlugin(name: string): Promise<void> {
    const loaded = loadedPlugins.get(name);
    if (loaded) {
        stopExternalPlugin(loaded.plugin);
        loadedPlugins.delete(name);
    }

    const allEntries = await getExternalPluginEntries();
    delete allEntries[name];
    await DataStore.set(DATASTORE_KEY, allEntries);

    logger.info(`Uninstalled external plugin: ${name}`);
}

export async function toggleExternalPlugin(name: string, enabled: boolean): Promise<void> {
    const loaded = loadedPlugins.get(name);
    if (!loaded) return;

    if (enabled) {
        startExternalPlugin(loaded);
    } else {
        stopExternalPlugin(loaded.plugin);
    }

    loaded.enabled = enabled;

    const allEntries = await getExternalPluginEntries();
    if (allEntries[name]) {
        allEntries[name].enabled = enabled;
        await DataStore.set(DATASTORE_KEY, allEntries);
    }
}

export async function reloadExternalPlugin(name: string): Promise<void> {
    const loaded = loadedPlugins.get(name);
    if (!loaded) return;

    const url = loaded.url;
    await uninstallExternalPlugin(name);
    await installExternalPlugin(url);
}

export async function getExternalPluginEntries(): Promise<Record<string, ExternalPluginEntry>> {
    return (await DataStore.get(DATASTORE_KEY)) ?? {};
}

export function getExternalPlugin(name: string): LoadedExternalPlugin | undefined {
    return loadedPlugins.get(name);
}

export function getAllExternalPlugins(): LoadedExternalPlugin[] {
    return Array.from(loadedPlugins.values());
}

export async function getPluginSettings(pluginName: string): Promise<Record<string, any>> {
    const loaded = loadedPlugins.get(pluginName);
    if (loaded) return loaded.settingsValues;
    return loadSettingsValues(pluginName);
}

export async function setPluginSetting(pluginName: string, key: string, value: any): Promise<void> {
    const loaded = loadedPlugins.get(pluginName);
    if (loaded) {
        loaded.settingsValues[key] = value;
        await saveSettingsValues(pluginName, loaded.settingsValues);

        // Update the proxy target if it exists
        const store = (loaded.plugin as any).store;
        if (store && typeof store === "object") {
            store[key] = value;
        }
    } else {
        const values = await loadSettingsValues(pluginName);
        values[key] = value;
        await saveSettingsValues(pluginName, values);
    }
}

export async function initExternalPlugins(): Promise<void> {
    installGlobalApi();

    const entries = await getExternalPluginEntries();
    const count = Object.keys(entries).length;
    logger.info(`Loading ${count} external plugin(s)...`);

    for (const [name, entry] of Object.entries(entries)) {
        if (!entry.enabled) {
            logger.info(`Skipping disabled external plugin: ${name}`);
            continue;
        }

        if (loadedPlugins.has(name)) {
            logger.info(`Plugin ${name} already loaded, skipping`);
            continue;
        }

        try {
            const resp = await fetch(entry.url);
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            const code = await resp.text();

            const { plugins, settingsDefs } = await executePluginScript(code);
            if (plugins.length === 0) {
                logger.error(`External plugin ${name}: no DigiCord.registerPlugin() call found`);
                continue;
            }

            const plugin = plugins[0];
            const settingsDef = settingsDefs[name] ?? entry.settingsDef;

            const settingsValues = await loadSettingsValues(name);

            const loaded: LoadedExternalPlugin = {
                ...entry,
                plugin,
                settingsDef,
                settingsValues,
            };

            const started = startExternalPlugin(loaded);
            loaded.enabled = started;
            loadedPlugins.set(name, loaded);

            logger.info(`Loaded external plugin: ${name} (started: ${started})`);
        } catch (e) {
            logger.error(`Failed to load external plugin ${name}\n`, e);
        }
    }
}

// ── Type augmentation ─────────────────────────────────────────────────────

declare global {
    interface Window {
        DigiCord?: ReturnType<typeof buildGlobalApi>;
        __dicicord_internal?: Record<string, Plugin>;
        __dicicord_internal_settings?: Record<string, ExtSettingsDefinition>;
    }
}
