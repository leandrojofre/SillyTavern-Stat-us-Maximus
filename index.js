// * MARK:Extension variables

const context = () => SillyTavern.getContext();

const {
    extensionSettings: extension_settings,
    saveSettingsDebounced
} = context();

const extensionFullName = 'SillyTavern-Stat-us-Maximus';
const extensionName = 'Stat-us-Max';
const extensionFolderPath = `scripts/extensions/third-party/${extensionFullName}`;
const extensionSettings = extension_settings[extensionFullName];
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

// ...

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
    const setting = target.getAttribute(`${extensionName.toLowerCase()}-setting`);
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

    const setting = target.getAttribute("stat-us-max-setting");
    const callback = settingsCallbacks[setting];

    extensionSettings[setting] = value;

    if (callback) callback();

    log("toggleSetting " + setting, value);
    saveSettingsDebounced();
}

/** Changes a number setting value and triggers a callback if there's any on settingsCallbacks. */
function settingsNumberButton(event) {
    const target = /** @type {HTMLInputElement} */ (event.target);
    const raw_value = isNaN(target.valueAsNumber) ? 0 : target.valueAsNumber;
    const insideMinBoundary = (target.min !== "") ? (Number(target.min) <= raw_value) : true;
    const insideMaxBoundary = (target.max !== "") ? (Number(target.max) >= raw_value) : true;

    let value = raw_value;

    if (!insideMinBoundary) value = Number(target.min);
    if (!insideMaxBoundary) value = Number(target.max);

    const setting = target.getAttribute("stat-us-max-setting");
    const callback = settingsCallbacks[setting];

    extensionSettings[setting] = value;

    if (callback) callback();

    log("toggleSetting " + setting, value);
    saveSettingsDebounced();
}

/**	Logs setting's values. */
function displaySettings() {
    debug(`Auto detect participants is ${extensionSettings.autoDetectParticipants ? "active" : "not active"}`);
    debug(`Always include unmuted group members is ${extensionSettings.alwaysIncludeUnmutedMembers ? "active" : "not active"}`);
    debug(`Auto save metadata is ${extensionSettings.autoSaveMetadata ? "active" : "not active"}`);
    debug(`Alternative behavior for macro template buttons is ${extensionSettings.altMacroTemplateBehavior ? "active" : "not active"}`);
    debug(`Show input macros in chat is ${extensionSettings.editNumbersFromChat ? "active" : "not active"}`);
    debug(`Hide input labels is ${extensionSettings.hideInputLabels ? "active" : "not active"}`);
    debug(`Show whitespaces is ${extensionSettings.showWhiteSpaces ? "active" : "not active"}`);
    debug(`Range input width is set to ${String(extensionSettings.rangeInputWidth)}`);
    debug(`Min prompt depth is set to ${String(extensionSettings.minPromptDepth)}`);

    debug(`Debug mode is ${extensionSettings.debug ? "active" : "not active"}`);
    debug(structuredClone(extensionSettings));
}

/** Append settings menu on ST and set listeners. */
async function loadSettingsMenu() {
    const settingsHtml = await HTML_TEMPLATES.get('settings');

    $('#extensions_settings2').append(settingsHtml);

    // Event Listeners for the extension HTML
    $(`#${extensionName.toLowerCase()}-auto-detect-participants`).on('input', settingsBooleanButton);
    $(`#${extensionName.toLowerCase()}-always-include-unmuted-members`).on('input', settingsBooleanButton);
    $(`#${extensionName.toLowerCase()}-auto-save-metadata`).on('input', settingsBooleanButton);
    $(`#${extensionName.toLowerCase()}-alt-macro-template-behavior`).on('input', settingsBooleanButton);
    $(`#${extensionName.toLowerCase()}-show-input-macros`).on('input', settingsBooleanButton);
    $(`#${extensionName.toLowerCase()}-hide-input-labels`).on('input', settingsBooleanButton);
    $(`#${extensionName.toLowerCase()}-show-white-spaces`).on('input', settingsBooleanButton);
    $(`#${extensionName.toLowerCase()}-range-input-width`).on('input', settingsTextButton);
    $(`#${extensionName.toLowerCase()}-min-prompt-depth`).on('input', settingsNumberButton);

    $(`#${extensionName.toLowerCase()}-debug`).on('input', settingsBooleanButton);
    $(`#${extensionName.toLowerCase()}-check-configuration`).on('click', displaySettings);

    log('loadSettingsMenu');
}

/** Init setting values on the menu */
function setSettings() {
    $(`#${extensionName.toLowerCase()}-auto-detect-participants`).prop('checked', extensionSettings.autoDetectParticipants);
    $(`#${extensionName.toLowerCase()}-always-include-unmuted-members`).prop('checked', extensionSettings.alwaysIncludeUnmutedMembers);
    $(`#${extensionName.toLowerCase()}-auto-save-metadata`).prop('checked', extensionSettings.autoSaveMetadata);
    $(`#${extensionName.toLowerCase()}-alt-macro-template-behavior`).prop('checked', extensionSettings.altMacroTemplateBehavior);
    $(`#${extensionName.toLowerCase()}-show-input-macros`).prop('checked', extensionSettings.editNumbersFromChat);
    $(`#${extensionName.toLowerCase()}-show-white-spaces`).prop('checked', extensionSettings.showWhiteSpaces);
    $(`#${extensionName.toLowerCase()}-hide-input-labels`).prop('checked', extensionSettings.hideInputLabels).trigger('input');
    $(`#${extensionName.toLowerCase()}-range-input-width`).val(extensionSettings.rangeInputWidth).trigger('input');
    $(`#${extensionName.toLowerCase()}-min-prompt-depth`).val(extensionSettings.minPromptDepth);

    $(`#${extensionName.toLowerCase()}-debug`).prop('checked', extensionSettings.debug).trigger('input');

    log('setSettings', extensionSettings);
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
    setSettings();
});