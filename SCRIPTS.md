## Scripting
This section will feature developer made scripts for SillyTavern, as well as any useful script the community may share.
This is not a tutorial on STScript. If you want to understant concepts relevant to Quick Replies, check out SillyTavern's official docs page: https://docs.sillytavern.app/usage/st-script/

For the sake of making sense in the examples, assume every Script is saved as its own Quick Reply, and they're all saved in the Quick Reply Set: `Stat-us-Max`

The format for each Srcript is:
- Script title: `quick_reply_label` - Description of the code.

### Create Data - v1.0
These scripts will allow you to create your own templates for your chats using as few lines of code as possible.
- Requirements:
  - LaLib - https://github.com/LenAnderson/SillyTavern-LALib [LenAnderson]<br><br>

| Title | QR Label | Description |
| :---: | :---: | :---: |
| Create block data | `create_status` | This will create the base layout of a status block, setting up the wrapping format of the entries, as well as their title/description default separator. You can edit everything here as you please. |

```Python
/stum-create-status char="{{arg::char}}" |

/stum-set-status-field char="{{arg::char}}" field=def_entry_separator ": " |
/stum-set-status-field char="{{arg::char}}" field=prefix "<Status name=\"{{name}}\">\n# {{name}}\n" |
/stum-set-status-field char="{{arg::char}}" field=suffix "\n</Status>"
```
<br><br>
| Title | QR Label | Description |
| :---: | :---: | :---: |
| Create entry data | `create_entry` | This will allow you to create a full status entry using a single line of code, including alternative values. |

```Python
/stum-get-entry-uid char="{{arg::char}}" field=key "{{arg::title}}" |

/if left="{{pipe}}" rule=neq right="" else={:
	/stum-create-entry char="{{arg::char}}" |
	/let key=entry_uid {{pipe}} |
	
	/let key=enabled {{arg::enabled}} |
	/if left="{{var::enabled}}" rule=eq right="" {: /var key=enabled "true" :} |
	
	/stum-set-entry-field char="{{arg::char}}" uid="{{var::entry_uid}}" field=enabled "{{var::enabled}}" |
	/stum-set-entry-field char="{{arg::char}}" uid="{{var::entry_uid}}" field=key "{{arg::title}}" |
	/stum-set-entry-field char="{{arg::char}}" uid="{{var::entry_uid}}" field=value "{{arg::value}}" |	
	/stum-set-alt-entry-field char="{{arg::char}}" uid="{{var::entry_uid}}" altuid="0" field=key "{{arg::alt_title}}" |
	
	/if left="{{arg::separator}}" rule=neq right="" {:
		/re-replace find="/\$/" replace="" "{{arg::separator}}" |
		/stum-set-entry-field char="{{arg::char}}" uid="{{var::entry_uid}}" field=separator "{{pipe}}"
	:} |
	
	/if left="{{arg::alt_values}}" rule=not else={:
		/foreach {{arg::alt_values}} {: alt_value=
			/getat index="title" {{var::alt_value}} |
			/let key=a_title {{pipe}} |
			
			/getat index="value" {{var::alt_value}} |
			/let key=a_value {{pipe}} |
		
			/stum-create-alt-entry-value char="{{arg::char}}" uid="{{var::entry_uid}}" key="{{var::a_title}}" "{{var::a_value}}" |
		:}
	:}
:}
```
<br><br>
**Usage Example** - Here we will create the template for a car, because why not.
