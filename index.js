import { extension_settings } from "../../../extensions.js";
import { saveSettingsDebounced, chat_metadata, this_chid, chat, characters, extension_prompts, setExtensionPrompt, extension_prompt_types, user_avatar, substituteParams } from "../../../../script.js";
import { getGroupMembers, selected_group } from "../../../group-chats.js";
import { t } from "../../../i18n.js";
import { createCharStatus, getCharAltValue, getCharStatus, saveMetadataSTUM, updateCharEntry } from "./source/js/statusControls.js";
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
    - [X] Button on right nav panel to open user metadata - one for active and another for all
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
    rangeInputWidth: "auto",
    showWhiteSpaces: false,
    minPromptDepth: 0,
    debug: false
};

const regexTextInput = /({{text)(::[^{}]*)?(}})/g;
const regexNumberInput = /({{number)(::-?\d+\.?\d*)?(}})/g;
const regexBooleanInput = /({{boolean)(::((false)|(true))::[^}\n]+::[^}\n]+)?(}})/g;
const regexRangeInput = /({{range::)(-?[\d]+(\.[\d]+)?)(::-?[\d]+(\.[\d]+)?){3}(}})/g;
const FETCH_STATUS_TIMEOUT_MS = 300;

let fetchStatusTimeout;

export const extensionSettings = extension_settings[extensionName];

// * Debugs methods

export const log = (...msg) => {
    if (!extensionSettings.enabled || !extensionSettings.debug) return;
    console.log("[" + extensionName + "]", ...msg);
};

// * MARK:Extension methods

/** Destroys an element and all data associated with it
    @param {string|HTMLElement|Node|JQuery<any>|HTMLElement[]|NodeList} element
*/
export function destroyElement(element) {
    const elem = $(element);

    elem.find('*').each(function() {
        const child = $(this);

        // Destroy event listeners
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

/** MARK:getStatusDepth()
    @param {object[]} input_chat
    @param {object} character
    @param {String} generationType
    @returns {object}
*/
export function getStatusDepth(input_chat, character, generationType = "") {
    const chat_filtered = input_chat.filter(mes => !mes.is_system);
    let correction = -1;

    if (generationType === "swipe") {
        chat_filtered.splice(chat_filtered.length - 1);
    }

    const lastIndex = chat_filtered
    .findLastIndex(mes =>{
        if (mes.is_user)
            return mes.force_avatar.replace(/(user avatars\/)|(\/thumbnail\?type=persona&file=)/i, "") === character.avatar;

        if (mes?.original_avatar !== undefined)
            return mes.original_avatar === character.avatar;

        if (mes?.force_avatar !== undefined)
            return mes.force_avatar.replace(/\/thumbnail\?type=avatar&file=/i, "") === character.avatar;

        return mes.name === character.name;
    });

    if (lastIndex < 0) return {depth: -1, last_mes_id: -1};

    const last_mes_id = chat.findLastIndex(mes => lodash.isEqual(mes, chat_filtered[lastIndex]));
    const depth = chat_filtered.length - lastIndex + correction;

    return depth < 0 ? {depth: 0, last_mes_id} : {depth, last_mes_id};
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

/**
    @param {HTMLElement} span
    @param {*} text
    @param {*} caretPos
    @param {*} selectEnd
 */
function renderCaret(span, text, caretPos, selectEnd = caretPos) {
    const esc = s => lodash.escape(s);

    destroyElement(span.children);

    if (caretPos < 0) return span.textContent = text;

    const before = esc(text.slice(0, caretPos));
    const selected = caretPos !== selectEnd ? esc(text.slice(caretPos, selectEnd)) : false;
    const after = esc(text.slice(selectEnd));

    if (!selected) span.innerHTML = `${before}<span class="fake-caret"></span>${after}`;
    else span.innerHTML = `${before}<span class="fake-selection">${selected}</span>${after}`;
}

function updateCaretDisplay(input, lastInputValue) {
    const start = input.selectionStart;
    const end = input.selectionEnd;
    renderCaret(input.nextElementSibling.querySelector('.value'), lastInputValue, start, end);
}

/**
    @param {HTMLElement} elem
    @returns {object}
*/
function getSelectedTextInElem(elem) {
    const selection = window.getSelection();

    if (!selection?.rangeCount) return {start: -1, end: -1};

    const range = selection.getRangeAt(0);

    if (elem.contains(range.startContainer) && elem.contains(range.endContainer))
        return {start: range.startOffset, end: range.endOffset};

    else if (elem.contains(range.startContainer))
        return {start: range.startOffset, end: elem.textContent.length};

    else if (elem.contains(range.endContainer))
        return {start: 0, end: range.endOffset};

    else return {start: -1, end: -1};
}

export function deleteCharTracker(character) {
    callbacksClickValueUID = callbacksClickValueUID.filter(obj => {
        const result = obj.target !== character.avatar;

        if (!result) obj.popper?.destroy();

        return result;
    });

    destroyElement(`.mes .stat-us-max-custom-css[avatar-target="${character.avatar}"]`);
    destroyElement(`.status-value-uid-options.list-group[avatar-target="${character.avatar}"]`);
}

/**
    MARK:addTracker()
*/
function addTracker(status, character) {
    const $chat = document.getElementById("chat");
    const entriesText = status.entries.reduce((acu, entry) => acu + entry.key + entry.value, "");

    deleteCharTracker(character);

    if (!entriesText || status.depth < 0 || status.last_mes_id < 0) return;

    const mesText = $chat.querySelector(`.mes[mesid="${status.last_mes_id}"] .mes_text`);

    if (!mesText) return;

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
                <div class="fa-solid fa-toggle-on kill-switch" title="Toggle entry's active state" data-i18n="Toggle entry's active state"></div>
                <p class="text-left flex-grow-1 m-0 d-table">
                    <span class="status-title fw-bolder d-contents"></span>
                    <span class="status-separator"></span>
                    <span class="status-description d-contents"></span>
                </p>
                <div class="status-value-uid fa-solid fa-bars-progress m-0" aria-describedby="tooltip" title="Swap entry description" data-i18n="Swap entry description"></div>
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
                    <span>
                        <span class="stat-us-max-chat-title-prefix">Status - </span>
                        <span class="stat-us-max-chat-title">${character.name}</span>
                    </span>
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

    const dispatchInput = (/**@type {HTMLElement}*/target, {time = 10, callback = () => {}} = {}) => {
        return setTimeout(() => {
            callback();
            target.dispatchEvent(inputEvent);
        }, time);
    }

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
        saveMetadataSTUM();
    });

    const createInputs = (/**@type {String}*/text) => {
        const parsedText = lodash.escape(substituteParams(processMacros(text, {char: character, processInputs: false}))).replaceAll(/\n/g, "<br>");

        if (!extensionSettings.editNumbersFromChat)
            return `<span class="text-line">${parsedText}</span>`;

        let newText = `<span class="text-line">${parsedText}</span>`;

        newText = newText.replaceAll(regexTextInput, (match) => {
            const value = match.replaceAll(/((^{{text(::)?)|(}}$))/g, "").replaceAll("<br>", "\n");
            const input = `
                <span class="fa-solid fa-t m-0 chat-input-icon select-none cursor-pointer"></span>
                <textarea type="text" class="type-text fake-input chat-input-editor" data-pattern="^[^{}]*$" autocomplete="off" data-stee--handled="1">${value}</textarea>
                <span class="text-quote"><span class="value ${extensionSettings.showWhiteSpaces ? "show-spaces" : ""}">${value}</span></span>
            `;

            return input;
        });

        newText = newText.replaceAll(regexNumberInput, (match) => {
            const value = match.replaceAll(/(({{number(::)?)|(}}))/g, "");
            const input = `
                <span class="fa-solid fa-n m-0 chat-input-icon select-none cursor-pointer"></span>
                <input type="text" value="${value === "" ? "0" : value}" inputmode="decimal" autocomplete="off" data-pattern="^-?\\d+\\.?\\d*$" class="type-number fake-input chat-input-editor" size="0" />
                <span class="text-quote">
                    <span class="value font-monospace">${value}</span>
                    <span class="d-inline-flex gap-0 text-body cursor-pointer fs-normal">
                        <span class="fa-solid fa-caret-left m-0 chat-input-icon select-none opacity-60"></span>
                        <span class="fa-solid fa-caret-right m-0 chat-input-icon select-none"></span>
                    </span>
                </span>
            `;

            return input;
        });

        newText = newText.replaceAll(regexBooleanInput, (match) => {
            const props = match.replaceAll(/(({{boolean(::)?)|(}}))/g, "").split("::");
            const checked = props[0] ?? "true";
            const trueValue = props[1] ?? "true";
            const falseValue = props[2] ?? "false";
            const input = `
                <input type="checkbox" ${checked === "true" ? "checked" : ""} data-true="${trueValue}" data-false="${falseValue}" class="type-checkbox m-0 chat-input-editor" />
                <span class="text-quote"> ${checked === "true" ? trueValue : falseValue}</span>
            `;

            return input;
        });

        newText = newText.replaceAll(regexRangeInput, (match) => {
            const props = match.replaceAll(/(({{range::)|(}}))/g, "").split("::");
            const min = props[0];
            const max = Number(props[1]) < Number(min) ? min : props[1];
            const step = Number(props[2]) <= 0 ? 1 : props[2];
            const value = props[3];
            const input = `
                <span class="d-flex flex-col flex-center gap-0 type-range chat-input-editor">
                    <input type="range" min="${min}" max="${max}" step="${step}" value="${value}" class="neo-range-slider" />
                    <input type="number" min="${min}" max="${max}" step="${step}" value="${value}" class="neo-range-input" />
                </span>
            `;

            return input;
        });

        return newText;
    }

    const createInputStrings = (parent, target) => {
        /**@type {HTMLElement}*/const targetEl = el(parent, target);
        /**@type {NodeListOf<HTMLElement>}*/const chunks = targetEl.querySelectorAll('.chat-input-editor');
        let newValue = /**@type {HTMLElement}*/(targetEl.querySelector('.text-line')).dataset.originalText;

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

            if (chunk instanceof HTMLTextAreaElement) {
                const value = chunk.value;
                index = ++countText;
                match = regexTextInput;
                newMacro = `{{text${value.length > 0 ? "::" : ""}${value}}}`;
            }


            if (chunk instanceof HTMLInputElement) {
                if (chunk.classList.contains("type-number")) {
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
            el(newRow, el_target).querySelector('.text-line').dataset.originalText = text;

            if (!extensionSettings.editNumbersFromChat) return;

            el(newRow, el_target)
            .querySelectorAll('input.type-text[type="text"]')
            .forEach((/**@type {HTMLInputElement}*/input) => {

                input.onkeydown = (event) => {
                    if (/[{}\n]/.test(event.key)) event.preventDefault();
                }
            });

            el(newRow, el_target)
            .querySelectorAll('.chat-input-editor:not(.type-range)')
            .forEach((/**@type {HTMLInputElement|HTMLTextAreaElement}*/input) => {
                if (input.type === "checkbox") {
                    // @ts-ignore
                    input.nextElementSibling.textContent = " " + (input.checked ? input.dataset.true : input.dataset.false);

                    input.addEventListener("input", () => {
                        // @ts-ignore
                        input.nextElementSibling.textContent = " " + (input.checked ? input.dataset.true : input.dataset.false);

                        el(form, `input[name="${form_target}"]`).value = createInputStrings(newRow, el_target);
                        dispatchInput(form);
                    });
                } else {
                    const eventTargets = [input.nextElementSibling, input.previousElementSibling];
                    let lastValid = input.value;
                    let inputTimeout;

                    eventTargets.forEach((/**@type {HTMLSpanElement}*/span) => {
                        let spanSelected = false;
                        let incrementsPressed;
                        let incrementsCooldown;

                        span.addEventListener("pointerdown", (e) => {
                            if (spanSelected) return;

                            spanSelected = true;
                        });

                        document.addEventListener("click", (e) => {
                            clearInterval(incrementsPressed);
                            clearTimeout(incrementsCooldown);

                            if (!spanSelected) return;

                            spanSelected = false;
                            let selection;

                            if (span.classList.contains("chat-input-icon")) selection = {start: input.value.length, end: input.value.length};
                            else selection = getSelectedTextInElem(span.querySelector('.value'));

                            input.setSelectionRange(selection.start, selection.end);
                            input.focus();
                        });

                        if (input.classList.contains("type-number") && span.classList.contains("text-quote")) {
                            const arrowDown = new KeyboardEvent('keydown', {key: 'ArrowDown', bubbles: false, cancelable: true});
                            const arrowUp = new KeyboardEvent('keydown', {key: 'ArrowUp', bubbles: false, cancelable: true});

                            span.addEventListener("wheel", async (e) => {
                                if (!input.matches(':focus')) return;

                                e.preventDefault();

                                let direction;

                                if (e.deltaY === 0) return;
                                if (e.deltaY < 0) direction = arrowUp;
                                if (e.deltaY > 0) direction = arrowDown;

                                setTimeout(() => input.dispatchEvent(direction), 10);
                            });

                            /**@type {HTMLSpanElement}*/const minusButton = span.querySelector('.fa-caret-left');
                            /**@type {HTMLSpanElement}*/const plusButton = span.querySelector('.fa-caret-right');

                            minusButton.addEventListener("pointerdown", (e) => {
                                if (e.button === 2) return;

                                input.dispatchEvent(arrowDown);
                                incrementsCooldown = setTimeout(() => {
                                    incrementsPressed = setInterval(() => input.dispatchEvent(arrowDown), 75);
                                }, 300);
                            });

                            plusButton.addEventListener("pointerdown", (e) => {
                                if (e.button === 2) return;

                                input.dispatchEvent(arrowUp);
                                incrementsCooldown = setTimeout(() => {
                                    incrementsPressed = setInterval(() => input.dispatchEvent(arrowUp), 75);
                                }, 300);
                            });
                        }
                    });

                    input.addEventListener("input", () => {
                        if (input.dataset.pattern) {
                            const regex = new RegExp(input.dataset.pattern);

                            if (regex.test(input.value)) lastValid = input.value;
                            else input.value = lastValid;
                        } else lastValid = input.value;


                        clearTimeout(inputTimeout);
                        inputTimeout = dispatchInput(form, {time: 300, callback: () =>
                            el(form, `input[name="${form_target}"]`).value = createInputStrings(newRow, el_target)
                        });
                    });

                    if (input.classList.contains("type-number")) {
                        input.addEventListener("keydown", (/**@type {KeyboardEvent}*/e) => {
                            if (!["ArrowUp", "ArrowDown"].includes(e.key))
                                return setTimeout(() => updateCaretDisplay(input, lastValid), 75);

                            e.preventDefault();

                            input.value = String(Number(input.value) + ((e.key === "ArrowUp") ? 1 : -1));

                            dispatchInput(input);
                            setTimeout(() => updateCaretDisplay(input, lastValid), 75);
                        });
                    } else {
                        input.addEventListener("keydown", () => setTimeout(() => updateCaretDisplay(input, lastValid), 75));
                    }

                    input.addEventListener("focus", () => updateCaretDisplay(input, lastValid));
                    input.addEventListener("blur", () => renderCaret(input.nextElementSibling.querySelector('.value'), lastValid, -1));
                }
            });

            el(newRow, el_target)
            .querySelectorAll('.chat-input-editor.type-range')
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
                    dispatchInput(form);
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

            formDebounceTimer = setTimeout(() => form.requestSubmit(), DEBOUNCE_MS);
        });

        killSwitch.addEventListener('pointerdown', e =>
            document.addEventListener('contextmenu', e => e.preventDefault(), {once: true})
        );

        killSwitch.addEventListener("pointerup", (/**@type {PointerEvent}*/e) => {
            e.preventDefault();

            if (e.button === 2) {
                popupStatusSingleChar(character);

                return setTimeout(() => {
                    const popupContainer = `.stat-us-max-popup[data-char="${character.avatar}"][data-is-user="${status.is_user}"]`;
                    const popupRowToggle = `.stat-us-max-popup-row[data-uid="${entry.uid}"] .inline-drawer-toggle`;
                    /**@type {HTMLElement}*/const drawerToggle = document.querySelector(`${popupContainer} ${popupRowToggle}`);
                    drawerToggle.click();
                }, 50);
            }

            toggleSwitch(killSwitch, (state) => {
                el(form, 'input[name="enabled"]').value = state;
                toggleVisibility(el(newRow, '.status-separator'), !state);
                toggleVisibility(el(newRow, '.status-description'), !state);
                el(newRow, '.hover-highlight').classList.toggle('disabled', !state);
            });

            dispatchInput(form);
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
                option.textContent = (!alt_val.key ? null : alt_val.key) ?? ("UID " + alt_val.uid);
                option.classList.add("list-group-item");

                option.addEventListener("click", async () => {
                    const alt = getCharAltValue(character, entry.uid, option.getAttribute("value"));

                    el(form, 'input[name="alt_key"]').value = alt.key;
                    el(form, 'input[name="value"]').value = alt.value;
                    el(form, 'input[name="value_uid"]').value = alt.uid;

                    hidePopper(selectValueUIDPopper, optionsValueUID);
                    callbacksClickValueUID = callbacksClickValueUID.filter(obj => obj.target !== character.avatar);

                    let formText = alt.value;
                    let formTarget = "value";

                    if (formText === "") {
                        formText = alt.key;
                        formTarget = "alt_key";
                    }

                    updateDescription(formText, '.status-description', formTarget);
                    dispatchInput(form);
                });

                optionsValueUID.append(option);
            }

            selectValueUID.addEventListener('click', function () {
                showPopper(selectValueUIDPopper, optionsValueUID);

                callbacksClickValueUID.push({
                    target: character.avatar,
                    popper: selectValueUIDPopper,
                    callback: (clickTarget) => {
                        if (!clickTarget.closest(`.status-value-uid-options.list-group[avatar-target="${character.avatar}"]`)) {
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
    mesText.parentNode.insertBefore(statusTableContainer, mesText);
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

/**
    MARK:fetchStatus()
    @typedef {object} FetchOptions
    @property {boolean} [forceUIUpdate]
    @property {number} [depthModifier]
    @property {object} [forceDepth]
    @property {String} [forceDepth.avatar]
    @property {number} [forceDepth.depth]
    @property {String} [generationType]

    @param {FetchOptions?} options
*/
export function fetchStatus({forceUIUpdate = false, depthModifier = 0, forceDepth = undefined, generationType = ""} = {}) {
    if (!chat_metadata.stat_us_maximus) chat_metadata.stat_us_maximus = [];

    const real_chat = !extension_settings["Presence"] ? chat.slice(chat_metadata.lastInContextMessageId) : chat;
    const metadata = chat_metadata.stat_us_maximus;
    const chars = getActiveParticipants();

    if (!metadata?.length) chars.push(...getAllParticipantsInChat(real_chat));

    const raw_data = chars.map(character => ({
        char: character,
        status: getCharStatus(character)
    }));

    for (const key of Object.keys(extension_prompts))
        if (key.includes(extensionName.toLowerCase())) delete extension_prompts[key];

    const data = raw_data.filter(data => data.status !== false);

    if (data.length < 1) {
        destroyElement(`.stat-us-max-custom-css.table-container`);
        destroyElement(`.status-value-uid-options.list-group`);
        return;
    }

    for (let i = 0; i < data.length; i++) {
        const character = data[i].char;

        if (!character) continue;

        const statusCustomDepth = Number(data[i].status.forceDepth === "" ? NaN : data[i].status.forceDepth);
        const ignoreDepthFailSafe = forceDepth?.avatar === character.avatar || statusCustomDepth >= 0;

        const dynamicDepth = getStatusDepth(real_chat, character, generationType);
        const char_depth = ignoreDepthFailSafe ? {depth: (forceDepth?.depth ?? statusCustomDepth)} : dynamicDepth;

        if (statusCustomDepth >= 0)
            char_depth.depth = statusCustomDepth;

        if (!data[i].status && extensionSettings.autoDetectParticipants)
            data[i].status = createCharStatus(character);

        if (!data[i].status) continue;

        // If chat/status is empty or character is not even in the context
        if (char_depth.depth < 0) continue;

        const detectedLastMesID = dynamicDepth.last_mes_id + dynamicDepth.depth;
        const charLastMesID = data[i].status.last_mes_id + data[i].status.depth;

        if (forceUIUpdate || detectedLastMesID !== charLastMesID) {
            data[i].status.depth = dynamicDepth.depth;
            data[i].status.last_mes_id = dynamicDepth.last_mes_id;
            addTracker(data[i].status, character);
        }

        const status = data[i].status;

        if (!status.entries.length) continue;

        const promptKey = extensionName.toLowerCase() + "-" + character.avatar;
        const promptDepth = ignoreDepthFailSafe ? char_depth.depth : (char_depth.depth + depthModifier);
        const finalPromptDepth = (promptDepth < extensionSettings.minPromptDepth) ? extensionSettings.minPromptDepth : promptDepth;
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
            finalPromptDepth,
            true,
            status.role
        );
    }

    saveMetadataSTUM();
}

/**
    @param {FetchOptions?} options
*/
export function fetchStatusDebounced(options = {}) {
    clearTimeout(fetchStatusTimeout);
    fetchStatusTimeout = setTimeout(() => fetchStatus(options), FETCH_STATUS_TIMEOUT_MS);
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

// * MARK:Methods in charge of controlling the extension settings

const settingsCallbacks = {
    rangeInputWidthTimeout: undefined,

    /**	Triggers on editNumbersFromChat change. */
    editNumbersFromChat: () => {
        fetchStatus({forceUIUpdate: true});
    },

    /**	Triggers on hideInputLabels change. */
    hideInputLabels: () => {
        const newDisplay = extensionSettings.hideInputLabels ? 'none' : 'block';

        document.documentElement.style.setProperty('--stum-input-label-display', newDisplay);
    },

    /**	Triggers on rangeInputWidth change. */
    rangeInputWidth: () => {
        clearTimeout(settingsCallbacks.rangeInputWidthTimeout);

        const newWidth = String($("#stat-us-max-range-input-width").val());

        settingsCallbacks.rangeInputWidthTimeout = setTimeout(() =>
            document.documentElement.style.setProperty('--stum-range-input-width', newWidth), 100
        );
    },

    /**	Triggers on showWhiteSpaces change. */
    showWhiteSpaces: () => {
        document
        .querySelectorAll('#chat .stat-us-max-custom-css .text-quote .value')
        .forEach((/**@type {HTMLSpanElement}*/span) =>
            span.classList.toggle("show-spaces", extensionSettings.showWhiteSpaces)
        );
    }
}

/** Changes a boolean setting value and triggers a callback if there's any on settingsCallbacks. */
function settingsBooleanButton(event) {
    const target = event.target;
    const value = Boolean($(target).prop("checked")) === true;

    const setting = target.getAttribute("stat-us-max-setting");
    const callback = settingsCallbacks[setting];

    extensionSettings[setting] = value;

    if (callback) callback();

    log("toggleSetting " + setting, value);
    saveSettingsDebounced();
}

/** Changes a string setting value and triggers a callback if there's any on settingsCallbacks. */
function settingsTextButton(event) {
    const target = event.target;
    const value = String($(target).val());

    const setting = target.getAttribute("stat-us-max-setting");
    const callback = settingsCallbacks[setting];

    extensionSettings[setting] = value;

    if (callback) callback();

    log("toggleSetting " + setting, value);
    saveSettingsDebounced();
}

/** Changes a number setting value and triggers a callback if there's any on settingsCallbacks. */
function settingsNumberButton(event) {
    const target = event.target;
    const raw_value = Number($(target).val());
    const value = isNaN(raw_value) ? 0 : raw_value;

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
    console.debug("[" + extensionName + "]", `Show input macros in chat is ${extensionSettings.editNumbersFromChat ? "active" : "not active"}`);
    console.debug("[" + extensionName + "]", `Hide input labels is ${extensionSettings.hideInputLabels ? "active" : "not active"}`);
    console.debug("[" + extensionName + "]", `Show whitespaces is ${extensionSettings.showWhiteSpaces ? "active" : "not active"}`);
    console.debug("[" + extensionName + "]", `Range input width is set to ${String(extensionSettings.rangeInputWidth)}`);
    console.debug("[" + extensionName + "]", `Min prompt depth is set to ${String(extensionSettings.minPromptDepth)}`);
    console.debug("[" + extensionName + "]", `Debug mode is ${extensionSettings.debug ? "active" : "not active"}`);
    console.debug("[" + extensionName + "]", structuredClone(extensionSettings));
}

/** Append settings menu on ST and set listeners. */
async function loadHTMLSettings() {
    const settingsHtml = await $.get(`${extensionFolderPath}/settings.html`);

    $("#extensions_settings2").append(settingsHtml);

    // Event Listeners for the extension HTML
    $("#stat-us-max-auto-detect-participants").on("input", settingsBooleanButton);
    $("#stat-us-max-show-input-macros").on("input", settingsBooleanButton);
    $("#stat-us-max-hide-input-labels").on("input", settingsBooleanButton);
    $("#stat-us-max-show-white-spaces").on("input", settingsBooleanButton);
    $("#stat-us-max-range-input-width").on("input", settingsTextButton);
    $("#stat-us-max-min-prompt-depth").on("input", settingsNumberButton);
    $("#stat-us-max-debug").on("input", settingsBooleanButton);
    $("#stat-us-max-check-configuration").on("click", displaySettings);

    log("loadHTMLSettings");
}

/** Init setting values on the menu */
function setSettings() {
    $("#stat-us-max-auto-detect-participants").prop("checked", extensionSettings.autoDetectParticipants);
    $("#stat-us-max-show-input-macros").prop("checked", extensionSettings.editNumbersFromChat);
    $("#stat-us-max-show-white-spaces").prop("checked", extensionSettings.showWhiteSpaces);
    $("#stat-us-max-hide-input-labels").prop("checked", extensionSettings.hideInputLabels).trigger("input");
    $("#stat-us-max-range-input-width").val(extensionSettings.rangeInputWidth).trigger("input");
    $("#stat-us-max-min-prompt-depth").val(extensionSettings.minPromptDepth);
    $("#stat-us-max-debug").prop("checked", extensionSettings.debug).trigger("input");
}

// * MARK:Initialize Extension

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
    charStatusSpan.textContent = "Stat-us Maximus";
    charStatusSpan.dataset.i18n = "Stat-us Maximus";
    charStatusSpan.classList.add("flex-grow-1");

    const personasStatusOpenPopupBtn = document.createElement("div");
    personasStatusOpenPopupBtn.classList.add("menu_button", "menu_button_icon", "fa-solid", "fa-users-cog", "interactable", "m-0");
    personasStatusOpenPopupBtn.title = "Open status for all the personas with status";
    personasStatusOpenPopupBtn.dataset.i18n = "Open status for all the personas with status";
    personasStatusOpenPopupBtn.addEventListener("click", async () => {
        const metadata = chat_metadata.stat_us_maximus.filter(s => s.is_user);
        const users = [];

        for (const status of metadata) {
            const user = getUser(status.avatar);

            if (user) users.push(user);
        }

        // @ts-ignore
        if (!users.length) return toastr.warning(t`Personas could not be found in the metadata`);

        return await popupStatusMultiChar(users);
    });

    const personaStatusOpenPopupBtn = document.createElement("div");
    personaStatusOpenPopupBtn.classList.add("menu_button", "menu_button_icon", "fa-solid", "fa-user-cog", "interactable", "m-0");
    personaStatusOpenPopupBtn.title = "Open status for the active persona";
    personaStatusOpenPopupBtn.dataset.i18n = "Open status for the active persona";
    personaStatusOpenPopupBtn.addEventListener("click", async () => {
        const user = getUser();

        // @ts-ignore
        if (!user) return toastr.warning(t`The persona could not be found`);

        return await popupStatusSingleChar(user);
    });

    const charStatusOpenPopupBtn = document.createElement("div");
    charStatusOpenPopupBtn.classList.add("menu_button", "menu_button_icon", "fa-solid", "fa-table", "interactable", "m-0");
    charStatusOpenPopupBtn.title = "Open status for the active character";
    charStatusOpenPopupBtn.dataset.i18n = "Open status for the active character";
    charStatusOpenPopupBtn.addEventListener("click", async () => {
        // @ts-ignore
        if (this_chid === undefined) return toastr.warning(t`An active character to edit could not be found`);

        const char = characters[this_chid];

        // @ts-ignore
        if (!char) return toastr.warning(t`The character could not be found`);

        return await popupStatusSingleChar(char);
    });

    const charStatusMenu = document.createElement("div");
    charStatusMenu.classList.add("d-flex", "flex-center-start", "gap-5px", "separator-bottom");
    charStatusMenu.append(charStatusSpan, charStatusOpenPopupBtn, personaStatusOpenPopupBtn, personasStatusOpenPopupBtn);

    const charStatusContainer = document.createElement("div");
    charStatusContainer.classList.add("stat-us-max-custom-css");
    charStatusContainer.append(charStatusMenu);

    const creatorNotesBlock = document.getElementById("spoiler_free_desc");
    creatorNotesBlock.before(charStatusContainer);

    /** Group menu */
    // @ts-ignore
    /** @type {HTMLElement} */const groupStatusContainer = charStatusContainer.cloneNode(true);
    groupStatusContainer.classList.add("wide100p");
    groupStatusContainer.firstElementChild.classList.add("border", "border-faded");
    groupStatusContainer.firstElementChild.classList.remove("separator-bottom");

    const groupPersonasBtn = groupStatusContainer.querySelector('.menu_button.fa-users-cog');
    groupPersonasBtn.addEventListener("click", async () => {
        const metadata = chat_metadata.stat_us_maximus.filter(s => s.is_user);
        const users = [];

        for (const status of metadata) {
            const user = getUser(status.avatar);

            if (user) users.push(user);
        }

        // @ts-ignore
        if (!users.length) return toastr.warning(t`Personas could not be found in the metadata`);

        return await popupStatusMultiChar(users);
    });

    const groupPersonaBtn = groupStatusContainer.querySelector('.menu_button.fa-user-cog');
    groupPersonaBtn.addEventListener("click", async () => {
        const user = getUser();

        // @ts-ignore
        if (!user) return toastr.warning(t`The persona could not be found`);

        return await popupStatusSingleChar(user);
    });

    /** @type {HTMLElement} */const groupMembersButton = groupStatusContainer.querySelector('.menu_button.fa-table');
    groupMembersButton.title = "Open status for all group members";
    groupMembersButton.dataset.i18n = "Open status for all group members";
    groupMembersButton.addEventListener("click", async () => {
        const chars = getActiveParticipants([{avatar: user_avatar}]);

        // @ts-ignore
        if (!chars.length) return toastr.warning(t`Group members could not be found in the metadata`);

        return await popupStatusMultiChar(chars);
    });

    const groupChatsBlock = document.getElementById("rm_group_chats_block");
    groupChatsBlock.querySelector('.inline-drawer').after(groupStatusContainer);
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
