import { extension_prompt_roles } from '../../../../script.js';
import { copyText } from "../../../utils.js";
import { getGroupMembers } from "../../../group-chats.js";

import { Status } from './source/classes/Status.js';
import { StatusEntry } from './source/classes/StatusEntry.js';
import { registerEvents } from './source/js/eventListeners.js';
import { CUSTOM_MACROS } from './source/js/macros.js';

export {
    // ST re-exports
    extension_prompt_roles,
    copyText,
    substituteParams,
    setExtensionPrompt,
    t,
    eventSource,
    eventTypes,
    // Native exports
    getFreeDataUid,
    log,
    debug,
    error,
    escapeNewlines,
    unEscapeNewlines,
    exportObjectToClipboard,
    getActiveParticipants,
    context,
    createElement,
    saveMetadataSTUM,
    extensionSettings,
    metadataName,
    extensionName
};

// * MARK:Extension variables

/**
 * @typedef {{name:string; description: string; avatar:string; is_user: boolean}} UserCharacter
 *
 * @typedef {Object} ExtensionSettings
 * @property {boolean} enabled
 * @property {boolean} editNumbersFromChat - Legacy name for what now is replace macros with inputs from chat
 * @property {boolean} autoDetectParticipants
 * @property {boolean} hideInputLabels
 * @property {string} rangeInputWidth
 * @property {boolean} showWhiteSpaces
 * @property {number} minPromptDepth
 * @property {boolean} alwaysIncludeUnmutedMembers
 * @property {boolean} altMacroTemplateBehavior
 * @property {boolean} autoSaveMetadata
 * @property {boolean} debug
 */

const context = () => SillyTavern.getContext();

const {
    t,
    saveChat,
    substituteParams,
    setExtensionPrompt,
    extensionSettings: extension_settings,
    saveSettingsDebounced,
    characters,
    powerUserSettings,
    eventSource,
    eventTypes
} = context();

const {
    lodash
} = SillyTavern.libs;

const debounceTimeout = {
    SHORT: 300,
    MED: 500,
    LONG: 700
};

const extensionFullName = 'SillyTavern-Stat-us-Maximus';
const extensionName = 'Stat-us-Maximus';
const metadataName = extensionName.toLowerCase().replaceAll('-', '_');
const htmlSuffix = extensionName.toLowerCase();
const extensionFolderPath = `scripts/extensions/third-party/${extensionFullName}`;
const saveChatDebounced = lodash.debounce(saveChat, debounceTimeout.MED);

/** @type {ExtensionSettings} */
const extensionSettings = extension_settings[extensionFullName];

/** @type {ExtensionSettings} */
const defaultSettings = {
    enabled: true,
    editNumbersFromChat: false,
    autoDetectParticipants: true,
    hideInputLabels: false,
    rangeInputWidth: "auto",
    showWhiteSpaces: false,
    minPromptDepth: 0,
    alwaysIncludeUnmutedMembers: false,
    altMacroTemplateBehavior: false,
    autoSaveMetadata: true,
    debug: false
};

const HTML_TEMPLATES = {
	/** @returns {Promise<JQuery<HTMLElement>>} */
    get: async function(fileName = "settings") {
		const file = HTML_TEMPLATES[fileName] ?? await $.get(`${extensionFolderPath}/source/templates/${fileName}.html`);

		if (!HTML_TEMPLATES[fileName]) HTML_TEMPLATES[fileName] = file;

		return $(file);
    }
};

// * MARK:Debugs methods

function log(...mess) {
    if (!extensionSettings.enabled || !extensionSettings.debug) return;

    console.log(`[${extensionName}]`, ...mess);
};

function debug(...mess) {
    if (!extensionSettings.enabled || !extensionSettings.debug) return;

    console.debug(`[${extensionName}]`, ...mess);
};

function error(...mess) {
    if (!extensionSettings.enabled || !extensionSettings.debug) return;

    console.error(`[${extensionName}]`, ...mess);
};

// * MARK:Extension methods

/** The function checks for keys from 0 up to a defined safe limit (1,000,000) and returns the first available integer that is not used as a key in the data object.
 * @param {Object} data
 * @returns {number} The lowest non-negative integer that is not a key in the provided data object. If the data object is empty, it returns 0.
 */
function getFreeDataUid(data = {}) {
    const keys = Object.keys(data);

    if (!keys?.length) return 0;

    const used = new Set(keys);
    const LIMIT = 1_000_000;

    for (let uid = 0; uid < LIMIT; uid++)
        if (!used.has(String(uid))) return uid;
}

function escapeNewlines(str) {
    return str
        .replace(/\\/g, "\\\\")
        .replace(/\r\n/g, "\\r\\n")
        .replace(/\n/g, "\\n")
        .replace(/\r/g, "\\r");
}

function unEscapeNewlines(str) {
    return str
        .replace(/\\r\\n/g, "\r\n")
        .replace(/\\n/g, "\n")
        .replace(/\\r/g, "\r");
}

/**
 * Set user clipboard to a stringified version of an object
 * @param {object} obj - Object to be sent to the clipboard as text
 * @returns {Promise<void>}
 */
function exportObjectToClipboard(obj = {}) {
    let stringObj = JSON.stringify(obj);
    stringObj = escapeNewlines(stringObj);

    return copyText(stringObj);
}

/**
 * @param {string?} [value]
 * @param {string?} [search_key]
 * @returns {UserCharacter}
 */
function getUser(value, search_key = 'avatar') {
    const { powerUserSettings: power_user } = context();

    if (!value) value = power_user.default_persona;
    if (!value) return null;

    let avatar = '';
    const correctSearchKey = ['avatar', 'name'].includes(search_key);

    if (!correctSearchKey) return null;

    if (search_key === 'avatar') avatar = value;

    if (search_key === 'name')
        avatar = Object
            .entries(power_user.personas)
            .map(([avatar, name]) => {return {name, avatar}})
            .find(per => per.name === value)
            .avatar;

    if (!avatar || !power_user.personas[avatar]) return null;

    return {
        name: String(power_user.personas[avatar]),
        avatar: String(avatar),
        description: String(power_user.persona_descriptions[avatar].description),
        is_user: true
    };
}

/**
 *
 * @param {string[]?} [discard]
 * @returns {{chars: Character[]; user: UserCharacter}}
 */
function getActiveParticipants(discard = []) {
    const { groupId: group_id, groups, characterId: chid } = context();

    /** @type {Character[]} */
    const chars = [];
    const toDiscard = discard;
    const user = getUser();

    if (group_id) {
        const members = getGroupMembers();
        const group = groups.find(g => g.id == group_id);
        const muted_members = group.disabled_members ?? [];

        toDiscard.push(...muted_members);

        for (const member of members) {
            if (member) chars.push(member);
        }
    }

    if (chid) {
        const character = characters[chid];
        const alreadyInList = chars.some(c => c.avatar === character.avatar);

        if (character && !alreadyInList) chars.push(character);
    }

    const members = {chars, user};
    const discardUnique = new Set(toDiscard).values().toArray();

    members.chars = members.chars.filter(c => !discardUnique.includes(c.avatar));

    return members;
}

/**
 * Creates or populates elements
 * @param {string|HTMLElement} elem
 * @param {{class?:string; attr?:Object; data?:Object; innerHTML?: string}} [options]
 */
function createElement(elem, options = {}) {
    const element = typeof elem === 'string' ? document.createElement(elem) : elem;

    for (const [attr, value] of Object.entries(options.attr ?? {})) {
        element.setAttribute(attr, value);
    }

    for (const [key, value] of Object.entries(options.data ?? {})) {
        element.dataset[key] = value;
    }

    const classes = options.class ?? '';

    element.classList.add(...(classes.split(' ')));
    element.innerHTML = options.innerHTML ?? '';

    // ! Everything complex generated by this function should eventually be turned into a HTML template
    return element;
}

function saveMetadataSTUM() {
    saveChatDebounced.cancel();
    saveChatDebounced();
}

/**
 * @param {Status} status
 * @returns {Status}
 */
function refreshStatusDepth(status) {
    const { chat, characters } = context();
    const { avatar, is_user } = status;

    let character = characters.find(c => c.avatar === avatar);

    const lastID = chat.findLastIndex(m => {
        const { force_avatar, original_avatar, name, is_user: mess_is_user } = m;

        if (is_user !== mess_is_user) return false;

        const url = new URL(force_avatar, window.location.origin);
		const urlFile = url?.searchParams.get('file') ?? '';

        if (avatar === urlFile) return true;
        if (avatar === original_avatar) return true;

        if (!character) return false;

        if (character.name === name) return true;

        return false;
    });

    if (lastID < 0) return status;

    const chatLength = chat.length - 1;

    if (chatLength < 0) return status
        .set('last_mes_id', 0)
        .set('depth', 0);

    status
        .set('last_mes_id', lastID)
        .set('depth', chatLength - lastID);

    return status;
}

/**
 * Renders the status block of the selected character in the last message from the character rendered in the chat log.
 * @param {Status} status
 */
async function renderCharStatus(status) {
    if (status.last_mes_id < 0) return;

    /** @type {string} */
    const character = status.is_user ?
        powerUserSettings.personas[status.avatar] :
        characters.find(char => char.avatar === status.avatar).name;

    if (!character) return;

    $(`#chat .stat-us-maximus-custom-css[char-target="${status.avatar}"]`).remove();

    refreshStatusDepth(status);

    const lastMess = $(`#chat .mes[mesid="${status.last_mes_id}"][is_user="${status.is_user}"]`).last();

    if (!lastMess?.length) return;

    const statusBlock = (await HTML_TEMPLATES.get('chatStatus')).clone();
    const entryBlockTemplate = (await HTML_TEMPLATES.get('chatStatusEntry')).clone();

    statusBlock
        .attr('char-target', status.avatar);

    statusBlock
        .find(`.${htmlSuffix}-chat-title`)
        .text(character);

    statusBlock
        .find('.inline-drawer-icon')
        .toggleClass(`${status.is_collapsed ? 'down' : 'up'}`, true)
        .toggleClass(`${status.is_collapsed ? 'fa-circle-chevron-down' : 'fa-circle-chevron-up'}`, true);

    statusBlock
        .find(`.inline-drawer`)
        .toggleClass(`bg-${status.is_user ? 'user' : 'bot'}`, true);

    statusBlock
        .find('.inline-drawer-header')
        .data({avatar: status.avatar});

    const entries = Object
        .entries(status.entries)
        .sort(([uidA, entryA], [uidB, entryB]) => entryA.display_position - entryB.display_position);

    for (const [uid, entry] of entries) {
        /** @type {StatusEntry} */
        const {key, separator, values, value_uid, enabled} = entry;
        const entryBlock = entryBlockTemplate.clone();

        /** @type {Function} */
        const macro = CUSTOM_MACROS[extensionSettings.editNumbersFromChat ? 'getInputs' : 'getValues'];

        const titleClean = macro(lodash.escape(substituteParams(key)), character);
        const separatorClean = lodash.escape(substituteParams(separator));
        const valueClean = macro(lodash.escape(substituteParams(values[value_uid].value)), character);

        $(entryBlock).find('.status-title').html(`<span class="d-inline">${titleClean}</span>`);
        $(entryBlock).find('.status-separator').html(separatorClean);
        $(entryBlock).find('.status-description').html(`<span class="d-inline">${valueClean}</span>`);

        $(entryBlock)
            .find('.kill-switch')
            .addClass(enabled ? 'fa-toggle-on' : 'fa-toggle-off')
            .data({avatar: status.avatar, uid, enabled});

        $(entryBlock)
            .toggleClass('disabled', !enabled);

        statusBlock
            .find(`.${htmlSuffix}-entries-list`)
            .append(entryBlock);
    }

    lastMess
        .find('.mes_text')
        .before(statusBlock);

    if (!status.is_collapsed) statusBlock.find('.inline-drawer-content').show();
}

function onToggleEntry(e) {
    const entrySwitch = $(e.currentTarget);
    const { avatar, enabled, uid } = entrySwitch.data();
    const nextState = !enabled;

    /** @type {Status} */
    const status = SillyTavern[metadataName].getStatus(avatar);

    if (!status) return;

    /** @type {StatusEntry} */
    const entry = status.entries[uid];

    if (!entry) return;

    entry.set('enabled', nextState);
    entrySwitch
        .data({enabled: nextState})
        .toggleClass('fa-toggle-on', nextState)
        .toggleClass('fa-toggle-off', !nextState)
        .closest('.stat-us-maximus-entry')
        .toggleClass('disabled', !nextState);

    saveMetadataSTUM();
}

function onCollapseStatus(e) {
    const drawerHeader = $(e.currentTarget);
    const { avatar } = drawerHeader.data();

    /** @type {Status} */
    const status = SillyTavern[metadataName].getStatus(avatar);

    if (!status) return;

    const doClose = drawerHeader
        .find('.inline-drawer-icon')
        .hasClass('up');

    status.set('is_collapsed', doClose);
    saveMetadataSTUM();
}

function renderStatus() {
    const statuses = SillyTavern[metadataName].getStatuses();

    for (const status of statuses)
        renderCharStatus(status);
}

/**
 * Init extension
 */
function initExtension() {
    $('#chat').on('click', '.stat-us-maximus-toolbar', function(e){
        e.stopPropagation();
    });

    $('#chat').on('click', '.stat-us-maximus-entry .kill-switch', onToggleEntry);
    $('#chat').on('click', '.stat-us-maximus-chat-drawer .inline-drawer-header', onCollapseStatus);

    SillyTavern[metadataName] = {
        getStatuses: function() {
            let statuses = context().chatMetadata[metadataName];

            if (!statuses) statuses = [];

            statuses = statuses.map(status => status instanceof Status ? status : new Status(status));

            context().chatMetadata[metadataName] = statuses;

            return statuses;
        },

        getStatus: function(avatar) {
            /** @type {Status[]} */
            let statuses = context().chatMetadata[metadataName];

            if (!statuses) return false;

            const status = statuses.find(s => s.avatar === avatar);

            return !status ? false : status;
        },

        renderStatus: renderStatus,

        renderStatusDebounced: lodash.debounce(renderStatus, debounceTimeout.SHORT)
    };
}

// * MARK:Extension Settings

const settingsCallbacks = {
    /**	Triggers on enabled setting change. */
    enabled: () => {
        // Nothing by the moment
    }
}

/** Changes a setting value and triggers a callback if there's any on settingsCallbacks. */
function settingsBooleanButton(event) {
    const target = event.target;
    const value = Boolean($(target).prop('checked'));
    const setting = target.getAttribute(`${htmlSuffix}-setting`);
    const callback = settingsCallbacks[setting];

    extensionSettings[setting] = value;

    if (callback) callback();

    log('toggleSetting ' + setting, value);
    saveSettingsDebounced();
}

/** Changes a string setting value and triggers a callback if there's any on settingsCallbacks. */
function settingsTextButton(event) {
    const target = event.target;
    const value = String($(target).val());

    const setting = target.getAttribute(`${htmlSuffix}-setting`);
    const callback = settingsCallbacks[setting];

    extensionSettings[setting] = value;

    if (callback) callback();

    log('toggleSetting ' + setting, value);
    saveSettingsDebounced();
}

/** Changes a number setting value and triggers a callback if there's any on settingsCallbacks. */
function settingsNumberButton(event) {
    const target = /** @type {HTMLInputElement} */ (event.target);
    const raw_value = isNaN(target.valueAsNumber) ? 0 : target.valueAsNumber;
    const insideMinBoundary = (target.min !== '') ? (Number(target.min) <= raw_value) : true;
    const insideMaxBoundary = (target.max !== '') ? (Number(target.max) >= raw_value) : true;

    let value = raw_value;

    if (!insideMinBoundary) value = Number(target.min);
    if (!insideMaxBoundary) value = Number(target.max);

    const setting = target.getAttribute(`${htmlSuffix}-setting`);
    const callback = settingsCallbacks[setting];

    extensionSettings[setting] = value;

    if (callback) callback();

    log('toggleSetting ' + setting, value);
    saveSettingsDebounced();
}

/**	Logs setting's values. */
function displaySettings() {
    debug(`Auto detect participants is ${extensionSettings.autoDetectParticipants ? 'active' : 'not active'}`);
    debug(`Always include unmuted group members is ${extensionSettings.alwaysIncludeUnmutedMembers ? 'active' : 'not active'}`);
    debug(`Auto save metadata is ${extensionSettings.autoSaveMetadata ? 'active' : 'not active'}`);
    debug(`Alternative behavior for macro template buttons is ${extensionSettings.altMacroTemplateBehavior ? 'active' : 'not active'}`);
    debug(`Show input macros in chat is ${extensionSettings.editNumbersFromChat ? 'active' : 'not active'}`);
    debug(`Hide input labels is ${extensionSettings.hideInputLabels ? 'active' : 'not active'}`);
    debug(`Show whitespaces is ${extensionSettings.showWhiteSpaces ? 'active' : 'not active'}`);
    debug(`Range input width is set to ${String(extensionSettings.rangeInputWidth)}`);
    debug(`Min prompt depth is set to ${String(extensionSettings.minPromptDepth)}`);

    debug(`Debug mode is ${extensionSettings.debug ? 'active' : 'not active'}`);
    debug(structuredClone(extensionSettings));
}

/** Append settings menu on ST and set listeners. */
async function loadSettingsMenu() {
    const settingsHtml = await HTML_TEMPLATES.get('settings');

    $('#extensions_settings2').append(settingsHtml);

    $(`#${htmlSuffix}-auto-detect-participants`).on('input', settingsBooleanButton);
    $(`#${htmlSuffix}-always-include-unmuted-members`).on('input', settingsBooleanButton);
    $(`#${htmlSuffix}-auto-save-metadata`).on('input', settingsBooleanButton);
    $(`#${htmlSuffix}-alt-macro-template-behavior`).on('input', settingsBooleanButton);
    $(`#${htmlSuffix}-show-input-macros`).on('input', settingsBooleanButton);
    $(`#${htmlSuffix}-hide-input-labels`).on('input', settingsBooleanButton);
    $(`#${htmlSuffix}-show-white-spaces`).on('input', settingsBooleanButton);
    $(`#${htmlSuffix}-range-input-width`).on('input', settingsTextButton);
    $(`#${htmlSuffix}-min-prompt-depth`).on('input', settingsNumberButton);

    $(`#${htmlSuffix}-debug`).on('input', settingsBooleanButton);
    $(`#${htmlSuffix}-check-configuration`).on('click', displaySettings);

    log('Settings menu created');

    $(`#${htmlSuffix}-auto-detect-participants`).prop('checked', extensionSettings.autoDetectParticipants);
    $(`#${htmlSuffix}-always-include-unmuted-members`).prop('checked', extensionSettings.alwaysIncludeUnmutedMembers);
    $(`#${htmlSuffix}-auto-save-metadata`).prop('checked', extensionSettings.autoSaveMetadata);
    $(`#${htmlSuffix}-alt-macro-template-behavior`).prop('checked', extensionSettings.altMacroTemplateBehavior);
    $(`#${htmlSuffix}-show-input-macros`).prop('checked', extensionSettings.editNumbersFromChat);
    $(`#${htmlSuffix}-show-white-spaces`).prop('checked', extensionSettings.showWhiteSpaces);
    $(`#${htmlSuffix}-hide-input-labels`).prop('checked', extensionSettings.hideInputLabels).trigger('input');
    $(`#${htmlSuffix}-range-input-width`).val(extensionSettings.rangeInputWidth).trigger('input');
    $(`#${htmlSuffix}-min-prompt-depth`).val(extensionSettings.minPromptDepth);

    $(`#${htmlSuffix}-debug`).prop('checked', extensionSettings.debug).trigger('input');

    log('Settings values initialized', extensionSettings);
}

// * Initialize Extension

$(async function() {

    if (!context().extensionSettings[extensionFullName]) {
        context().extensionSettings[extensionFullName] = structuredClone(defaultSettings);
    }

    for (const key of Object.keys(defaultSettings)) {
        if (context().extensionSettings[extensionFullName][key] === undefined) {
            context().extensionSettings[extensionFullName][key] = defaultSettings[key];
        }
    }

    await loadSettingsMenu();
    initExtension();
    registerEvents();
});