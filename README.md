# Stat-us Maximus
Have you ever wanted to keep track of your characters' status? Like...whatever you need. Here's the solution!
This extension adds a menu per character to have your notes, it is basically a shortcut for lorebooks (it even has a similar menu), but it gets saved per chat file and has a little more features than lorebooks.

**This is still in development! Please submit any bug you find and feature you want! Either as a GitHub issue or through the ST Discord.**

<img width="100%" alt="image" src="https://github.com/user-attachments/assets/7eca247f-5f52-49de-8e9e-ad983fe9e547" />
<img width="100%" alt="image" src="https://github.com/user-attachments/assets/75e2f304-ca02-4ed8-ae79-6f41f92586e2" />
<img width="100%" alt="image" src="https://github.com/user-attachments/assets/02eb098a-8174-4169-9bde-5c9608317e70" />

## Features

### Status
- When you open a chat, a status will be added for every character present (either now or in the past).
- A table with all of the character stats will be added in the last message of the character.
- The table can be collapsed to save space (the collapsed state saves).
- Every character status is sent to the chat in a dynamic depth that will adjust to be on top of the last character message.
- The status can be send as system, user or assistant - default system.
- With macros, you can set inputs in the chat UI to quick edit entries without opening menus.
- You can set swipes or alt values for each stat entry.
- You can copy and paste entries between characters from the popup Menu (truck button).

### Menus
**Magic wand button** - From the magic wand button (left to the input bar), you can open a popup menu to manage every character status.

**Character Management menu** - In single chats, you can open the status popup menu for the active chat character from the Character Management menu.

**Group Management menu** - In group chats, click the member avatar in the Current Members dropdown to open its status popup menu. You can also click the left button to open the popup menu for all active group members.

**All chats** - In all chats, click the pen icon at the corner of the status table, placed in the last message of each character, to open its popup menu. You can also open your personas popup from the Management menu; middle button for active persona, and right button for all personas with status data.

### Slash Commands
- `/stum-create-status` Creates Status data for the selected character, allows you to add data for non-present chat participants.
- `/stum-delete-status` Deletes Status data for the selected character.
- `/stum-create-entry` Creates an entry in the status of a character and returns its UID. If the character is not found in the metadata, it returns false.
- `/stum-get-entry-uid` Get an entry uid by pairing a Character status field against a value, returning the uid of the first match. If no match is found, an empty string is returned.
- `/stum-set-entry-field` Updates the value of the Status Entry field of a Character.
- `/stum-get-entry-field` Get the value of the Status Entry field of a Character. If no match is found, an empty string is returned.
- `/stum-delete-entry` Deletes an Status Entry from a Character.
- `/stum-switch-entry-value` Switches the entry value by one of the entry alt values.
- `/stum-create-alt-entry-value` Adds a new alt value to the selected entry. Returns the alt value uid.
- `/stum-get-alt-entry-uid` Get the UID of an alt entry value by pairing a field against a value, returning the uid of the first match. If no match is found, an empty string is returned.
- `/stum-set-alt-entry-field` Updates the field value of one of the Status Entry alt descriptions.
- `/stum-get-alt-entry-field` Get the field value of one of the alt entry values. If no match is found, an empty string is returned.
- `/stum-delete-alt-entry` Deletes an alt value within a status entry.
- `/stum-delete-chat-status` It will wipe all status stored in the chat metadata - only applies to open chat.
- `/stum-fill-missing-metadata` It will fill missing values in the metadata structure - WARN This is a dev command used for bug fixing, only use it if instructed to do so by a developer.

### Macros
- `{{name}}` Will be replaced with the name of the Status owner.
- `{{text}} | {{text::Your text here}}` In the chat UI, it will be replaced with a text input. This does not support newlines or curly braces `{}`.
- `{{number}} | {{number::1024}}` In the chat UI, it will be replaced with a number input. You need to use dots `.` for decimals, commas are not supported.
- `{{boolean}} | {{boolean::true::Custom true::Custom false}}` In the chat UI, it will be replaced with a checkbox. The first parameter is the state of the checkbox. By default, the macro will be replaced with `true` or `false`, but you can set a custom text to be displayed when the checkbox is on or off.
- `{{range::min::max::step::value}}` In the chat UI, it will be replaced with a range input, the same used in the samplers panel. `min` is the minimum value of the range, `max` is the maximum, `step` is the amount of numbers the input will increase/decrease when the buttons of the input are used, and `value` is the value the input will have. All parameters are `numbers`, and decimals only accept dots.

### Coming Soon
- [X] Slash commands for adding/updating/deleting status entries.
- [X] Slash command for switching between entries alt values.
- [X] Update ugly chat UI.
- [ ] Shade closed entry drawers in popup menus.
- [ ] Setting to disable confirm deletion popups.
- [ ] Setting for default status role.
- [X] Per-user open status-menu buttons.
- [X] Button to delete status metadata per character.
- [X] Expand/collapse all entries per character in popup menus.
- [X] Status transfer button in popup menus.
- [X] Status block prefix/suffix in popup menus.
- [ ] Custom depth buttons - dynamic depth if undefined.
- [X] Labels for input buttons in popup menus.
- [ ] Status templates in the extension settings menu.
- [ ] Turn entries into global entries.

## Installation
Install the extension using this link: ```https://github.com/leandrojofre/SillyTavern-Stat-us-Maximus.git```

### Compatibility
- This extension might not work with **kaldigo**'s Tracker.
- The same as above with **cierru**'s Stepped Thinking.
Is not that it **won't** because it probably does work, but the UI might get cluttered (I don't use those extensions and this was not tested with their UIs). Please, let me know if this work with those extensions to remove this warning.

## Support and Contributions
- My to-do list is overflowing, feel free to submit a PR with the feature you want! Make sure to read the **Contribution Rules**.

## Contribution Rules
- Always PR to the `staging` branch.
- Use the `staging` branch as the source of you working branch.
- Nothing else really, enjoy.
