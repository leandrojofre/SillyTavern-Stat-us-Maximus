import { eventSource, eventTypes, metadataName, log } from "../../index.js";

export {
    registerEvents
};

function onChatChanged() {
    log(eventTypes.CHAT_CHANGED);

    SillyTavern[metadataName].renderStatus();
}

function registerEvents() {
    eventSource.on(eventTypes.CHAT_CHANGED, onChatChanged);
}