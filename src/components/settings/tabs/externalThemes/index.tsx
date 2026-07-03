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
    ExternalThemeEntry,
    getExternalThemeEntries,
    installExternalTheme,
    uninstallExternalTheme,
    toggleExternalTheme,
} from "@api/ExternalThemes";
import { Card } from "@components/Card";
import { SettingsTab, wrapTab } from "@components/settings/tabs/BaseTab";
import { classNameFactory } from "@utils/css";
import { Logger } from "@utils/Logger";
import { Margins } from "@utils/margins";
import { Forms, React, showToast, Toasts } from "@webpack/common";

const cl = classNameFactory("vc-ext-themes-");
const logger = new Logger("ExternalThemesUI", "#a6d189");

function ExternalThemesTab() {
    const [entries, setEntries] = React.useState<Record<string, ExternalThemeEntry>>({});
    const [urlInput, setUrlInput] = React.useState("");
    const [nameInput, setNameInput] = React.useState("");
    const [loading, setLoading] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);

    React.useEffect(() => {
        getExternalThemeEntries().then(setEntries);
    }, []);

    const handleInstall = async () => {
        if (!urlInput.trim()) return;

        setLoading(true);
        setError(null);

        try {
            await installExternalTheme(urlInput.trim(), nameInput.trim() || undefined);
            setUrlInput("");
            setNameInput("");
            showToast("Theme installed successfully!", Toasts.Type.SUCCESS);
            const updated = await getExternalThemeEntries();
            setEntries(updated);
        } catch (e: any) {
            const msg = e?.message ?? String(e);
            setError(msg);
            logger.error("Failed to install external theme", e);
        } finally {
            setLoading(false);
        }
    };

    const handleUninstall = async (name: string) => {
        try {
            await uninstallExternalTheme(name);
            showToast(`Theme "${name}" uninstalled.`, Toasts.Type.SUCCESS);
            const updated = await getExternalThemeEntries();
            setEntries(updated);
        } catch (e: any) {
            showToast(`Failed to uninstall: ${e?.message}`, Toasts.Type.FAILURE);
        }
    };

    const handleToggle = (name: string, enabled: boolean) => {
        try {
            toggleExternalTheme(name, enabled);
            setEntries(prev => ({
                ...prev,
                [name]: { ...prev[name], enabled },
            }));
        } catch (e: any) {
            showToast(`Failed to toggle: ${e?.message}`, Toasts.Type.FAILURE);
        }
    };

    const themeList = Object.entries(entries);

    return (
        <SettingsTab>
            <Card variant="warning" defaultPadding>
                <Forms.FormText size="md">
                    External themes are loaded from remote URLs. Only install themes from sources you trust!
                </Forms.FormText>
            </Card>

            <section className={Margins.top16}>
                <Forms.FormTitle tag="h5">Install External Theme</Forms.FormTitle>
                <div className={cl("input-row")}>
                    <input
                        className={cl("input")}
                        placeholder="https://example.com/theme.css"
                        value={urlInput}
                        onChange={e => setUrlInput(e.target.value)}
                        onKeyDown={e => e.key === "Enter" && handleInstall()}
                        disabled={loading}
                    />
                    <input
                        className={cl("input")}
                        placeholder="Theme name (optional)"
                        value={nameInput}
                        onChange={e => setNameInput(e.target.value)}
                        onKeyDown={e => e.key === "Enter" && handleInstall()}
                        disabled={loading}
                        style={{ maxWidth: 180 }}
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
                    Paste a direct URL to a .css theme file (e.g. from GitHub raw)
                </Forms.FormText>
            </section>

            {error && (
                <div className={cl("error")}>{error}</div>
            )}

            <section className={Margins.top16}>
                <Forms.FormTitle tag="h5">
                    Installed External Themes ({themeList.length})
                </Forms.FormTitle>

                {themeList.length === 0 ? (
                    <div className={cl("empty")}>
                        No external themes installed. Add one above!
                    </div>
                ) : (
                    <div className={cl("grid")}>
                        {themeList.map(([name, entry]) => (
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
                                        onClick={() => handleToggle(name, !entry.enabled)}
                                    >
                                        {entry.enabled ? "Disable" : "Enable"}
                                    </button>
                                    <button
                                        className={cl("action-btn", "action-btn-danger")}
                                        onClick={() => handleUninstall(name)}
                                    >
                                        Uninstall
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </section>
        </SettingsTab>
    );
}

export default wrapTab(ExternalThemesTab, "External Themes");
