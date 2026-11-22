PRAGMA foreign_keys=OFF;
BEGIN;
CREATE TABLE `workspace` (
          `id` text PRIMARY KEY,
          `type` text NOT NULL,
          `name` text DEFAULT '' NOT NULL,
          `branch` text,
          `directory` text,
          `extra` text,
          `project_id` text NOT NULL,
          `time_used` integer NOT NULL,
          CONSTRAINT `fk_workspace_project_id_project_id_fk` FOREIGN KEY (`project_id`) REFERENCES `project`(`id`) ON DELETE CASCADE
        );
CREATE TABLE `data_migration` (
          `name` text PRIMARY KEY,
          `time_completed` integer NOT NULL
        );
CREATE TABLE `account_state` (
          `id` integer PRIMARY KEY,
          `active_account_id` text,
          `active_org_id` text,
          CONSTRAINT `fk_account_state_active_account_id_account_id_fk` FOREIGN KEY (`active_account_id`) REFERENCES `account`(`id`) ON DELETE SET NULL
        );
CREATE TABLE `account` (
          `id` text PRIMARY KEY,
          `email` text NOT NULL,
          `url` text NOT NULL,
          `access_token` text NOT NULL,
          `refresh_token` text NOT NULL,
          `token_expiry` integer,
          `time_created` integer NOT NULL,
          `time_updated` integer NOT NULL
        );
CREATE TABLE `control_account` (
          `email` text NOT NULL,
          `url` text NOT NULL,
          `access_token` text NOT NULL,
          `refresh_token` text NOT NULL,
          `token_expiry` integer,
          `active` integer NOT NULL,
          `time_created` integer NOT NULL,
          `time_updated` integer NOT NULL,
          CONSTRAINT `control_account_pk` PRIMARY KEY(`email`, `url`)
        );
CREATE TABLE `credential` (
          `id` text PRIMARY KEY,
          `integration_id` text,
          `label` text NOT NULL,
          `value` text NOT NULL,
          `connector_id` text,
          `method_id` text,
          `active` integer,
          `time_created` integer NOT NULL,
          `time_updated` integer NOT NULL
        );
CREATE TABLE `event_sequence` (
          `aggregate_id` text PRIMARY KEY,
          `seq` integer NOT NULL,
          `owner_id` text
        );
CREATE TABLE `event` (
          `id` text PRIMARY KEY,
          `aggregate_id` text NOT NULL,
          `seq` integer NOT NULL,
          `type` text NOT NULL,
          `data` text NOT NULL,
          CONSTRAINT `fk_event_aggregate_id_event_sequence_aggregate_id_fk` FOREIGN KEY (`aggregate_id`) REFERENCES `event_sequence`(`aggregate_id`) ON DELETE CASCADE
        );
CREATE TABLE `permission` (
          `id` text PRIMARY KEY,
          `project_id` text NOT NULL,
          `action` text NOT NULL,
          `resource` text NOT NULL,
          `time_created` integer NOT NULL,
          `time_updated` integer NOT NULL,
          CONSTRAINT `fk_permission_project_id_project_id_fk` FOREIGN KEY (`project_id`) REFERENCES `project`(`id`) ON DELETE CASCADE
        );
CREATE TABLE `project_directory` (
          `project_id` text NOT NULL,
          `directory` text NOT NULL,
          `type` text,
          `strategy` text,
          `time_created` integer NOT NULL,
          CONSTRAINT `project_directory_pk` PRIMARY KEY(`project_id`, `directory`),
          CONSTRAINT `fk_project_directory_project_id_project_id_fk` FOREIGN KEY (`project_id`) REFERENCES `project`(`id`) ON DELETE CASCADE
        );
CREATE TABLE `project` (
          `id` text PRIMARY KEY,
          `worktree` text NOT NULL,
          `vcs` text,
          `name` text,
          `icon_url` text,
          `icon_url_override` text,
          `icon_color` text,
          `time_created` integer NOT NULL,
          `time_updated` integer NOT NULL,
          `time_initialized` integer,
          `sandboxes` text NOT NULL,
          `commands` text
        );
CREATE TABLE `message` (
          `id` text PRIMARY KEY,
          `session_id` text NOT NULL,
          `time_created` integer NOT NULL,
          `time_updated` integer NOT NULL,
          `data` text NOT NULL,
          CONSTRAINT `fk_message_session_id_session_id_fk` FOREIGN KEY (`session_id`) REFERENCES `session`(`id`) ON DELETE CASCADE
        );
CREATE TABLE `part` (
          `id` text PRIMARY KEY,
          `message_id` text NOT NULL,
          `session_id` text NOT NULL,
          `time_created` integer NOT NULL,
          `time_updated` integer NOT NULL,
          `data` text NOT NULL,
          CONSTRAINT `fk_part_message_id_message_id_fk` FOREIGN KEY (`message_id`) REFERENCES `message`(`id`) ON DELETE CASCADE
        );
CREATE TABLE `session_context_epoch` (
          `session_id` text PRIMARY KEY,
          `baseline` text NOT NULL,
          `snapshot` text NOT NULL,
          `baseline_seq` integer NOT NULL,
          CONSTRAINT `fk_session_context_epoch_session_id_session_id_fk` FOREIGN KEY (`session_id`) REFERENCES `session`(`id`) ON DELETE CASCADE
        );
CREATE TABLE `session_input` (
          `id` text PRIMARY KEY,
          `session_id` text NOT NULL,
          `prompt` text NOT NULL,
          `delivery` text NOT NULL,
          `admitted_seq` integer NOT NULL,
          `promoted_seq` integer,
          `time_created` integer NOT NULL,
          CONSTRAINT `fk_session_input_session_id_session_id_fk` FOREIGN KEY (`session_id`) REFERENCES `session`(`id`) ON DELETE CASCADE
        );
CREATE TABLE `session_message` (
          `id` text PRIMARY KEY,
          `session_id` text NOT NULL,
          `type` text NOT NULL,
          `seq` integer NOT NULL,
          `time_created` integer NOT NULL,
          `time_updated` integer NOT NULL,
          `data` text NOT NULL,
          CONSTRAINT `fk_session_message_session_id_session_id_fk` FOREIGN KEY (`session_id`) REFERENCES `session`(`id`) ON DELETE CASCADE
        );
CREATE TABLE `session` (
          `id` text PRIMARY KEY,
          `project_id` text NOT NULL,
          `workspace_id` text,
          `parent_id` text,
          `slug` text NOT NULL,
          `directory` text NOT NULL,
          `path` text,
          `title` text NOT NULL,
          `version` text NOT NULL,
          `share_url` text,
          `summary_additions` integer,
          `summary_deletions` integer,
          `summary_files` integer,
          `summary_diffs` text,
          `metadata` text,
          `cost` real DEFAULT 0 NOT NULL,
          `tokens_input` integer DEFAULT 0 NOT NULL,
          `tokens_output` integer DEFAULT 0 NOT NULL,
          `tokens_reasoning` integer DEFAULT 0 NOT NULL,
          `tokens_cache_read` integer DEFAULT 0 NOT NULL,
          `tokens_cache_write` integer DEFAULT 0 NOT NULL,
          `revert` text,
          `permission` text,
          `agent` text,
          `model` text,
          `time_created` integer NOT NULL,
          `time_updated` integer NOT NULL,
          `time_compacting` integer,
          `time_archived` integer,
          CONSTRAINT `fk_session_project_id_project_id_fk` FOREIGN KEY (`project_id`) REFERENCES `project`(`id`) ON DELETE CASCADE
        );
CREATE TABLE `todo` (
          `session_id` text NOT NULL,
          `content` text NOT NULL,
          `status` text NOT NULL,
          `priority` text NOT NULL,
          `position` integer NOT NULL,
          `time_created` integer NOT NULL,
          `time_updated` integer NOT NULL,
          CONSTRAINT `todo_pk` PRIMARY KEY(`session_id`, `position`),
          CONSTRAINT `fk_todo_session_id_session_id_fk` FOREIGN KEY (`session_id`) REFERENCES `session`(`id`) ON DELETE CASCADE
        );
CREATE TABLE `session_share` (
          `session_id` text PRIMARY KEY,
          `id` text NOT NULL,
          `secret` text NOT NULL,
          `url` text NOT NULL,
          `time_created` integer NOT NULL,
          `time_updated` integer NOT NULL,
          CONSTRAINT `fk_session_share_session_id_session_id_fk` FOREIGN KEY (`session_id`) REFERENCES `session`(`id`) ON DELETE CASCADE
        );
CREATE TABLE "migration" (id TEXT PRIMARY KEY, time_completed INTEGER NOT NULL);
INSERT INTO "event_sequence" VALUES('ses_dfc1db8dbffe89FPcpHa2oZ96p',28,NULL);
INSERT INTO "event_sequence" VALUES('ses_dfc1da44fffeiiojDLF5bJvxyz',28,NULL);
INSERT INTO "event_sequence" VALUES('ses_dfc1d9331ffeZ2s7oliGcCs2PM',19,NULL);
INSERT INTO "event" VALUES('evt_203e2472500153kg6bVdQqyQyb','ses_dfc1db8dbffe89FPcpHa2oZ96p',0,'session.created.1','{"sessionID":"ses_dfc1db8dbffe89FPcpHa2oZ96p","info":{"id":"ses_dfc1db8dbffe89FPcpHa2oZ96p","slug":"misty-tiger","projectID":"global","directory":"/tmp/loginom-fixture/project","path":"tmp/loginom-fixture/project","cost":0,"tokens":{"input":0,"output":0,"reasoning":0,"cache":{"read":0,"write":0}},"title":"New session - 2026-11-22T15:31:30.724Z","version":"local","time":{"created":1795361490724,"updated":1795361490724},"permission":[{"permission":"question","pattern":"*","action":"deny"},{"permission":"plan_enter","pattern":"*","action":"deny"},{"permission":"plan_exit","pattern":"*","action":"deny"}]}}');
INSERT INTO "event" VALUES('evt_203e2475b001P7uQ6fhuZtLmmx','ses_dfc1db8dbffe89FPcpHa2oZ96p',1,'session.updated.1','{"sessionID":"ses_dfc1db8dbffe89FPcpHa2oZ96p","info":{"id":"ses_dfc1db8dbffe89FPcpHa2oZ96p","slug":"misty-tiger","projectID":"global","directory":"/tmp/loginom-fixture/project","path":"tmp/loginom-fixture/project","cost":0,"tokens":{"input":0,"output":0,"reasoning":0,"cache":{"read":0,"write":0}},"title":"New session - 2026-11-22T15:31:30.724Z","agent":"build","model":{"id":"fixture-model","providerID":"fixture","variant":"default"},"version":"local","time":{"created":1795361490724,"updated":1795361490777},"permission":[{"permission":"question","pattern":"*","action":"deny"},{"permission":"plan_enter","pattern":"*","action":"deny"},{"permission":"plan_exit","pattern":"*","action":"deny"}]}}');
INSERT INTO "event" VALUES('evt_203e24762001hAa9WP0KO4YTcz','ses_dfc1db8dbffe89FPcpHa2oZ96p',2,'message.updated.1','{"sessionID":"ses_dfc1db8dbffe89FPcpHa2oZ96p","info":{"id":"msg_203e24759001eryjJ5PQ9KHOI8","sessionID":"ses_dfc1db8dbffe89FPcpHa2oZ96p","role":"user","time":{"created":1795361490777},"agent":"build","model":{"providerID":"fixture","modelID":"fixture-model"}}}');
INSERT INTO "event" VALUES('evt_203e24765001IVLyoz3ru6m4JR','ses_dfc1db8dbffe89FPcpHa2oZ96p',3,'message.part.updated.1','{"sessionID":"ses_dfc1db8dbffe89FPcpHa2oZ96p","part":{"id":"prt_203e24760001h7oID3EcFQBVhi","sessionID":"ses_dfc1db8dbffe89FPcpHa2oZ96p","messageID":"msg_203e24759001eryjJ5PQ9KHOI8","type":"text","text":"\"First session: what is the answer?\nFIXTURE-SCRIPT:W3sidGV4dCI6IkhlbGxvISBUaGUgYW5zd2VyIGlzIDQyLiJ9XQ==\""},"time":1795361490788}');
INSERT INTO "event" VALUES('evt_203e24768001v5oVVJZV1FQVrp','ses_dfc1db8dbffe89FPcpHa2oZ96p',4,'session.updated.1','{"sessionID":"ses_dfc1db8dbffe89FPcpHa2oZ96p","info":{"id":"ses_dfc1db8dbffe89FPcpHa2oZ96p","slug":"misty-tiger","projectID":"global","directory":"/tmp/loginom-fixture/project","path":"tmp/loginom-fixture/project","cost":0,"tokens":{"input":0,"output":0,"reasoning":0,"cache":{"read":0,"write":0}},"title":"New session - 2026-11-22T15:31:30.724Z","agent":"build","model":{"id":"fixture-model","providerID":"fixture","variant":"default"},"version":"local","time":{"created":1795361490724,"updated":1795361490791},"permission":[{"permission":"question","pattern":"*","action":"deny"},{"permission":"plan_enter","pattern":"*","action":"deny"},{"permission":"plan_exit","pattern":"*","action":"deny"}]}}');
INSERT INTO "event" VALUES('evt_203e2478c001UxjmDeXw9YzUJ4','ses_dfc1db8dbffe89FPcpHa2oZ96p',5,'message.updated.1','{"sessionID":"ses_dfc1db8dbffe89FPcpHa2oZ96p","info":{"id":"msg_203e2478c001okkwEs9XGgI40C","sessionID":"ses_dfc1db8dbffe89FPcpHa2oZ96p","role":"assistant","time":{"created":1795361490828},"parentID":"msg_203e24759001eryjJ5PQ9KHOI8","modelID":"fixture-model","providerID":"fixture","mode":"build","agent":"build","path":{"cwd":"/tmp/loginom-fixture/project","root":"/"},"cost":0,"tokens":{"input":0,"output":0,"reasoning":0,"cache":{"read":0,"write":0}}}}');
INSERT INTO "event" VALUES('evt_203e247d40016efGLbxTEUWyle','ses_dfc1db8dbffe89FPcpHa2oZ96p',6,'session.updated.1','{"sessionID":"ses_dfc1db8dbffe89FPcpHa2oZ96p","info":{"id":"ses_dfc1db8dbffe89FPcpHa2oZ96p","slug":"misty-tiger","projectID":"global","directory":"/tmp/loginom-fixture/project","path":"tmp/loginom-fixture/project","cost":0,"tokens":{"input":0,"output":0,"reasoning":0,"cache":{"read":0,"write":0}},"title":"Fixture title","agent":"build","model":{"id":"fixture-model","providerID":"fixture","variant":"default"},"version":"local","time":{"created":1795361490724,"updated":1795361490791},"permission":[{"permission":"question","pattern":"*","action":"deny"},{"permission":"plan_enter","pattern":"*","action":"deny"},{"permission":"plan_exit","pattern":"*","action":"deny"}]}}');
INSERT INTO "event" VALUES('evt_203e247e4001GUNMNsuwFC5Yrj','ses_dfc1db8dbffe89FPcpHa2oZ96p',7,'session.updated.1','{"sessionID":"ses_dfc1db8dbffe89FPcpHa2oZ96p","info":{"id":"ses_dfc1db8dbffe89FPcpHa2oZ96p","slug":"misty-tiger","projectID":"global","directory":"/tmp/loginom-fixture/project","path":"tmp/loginom-fixture/project","summary":{"additions":0,"deletions":0,"files":0},"cost":0,"tokens":{"input":0,"output":0,"reasoning":0,"cache":{"read":0,"write":0}},"title":"Fixture title","agent":"build","model":{"id":"fixture-model","providerID":"fixture","variant":"default"},"version":"local","time":{"created":1795361490724,"updated":1795361490915},"permission":[{"permission":"question","pattern":"*","action":"deny"},{"permission":"plan_enter","pattern":"*","action":"deny"},{"permission":"plan_exit","pattern":"*","action":"deny"}]}}');
INSERT INTO "event" VALUES('evt_203e247e8001CcOYegt8bnI02I','ses_dfc1db8dbffe89FPcpHa2oZ96p',8,'message.updated.1','{"sessionID":"ses_dfc1db8dbffe89FPcpHa2oZ96p","info":{"id":"msg_203e24759001eryjJ5PQ9KHOI8","sessionID":"ses_dfc1db8dbffe89FPcpHa2oZ96p","role":"user","time":{"created":1795361490777},"summary":{"diffs":[]},"agent":"build","model":{"providerID":"fixture","modelID":"fixture-model"}}}');
INSERT INTO "event" VALUES('evt_203e2485a001DjpOxjPwginU3n','ses_dfc1db8dbffe89FPcpHa2oZ96p',9,'message.part.updated.1','{"sessionID":"ses_dfc1db8dbffe89FPcpHa2oZ96p","part":{"id":"prt_203e2485a001bnRbeskPxzfuzF","sessionID":"ses_dfc1db8dbffe89FPcpHa2oZ96p","messageID":"msg_203e2478c001okkwEs9XGgI40C","type":"step-start"},"time":1795361491034}');
INSERT INTO "event" VALUES('evt_203e2485c0016rGmiSEgZcePIe','ses_dfc1db8dbffe89FPcpHa2oZ96p',10,'message.part.updated.1','{"sessionID":"ses_dfc1db8dbffe89FPcpHa2oZ96p","part":{"id":"prt_203e2485c001hF33kU1DIBbKNu","sessionID":"ses_dfc1db8dbffe89FPcpHa2oZ96p","messageID":"msg_203e2478c001okkwEs9XGgI40C","type":"text","text":"","time":{"start":1795361491036}},"time":1795361491036}');
INSERT INTO "event" VALUES('evt_203e2485f001mQDXH2XBUC1Aho','ses_dfc1db8dbffe89FPcpHa2oZ96p',11,'message.part.updated.1','{"sessionID":"ses_dfc1db8dbffe89FPcpHa2oZ96p","part":{"id":"prt_203e2485c001hF33kU1DIBbKNu","sessionID":"ses_dfc1db8dbffe89FPcpHa2oZ96p","messageID":"msg_203e2478c001okkwEs9XGgI40C","type":"text","text":"Hello! The answer is 42.","time":{"start":1795361491036,"end":1795361491039}},"time":1795361491039}');
INSERT INTO "event" VALUES('evt_203e24862001fLOLqTsa25ILQq','ses_dfc1db8dbffe89FPcpHa2oZ96p',12,'message.part.updated.1','{"sessionID":"ses_dfc1db8dbffe89FPcpHa2oZ96p","part":{"id":"prt_203e24862001zjQ5gVYmseiKQe","sessionID":"ses_dfc1db8dbffe89FPcpHa2oZ96p","messageID":"msg_203e2478c001okkwEs9XGgI40C","type":"step-finish","reason":"stop","cost":0,"tokens":{"total":15,"input":10,"output":5,"reasoning":0,"cache":{"read":0,"write":0}}},"time":1795361491042}');
INSERT INTO "event" VALUES('evt_203e24864001GOlSU3D1o4sOJa','ses_dfc1db8dbffe89FPcpHa2oZ96p',13,'message.updated.1','{"sessionID":"ses_dfc1db8dbffe89FPcpHa2oZ96p","info":{"id":"msg_203e2478c001okkwEs9XGgI40C","sessionID":"ses_dfc1db8dbffe89FPcpHa2oZ96p","role":"assistant","time":{"created":1795361490828},"parentID":"msg_203e24759001eryjJ5PQ9KHOI8","modelID":"fixture-model","providerID":"fixture","mode":"build","agent":"build","path":{"cwd":"/tmp/loginom-fixture/project","root":"/"},"cost":0,"tokens":{"total":15,"input":10,"output":5,"reasoning":0,"cache":{"read":0,"write":0}},"finish":"stop"}}');
INSERT INTO "event" VALUES('evt_203e24867001k0O3a1rhSEgquD','ses_dfc1db8dbffe89FPcpHa2oZ96p',14,'message.updated.1','{"sessionID":"ses_dfc1db8dbffe89FPcpHa2oZ96p","info":{"id":"msg_203e2478c001okkwEs9XGgI40C","sessionID":"ses_dfc1db8dbffe89FPcpHa2oZ96p","role":"assistant","time":{"created":1795361490828,"completed":1795361491047},"parentID":"msg_203e24759001eryjJ5PQ9KHOI8","modelID":"fixture-model","providerID":"fixture","mode":"build","agent":"build","path":{"cwd":"/tmp/loginom-fixture/project","root":"/"},"cost":0,"tokens":{"total":15,"input":10,"output":5,"reasoning":0,"cache":{"read":0,"write":0}},"finish":"stop"}}');
INSERT INTO "event" VALUES('evt_203e2487c001C2QRxbyW1ad1oc','ses_dfc1db8dbffe89FPcpHa2oZ96p',15,'session.updated.1','{"sessionID":"ses_dfc1db8dbffe89FPcpHa2oZ96p","info":{"id":"ses_dfc1db8dbffe89FPcpHa2oZ96p","slug":"misty-tiger","projectID":"global","directory":"/tmp/loginom-fixture/project","path":"tmp/loginom-fixture/project","summary":{"additions":0,"deletions":0,"files":0},"cost":0,"tokens":{"input":10,"output":5,"reasoning":0,"cache":{"read":0,"write":0}},"title":"Fixture title","agent":"build","model":{"id":"fixture-model","providerID":"fixture","variant":"default"},"version":"local","time":{"created":1795361490724,"updated":1795361491067},"permission":[{"permission":"question","pattern":"*","action":"deny"},{"permission":"plan_enter","pattern":"*","action":"deny"},{"permission":"plan_exit","pattern":"*","action":"deny"}]}}');
INSERT INTO "event" VALUES('evt_203e2518d0018myLjSSZrSyX1D','ses_dfc1db8dbffe89FPcpHa2oZ96p',16,'message.updated.1','{"sessionID":"ses_dfc1db8dbffe89FPcpHa2oZ96p","info":{"id":"msg_203e25189001enjDmfxXnxU4Ls","sessionID":"ses_dfc1db8dbffe89FPcpHa2oZ96p","role":"user","time":{"created":1795361493385},"agent":"build","model":{"providerID":"fixture","modelID":"fixture-model"}}}');
INSERT INTO "event" VALUES('evt_203e25193001P5hVYedR6U8kur','ses_dfc1db8dbffe89FPcpHa2oZ96p',17,'message.part.updated.1','{"sessionID":"ses_dfc1db8dbffe89FPcpHa2oZ96p","part":{"id":"prt_203e2518c001RkVt2O8FpI47Et","sessionID":"ses_dfc1db8dbffe89FPcpHa2oZ96p","messageID":"msg_203e25189001enjDmfxXnxU4Ls","type":"text","text":"\"Second turn in the first session.\nFIXTURE-SCRIPT:W3sidGV4dCI6IkNvbnRpbnVlZDogc3RpbGwgNDIuIn1d\""},"time":1795361493395}');
INSERT INTO "event" VALUES('evt_203e251980010EeKHJDObZhW1a','ses_dfc1db8dbffe89FPcpHa2oZ96p',18,'session.updated.1','{"sessionID":"ses_dfc1db8dbffe89FPcpHa2oZ96p","info":{"id":"ses_dfc1db8dbffe89FPcpHa2oZ96p","slug":"misty-tiger","projectID":"global","directory":"/tmp/loginom-fixture/project","path":"tmp/loginom-fixture/project","summary":{"additions":0,"deletions":0,"files":0},"cost":0,"tokens":{"input":10,"output":5,"reasoning":0,"cache":{"read":0,"write":0}},"title":"Fixture title","agent":"build","model":{"id":"fixture-model","providerID":"fixture","variant":"default"},"version":"local","time":{"created":1795361490724,"updated":1795361493399},"permission":[{"permission":"question","pattern":"*","action":"deny"},{"permission":"plan_enter","pattern":"*","action":"deny"},{"permission":"plan_exit","pattern":"*","action":"deny"}]}}');
INSERT INTO "event" VALUES('evt_203e251ce001mep4dJMHtADvSz','ses_dfc1db8dbffe89FPcpHa2oZ96p',19,'message.updated.1','{"sessionID":"ses_dfc1db8dbffe89FPcpHa2oZ96p","info":{"id":"msg_203e251ce001M4SuJxmmAKdxvV","sessionID":"ses_dfc1db8dbffe89FPcpHa2oZ96p","role":"assistant","time":{"created":1795361493454},"parentID":"msg_203e25189001enjDmfxXnxU4Ls","modelID":"fixture-model","providerID":"fixture","mode":"build","agent":"build","path":{"cwd":"/tmp/loginom-fixture/project","root":"/"},"cost":0,"tokens":{"input":0,"output":0,"reasoning":0,"cache":{"read":0,"write":0}}}}');
INSERT INTO "event" VALUES('evt_203e251eb001hd7d88uFIv45qS','ses_dfc1db8dbffe89FPcpHa2oZ96p',20,'session.updated.1','{"sessionID":"ses_dfc1db8dbffe89FPcpHa2oZ96p","info":{"id":"ses_dfc1db8dbffe89FPcpHa2oZ96p","slug":"misty-tiger","projectID":"global","directory":"/tmp/loginom-fixture/project","path":"tmp/loginom-fixture/project","summary":{"additions":0,"deletions":0,"files":0},"cost":0,"tokens":{"input":10,"output":5,"reasoning":0,"cache":{"read":0,"write":0}},"title":"Fixture title","agent":"build","model":{"id":"fixture-model","providerID":"fixture","variant":"default"},"version":"local","time":{"created":1795361490724,"updated":1795361493482},"permission":[{"permission":"question","pattern":"*","action":"deny"},{"permission":"plan_enter","pattern":"*","action":"deny"},{"permission":"plan_exit","pattern":"*","action":"deny"}]}}');
INSERT INTO "event" VALUES('evt_203e251ef001tyWmVOuQwPahjd','ses_dfc1db8dbffe89FPcpHa2oZ96p',21,'message.updated.1','{"sessionID":"ses_dfc1db8dbffe89FPcpHa2oZ96p","info":{"id":"msg_203e25189001enjDmfxXnxU4Ls","sessionID":"ses_dfc1db8dbffe89FPcpHa2oZ96p","role":"user","time":{"created":1795361493385},"summary":{"diffs":[]},"agent":"build","model":{"providerID":"fixture","modelID":"fixture-model"}}}');
INSERT INTO "event" VALUES('evt_203e2529c001lN324eKuwRRsoJ','ses_dfc1db8dbffe89FPcpHa2oZ96p',22,'message.part.updated.1','{"sessionID":"ses_dfc1db8dbffe89FPcpHa2oZ96p","part":{"id":"prt_203e2529c001Wh12LHXoV4ZbVU","sessionID":"ses_dfc1db8dbffe89FPcpHa2oZ96p","messageID":"msg_203e251ce001M4SuJxmmAKdxvV","type":"step-start"},"time":1795361493660}');
INSERT INTO "event" VALUES('evt_203e2529f0013fcsJG3WlwC7nk','ses_dfc1db8dbffe89FPcpHa2oZ96p',23,'message.part.updated.1','{"sessionID":"ses_dfc1db8dbffe89FPcpHa2oZ96p","part":{"id":"prt_203e2529f001CShzf7obtTfoB1","sessionID":"ses_dfc1db8dbffe89FPcpHa2oZ96p","messageID":"msg_203e251ce001M4SuJxmmAKdxvV","type":"text","text":"","time":{"start":1795361493663}},"time":1795361493663}');
INSERT INTO "event" VALUES('evt_203e252a3001qCC34XxVNXD1Q8','ses_dfc1db8dbffe89FPcpHa2oZ96p',24,'message.part.updated.1','{"sessionID":"ses_dfc1db8dbffe89FPcpHa2oZ96p","part":{"id":"prt_203e2529f001CShzf7obtTfoB1","sessionID":"ses_dfc1db8dbffe89FPcpHa2oZ96p","messageID":"msg_203e251ce001M4SuJxmmAKdxvV","type":"text","text":"Continued: still 42.","time":{"start":1795361493663,"end":1795361493666}},"time":1795361493667}');
INSERT INTO "event" VALUES('evt_203e252a8001tClMwQVjiIGOqu','ses_dfc1db8dbffe89FPcpHa2oZ96p',25,'message.part.updated.1','{"sessionID":"ses_dfc1db8dbffe89FPcpHa2oZ96p","part":{"id":"prt_203e252a8001dzyrORib3VSwDI","sessionID":"ses_dfc1db8dbffe89FPcpHa2oZ96p","messageID":"msg_203e251ce001M4SuJxmmAKdxvV","type":"step-finish","reason":"stop","cost":0,"tokens":{"total":15,"input":10,"output":5,"reasoning":0,"cache":{"read":0,"write":0}}},"time":1795361493672}');
INSERT INTO "event" VALUES('evt_203e252aa001nh2nsuSbS5uzfN','ses_dfc1db8dbffe89FPcpHa2oZ96p',26,'message.updated.1','{"sessionID":"ses_dfc1db8dbffe89FPcpHa2oZ96p","info":{"id":"msg_203e251ce001M4SuJxmmAKdxvV","sessionID":"ses_dfc1db8dbffe89FPcpHa2oZ96p","role":"assistant","time":{"created":1795361493454},"parentID":"msg_203e25189001enjDmfxXnxU4Ls","modelID":"fixture-model","providerID":"fixture","mode":"build","agent":"build","path":{"cwd":"/tmp/loginom-fixture/project","root":"/"},"cost":0,"tokens":{"total":15,"input":10,"output":5,"reasoning":0,"cache":{"read":0,"write":0}},"finish":"stop"}}');
INSERT INTO "event" VALUES('evt_203e252ae0014TrzyGzcW3OwFw','ses_dfc1db8dbffe89FPcpHa2oZ96p',27,'message.updated.1','{"sessionID":"ses_dfc1db8dbffe89FPcpHa2oZ96p","info":{"id":"msg_203e251ce001M4SuJxmmAKdxvV","sessionID":"ses_dfc1db8dbffe89FPcpHa2oZ96p","role":"assistant","time":{"created":1795361493454,"completed":1795361493678},"parentID":"msg_203e25189001enjDmfxXnxU4Ls","modelID":"fixture-model","providerID":"fixture","mode":"build","agent":"build","path":{"cwd":"/tmp/loginom-fixture/project","root":"/"},"cost":0,"tokens":{"total":15,"input":10,"output":5,"reasoning":0,"cache":{"read":0,"write":0}},"finish":"stop"}}');
INSERT INTO "event" VALUES('evt_203e252c2001RV0ObQ0a5Bqkvj','ses_dfc1db8dbffe89FPcpHa2oZ96p',28,'session.updated.1','{"sessionID":"ses_dfc1db8dbffe89FPcpHa2oZ96p","info":{"id":"ses_dfc1db8dbffe89FPcpHa2oZ96p","slug":"misty-tiger","projectID":"global","directory":"/tmp/loginom-fixture/project","path":"tmp/loginom-fixture/project","summary":{"additions":0,"deletions":0,"files":0},"cost":0,"tokens":{"input":20,"output":10,"reasoning":0,"cache":{"read":0,"write":0}},"title":"Fixture title","agent":"build","model":{"id":"fixture-model","providerID":"fixture","variant":"default"},"version":"local","time":{"created":1795361490724,"updated":1795361493697},"permission":[{"permission":"question","pattern":"*","action":"deny"},{"permission":"plan_enter","pattern":"*","action":"deny"},{"permission":"plan_exit","pattern":"*","action":"deny"}]}}');
INSERT INTO "event" VALUES('evt_203e25bb1001TePqfrlnl84mS4','ses_dfc1da44fffeiiojDLF5bJvxyz',0,'session.created.1','{"sessionID":"ses_dfc1da44fffeiiojDLF5bJvxyz","info":{"id":"ses_dfc1da44fffeiiojDLF5bJvxyz","slug":"crisp-cactus","projectID":"global","directory":"/tmp/loginom-fixture/project","path":"tmp/loginom-fixture/project","cost":0,"tokens":{"input":0,"output":0,"reasoning":0,"cache":{"read":0,"write":0}},"title":"New session - 2026-11-22T15:31:35.984Z","version":"local","time":{"created":1795361495984,"updated":1795361495984},"permission":[{"permission":"question","pattern":"*","action":"deny"},{"permission":"plan_enter","pattern":"*","action":"deny"},{"permission":"plan_exit","pattern":"*","action":"deny"}]}}');
INSERT INTO "event" VALUES('evt_203e25bd8001YfvS3mCBRAcEtM','ses_dfc1da44fffeiiojDLF5bJvxyz',1,'session.updated.1','{"sessionID":"ses_dfc1da44fffeiiojDLF5bJvxyz","info":{"id":"ses_dfc1da44fffeiiojDLF5bJvxyz","slug":"crisp-cactus","projectID":"global","directory":"/tmp/loginom-fixture/project","path":"tmp/loginom-fixture/project","cost":0,"tokens":{"input":0,"output":0,"reasoning":0,"cache":{"read":0,"write":0}},"title":"New session - 2026-11-22T15:31:35.984Z","agent":"build","model":{"id":"fixture-model","providerID":"fixture","variant":"default"},"version":"local","time":{"created":1795361495984,"updated":1795361496023},"permission":[{"permission":"question","pattern":"*","action":"deny"},{"permission":"plan_enter","pattern":"*","action":"deny"},{"permission":"plan_exit","pattern":"*","action":"deny"}]}}');
INSERT INTO "event" VALUES('evt_203e25c32001dJcZm4qJcx2q7I','ses_dfc1da44fffeiiojDLF5bJvxyz',2,'message.updated.1','{"sessionID":"ses_dfc1da44fffeiiojDLF5bJvxyz","info":{"id":"msg_203e25bd70011KN3OgboMl93Wv","sessionID":"ses_dfc1da44fffeiiojDLF5bJvxyz","role":"user","time":{"created":1795361496023},"agent":"build","model":{"providerID":"fixture","modelID":"fixture-model"}}}');
INSERT INTO "event" VALUES('evt_203e25c36001jQ5GPMbSgIl8e5','ses_dfc1da44fffeiiojDLF5bJvxyz',3,'message.part.updated.1','{"sessionID":"ses_dfc1da44fffeiiojDLF5bJvxyz","part":{"id":"prt_203e25c31001X3Rg0XVksbjvik","sessionID":"ses_dfc1da44fffeiiojDLF5bJvxyz","messageID":"msg_203e25bd70011KN3OgboMl93Wv","type":"text","text":"Called the Read tool with the following input: {\"filePath\":\"/tmp/loginom-fixture/project/notes.txt\"}","synthetic":true},"time":1795361496118}');
INSERT INTO "event" VALUES('evt_203e25c38001mo3D2QZjn9fF1H','ses_dfc1da44fffeiiojDLF5bJvxyz',4,'message.part.updated.1','{"sessionID":"ses_dfc1da44fffeiiojDLF5bJvxyz","part":{"id":"prt_203e25c31002bOKXp7Xlfx87JN","sessionID":"ses_dfc1da44fffeiiojDLF5bJvxyz","messageID":"msg_203e25bd70011KN3OgboMl93Wv","type":"text","text":"<path>/tmp/loginom-fixture/project/notes.txt</path>\n<type>file</type>\n<content>\n1: Fixture attachment: three rows of sample data.\n\n(End of file - total 1 lines)\n</content>","synthetic":true},"time":1795361496120}');
INSERT INTO "event" VALUES('evt_203e25c3a00175dA2DpOyUvpJ8','ses_dfc1da44fffeiiojDLF5bJvxyz',5,'message.part.updated.1','{"sessionID":"ses_dfc1da44fffeiiojDLF5bJvxyz","part":{"id":"prt_203e25c31003cU6fU073fmCSGh","sessionID":"ses_dfc1da44fffeiiojDLF5bJvxyz","messageID":"msg_203e25bd70011KN3OgboMl93Wv","type":"file","mime":"text/plain","filename":"notes.txt","url":"file:///tmp/loginom-fixture/project/notes.txt"},"time":1795361496122}');
INSERT INTO "event" VALUES('evt_203e25c3c001HS4azboknJyG4i','ses_dfc1da44fffeiiojDLF5bJvxyz',6,'message.part.updated.1','{"sessionID":"ses_dfc1da44fffeiiojDLF5bJvxyz","part":{"id":"prt_203e25c3100495ev6ICfQlM29Y","sessionID":"ses_dfc1da44fffeiiojDLF5bJvxyz","messageID":"msg_203e25bd70011KN3OgboMl93Wv","type":"text","text":"\"Second session: summarize the attached notes.\nFIXTURE-SCRIPT:W3sidG9vbCI6InJlYWQiLCJpbnB1dCI6eyJmaWxlUGF0aCI6Ii90bXAvbG9naW5vbS1maXh0dXJlL3Byb2plY3Qvbm90ZXMudHh0In19LHsidGV4dCI6IlRoZSBhdHRhY2htZW50IGhhcyB0aHJlZSByb3dzLiJ9XQ==\""},"time":1795361496124}');
INSERT INTO "event" VALUES('evt_203e25c3f001DTvgl6GDVZUN8w','ses_dfc1da44fffeiiojDLF5bJvxyz',7,'session.updated.1','{"sessionID":"ses_dfc1da44fffeiiojDLF5bJvxyz","info":{"id":"ses_dfc1da44fffeiiojDLF5bJvxyz","slug":"crisp-cactus","projectID":"global","directory":"/tmp/loginom-fixture/project","path":"tmp/loginom-fixture/project","cost":0,"tokens":{"input":0,"output":0,"reasoning":0,"cache":{"read":0,"write":0}},"title":"New session - 2026-11-22T15:31:35.984Z","agent":"build","model":{"id":"fixture-model","providerID":"fixture","variant":"default"},"version":"local","time":{"created":1795361495984,"updated":1795361496126},"permission":[{"permission":"question","pattern":"*","action":"deny"},{"permission":"plan_enter","pattern":"*","action":"deny"},{"permission":"plan_exit","pattern":"*","action":"deny"}]}}');
INSERT INTO "event" VALUES('evt_203e25c4d001shjPwqxRPb6UGc','ses_dfc1da44fffeiiojDLF5bJvxyz',8,'message.updated.1','{"sessionID":"ses_dfc1da44fffeiiojDLF5bJvxyz","info":{"id":"msg_203e25c4d001nsLE0r3gI3ZLY9","sessionID":"ses_dfc1da44fffeiiojDLF5bJvxyz","role":"assistant","time":{"created":1795361496141},"parentID":"msg_203e25bd70011KN3OgboMl93Wv","modelID":"fixture-model","providerID":"fixture","mode":"build","agent":"build","path":{"cwd":"/tmp/loginom-fixture/project","root":"/"},"cost":0,"tokens":{"input":0,"output":0,"reasoning":0,"cache":{"read":0,"write":0}}}}');
INSERT INTO "event" VALUES('evt_203e25c670016kLFV5jo7jyqOv','ses_dfc1da44fffeiiojDLF5bJvxyz',9,'session.updated.1','{"sessionID":"ses_dfc1da44fffeiiojDLF5bJvxyz","info":{"id":"ses_dfc1da44fffeiiojDLF5bJvxyz","slug":"crisp-cactus","projectID":"global","directory":"/tmp/loginom-fixture/project","path":"tmp/loginom-fixture/project","summary":{"additions":0,"deletions":0,"files":0},"cost":0,"tokens":{"input":0,"output":0,"reasoning":0,"cache":{"read":0,"write":0}},"title":"New session - 2026-11-22T15:31:35.984Z","agent":"build","model":{"id":"fixture-model","providerID":"fixture","variant":"default"},"version":"local","time":{"created":1795361495984,"updated":1795361496166},"permission":[{"permission":"question","pattern":"*","action":"deny"},{"permission":"plan_enter","pattern":"*","action":"deny"},{"permission":"plan_exit","pattern":"*","action":"deny"}]}}');
INSERT INTO "event" VALUES('evt_203e25c6a0011EGEgM9IWOci2P','ses_dfc1da44fffeiiojDLF5bJvxyz',10,'message.updated.1','{"sessionID":"ses_dfc1da44fffeiiojDLF5bJvxyz","info":{"id":"msg_203e25bd70011KN3OgboMl93Wv","sessionID":"ses_dfc1da44fffeiiojDLF5bJvxyz","role":"user","time":{"created":1795361496023},"summary":{"diffs":[]},"agent":"build","model":{"providerID":"fixture","modelID":"fixture-model"}}}');
INSERT INTO "event" VALUES('evt_203e25c930011WkrPwy4tChJ3i','ses_dfc1da44fffeiiojDLF5bJvxyz',11,'session.updated.1','{"sessionID":"ses_dfc1da44fffeiiojDLF5bJvxyz","info":{"id":"ses_dfc1da44fffeiiojDLF5bJvxyz","slug":"crisp-cactus","projectID":"global","directory":"/tmp/loginom-fixture/project","path":"tmp/loginom-fixture/project","summary":{"additions":0,"deletions":0,"files":0},"cost":0,"tokens":{"input":0,"output":0,"reasoning":0,"cache":{"read":0,"write":0}},"title":"Fixture title","agent":"build","model":{"id":"fixture-model","providerID":"fixture","variant":"default"},"version":"local","time":{"created":1795361495984,"updated":1795361496166},"permission":[{"permission":"question","pattern":"*","action":"deny"},{"permission":"plan_enter","pattern":"*","action":"deny"},{"permission":"plan_exit","pattern":"*","action":"deny"}]}}');
INSERT INTO "event" VALUES('evt_203e25d030017CxsDBZqu0sVO7','ses_dfc1da44fffeiiojDLF5bJvxyz',12,'message.part.updated.1','{"sessionID":"ses_dfc1da44fffeiiojDLF5bJvxyz","part":{"id":"prt_203e25d0300156CAFsAEohnp1v","sessionID":"ses_dfc1da44fffeiiojDLF5bJvxyz","messageID":"msg_203e25c4d001nsLE0r3gI3ZLY9","type":"step-start"},"time":1795361496323}');
INSERT INTO "event" VALUES('evt_203e25d06001RBxjqQINcaiquI','ses_dfc1da44fffeiiojDLF5bJvxyz',13,'message.part.updated.1','{"sessionID":"ses_dfc1da44fffeiiojDLF5bJvxyz","part":{"id":"prt_203e25d06001vsNVBal5A9PHJX","sessionID":"ses_dfc1da44fffeiiojDLF5bJvxyz","messageID":"msg_203e25c4d001nsLE0r3gI3ZLY9","type":"tool","callID":"call_5","tool":"read","state":{"status":"pending","input":{},"raw":""}},"time":1795361496326}');
INSERT INTO "event" VALUES('evt_203e25d0d001Uev8tXG3fKHZF4','ses_dfc1da44fffeiiojDLF5bJvxyz',14,'message.part.updated.1','{"sessionID":"ses_dfc1da44fffeiiojDLF5bJvxyz","part":{"id":"prt_203e25d06001vsNVBal5A9PHJX","sessionID":"ses_dfc1da44fffeiiojDLF5bJvxyz","messageID":"msg_203e25c4d001nsLE0r3gI3ZLY9","type":"tool","callID":"call_5","tool":"read","state":{"status":"running","input":{"filePath":"/tmp/loginom-fixture/project/notes.txt"},"time":{"start":1795361496333}}},"time":1795361496333}');
INSERT INTO "event" VALUES('evt_203e25d15001c4i3O8SMxoIFSw','ses_dfc1da44fffeiiojDLF5bJvxyz',15,'message.part.updated.1','{"sessionID":"ses_dfc1da44fffeiiojDLF5bJvxyz","part":{"id":"prt_203e25d06001vsNVBal5A9PHJX","sessionID":"ses_dfc1da44fffeiiojDLF5bJvxyz","messageID":"msg_203e25c4d001nsLE0r3gI3ZLY9","type":"tool","callID":"call_5","tool":"read","state":{"status":"completed","input":{"filePath":"/tmp/loginom-fixture/project/notes.txt"},"output":"<path>/tmp/loginom-fixture/project/notes.txt</path>\n<type>file</type>\n<content>\n1: Fixture attachment: three rows of sample data.\n\n(End of file - total 1 lines)\n</content>","title":"tmp/loginom-fixture/project/notes.txt","metadata":{"preview":"Fixture attachment: three rows of sample data.","truncated":false,"loaded":[],"display":{"type":"file","path":"/tmp/loginom-fixture/project/notes.txt","text":"Fixture attachment: three rows of sample data.","lineStart":1,"lineEnd":1,"totalLines":1,"truncated":false}},"time":{"start":1795361496333,"end":1795361496341}}},"time":1795361496341}');
INSERT INTO "event" VALUES('evt_203e25d19001DAuhoh7DK1nE1n','ses_dfc1da44fffeiiojDLF5bJvxyz',16,'message.part.updated.1','{"sessionID":"ses_dfc1da44fffeiiojDLF5bJvxyz","part":{"id":"prt_203e25d19001crniphM9fDpY6q","sessionID":"ses_dfc1da44fffeiiojDLF5bJvxyz","messageID":"msg_203e25c4d001nsLE0r3gI3ZLY9","type":"step-finish","reason":"tool-calls","cost":0,"tokens":{"total":15,"input":10,"output":5,"reasoning":0,"cache":{"read":0,"write":0}}},"time":1795361496345}');
INSERT INTO "event" VALUES('evt_203e25d1b001uiEfYhc0pqBblS','ses_dfc1da44fffeiiojDLF5bJvxyz',17,'message.updated.1','{"sessionID":"ses_dfc1da44fffeiiojDLF5bJvxyz","info":{"id":"msg_203e25c4d001nsLE0r3gI3ZLY9","sessionID":"ses_dfc1da44fffeiiojDLF5bJvxyz","role":"assistant","time":{"created":1795361496141},"parentID":"msg_203e25bd70011KN3OgboMl93Wv","modelID":"fixture-model","providerID":"fixture","mode":"build","agent":"build","path":{"cwd":"/tmp/loginom-fixture/project","root":"/"},"cost":0,"tokens":{"total":15,"input":10,"output":5,"reasoning":0,"cache":{"read":0,"write":0}},"finish":"tool-calls"}}');
INSERT INTO "event" VALUES('evt_203e25d1e001hdSAeWv5X0l7SP','ses_dfc1da44fffeiiojDLF5bJvxyz',18,'message.updated.1','{"sessionID":"ses_dfc1da44fffeiiojDLF5bJvxyz","info":{"id":"msg_203e25c4d001nsLE0r3gI3ZLY9","sessionID":"ses_dfc1da44fffeiiojDLF5bJvxyz","role":"assistant","time":{"created":1795361496141,"completed":1795361496350},"parentID":"msg_203e25bd70011KN3OgboMl93Wv","modelID":"fixture-model","providerID":"fixture","mode":"build","agent":"build","path":{"cwd":"/tmp/loginom-fixture/project","root":"/"},"cost":0,"tokens":{"total":15,"input":10,"output":5,"reasoning":0,"cache":{"read":0,"write":0}},"finish":"tool-calls"}}');
INSERT INTO "event" VALUES('evt_203e25d22001Z16bB3c66ijLPF','ses_dfc1da44fffeiiojDLF5bJvxyz',19,'message.updated.1','{"sessionID":"ses_dfc1da44fffeiiojDLF5bJvxyz","info":{"id":"msg_203e25d22001LEVN2PH42UpZe5","sessionID":"ses_dfc1da44fffeiiojDLF5bJvxyz","role":"assistant","time":{"created":1795361496354},"parentID":"msg_203e25bd70011KN3OgboMl93Wv","modelID":"fixture-model","providerID":"fixture","mode":"build","agent":"build","path":{"cwd":"/tmp/loginom-fixture/project","root":"/"},"cost":0,"tokens":{"input":0,"output":0,"reasoning":0,"cache":{"read":0,"write":0}}}}');
INSERT INTO "event" VALUES('evt_203e25d2700128uOAsRuZ9abOK','ses_dfc1da44fffeiiojDLF5bJvxyz',20,'session.updated.1','{"sessionID":"ses_dfc1da44fffeiiojDLF5bJvxyz","info":{"id":"ses_dfc1da44fffeiiojDLF5bJvxyz","slug":"crisp-cactus","projectID":"global","directory":"/tmp/loginom-fixture/project","path":"tmp/loginom-fixture/project","summary":{"additions":0,"deletions":0,"files":0},"cost":0,"tokens":{"input":10,"output":5,"reasoning":0,"cache":{"read":0,"write":0}},"title":"Fixture title","agent":"build","model":{"id":"fixture-model","providerID":"fixture","variant":"default"},"version":"local","time":{"created":1795361495984,"updated":1795361496359},"permission":[{"permission":"question","pattern":"*","action":"deny"},{"permission":"plan_enter","pattern":"*","action":"deny"},{"permission":"plan_exit","pattern":"*","action":"deny"}]}}');
INSERT INTO "event" VALUES('evt_203e25d2a001Prj4jT40KhUBji','ses_dfc1da44fffeiiojDLF5bJvxyz',21,'message.updated.1','{"sessionID":"ses_dfc1da44fffeiiojDLF5bJvxyz","info":{"id":"msg_203e25bd70011KN3OgboMl93Wv","sessionID":"ses_dfc1da44fffeiiojDLF5bJvxyz","role":"user","time":{"created":1795361496023},"summary":{"diffs":[]},"agent":"build","model":{"providerID":"fixture","modelID":"fixture-model"}}}');
INSERT INTO "event" VALUES('evt_203e25d36001e3v2gikaQyP3rb','ses_dfc1da44fffeiiojDLF5bJvxyz',22,'message.part.updated.1','{"sessionID":"ses_dfc1da44fffeiiojDLF5bJvxyz","part":{"id":"prt_203e25d3600171z10oZ0nDvTkg","sessionID":"ses_dfc1da44fffeiiojDLF5bJvxyz","messageID":"msg_203e25d22001LEVN2PH42UpZe5","type":"step-start"},"time":1795361496374}');
INSERT INTO "event" VALUES('evt_203e25d38001TJzH4w1ce3EDGX','ses_dfc1da44fffeiiojDLF5bJvxyz',23,'message.part.updated.1','{"sessionID":"ses_dfc1da44fffeiiojDLF5bJvxyz","part":{"id":"prt_203e25d38001iaprJMTL0IJrUy","sessionID":"ses_dfc1da44fffeiiojDLF5bJvxyz","messageID":"msg_203e25d22001LEVN2PH42UpZe5","type":"text","text":"","time":{"start":1795361496376}},"time":1795361496376}');
INSERT INTO "event" VALUES('evt_203e25d3a002m2JVG8uxsbl3Zn','ses_dfc1da44fffeiiojDLF5bJvxyz',24,'message.part.updated.1','{"sessionID":"ses_dfc1da44fffeiiojDLF5bJvxyz","part":{"id":"prt_203e25d38001iaprJMTL0IJrUy","sessionID":"ses_dfc1da44fffeiiojDLF5bJvxyz","messageID":"msg_203e25d22001LEVN2PH42UpZe5","type":"text","text":"The attachment has three rows.","time":{"start":1795361496376,"end":1795361496378}},"time":1795361496378}');
INSERT INTO "event" VALUES('evt_203e25d3c001lbDioY1aNT4Zbu','ses_dfc1da44fffeiiojDLF5bJvxyz',25,'message.part.updated.1','{"sessionID":"ses_dfc1da44fffeiiojDLF5bJvxyz","part":{"id":"prt_203e25d3c0010cuvNHQtc1vwhE","sessionID":"ses_dfc1da44fffeiiojDLF5bJvxyz","messageID":"msg_203e25d22001LEVN2PH42UpZe5","type":"step-finish","reason":"stop","cost":0,"tokens":{"total":15,"input":10,"output":5,"reasoning":0,"cache":{"read":0,"write":0}}},"time":1795361496380}');
INSERT INTO "event" VALUES('evt_203e25d3e001wItq0azi07bJrJ','ses_dfc1da44fffeiiojDLF5bJvxyz',26,'message.updated.1','{"sessionID":"ses_dfc1da44fffeiiojDLF5bJvxyz","info":{"id":"msg_203e25d22001LEVN2PH42UpZe5","sessionID":"ses_dfc1da44fffeiiojDLF5bJvxyz","role":"assistant","time":{"created":1795361496354},"parentID":"msg_203e25bd70011KN3OgboMl93Wv","modelID":"fixture-model","providerID":"fixture","mode":"build","agent":"build","path":{"cwd":"/tmp/loginom-fixture/project","root":"/"},"cost":0,"tokens":{"total":15,"input":10,"output":5,"reasoning":0,"cache":{"read":0,"write":0}},"finish":"stop"}}');
INSERT INTO "event" VALUES('evt_203e25d40001wuSTEDdjPaAonq','ses_dfc1da44fffeiiojDLF5bJvxyz',27,'message.updated.1','{"sessionID":"ses_dfc1da44fffeiiojDLF5bJvxyz","info":{"id":"msg_203e25d22001LEVN2PH42UpZe5","sessionID":"ses_dfc1da44fffeiiojDLF5bJvxyz","role":"assistant","time":{"created":1795361496354,"completed":1795361496384},"parentID":"msg_203e25bd70011KN3OgboMl93Wv","modelID":"fixture-model","providerID":"fixture","mode":"build","agent":"build","path":{"cwd":"/tmp/loginom-fixture/project","root":"/"},"cost":0,"tokens":{"total":15,"input":10,"output":5,"reasoning":0,"cache":{"read":0,"write":0}},"finish":"stop"}}');
INSERT INTO "event" VALUES('evt_203e25d53001gIsdVnFq5lH7og','ses_dfc1da44fffeiiojDLF5bJvxyz',28,'session.updated.1','{"sessionID":"ses_dfc1da44fffeiiojDLF5bJvxyz","info":{"id":"ses_dfc1da44fffeiiojDLF5bJvxyz","slug":"crisp-cactus","projectID":"global","directory":"/tmp/loginom-fixture/project","path":"tmp/loginom-fixture/project","summary":{"additions":0,"deletions":0,"files":0},"cost":0,"tokens":{"input":20,"output":10,"reasoning":0,"cache":{"read":0,"write":0}},"title":"Fixture title","agent":"build","model":{"id":"fixture-model","providerID":"fixture","variant":"default"},"version":"local","time":{"created":1795361495984,"updated":1795361496402},"permission":[{"permission":"question","pattern":"*","action":"deny"},{"permission":"plan_enter","pattern":"*","action":"deny"},{"permission":"plan_exit","pattern":"*","action":"deny"}]}}');
INSERT INTO "event" VALUES('evt_203e26cd00017GGIciXbrmUdoi','ses_dfc1d9331ffeZ2s7oliGcCs2PM',0,'session.created.1','{"sessionID":"ses_dfc1d9331ffeZ2s7oliGcCs2PM","info":{"id":"ses_dfc1d9331ffeZ2s7oliGcCs2PM","slug":"brave-meadow","projectID":"global","directory":"/tmp/loginom-fixture/project","path":"tmp/loginom-fixture/project","cost":0,"tokens":{"input":0,"output":0,"reasoning":0,"cache":{"read":0,"write":0}},"title":"New session - 2026-11-22T15:31:40.367Z","version":"local","time":{"created":1795361500367,"updated":1795361500367},"permission":[{"permission":"question","pattern":"*","action":"deny"},{"permission":"plan_enter","pattern":"*","action":"deny"},{"permission":"plan_exit","pattern":"*","action":"deny"}]}}');
INSERT INTO "event" VALUES('evt_203e26d02001zFYMiWpXqiJ8n3','ses_dfc1d9331ffeZ2s7oliGcCs2PM',1,'session.updated.1','{"sessionID":"ses_dfc1d9331ffeZ2s7oliGcCs2PM","info":{"id":"ses_dfc1d9331ffeZ2s7oliGcCs2PM","slug":"brave-meadow","projectID":"global","directory":"/tmp/loginom-fixture/project","path":"tmp/loginom-fixture/project","cost":0,"tokens":{"input":0,"output":0,"reasoning":0,"cache":{"read":0,"write":0}},"title":"New session - 2026-11-22T15:31:40.367Z","agent":"build","model":{"id":"fixture-model","providerID":"fixture","variant":"default"},"version":"local","time":{"created":1795361500367,"updated":1795361500416},"permission":[{"permission":"question","pattern":"*","action":"deny"},{"permission":"plan_enter","pattern":"*","action":"deny"},{"permission":"plan_exit","pattern":"*","action":"deny"}]}}');
INSERT INTO "event" VALUES('evt_203e26d09001SLlZUQsaa9Nnim','ses_dfc1d9331ffeZ2s7oliGcCs2PM',2,'message.updated.1','{"sessionID":"ses_dfc1d9331ffeZ2s7oliGcCs2PM","info":{"id":"msg_203e26d00001sOBQx8ddjfojXm","sessionID":"ses_dfc1d9331ffeZ2s7oliGcCs2PM","role":"user","time":{"created":1795361500416},"agent":"build","model":{"providerID":"fixture","modelID":"fixture-model"}}}');
INSERT INTO "event" VALUES('evt_203e26d0c001G3zmQ1bg9C4lBY','ses_dfc1d9331ffeZ2s7oliGcCs2PM',3,'message.part.updated.1','{"sessionID":"ses_dfc1d9331ffeZ2s7oliGcCs2PM","part":{"id":"prt_203e26d08001qz1UDZLtARDpra","sessionID":"ses_dfc1d9331ffeZ2s7oliGcCs2PM","messageID":"msg_203e26d00001sOBQx8ddjfojXm","type":"text","text":"Called the Read tool with the following input: {\"filePath\":\"notes.txt\"}","synthetic":true},"time":1795361500428}');
INSERT INTO "event" VALUES('evt_203e26d0f001nxiTSEzwe8Ymx4','ses_dfc1d9331ffeZ2s7oliGcCs2PM',4,'message.part.updated.1','{"sessionID":"ses_dfc1d9331ffeZ2s7oliGcCs2PM","part":{"id":"prt_203e26d08002cCDvFVNk6DywC1","sessionID":"ses_dfc1d9331ffeZ2s7oliGcCs2PM","messageID":"msg_203e26d00001sOBQx8ddjfojXm","type":"text","text":"Fixture attachment: three rows of sample data.\n","synthetic":true},"time":1795361500430}');
INSERT INTO "event" VALUES('evt_203e26d11001wLeEDxRMS00lDZ','ses_dfc1d9331ffeZ2s7oliGcCs2PM',5,'message.part.updated.1','{"sessionID":"ses_dfc1d9331ffeZ2s7oliGcCs2PM","part":{"id":"prt_203e26d08003I6l3jYhm3NHkcZ","sessionID":"ses_dfc1d9331ffeZ2s7oliGcCs2PM","messageID":"msg_203e26d00001sOBQx8ddjfojXm","type":"file","mime":"text/plain","filename":"notes.txt","url":"data:text/plain;base64,Rml4dHVyZSBhdHRhY2htZW50OiB0aHJlZSByb3dzIG9mIHNhbXBsZSBkYXRhLgo="},"time":1795361500432}');
INSERT INTO "event" VALUES('evt_203e26d13001t70RU8Opy2xING','ses_dfc1d9331ffeZ2s7oliGcCs2PM',6,'message.part.updated.1','{"sessionID":"ses_dfc1d9331ffeZ2s7oliGcCs2PM","part":{"id":"prt_203e26d08004vtzaZFuXuDyAf3","sessionID":"ses_dfc1d9331ffeZ2s7oliGcCs2PM","messageID":"msg_203e26d00001sOBQx8ddjfojXm","type":"text","text":"\"Third session: what is in the attached file?\nFIXTURE-SCRIPT:W3sidGV4dCI6IlRoZSBhdHRhY2hlZCBub3RlcyBoYXZlIG9uZSBsaW5lLiJ9XQ==\""},"time":1795361500435}');
INSERT INTO "event" VALUES('evt_203e26d17001luMmFlFH86EKr1','ses_dfc1d9331ffeZ2s7oliGcCs2PM',7,'session.updated.1','{"sessionID":"ses_dfc1d9331ffeZ2s7oliGcCs2PM","info":{"id":"ses_dfc1d9331ffeZ2s7oliGcCs2PM","slug":"brave-meadow","projectID":"global","directory":"/tmp/loginom-fixture/project","path":"tmp/loginom-fixture/project","cost":0,"tokens":{"input":0,"output":0,"reasoning":0,"cache":{"read":0,"write":0}},"title":"New session - 2026-11-22T15:31:40.367Z","agent":"build","model":{"id":"fixture-model","providerID":"fixture","variant":"default"},"version":"local","time":{"created":1795361500367,"updated":1795361500439},"permission":[{"permission":"question","pattern":"*","action":"deny"},{"permission":"plan_enter","pattern":"*","action":"deny"},{"permission":"plan_exit","pattern":"*","action":"deny"}]}}');
INSERT INTO "event" VALUES('evt_203e26d430017SN2WW5AwnDZ5w','ses_dfc1d9331ffeZ2s7oliGcCs2PM',8,'message.updated.1','{"sessionID":"ses_dfc1d9331ffeZ2s7oliGcCs2PM","info":{"id":"msg_203e26d430017qmLgiH7osI0k1","sessionID":"ses_dfc1d9331ffeZ2s7oliGcCs2PM","role":"assistant","time":{"created":1795361500483},"parentID":"msg_203e26d00001sOBQx8ddjfojXm","modelID":"fixture-model","providerID":"fixture","mode":"build","agent":"build","path":{"cwd":"/tmp/loginom-fixture/project","root":"/"},"cost":0,"tokens":{"input":0,"output":0,"reasoning":0,"cache":{"read":0,"write":0}}}}');
INSERT INTO "event" VALUES('evt_203e26d760014AnKjS8ySGtfn2','ses_dfc1d9331ffeZ2s7oliGcCs2PM',9,'session.updated.1','{"sessionID":"ses_dfc1d9331ffeZ2s7oliGcCs2PM","info":{"id":"ses_dfc1d9331ffeZ2s7oliGcCs2PM","slug":"brave-meadow","projectID":"global","directory":"/tmp/loginom-fixture/project","path":"tmp/loginom-fixture/project","summary":{"additions":0,"deletions":0,"files":0},"cost":0,"tokens":{"input":0,"output":0,"reasoning":0,"cache":{"read":0,"write":0}},"title":"New session - 2026-11-22T15:31:40.367Z","agent":"build","model":{"id":"fixture-model","providerID":"fixture","variant":"default"},"version":"local","time":{"created":1795361500367,"updated":1795361500534},"permission":[{"permission":"question","pattern":"*","action":"deny"},{"permission":"plan_enter","pattern":"*","action":"deny"},{"permission":"plan_exit","pattern":"*","action":"deny"}]}}');
INSERT INTO "event" VALUES('evt_203e26d7a001kLaUWg3AatvFAd','ses_dfc1d9331ffeZ2s7oliGcCs2PM',10,'message.updated.1','{"sessionID":"ses_dfc1d9331ffeZ2s7oliGcCs2PM","info":{"id":"msg_203e26d00001sOBQx8ddjfojXm","sessionID":"ses_dfc1d9331ffeZ2s7oliGcCs2PM","role":"user","time":{"created":1795361500416},"summary":{"diffs":[]},"agent":"build","model":{"providerID":"fixture","modelID":"fixture-model"}}}');
INSERT INTO "event" VALUES('evt_203e26d87001ACJU43m2pI3k2x','ses_dfc1d9331ffeZ2s7oliGcCs2PM',11,'session.updated.1','{"sessionID":"ses_dfc1d9331ffeZ2s7oliGcCs2PM","info":{"id":"ses_dfc1d9331ffeZ2s7oliGcCs2PM","slug":"brave-meadow","projectID":"global","directory":"/tmp/loginom-fixture/project","path":"tmp/loginom-fixture/project","summary":{"additions":0,"deletions":0,"files":0},"cost":0,"tokens":{"input":0,"output":0,"reasoning":0,"cache":{"read":0,"write":0}},"title":"Fixture title","agent":"build","model":{"id":"fixture-model","providerID":"fixture","variant":"default"},"version":"local","time":{"created":1795361500367,"updated":1795361500534},"permission":[{"permission":"question","pattern":"*","action":"deny"},{"permission":"plan_enter","pattern":"*","action":"deny"},{"permission":"plan_exit","pattern":"*","action":"deny"}]}}');
INSERT INTO "event" VALUES('evt_203e26e01001K7913ZM00HigON','ses_dfc1d9331ffeZ2s7oliGcCs2PM',12,'message.part.updated.1','{"sessionID":"ses_dfc1d9331ffeZ2s7oliGcCs2PM","part":{"id":"prt_203e26e01001RkVtz0gBUnemKT","sessionID":"ses_dfc1d9331ffeZ2s7oliGcCs2PM","messageID":"msg_203e26d430017qmLgiH7osI0k1","type":"step-start"},"time":1795361500673}');
INSERT INTO "event" VALUES('evt_203e26e03001EW3d8ORkik9XWe','ses_dfc1d9331ffeZ2s7oliGcCs2PM',13,'message.part.updated.1','{"sessionID":"ses_dfc1d9331ffeZ2s7oliGcCs2PM","part":{"id":"prt_203e26e03001Jy6ZEX0CUa8Nrd","sessionID":"ses_dfc1d9331ffeZ2s7oliGcCs2PM","messageID":"msg_203e26d430017qmLgiH7osI0k1","type":"text","text":"","time":{"start":1795361500675}},"time":1795361500675}');
INSERT INTO "event" VALUES('evt_203e26e06002T4arkNeJlDzETQ','ses_dfc1d9331ffeZ2s7oliGcCs2PM',14,'message.part.updated.1','{"sessionID":"ses_dfc1d9331ffeZ2s7oliGcCs2PM","part":{"id":"prt_203e26e03001Jy6ZEX0CUa8Nrd","sessionID":"ses_dfc1d9331ffeZ2s7oliGcCs2PM","messageID":"msg_203e26d430017qmLgiH7osI0k1","type":"text","text":"The attached notes have one line.","time":{"start":1795361500675,"end":1795361500678}},"time":1795361500678}');
INSERT INTO "event" VALUES('evt_203e26e0a001SAvG6IeTQnhOlY','ses_dfc1d9331ffeZ2s7oliGcCs2PM',15,'message.part.updated.1','{"sessionID":"ses_dfc1d9331ffeZ2s7oliGcCs2PM","part":{"id":"prt_203e26e0a0014SOxiuJVmTZ8Gk","sessionID":"ses_dfc1d9331ffeZ2s7oliGcCs2PM","messageID":"msg_203e26d430017qmLgiH7osI0k1","type":"step-finish","reason":"stop","cost":0,"tokens":{"total":15,"input":10,"output":5,"reasoning":0,"cache":{"read":0,"write":0}}},"time":1795361500682}');
INSERT INTO "event" VALUES('evt_203e26e0c001eAk2CU3t6iowaz','ses_dfc1d9331ffeZ2s7oliGcCs2PM',16,'message.updated.1','{"sessionID":"ses_dfc1d9331ffeZ2s7oliGcCs2PM","info":{"id":"msg_203e26d430017qmLgiH7osI0k1","sessionID":"ses_dfc1d9331ffeZ2s7oliGcCs2PM","role":"assistant","time":{"created":1795361500483},"parentID":"msg_203e26d00001sOBQx8ddjfojXm","modelID":"fixture-model","providerID":"fixture","mode":"build","agent":"build","path":{"cwd":"/tmp/loginom-fixture/project","root":"/"},"cost":0,"tokens":{"total":15,"input":10,"output":5,"reasoning":0,"cache":{"read":0,"write":0}},"finish":"stop"}}');
INSERT INTO "event" VALUES('evt_203e26e10001eDWfq40JFqRHWY','ses_dfc1d9331ffeZ2s7oliGcCs2PM',17,'message.updated.1','{"sessionID":"ses_dfc1d9331ffeZ2s7oliGcCs2PM","info":{"id":"msg_203e26d430017qmLgiH7osI0k1","sessionID":"ses_dfc1d9331ffeZ2s7oliGcCs2PM","role":"assistant","time":{"created":1795361500483,"completed":1795361500687},"parentID":"msg_203e26d00001sOBQx8ddjfojXm","modelID":"fixture-model","providerID":"fixture","mode":"build","agent":"build","path":{"cwd":"/tmp/loginom-fixture/project","root":"/"},"cost":0,"tokens":{"total":15,"input":10,"output":5,"reasoning":0,"cache":{"read":0,"write":0}},"finish":"stop"}}');
INSERT INTO "event" VALUES('evt_203e26e17001uR2gFEgUaLN2NY','ses_dfc1d9331ffeZ2s7oliGcCs2PM',18,'session.updated.1','{"sessionID":"ses_dfc1d9331ffeZ2s7oliGcCs2PM","info":{"id":"ses_dfc1d9331ffeZ2s7oliGcCs2PM","slug":"brave-meadow","projectID":"global","directory":"/tmp/loginom-fixture/project","path":"tmp/loginom-fixture/project","summary":{"additions":0,"deletions":0,"files":0},"cost":0,"tokens":{"input":10,"output":5,"reasoning":0,"cache":{"read":0,"write":0}},"title":"Fixture title","agent":"build","model":{"id":"fixture-model","providerID":"fixture","variant":"default"},"version":"local","time":{"created":1795361500367,"updated":1795361500695},"permission":[{"permission":"question","pattern":"*","action":"deny"},{"permission":"plan_enter","pattern":"*","action":"deny"},{"permission":"plan_exit","pattern":"*","action":"deny"}]}}');
INSERT INTO "event" VALUES('evt_203e26e22001FE6CAA2wk5UpbO','ses_dfc1d9331ffeZ2s7oliGcCs2PM',19,'message.updated.1','{"sessionID":"ses_dfc1d9331ffeZ2s7oliGcCs2PM","info":{"id":"msg_203e26d00001sOBQx8ddjfojXm","sessionID":"ses_dfc1d9331ffeZ2s7oliGcCs2PM","role":"user","time":{"created":1795361500416},"summary":{"diffs":[]},"agent":"build","model":{"providerID":"fixture","modelID":"fixture-model"}}}');
INSERT INTO "project" VALUES('global','/',NULL,NULL,NULL,NULL,NULL,1795361489856,1795361500052,NULL,'[]',NULL);
INSERT INTO "message" VALUES('msg_203e24759001eryjJ5PQ9KHOI8','ses_dfc1db8dbffe89FPcpHa2oZ96p',1795361490777,1795361490920,'{"role":"user","time":{"created":1795361490777},"agent":"build","model":{"providerID":"fixture","modelID":"fixture-model"},"summary":{"diffs":[]}}');
INSERT INTO "message" VALUES('msg_203e2478c001okkwEs9XGgI40C','ses_dfc1db8dbffe89FPcpHa2oZ96p',1795361490828,1795361491047,'{"parentID":"msg_203e24759001eryjJ5PQ9KHOI8","role":"assistant","mode":"build","agent":"build","path":{"cwd":"/tmp/loginom-fixture/project","root":"/"},"cost":0,"tokens":{"total":15,"input":10,"output":5,"reasoning":0,"cache":{"write":0,"read":0}},"modelID":"fixture-model","providerID":"fixture","time":{"created":1795361490828,"completed":1795361491047},"finish":"stop"}');
INSERT INTO "message" VALUES('msg_203e25189001enjDmfxXnxU4Ls','ses_dfc1db8dbffe89FPcpHa2oZ96p',1795361493385,1795361493488,'{"role":"user","time":{"created":1795361493385},"agent":"build","model":{"providerID":"fixture","modelID":"fixture-model"},"summary":{"diffs":[]}}');
INSERT INTO "message" VALUES('msg_203e251ce001M4SuJxmmAKdxvV','ses_dfc1db8dbffe89FPcpHa2oZ96p',1795361493454,1795361493679,'{"parentID":"msg_203e25189001enjDmfxXnxU4Ls","role":"assistant","mode":"build","agent":"build","path":{"cwd":"/tmp/loginom-fixture/project","root":"/"},"cost":0,"tokens":{"total":15,"input":10,"output":5,"reasoning":0,"cache":{"write":0,"read":0}},"modelID":"fixture-model","providerID":"fixture","time":{"created":1795361493454,"completed":1795361493678},"finish":"stop"}');
INSERT INTO "message" VALUES('msg_203e25bd70011KN3OgboMl93Wv','ses_dfc1da44fffeiiojDLF5bJvxyz',1795361496023,1795361496363,'{"role":"user","time":{"created":1795361496023},"agent":"build","model":{"providerID":"fixture","modelID":"fixture-model"},"summary":{"diffs":[]}}');
INSERT INTO "message" VALUES('msg_203e25c4d001nsLE0r3gI3ZLY9','ses_dfc1da44fffeiiojDLF5bJvxyz',1795361496141,1795361496351,'{"parentID":"msg_203e25bd70011KN3OgboMl93Wv","role":"assistant","mode":"build","agent":"build","path":{"cwd":"/tmp/loginom-fixture/project","root":"/"},"cost":0,"tokens":{"total":15,"input":10,"output":5,"reasoning":0,"cache":{"write":0,"read":0}},"modelID":"fixture-model","providerID":"fixture","time":{"created":1795361496141,"completed":1795361496350},"finish":"tool-calls"}');
INSERT INTO "message" VALUES('msg_203e25d22001LEVN2PH42UpZe5','ses_dfc1da44fffeiiojDLF5bJvxyz',1795361496354,1795361496385,'{"parentID":"msg_203e25bd70011KN3OgboMl93Wv","role":"assistant","mode":"build","agent":"build","path":{"cwd":"/tmp/loginom-fixture/project","root":"/"},"cost":0,"tokens":{"total":15,"input":10,"output":5,"reasoning":0,"cache":{"write":0,"read":0}},"modelID":"fixture-model","providerID":"fixture","time":{"created":1795361496354,"completed":1795361496384},"finish":"stop"}');
INSERT INTO "message" VALUES('msg_203e26d00001sOBQx8ddjfojXm','ses_dfc1d9331ffeZ2s7oliGcCs2PM',1795361500416,1795361500707,'{"role":"user","time":{"created":1795361500416},"agent":"build","model":{"providerID":"fixture","modelID":"fixture-model"},"summary":{"diffs":[]}}');
INSERT INTO "message" VALUES('msg_203e26d430017qmLgiH7osI0k1','ses_dfc1d9331ffeZ2s7oliGcCs2PM',1795361500483,1795361500688,'{"parentID":"msg_203e26d00001sOBQx8ddjfojXm","role":"assistant","mode":"build","agent":"build","path":{"cwd":"/tmp/loginom-fixture/project","root":"/"},"cost":0,"tokens":{"total":15,"input":10,"output":5,"reasoning":0,"cache":{"write":0,"read":0}},"modelID":"fixture-model","providerID":"fixture","time":{"created":1795361500483,"completed":1795361500687},"finish":"stop"}');
INSERT INTO "part" VALUES('prt_203e24760001h7oID3EcFQBVhi','msg_203e24759001eryjJ5PQ9KHOI8','ses_dfc1db8dbffe89FPcpHa2oZ96p',1795361490788,1795361490790,'{"type":"text","text":"\"First session: what is the answer?\nFIXTURE-SCRIPT:W3sidGV4dCI6IkhlbGxvISBUaGUgYW5zd2VyIGlzIDQyLiJ9XQ==\""}');
INSERT INTO "part" VALUES('prt_203e2485a001bnRbeskPxzfuzF','msg_203e2478c001okkwEs9XGgI40C','ses_dfc1db8dbffe89FPcpHa2oZ96p',1795361491034,1795361491035,'{"type":"step-start"}');
INSERT INTO "part" VALUES('prt_203e2485c001hF33kU1DIBbKNu','msg_203e2478c001okkwEs9XGgI40C','ses_dfc1db8dbffe89FPcpHa2oZ96p',1795361491036,1795361491040,'{"type":"text","text":"Hello! The answer is 42.","time":{"start":1795361491036,"end":1795361491039}}');
INSERT INTO "part" VALUES('prt_203e24862001zjQ5gVYmseiKQe','msg_203e2478c001okkwEs9XGgI40C','ses_dfc1db8dbffe89FPcpHa2oZ96p',1795361491042,1795361491043,'{"reason":"stop","type":"step-finish","tokens":{"total":15,"input":10,"output":5,"reasoning":0,"cache":{"write":0,"read":0}},"cost":0}');
INSERT INTO "part" VALUES('prt_203e2518c001RkVt2O8FpI47Et','msg_203e25189001enjDmfxXnxU4Ls','ses_dfc1db8dbffe89FPcpHa2oZ96p',1795361493395,1795361493397,'{"type":"text","text":"\"Second turn in the first session.\nFIXTURE-SCRIPT:W3sidGV4dCI6IkNvbnRpbnVlZDogc3RpbGwgNDIuIn1d\""}');
INSERT INTO "part" VALUES('prt_203e2529c001Wh12LHXoV4ZbVU','msg_203e251ce001M4SuJxmmAKdxvV','ses_dfc1db8dbffe89FPcpHa2oZ96p',1795361493660,1795361493662,'{"type":"step-start"}');
INSERT INTO "part" VALUES('prt_203e2529f001CShzf7obtTfoB1','msg_203e251ce001M4SuJxmmAKdxvV','ses_dfc1db8dbffe89FPcpHa2oZ96p',1795361493663,1795361493667,'{"type":"text","text":"Continued: still 42.","time":{"start":1795361493663,"end":1795361493666}}');
INSERT INTO "part" VALUES('prt_203e252a8001dzyrORib3VSwDI','msg_203e251ce001M4SuJxmmAKdxvV','ses_dfc1db8dbffe89FPcpHa2oZ96p',1795361493672,1795361493673,'{"reason":"stop","type":"step-finish","tokens":{"total":15,"input":10,"output":5,"reasoning":0,"cache":{"write":0,"read":0}},"cost":0}');
INSERT INTO "part" VALUES('prt_203e25c31001X3Rg0XVksbjvik','msg_203e25bd70011KN3OgboMl93Wv','ses_dfc1da44fffeiiojDLF5bJvxyz',1795361496118,1795361496119,'{"type":"text","synthetic":true,"text":"Called the Read tool with the following input: {\"filePath\":\"/tmp/loginom-fixture/project/notes.txt\"}"}');
INSERT INTO "part" VALUES('prt_203e25c31002bOKXp7Xlfx87JN','msg_203e25bd70011KN3OgboMl93Wv','ses_dfc1da44fffeiiojDLF5bJvxyz',1795361496120,1795361496121,'{"type":"text","synthetic":true,"text":"<path>/tmp/loginom-fixture/project/notes.txt</path>\n<type>file</type>\n<content>\n1: Fixture attachment: three rows of sample data.\n\n(End of file - total 1 lines)\n</content>"}');
INSERT INTO "part" VALUES('prt_203e25c31003cU6fU073fmCSGh','msg_203e25bd70011KN3OgboMl93Wv','ses_dfc1da44fffeiiojDLF5bJvxyz',1795361496122,1795361496123,'{"type":"file","mime":"text/plain","filename":"notes.txt","url":"file:///tmp/loginom-fixture/project/notes.txt"}');
INSERT INTO "part" VALUES('prt_203e25c3100495ev6ICfQlM29Y','msg_203e25bd70011KN3OgboMl93Wv','ses_dfc1da44fffeiiojDLF5bJvxyz',1795361496124,1795361496125,'{"type":"text","text":"\"Second session: summarize the attached notes.\nFIXTURE-SCRIPT:W3sidG9vbCI6InJlYWQiLCJpbnB1dCI6eyJmaWxlUGF0aCI6Ii90bXAvbG9naW5vbS1maXh0dXJlL3Byb2plY3Qvbm90ZXMudHh0In19LHsidGV4dCI6IlRoZSBhdHRhY2htZW50IGhhcyB0aHJlZSByb3dzLiJ9XQ==\""}');
INSERT INTO "part" VALUES('prt_203e25d0300156CAFsAEohnp1v','msg_203e25c4d001nsLE0r3gI3ZLY9','ses_dfc1da44fffeiiojDLF5bJvxyz',1795361496323,1795361496324,'{"type":"step-start"}');
INSERT INTO "part" VALUES('prt_203e25d06001vsNVBal5A9PHJX','msg_203e25c4d001nsLE0r3gI3ZLY9','ses_dfc1da44fffeiiojDLF5bJvxyz',1795361496326,1795361496342,'{"type":"tool","tool":"read","callID":"call_5","state":{"status":"completed","input":{"filePath":"/tmp/loginom-fixture/project/notes.txt"},"output":"<path>/tmp/loginom-fixture/project/notes.txt</path>\n<type>file</type>\n<content>\n1: Fixture attachment: three rows of sample data.\n\n(End of file - total 1 lines)\n</content>","metadata":{"preview":"Fixture attachment: three rows of sample data.","truncated":false,"loaded":[],"display":{"type":"file","path":"/tmp/loginom-fixture/project/notes.txt","text":"Fixture attachment: three rows of sample data.","lineStart":1,"lineEnd":1,"totalLines":1,"truncated":false}},"title":"tmp/loginom-fixture/project/notes.txt","time":{"start":1795361496333,"end":1795361496341}}}');
INSERT INTO "part" VALUES('prt_203e25d19001crniphM9fDpY6q','msg_203e25c4d001nsLE0r3gI3ZLY9','ses_dfc1da44fffeiiojDLF5bJvxyz',1795361496345,1795361496345,'{"reason":"tool-calls","type":"step-finish","tokens":{"total":15,"input":10,"output":5,"reasoning":0,"cache":{"write":0,"read":0}},"cost":0}');
INSERT INTO "part" VALUES('prt_203e25d3600171z10oZ0nDvTkg','msg_203e25d22001LEVN2PH42UpZe5','ses_dfc1da44fffeiiojDLF5bJvxyz',1795361496374,1795361496375,'{"type":"step-start"}');
INSERT INTO "part" VALUES('prt_203e25d38001iaprJMTL0IJrUy','msg_203e25d22001LEVN2PH42UpZe5','ses_dfc1da44fffeiiojDLF5bJvxyz',1795361496376,1795361496379,'{"type":"text","text":"The attachment has three rows.","time":{"start":1795361496376,"end":1795361496378}}');
INSERT INTO "part" VALUES('prt_203e25d3c0010cuvNHQtc1vwhE','msg_203e25d22001LEVN2PH42UpZe5','ses_dfc1da44fffeiiojDLF5bJvxyz',1795361496380,1795361496381,'{"reason":"stop","type":"step-finish","tokens":{"total":15,"input":10,"output":5,"reasoning":0,"cache":{"write":0,"read":0}},"cost":0}');
INSERT INTO "part" VALUES('prt_203e26d08001qz1UDZLtARDpra','msg_203e26d00001sOBQx8ddjfojXm','ses_dfc1d9331ffeZ2s7oliGcCs2PM',1795361500428,1795361500429,'{"type":"text","synthetic":true,"text":"Called the Read tool with the following input: {\"filePath\":\"notes.txt\"}"}');
INSERT INTO "part" VALUES('prt_203e26d08002cCDvFVNk6DywC1','msg_203e26d00001sOBQx8ddjfojXm','ses_dfc1d9331ffeZ2s7oliGcCs2PM',1795361500430,1795361500432,'{"type":"text","synthetic":true,"text":"Fixture attachment: three rows of sample data.\n"}');
INSERT INTO "part" VALUES('prt_203e26d08003I6l3jYhm3NHkcZ','msg_203e26d00001sOBQx8ddjfojXm','ses_dfc1d9331ffeZ2s7oliGcCs2PM',1795361500432,1795361500434,'{"type":"file","mime":"text/plain","filename":"notes.txt","url":"data:text/plain;base64,Rml4dHVyZSBhdHRhY2htZW50OiB0aHJlZSByb3dzIG9mIHNhbXBsZSBkYXRhLgo="}');
INSERT INTO "part" VALUES('prt_203e26d08004vtzaZFuXuDyAf3','msg_203e26d00001sOBQx8ddjfojXm','ses_dfc1d9331ffeZ2s7oliGcCs2PM',1795361500435,1795361500436,'{"type":"text","text":"\"Third session: what is in the attached file?\nFIXTURE-SCRIPT:W3sidGV4dCI6IlRoZSBhdHRhY2hlZCBub3RlcyBoYXZlIG9uZSBsaW5lLiJ9XQ==\""}');
INSERT INTO "part" VALUES('prt_203e26e01001RkVtz0gBUnemKT','msg_203e26d430017qmLgiH7osI0k1','ses_dfc1d9331ffeZ2s7oliGcCs2PM',1795361500673,1795361500674,'{"type":"step-start"}');
INSERT INTO "part" VALUES('prt_203e26e03001Jy6ZEX0CUa8Nrd','msg_203e26d430017qmLgiH7osI0k1','ses_dfc1d9331ffeZ2s7oliGcCs2PM',1795361500675,1795361500679,'{"type":"text","text":"The attached notes have one line.","time":{"start":1795361500675,"end":1795361500678}}');
INSERT INTO "part" VALUES('prt_203e26e0a0014SOxiuJVmTZ8Gk','msg_203e26d430017qmLgiH7osI0k1','ses_dfc1d9331ffeZ2s7oliGcCs2PM',1795361500682,1795361500683,'{"reason":"stop","type":"step-finish","tokens":{"total":15,"input":10,"output":5,"reasoning":0,"cache":{"write":0,"read":0}},"cost":0}');
INSERT INTO "session" VALUES('ses_dfc1db8dbffe89FPcpHa2oZ96p','global',NULL,NULL,'misty-tiger','/tmp/loginom-fixture/project','tmp/loginom-fixture/project','Fixture title','local',NULL,0,0,0,NULL,NULL,0.0,20,10,0,0,0,NULL,'[{"permission":"question","pattern":"*","action":"deny"},{"permission":"plan_enter","pattern":"*","action":"deny"},{"permission":"plan_exit","pattern":"*","action":"deny"}]','build','{"id":"fixture-model","providerID":"fixture","variant":"default"}',1795361490724,1795361493697,NULL,NULL);
INSERT INTO "session" VALUES('ses_dfc1da44fffeiiojDLF5bJvxyz','global',NULL,NULL,'crisp-cactus','/tmp/loginom-fixture/project','tmp/loginom-fixture/project','Fixture title','local',NULL,0,0,0,NULL,NULL,0.0,20,10,0,0,0,NULL,'[{"permission":"question","pattern":"*","action":"deny"},{"permission":"plan_enter","pattern":"*","action":"deny"},{"permission":"plan_exit","pattern":"*","action":"deny"}]','build','{"id":"fixture-model","providerID":"fixture","variant":"default"}',1795361495984,1795361496402,NULL,NULL);
INSERT INTO "session" VALUES('ses_dfc1d9331ffeZ2s7oliGcCs2PM','global',NULL,NULL,'brave-meadow','/tmp/loginom-fixture/project','tmp/loginom-fixture/project','Fixture title','local',NULL,0,0,0,NULL,NULL,0.0,10,5,0,0,0,NULL,'[{"permission":"question","pattern":"*","action":"deny"},{"permission":"plan_enter","pattern":"*","action":"deny"},{"permission":"plan_exit","pattern":"*","action":"deny"}]','build','{"id":"fixture-model","providerID":"fixture","variant":"default"}',1795361500367,1795361500695,NULL,NULL);
INSERT INTO "migration" VALUES('20260127222353_familiar_lady_ursula',1795361489698);
INSERT INTO "migration" VALUES('20260211171708_add_project_commands',1795361489699);
INSERT INTO "migration" VALUES('20260213144116_wakeful_the_professor',1795361489699);
INSERT INTO "migration" VALUES('20260225215848_workspace',1795361489699);
INSERT INTO "migration" VALUES('20260227213759_add_session_workspace_id',1795361489699);
INSERT INTO "migration" VALUES('20260228203230_blue_harpoon',1795361489700);
INSERT INTO "migration" VALUES('20260303231226_add_workspace_fields',1795361489700);
INSERT INTO "migration" VALUES('20260309230000_move_org_to_state',1795361489700);
INSERT INTO "migration" VALUES('20260312043431_session_message_cursor',1795361489700);
INSERT INTO "migration" VALUES('20260323234822_events',1795361489700);
INSERT INTO "migration" VALUES('20260410174513_workspace-name',1795361489700);
INSERT INTO "migration" VALUES('20260413175956_chief_energizer',1795361489700);
INSERT INTO "migration" VALUES('20260423070820_add_icon_url_override',1795361489700);
INSERT INTO "migration" VALUES('20260427172553_slow_nightmare',1795361489701);
INSERT INTO "migration" VALUES('20260428004200_add_session_path',1795361489701);
INSERT INTO "migration" VALUES('20260501142318_next_venus',1795361489701);
INSERT INTO "migration" VALUES('20260504145000_add_sync_owner',1795361489701);
INSERT INTO "migration" VALUES('20260507164347_add_workspace_time',1795361489701);
INSERT INTO "migration" VALUES('20260510033149_session_usage',1795361489701);
INSERT INTO "migration" VALUES('20260511000411_data_migration_state',1795361489702);
INSERT INTO "migration" VALUES('20260511173437_session-metadata',1795361489702);
INSERT INTO "migration" VALUES('20260601010001_normalize_storage_paths',1795361489702);
INSERT INTO "migration" VALUES('20260601202201_amazing_prowler',1795361489702);
INSERT INTO "migration" VALUES('20260602002951_lowly_union_jack',1795361489702);
INSERT INTO "migration" VALUES('20260602182828_add_project_directories',1795361489702);
INSERT INTO "migration" VALUES('20260603001617_session_message_projection_indexes',1795361489703);
INSERT INTO "migration" VALUES('20260603040000_session_message_projection_order',1795361489703);
INSERT INTO "migration" VALUES('20260603141458_session_input_inbox',1795361489703);
INSERT INTO "migration" VALUES('20260603160727_jittery_ezekiel_stane',1795361489703);
INSERT INTO "migration" VALUES('20260604172448_event_sourced_session_input',1795361489703);
INSERT INTO "migration" VALUES('20260605003541_add_session_context_snapshot',1795361489703);
INSERT INTO "migration" VALUES('20260605042240_add_context_epoch_agent',1795361489703);
INSERT INTO "migration" VALUES('20260611035744_credential',1795361489703);
INSERT INTO "migration" VALUES('20260611192811_lush_chimera',1795361489703);
INSERT INTO "migration" VALUES('20260612174303_project_dir_strategy',1795361489703);
INSERT INTO "migration" VALUES('20260622142730_simplify_session_context_epoch',1795361489703);
INSERT INTO "migration" VALUES('20260622170816_reset_v2_session_state',1795361489704);
INSERT INTO "migration" VALUES('20260622202450_simplify_session_input',1795361489704);
CREATE UNIQUE INDEX `event_aggregate_seq_idx` ON `event` (`aggregate_id`,`seq`);
CREATE INDEX `event_aggregate_type_seq_idx` ON `event` (`aggregate_id`,`type`,`seq`);
CREATE UNIQUE INDEX `permission_project_action_resource_idx` ON `permission` (`project_id`,`action`,`resource`);
CREATE INDEX `message_session_time_created_id_idx` ON `message` (`session_id`,`time_created`,`id`);
CREATE INDEX `part_message_id_id_idx` ON `part` (`message_id`,`id`);
CREATE INDEX `part_session_idx` ON `part` (`session_id`);
CREATE INDEX `session_input_session_pending_delivery_seq_idx` ON `session_input` (`session_id`,`promoted_seq`,`delivery`,`admitted_seq`);
CREATE UNIQUE INDEX `session_input_session_admitted_seq_idx` ON `session_input` (`session_id`,`admitted_seq`);
CREATE UNIQUE INDEX `session_input_session_promoted_seq_idx` ON `session_input` (`session_id`,`promoted_seq`);
CREATE UNIQUE INDEX `session_message_session_seq_idx` ON `session_message` (`session_id`,`seq`);
CREATE INDEX `session_message_session_type_seq_idx` ON `session_message` (`session_id`,`type`,`seq`);
CREATE INDEX `session_message_session_time_created_id_idx` ON `session_message` (`session_id`,`time_created`,`id`);
CREATE INDEX `session_message_time_created_idx` ON `session_message` (`time_created`);
CREATE INDEX `session_project_idx` ON `session` (`project_id`);
CREATE INDEX `session_workspace_idx` ON `session` (`workspace_id`);
CREATE INDEX `session_parent_idx` ON `session` (`parent_id`);
CREATE INDEX `todo_session_idx` ON `todo` (`session_id`);
COMMIT;
