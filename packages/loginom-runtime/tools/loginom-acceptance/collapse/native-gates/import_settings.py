"""Observed Loginom 7.4.2 literal/combobox-label equivalences, format only."""
# Used only AFTER exact native Component equality; never case-fold Null markers.
ALIASES={'delimiter':{';':'Точка с запятой'},'text_qualifier':{'"':'Двойная кавычка (")'},'decimal_separator':{'.':'Точка (.)'}}
def format_equal(before,after):
 if set(before)!=set(after):return False
 return all(ALIASES.get(key,{}).get(before[key],before[key])==ALIASES.get(key,{}).get(after[key],after[key]) for key in before)
