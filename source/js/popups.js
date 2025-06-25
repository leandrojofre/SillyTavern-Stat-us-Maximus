import { characters, extension_prompt_roles } from "../../../../../../script.js";
import { saveMetadataDebounced } from "../../../../../extensions.js";
import { t } from "../../../../../i18n.js";
import { callGenericPopup, POPUP_TYPE } from "../../../../../popup.js";
import { log, destroyElement } from "../../index.js";
import { getCharStatus, addCharEntry, removeCharEntry, addCharAltValue, updateCharEntry, getCharAltValue, getCharEntry, removeCharAltValue } from "./statusControls.js";

function escapeNewlines(str) {
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
    delete_title.textContent = t`Are you sure want to delete ${del_name}?`;

    const delete_container = document.createElement("div");
    delete_container.classList.add("d-flex", "flex-center", "w-100", "mb-5px");
    delete_container.append(delete_title);

    return await callGenericPopup(delete_container, POPUP_TYPE.CONFIRM, "", {
        okButton: t`Confirm`,
        cancelButton: t`Cancel`,
        onClose: () => destroyElement(delete_container)
    });
};

async function formStatusSingleChar(char) {
    const metadata = getCharStatus(char);

    // @ts-ignore
    if (!metadata) return toastr.error(t`No metadata was found for the character -${char?.name}-`);

    /*
        Missing
        - [X] Select for alt_values
        - [X] Add for alt_values
        - [X] Delete for alt_values
        - [X] Nick for alt_values
        - [X] Disable row btn
        - [X] Role button
        - [X] Confirm screen for delete
        - [ ] Setting to disable ask
        - [ ] Wrappers for the whole stat block - only added if there are entries
    */

    /** Create Popup container and title. */
    const title = document.createElement("div");
    title.textContent = t`Add an status to ${char.name}`;

    const selectEntryRole = document.createElement("select");
    selectEntryRole.classList.add("flex-grow-1", "px-5px", "m-0", "mw-15");

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

    const textareaStatusSeparator = document.createElement("input");
    textareaStatusSeparator.type = "text";
    textareaStatusSeparator.placeholder = t`Entries separator...`;
    textareaStatusSeparator.value = escapeNewlines(metadata.separator);
    textareaStatusSeparator.classList.add("text_pole", "mw-15");

    const newStatBtn = document.createElement("div");
    newStatBtn.id = "stat-us-max-new-btn-" + metadata.last_mes_id;
    newStatBtn.classList.add("menu_button", "menu_button_icon", "fa-solid", "fa-plus", "interactable");

    const wrapper = document.createElement("div");
    wrapper.classList.add("d-flex", "flex-center", "w-100", "mb-5px");
    wrapper.append(title, selectEntryRole, textareaStatusSeparator, newStatBtn);

    /** Create input template */
    /** - Key */
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
    textareaKey.type = "text";
    textareaKey.name = "key";
    textareaKey.placeholder = t`Status title...`;
    textareaKey.classList.add("text_pole");

    const textareaSeparator = document.createElement("input");
    textareaSeparator.type = "text";
    textareaSeparator.name = "entry_separator";
    textareaSeparator.placeholder = t`Title/value separator...`;
    textareaSeparator.classList.add("text_pole", "mw-25", "m-0");

    const deleteStatRowBtn = document.createElement("div");
    deleteStatRowBtn.classList.add("menu_button", "fa-fw", "fa-solid", "fa-trash-can", "redWarningBG", "interactable", "delete-row", "big-button");

    const drawerHeader = document.createElement("div");
    drawerHeader.classList.add("inline-drawer-header", "key", "w-100", "d-flex", "flex-center", "p-0");
    drawerHeader.append(drawerToggle, enableRowToggle, enableRowBtn, textareaKey, textareaSeparator, deleteStatRowBtn);

    /** - Value */
    const selectAltValues = document.createElement("select");
    selectAltValues.name = "value_uid";
    selectAltValues.classList.add("flex-grow-1", "px-5px", "m-0", "mw-25");

    const textareaAltKey = document.createElement("input");
    textareaAltKey.type = "text";
    textareaAltKey.name = "alt_key";
    textareaAltKey.placeholder = t`Alt description title...`;
    textareaAltKey.classList.add("text_pole", "mw-25", "m-0");

    const warningAltKey = document.createElement("i");
    warningAltKey.classList.add("fa-solid", "fa-circle-exclamation", "interactable");
    warningAltKey.title = "This is not used in the prompt";
    warningAltKey.dataset.i18n = "This is not used in the prompt";

    const refreshAltValuesBtn = document.createElement("div");
    refreshAltValuesBtn.title = "Refresh the titles of the select";
    refreshAltValuesBtn.dataset.i18n = "Refresh the titles of the select";
    refreshAltValuesBtn.classList.add("menu_button", "menu_button_icon", "fa-solid", "fa-arrows-rotate", "interactable", "refresh_alt_value", "big-button");

    const addAltValues = document.createElement("div");
    addAltValues.title = "Add alt descriptions";
    addAltValues.dataset.i18n = "Add alt descriptions";
    addAltValues.classList.add("menu_button", "menu_button_icon", "fa-solid", "fa-plus", "interactable", "add_alt_value", "big-button");

    const delAltValues = document.createElement("div");
    delAltValues.title = "Delete current alt description";
    delAltValues.dataset.i18n = "Delete current alt description";
    delAltValues.classList.add("menu_button", "fa-fw", "fa-solid", "fa-trash-can", "redWarningBG", "interactable", "del_alt_value", "big-button");

    const settingsInputs = document.createElement("div");
    settingsInputs.classList.add("d-flex", "flex-center-start");
    settingsInputs.append(selectAltValues, textareaAltKey, warningAltKey, refreshAltValuesBtn, addAltValues, delAltValues);

    const textareaValue = document.createElement("textarea");
    textareaValue.name = "value";
    textareaValue.placeholder = t`Status description...`;
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

    /** Assemble Popup */
    const content = document.createElement("div");
    content.id = "stat-us-max-popup-form-" + metadata.last_mes_id;
    content.classList.add("d-flex", "flex-col", "gap-5px", "py-5px");

    const container = document.createElement("div");
    container.id = "stat-us-max-popup-" + metadata.last_mes_id;
    container.classList.add("stat-us-max-popup", "border");
    container.append(wrapper, content);

    /** Add listeners */
    const DEBOUNCE_MS = 400;
    let debounceTimer;
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

            newRow.id = `stat-us-max-popup-form-${data[i].uid}`;
            newRow.dataset.uid = data[i].uid;
            newRow.removeAttribute('action');

            // Set Values
            el(newRow, 'input[name="key"]').value = data[i].key;
            el(newRow, 'input[name="entry_separator"]').value = escapeNewlines(data[i].separator);
            el(newRow, 'textarea[name="value"]').value = data[i].value;
            el(newRow, 'input[name="enabled"]').value = data[i].enabled;
            refreshAltValues(newRow, data[i].alt_values, data[i].value_uid);
            el(newRow, 'select[name="value_uid"]').value = String(data[i].value_uid);
            el(newRow, 'input[name="alt_key"]').value = data[i].alt_values[data[i].value_uid].key;

            if (!data[i].enabled) toggleSwitch(el(newRow, ".kill-switch"));

            // Add listeners
            newRow.addEventListener("submit", (e) => {
                e.preventDefault();

                const formData = new FormData(newRow);

                updateCharEntry(char, data[i].uid, formData);
            });

            newRow.addEventListener("input", () => {
                clearTimeout(debounceTimer);

                debounceTimer = window.setTimeout(() => {
                    newRow.requestSubmit();
                }, DEBOUNCE_MS);
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

            el(newRow, ".refresh_alt_value").addEventListener("click", () => {
                refreshAltValues(
                    newRow,
                    getCharEntry(char, data[i].uid).alt_values,
                    el(newRow, 'select[name="value_uid"]').value
                );
            });

            el(newRow, ".add_alt_value").addEventListener("click", () => {
                const newAlt = addCharAltValue(char, data[i].uid);

                refreshAltValues(newRow, getCharEntry(char, data[i].uid).alt_values, newAlt.uid);

                el(newRow, 'select[name="value_uid"]').value = String(newAlt.uid);
                el(newRow, 'select[name="value_uid"]').dispatchEvent(evChange);
            });

            el(newRow, ".del_alt_value").addEventListener("click", async () => {
                if (await popupDeleteConfirm("the alt value") === 0) return;

                try {
                    const new_alts = removeCharAltValue(char, data[i].uid, el(newRow, 'select[name="value_uid"]').value);

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

    newStatBtn.addEventListener("click", () => {
        const newEntry = addCharEntry(char, "", "");
        addRow({data: [newEntry]});
    });

    selectEntryRole.addEventListener("input", () => {
        metadata.role = Number(selectEntryRole.value);

        saveMetadataDebounced();
    });

    textareaStatusSeparator.addEventListener("input", () => {
        metadata.separator = un_escapeNewlines(textareaStatusSeparator.value);

        debounceTimer = window.setTimeout(() => {
            saveMetadataDebounced();
        }, DEBOUNCE_MS);
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
}

export async function popupStatusMultiChar(chars) {
    const content = document.createElement("div");
    content.id = "stat-us-max-popup-multi-char";

    for (const char of chars) {
        const charForm = await formStatusSingleChar(char);

        content.append(charForm);
    }

    await callGenericPopup(content, POPUP_TYPE.TEXT, "", {
        okButton: t`Close Status`,
        allowVerticalScrolling: true,
        wide: true,
        onClose: async () => destroyElement(content)
    });
}
