## Scripting
This section will feature developer made scripts for SillyTavern, as well as any useful script the community may share.
This is not a tutorial on STScript. If you want to understant concepts relevant to Quick Replies, check out SillyTavern's official docs page: https://docs.sillytavern.app/usage/st-script/

For the sake of making sense in the examples, assume every Script is saved as its own Quick Reply, and they're all saved in the Quick Reply Set: `Stat-us-Max`

### Create Data - v1.0
These scripts will allow you to create your own templates for your chats using as few lines of code as possible.
- Requirements:
  - LaLib - https://github.com/LenAnderson/SillyTavern-LALib [LenAnderson]<br><br>

| Title | QR Label | Description |
| :---: | :---: | :---: |
| Create block data | `create_status` | This will create the base layout of a status block, setting up the wrapping format of the entries, as well as their title/description default separator. You can edit everything here as you please. |

```Python traceback
/stum-create-status char="{{arg::char}}" |

/stum-set-status-field char="{{arg::char}}" field=def_entry_separator "{{arg::def_title_value_separator}}" |
/stum-set-status-field char="{{arg::char}}" field=prefix "{{arg::prefix}}" |
/stum-set-status-field char="{{arg::char}}" field=suffix "{{arg::suffix}}"
```
<br><br>
| Title | QR Label | Description |
| :---: | :---: | :---: |
| Create entry data | `create_entry` | This will allow you to create a full status entry using a single line of code, including alternative values. |

```Python traceback
/stum-get-entry-uid char="{{arg::char}}" field=key "{{arg::title}}" |

/* "Only create entry if it does not exist" *|
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
		/* "In case you want the separator to be empty - If separator is not sent to this command, it will use def. title/value separator" *|
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

```Python traceback
/* "{{char}} = Car" *|
/:Stat-us-Max.create_status char="{{char}}" def_title_value_separator=": " prefix="<Status name=\"{{name}}\">\n# {{name}}\n" suffix="\n</Status>" |

/:Stat-us-Max.create_entry char="{{char}}" title="## Model" separator="\n" value="-Fiat 500 1.4 Lounge 105cv" |
/:Stat-us-Max.create_entry char="{{char}}" title="## Characteristics" separator="$" |
/:Stat-us-Max.create_entry char="{{char}}" title="- Tires" value="{{number::4}}{{text:: - In good state}}" |
/:Stat-us-Max.create_entry char="{{char}}" title="- Mileage" value="{{number::80}}km" |
/:Stat-us-Max.create_entry char="{{char}}" title="- Tank" value="{{range::0::100::5::100}}% capacity" |
/:Stat-us-Max.create_entry char="{{char}}" title="- Lights" value="{{boolean::false::On::Off}} - {{range::0::100::25::0}}% brightness" |
/:Stat-us-Max.create_entry char="{{char}}" title="## Trunk" separator="\n" value="Empty" alt_title="Empty" alt_values=[{"title": "Spare Tires Only", "value": "Spare tires"}, {"title": "Carrying Objects", "value": "{{text::- Spare tires\n- Suitcases}}"}] |
```
