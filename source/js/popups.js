import { lodash } from "../../../../../../lib.js";
import { copyText } from "../../../../../utils.js";
import { characters, extension_prompt_roles, getThumbnailUrl } from "../../../../../../script.js";
import { t } from "../../../../../i18n.js";
import { callGenericPopup, POPUP_TYPE } from "../../../../../popup.js";
import { power_user } from "../../../../../power-user.js";
import { getSortableDelay } from "../../../../../utils.js";
import { destroyElement, fetchStatusDebounced, extensionSettings, setSaveStateFlag } from "../../index.js";
import { getCharStatus, addCharEntry, removeCharEntry, addCharAltValue, getCharEntry, removeCharAltValue, refreshCharEntryDisplay, createCharStatus, transferCharStatus, deleteCharStatus, parseValue, updateCharEntry, getCharAltValue, flushCharAltValues, updateCharAltValue, evaluateEntry } from "./statusControls.js";

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

async function popupConfirmAction(del_name = "this") {
    const confirm_title = document.createElement("div");
    confirm_title.textContent = t`WARNING`;
    confirm_title.classList.add("fw-bolder");

    const confirm_text = document.createElement("div");
    confirm_text.textContent = t`Are you sure want to ${del_name}?`;

    const confirm_container = document.createElement("div");
    confirm_container.classList.add("d-flex", "flex-col", "flex-center", "w-100", "mb-5px", "gap-5px");
    confirm_container.append(confirm_title, confirm_text);

    const confirm_css_block = document.createElement("div");
    confirm_css_block.classList.add("stat-us-max-custom-css");
    confirm_css_block.append(confirm_container);

    return await callGenericPopup(confirm_css_block, POPUP_TYPE.CONFIRM, "", {
        okButton: t`Confirm`,
        cancelButton: t`Cancel`,
        onClose: () => destroyElement(confirm_css_block)
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

function getFullCharAvatar(status) {
    return getThumbnailUrl(status.is_user ? "persona" : "avatar", status.avatar);
}

/**
 * @param {HTMLElement} target
 * @param {string} class_name
 * @returns {any}
 */
function el(target, class_name) {
    return target.querySelector(class_name);
}

/**
 * @param {HTMLElement} parent
 * @param {string} selector
 * @param {boolean?} forceState
 * @returns {boolean}
 */
function toggleSwitch(parent, selector, forceState = null) {
    // True if the final state is on
    /** @type {HTMLElement} */
    const elem = el(parent, selector);
    const isOn = forceState === null ? !elem.classList.contains("fa-toggle-on") : forceState;
    elem.classList.toggle("fa-toggle-on", isOn);
    elem.classList.toggle("fa-toggle-off", !isOn);
    return isOn;
};

function refreshAltValues(target, alts, select_uid = 0) {
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

/**
 * Add a new entry row to the active status popup block
 * @param {object} options
 * @param {object[]} options.data
 * @param {HTMLElement} options.container
 * @param {HTMLElement} options.template
 * @param {object} options.char
 * @returns void
 */
function addStatusRow({data = [], container, template, char}) {
    for (const entryData of data) {
        let entry = getCharEntry(char, entryData.uid);
        const newRow = /** @type {HTMLFormElement} */ (template.cloneNode(true));

        // @ts-ignore
        if (!entry) return toastr.warning(t`Data for new entry is empty - index=${i}`);

        newRow.dataset.uid = String(entry.uid);
        newRow.dataset.charAvatar = char.avatar;
        newRow.dataset.modified = String(false);
        newRow.removeAttribute('action');

        // Set Values
        const inputEntryEnabled = /** @type {HTMLInputElement} */ (newRow.querySelector('input[name="enabled"]'));
        inputEntryEnabled.value = String(entry.enabled);

        const inputKey = /** @type {HTMLInputElement} */ (newRow.querySelector('input[name="key"]'));
        inputKey.value = entry.key;

        const textareaValue = /** @type {HTMLTextAreaElement} */ (newRow.querySelector('textarea[name="value"]'));
        textareaValue.value = entry.value;

        const inputSeparator = /** @type {HTMLInputElement} */ (newRow.querySelector('input[name="separator"]'));
        inputSeparator.value = escapeNewlines(entry.separator);

        const selectAltValues = /** @type {HTMLSelectElement} */ (newRow.querySelector('select[name="value_uid"]'));
        selectAltValues.value = String(entry.value_uid);
        selectAltValues.dataset.prevValue = String(entry.value_uid);
        refreshAltValues(newRow, entry.alt_values, entry.value_uid);

        const inputAltKey = /** @type {HTMLInputElement} */ (newRow.querySelector('input[name="alt_key"]'));
        inputAltKey.value = entry.alt_values.find(alt => alt.uid === entry.value_uid).key;

        if (!entry.enabled) toggleSwitch(newRow, ".kill-switch");

        // Add listeners
        newRow.addEventListener("input", function() {
            newRow.dataset.modified = String(true);
        }, { passive: true });

        newRow.querySelector(".kill-switch").addEventListener("click", function () {
            const newState = toggleSwitch(newRow, ".kill-switch");
            inputEntryEnabled.value = String(newState);
            newRow.dataset.modified = String(true);
        }, { passive: true });

        selectAltValues.addEventListener("change", function () {
            const newValue = selectAltValues.value;

            selectAltValues.value = selectAltValues.dataset.prevValue;
            updateCharEntry(char, entry.uid, new FormData(newRow), false);

            selectAltValues.value = newValue;
            selectAltValues.dataset.prevValue = newValue;
            const alt = getCharAltValue(char, entry.uid, selectAltValues.value);

            inputAltKey.value = alt.key;
            textareaValue.value = alt.value;
        }, { passive: true });

        inputAltKey.addEventListener("input", function () {
            /** @type {HTMLOptionElement} */
            const optionInDisplay = selectAltValues.querySelector(`option[value="${selectAltValues.value}"]`);
            optionInDisplay.text = inputAltKey.value;
        }, { passive: true });

        newRow.querySelector(".add_alt_value").addEventListener("click", function () {
            updateCharEntry(char, entry.uid, new FormData(newRow), false);

            const newAlt = addCharAltValue(char, entry.uid);

            if (!newAlt) return;

            refreshAltValues(newRow, entry.alt_values, newAlt.uid);
            selectAltValues.value = String(newAlt.uid);
            selectAltValues.dispatchEvent(evChange);
        }, { passive: true });

        newRow.querySelector(".del_alt_value").addEventListener("click", async function () {
            if (await popupConfirmAction("delete the alt value") === 0) return;

            try {
                updateCharEntry(char, entry.uid, new FormData(newRow), false);

                const success = removeCharAltValue(char, entry.uid, selectAltValues.value);

                if (!success) return;

                entry = getCharEntry(char, entry.uid);
                const firstAlt = entry.alt_values[0];

                refreshAltValues(newRow, entry.alt_values, firstAlt.uid);
                selectAltValues.value = String(firstAlt.uid);
                selectAltValues.dataset.prevValue = String(firstAlt.uid);
                inputAltKey.value = firstAlt.key;
                textareaValue.value = firstAlt.value;
            } catch (error) {
                // ...
            }
        }, { passive: true });

        newRow.querySelector(".menu_button.import").addEventListener("click", async function() {
            if (await popupConfirmAction("overwrite the data of this entry") === 0) return;

            let newEntry;

            if (!navigator.clipboard)
                return toastr.warning(t`Clipboard API not available in this context.`);

            try {
                newEntry = await navigator.clipboard.readText();
                newEntry = JSON.parse(newEntry);
            } catch (error) {
                console.error('Error reading clipboard:', error);
                return toastr.warning(t`Failed to read clipboard text. Make sure you granted permissions and the text is a JSON object.`);
            }

            if (!newEntry) return toastr.warning(t`Your clipboard has wrong metadata format: JSON expected`);
            if (!evaluateEntry(newEntry)) return;

            const newSelect = {
                value_uid: false,
                alt_values: []
            };

            for (const [k, v] of Object.entries(newEntry)) {
                if (k === "display_position" || k === "uid") continue;

                if (k === "alt_values" || k === "value_uid") {
                    newSelect[k] = v;
                    continue;
                }

                /** @type {HTMLInputElement|HTMLSelectElement|HTMLTextAreaElement} */
                const input = newRow.querySelector(`[name="${k}"]`);
                input.value = String(v);
            }

            flushCharAltValues(char, entry.uid, true);

            entry = getCharEntry(char, entry.uid);

            const formDataFirstEntry = new FormData();
            formDataFirstEntry.set("key", newSelect.alt_values[0].key);
            formDataFirstEntry.set("value", newSelect.alt_values[0].value);
            updateCharAltValue(char, entry.uid, entry.alt_values[0].uid, formDataFirstEntry);

            for (const alt of newSelect.alt_values.slice(1))
                addCharAltValue(char, entry.uid, {value: alt.value, key: alt.key});

            entry = getCharEntry(char, entry.uid);

            newSelect.value_uid = entry.value_uid;
            newSelect.alt_values = entry.alt_values;
            const selectedAlt = newSelect.alt_values.find(alt => alt.uid === newSelect.value_uid);

            toggleSwitch(newRow, ".kill-switch", newEntry.enabled);
            refreshAltValues(newRow, newSelect.alt_values, selectedAlt.uid);
            selectAltValues.value = String(selectedAlt.uid);
            selectAltValues.dataset.prevValue = String(selectedAlt.uid);
            inputAltKey.value = String(selectedAlt.key);

            updateCharEntry(char, entry.uid, new FormData(newRow), false);
        }, { passive: true });

        newRow.querySelector(".menu_button.export").addEventListener("click", async function() {
            const currentEntry = getCharEntry(char, entry.uid);

            await exportObjectToClipboard(currentEntry);
        }, { passive: true });

        newRow.querySelectorAll(".macro_template").forEach((/**@type {HTMLDivElement}*/btn) => {
            btn.addEventListener("click", async (e) => {
                const macroType = /**@type {HTMLDivElement}*/(e.currentTarget).dataset.macroType;
                let macroTemplate = "";

                if (macroType === "text") macroTemplate = "{{text}}";
                if (macroType === "number") macroTemplate = "{{number}}";
                if (macroType === "boolean") macroTemplate = "{{boolean::true::true::false}}";
                if (macroType === "range") macroTemplate = "{{range::0::100::1::0}}";

                if (extensionSettings.altMacroTemplateBehavior) textareaValue.value += macroTemplate;
                else await copyText(macroTemplate);
            }, { passive: true });
        });

        newRow.querySelector(".delete-row").addEventListener("click", async function () {
            if (await popupConfirmAction("delete the alt value") === 0) return;

            removeCharEntry(char, entry.uid);
            destroyElement(newRow);
        }, { passive: true });

        container.append(newRow);
    }
}

/**
 * @returns {HTMLElement}
 */
export function getCharStatusForm(char) {
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

    /**
     * Creates a button element with specified classes and title.
     * @param {string} title - The title and data-i18n attribute for the button
     * @param {string[]} classes - Array of class names to add to the button
     * @param {object} data - Additional data attributes to set on the button
     * @returns {HTMLDivElement} The created button element
     */
    const createButton = function(title, classes, data) {
        const button = document.createElement("div");
        button.title = title;
        button.dataset.i18n = title;
        button.classList.add("menu_button", "menu_button_icon", "fa-fw", "fa-solid", "interactable", "m-0", ...classes);

        for (const [key, value] of Object.entries(data || {}))
            button.dataset[key] = value;

        return button;
    };

    /**
     * Creates a button element with specified classes and title.
     * @param {HTMLElement[]?} elements - The title and data-i18n attribute for the button
     * @param {string[]?} classes - Array of class names to add to the button
     * @param {object?} data - Additional data attributes to set on the button
     * @param {string?} element_type - Type of the HTML element to create
     * @returns {HTMLElement} The created button element
     */
    const createRowWrapper = (elements = [], classes = [], data = {}, element_type = "div") => {
        const row = document.createElement(element_type);
        row.classList.add("d-flex", ...classes);

        for (const [key, value] of Object.entries(data))
            row.dataset[key] = value;

        for (const elem of elements)
            row.append(elem);

        return row;
    };

    const escapedCharName = lodash.escape(char.name);

    /** Create Menu header. */
    const charName = document.createElement("span");
    charName.innerText = escapedCharName;
    charName.classList.add("popup-char-name", "text-quote");

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

    const deleteStatsBtn = createButton("Delete character's Status", ["fa-trash-can", "redWarningBG"]);
    const cloneStatsBtn = createButton("Clone Status entry into a chat participant", ["fa-truck-arrow-right"]);
    const expandEntriesBtn = createButton("Expand all entries", ["fa-expand"]);
    const compressEntriesBtn = createButton("Compress all entries", ["fa-compress"]);
    const newStatBtn = createButton(`Add an status to ${escapedCharName}`, ["fa-plus"]);

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

    const textareaValue = document.createElement("textarea");
    textareaValue.name = "value";
    textareaValue.placeholder = t`Entry description...`;
    textareaValue.classList.add("text_pole", "m-0");

    /** - Key/Value Block */
    const entryBodyToolButtons = createRowWrapper([
        warningAltKey,
        createButton("Add alt descriptions", ["big-button", "fa-plus", "add_alt_value"]),
        createButton("Delete current alt description", ["big-button", "fa-trash-can", "del_alt_value", "redWarningBG"]),
        createButton("Import entry from clipboard", ["big-button", "fa-arrow-right-to-file", "import", "px-5px"]),
        createButton("Export entry from clipboard", ["big-button", "fa-arrow-right-from-file", "export", "px-5px"]),
        createButton("Add template for text macro", ["big-button", "fa-t", "macro_template", "px-5px"], {macroType: "text"}),
        createButton("Add template for number macro", ["big-button", "fa-n", "macro_template", "px-5px"], {macroType: "number"}),
        createButton("Add template for boolean macro", ["big-button", "fa-b", "macro_template", "px-5px"], {macroType: "boolean"}),
        createButton("Add template for range macro", ["big-button", "fa-r", "macro_template", "px-5px"], {macroType: "range"}),
    ], ["flex-center-start", "buttons-wrapper"]);

    const entryBodyToolbar = createRowWrapper([
        createInputLabel(selectAltValues, "mw-25"),
        createInputLabel(textareaAltKey, "mw-25"),
        entryBodyToolButtons
    ], ["flex-end-start"])

    const drawerContent = document.createElement("div");
    drawerContent.classList.add("inline-drawer-content", "value", "w-100", "p-0", "mb-5px");
    drawerContent.append(
        createRowWrapper([
            entryBodyToolbar,
            textareaValue
        ], ["flex-col"])
    );

    const formRow = document.createElement("form");
    formRow.classList.add("stat-us-max-popup-row", "d-flex", "flex-col", "inline-drawer");
    formRow.append(
        createRowWrapper([ // Drawer Header
            dragHandle,
            drawerToggle,
            enableRowToggle,
            enableRowBtn,
            textareaKey,
            textareaSeparator,
            deleteStatRowBtn
        ], ["inline-drawer-header", "key", "w-100", "flex-center", "p-0"]),
        drawerContent // Drawer Body
    );

    /** Create Menu container and assemble Menu */
    const statusHeaderButtons = createRowWrapper([
        deleteStatsBtn,
        cloneStatsBtn,
        expandEntriesBtn,
        compressEntriesBtn,
        newStatBtn
    ], ["gap-5px", "flex-center-start", "buttons-wrapper"]);

    const statusHeaderInputs = createRowWrapper([
        createInputLabel(selectEntryRole),
        createInputLabel(numberAreaForDepth),
        createInputLabel(textareaStatusSeparator),
        createInputLabel(textareaDefEntrySeparator),
        createInputLabel(textareaStatusPrefix),
        createInputLabel(textareaStatusSuffix),
        statusHeaderButtons
    ], ["flex-end-start", "w-100", "gap-5px", "stat-wrapper"], {modified: false, charAvatar: char.avatar}, "form");

    const statusHeaderForm = createRowWrapper([
        avatarContainer,
        statusHeaderInputs
    ], ["flex-center-start", "w-100", "py-5px"]);

    const statusHeader = createRowWrapper([
        charName,
        statusHeaderForm
    ], ["flex-col", "flex-start-center", "gap-5px"]);

    const content = createRowWrapper(undefined, ["flex-col", "gap-5px", "pt-5px"]);
    const container = createRowWrapper([
        statusHeader,
        content
    ], ["stat-us-max-popup", "flex-col"], {char: metadata.avatar, isUser: metadata.is_user});

    /** Add listeners */
    expandEntriesBtn.addEventListener("click", () =>
        content.querySelectorAll(".inline-drawer-toggle.down").forEach((/**@type {HTMLElement}*/toggle) => toggle.click())
    , { passive: true });

    compressEntriesBtn.addEventListener("click", () =>
        content.querySelectorAll(".inline-drawer-toggle.up").forEach((/**@type {HTMLElement}*/toggle) => toggle.click())
    , { passive: true });

    newStatBtn.addEventListener("click", () => {
        const newEntry = addCharEntry(char, "", "");
        addStatusRow({
            data: [newEntry],
            container: content,
            template: formRow,
            char: char
        });
    }, { passive: true });

    selectEntryRole.addEventListener("change", () => {
        metadata.role = Number(selectEntryRole.value);
        statusHeaderInputs.dataset.modified = String(true);
    }, { passive: true });

    numberAreaForDepth.addEventListener("input", () => {
        metadata.forceDepth = parseValue(numberAreaForDepth.value);
        statusHeaderInputs.dataset.modified = String(true);
    }, { passive: true });

    textareaStatusSeparator.addEventListener("input", () => {
        metadata.separator = un_escapeNewlines(textareaStatusSeparator.value);
        statusHeaderInputs.dataset.modified = String(true);
    }, { passive: true });

    textareaDefEntrySeparator.addEventListener("input", () => {
        metadata.def_entry_separator = un_escapeNewlines(textareaDefEntrySeparator.value);
        statusHeaderInputs.dataset.modified = String(true);
    }, { passive: true });

    textareaStatusPrefix.addEventListener("input", () => {
        metadata.prefix = un_escapeNewlines(textareaStatusPrefix.value);
        statusHeaderInputs.dataset.modified = String(true);
    }, { passive: true });

    textareaStatusSuffix.addEventListener("input", () => {
        metadata.suffix = un_escapeNewlines(textareaStatusSuffix.value);
        statusHeaderInputs.dataset.modified = String(true);
    }, { passive: true });

    cloneStatsBtn.addEventListener("click", async () => {
        const cloneResult = await clonePopup(char);

        if (!cloneResult) return;
    }, { passive: true });

    deleteStatsBtn.addEventListener("click", async () => {
        if (await popupConfirmAction(`delete ${char.name}'s status data`) === 0) return;

        const success = deleteCharStatus(char);

        if (success) {
            const refreshButton = document.createElement("div");
            refreshButton.title = "Re-create Status data";
            refreshButton.dataset.i18n = "Re-create Status data";
            refreshButton.classList.add("menu_button", "menu_button_icon", "fa-solid", "fa-arrows-rotate", "interactable");

            const refreshSpan = document.createElement("span");
            refreshSpan.dataset.i18n = `Re-create ${escapedCharName}'s Status data`;
            refreshSpan.innerText = `Re-create ${escapedCharName}'s Status data`;

            const refreshContainer = document.createElement("div");
            refreshContainer.classList.add("d-flex", "flex-wrap", "flex-center");
            refreshContainer.append(
                refreshButton,
                refreshSpan
            );

            refreshButton.addEventListener("click", () => {
                /**@type {HTMLElement}*/
                const newContainer = getCharStatusForm(char);
                const nodesArray = Array.from(newContainer.childNodes);

                destroyElement(container.childNodes);

                container.append(...nodesArray);
            }, { once: true, passive: true });

            destroyElement(container.childNodes);

            container.append(refreshContainer);
        }
    }, { passive: true });

    /** Add def rows */
    if (metadata.entries.length > 0) addStatusRow({
        data: metadata.entries,
        container: content,
        template: formRow,
        char: char
    });

    // @ts-ignore
    $(content).sortable({
        items: '.stat-us-max-popup-row',
        delay: getSortableDelay(),
        handle: '.drag-handle',
        stop: function (_event, _ui) {
            const forms = content.querySelectorAll("form");

            refreshCharEntryDisplay(char, forms);
        },
    });

    return container;
}

export async function popupStatusSingleChar(char) {
    const charForm = await getCharStatusForm(char);

    if (!charForm) return;

    await callGenericPopup(charForm, POPUP_TYPE.TEXT, "", {
        okButton: t`Close Status`,
        allowVerticalScrolling: true,
        wide: true,
        onClose: async () => {
            const forms = charForm.querySelectorAll('form');

            for (const form of forms)
                if (String(form.dataset.modified) === "true")
                    updateCharEntry(char, form.dataset.uid, new FormData(form), false);

            destroyElement(charForm);
        }
    });

    fetchStatusDebounced({forceUIUpdate: true});
}

/**
 * @param {object[]} chars
 */
export async function popupStatusMultiChar(chars) {
    const content = document.createElement("div");
    content.id = "stat-us-max-popup-multi-char";

    for (const char of chars) {
        const charForm = await getCharStatusForm(char);

        if (!charForm) continue;

        charForm.classList.add("multi-char-popup");
        content.append(charForm);
    }

    await callGenericPopup(content, POPUP_TYPE.TEXT, "", {
        okButton: t`Close Status`,
        allowVerticalScrolling: true,
        wide: true,
        onClose: async () => {
            const forms = content.querySelectorAll('form');
            let headerInputsModified = false;

            for (const form of forms) {
                const char = chars.find(char => char.avatar === form.dataset.charAvatar);

                if (!char) continue;
                if (String(form.dataset.modified) === "false") continue;

                if (form.classList.contains("stat-us-max-popup-row"))
                    updateCharEntry(char, form.dataset.uid, new FormData(form), false);

                if (form.classList.contains("stat-wrapper"))
                    headerInputsModified = true;
            }

            if (headerInputsModified) {
                setSaveStateFlag(extensionSettings.autoSaveMetadata);

                if (extensionSettings.autoSaveMetadata) SillyTavern.getContext().saveChat();
            }

            destroyElement(content);
        }
    });

    fetchStatusDebounced({forceUIUpdate: true});
}
