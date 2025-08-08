import { lodash } from "../../../../../../lib.js";
import { characters, extension_prompt_roles, getThumbnailUrl } from "../../../../../../script.js";
import { t } from "../../../../../i18n.js";
import { callGenericPopup, POPUP_TYPE } from "../../../../../popup.js";
import { power_user } from "../../../../../power-user.js";
import { getSortableDelay } from "../../../../../utils.js";
import { log, destroyElement, fetchStatusDebounced } from "../../index.js";
import { getCharStatus, addCharEntry, removeCharEntry, addCharAltValue, updateCharEntry, getCharAltValue, getCharEntry, removeCharAltValue, refreshCharEntryDisplay, createCharStatus, transferCharStatus, deleteCharStatus, parseValue, saveMetadataSTUM } from "./statusControls.js";

/*  # TODO
    - [X] Select for alt_values
    - [X] Add for alt_values
    - [X] Delete for alt_values
    - [X] Nick for alt_values
    - [X] Disable row btn
    - [X] Role button
    - [X] Confirm screen for delete
    - [X] Avatar before title
    - [X] Drag and drop for entries
    - [X] Per-character open menu buttons on group list and in right nav UI for solo chats
    - [X] Open/close all entries - per character
    - [X] Status clone button
    - [X] Status delete button
    - [X] Entries block prefix/suffix
    - [X] Custom depth buttons - dynamic depth if undefined
    - [X] Fucking labels
*/

export function escapeNewlines(str) {
    return str
        .replace(/\\/g, "\\\\")
        .replace(/\r\n/g, "\\r\\n")
        .replace(/\n/g, "\\n")
        .replace(/\r/g, "\\r");
}

export function un_escapeNewlines(str) {
    return str
        .replace(/\\r\\n/g, "\r\n")
        .replace(/\\n/g, "\n")
        .replace(/\\r/g, "\r");
}

async function popupDeleteConfirm(del_name = "this") {
    const delete_title = document.createElement("div");
    delete_title.textContent = t`WARNING`;
    delete_title.classList.add("fw-bolder");

    const delete_text = document.createElement("div");
    delete_text.textContent = t`Are you sure want to delete ${del_name}?`;

    const delete_container = document.createElement("div");
    delete_container.classList.add("d-flex", "flex-col", "flex-center", "w-100", "mb-5px", "gap-5px");
    delete_container.append(delete_title, delete_text);

    const delete_css_block = document.createElement("div");
    delete_css_block.classList.add("stat-us-max-custom-css");
    delete_css_block.append(delete_container);

    return await callGenericPopup(delete_css_block, POPUP_TYPE.CONFIRM, "", {
        okButton: t`Confirm`,
        cancelButton: t`Cancel`,
        onClose: () => destroyElement(delete_css_block)
    });
};

/** Clones the status data of the selected `char`
    @param {object} char
    @returns {Promise<boolean|object>}
*/
async function clonePopup(char) {
    const cloneContainer = document.createElement("div");
    cloneContainer.classList.add("stat-us-max-popup");

    const cloneWrapper = document.createElement("div");
    cloneWrapper.classList.add("d-flex", "flex-col");
    cloneWrapper.innerHTML = `<span>${t`Clone ${char.name} stats`}</span>`;

    const defOption = document.createElement("option");
    defOption.value = null;
    defOption.innerText = t`--Select target--`;

    const selectParticipant = document.createElement("select");
    selectParticipant.classList.add("flex-grow-1", "px-5px", "m-0");
    selectParticipant.append(defOption);

    const participants = [
        ...Object
            .entries(power_user.personas)
            .map(([key, value]) => {return {name: value, avatar: key, is_user: true}}),
        ...characters
    ].filter(c => c.avatar !== char.avatar);

    for (const participant of participants) {
        const option = document.createElement("option");
        option.value = String(participant.avatar);
        option.innerText = String(participant.name);
        selectParticipant.append(option);
    }

    const inputOnlyEntries = document.createElement("input");
    inputOnlyEntries.type = "checkbox";

    const spanOnlyEntries = document.createElement("span");
    spanOnlyEntries.innerText = t`Transfer only entries`;

    const labelOnlyEntries = document.createElement("label");
    labelOnlyEntries.classList.add("flex-container");
    labelOnlyEntries.append(
        inputOnlyEntries,
        spanOnlyEntries
    );

    cloneWrapper.append(labelOnlyEntries, selectParticipant);
    cloneContainer.append(cloneWrapper);

    const popupResult = await callGenericPopup(cloneContainer, POPUP_TYPE.CONFIRM, "", {
        okButton: t`Confirm`,
        cancelButton: t`Cancel`
    });

    if (!popupResult) return false;

    const target = participants.find(c => c.avatar === selectParticipant.value);
    const success = !target ? false : transferCharStatus(char, target, {onlySendEntries: inputOnlyEntries.checked});

    // @ts-ignore
    if (success) toastr.success(t`Status clone successfully`);
    // @ts-ignore
    else toastr.error(t`An error occurred - Status could not be clone`);

    destroyElement(cloneContainer);

    return success ? target : false;
}

function getFullCharAvatar(status) {
    // TODO getThumbnailUrl - on next release
    if (status.is_user) return getThumbnailUrl("persona", status.avatar); //"/thumbnail?type=persona&file=" + status.avatar;
    else return getThumbnailUrl("avatar", status.avatar); //"/thumbnail?type=avatar&file=" + status.avatar;
}

export function formStatusSingleChar(char) {
    let metadata = getCharStatus(char);

    if (!metadata) metadata = createCharStatus(char);

    // @ts-ignore
    if (!metadata) return toastr.error(t`No metadata was found for the character -${char?.name}-`);

    const createInputLabel = (/**@type {HTMLInputElement|HTMLSelectElement}*/input, mw = "mw-unset") => {
        const labelTemplateSpan = document.createElement("small");
        labelTemplateSpan.dataset.i18n = (input instanceof HTMLInputElement) ? input.placeholder : input.ariaPlaceholder;
        labelTemplateSpan.innerText = (input instanceof HTMLInputElement) ? input.placeholder : input.ariaPlaceholder;
        labelTemplateSpan.classList.add("text-center", "input-label", "white-space-nowrap", "mb-3px");

        const labelTemplate = document.createElement("div");
        labelTemplate.classList.add("d-flex", "flex-col", "gap-0", "flex-grow-1", mw);
        labelTemplate.append(
            labelTemplateSpan,
            input
        );

        return labelTemplate;
    }

    const createButtonsWrapper = (/**@type {HTMLElement[]}*/buttons, lessPadding) => {
        const buttonsWrapper = document.createElement("div");
        buttonsWrapper.classList.add("d-flex", "flex-center-start", "buttons-wrapper");
        buttonsWrapper.append(...buttons);

        if (lessPadding) buttonsWrapper.classList.add("gap-5px");

        return buttonsWrapper;
    }

    /** Create Menu header. */
    const avatar = document.createElement("img");
    avatar.alt = "Avatar";
    avatar.title = lodash.escape(metadata.avatar);
    avatar.src = getFullCharAvatar(metadata);

    const avatarContainer = document.createElement("div");
    avatarContainer.classList.add("avatar");
    avatarContainer.append(avatar);

    const selectEntryRole = document.createElement("select");
    selectEntryRole.ariaPlaceholder = t`Select prompt role`;
    selectEntryRole.classList.add("flex-grow-1", "px-5px", "m-0");

    for (const role of Object.values(extension_prompt_roles)) {
        const option = document.createElement("option");
        option.value = String(role);

        if (extension_prompt_roles.SYSTEM === role) option.text = "System";
        if (extension_prompt_roles.ASSISTANT === role) option.text = "Assistant";
        if (extension_prompt_roles.USER === role) option.text = "User";

        if (metadata.role === role) {
            option.selected = true;
        }

        selectEntryRole.append(option);
    }

    const numberAreaForDepth = document.createElement("input");
    numberAreaForDepth.autocomplete = "off";
    numberAreaForDepth.type = "number";
    numberAreaForDepth.placeholder = t`Custom Depth`;
    numberAreaForDepth.title = t`Overrides the behavior of attaching the in-depth prompt dynamically before the last message, to using a constant depth`;
    numberAreaForDepth.value = metadata.forceDepth ?? "";
    numberAreaForDepth.classList.add("text_pole", "m-0");

    const textareaStatusSeparator = document.createElement("input");
    textareaStatusSeparator.autocomplete = "off";
    textareaStatusSeparator.type = "text";
    textareaStatusSeparator.placeholder = t`Entries separator`;
    textareaStatusSeparator.value = escapeNewlines(metadata.separator);
    textareaStatusSeparator.classList.add("text_pole", "m-0");

    const textareaDefEntrySeparator = document.createElement("input");
    textareaDefEntrySeparator.autocomplete = "off";
    textareaDefEntrySeparator.type = "text";
    textareaDefEntrySeparator.placeholder = t`Def. title/description separator`;
    textareaDefEntrySeparator.value = escapeNewlines(metadata.def_entry_separator);
    textareaDefEntrySeparator.classList.add("text_pole", "m-0");

    const textareaStatusPrefix = document.createElement("input");
    textareaStatusPrefix.autocomplete = "off";
    textareaStatusPrefix.type = "text";
    textareaStatusPrefix.placeholder = t`Status prefix`;
    textareaStatusPrefix.value = escapeNewlines(metadata.prefix);
    textareaStatusPrefix.classList.add("text_pole", "m-0");

    const textareaStatusSuffix = document.createElement("input");
    textareaStatusSuffix.autocomplete = "off";
    textareaStatusSuffix.type = "text";
    textareaStatusSuffix.placeholder = t`Status suffix`;
    textareaStatusSuffix.value = escapeNewlines(metadata.suffix);
    textareaStatusSuffix.classList.add("text_pole", "m-0");

    const deleteStatsBtn = document.createElement("div");
    deleteStatsBtn.title = "Delete character's Status";
    deleteStatsBtn.dataset.i18n = "Delete character's Status";
    deleteStatsBtn.classList.add("menu_button", "menu_button_icon", "fa-solid", "fa-trash-can", "redWarningBG", "interactable", "m-0");

    const cloneStatsBtn = document.createElement("div");
    cloneStatsBtn.title = "Clone Status entry into a chat participant";
    cloneStatsBtn.dataset.i18n = "Clone Status entry into a chat participant";
    cloneStatsBtn.classList.add("menu_button", "menu_button_icon", "fa-solid", "fa-truck-arrow-right", "interactable", "m-0");

    const expandEntriesBtn = document.createElement("div");
    expandEntriesBtn.classList.add("menu_button", "menu_button_icon", "fa-solid", "fa-expand", "interactable", "m-0");

    const compressEntriesBtn = document.createElement("div");
    compressEntriesBtn.classList.add("menu_button", "menu_button_icon", "fa-solid", "fa-compress", "interactable", "m-0");

    const newStatBtn = document.createElement("div");
    newStatBtn.title = `Add an status to ${char.name}`;
    newStatBtn.dataset.i18n = `Add an status to ${char.name}`;
    newStatBtn.classList.add("menu_button", "menu_button_icon", "fa-solid", "fa-plus", "interactable", "m-0");

    const statInputsWrapper = document.createElement("div");
    statInputsWrapper.classList.add("d-flex", "flex-end-start", "w-100", "gap-5px", "stat-wrapper");
    statInputsWrapper.append(
        createInputLabel(selectEntryRole),
        createInputLabel(numberAreaForDepth),
        createInputLabel(textareaStatusSeparator),
        createInputLabel(textareaDefEntrySeparator),
        createInputLabel(textareaStatusPrefix),
        createInputLabel(textareaStatusSuffix),
        createButtonsWrapper([
            deleteStatsBtn,
            cloneStatsBtn,
            expandEntriesBtn,
            compressEntriesBtn,
            newStatBtn
        ], true)
    );

    const wrapper = document.createElement("div");
    wrapper.classList.add("d-flex", "flex-center-start", "w-100", "py-5px");
    wrapper.append(
        avatarContainer,
        statInputsWrapper
    );

    /** Create input template */
    /** - Key */
    const dragHandle = document.createElement("span");
    dragHandle.textContent = "☰";
    dragHandle.classList.add("drag-handle");

    const drawerToggle = document.createElement("div");
    drawerToggle.classList.add("inline-drawer-toggle", "fa-fw", "fa-solid", "fa-circle-chevron-down", "inline-drawer-icon", "down", "interactable");

    const enableRowToggle = document.createElement("input");
    enableRowToggle.type = "hidden";
    enableRowToggle.name = "enabled";

    const enableRowBtn = document.createElement("div");
    enableRowBtn.classList.add("fa-solid", "fa-toggle-on", "kill-switch");
    enableRowBtn.title = "Toggle entry's active state.";
    enableRowBtn.dataset.i18n = "Toggle entry's active state.";

    const textareaKey = document.createElement("input");
    textareaKey.autocomplete = "off";
    textareaKey.type = "text";
    textareaKey.name = "key";
    textareaKey.placeholder = t`Entry title`;
    textareaKey.classList.add("text_pole", "m-0");

    const textareaSeparator = document.createElement("input");
    textareaSeparator.autocomplete = "off";
    textareaSeparator.type = "text";
    textareaSeparator.name = "separator";
    textareaSeparator.placeholder = t`Title/description separator`;
    textareaSeparator.classList.add("text_pole", "m-0", "mw-25");

    const deleteStatRowBtn = document.createElement("div");
    deleteStatRowBtn.title = "Delete Status entry";
    deleteStatRowBtn.dataset.i18n = "Delete Status entry";
    deleteStatRowBtn.classList.add("menu_button", "fa-fw", "fa-solid", "fa-trash-can", "redWarningBG", "interactable", "delete-row", "big-button");

    const drawerHeader = document.createElement("div");
    drawerHeader.classList.add("inline-drawer-header", "key", "w-100", "d-flex", "flex-center", "p-0");
    drawerHeader.append(
        dragHandle,
        drawerToggle,
        enableRowToggle,
        enableRowBtn,
        textareaKey,
        textareaSeparator,
        deleteStatRowBtn
    );

    /** - Value */
    const selectAltValues = document.createElement("select");
    selectAltValues.ariaPlaceholder = t`Select entry description`;
    selectAltValues.name = "value_uid";
    selectAltValues.classList.add("flex-grow-1", "px-5px", "m-0");

    const textareaAltKey = document.createElement("input");
    textareaAltKey.autocomplete = "off";
    textareaAltKey.type = "text";
    textareaAltKey.name = "alt_key";
    textareaAltKey.placeholder = t`Alt description title`;
    textareaAltKey.classList.add("text_pole", "m-0");

    const warningAltKey = document.createElement("i");
    warningAltKey.classList.add("fa-solid", "fa-circle-exclamation", "interactable");
    warningAltKey.title = "This is only used in the prompt if description is empty";
    warningAltKey.dataset.i18n = "This is only used in the prompt if description is empty";

    const addAltValues = document.createElement("div");
    addAltValues.title = "Add alt descriptions";
    addAltValues.dataset.i18n = "Add alt descriptions";
    addAltValues.classList.add("menu_button", "menu_button_icon", "fa-solid", "fa-plus", "interactable", "add_alt_value", "big-button", "m-0");

    const delAltValues = document.createElement("div");
    delAltValues.title = "Delete current alt description";
    delAltValues.dataset.i18n = "Delete current alt description";
    delAltValues.classList.add("menu_button", "fa-fw", "fa-solid", "fa-trash-can", "redWarningBG", "interactable", "del_alt_value", "big-button", "m-0");

    const settingsInputs = document.createElement("div");
    settingsInputs.classList.add("d-flex", "flex-end-start");
    settingsInputs.append(
        createInputLabel(selectAltValues, "mw-25"),
        createInputLabel(textareaAltKey, "mw-25"),
        createButtonsWrapper([
            warningAltKey,
            addAltValues,
            delAltValues
        ])
    );

    const textareaValue = document.createElement("textarea");
    textareaValue.name = "value";
    textareaValue.placeholder = t`Entry description...`;
    textareaValue.classList.add("text_pole", "m-0");

    const drawerContentContainer = document.createElement("div");
    drawerContentContainer.classList.add("d-flex", "flex-col");
    drawerContentContainer.append(settingsInputs, textareaValue);

    const drawerContent = document.createElement("div");
    drawerContent.classList.add("inline-drawer-content", "value", "w-100", "p-0", "mb-5px");
    drawerContent.append(drawerContentContainer);

    /** - Key/Value Block */
    const formRow = document.createElement("form");
    formRow.classList.add("stat-us-max-popup-row", "d-flex", "flex-col", "inline-drawer");
    formRow.append(drawerHeader, drawerContent);

    /** Create Menu container and assemble Menu */
    const content = document.createElement("div");
    content.classList.add("d-flex", "flex-col", "gap-5px", "pt-5px");

    const container = document.createElement("div");
    container.dataset.char = metadata.avatar;
    container.dataset.isUser = metadata.is_user;
    container.classList.add("stat-us-max-popup");
    container.append(wrapper, content);

    /** Add listeners */
    const DEBOUNCE_MS = 400;
    let formDebounceTimer;
    let altKeyDebounceTimer;
    let forceDepthDebounceTimer;
    let separatorDebounceTimer;
    let defEntrySeparatorDebounceTimer;
    let prefixDebounceTimer;
    let suffixDebounceTimer;

    const el = (target, class_name) => target.querySelector(class_name);

    /** @param {HTMLElement} el */
    const toggleSwitch = (el, callback = (param) => {}) => {
        // True if the final state is on
        const state = !el.classList.contains("fa-toggle-on");
        el.classList.toggle("fa-toggle-off", !state);
        el.classList.toggle("fa-toggle-on", state);
        callback(state);
    };

    const refreshAltValues = (target, alts, select_uid = 0) => {
        const select = el(target, 'select[name="value_uid"]');

        destroyElement(select.childNodes);

        for (const alt_val of alts) {
            const option = document.createElement("option");
            option.value = String(alt_val.uid);
            option.text = (!alt_val.key ? null : alt_val.key) ?? ("UID " + alt_val.uid);

            if (Number(select_uid) === alt_val.uid) {
                option.selected = true;
            }

            select.append(option);
        }
    };

    const evChange = new Event('change', { bubbles: true, cancelable: true });
    const evInput = new Event('input', { bubbles: true, cancelable: true });

    const addRow = ({amount = 1, data = []} = {}) => {
        for (let i = 0; i < amount; i++) {
            const newRow = /** @type {HTMLFormElement} */ (formRow.cloneNode(true));

            // @ts-ignore
            if (!data[i]) return toastr.warning(t`Data for new entry is empty - index=${i}`);

            newRow.dataset.uid = data[i].uid;
            newRow.removeAttribute('action');

            // Set Values
            el(newRow, 'input[name="key"]').value = data[i].key;
            el(newRow, 'input[name="separator"]').value = escapeNewlines(data[i].separator);
            el(newRow, 'textarea[name="value"]').value = data[i].value;
            el(newRow, 'input[name="enabled"]').value = data[i].enabled;
            refreshAltValues(newRow, data[i].alt_values, data[i].value_uid);
            el(newRow, 'select[name="value_uid"]').value = String(data[i].value_uid);
            el(newRow, 'input[name="alt_key"]').value = data[i].alt_values.find(alt => alt.uid === data[i].value_uid).key;

            if (!data[i].enabled) toggleSwitch(el(newRow, ".kill-switch"));

            // Add listeners
            newRow.addEventListener("submit", (e) => {
                e.preventDefault();

                const formData = new FormData(newRow);

                updateCharEntry(char, data[i].uid, formData);
            });

            newRow.addEventListener("input", () => {
                clearTimeout(formDebounceTimer);

                formDebounceTimer = window.setTimeout(() => newRow.requestSubmit(), DEBOUNCE_MS);
            });

            el(newRow, 'select[name="value_uid"]').addEventListener("change", () => {
                const alt = getCharAltValue(char, data[i].uid, el(newRow, 'select[name="value_uid"]').value);

                el(newRow, 'input[name="alt_key"]').value = alt.key;
                el(newRow, 'textarea[name="value"]').value = alt.value;

                newRow.dispatchEvent(evInput);
            });

            el(newRow, ".delete-row").addEventListener("click", async () => {
                if (await popupDeleteConfirm("the alt value") === 0) return;

                removeCharEntry(char, data[i].uid);
                destroyElement(newRow);
            });

            el(newRow, ".kill-switch").addEventListener("click", (e) => {
                toggleSwitch(el(newRow, ".kill-switch"), (state) => el(newRow, 'input[name="enabled"]').value = state);
                newRow.requestSubmit();
            });

            el(newRow, 'input[name="alt_key"]').addEventListener("keyup", () => {
                clearTimeout(altKeyDebounceTimer);

                altKeyDebounceTimer = window.setTimeout(() => refreshAltValues(
                    newRow,
                    getCharEntry(char, data[i].uid).alt_values,
                    el(newRow, 'select[name="value_uid"]').value
                ), DEBOUNCE_MS);
            });

            el(newRow, ".add_alt_value").addEventListener("click", () => {
                const newAlt = addCharAltValue(char, data[i].uid);

                if (!newAlt) return;

                refreshAltValues(newRow, getCharEntry(char, data[i].uid).alt_values, newAlt.uid);

                el(newRow, 'select[name="value_uid"]').value = String(newAlt.uid);
                el(newRow, 'select[name="value_uid"]').dispatchEvent(evChange);
            });

            el(newRow, ".del_alt_value").addEventListener("click", async () => {
                if (await popupDeleteConfirm("the alt value") === 0) return;

                try {
                    const success = removeCharAltValue(char, data[i].uid, el(newRow, 'select[name="value_uid"]').value);

                    if (!success) return;

                    const new_alts = getCharEntry(char, data[i].uid).alt_values;

                    refreshAltValues(newRow, new_alts);

                    el(newRow, 'select[name="value_uid"]').value = String(new_alts[0].uid);
                    el(newRow, 'select[name="value_uid"]').dispatchEvent(evChange);
                } catch (error) {
                    // ...
                }
            });

            content.append(newRow);
        }
    }

    expandEntriesBtn.addEventListener("click", () =>
        content.querySelectorAll(".inline-drawer-toggle.down").forEach((/**@type {HTMLElement}*/toggle) => toggle.click())
    );

    compressEntriesBtn.addEventListener("click", () =>
        content.querySelectorAll(".inline-drawer-toggle.up").forEach((/**@type {HTMLElement}*/toggle) => toggle.click())
    );

    newStatBtn.addEventListener("click", () => {
        const newEntry = addCharEntry(char, "", "");
        addRow({data: [newEntry]});
    });

    selectEntryRole.addEventListener("input", () => {
        metadata.role = Number(selectEntryRole.value);

        saveMetadataSTUM();
    });

    numberAreaForDepth.addEventListener("input", () => {
        metadata.forceDepth = parseValue(numberAreaForDepth.value);

        clearTimeout(forceDepthDebounceTimer);

        forceDepthDebounceTimer = window.setTimeout(() => saveMetadataSTUM(), DEBOUNCE_MS);
    })

    textareaStatusSeparator.addEventListener("input", () => {
        metadata.separator = un_escapeNewlines(textareaStatusSeparator.value);

        clearTimeout(separatorDebounceTimer);

        separatorDebounceTimer = window.setTimeout(() => saveMetadataSTUM(), DEBOUNCE_MS);
    });

    textareaDefEntrySeparator.addEventListener("input", () => {
        metadata.def_entry_separator = un_escapeNewlines(textareaDefEntrySeparator.value);

        clearTimeout(defEntrySeparatorDebounceTimer);

        defEntrySeparatorDebounceTimer = window.setTimeout(() => saveMetadataSTUM(), DEBOUNCE_MS);
    });

    textareaStatusPrefix.addEventListener("input", () => {
        metadata.prefix = un_escapeNewlines(textareaStatusPrefix.value);

        clearTimeout(prefixDebounceTimer);

        prefixDebounceTimer = window.setTimeout(() => saveMetadataSTUM(), DEBOUNCE_MS);
    });

    textareaStatusSuffix.addEventListener("input", () => {
        metadata.suffix = un_escapeNewlines(textareaStatusSuffix.value);

        clearTimeout(suffixDebounceTimer);

        suffixDebounceTimer = window.setTimeout(() => saveMetadataSTUM(), DEBOUNCE_MS);
    });

    cloneStatsBtn.addEventListener("click", async () => {
        const cloneResult = await clonePopup(char);

        if (!cloneResult) return;
    });

    deleteStatsBtn.addEventListener("click", async () => {
        if (await popupDeleteConfirm(`${char.name}'s status data`) === 0) return;

        const success = deleteCharStatus(char);

        if (success) {
            const refreshButton = document.createElement("div");
            refreshButton.title = "Re-create Status data";
            refreshButton.dataset.i18n = "Re-create Status data";
            refreshButton.classList.add("menu_button", "menu_button_icon", "fa-solid", "fa-arrows-rotate", "interactable");

            const refreshSpan = document.createElement("span");
            refreshSpan.dataset.i18n = `Re-create ${char.name}'s Status data`;
            refreshSpan.innerText = `Re-create ${char.name}'s Status data`;

            const refreshContainer = document.createElement("div");
            refreshContainer.classList.add("d-flex", "flex-wrap", "flex-center");
            refreshContainer.append(
                refreshButton,
                refreshSpan
            );

            refreshButton.addEventListener("click", () => {
                /**@type {HTMLDivElement}*/
                const newContainer = formStatusSingleChar(char);
                const nodesArray = Array.from(newContainer.childNodes);

                destroyElement(container.childNodes);

                container.append(...nodesArray);
            }, {once: true});

            destroyElement(container.childNodes);

            container.append(refreshContainer);
        }
    });

    // @ts-ignore
    $(content).sortable({
        items: '.stat-us-max-popup-row',
        delay: getSortableDelay(),
        handle: '.drag-handle',
        stop: async function (_event, _ui) {
            const forms = content.querySelectorAll("form");

            refreshCharEntryDisplay(char, forms);
        },
    });

    /** Add def rows */
    if (metadata.entries.length > 0) addRow({amount: metadata.entries.length, data: metadata.entries});

    return container;
}

export async function popupStatusSingleChar(char) {
    const container = await formStatusSingleChar(char);

    await callGenericPopup(container, POPUP_TYPE.TEXT, "", {
        okButton: t`Close Status`,
        allowVerticalScrolling: true,
        wide: true,
        onClose: async () => destroyElement(container)
    });

    fetchStatusDebounced({forceUIUpdate: true});
}

export async function popupStatusMultiChar(chars) {
    const content = document.createElement("div");
    content.id = "stat-us-max-popup-multi-char";

    for (const char of chars) {
        const charForm = await formStatusSingleChar(char);
        charForm.classList.add("multi-char-popup");
        content.append(charForm);
    }

    await callGenericPopup(content, POPUP_TYPE.TEXT, "", {
        okButton: t`Close Status`,
        allowVerticalScrolling: true,
        wide: true,
        onClose: async () => destroyElement(content)
    });

    fetchStatusDebounced({forceUIUpdate: true});
}
