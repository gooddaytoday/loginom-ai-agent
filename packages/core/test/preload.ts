import path from "path"

process.env.LOGINOM_AI_AGENT_DB = ":memory:"
process.env.NPM_CONFIG_AUDIT = "false"
process.env.LOGINOM_AI_AGENT_MODELS_PATH = path.join(import.meta.dir, "plugin", "fixtures", "models-dev.json")
process.env.LOGINOM_AI_AGENT_DISABLE_MODELS_FETCH = "true"
