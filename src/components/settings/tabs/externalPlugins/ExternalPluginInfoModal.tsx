import { getExternalPlugin } from "@api/ExternalPlugins";
import { classNameFactory } from "@utils/css";
import { React, openModal, Modal, Forms } from "@webpack/common";

const cl = classNameFactory("vc-ext-info-");

interface InfoModalProps {
    pluginName: string;
    transitionState?: number;
    onClose: () => void;
}

function InfoModal({ pluginName, transitionState, onClose }: InfoModalProps) {
    const loaded = getExternalPlugin(pluginName);
    if (!loaded) {
        return (
            <Modal onClose={onClose} size="md" title={pluginName} transitionState={transitionState!}>
                <div style={{ padding: 16, color: "var(--text-danger)" }}>
                    Plugin not loaded. Try enabling it first.
                </div>
            </Modal>
        );
    }

    const { plugin, url, installedAt, settingsDef } = loaded;
    const authorList = plugin.authors ?? [];

    return (
        <Modal onClose={onClose} size="md" title={plugin.name} transitionState={transitionState!}>
            <div style={{ padding: "16px 0", display: "flex", flexDirection: "column", gap: 16 }}>

                {plugin.description && (
                    <div className={cl("section")}>
                        <Forms.FormTitle tag="h5">Description</Forms.FormTitle>
                        <Forms.FormText>{plugin.description}</Forms.FormText>
                    </div>
                )}

                {authorList.length > 0 && (
                    <div className={cl("section")}>
                        <Forms.FormTitle tag="h5">Authors</Forms.FormTitle>
                        {authorList.map((a, i) => (
                            <div key={i} className={cl("author")}>
                                <span className={cl("author-name")}>{a.name}</span>
                                {a.id != null && (
                                    <span className={cl("author-id")}>ID: {String(a.id)}</span>
                                )}
                            </div>
                        ))}
                    </div>
                )}

                <div className={cl("section")}>
                    <Forms.FormTitle tag="h5">Details</Forms.FormTitle>
                    <div className={cl("detail")}>
                        <span className={cl("detail-label")}>Status</span>
                        <span className={cl("detail-value", plugin.started ? "started" : "stopped")}>
                            {plugin.started ? "Running" : "Stopped"}
                        </span>
                    </div>
                    <div className={cl("detail")}>
                        <span className={cl("detail-label")}>Installed</span>
                        <span className={cl("detail-value")}>
                            {new Date(installedAt).toLocaleDateString(undefined, {
                                year: "numeric", month: "long", day: "numeric",
                                hour: "2-digit", minute: "2-digit"
                            })}
                        </span>
                    </div>
                    <div className={cl("detail")}>
                        <span className={cl("detail-label")}>Source</span>
                        <span className={cl("detail-value")} style={{ wordBreak: "break-all", fontSize: 12 }}>
                            {url}
                        </span>
                    </div>
                </div>

                {settingsDef && Object.keys(settingsDef).length > 0 && (
                    <div className={cl("section")}>
                        <Forms.FormTitle tag="h5">Settings ({Object.keys(settingsDef).length})</Forms.FormTitle>
                        {Object.entries(settingsDef).map(([key, def]) => (
                            <div key={key} className={cl("setting")}>
                                <span className={cl("setting-name")}>{key}</span>
                                <span className={cl("setting-desc")}>{def.description}</span>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </Modal>
    );
}

export function openExternalPluginInfo(pluginName: string) {
    openModal((props: any) => (
        <InfoModal {...props} pluginName={pluginName} />
    ));
}
