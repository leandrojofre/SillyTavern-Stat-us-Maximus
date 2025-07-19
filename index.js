import { extension_settings, saveMetadataDebounced } from "../../../extensions.js";
import { saveSettingsDebounced, chat_metadata, this_chid, chat, characters, extension_prompts, setExtensionPrompt, extension_prompt_types, user_avatar, substituteParams } from "../../../../script.js";
import { getGroupMembers, selected_group } from "../../../group-chats.js";
import { t } from "../../../i18n.js";
import { createCharStatus, getCharAltValue, getCharStatus, updateCharEntry } from "./source/js/statusControls.js";
import { power_user } from "../../../power-user.js";
import { registerSlashCommands } from "./source/js/slashCommands.js";
import { popupStatusMultiChar, popupStatusSingleChar } from "./source/js/popups.js";
import { startListeners } from "./source/js/eventListeners.js";
import { lodash, Popper } from "../../../../lib.js";

// * Extension variables

/*  # TODO
    - [ ] Setting to disable confirm delete
    - [ ] Setting for deff role
    - [X] Setting to disable auto detection
    - [X] Replace select button for an icon button
    - [X] Highlight row on hover
    - [X] Hide description on disable
    - [X] Reduce font-size
    - [ ] Button on right nav panel to open user metadata - one for active and another for all
    - [X] Use alt title if description is empty
    - [ ] Global Stat not attached to character
    - [X] Fix chat UI select button using a similar approach to character export button - thanks Ross

    - [ ] Before I loose the idea - Update chat UI on input input, this would allow sick tricks like modifying a variable value from an input inside the set var macro - That would require
        - [ ] Parsing ST variables on input (and parsing mine's first)
        - [ ] Figure out how to update the UI without loosing focus of the input (maybe when the input looses focus?)

    I need to refine this roadmap
    - [ ] Create a template builder ? from the settings
        - [ ] Store it in ? extension settings as an array
        - [ ] Allow to bind templates to both characters and groups (group overrides character)
        - [ ] ? Merge group and character templates
        - [ ] ? Allow to assign multiple templates

    ! THE PLAN

    I have a fucking big brain; how to rework the code to implement "Setting to disable auto detection"?
    Easy, don't rework it! I can just:

    1. [X] Add a slash command to initialize Status metadata - the existing ones already throw an error if char is not in metadata
    2. [X] Make the UI buttons to open individual popups create Status data when interacted with
    3. [X] Stonks!
*/

const extensionName = "SillyTavern-Stat-us-Maximus";
const extensionFolderPath = `scripts/extensions/third-party/${extensionName}`;
const defaultSettings = {
    editNumbersFromChat: false,
    autoDetectParticipants: true,
    hideInputLabels: false,
    debug: false
};

const regexTextInput = /({{text)(::[^}\n]*)?(}})/g;
const regexNumberInput = /({{number)(::[\d]+(\.[\d]+)?)?(}})/g;
const regexBooleanInput = /({{boolean)(::((false)|(true))::[^}\n]+::[^}\n]+)?(}})/g;
const regexRangeInput = /({{range::)([\d]+(\.[\d]+)?)(::[\d]+(\.[\d]+)?){3}(}})/g;

export const extensionSettings = extension_settings[extensionName];

// * Debugs methods

export const log = (...msg) => {
    if (!extensionSettings.enabled || !extensionSettings.debug) return;
    console.log("[" + extensionName + "]", ...msg);
};

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

        // Clean jQuery custom library elements
        // @ts-ignore
        if (child?.sortable('instance') !== undefined) child?.sortable('destroy');
        if (child?.data('select2')) child.select2('destroy');

        // Clean any ghost data
        $.cleanData([child[0]]);

        // Destroy elements
        child.remove();
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

function getUser(value = user_avatar, search_key = "avatar") {
    if (!value) return false;

    let avatar = "";

    if (search_key === "avatar") avatar = value;
    else if (search_key === "name")
        avatar = Object
            .entries(power_user.personas)
            .map(([key, value]) => {return {name: value, avatar: key}})
            .find(per => per.name === value)
            ?.avatar ?? "";
    else return false;

    if (!avatar || !power_user.personas[avatar]) return false;

    return {
        name: power_user.personas[avatar],
        avatar: avatar,
        description: power_user.persona_descriptions[avatar].description,
        is_user: true
    };
}

export function getStatusDepth(chat, character) {
    const lastIndex = chat.findLastIndex((mess) =>{
        if (mess.is_user)
            return mess.force_avatar.replace(/(user avatars\/)|(\/thumbnail\?type=persona&file=)/i, "") === character.avatar;

        if (mess?.original_avatar !== undefined)
            return mess.original_avatar === character.avatar;

        if (mess?.force_avatar !== undefined)
            return mess.force_avatar.replace(/\/thumbnail\?type=avatar&file=/i, "") === character.avatar;

        return mess.name === character.name;
    });

    if (lastIndex < 0) return lastIndex;
    return chat.length - lastIndex - 1;
}

export function getParticipant(avatar, is_user, {field = "avatar"} = {}) {
    if (is_user) return getUser(avatar, field);
    else return getCharacter(avatar, field);
}

export function getActiveParticipants(discard = []) {
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
            const userAvatar = mess.force_avatar.replace(/(user avatars\/)|(\/thumbnail\?type=persona&file=)/i, "");
            char = getUser(userAvatar);
        }

        else if (mess?.original_avatar !== undefined)
            char = getCharacter(mess.original_avatar);

        else if (mess?.force_avatar !== undefined) {
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

function replaceSkip(str, search, replaceWith, targetIndex) {
    let count = -1;

    return str.replaceAll(search, match => {
        count++;
        log (search, match, count, targetIndex, count === targetIndex);
        return count === targetIndex ? replaceWith : match;
    });
}

/** On click
    @type {object[]}
*/
export let callbacksClickValueUID = [];

const onCallbacksClick = (e) => {
    const clickTarget = e.target;

    for (const obj of callbacksClickValueUID) obj.callback(clickTarget);
};

document.getElementById("sheld").addEventListener('pointerdown', onCallbacksClick);

function showPopper(popperInstance, tooltip) {
    tooltip.setAttribute('data-show', '');

    popperInstance.setOptions((options) => ({
        ...options,
        modifiers: [
            ...options.modifiers
        ]
    }));

    popperInstance.update();
}

function hidePopper(popperInstance, tooltip) {
    tooltip.removeAttribute('data-show');

    popperInstance.setOptions((options) => ({
        ...options,
        modifiers: [
            ...options.modifiers
        ]
    }));
}

function addTracker(status, mesID, character) {
    const $chat = document.getElementById("chat");
    const entriesText = status.entries.reduce((acu, entry) => acu + entry.key + entry.value, "");

    callbacksClickValueUID = callbacksClickValueUID.filter(obj => {
        const result = obj.target !== character.avatar;

        if (!result) obj.popper?.destroy();

        return result;
    });

    destroyElement(`.mes .stat-us-max-custom-css[avatar-target="${character.avatar}"]`);
    destroyElement(`.status-value-uid-options.list-group[avatar-target="${character.avatar}"]`);

    if (!entriesText || status.depth < 0) return;

    status.last_mes_id = mesID - status.depth;

    /** Create Status form template */
    const statusRow = document.createElement("tr");
    statusRow.innerHTML = `
        <td>
            <form>
                <input type="hidden" name="enabled">
                <input type="hidden" name="key">
                <input type="hidden" name="alt_key">
                <input type="hidden" name="value">
                <input type="hidden" name="value_uid">
            </form>
            <div class="d-flex flex-center-between gap-15px fs-90p text-muted hover-highlight">
                <div class="fa-solid fa-toggle-on kill-switch" title="Toggle entry's active state." data-i18n="Toggle entry's active state."></div>
                <p class="text-left flex-grow-1 m-0 d-table">
                    <span class="status-title fw-bolder d-contents"></span>
                    <span class="status-separator"></span>
                    <span class="status-description d-contents"></span>
                </p>
                <button class="status-value-uid menu_button menu_button_icon fa-solid fa-list-1-2 m-0" aria-describedby="tooltip"></button>
            </div>
        </td>
    `;

    /** Create table */
    const statusTableBody = document.createElement("tbody");
    const statusTableHead = document.createElement("thead");
    statusTableHead.innerHTML = `
        <tr>
            <th scope="col">
                <div class="d-flex w-100 flex-center-between p-10px">
                    <span>Status - ${character.name}</span>
                    <div class="d-flex flex-center">
                        <div class="menu_button menu_button_icon fa-solid fa-eye interactable m-0"></div>
                        <div class="menu_button menu_button_icon fa-solid fa-pen interactable m-0"></div>
                    </div>
                </div>
            </th>
        </tr>
    `;

    const statusTable = document.createElement("table");
    statusTable.append(statusTableHead, statusTableBody);

    const statusTableContainer = document.createElement("div");
    statusTableContainer.classList.add("stat-us-max-custom-css", "table-container");
    statusTableContainer.setAttribute("avatar-target", character.avatar);
    statusTableContainer.append(statusTable);

    /** Event listeners */
    const inputEvent = new Event("input", { bubbles: true, cancelable: true });
    const DEBOUNCE_MS = 400;
    let formDebounceTimer;

    const el = (target, class_name) => target.querySelector(class_name);

    /** @param {HTMLElement} el */
    const toggleSwitch = (el, callback = (param) => {}) => {
        // True if the final state is on
        const state = !el.classList.contains("fa-toggle-on");
        el.classList.toggle("fa-toggle-off", !state);
        el.classList.toggle("fa-toggle-on", state);
        callback(state);
    };

    /** @param {HTMLElement} el */
    const toggleVisibility = (el, state) => {
        el.classList.toggle("d-none", state);
    };

    statusTable.querySelector(".menu_button.fa-pen").addEventListener("click", async () => {
        const metadata = chat_metadata.stat_us_maximus;

        // @ts-ignore
        if (!metadata || !metadata.length) return toastr.warning(t`There's no metadata to edit, open a chat or refresh the current one`);

        return await popupStatusSingleChar(character);
    });

    statusTable.querySelector(".menu_button.fa-eye").addEventListener("click", async () => {
        const collapse = !statusTableBody.classList.contains("d-none");
        status.is_collapsed = collapse;

        toggleVisibility(statusTableBody, collapse);
        saveMetadataDebounced();
    });

    const createInputs = (/**@type {String}*/text) => {
        const escapedText = lodash.escape(text);
        const parsedText = lodash.escape(substituteParams(processMacros(text, {char: character, processInputs: false}))).replaceAll(/\n/g, "<br>");

        if (!extensionSettings.editNumbersFromChat)
            return `
                <span class="d-none original-text">${escapedText}</span>
                <span class="text-line">${parsedText}</span>
            `;

        let newText = `<span class="text-line">${parsedText}</span>`;

        newText = newText.replaceAll(regexTextInput, (match) => {
            const value = match.replaceAll(/(({{text(::)?)|(}}))/g, "");
            const input = `<input type="text" value="${value}" class="text_pole m-0 chat-input-editor">`;

            return input;
        });

        newText = newText.replaceAll(regexNumberInput, (match) => {
            const value = match.replaceAll(/(({{number(::)?)|(}}))/g, "");
            const input = `<input type="number" value="${value === "" ? "0" : value}" class="text_pole m-0 chat-input-editor">`;

            return input;
        });

        newText = newText.replaceAll(regexBooleanInput, (match) => {
            const props = match.replaceAll(/(({{boolean(::)?)|(}}))/g, "").split("::");
            const checked = props[0] ?? "true";
            const trueValue = props[1] ?? "true";
            const falseValue = props[2] ?? "false";
            const input = `
                <input type="checkbox" ${checked === "true" ? "checked" : ""} data-true="${trueValue}" data-false="${falseValue}" class="m-0 chat-input-editor">
                <span class="ignore"> ${checked === "true" ? trueValue : falseValue}</span>
            `;

            return input;
        });

        newText = newText.replaceAll(regexRangeInput, (match) => {
            const props = match.replaceAll(/(({{range::)|(}}))/g, "").split("::");
            const min = props[0];
            const max = props[1];
            const step = props[2];
            const value = props[3];
            const input = `
                <span class="d-flex flex-col flex-center gap-0 chat-input-editor ignore">
                    <input type="range" min="${min}" max="${max}" step="${step}" value="${value}" class="neo-range-slider">
                    <input type="number" min="${min}" max="${max}" step="${step}" value="${value}" class="neo-range-input">
                </span>
            `;

            return input;
        });

        return `<span class="d-none original-text">${escapedText}</span>${newText}`;
    }

    const createInputStrings = (parent, target) => {
        /**@type {HTMLElement}*/const targetEl = el(parent, target);
        /**@type {NodeListOf<HTMLElement>}*/const chunks = targetEl.querySelectorAll('.chat-input-editor');
        let newValue = targetEl.querySelector('.d-none.original-text').textContent;

        let countRange = -1;
        let countText = -1;
        let countNumber = -1;
        let countBoolean = -1;

        for (const chunk of chunks) {
            let match;
            let index;
            let newMacro = "";

            if (chunk instanceof HTMLSpanElement) {
                /**@type {HTMLInputElement}*/const inputNumber = chunk.querySelector('input[type="number"]');
                const min = inputNumber.min;
                const max = inputNumber.max;
                const step = inputNumber.step;
                const value = inputNumber.value;
                index = ++countRange;
                match = regexRangeInput;
                newMacro = `{{range::${min}::${max}::${step}::${value}}}`;
            }

            if (chunk instanceof HTMLInputElement) {
                if (chunk.type === "text") {
                    const value = chunk.value;
                    index = ++countText;
                    match = regexTextInput;
                    newMacro = `{{text${value.length > 0 ? "::" : ""}${value}}}`;
                }

                if (chunk.type === "number") {
                    const value = chunk.value;
                    index = ++countNumber;
                    match = regexNumberInput;
                    newMacro = `{{number${value.length > 0 ? "::" : ""}${value}}}`;
                }

                if (chunk.type === "checkbox") {
                    const value = chunk.checked;
                    const trueValue = chunk.dataset.true;
                    const falseValue = chunk.dataset.false;
                    index = ++countBoolean;
                    match = regexBooleanInput;
                    newMacro = `{{boolean::${value}::${trueValue}::${falseValue}}}`;
                }
            }

            if (!newMacro || !match || index < 0) continue;

            newValue = replaceSkip(newValue, match, newMacro, index);
        }

        return newValue;
    }

    /** Add table rows */
    for (const entry of status.entries) {
        if (entry.key + entry.value === "") continue;

        // Vars
        const newRow = /** @type {HTMLFormElement} */ (statusRow.cloneNode(true));
        const form = newRow.querySelector("form");
        form.id = `stat-us-max-table-form-${entry.uid}`;
        form.dataset.uid = entry.uid;
        form.removeAttribute('action');

        const killSwitch = el(newRow, ".kill-switch");

        let descriptionValue = entry.value;
        let descriptionTarget = "value";

        if (descriptionValue === "") {
            descriptionValue = entry.alt_values.find(alt => alt.uid === entry.value_uid).key;
            descriptionTarget = "alt_key";
        }

        // Set Values
        el(form, 'input[name="enabled"]').value = entry.enabled;
        el(form, 'input[name="key"]').value = entry.key;
        el(form, 'input[name="alt_key"]').value = entry.alt_values.find(alt => alt.uid === entry.value_uid).key;
        el(form, 'input[name="value"]').value = entry.value;
        el(form, 'input[name="value_uid"]').value = entry.value_uid;

        el(newRow, '.status-separator').innerHTML = lodash.escape(entry.separator).replaceAll(/\n/g, "<br>");

        const updateDescription = (text, el_target, form_target) => {
            destroyElement(el(newRow, el_target).children);

            el(newRow, el_target).innerHTML = createInputs(text);

            if (!extensionSettings.editNumbersFromChat) return;

            el(newRow, el_target)
            .querySelectorAll('input[type="text"]')
            .forEach((/**@type {HTMLInputElement}*/input) => {
                input.onkeydown = (event) => {
                    if (/[{}\n]/.test(event.key)) event.preventDefault();
                }
            });

            el(newRow, el_target)
            .querySelectorAll('input.chat-input-editor')
            .forEach((/**@type {HTMLInputElement}*/input) => {
                if (input.type === "checkbox") {
                    input.nextElementSibling.textContent = " " + (input.checked ? input.dataset.true : input.dataset.false);
                };

                input.addEventListener("input", () => {
                    if (input.type === "checkbox") {
                        input.nextElementSibling.textContent = " " + (input.checked ? input.dataset.true : input.dataset.false);
                    };

                    el(form, `input[name="${form_target}"]`).value = createInputStrings(newRow, el_target);
                    form.dispatchEvent(inputEvent);
                });
            });

            el(newRow, el_target)
            .querySelectorAll('span.chat-input-editor')
            .forEach((/**@type {HTMLSpanElement}*/span) => {
                /**@type {HTMLInputElement}*/const inputNumber = span.querySelector('input[type="number"]');
                /**@type {HTMLInputElement}*/const inputRange = span.querySelector('input[type="range"]');

                span.addEventListener("input", (e) => {
                    /**@type {HTMLInputElement}*/
                    // @ts-ignore
                    const original = e.target;
                    inputNumber.value = original.value;
                    inputRange.value = original.value;

                    el(form, `input[name="${form_target}"]`).value = createInputStrings(newRow, el_target);
                    form.dispatchEvent(inputEvent);
                });
            });
        }

        updateDescription(entry.key, '.status-title', 'key');
        updateDescription(descriptionValue, '.status-description', descriptionTarget);

        // Add listeners
        form.addEventListener("submit", (e) => {
            e.preventDefault();

            const formData = new FormData(form);

            updateCharEntry(character, entry.uid, formData);
        });

        form.addEventListener("input", () => {
            clearTimeout(formDebounceTimer);

            formDebounceTimer = window.setTimeout(() => form.requestSubmit(), DEBOUNCE_MS);
        });

        killSwitch.addEventListener("click", (e) => {
            toggleSwitch(killSwitch, (state) => {
                el(form, 'input[name="enabled"]').value = state;
                toggleVisibility(el(newRow, '.status-separator'), !state);
                toggleVisibility(el(newRow, '.status-description'), !state);
                el(newRow, '.hover-highlight').classList.toggle('disabled', !state);
            });

            form.dispatchEvent(inputEvent);
        });

        // Set up UI
        if (!entry.enabled) toggleSwitch(killSwitch, (state) => {
            toggleVisibility(el(newRow, '.status-separator'), !state);
            toggleVisibility(el(newRow, '.status-description'), !state);
            el(newRow, '.hover-highlight').classList.toggle('disabled', !state);
        });

        /**@type {HTMLSelectElement}*/
        const selectValueUID = el(newRow, '.status-value-uid');

        if (entry.alt_values.length <= 1) toggleVisibility(selectValueUID, true);
        else {
            /** Only load swipes selector if there are more than one option */
            const optionsValueUID = document.createElement("div");
            optionsValueUID.setAttribute("role", "tooltip");
            optionsValueUID.setAttribute("avatar-target", character.avatar);
            optionsValueUID.classList.add("status-value-uid-options", "list-group");

            // el(document, 'div[name="templatesAndPopupsWrapper"]').append(optionsValueUID);
            newRow.append(optionsValueUID);

            selectValueUID.value = String(entry.value_uid);

            const selectValueUIDPopper = Popper.createPopper(selectValueUID, optionsValueUID, {
                modifiers: [{
                    name: "eventListeners",
                    enabled: false
                }],
                placement: "left"
            });

            for (const alt_val of entry.alt_values) {
                const option = document.createElement("div");
                option.setAttribute("value", String(alt_val.uid));
                option.innerText = (!alt_val.key ? null : alt_val.key) ?? ("UID " + alt_val.uid);
                option.classList.add("list-group-item");

                option.addEventListener("click", async () => {
                    const alt = getCharAltValue(character, entry.uid, option.getAttribute("value"));

                    el(form, 'input[name="alt_key"]').value = alt.key;
                    el(form, 'input[name="value"]').value = alt.value;
                    el(form, 'input[name="value_uid"]').value = alt.uid;

                    hidePopper(selectValueUIDPopper, optionsValueUID);

                    let formText = alt.value;
                    let formTarget = "value";

                    if (formText === "") {
                        formText = alt.key;
                        formTarget = "alt_key";
                    }

                    updateDescription(formText, '.status-description', formTarget);
                    form.dispatchEvent(inputEvent);
                });

                optionsValueUID.append(option);
            }

            selectValueUID.addEventListener('click', function () {
                showPopper(selectValueUIDPopper, optionsValueUID);

                callbacksClickValueUID.push({
                    target: character.avatar,
                    popper: selectValueUIDPopper,
                    callback: (clickTarget) => {
                        if (
                            !clickTarget.closest(`div[avatar-target="${character.avatar}"] select.status-value-uid`) &&
                            !clickTarget.closest(`.status-value-uid-options.list-group[avatar-target="${character.avatar}"]`)
                        ) {
                            hidePopper(selectValueUIDPopper, optionsValueUID);
                            callbacksClickValueUID = callbacksClickValueUID.filter(obj => obj.target !== character.avatar);
                        }
                    }
                });
            });
        }

        statusTableBody.append(newRow);
    }

    /** Insert table in chat */
    const messText = $chat.querySelector(`.mes[mesid="${status.last_mes_id}"] .mes_text`);

    if (!messText) return;

    messText.parentNode.insertBefore(statusTableContainer, messText);
    toggleVisibility(statusTableBody, status.is_collapsed ?? false);
}

export function processMacros(text, {char = undefined, processInputs = true} = {}) {
    let newText = text;

    if (char) {
        newText = text.replaceAll("{{name}}", char.name);
    }

    if (processInputs) {
        text.match(regexTextInput)
            ?.forEach(match => {
                const value = match.replaceAll(/(({{text(::)?)|(}}))/g, "");

                newText = newText.replace(match, value);
            });

        text.match(regexNumberInput)
            ?.forEach(match => {
                const value = match.replaceAll(/(({{number(::)?)|(}}))/g, "");
                newText = newText.replace(match, value);
            });

        text.match(regexBooleanInput)
            ?.forEach(match => {
                const props = match.replaceAll(/(({{boolean(::)?)|(}}))/g, "").split("::");
                const checked = props[0] ?? "true";
                const trueValue = props[1] ?? "true";
                const falseValue = props[2] ?? "false";
                const value = checked === "true" ? trueValue : falseValue;

                newText = newText.replace(match, value);
            });

        text.match(regexRangeInput)
            ?.forEach(match => {
                const props = match.replaceAll(/(({{range::)|(}}))/g, "").split("::");
                const value = props[3];

                newText = newText.replace(match, value);
            });
    }

    return newText;
}

export function fetchStatus({forceUIUpdate = false, depthModifier = 0, newMessID = (chat.length - 1)} = {}) {
    if (!chat_metadata.stat_us_maximus) chat_metadata.stat_us_maximus = [];

    const startID = $('.mes.lastInContext').first().attr('mesid') ?? 0;
    const realChat = chat.slice(Number(startID));
    const metadata = chat_metadata.stat_us_maximus;
    const chars = metadata.map(status => getParticipant(status.avatar, status.is_user));

    if (!metadata?.length) chars.push(...getAllParticipantsInChat(realChat));
    else chars.push(...getActiveParticipants(chars));

    const raw_statuses = chars.map(character => getCharStatus(character));

    for (const key of Object.keys(extension_prompts))
        if (key.includes(extensionName.toLowerCase())) delete extension_prompts[key];

    const statuses = raw_statuses.filter(stat => stat !== false);

    if (statuses.length < 1) {
        destroyElement(`.stat-us-max-custom-css.table-container`);
        destroyElement(`.status-value-uid-options.list-group`);
        return
    }

    for (let i = 0; i < statuses.length; i++) {
        const character = chars[i];

        if (!character) continue;

        const char_depth = getStatusDepth(realChat, character);

        if (statuses[i])
            statuses[i].depth = char_depth;
        else if (extensionSettings.autoDetectParticipants)
            statuses[i] = createCharStatus(character, char_depth);
        else continue;

        // If chat/status is empty or character is not even in the context
        if (char_depth < 0) continue;
        if (forceUIUpdate || (statuses[i].last_mes_id + char_depth) !== newMessID) addTracker(statuses[i], newMessID, character);
        if (!statuses[i].entries.length) continue;

        const status = statuses[i];
        const promptKey = extensionName.toLowerCase() + "-" + char_depth;
        let promptValue = "";

        for (const entry of status.entries) {
            if (!entry.enabled) continue;
            if (promptValue !== "") promptValue += status.separator;

            const value = (entry.value === "") ? (entry.alt_values.find(alt => alt.uid === entry.value_uid).key) : (entry.value);

            promptValue += entry.key;

            if (entry.key !== "" && value !== "") promptValue += entry.separator;

            promptValue += value;
        };

        if (!promptValue) continue;
        else promptValue = status.prefix + promptValue + status.suffix;

        promptValue = processMacros(promptValue, {char: character});

        setExtensionPrompt(
            promptKey,
            promptValue,
            extension_prompt_types.IN_CHAT,
            char_depth + depthModifier,
            true,
            status.role
        );
    }

    saveMetadataDebounced();
}

export function groupListAvatarsClick(e) {
    const img = e.target;
    const char_avatar = img?.title;

    // @ts-ignore
    if (!char_avatar) return toastr.warning(t`Avatar could not be recognized`);

    const char = getCharacter(char_avatar);

    // @ts-ignore
    if (!char) return toastr.warning(t`The character could not be found`);

    popupStatusSingleChar(char);
}

export function addGroupStatusButtons() {
    const groupList = document.getElementById("rm_group_members");
    const avatars = groupList.querySelectorAll(".avatar");

    for (const avatar of avatars) {
        avatar.removeEventListener("click", groupListAvatarsClick);
        avatar.addEventListener("click", groupListAvatarsClick);
    }
}

// * Methods in charge of controlling the extension settings

const settingsCallbacks = {
    /**	Triggers on editNumbersFromChat change. */
    editNumbersFromChat: () => {
        fetchStatus({forceUIUpdate: true});
    },

    /**	Triggers on hideInputLabels change. */
    hideInputLabels: () => {
        const newDisplay = extensionSettings.hideInputLabels ? 'none' : 'block';

        document.documentElement.style.setProperty('--stum-input-label-display', newDisplay);
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
    console.debug("[" + extensionName + "]", `Auto detect participants is ${extensionSettings.autoDetectParticipants ? "active" : "not active"}`);
    console.debug("[" + extensionName + "]", `Edit numbers from chat is ${extensionSettings.editNumbersFromChat ? "active" : "not active"}`);
    console.debug("[" + extensionName + "]", `Hide input labels is ${extensionSettings.hideInputLabels ? "active" : "not active"}`);
    console.debug("[" + extensionName + "]", `Debug mode is ${extensionSettings.debug ? "active" : "not active"}`);
    console.debug("[" + extensionName + "]", structuredClone(extensionSettings));
}

/** Append settings menu on ST and set listeners. */
async function loadHTMLSettings() {
    const settingsHtml = await $.get(`${extensionFolderPath}/settings.html`);

    $("#extensions_settings2").append(settingsHtml);

    // Event Listeners for the extension HTML
    $("#stat-us-max-auto-detect-participants").on("input", settingsBooleanButton);
    $("#stat-us-max-edit-numbers-from-chat").on("input", settingsBooleanButton);
    $("#stat-us-max-hide-input-labels").on("input", settingsBooleanButton);
    $("#stat-us-max-debug").on("input", settingsBooleanButton);
    $("#stat-us-max-check-configuration").on("click", displaySettings);

    log("loadHTMLSettings");
}

/** Init setting values on the menu */
function setSettings() {
    $("#stat-us-max-auto-detect-participants").prop("checked", extensionSettings.autoDetectParticipants);
    $("#stat-us-max-edit-numbers-from-chat").prop("checked", extensionSettings.editNumbersFromChat);
    $("#stat-us-max-hide-input-labels").prop("checked", extensionSettings.hideInputLabels);
    $("#stat-us-max-debug").prop("checked", extensionSettings.debug).trigger("input");
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
        const chars = [];

        for (const status of metadata) {
            const char = getParticipant(status.avatar, status.is_user);

            if (char) chars.push(char);
        }

        // @ts-ignore
        if (!chars.length) return toastr.warning(t`Characters could not be found in the metadata`);

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
        if (this_chid !== undefined) {
            const char = characters[this_chid];

            // @ts-ignore
            if (!char) return toastr.warning(t`The character could not be found`);

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
    startListeners();
})();
