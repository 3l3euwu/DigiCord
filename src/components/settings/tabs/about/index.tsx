/*
 * DigiCord, a custom distribution of Vencord
 * Copyright (c) 2025 elee-py
 */

import "./styles.css";

import { Divider } from "@components/Divider";
import { FolderIcon, GithubIcon, InfoIcon, LinkIcon } from "@components/Icons";
import { QuickAction, QuickActionCard } from "@components/settings/QuickAction";
import { SettingsTab, wrapTab } from "@components/settings/tabs/BaseTab";
import { gitRemote } from "@shared/vencordUserAgent";
import { classNameFactory } from "@utils/css";
import { Margins } from "@utils/margins";
import { Forms, React, UserStore } from "@webpack/common";

import gitHash from "~git-hash";

const cl = classNameFactory("vc-digicord-about-");

function AboutTab() {
    const user = UserStore?.getCurrentUser();

    return (
        <SettingsTab>
            {/* Header */}
            <div className={cl("header")}>
                <div className={cl("logo")}>
                    <svg width="64" height="64" viewBox="0 0 64 64" fill="none">
                        <rect width="64" height="64" rx="16" fill="var(--brand-500)" />
                        <text x="32" y="42" textAnchor="middle" fill="white" fontSize="28" fontWeight="bold" fontFamily="Arial">Digi</text>
                    </svg>
                </div>
                <div className={cl("header-text")}>
                    <Forms.FormTitle tag="h2" className={cl("title")}>
                        Vencord + DigiCord
                    </Forms.FormTitle>
                    <Forms.FormText className={cl("subtitle")}>
                        Your customized Discord experience
                    </Forms.FormText>
                </div>
            </div>

            <Divider />

            {/* Quick Actions */}
            <section className={Margins.top16}>
                <Forms.FormTitle tag="h5">Quick Actions</Forms.FormTitle>

                <QuickActionCard>
                    <QuickAction
                        Icon={GithubIcon}
                        text="View Source Code"
                        action={() => VencordNative.native.openExternal("https://github.com/" + gitRemote)}
                    />
                    <QuickAction
                        Icon={LinkIcon}
                        text="DigiCord Website"
                        action={() => VencordNative.native.openExternal("https://github.com/3l3euwu/Vencord")}
                    />
                    <QuickAction
                        Icon={FolderIcon}
                        text="Open Settings Folder"
                        action={() => VencordNative.settings.openFolder()}
                    />
                </QuickActionCard>
            </section>

            <Divider />

            {/* Version Info */}
            <section className={Margins.top16}>
                <Forms.FormTitle tag="h5">Version Info</Forms.FormTitle>

                <div className={cl("info-grid")}>
                    <div className={cl("info-item")}>
                        <span className={cl("info-label")}>DigiCord Version</span>
                        <span className={cl("info-value")}>b2</span>
                    </div>
                    <div className={cl("info-item")}>
                        <span className={cl("info-label")}>Vencord Hash</span>
                        <span className={cl("info-value")}>{gitHash ?? "unknown"}</span>
                    </div>
                    <div className={cl("info-item")}>
                        <span className={cl("info-label")}>Platform</span>
                        <span className={cl("info-value")}>{navigator.platform}</span>
                    </div>
                    <div className={cl("info-item")}>
                        <span className={cl("info-label")}>User</span>
                        <span className={cl("info-value")}>
                            {user?.username ?? "Unknown"}#{user?.discriminator ?? "0000"}
                        </span>
                    </div>
                </div>
            </section>

            <Divider />

            {/* Credits */}
            <section className={Margins.top16}>
                <Forms.FormTitle tag="h5">Credits</Forms.FormTitle>

                <div className={cl("credits-list")}>
                    <div className={cl("credit-item")}>
                        <span className={cl("credit-name")}>Vendicated</span>
                        <span className={cl("credit-role")}>Vencord Creator</span>
                    </div>
                    <div className={cl("credit-item")}>
                        <span className={cl("credit-name")}>elee-py</span>
                        <span className={cl("credit-role")}>DigiCord Fork</span>
                    </div>
                    <div className={cl("credit-item")}>
                        <span className={cl("credit-name")}>BetterDiscord Team</span>
                        <span className={cl("credit-role")}>Plugin API Inspiration</span>
                    </div>
                </div>
            </section>

            <Divider />

            {/* Description */}
            <section className={Margins.top16}>
                <Forms.FormTitle tag="h5">About</Forms.FormTitle>
                <Forms.FormText className={cl("description")}>
                    DigiCord is a custom distribution of Vencord that adds support for external plugins
                    and themes at runtime. It features a Built-in plugin API compatible with both DigiCord
                    native plugins and BetterDiscord-style plugins.
                </Forms.FormText>
                <Forms.FormText className={cl("description")}>
                    Features include: external plugin management via URL, settings editor for plugins,
                    theme management, BdApi compatibility layer, and more.
                </Forms.FormText>
            </section>
        </SettingsTab>
    );
}

export default wrapTab(AboutTab, "DigiCord About");
