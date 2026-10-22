import {
    context,
    metadataName,
    saveMetadataSafe
} from "../../index.js";

const defaultSettings = {
    allow_private: true,
};

export class ChatSettings {
    /** @type {Object} */ static defaultSettings;

    /** @type {string} */metadataKey;

    constructor () {
        this.metadataKey = `${metadataName}_settings`;
    }

    update() {
        const { chatMetadata, chatId } = context();
        const { metadataKey } = this;

        if (!chatId) return false;

        const currentMetadata = chatMetadata[metadataKey] || structuredClone(defaultSettings);
        chatMetadata[metadataKey] = currentMetadata;

        return true;
    }

    /**
     * @returns {string[]}
     */
    keys() {
        if (!this.update()) return;

        const { chatMetadata } = context();
        const { metadataKey } = this;

        return Object.keys(chatMetadata[metadataKey]);
    }

    /**
     * @param {keyof defaultSettings} name
     * @param {any} value
     */
    set(name, value) {
        if (!this.update()) return;
        if (!name || typeof name !== 'string') return;

        const { chatMetadata } = context();
        const { metadataKey } = this;

        chatMetadata[metadataKey][name] = value;
        saveMetadataSafe();
    }

    /**
     * @param {keyof defaultSettings} name
     */
    get(name) {
        if (!this.update()) return;
        if (!name || typeof name !== 'string') return;

        const { chatMetadata } = context();
        const { metadataKey } = this;

        return chatMetadata[metadataKey][name];
    }
}

ChatSettings.defaultSettings = defaultSettings;