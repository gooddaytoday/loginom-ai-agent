// Stage-1 parameter schema; variable ports are supplied by the shared W1 contract.
export const variablesCalculatorParametersSchema={
  "type": "object",
  "description": "Create or update scalar variables; stage 1 excludes intermediate, replacement, cache and reorder controls.",
  "additionalProperties": false,
  "properties": {
    "expressions": {
      "type": "array",
      "description": "1–32 ordered changes. New requires all name/label/type/formula fields; new node replaces the blank Expr1. Patches preserve unlisted expressions and their order.",
      "minItems": 1,
      "maxItems": 32,
      "items": {
        "type": "object",
        "description": "Ordered scalar expression patch; unlisted saved expressions stay unchanged.",
        "additionalProperties": false,
        "properties": {
          "target": {
            "type": "object",
            "description": "Choose one new or existing expression.",
            "additionalProperties": false,
            "properties": {
              "kind": {
                "type": "string",
                "description": "new adds a variable; existing patches one saved expression.",
                "maxLength": 128,
                "enum": [
                  "new",
                  "existing"
                ]
              },
              "name": {
                "type": "string",
                "description": "Exact saved expression name; required only for existing.",
                "maxLength": 128,
                "pattern": "^[A-Za-z_][A-Za-z0-9_]{0,127}$"
              }
            },
            "required": [
              "kind"
            ],
            "allOf": [
              {
                "if": {
                  "properties": {
                    "kind": {
                      "const": "new"
                    }
                  },
                  "required": [
                    "kind"
                  ]
                },
                "then": {
                  "not": {
                    "required": [
                      "name"
                    ]
                  }
                },
                "else": {
                  "required": [
                    "name"
                  ]
                }
              }
            ]
          },
          "name": {
            "type": "string",
            "description": "Technical output name. Required for new; existing omission preserves it.",
            "maxLength": 128,
            "pattern": "^[A-Za-z_][A-Za-z0-9_]{0,127}$"
          },
          "label": {
            "type": "string",
            "description": "Display label independent of name. Required for new; omission preserves existing.",
            "maxLength": 120,
            "minLength": 1,
            "pattern": "^[^\\x00-\\x1f]+$"
          },
          "type": {
            "type": "string",
            "description": "Output type; no inference. Required for new; omission preserves existing.",
            "maxLength": 128,
            "enum": [
              "integer",
              "real",
              "string",
              "boolean"
            ]
          },
          "formula": {
            "type": "string",
            "description": "Native Loginom expression, not JavaScript. Quotes for strings, TRUE/FALSE, NULL; Expr.name refers to an earlier expression. Required for new; omission preserves existing.",
            "maxLength": 2048,
            "minLength": 1,
            "allOf": [
              {
                "pattern": "\\S"
              },
              {
                "not": {
                  "pattern": "[\\r\\u0000]"
                }
              }
            ]
          },
          "description": {
            "type": "string",
            "description": "Optional expression description; omission preserves existing.",
            "maxLength": 512,
            "pattern": "^[^\\x00-\\x08\\x0b-\\x1f]*$"
          }
        },
        "required": [
          "target"
        ],
        "minProperties": 2,
        "allOf": [
          {
            "if": {
              "properties": {
                "target": {
                  "properties": {
                    "kind": {
                      "const": "new"
                    }
                  },
                  "required": [
                    "kind"
                  ]
                }
              },
              "required": [
                "target"
              ]
            },
            "then": {
              "required": [
                "name",
                "label",
                "type",
                "formula"
              ]
            }
          }
        ]
      }
    }
  },
  "required": [
    "expressions"
  ]
};
