/** Assigned properties, not a general relaxation of variable acceptance. */
export const crossTableBindings = [
  { key: "limit", property: "SlidingUniqueValuesLimit", native: "pedSlidingUniqueValuesLimit", name: "GroupLimit", type: "integer", nativeType: 4, xmlType: "dtInteger", value: 1, container: "TBGIntegerVariableContainer" },
  { key: "unique_names", property: "UniqueValueNames", native: "pedUniqueValueNames", name: "CategoryNames", type: "boolean", nativeType: 1, xmlType: "dtBoolean", value: true, container: "TBGBooleanVariableContainer" },
  { key: "separator", property: "DisplayNameSeparator", native: "pedDisplayNameSeparator", name: "CaptionSeparator", type: "string", nativeType: 5, xmlType: "dtString", value: ".", container: "TBGStringVariableContainer" },
] as const
