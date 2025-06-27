import {extension_settings, saveMetadataDebounced} from "../../../extensions.js";
import {saveSettingsDebounced, event_types, eventSource, chat_metadata, this_chid, chat, characters, extension_prompts, setExtensionPrompt, extension_prompt_types, user_avatar} from "../../../../script.js";
import { getGroupMembers, selected_group } from "../../../group-chats.js";
import { t } from "../../../i18n.js";
import { createCharStatus, getCharStatus } from "./source/js/statusControls.js";
import { power_user } from "../../../power-user.js";
import { registerSlashCommands } from "./source/js/slashCommands.js";
import { popupStatusMultiChar, popupStatusSingleChar } from "./source/js/popups.js";

// * Extension variables

/*  # TODO
    - [ ] Setting to disable confirm delete
    - [ ] Setting for deff role
*/

const extensionName = "SillyTavern-Stat-us-Maximus";
const extensionFolderPath = `scripts/extensions/third-party/${extensionName}`;
const defaultSettings = {
    enabled: true,
    debug: false
};

export const extensionSettings = extension_settings[extensionName];

// * Debugs methods

export const log = (...msg) => {
    if (!extensionSettings.enabled || !extensionSettings.debug) return;
    console.log("[" + extensionName + "]", ...msg);
};

SillyTavern.StatusTest = async () => {
    log(this_chid, characters[this_chid]);
    log(selected_group);
}

// * Extension methods

/** Destroys an element and all data associated with it
    @param {string|HTMLElement|Node|JQuery<any>|HTMLElement[]|NodeList} element
*/
export function destroyElement(element) {
    const elem = $(element);

    elem.find('*').each(function() {
        const child = $(this);

        // Destroy even listeners
        child.off();

        // Clean any ghost data
        $.cleanData([child[0]]);

        // Destroy elements
        child.remove();

        // @ts-ignore
        if (child?.sortable('instance') !== undefined) child?.sortable('destroy');
    });

    const leftoversCount = elem.children().length;

    if (leftoversCount) {
        elem.empty();
    }

	elem.remove();
}

function getCharacter(value, search_key = "avatar") {
    return characters.find(c => c[search_key] === value) ?? false;
}

function getUser(avatar = user_avatar) {
    if (!power_user.personas[avatar]) return false;

    return {
        name: power_user.personas[avatar],
        avatar: avatar,
        description: power_user.persona_descriptions[avatar].description,
        is_user: true
    };
}

function getStatusDepth(chat, character, {search_key_a = "name", search_key_b = search_key_a} = {}) {
    const lastIndex = chat.findLastIndex((mes) => mes[search_key_a] === character[search_key_b]);

    if (lastIndex < 0) return lastIndex;
    return chat.length - lastIndex - 1;
}

function getParticipant(avatar, is_user) {
    if (is_user) return getUser(avatar);
    else return getCharacter(avatar);
}

function getActiveParticipants(discard = []) {
    const user = getUser();
    const chars = [];

    if (selected_group) {
        const members = getGroupMembers();

        for (const member of members) {
            if (discard.some(c => c.avatar === member.avatar)) continue;
            else chars.push(member);
        }
    }
    else if (this_chid !== undefined) {
        const character = characters[this_chid];

        if (character && !discard.some(c => c.avatar === character.avatar))
            chars.push(character);
    }

    if (user && !discard.some(c => c.avatar === user.avatar))
        chars.push(user);

    return chars;
}

function getAllParticipantsInChat(chat) {
    const chars = getActiveParticipants();

    for (const mess of chat) {
        let char

        if (mess.is_user) {
            const userAvatar = mess.force_avatar.replace(/user avatars\//i, "");
            char = getUser(userAvatar);
        }

        else if (this_chid !== undefined)
            char = characters[this_chid];

        else if (selected_group && mess?.original_avatar !== undefined)
            char = getCharacter(mess.original_avatar);

        else if (selected_group && mess?.force_avatar !== undefined) {
            const charAvatar = mess.force_avatar.replace(/\/thumbnail\?type=avatar&file=/i, "");
            char = getCharacter(charAvatar);
        }

        else if (mess?.name !== undefined)
            char = getCharacter(mess.name, "name");

        if (!char || chars.some(c => c.avatar === char.avatar)) continue;

        chars.push(char);
    }

    return chars;
}

function addTracker(status, mesID, character) {
    status.last_mes_id = mesID - status.depth;
    log("---UPDATE TRACKER---", character.name);
}

function fetchStatus({forceUIUpdate = false, depthModifier = 0, newMessID = (chat.length - 1)} = {}) {
    if (!chat_metadata.stat_us_maximus) chat_metadata.stat_us_maximus = [];

    const startID = $('.mes.lastInContext').first().attr('mesid') ?? 0;
    const realChat = chat.slice(Number(startID));
    const metadata = chat_metadata.stat_us_maximus;
    const chars = metadata.map(status => getParticipant(status.avatar, status.is_user));

    if (!metadata?.length) chars.push(...getAllParticipantsInChat(realChat));
    else chars.push(...getActiveParticipants(chars));

    const statuses = chars.map(character => getCharStatus(character));

    for (const key of Object.keys(extension_prompts))
        if (key.includes(extensionName.toLowerCase())) delete extension_prompts[key];

    for (let i = 0; i < statuses.length; i++) {
        const character = chars[i];

        if (!character) continue;

        const char_depth = getStatusDepth(realChat, character) + depthModifier;

        if (!statuses[i])
            statuses[i] = createCharStatus(character, char_depth);
        else
            statuses[i].depth = char_depth;

        // If chat is empty or character is not even in the context
        if (char_depth < 0) continue;
        if (!realChat.length || !realChat.some((mes) => mes.name === character.name)) continue;

        const status = statuses[i];

        if (forceUIUpdate || (status.last_mes_id + char_depth) !== newMessID)
            addTracker(statuses[i], newMessID, character);

        const promptKey = extensionName.toLowerCase() + "-" + char_depth;
        let promptValue = "" + character.name;

        for (const entry of status.entries) {
            if (!entry.enabled) continue;
            if (!promptValue) promptValue += status.separator;

            promptValue += entry.key;
            promptValue += entry.separator;
            promptValue += entry.value;
        };

        promptValue = promptValue.replaceAll("{{char}}", character.name);

        setExtensionPrompt(
            promptKey,
            promptValue,
            extension_prompt_types.IN_CHAT,
            char_depth,
            true,
            status.role
        );
    }

    saveMetadataDebounced();
}

// ? event_types.GROUP_UPDATED doesn't matter, status will update when that character sends a message
/*
    # TODO
    - Change of heart, maybe use GROUP_UPDATED for:
        - [X] Check if the group member exists in metadata
        - [X] If it doesn't - add it
    - [ ] Display a table with statuses in the last message of each participant
*/

function groupListAvatarsClick(e) {
    const img = e.target;
    const char_avatar = img?.title;

    // @ts-ignore
    if (!char_avatar) return toastr.warning(t`Avatar could not be recognized`);

    const char = getCharacter(char_avatar);

    // @ts-ignore
    if (!char) return toastr.warning(t`The character could be found`);

    popupStatusSingleChar(char);
}

function addGroupStatusButtons(params) {
    const groupList = document.getElementById("currentGroupMembers");
    const avatars = groupList.querySelectorAll('.avatar');

    for (const avatar of avatars) {
        avatar.removeEventListener("click", groupListAvatarsClick);
        avatar.addEventListener("click", groupListAvatarsClick);
    }
}

eventSource.on(event_types.GROUP_UPDATED, async (...args) => {
    log("GROUP_UPDATED", args);

    for (const char of getActiveParticipants()) {
        if (!getCharStatus(char)) createCharStatus(char, getStatusDepth(chat, char));
    }

    saveMetadataDebounced();
    addGroupStatusButtons();
});

eventSource.on(event_types.CHAT_CHANGED, async (...args) => {
    log("CHAT_CHANGED", args);

    if (!args[0]) return;
    if (selected_group) addGroupStatusButtons();

    fetchStatus({forceUIUpdate: true});
});

eventSource.on(event_types.CHARACTER_MESSAGE_RENDERED, async (...args) => {
    log("CHARACTER_MESSAGE_RENDERED", args);
    fetchStatus({newMessID: args[0]});
});

eventSource.on(event_types.USER_MESSAGE_RENDERED, async (...args) => {
    log("USER_MESSAGE_RENDERED", args);
    fetchStatus({newMessID: args[0]});
});

eventSource.on(event_types.GENERATION_AFTER_COMMANDS, async (...args) => {
    log("GENERATION_AFTER_COMMANDS", args);
    fetchStatus({newMessID: chat.length, depthModifier: 1});
});

eventSource.on(event_types.MORE_MESSAGES_LOADED, async (...args) => {
    log("MORE_MESSAGES_LOADED", args);
    fetchStatus({forceUIUpdate: true});
});

eventSource.on(event_types.MESSAGE_DELETED, async (...args) => {
    log("MESSAGE_DELETED", args);

    const id = (args[0] ?? chat.length) - 1;

    fetchStatus({newMessID: id});
});

// * Methods in charge of controlling the extension settings

const settingsCallbacks = {
    /**	Triggers on enabled setting change. */
    enabled: () => {
        // Nothing by the moment
    }
}

/** Changes a setting value and triggers a callback if there's any on settingsCallbacks. */
function settingsBooleanButton(event) {
    const target = event.target;
    const value = Boolean($(target).prop("checked"));
    const setting = target.getAttribute("stat-us-max-setting");
    const callback = settingsCallbacks[setting];

    extensionSettings[setting] = value;

    if (callback) callback();

    log("toggleSetting " + setting, value);
    saveSettingsDebounced();
}

/**	Logs setting's values. */
function displaySettings() {
    console.debug("[" + extensionName + "]", `The extension is ${extensionSettings.enabled ? "active" : "not active"}`);
    console.debug("[" + extensionName + "]", `Debug mode is ${extensionSettings.debug ? "active" : "not active"}`);
    console.debug("[" + extensionName + "]", structuredClone(extensionSettings));
}

/** Append settings menu on ST and set listeners. */
async function loadHTMLSettings() {
    const settingsHtml = await $.get(`${extensionFolderPath}/settings.html`);

    $("#extensions_settings2").append(settingsHtml);

    // Event Listeners for the extension HTML
    $("#stat-us-max-activate-extension").on("input", settingsBooleanButton);
    $("#stat-us-max-activate-debug").on("input", settingsBooleanButton);
    $("#stat-us-max-check-configuration").on("click", displaySettings);

    log("loadHTMLSettings");
}

/** Init setting values on the menu */
function setSettings() {
    $("#stat-us-max-activate-extension").prop("checked", extensionSettings.enabled).trigger("input");
    $("#stat-us-max-activate-debug").prop("checked", extensionSettings.debug).trigger("input");
}

// * Initialize Extension

function initButtons() {
    /** Magic wand menu */
    const globalStatusButtonSpan = document.createElement("span");
    globalStatusButtonSpan.textContent = t`Open Stat-us Menu`;
    globalStatusButtonSpan.dataset.i18n = "Open Stat-us Menu";

    const globalStatusButtonIcon = document.createElement("div");
    globalStatusButtonIcon.classList.add("fa-fw", "fa-solid", "fa-table", "extensionsMenuExtensionButton");

    const globalStatusButton = document.createElement("div");
    globalStatusButton.id = "stat-us-max-manage-chars";
    globalStatusButton.classList.add("list-group-item", "flex-container", "flexGap5", "interactable");
    globalStatusButton.title = t`Manage the status of all characters`;
    globalStatusButton.append(globalStatusButtonIcon, globalStatusButtonSpan);

    const globalStatusMenu = document.createElement("div");
    globalStatusMenu.id = extensionName.toLowerCase().replace("-", "_") + "_wand_container";
    globalStatusMenu.classList.add("extension_container", "interactable");
    globalStatusMenu.append(globalStatusButton);
    globalStatusMenu.addEventListener("click", async () => {
        const metadata = chat_metadata.stat_us_maximus;

        // @ts-ignore
        if (!metadata || !metadata.length) return toastr.warning(t`There's no metadata to edit, open a chat or refresh the current one`);

        log("group")
        const chars = [];

        for (const status of metadata) {
            const char = getParticipant(status.avatar, status.is_user);

            if (char) chars.push(char);
        }

        // @ts-ignore
        if (!chars.length) return toastr.warning(t`No character could be found in the metadata`);

        return await popupStatusMultiChar(chars);
    });

    const extensionsMenu = document.getElementById("extensionsMenu");
    extensionsMenu.append(globalStatusMenu);

    /** Single Character menu */
    const charStatusSpan = document.createElement("span");
    charStatusSpan.textContent = "Character's Status";
    charStatusSpan.dataset.i18n = "Character's Status";
    charStatusSpan.classList.add("flex-grow-1");

    const charStatusOpenPopupBtn = document.createElement("div");
    charStatusOpenPopupBtn.classList.add("menu_button", "menu_button_icon", "fa-solid", "fa-table", "interactable", "m-0");
    charStatusOpenPopupBtn.addEventListener("click", async () => {
        const metadata = chat_metadata.stat_us_maximus;

        // @ts-ignore
        if (!metadata || !metadata.length) return toastr.warning(t`There's no metadata to edit, open a chat or refresh the current one`);

        if (this_chid !== undefined) {
            log("char")
            const char = characters[this_chid];

            // @ts-ignore
            if (!char) return toastr.warning(t`The character could be found`);

            return await popupStatusSingleChar(char);
        }

        // @ts-ignore
        toastr.warning(t`An active character to edit could not be found`);
    });

    const charStatusMenu = document.createElement("div");
    charStatusMenu.classList.add("d-flex", "flex-center-start", "gap-5px");
    charStatusMenu.append(charStatusSpan, charStatusOpenPopupBtn);

    const charStatusContainer = document.createElement("div");
    charStatusContainer.classList.add("stat-us-max-custom-css");
    charStatusContainer.append(charStatusMenu);

    const hr = document.createElement("hr");
    const creatorNotesBlock = document.getElementById("spoiler_free_desc");
    creatorNotesBlock.before(charStatusContainer, hr);
}

(async function initExtension() {

    if (!SillyTavern.getContext().extensionSettings[extensionName]) {
        SillyTavern.getContext().extensionSettings[extensionName] = structuredClone(defaultSettings);
    }

    for (const key of Object.keys(defaultSettings)) {
        if (SillyTavern.getContext().extensionSettings[extensionName][key] === undefined) {
            SillyTavern.getContext().extensionSettings[extensionName][key] = defaultSettings[key];
        }
    }

    await loadHTMLSettings();
    setSettings();
    registerSlashCommands();
    initButtons();
})();
