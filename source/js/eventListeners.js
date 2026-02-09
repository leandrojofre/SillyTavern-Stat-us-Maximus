import { eventSource, eventTypes, metadataName, log } from "../../index.js";

// export {

// };

function onChatChanged() {
    log(eventTypes.CHAT_CHANGED);

    SillyTavern[metadataName].renderStatus();
}

export function registerEvents() {
    eventSource.on(eventTypes.CHAT_CHANGED, onChatChanged);
}