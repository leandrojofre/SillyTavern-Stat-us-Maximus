import {
    context,
    metadataName,
    saveMetadataSafe,
} from '../../index.js';

import { getBase64Async } from '/scripts/utils.js';

/**@typedef {StatUsMaximus.FileAttachment} FileAttachment */
/**@typedef {StatUsMaximus.FileManagerData} FileManagerData */
/** @typedef {typeof filesApiRoutes} APIRoutes */

const filesApiRoutes = {
    sanitizeFilename: '/api/files/sanitize-filename',
    fileUpload: '/api/files/upload',
    fileDelete: '/api/files/delete',
    fileVerify: '/api/files/verify',
    imageUpload: '/api/images/upload',
    imageDelete: '/api/images/delete',
    imageList: '/api/images/list',
};

const regexDetectRouteParam = /::(\w+)\//g;

/**
 * @template {keyof APIRoutes} RouteKey
 * @param {RouteKey} endpoint
 * @param {Object} [extra] Extra request parameters
 * @returns {APIRoutes[RouteKey]}
 */
function route(endpoint, extra = {}) {
    const url = `${filesApiRoutes[endpoint]}`;

    return url.replace(regexDetectRouteParam, (match, name) =>
        name in extra ? `${extra[name]}/` : ''
    );
}

/** @type {FileManagerData} */
const fileManagerTemplate = {
    files: [],
    images: [],
};

/**
 * Retrieves the gallery folder for a given character.
 * @param {Character} char Character data
 * @returns {string} The gallery folder for the character
 */
function getGalleryFolder(char) {
    return context().extensionSettings.gallery.folders[char?.avatar] ?? char?.name;
}

export class FileManager {
    /** @type {FileManagerData} */ static template;
    /** @type {ReturnType<context>['getRequestHeaders']} */ static getRequestHeaders;

    /** @type {FileAttachment[]} */ files;
    /** @type {FileAttachment[]} */ images;

    /**
     * @param {FileManagerData} [data]
     */
    constructor (data = {}) {
        const fileManager = {};

        for (const key in FileManager.template) {
            if (key in data) fileManager[key] = data[key];
        }

        Object.assign(this, structuredClone(FileManager.template), structuredClone(fileManager));

        FileManager.getRequestHeaders = context().getRequestHeaders;
    }

    saveMetadata() {
        context().chatMetadata[`${metadataName}_files`] = this;
        saveMetadataSafe();
    }

    /**
     * @param {string} fileName
     * @returns {Promise<string>}
     */
    async checkName(fileName) {
        const response = await $.ajax({
            url: route('sanitizeFilename'),
            headers: FileManager.getRequestHeaders(),
            method: 'POST',
            data: JSON.stringify({ fileName }),
            error(err) {
                const {responseJSON: data, responseText} = err;

                StatUsMaximus.error('File Manager', data?.message || responseText || 'Error validating filename');
            },
        });

        return response?.fileName;
    }

    /**
     * @param {string} base64String
     * @param {string} filename
     * @param {FilePropertyBag} [options]
     * @returns {File}
     */
    base64ToFile(base64String, filename, options) {
        if (base64String.includes(';base64,'))
            base64String = base64String.split(',').at(1);

        const binaryString = atob(base64String);
        const len = binaryString.length;
        const bytes = new Uint8Array(len);

        for (let i = 0; i < len; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }

        const blob = new Blob([bytes], { type: 'application/octet-stream' });
        const file = new File([blob], filename, options);

        return file;
    }

    /**
     * @param {Object} file
     * @param {File} file.image
     * @param {string} file.name
     * @param {string} file.format
     * @param {string} [file.path]
     * @returns {Promise<FileAttachment>}
     */
    async imageUpload(file) {
        if (!file.image || !file.name || !file.format) return;

        const oldAttachment = file.path ? this.images.find(img => img.url === file.path) : false;
        let deleteOldAttachment = false;

        if (oldAttachment) {
            deleteOldAttachment = file.format !== oldAttachment.extension;
            file.name = oldAttachment.name;
        }

        const { groupId, characters, characterId } = context();
        const chatID = groupId || getGalleryFolder(characters[characterId]) || '';
        const filename = await this.checkName(String(file.name));
        const manager = this;

        if (!filename || !chatID) return;

        const fileData = await getBase64Async(file.image).then(v => v.split(',').at(1) || '');
        const fileSizeApproximate = Math.round(fileData.length * 0.75);
        let attachment;

        if (!fileData) return;

        await $.ajax({
            url: route('imageUpload'),
            headers: FileManager.getRequestHeaders(),
            method: 'POST',
            data: JSON.stringify({
                image: fileData,
                filename: filename,
                ch_name: chatID,
                format: file.format,
            }),
            /**
             * @param {Object} response
             * @param {string} response.path
             */
            async success(response) {
                if (!response?.path) return;

                manager.images.push({
                    url: response.path,
                    name: filename,
                    extension: file.format,
                    created: Date.now(),
                    size: fileSizeApproximate,
                    type: 'avatar',
                });

                attachment = manager.images.at(-1);
                manager.saveMetadata();
                StatUsMaximus.log('File Manager', 'Image uploaded successfully', {attachment});

                if (deleteOldAttachment && oldAttachment)
                    await manager.imageDelete(oldAttachment.url);
            },
            error(err) {
                const {responseJSON: data, responseText} = err;

                StatUsMaximus.error('File Manager', data?.message || responseText || 'Image could not be uploaded');
            },
        });

        return attachment;
    }

    /**
     * @param {string} path
     * @returns {Promise<boolean>}
     */
    async imageDelete(path) {
        if (!path) return true;

        const imageExists = this.images.some(img => img.url === path);

        if (!imageExists) return true;

        const manager = this;
        let success = false;

        await $.ajax({
            url: route('imageDelete'),
            headers: FileManager.getRequestHeaders(),
            method: 'POST',
            data: JSON.stringify({
                path,
            }),
            success(response) {
                if (response.status)

                success = true;
                manager.images = manager.images.filter(img => img.url !== path);
                manager.saveMetadata();
                StatUsMaximus.log('File Manager', 'Image deleted successfully', {path});
            },
            error(err) {
                const {responseJSON: data, responseText} = err;

                StatUsMaximus.error('File Manager', data?.message || responseText || 'Image could not be deleted');
            },
        })

        return success;
    }
}

FileManager.template = fileManagerTemplate;