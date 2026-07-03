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
import { filters, findByProps, findByPropsLazy, findByCode, findByCodeLazy, find, findAll, findStore, waitFor, waitForComponent } from "@webpack";
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
                findStore: w.findStore,
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
                PermissionStore: c.PermissionStore,
                GuildChannelStore: c.GuildChannelStore,
            };
        },

        getCurrentGuildId() {
            const c = getCommon();
            return c.SelectedGuildStore?.getGuildId?.() ?? null;
        },

        getCurrentChannelId() {
            const c = getCommon();
            return c.SelectedChannelStore?.getChannelId?.() ?? null;
        },

        // ── Settings type constants for plugin authors ──
        OptionType: ExtOptionType,
    };
}

// ── BetterDiscord API shim ────────────────────────────────────────────────

function buildBdApi(pluginName?: string) {
    const getWebpack = () => require("@webpack");
    const getCommon = () => require("@webpack/common");

    const name = pluginName ?? "DigiCordPlugin";

    // ── Patcher ──
    // BD patcher monkey-patches live objects directly (not source-level).
    const patcher = {
        _patches: [] as Array<{
            mod: any; method: string; type: string;
            original: Function; patched: Function;
        }>,
        _counter: 0,

        _makeId() { return `bd_${name}_${this._counter++}`; },

        after(mod: any, method: string, callback: Function) {
            if (!mod?.[method] || typeof mod[method] !== "function") return;
            const original = mod[method];
            const patched = function (this: any, ...args: any[]) {
                const result = original.apply(this, args);
                try { callback(this, args, result); } catch (e) { console.error("[BdApi.Patcher.after]", e); }
                return result;
            };
            mod[method] = patched;
            this._patches.push({ mod, method, type: "after", original, patched });
        },

        before(mod: any, method: string, callback: Function) {
            if (!mod?.[method] || typeof mod[method] !== "function") return;
            const original = mod[method];
            const patched = function (this: any, ...args: any[]) {
                const cancel = { cancel: false };
                try { callback(this, args, cancel); } catch (e) { console.error("[BdApi.Patcher.before]", e); }
                if (cancel.cancel) return;
                return original.apply(this, args);
            };
            mod[method] = patched;
            this._patches.push({ mod, method, type: "before", original, patched });
        },

        instead(mod: any, method: string, callback: Function) {
            if (!mod?.[method] || typeof mod[method] !== "function") return;
            const original = mod[method];
            const patched = function (this: any, ...args: any[]) {
                return callback(this, args, original.bind(this));
            };
            mod[method] = patched;
            this._patches.push({ mod, method, type: "instead", original, patched });
        },

        unpatchAll() {
            for (const p of this._patches) {
                if (p.mod?.[p.method] === p.patched) {
                    p.mod[p.method] = p.original;
                }
            }
            this._patches = [];
        }
    };

    // ── Webpack ──
    const bdFilters = {
        byProps: (...props: string[]) => (m: any) => props.every(p => m && typeof m[p] !== "undefined"),
        byKeys: (...keys: string[]) => (m: any) => keys.every(k => m && typeof m[k] !== "undefined"),
        bySource: (...code: string[]) => (m: any) => {
            try {
                // Check function toString
                if (typeof m === "function") {
                    const str = Function.prototype.toString.call(m);
                    if (code.every(c => str.includes(c))) return true;
                }
                // Check object values
                if (typeof m === "object" && m !== null) {
                    for (const val of Object.values(m)) {
                        if (typeof val === "function") {
                            const str = Function.prototype.toString.call(val);
                            if (code.every(c => str.includes(c))) return true;
                        }
                    }
                }
                return false;
            } catch {
                return false;
            }
        },
        byStrings: (...strings: string[]) => (m: any) => {
            try {
                if (typeof m === "function") {
                    const str = Function.prototype.toString.call(m);
                    if (strings.every(s => str.includes(s))) return true;
                }
                if (typeof m === "object" && m !== null) {
                    for (const val of Object.values(m)) {
                        if (typeof val === "function") {
                            const str = Function.prototype.toString.call(val);
                            if (strings.every(s => str.includes(s))) return true;
                        }
                    }
                }
                return false;
            } catch {
                return false;
            }
        },
        byPrototypeKeys: (...keys: string[]) => (m: any) => {
            return keys.every(k => m?.prototype && typeof m.prototype[k] === "function");
        },
        byDisplayName: (display: string) => (m: any) => m?.displayName === display,
        byStoreName: (storeName: string) => (m: any) => m?.storeName === storeName || m?.constructor?.storeName === storeName || m?._dispatchToken?.includes(storeName),
        combine: (...fns: Function[]) => (m: any) => fns.every(fn => fn(m)),
        not: (fn: Function) => (m: any) => !fn(m),
    };

    const webpack = {
        get Module() { return getWebpack(); },
        get Common() { return getCommon(); },

        find(filter: Function) {
            const w = getWebpack();
            const cache = w.cache ?? {};
            for (const key in cache) {
                const mod = cache[key];
                if (!mod?.exports) continue;
                if (filter(mod.exports)) return mod.exports;
                if (typeof mod.exports === "object") {
                    for (const nestedKey in mod.exports) {
                        const nested = mod.exports[nestedKey];
                        if (nested && filter(nested)) return nested;
                    }
                }
            }
            return null;
        },
        findAll(filter: Function) {
            const w = getWebpack();
            const cache = w.cache ?? {};
            const results: any[] = [];
            for (const key in cache) {
                const mod = cache[key];
                if (!mod?.exports) continue;
                if (filter(mod.exports)) results.push(mod.exports);
                if (typeof mod.exports === "object") {
                    for (const nestedKey in mod.exports) {
                        const nested = mod.exports[nestedKey];
                        if (nested && filter(nested)) results.push(nested);
                    }
                }
            }
            return results;
        },

        getModule(filter: Function, opts?: { all?: boolean; raw?: boolean; defaultExport?: boolean }) {
            const result = opts?.all ? findAll(filter as any) : find(filter as any);
            if (opts?.raw) return result;
            return result;
        },

        getBulk(...queries: any[]) {
            const w = getWebpack();
            const cache = w.cache ?? {};
            const results = queries.map(() => undefined as any);

            // Search through ALL webpack modules like BD does
            for (const key in cache) {
                const mod = cache[key];
                if (!mod?.exports) continue;

                for (let q = 0; q < queries.length; q++) {
                    if (results[q] !== undefined) continue; // already found
                    const query = queries[q];
                    const filter = query.filter;
                    if (!filter) continue;

                    // Check direct export
                    if (filter(mod.exports)) {
                        let result = mod.exports;
                        if (query.defaultExport !== false && result?.default) result = result.default;
                        if (query.map && typeof result === "object" && result !== null) {
                            const mapped: any = {};
                            for (const [key2, mapFn] of Object.entries(query.map)) {
                                try { mapped[key2] = (mapFn as Function)(result); } catch { mapped[key2] = undefined; }
                            }
                            results[q] = mapped;
                        } else {
                            results[q] = result;
                        }
                        continue;
                    }

                    // Check nested exports
                    if (typeof mod.exports === "object") {
                        for (const nestedKey in mod.exports) {
                            const nested = mod.exports[nestedKey];
                            if (nested && filter(nested)) {
                                let result = nested;
                                if (query.defaultExport !== false && result?.default) result = result.default;
                                if (query.map && typeof result === "object" && result !== null) {
                                    const mapped: any = {};
                                    for (const [key2, mapFn] of Object.entries(query.map)) {
                                        try { mapped[key2] = (mapFn as Function)(result); } catch { mapped[key2] = undefined; }
                                    }
                                    results[q] = mapped;
                                } else {
                                    results[q] = result;
                                }
                                break;
                            }
                        }
                    }
                }
            }

            return results.map((r, i) => r ?? {});
        },

        async waitForModule(filter: Function, opts?: { signal?: AbortSignal; defaultExport?: boolean; raw?: boolean; }) {
            return new Promise((resolve) => {
                if (opts?.signal?.aborted) { resolve(undefined); return; }
                const check = () => {
                    const result = webpack.find(filter);
                    if (result) {
                        if (opts?.defaultExport === false || opts?.raw) resolve(result);
                        else resolve(result?.default ?? result);
                        return true;
                    }
                    return false;
                };
                if (check()) return;
                const interval = setInterval(() => {
                    if (opts?.signal?.aborted) { clearInterval(interval); resolve(undefined); return; }
                    if (check()) clearInterval(interval);
                }, 100);
            });
        },

        Filters: bdFilters,
        filters: bdFilters,
        Stores: getCommon(),
    };

    // ── DOM ──
    const dom = {
        addStyle(id: string, css: string) {
            const existing = document.getElementById(id);
            if (existing) existing.remove();
            const style = document.createElement("style");
            style.id = id;
            style.textContent = css;
            document.head.appendChild(style);
        },
        removeStyle(id: string) {
            const el = document.getElementById(id);
            if (el) el.remove();
        },
        query(selector: string) { return document.querySelector(selector); },
        queryAll(selector: string) { return document.querySelectorAll(selector); },
        createElement(tag: string, options?: any) {
            const el = document.createElement(tag);
            if (options?.id) el.id = options.id;
            if (options?.className) el.className = options.className;
            if (options?.textContent) el.textContent = options.textContent;
            if (options?.style) el.style.cssText = options.style;
            return el;
        }
    };

    // ── Data ──
    const data = {
        save(key: string, val: any) {
            DataStore.set(`DigiCord_bd_${name}_${key}`, val);
        },
        load(key: string) {
            return DataStore.get(`DigiCord_bd_${name}_${key}`);
        },
        delete(key: string) {
            DataStore.del(`DigiCord_bd_${name}_${key}`);
        }
    };

    // ── UI ──
    const ui = {
        showToast(content: string, options?: any) {
            const type = typeof options === "string" ? options : options?.type;
            const typeMap: Record<string, number> = { success: 1, error: 4, warning: 2, info: 1 };
            getCommon().showToast?.(content, typeMap[type] ?? 1);
        },
        showConfirmationModal(title: string, content: any, options?: any) {
            getCommon().showConfirmationModal?.(title, content, options);
        },
        showNotification(options: any) {
            getCommon().showNotification?.(options);
        },
        showChangelogModal(options: any) {
            getCommon().showChangelogModal?.(options);
        },
        buildSettingsPanel(options: any) {
            // Return a React element that renders settings
            const React = getCommon().React;
            if (!React) return null;

            // Store reference for settings access
            const settingsRef = { current: {} as any };

            return React.createElement("div", null,
                ...((options.settings ?? []).map((section: any) => {
                    if (section.type === "category") {
                        return React.createElement("div", { style: { marginTop: "16px" } },
                            React.createElement("h3", { style: { color: "var(--header-primary)", marginBottom: "8px" } }, section.name),
                            ...((section.settings ?? []).map((setting: any) => {
                                const val = typeof setting.value === "function" ? setting.value() : setting.value;
                                return React.createElement("div", { style: { marginBottom: "8px" } },
                                    React.createElement("label", { style: { color: "var(--header-secondary)", display: "block", marginBottom: "4px" } }, setting.name),
                                    React.createElement("span", { style: { color: "var(--text-muted)", fontSize: "12px", display: "block", marginBottom: "4px" } }, setting.note),
                                    (() => {
                                        if (setting.type === "switch") {
                                            return React.createElement("input", {
                                                type: "checkbox",
                                                checked: val,
                                                onChange: (e: any) => {
                                                    settingsRef.current[setting.id] = e.target.checked;
                                                    options.onChange?.(section.id, setting.id, e.target.checked);
                                                }
                                            });
                                        }
                                        if (setting.type === "dropdown") {
                                            return React.createElement("select", {
                                                value: val,
                                                onChange: (e: any) => {
                                                    const opt = setting.options?.find((o: any) => String(o.value) === e.target.value);
                                                    settingsRef.current[setting.id] = opt ? opt.value : e.target.value;
                                                    options.onChange?.(section.id, setting.id, settingsRef.current[setting.id]);
                                                }
                                            },
                                                ...((setting.options ?? []).map((opt: any) =>
                                                    React.createElement("option", { value: String(opt.value), key: String(opt.value) }, opt.label)
                                                ))
                                            );
                                        }
                                        // text/number
                                        return React.createElement("input", {
                                            type: setting.type === "text" ? "text" : "number",
                                            value: val,
                                            onChange: (e: any) => {
                                                settingsRef.current[setting.id] = e.target.value;
                                                options.onChange?.(section.id, setting.id, e.target.value);
                                            }
                                        });
                                    })()
                                );
                            }))
                        );
                    }
                    return null;
                }))
            );
        },
        alert(title: string, content: string) {
            getCommon().showConfirmationModal?.(title, content);
        }
    };

    // ── Logger ──
    const logger = new Logger(name, "#ff6b6b");

    // ── ContextMenu ──
    const contextMenu = {
        _patches: [] as Array<{ navId: string; patch: Function; }>,
        patch(navId: string, callback: Function) {
            addContextMenuPatch(navId, callback as any);
            this._patches.push({ navId, patch: callback });
        },
        unpatch(navId: string, callback: Function) {
            removeContextMenuPatch(navId, callback as any);
            this._patches = this._patches.filter(p => !(p.navId === navId && p.patch === callback));
        },
        buildMenu(items: any[]) {
            return items;
        },
        open(e: any, menu: any) {
            // Placeholder - would need Discord's Menu API
        },
        buildItem(options: any) {
            return options;
        },
        Item: null as any, // React component placeholder
    };

    // ── ReactUtils ──
    const reactUtils = {
        createNodePatcher() {
            return {
                patch(element: any, callback: Function) {
                    // Simple node patching
                    if (element?.props) {
                        callback(element.props, element);
                    }
                }
            };
        }
    };

    // ── Net ──
    const net = {
        fetch: window.fetch.bind(window),
    };

    // ── Components ──
    const components = {
        get TextInput() { return getCommon().TextInput; },
        get NumberInput() { return getCommon().TextInput; },
        get Button() { return getCommon().Button; },
        get Text() { return getCommon().Forms?.FormText; },
    };

    // ── Plugins ──
    const plugins = {
        folder: "betterdiscord/plugins",
        reload(pluginName: string) { /* stub */ },
        enable(pluginName: string) { /* stub */ },
    };

    return {
        Patcher: patcher,
        Webpack: webpack,
        DOM: dom,
        Data: data,
        UI: ui,
        Logger: logger,
        ContextMenu: contextMenu,
        ReactUtils: reactUtils,
        Net: net,
        React: getCommon().React,
        Components: components,
        Plugins: plugins,
        Utils: {},
        _pluginName: name,
    };
}

// Make BdApi a constructor
const BdApiConstructor = function(this: any, pluginName: string) {
    if (!(this instanceof BdApiConstructor)) {
        return new (BdApiConstructor as any)(pluginName);
    }
    return buildBdApi(pluginName);
} as any;
BdApiConstructor.prototype = {};

// ── Install the global API on window ──────────────────────────────────────

function installGlobalApi() {
    if (window.DigiCord) return;
    window.DigiCord = buildGlobalApi();
    window.BdApi = BdApiConstructor;
    logger.info("Installed global DigiCord API and BdApi shim on window");
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

    // Set up module.exports for BetterDiscord-style plugins
    const moduleObj: any = { exports: {} };
    const exportsObj = moduleObj.exports;

    // Detect if this is a BetterDiscord plugin (uses module.exports)
    const isBDPlugin = code.includes("module.exports");

    try {
        if (isBDPlugin) {
            // BetterDiscord pattern: wrap in a function that provides module/exports
            // Also provide stub require for Node.js modules (fs, path, etc.)
            const bdRequire = (module: string) => {
                if (module === "fs") {
                    return {
                        readFileSync: () => { throw new Error("fs.readFileSync is not available in DigiCord"); },
                        writeFileSync: () => { throw new Error("fs.writeFileSync is not available in DigiCord"); },
                        existsSync: () => false,
                        readdirSync: () => [],
                        statSync: () => ({ isFile: () => false, isDirectory: () => false }),
                    };
                }
                if (module === "path") {
                    return {
                        join: (...args: any[]) => args.map(String).join("/"),
                        resolve: (...args: any[]) => args.map(String).join("/"),
                        dirname: (p: any) => String(p).split("/").slice(0, -1).join("/"),
                        basename: (p: any) => String(p).split("/").pop() ?? "",
                        extname: (p: any) => { const parts = String(p).split("."); return parts.length > 1 ? `.${parts.pop()}` : ""; },
                        sep: "/",
                    };
                }
                // Try Vencord's require for other modules
                try {
                    return require(module);
                } catch {
                    return {};
                }
            };
            const fn = new Function("module", "exports", "require", "BdApi", "DigiCord", code);
            fn(moduleObj, exportsObj, bdRequire, window.BdApi, window.DigiCord);

            // Check what was exported
            const exported = moduleObj.exports;

            if (typeof exported === "function") {
                // class/module.exports = class MyPlugin { ... }
                try {
                    const instance = new exported();
                    wrapBDPlugin(instance);
                } catch (e) {
                    // Maybe it's a function that returns a class
                    try {
                        const PluginClass = exported({ BdApi: window.BdApi, DigiCord: window.DigiCord });
                        if (typeof PluginClass === "function") {
                            const instance = new PluginClass();
                            wrapBDPlugin(instance);
                        }
                    } catch (e2) {
                        logger.error("Failed to instantiate BD plugin:", e, e2);
                    }
                }
            } else if (typeof exported === "object" && exported !== null) {
                // module.exports = { start, stop, ... }
                wrapBDPlugin(exported);
            }
        } else {
            // DigiCord pattern
            const fn = new Function(code);
            fn();
        }
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

// ── Wrap a BetterDiscord-style plugin into DigiCord format ────────────────

function wrapBDPlugin(bdPlugin: any) {
    // Extract settings from BD format if present
    let settingsDef: ExtSettingsDefinition | undefined;
    if (bdPlugin.Settings && typeof bdPlugin.Settings === "object") {
        settingsDef = {};
        for (const [key, val] of Object.entries(bdPlugin.Settings)) {
            const v = val as any;
            settingsDef[key] = {
                type: v.type === "switch" ? ExtOptionType.BOOLEAN
                    : v.type === "textbox" ? ExtOptionType.STRING
                    : v.type === "dropdown" ? ExtOptionType.SELECT
                    : v.type === "slider" ? ExtOptionType.SLIDER
                    : ExtOptionType.STRING,
                description: v.note ?? "",
                default: v.value ?? v.default,
                options: v.options?.map((o: any) => ({ label: o.label ?? String(o.value), value: o.value })),
                placeholder: v.placeholder,
            };
        }
    }

    // Get plugin name
    const pluginName = bdPlugin.name
        ?? bdPlugin.getName?.()
        ?? bdPlugin.constructor?.pluginName
        ?? bdPlugin.constructor?.name
        ?? "UnknownBDPlugin";

    // Build DigiCord-compatible plugin object
    const plugin: Plugin = {
        name: pluginName,
        description: bdPlugin.description ?? bdPlugin.getDescription?.() ?? "",
        authors: bdPlugin.authors ?? [{ name: "BD Author", id: 0 }],
        started: false,

        start() {
            try {
                if (typeof bdPlugin.onStart === "function") bdPlugin.onStart();
                else if (typeof bdPlugin.start === "function") bdPlugin.start();
                bdPlugin._enabled = true;
            } catch (e) {
                logger.error(`BD Plugin ${pluginName} start failed:`, e);
                throw e;
            }
        },

        stop() {
            try {
                if (typeof bdPlugin.onStop === "function") bdPlugin.onStop();
                else if (typeof bdPlugin.stop === "function") bdPlugin.stop();
                bdPlugin._enabled = false;
            } catch (e) {
                logger.error(`BD Plugin ${pluginName} stop failed:`, e);
            }
        },
    } as Plugin;

    // Store settings
    if (settingsDef) {
        window.__dicicord_internal_settings = window.__dicicord_internal_settings ?? {};
        window.__dicicord_internal_settings[pluginName] = settingsDef;
    }

    if (!window.__dicicord_internal) window.__dicicord_internal = {};
    window.__dicicord_internal[pluginName] = plugin;

    logger.info(`Wrapped BetterDiscord plugin: ${pluginName}`);
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
        throw new Error(`Failed to execute plugin script: ${msg}`);
    }

    if (result.plugins.length === 0) {
        throw new Error(
            "No plugin registered! Your .js file must use one of these patterns:\n\n" +
            "// DigiCord pattern:\n" +
            "DigiCord.registerPlugin({\n" +
            "  name: 'MyPlugin',\n" +
            "  description: '...',\n" +
            "  authors: [{ name: 'You', id: 123 }],\n" +
            "  start() { console.log('Started!'); },\n" +
            "  stop() { console.log('Stopped!'); }\n" +
            "});\n\n" +
            "// BetterDiscord pattern:\n" +
            "module.exports = class MyPlugin {\n" +
            "  start() { console.log('Started!'); }\n" +
            "  stop() { console.log('Stopped!'); }\n" +
            "};"
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
        BdApi?: typeof BdApiConstructor;
        __dicicord_internal?: Record<string, Plugin>;
        __dicicord_internal_settings?: Record<string, ExtSettingsDefinition>;
    }
}
