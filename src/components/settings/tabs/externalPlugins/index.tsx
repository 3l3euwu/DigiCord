/*
 * DigiCord, a custom distribution of Vencord
 * Copyright (c) 2025 elee-py
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

import "./styles.css";

import {
    ExternalPluginEntry,
    getExternalPluginEntries,
    getExternalPlugin,
    installExternalPlugin,
    uninstallExternalPlugin,
    toggleExternalPlugin,
    reloadExternalPlugin,
} from "@api/ExternalPlugins";
import { Card } from "@components/Card";
import { SettingsTab, wrapTab } from "@components/settings/tabs/BaseTab";
import { classNameFactory } from "@utils/css";
import { Logger } from "@utils/Logger";
import { Margins } from "@utils/margins";
import { Forms, React, showToast, Toasts } from "@webpack/common";

import { openExternalPluginSettings } from "./ExternalPluginSettingsModal";
import { openExternalPluginInfo } from "./ExternalPluginInfoModal";

const cl = classNameFactory("vc-ext-plugins-");
const logger = new Logger("ExternalPluginsUI", "#ff6b6b");

function ExternalPluginsTab() {
    const [entries, setEntries] = React.useState<Record<string, ExternalPluginEntry>>({});
    const [urlInput, setUrlInput] = React.useState("");
    const [loading, setLoading] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);

    React.useEffect(() => {
        getExternalPluginEntries().then(setEntries);
    }, []);

    const handleInstall = async () => {
        if (!urlInput.trim()) return;

        setLoading(true);
        setError(null);

        try {
            await installExternalPlugin(urlInput.trim());
            setUrlInput("");
            showToast("Plugin installed successfully!", Toasts.Type.SUCCESS);
            const updated = await getExternalPluginEntries();
            setEntries(updated);
        } catch (e: any) {
            const msg = e?.message ?? String(e);
            setError(msg);
            logger.error("Failed to install external plugin", e);
        } finally {
            setLoading(false);
        }
    };

    const handleUninstall = async (name: string) => {
        try {
            await uninstallExternalPlugin(name);
            showToast(`Plugin "${name}" uninstalled.`, Toasts.Type.SUCCESS);
            const updated = await getExternalPluginEntries();
            setEntries(updated);
        } catch (e: any) {
            showToast(`Failed to uninstall: ${e?.message}`, Toasts.Type.FAILURE);
        }
    };

    const handleToggle = async (name: string, enabled: boolean) => {
        try {
            await toggleExternalPlugin(name, enabled);
            setEntries(prev => ({
                ...prev,
                [name]: { ...prev[name], enabled },
            }));
        } catch (e: any) {
            showToast(`Failed to toggle: ${e?.message}`, Toasts.Type.FAILURE);
        }
    };

    const handleReload = async (name: string) => {
        try {
            await reloadExternalPlugin(name);
            showToast(`Plugin "${name}" reloaded.`, Toasts.Type.SUCCESS);
        } catch (e: any) {
            showToast(`Failed to reload: ${e?.message}`, Toasts.Type.FAILURE);
        }
    };

    const handleSettings = (name: string) => {
        const loaded = getExternalPlugin(name);
        if (loaded?.settingsDef && Object.keys(loaded.settingsDef).length > 0) {
            openExternalPluginSettings(name, loaded.settingsDef);
        } else {
            showToast("This plugin has no settings.", Toasts.Type.FAILURE);
        }
    };

    const pluginList = Object.entries(entries);

    return (
        <SettingsTab>
            <Card variant="warning" defaultPadding>
                <Forms.FormText size="md">
                    External plugins run with full access to Discord. Only install plugins from sources you trust!
                </Forms.FormText>
            </Card>

            <section className={Margins.top16}>
                <Forms.FormTitle tag="h5">Install External Plugin</Forms.FormTitle>
                <div className={cl("input-row")}>
                    <input
                        className={cl("input")}
                        placeholder="https://example.com/my-plugin.js"
                        value={urlInput}
                        onChange={e => setUrlInput(e.target.value)}
                        onKeyDown={e => e.key === "Enter" && handleInstall()}
                        disabled={loading}
                    />
                    <button
                        className={cl("install-btn")}
                        onClick={handleInstall}
                        disabled={loading || !urlInput.trim()}
                    >
                        {loading ? "Installing..." : "Install"}
                    </button>
                </div>
                <Forms.FormText className={Margins.top8}>
                    Paste a direct URL to a .js plugin file (e.g. from GitHub raw)
                </Forms.FormText>
            </section>

            {error && (
                <div className={cl("error")}>{error}</div>
            )}

            <section className={Margins.top16}>
                <Forms.FormTitle tag="h5">
                    Installed External Plugins ({pluginList.length})
                </Forms.FormTitle>

                {pluginList.length === 0 ? (
                    <div className={cl("empty")}>
                        No external plugins installed. Add one above!
                    </div>
                ) : (
                    <div className={cl("grid")}>
                        {pluginList.map(([name, entry]) => {
                            const loaded = getExternalPlugin(name);
                            const hasSettings = loaded?.settingsDef && Object.keys(loaded.settingsDef).length > 0;

                            return (
                                <div key={name} className={cl("card")}>
                                    <div className={cl("card-header")}>
                                        <span className={cl("card-name")}>{name}</span>
                                        <span
                                            className={cl("status", entry.enabled ? "status-enabled" : "status-disabled")}
                                        >
                                            {entry.enabled ? "Enabled" : "Disabled"}
                                        </span>
                                    </div>
                                    <div className={cl("card-url")} title={entry.url}>
                                        {entry.url}
                                    </div>
                                    <div className={cl("card-actions")}>
                                        <button
                                            className={cl("action-btn")}
                                            onClick={() => openExternalPluginInfo(name)}
                                        >
                                            Info
                                        </button>
                                        {hasSettings && (
                                            <button
                                                className={cl("action-btn", "action-btn-settings")}
                                                onClick={() => handleSettings(name)}
                                            >
                                                Settings
                                            </button>
                                        )}
                                        <button
                                            className={cl("action-btn")}
                                            onClick={() => handleToggle(name, !entry.enabled)}
                                        >
                                            {entry.enabled ? "Disable" : "Enable"}
                                        </button>
                                        <button
                                            className={cl("action-btn")}
                                            onClick={() => handleReload(name)}
                                        >
                                            Reload
                                        </button>
                                        <button
                                            className={cl("action-btn", "action-btn-danger")}
                                            onClick={() => handleUninstall(name)}
                                        >
                                            Uninstall
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </section>
        </SettingsTab>
    );
}

export default wrapTab(ExternalPluginsTab, "External Plugins");
