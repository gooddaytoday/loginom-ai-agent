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
INSERT INTO "event_sequence" VALUES('ses_dfc1cebaeffeJboO7nU7RBSAUo',28,NULL);
INSERT INTO "event_sequence" VALUES('ses_dfc1cd836ffeH719EHffD9cPhW',28,NULL);
INSERT INTO "event_sequence" VALUES('ses_dfc1cc978ffeMiptdveabobUqg',19,NULL);
INSERT INTO "event" VALUES('evt_203e31453001j13BrQgJoUKxN6','ses_dfc1cebaeffeJboO7nU7RBSAUo',0,'session.created.1','{"sessionID":"ses_dfc1cebaeffeJboO7nU7RBSAUo","info":{"id":"ses_dfc1cebaeffeJboO7nU7RBSAUo","slug":"stellar-squid","projectID":"global","directory":"/tmp/loginom-fixture/project","path":"tmp/loginom-fixture/project","cost":0,"tokens":{"input":0,"output":0,"reasoning":0,"cache":{"read":0,"write":0}},"title":"New session - 2026-11-22T15:32:23.250Z","version":"local","time":{"created":1795361543250,"updated":1795361543250},"permission":[{"permission":"question","pattern":"*","action":"deny"},{"permission":"plan_enter","pattern":"*","action":"deny"},{"permission":"plan_exit","pattern":"*","action":"deny"}]}}');
INSERT INTO "event" VALUES('evt_203e3148e001dsJuurzM2Pjpzt','ses_dfc1cebaeffeJboO7nU7RBSAUo',1,'session.updated.1','{"sessionID":"ses_dfc1cebaeffeJboO7nU7RBSAUo","info":{"id":"ses_dfc1cebaeffeJboO7nU7RBSAUo","slug":"stellar-squid","projectID":"global","directory":"/tmp/loginom-fixture/project","path":"tmp/loginom-fixture/project","cost":0,"tokens":{"input":0,"output":0,"reasoning":0,"cache":{"read":0,"write":0}},"title":"New session - 2026-11-22T15:32:23.250Z","agent":"build","model":{"id":"fixture-model","providerID":"fixture","variant":"default"},"version":"local","time":{"created":1795361543250,"updated":1795361543308},"permission":[{"permission":"question","pattern":"*","action":"deny"},{"permission":"plan_enter","pattern":"*","action":"deny"},{"permission":"plan_exit","pattern":"*","action":"deny"}]}}');
INSERT INTO "event" VALUES('evt_203e314950016ElvdkoxZ9AMEc','ses_dfc1cebaeffeJboO7nU7RBSAUo',2,'message.updated.1','{"sessionID":"ses_dfc1cebaeffeJboO7nU7RBSAUo","info":{"id":"msg_203e3148c001ZnHNAhpveKwNas","sessionID":"ses_dfc1cebaeffeJboO7nU7RBSAUo","role":"user","time":{"created":1795361543308},"agent":"build","model":{"providerID":"fixture","modelID":"fixture-model"}}}');
INSERT INTO "event" VALUES('evt_203e314980018ZALjUKHfccmXb','ses_dfc1cebaeffeJboO7nU7RBSAUo',3,'message.part.updated.1','{"sessionID":"ses_dfc1cebaeffeJboO7nU7RBSAUo","part":{"id":"prt_203e31494001mzpprQLMXJwJKb","sessionID":"ses_dfc1cebaeffeJboO7nU7RBSAUo","messageID":"msg_203e3148c001ZnHNAhpveKwNas","type":"text","text":"\"First session: what is the answer?\nFIXTURE-SCRIPT:W3sidGV4dCI6IkhlbGxvISBUaGUgYW5zd2VyIGlzIDQyLiJ9XQ==\""},"time":1795361543320}');
INSERT INTO "event" VALUES('evt_203e3149c001pjwg18ThbUXGG9','ses_dfc1cebaeffeJboO7nU7RBSAUo',4,'session.updated.1','{"sessionID":"ses_dfc1cebaeffeJboO7nU7RBSAUo","info":{"id":"ses_dfc1cebaeffeJboO7nU7RBSAUo","slug":"stellar-squid","projectID":"global","directory":"/tmp/loginom-fixture/project","path":"tmp/loginom-fixture/project","cost":0,"tokens":{"input":0,"output":0,"reasoning":0,"cache":{"read":0,"write":0}},"title":"New session - 2026-11-22T15:32:23.250Z","agent":"build","model":{"id":"fixture-model","providerID":"fixture","variant":"default"},"version":"local","time":{"created":1795361543250,"updated":1795361543323},"permission":[{"permission":"question","pattern":"*","action":"deny"},{"permission":"plan_enter","pattern":"*","action":"deny"},{"permission":"plan_exit","pattern":"*","action":"deny"}]}}');
INSERT INTO "event" VALUES('evt_203e314c7001A4wy2m85be063M','ses_dfc1cebaeffeJboO7nU7RBSAUo',5,'message.updated.1','{"sessionID":"ses_dfc1cebaeffeJboO7nU7RBSAUo","info":{"id":"msg_203e314c7001sRaPQZD9n760Jz","sessionID":"ses_dfc1cebaeffeJboO7nU7RBSAUo","role":"assistant","time":{"created":1795361543367},"parentID":"msg_203e3148c001ZnHNAhpveKwNas","modelID":"fixture-model","providerID":"fixture","mode":"build","agent":"build","path":{"cwd":"/tmp/loginom-fixture/project","root":"/"},"cost":0,"tokens":{"input":0,"output":0,"reasoning":0,"cache":{"read":0,"write":0}}}}');
INSERT INTO "event" VALUES('evt_203e3151a001mvQvSpXDGIbDzo','ses_dfc1cebaeffeJboO7nU7RBSAUo',6,'session.updated.1','{"sessionID":"ses_dfc1cebaeffeJboO7nU7RBSAUo","info":{"id":"ses_dfc1cebaeffeJboO7nU7RBSAUo","slug":"stellar-squid","projectID":"global","directory":"/tmp/loginom-fixture/project","path":"tmp/loginom-fixture/project","cost":0,"tokens":{"input":0,"output":0,"reasoning":0,"cache":{"read":0,"write":0}},"title":"Fixture title","agent":"build","model":{"id":"fixture-model","providerID":"fixture","variant":"default"},"version":"local","time":{"created":1795361543250,"updated":1795361543323},"permission":[{"permission":"question","pattern":"*","action":"deny"},{"permission":"plan_enter","pattern":"*","action":"deny"},{"permission":"plan_exit","pattern":"*","action":"deny"}]}}');
INSERT INTO "event" VALUES('evt_203e3152b001bN2Ql0oZXd8H3k','ses_dfc1cebaeffeJboO7nU7RBSAUo',7,'session.updated.1','{"sessionID":"ses_dfc1cebaeffeJboO7nU7RBSAUo","info":{"id":"ses_dfc1cebaeffeJboO7nU7RBSAUo","slug":"stellar-squid","projectID":"global","directory":"/tmp/loginom-fixture/project","path":"tmp/loginom-fixture/project","summary":{"additions":0,"deletions":0,"files":0},"cost":0,"tokens":{"input":0,"output":0,"reasoning":0,"cache":{"read":0,"write":0}},"title":"Fixture title","agent":"build","model":{"id":"fixture-model","providerID":"fixture","variant":"default"},"version":"local","time":{"created":1795361543250,"updated":1795361543466},"permission":[{"permission":"question","pattern":"*","action":"deny"},{"permission":"plan_enter","pattern":"*","action":"deny"},{"permission":"plan_exit","pattern":"*","action":"deny"}]}}');
INSERT INTO "event" VALUES('evt_203e315300014rAbjQkioT32HU','ses_dfc1cebaeffeJboO7nU7RBSAUo',8,'message.updated.1','{"sessionID":"ses_dfc1cebaeffeJboO7nU7RBSAUo","info":{"id":"msg_203e3148c001ZnHNAhpveKwNas","sessionID":"ses_dfc1cebaeffeJboO7nU7RBSAUo","role":"user","time":{"created":1795361543308},"summary":{"diffs":[]},"agent":"build","model":{"providerID":"fixture","modelID":"fixture-model"}}}');
INSERT INTO "event" VALUES('evt_203e315b3001VsimD7akFIWU1r','ses_dfc1cebaeffeJboO7nU7RBSAUo',9,'message.part.updated.1','{"sessionID":"ses_dfc1cebaeffeJboO7nU7RBSAUo","part":{"id":"prt_203e315b3001GV0uly93sStS1w","sessionID":"ses_dfc1cebaeffeJboO7nU7RBSAUo","messageID":"msg_203e314c7001sRaPQZD9n760Jz","type":"step-start"},"time":1795361543603}');
INSERT INTO "event" VALUES('evt_203e315b5001CjqDoC5glG059X','ses_dfc1cebaeffeJboO7nU7RBSAUo',10,'message.part.updated.1','{"sessionID":"ses_dfc1cebaeffeJboO7nU7RBSAUo","part":{"id":"prt_203e315b50019oEm9i8bUFvPn6","sessionID":"ses_dfc1cebaeffeJboO7nU7RBSAUo","messageID":"msg_203e314c7001sRaPQZD9n760Jz","type":"text","text":"","time":{"start":1795361543605}},"time":1795361543605}');
INSERT INTO "event" VALUES('evt_203e315bc001RvpIEIiNZCHn4L','ses_dfc1cebaeffeJboO7nU7RBSAUo',11,'message.part.updated.1','{"sessionID":"ses_dfc1cebaeffeJboO7nU7RBSAUo","part":{"id":"prt_203e315b50019oEm9i8bUFvPn6","sessionID":"ses_dfc1cebaeffeJboO7nU7RBSAUo","messageID":"msg_203e314c7001sRaPQZD9n760Jz","type":"text","text":"Hello! The answer is 42.","time":{"start":1795361543605,"end":1795361543612}},"time":1795361543612}');
INSERT INTO "event" VALUES('evt_203e315bf001bXgBzmFw8dXfTB','ses_dfc1cebaeffeJboO7nU7RBSAUo',12,'message.part.updated.1','{"sessionID":"ses_dfc1cebaeffeJboO7nU7RBSAUo","part":{"id":"prt_203e315bf001M3qNfA1G6hzNwr","sessionID":"ses_dfc1cebaeffeJboO7nU7RBSAUo","messageID":"msg_203e314c7001sRaPQZD9n760Jz","type":"step-finish","reason":"stop","cost":0,"tokens":{"total":15,"input":10,"output":5,"reasoning":0,"cache":{"read":0,"write":0}}},"time":1795361543615}');
INSERT INTO "event" VALUES('evt_203e315c2001xlz4gGZqFeC6v4','ses_dfc1cebaeffeJboO7nU7RBSAUo',13,'message.updated.1','{"sessionID":"ses_dfc1cebaeffeJboO7nU7RBSAUo","info":{"id":"msg_203e314c7001sRaPQZD9n760Jz","sessionID":"ses_dfc1cebaeffeJboO7nU7RBSAUo","role":"assistant","time":{"created":1795361543367},"parentID":"msg_203e3148c001ZnHNAhpveKwNas","modelID":"fixture-model","providerID":"fixture","mode":"build","agent":"build","path":{"cwd":"/tmp/loginom-fixture/project","root":"/"},"cost":0,"tokens":{"total":15,"input":10,"output":5,"reasoning":0,"cache":{"read":0,"write":0}},"finish":"stop"}}');
INSERT INTO "event" VALUES('evt_203e315c40013hVhdQivrp462f','ses_dfc1cebaeffeJboO7nU7RBSAUo',14,'message.updated.1','{"sessionID":"ses_dfc1cebaeffeJboO7nU7RBSAUo","info":{"id":"msg_203e314c7001sRaPQZD9n760Jz","sessionID":"ses_dfc1cebaeffeJboO7nU7RBSAUo","role":"assistant","time":{"created":1795361543367,"completed":1795361543620},"parentID":"msg_203e3148c001ZnHNAhpveKwNas","modelID":"fixture-model","providerID":"fixture","mode":"build","agent":"build","path":{"cwd":"/tmp/loginom-fixture/project","root":"/"},"cost":0,"tokens":{"total":15,"input":10,"output":5,"reasoning":0,"cache":{"read":0,"write":0}},"finish":"stop"}}');
INSERT INTO "event" VALUES('evt_203e315da001J0c9dwGtp8ROfY','ses_dfc1cebaeffeJboO7nU7RBSAUo',15,'session.updated.1','{"sessionID":"ses_dfc1cebaeffeJboO7nU7RBSAUo","info":{"id":"ses_dfc1cebaeffeJboO7nU7RBSAUo","slug":"stellar-squid","projectID":"global","directory":"/tmp/loginom-fixture/project","path":"tmp/loginom-fixture/project","summary":{"additions":0,"deletions":0,"files":0},"cost":0,"tokens":{"input":10,"output":5,"reasoning":0,"cache":{"read":0,"write":0}},"title":"Fixture title","agent":"build","model":{"id":"fixture-model","providerID":"fixture","variant":"default"},"version":"local","time":{"created":1795361543250,"updated":1795361543641},"permission":[{"permission":"question","pattern":"*","action":"deny"},{"permission":"plan_enter","pattern":"*","action":"deny"},{"permission":"plan_exit","pattern":"*","action":"deny"}]}}');
INSERT INTO "event" VALUES('evt_203e31f05001ifQq6z1AjfkAbN','ses_dfc1cebaeffeJboO7nU7RBSAUo',16,'message.updated.1','{"sessionID":"ses_dfc1cebaeffeJboO7nU7RBSAUo","info":{"id":"msg_203e31f000015iVTYx4XEHAlEJ","sessionID":"ses_dfc1cebaeffeJboO7nU7RBSAUo","role":"user","time":{"created":1795361545984},"agent":"build","model":{"providerID":"fixture","modelID":"fixture-model"}}}');
INSERT INTO "event" VALUES('evt_203e31f0c0017W7uHh38YzsTDq','ses_dfc1cebaeffeJboO7nU7RBSAUo',17,'message.part.updated.1','{"sessionID":"ses_dfc1cebaeffeJboO7nU7RBSAUo","part":{"id":"prt_203e31f03001vifR2XT2ehwRhT","sessionID":"ses_dfc1cebaeffeJboO7nU7RBSAUo","messageID":"msg_203e31f000015iVTYx4XEHAlEJ","type":"text","text":"\"Second turn in the first session.\nFIXTURE-SCRIPT:W3sidGV4dCI6IkNvbnRpbnVlZDogc3RpbGwgNDIuIn1d\""},"time":1795361545996}');
INSERT INTO "event" VALUES('evt_203e31f11001kSWh56qzV49Rx3','ses_dfc1cebaeffeJboO7nU7RBSAUo',18,'session.updated.1','{"sessionID":"ses_dfc1cebaeffeJboO7nU7RBSAUo","info":{"id":"ses_dfc1cebaeffeJboO7nU7RBSAUo","slug":"stellar-squid","projectID":"global","directory":"/tmp/loginom-fixture/project","path":"tmp/loginom-fixture/project","summary":{"additions":0,"deletions":0,"files":0},"cost":0,"tokens":{"input":10,"output":5,"reasoning":0,"cache":{"read":0,"write":0}},"title":"Fixture title","agent":"build","model":{"id":"fixture-model","providerID":"fixture","variant":"default"},"version":"local","time":{"created":1795361543250,"updated":1795361546000},"permission":[{"permission":"question","pattern":"*","action":"deny"},{"permission":"plan_enter","pattern":"*","action":"deny"},{"permission":"plan_exit","pattern":"*","action":"deny"}]}}');
INSERT INTO "event" VALUES('evt_203e31f3a001PxjGrsHtlQyB8h','ses_dfc1cebaeffeJboO7nU7RBSAUo',19,'message.updated.1','{"sessionID":"ses_dfc1cebaeffeJboO7nU7RBSAUo","info":{"id":"msg_203e31f3a001uxRBloIbj4FmFJ","sessionID":"ses_dfc1cebaeffeJboO7nU7RBSAUo","role":"assistant","time":{"created":1795361546042},"parentID":"msg_203e31f000015iVTYx4XEHAlEJ","modelID":"fixture-model","providerID":"fixture","mode":"build","agent":"build","path":{"cwd":"/tmp/loginom-fixture/project","root":"/"},"cost":0,"tokens":{"input":0,"output":0,"reasoning":0,"cache":{"read":0,"write":0}}}}');
INSERT INTO "event" VALUES('evt_203e31f5b001QdntE7bRNn57dZ','ses_dfc1cebaeffeJboO7nU7RBSAUo',20,'session.updated.1','{"sessionID":"ses_dfc1cebaeffeJboO7nU7RBSAUo","info":{"id":"ses_dfc1cebaeffeJboO7nU7RBSAUo","slug":"stellar-squid","projectID":"global","directory":"/tmp/loginom-fixture/project","path":"tmp/loginom-fixture/project","summary":{"additions":0,"deletions":0,"files":0},"cost":0,"tokens":{"input":10,"output":5,"reasoning":0,"cache":{"read":0,"write":0}},"title":"Fixture title","agent":"build","model":{"id":"fixture-model","providerID":"fixture","variant":"default"},"version":"local","time":{"created":1795361543250,"updated":1795361546074},"permission":[{"permission":"question","pattern":"*","action":"deny"},{"permission":"plan_enter","pattern":"*","action":"deny"},{"permission":"plan_exit","pattern":"*","action":"deny"}]}}');
INSERT INTO "event" VALUES('evt_203e31f5f001LA41ejTfUnHxQc','ses_dfc1cebaeffeJboO7nU7RBSAUo',21,'message.updated.1','{"sessionID":"ses_dfc1cebaeffeJboO7nU7RBSAUo","info":{"id":"msg_203e31f000015iVTYx4XEHAlEJ","sessionID":"ses_dfc1cebaeffeJboO7nU7RBSAUo","role":"user","time":{"created":1795361545984},"summary":{"diffs":[]},"agent":"build","model":{"providerID":"fixture","modelID":"fixture-model"}}}');
INSERT INTO "event" VALUES('evt_203e31fe70019bpzBdObJpXLM4','ses_dfc1cebaeffeJboO7nU7RBSAUo',22,'message.part.updated.1','{"sessionID":"ses_dfc1cebaeffeJboO7nU7RBSAUo","part":{"id":"prt_203e31fe7001P1XqUfKZUSkMVE","sessionID":"ses_dfc1cebaeffeJboO7nU7RBSAUo","messageID":"msg_203e31f3a001uxRBloIbj4FmFJ","type":"step-start"},"time":1795361546215}');
INSERT INTO "event" VALUES('evt_203e31feb001XcOvJZTu8yy1kQ','ses_dfc1cebaeffeJboO7nU7RBSAUo',23,'message.part.updated.1','{"sessionID":"ses_dfc1cebaeffeJboO7nU7RBSAUo","part":{"id":"prt_203e31fea001g6UFX6A9T4QEHT","sessionID":"ses_dfc1cebaeffeJboO7nU7RBSAUo","messageID":"msg_203e31f3a001uxRBloIbj4FmFJ","type":"text","text":"","time":{"start":1795361546218}},"time":1795361546219}');
INSERT INTO "event" VALUES('evt_203e31fee001kALOfsvM7RtiOF','ses_dfc1cebaeffeJboO7nU7RBSAUo',24,'message.part.updated.1','{"sessionID":"ses_dfc1cebaeffeJboO7nU7RBSAUo","part":{"id":"prt_203e31fea001g6UFX6A9T4QEHT","sessionID":"ses_dfc1cebaeffeJboO7nU7RBSAUo","messageID":"msg_203e31f3a001uxRBloIbj4FmFJ","type":"text","text":"Continued: still 42.","time":{"start":1795361546218,"end":1795361546222}},"time":1795361546222}');
INSERT INTO "event" VALUES('evt_203e31ff40015NK9H9fZDtYn6t','ses_dfc1cebaeffeJboO7nU7RBSAUo',25,'message.part.updated.1','{"sessionID":"ses_dfc1cebaeffeJboO7nU7RBSAUo","part":{"id":"prt_203e31ff4001QtriM65cs5P1pz","sessionID":"ses_dfc1cebaeffeJboO7nU7RBSAUo","messageID":"msg_203e31f3a001uxRBloIbj4FmFJ","type":"step-finish","reason":"stop","cost":0,"tokens":{"total":15,"input":10,"output":5,"reasoning":0,"cache":{"read":0,"write":0}}},"time":1795361546228}');
INSERT INTO "event" VALUES('evt_203e31ff7001erFLNMBCJHU52C','ses_dfc1cebaeffeJboO7nU7RBSAUo',26,'message.updated.1','{"sessionID":"ses_dfc1cebaeffeJboO7nU7RBSAUo","info":{"id":"msg_203e31f3a001uxRBloIbj4FmFJ","sessionID":"ses_dfc1cebaeffeJboO7nU7RBSAUo","role":"assistant","time":{"created":1795361546042},"parentID":"msg_203e31f000015iVTYx4XEHAlEJ","modelID":"fixture-model","providerID":"fixture","mode":"build","agent":"build","path":{"cwd":"/tmp/loginom-fixture/project","root":"/"},"cost":0,"tokens":{"total":15,"input":10,"output":5,"reasoning":0,"cache":{"read":0,"write":0}},"finish":"stop"}}');
INSERT INTO "event" VALUES('evt_203e31ffb001f1wpvxjifRAWx5','ses_dfc1cebaeffeJboO7nU7RBSAUo',27,'message.updated.1','{"sessionID":"ses_dfc1cebaeffeJboO7nU7RBSAUo","info":{"id":"msg_203e31f3a001uxRBloIbj4FmFJ","sessionID":"ses_dfc1cebaeffeJboO7nU7RBSAUo","role":"assistant","time":{"created":1795361546042,"completed":1795361546235},"parentID":"msg_203e31f000015iVTYx4XEHAlEJ","modelID":"fixture-model","providerID":"fixture","mode":"build","agent":"build","path":{"cwd":"/tmp/loginom-fixture/project","root":"/"},"cost":0,"tokens":{"total":15,"input":10,"output":5,"reasoning":0,"cache":{"read":0,"write":0}},"finish":"stop"}}');
INSERT INTO "event" VALUES('evt_203e32013001oXypAXBfAGbeas','ses_dfc1cebaeffeJboO7nU7RBSAUo',28,'session.updated.1','{"sessionID":"ses_dfc1cebaeffeJboO7nU7RBSAUo","info":{"id":"ses_dfc1cebaeffeJboO7nU7RBSAUo","slug":"stellar-squid","projectID":"global","directory":"/tmp/loginom-fixture/project","path":"tmp/loginom-fixture/project","summary":{"additions":0,"deletions":0,"files":0},"cost":0,"tokens":{"input":20,"output":10,"reasoning":0,"cache":{"read":0,"write":0}},"title":"Fixture title","agent":"build","model":{"id":"fixture-model","providerID":"fixture","variant":"default"},"version":"local","time":{"created":1795361543250,"updated":1795361546258},"permission":[{"permission":"question","pattern":"*","action":"deny"},{"permission":"plan_enter","pattern":"*","action":"deny"},{"permission":"plan_exit","pattern":"*","action":"deny"}]}}');
INSERT INTO "event" VALUES('evt_203e327cb001dGoqMznEuXB2E4','ses_dfc1cd836ffeH719EHffD9cPhW',0,'session.created.1','{"sessionID":"ses_dfc1cd836ffeH719EHffD9cPhW","info":{"id":"ses_dfc1cd836ffeH719EHffD9cPhW","slug":"quiet-tiger","projectID":"global","directory":"/tmp/loginom-fixture/project","path":"tmp/loginom-fixture/project","cost":0,"tokens":{"input":0,"output":0,"reasoning":0,"cache":{"read":0,"write":0}},"title":"New session - 2026-11-22T15:32:28.234Z","version":"local","time":{"created":1795361548234,"updated":1795361548234},"permission":[{"permission":"question","pattern":"*","action":"deny"},{"permission":"plan_enter","pattern":"*","action":"deny"},{"permission":"plan_exit","pattern":"*","action":"deny"}]}}');
INSERT INTO "event" VALUES('evt_203e327f0001hKog6RQ2g0R1tC','ses_dfc1cd836ffeH719EHffD9cPhW',1,'session.updated.1','{"sessionID":"ses_dfc1cd836ffeH719EHffD9cPhW","info":{"id":"ses_dfc1cd836ffeH719EHffD9cPhW","slug":"quiet-tiger","projectID":"global","directory":"/tmp/loginom-fixture/project","path":"tmp/loginom-fixture/project","cost":0,"tokens":{"input":0,"output":0,"reasoning":0,"cache":{"read":0,"write":0}},"title":"New session - 2026-11-22T15:32:28.234Z","agent":"build","model":{"id":"fixture-model","providerID":"fixture","variant":"default"},"version":"local","time":{"created":1795361548234,"updated":1795361548270},"permission":[{"permission":"question","pattern":"*","action":"deny"},{"permission":"plan_enter","pattern":"*","action":"deny"},{"permission":"plan_exit","pattern":"*","action":"deny"}]}}');
INSERT INTO "event" VALUES('evt_203e3281e001X7d66PnQsXZQI5','ses_dfc1cd836ffeH719EHffD9cPhW',2,'message.updated.1','{"sessionID":"ses_dfc1cd836ffeH719EHffD9cPhW","info":{"id":"msg_203e327ee001LeHuKJ4J238dHQ","sessionID":"ses_dfc1cd836ffeH719EHffD9cPhW","role":"user","time":{"created":1795361548270},"agent":"build","model":{"providerID":"fixture","modelID":"fixture-model"}}}');
INSERT INTO "event" VALUES('evt_203e32821001IChF3oXLhr7auA','ses_dfc1cd836ffeH719EHffD9cPhW',3,'message.part.updated.1','{"sessionID":"ses_dfc1cd836ffeH719EHffD9cPhW","part":{"id":"prt_203e3281d001FHocs23rbXKQ45","sessionID":"ses_dfc1cd836ffeH719EHffD9cPhW","messageID":"msg_203e327ee001LeHuKJ4J238dHQ","type":"text","text":"Called the Read tool with the following input: {\"filePath\":\"/tmp/loginom-fixture/project/notes.txt\"}","synthetic":true},"time":1795361548321}');
INSERT INTO "event" VALUES('evt_203e32824001tkYnhrIDen4H0a','ses_dfc1cd836ffeH719EHffD9cPhW',4,'message.part.updated.1','{"sessionID":"ses_dfc1cd836ffeH719EHffD9cPhW","part":{"id":"prt_203e3281d002kmqMHUi7KpvVg4","sessionID":"ses_dfc1cd836ffeH719EHffD9cPhW","messageID":"msg_203e327ee001LeHuKJ4J238dHQ","type":"text","text":"<path>/tmp/loginom-fixture/project/notes.txt</path>\n<type>file</type>\n<content>\n1: Fixture attachment: three rows of sample data.\n\n(End of file - total 1 lines)\n</content>","synthetic":true},"time":1795361548324}');
INSERT INTO "event" VALUES('evt_203e32826001r2h7GEouUpZDGo','ses_dfc1cd836ffeH719EHffD9cPhW',5,'message.part.updated.1','{"sessionID":"ses_dfc1cd836ffeH719EHffD9cPhW","part":{"id":"prt_203e3281d003BV0v3ffqtK83To","sessionID":"ses_dfc1cd836ffeH719EHffD9cPhW","messageID":"msg_203e327ee001LeHuKJ4J238dHQ","type":"file","mime":"text/plain","filename":"notes.txt","url":"file:///tmp/loginom-fixture/project/notes.txt"},"time":1795361548326}');
INSERT INTO "event" VALUES('evt_203e32828001ZbFfwkZEQrKH93','ses_dfc1cd836ffeH719EHffD9cPhW',6,'message.part.updated.1','{"sessionID":"ses_dfc1cd836ffeH719EHffD9cPhW","part":{"id":"prt_203e3281d004YsIBxwjwYpublX","sessionID":"ses_dfc1cd836ffeH719EHffD9cPhW","messageID":"msg_203e327ee001LeHuKJ4J238dHQ","type":"text","text":"\"Second session: summarize the attached notes.\nFIXTURE-SCRIPT:W3sidG9vbCI6InJlYWQiLCJpbnB1dCI6eyJmaWxlUGF0aCI6Ii90bXAvbG9naW5vbS1maXh0dXJlL3Byb2plY3Qvbm90ZXMudHh0In19LHsidGV4dCI6IlRoZSBhdHRhY2htZW50IGhhcyB0aHJlZSByb3dzLiJ9XQ==\""},"time":1795361548328}');
INSERT INTO "event" VALUES('evt_203e3282a00105O0yPg1JjEgs8','ses_dfc1cd836ffeH719EHffD9cPhW',7,'session.updated.1','{"sessionID":"ses_dfc1cd836ffeH719EHffD9cPhW","info":{"id":"ses_dfc1cd836ffeH719EHffD9cPhW","slug":"quiet-tiger","projectID":"global","directory":"/tmp/loginom-fixture/project","path":"tmp/loginom-fixture/project","cost":0,"tokens":{"input":0,"output":0,"reasoning":0,"cache":{"read":0,"write":0}},"title":"New session - 2026-11-22T15:32:28.234Z","agent":"build","model":{"id":"fixture-model","providerID":"fixture","variant":"default"},"version":"local","time":{"created":1795361548234,"updated":1795361548330},"permission":[{"permission":"question","pattern":"*","action":"deny"},{"permission":"plan_enter","pattern":"*","action":"deny"},{"permission":"plan_exit","pattern":"*","action":"deny"}]}}');
INSERT INTO "event" VALUES('evt_203e32839001ZbmX44kIOKnylo','ses_dfc1cd836ffeH719EHffD9cPhW',8,'message.updated.1','{"sessionID":"ses_dfc1cd836ffeH719EHffD9cPhW","info":{"id":"msg_203e32838001UZBszXYSWOSiCm","sessionID":"ses_dfc1cd836ffeH719EHffD9cPhW","role":"assistant","time":{"created":1795361548345},"parentID":"msg_203e327ee001LeHuKJ4J238dHQ","modelID":"fixture-model","providerID":"fixture","mode":"build","agent":"build","path":{"cwd":"/tmp/loginom-fixture/project","root":"/"},"cost":0,"tokens":{"input":0,"output":0,"reasoning":0,"cache":{"read":0,"write":0}}}}');
INSERT INTO "event" VALUES('evt_203e3285000169UjGjlMpmA9OX','ses_dfc1cd836ffeH719EHffD9cPhW',9,'session.updated.1','{"sessionID":"ses_dfc1cd836ffeH719EHffD9cPhW","info":{"id":"ses_dfc1cd836ffeH719EHffD9cPhW","slug":"quiet-tiger","projectID":"global","directory":"/tmp/loginom-fixture/project","path":"tmp/loginom-fixture/project","summary":{"additions":0,"deletions":0,"files":0},"cost":0,"tokens":{"input":0,"output":0,"reasoning":0,"cache":{"read":0,"write":0}},"title":"New session - 2026-11-22T15:32:28.234Z","agent":"build","model":{"id":"fixture-model","providerID":"fixture","variant":"default"},"version":"local","time":{"created":1795361548234,"updated":1795361548367},"permission":[{"permission":"question","pattern":"*","action":"deny"},{"permission":"plan_enter","pattern":"*","action":"deny"},{"permission":"plan_exit","pattern":"*","action":"deny"}]}}');
INSERT INTO "event" VALUES('evt_203e32854001xIE5Fl9TG12RB4','ses_dfc1cd836ffeH719EHffD9cPhW',10,'message.updated.1','{"sessionID":"ses_dfc1cd836ffeH719EHffD9cPhW","info":{"id":"msg_203e327ee001LeHuKJ4J238dHQ","sessionID":"ses_dfc1cd836ffeH719EHffD9cPhW","role":"user","time":{"created":1795361548270},"summary":{"diffs":[]},"agent":"build","model":{"providerID":"fixture","modelID":"fixture-model"}}}');
INSERT INTO "event" VALUES('evt_203e328760014f8DCFni8dk51F','ses_dfc1cd836ffeH719EHffD9cPhW',11,'session.updated.1','{"sessionID":"ses_dfc1cd836ffeH719EHffD9cPhW","info":{"id":"ses_dfc1cd836ffeH719EHffD9cPhW","slug":"quiet-tiger","projectID":"global","directory":"/tmp/loginom-fixture/project","path":"tmp/loginom-fixture/project","summary":{"additions":0,"deletions":0,"files":0},"cost":0,"tokens":{"input":0,"output":0,"reasoning":0,"cache":{"read":0,"write":0}},"title":"Fixture title","agent":"build","model":{"id":"fixture-model","providerID":"fixture","variant":"default"},"version":"local","time":{"created":1795361548234,"updated":1795361548367},"permission":[{"permission":"question","pattern":"*","action":"deny"},{"permission":"plan_enter","pattern":"*","action":"deny"},{"permission":"plan_exit","pattern":"*","action":"deny"}]}}');
INSERT INTO "event" VALUES('evt_203e328d3001CSpVMIk5ifMSWM','ses_dfc1cd836ffeH719EHffD9cPhW',12,'message.part.updated.1','{"sessionID":"ses_dfc1cd836ffeH719EHffD9cPhW","part":{"id":"prt_203e328d3001JpyN9ijalXOmCU","sessionID":"ses_dfc1cd836ffeH719EHffD9cPhW","messageID":"msg_203e32838001UZBszXYSWOSiCm","type":"step-start"},"time":1795361548499}');
INSERT INTO "event" VALUES('evt_203e328d6001kzh0mg9rGvgs6j','ses_dfc1cd836ffeH719EHffD9cPhW',13,'message.part.updated.1','{"sessionID":"ses_dfc1cd836ffeH719EHffD9cPhW","part":{"id":"prt_203e328d5001aLD3xo1NT0BXHF","sessionID":"ses_dfc1cd836ffeH719EHffD9cPhW","messageID":"msg_203e32838001UZBszXYSWOSiCm","type":"tool","callID":"call_5","tool":"read","state":{"status":"pending","input":{},"raw":""}},"time":1795361548502}');
INSERT INTO "event" VALUES('evt_203e328dc001IaZ2uT0FimBtad','ses_dfc1cd836ffeH719EHffD9cPhW',14,'message.part.updated.1','{"sessionID":"ses_dfc1cd836ffeH719EHffD9cPhW","part":{"id":"prt_203e328d5001aLD3xo1NT0BXHF","sessionID":"ses_dfc1cd836ffeH719EHffD9cPhW","messageID":"msg_203e32838001UZBszXYSWOSiCm","type":"tool","callID":"call_5","tool":"read","state":{"status":"running","input":{"filePath":"/tmp/loginom-fixture/project/notes.txt"},"time":{"start":1795361548508}}},"time":1795361548508}');
INSERT INTO "event" VALUES('evt_203e328e3001KdsEX6YXfC6s0v','ses_dfc1cd836ffeH719EHffD9cPhW',15,'message.part.updated.1','{"sessionID":"ses_dfc1cd836ffeH719EHffD9cPhW","part":{"id":"prt_203e328d5001aLD3xo1NT0BXHF","sessionID":"ses_dfc1cd836ffeH719EHffD9cPhW","messageID":"msg_203e32838001UZBszXYSWOSiCm","type":"tool","callID":"call_5","tool":"read","state":{"status":"completed","input":{"filePath":"/tmp/loginom-fixture/project/notes.txt"},"output":"<path>/tmp/loginom-fixture/project/notes.txt</path>\n<type>file</type>\n<content>\n1: Fixture attachment: three rows of sample data.\n\n(End of file - total 1 lines)\n</content>","title":"tmp/loginom-fixture/project/notes.txt","metadata":{"preview":"Fixture attachment: three rows of sample data.","truncated":false,"loaded":[],"display":{"type":"file","path":"/tmp/loginom-fixture/project/notes.txt","text":"Fixture attachment: three rows of sample data.","lineStart":1,"lineEnd":1,"totalLines":1,"truncated":false}},"time":{"start":1795361548508,"end":1795361548515}}},"time":1795361548515}');
INSERT INTO "event" VALUES('evt_203e328e7001ohDNW57ZbN4aMO','ses_dfc1cd836ffeH719EHffD9cPhW',16,'message.part.updated.1','{"sessionID":"ses_dfc1cd836ffeH719EHffD9cPhW","part":{"id":"prt_203e328e7001wsGe26FmmeGkqd","sessionID":"ses_dfc1cd836ffeH719EHffD9cPhW","messageID":"msg_203e32838001UZBszXYSWOSiCm","type":"step-finish","reason":"tool-calls","cost":0,"tokens":{"total":15,"input":10,"output":5,"reasoning":0,"cache":{"read":0,"write":0}}},"time":1795361548519}');
INSERT INTO "event" VALUES('evt_203e328e9001fSbVAjGASJPfrZ','ses_dfc1cd836ffeH719EHffD9cPhW',17,'message.updated.1','{"sessionID":"ses_dfc1cd836ffeH719EHffD9cPhW","info":{"id":"msg_203e32838001UZBszXYSWOSiCm","sessionID":"ses_dfc1cd836ffeH719EHffD9cPhW","role":"assistant","time":{"created":1795361548345},"parentID":"msg_203e327ee001LeHuKJ4J238dHQ","modelID":"fixture-model","providerID":"fixture","mode":"build","agent":"build","path":{"cwd":"/tmp/loginom-fixture/project","root":"/"},"cost":0,"tokens":{"total":15,"input":10,"output":5,"reasoning":0,"cache":{"read":0,"write":0}},"finish":"tool-calls"}}');
INSERT INTO "event" VALUES('evt_203e328ec001gphWOjIN9XM9jQ','ses_dfc1cd836ffeH719EHffD9cPhW',18,'message.updated.1','{"sessionID":"ses_dfc1cd836ffeH719EHffD9cPhW","info":{"id":"msg_203e32838001UZBszXYSWOSiCm","sessionID":"ses_dfc1cd836ffeH719EHffD9cPhW","role":"assistant","time":{"created":1795361548345,"completed":1795361548524},"parentID":"msg_203e327ee001LeHuKJ4J238dHQ","modelID":"fixture-model","providerID":"fixture","mode":"build","agent":"build","path":{"cwd":"/tmp/loginom-fixture/project","root":"/"},"cost":0,"tokens":{"total":15,"input":10,"output":5,"reasoning":0,"cache":{"read":0,"write":0}},"finish":"tool-calls"}}');
INSERT INTO "event" VALUES('evt_203e328ef0012ve0sNnV83fdA6','ses_dfc1cd836ffeH719EHffD9cPhW',19,'message.updated.1','{"sessionID":"ses_dfc1cd836ffeH719EHffD9cPhW","info":{"id":"msg_203e328ef001HwtikWPZvOvIDG","sessionID":"ses_dfc1cd836ffeH719EHffD9cPhW","role":"assistant","time":{"created":1795361548527},"parentID":"msg_203e327ee001LeHuKJ4J238dHQ","modelID":"fixture-model","providerID":"fixture","mode":"build","agent":"build","path":{"cwd":"/tmp/loginom-fixture/project","root":"/"},"cost":0,"tokens":{"input":0,"output":0,"reasoning":0,"cache":{"read":0,"write":0}}}}');
INSERT INTO "event" VALUES('evt_203e328f5001Gv1ZTavtUz0pZq','ses_dfc1cd836ffeH719EHffD9cPhW',20,'session.updated.1','{"sessionID":"ses_dfc1cd836ffeH719EHffD9cPhW","info":{"id":"ses_dfc1cd836ffeH719EHffD9cPhW","slug":"quiet-tiger","projectID":"global","directory":"/tmp/loginom-fixture/project","path":"tmp/loginom-fixture/project","summary":{"additions":0,"deletions":0,"files":0},"cost":0,"tokens":{"input":10,"output":5,"reasoning":0,"cache":{"read":0,"write":0}},"title":"Fixture title","agent":"build","model":{"id":"fixture-model","providerID":"fixture","variant":"default"},"version":"local","time":{"created":1795361548234,"updated":1795361548532},"permission":[{"permission":"question","pattern":"*","action":"deny"},{"permission":"plan_enter","pattern":"*","action":"deny"},{"permission":"plan_exit","pattern":"*","action":"deny"}]}}');
INSERT INTO "event" VALUES('evt_203e328f7001ZQzNYX4kx73J3M','ses_dfc1cd836ffeH719EHffD9cPhW',21,'message.updated.1','{"sessionID":"ses_dfc1cd836ffeH719EHffD9cPhW","info":{"id":"msg_203e327ee001LeHuKJ4J238dHQ","sessionID":"ses_dfc1cd836ffeH719EHffD9cPhW","role":"user","time":{"created":1795361548270},"summary":{"diffs":[]},"agent":"build","model":{"providerID":"fixture","modelID":"fixture-model"}}}');
INSERT INTO "event" VALUES('evt_203e32903001PJvYcb3JLMQb5x','ses_dfc1cd836ffeH719EHffD9cPhW',22,'message.part.updated.1','{"sessionID":"ses_dfc1cd836ffeH719EHffD9cPhW","part":{"id":"prt_203e32903001M1s2RyP067eFGv","sessionID":"ses_dfc1cd836ffeH719EHffD9cPhW","messageID":"msg_203e328ef001HwtikWPZvOvIDG","type":"step-start"},"time":1795361548547}');
INSERT INTO "event" VALUES('evt_203e32906001HZTst7H8xKyQwD','ses_dfc1cd836ffeH719EHffD9cPhW',23,'message.part.updated.1','{"sessionID":"ses_dfc1cd836ffeH719EHffD9cPhW","part":{"id":"prt_203e32906001QFYeenq2w10lJR","sessionID":"ses_dfc1cd836ffeH719EHffD9cPhW","messageID":"msg_203e328ef001HwtikWPZvOvIDG","type":"text","text":"","time":{"start":1795361548550}},"time":1795361548550}');
INSERT INTO "event" VALUES('evt_203e32908002CufEE6FNkEkcPJ','ses_dfc1cd836ffeH719EHffD9cPhW',24,'message.part.updated.1','{"sessionID":"ses_dfc1cd836ffeH719EHffD9cPhW","part":{"id":"prt_203e32906001QFYeenq2w10lJR","sessionID":"ses_dfc1cd836ffeH719EHffD9cPhW","messageID":"msg_203e328ef001HwtikWPZvOvIDG","type":"text","text":"The attachment has three rows.","time":{"start":1795361548550,"end":1795361548552}},"time":1795361548552}');
INSERT INTO "event" VALUES('evt_203e3290b001KyVQUmQCTkuXj4','ses_dfc1cd836ffeH719EHffD9cPhW',25,'message.part.updated.1','{"sessionID":"ses_dfc1cd836ffeH719EHffD9cPhW","part":{"id":"prt_203e3290a001vkKgxItp9gdT4M","sessionID":"ses_dfc1cd836ffeH719EHffD9cPhW","messageID":"msg_203e328ef001HwtikWPZvOvIDG","type":"step-finish","reason":"stop","cost":0,"tokens":{"total":15,"input":10,"output":5,"reasoning":0,"cache":{"read":0,"write":0}}},"time":1795361548554}');
INSERT INTO "event" VALUES('evt_203e3290c001kLL6719TFRjsrF','ses_dfc1cd836ffeH719EHffD9cPhW',26,'message.updated.1','{"sessionID":"ses_dfc1cd836ffeH719EHffD9cPhW","info":{"id":"msg_203e328ef001HwtikWPZvOvIDG","sessionID":"ses_dfc1cd836ffeH719EHffD9cPhW","role":"assistant","time":{"created":1795361548527},"parentID":"msg_203e327ee001LeHuKJ4J238dHQ","modelID":"fixture-model","providerID":"fixture","mode":"build","agent":"build","path":{"cwd":"/tmp/loginom-fixture/project","root":"/"},"cost":0,"tokens":{"total":15,"input":10,"output":5,"reasoning":0,"cache":{"read":0,"write":0}},"finish":"stop"}}');
INSERT INTO "event" VALUES('evt_203e3290e0011SojqJcQCdg4Gv','ses_dfc1cd836ffeH719EHffD9cPhW',27,'message.updated.1','{"sessionID":"ses_dfc1cd836ffeH719EHffD9cPhW","info":{"id":"msg_203e328ef001HwtikWPZvOvIDG","sessionID":"ses_dfc1cd836ffeH719EHffD9cPhW","role":"assistant","time":{"created":1795361548527,"completed":1795361548558},"parentID":"msg_203e327ee001LeHuKJ4J238dHQ","modelID":"fixture-model","providerID":"fixture","mode":"build","agent":"build","path":{"cwd":"/tmp/loginom-fixture/project","root":"/"},"cost":0,"tokens":{"total":15,"input":10,"output":5,"reasoning":0,"cache":{"read":0,"write":0}},"finish":"stop"}}');
INSERT INTO "event" VALUES('evt_203e32921001JRsfX0TF2H7ZjD','ses_dfc1cd836ffeH719EHffD9cPhW',28,'session.updated.1','{"sessionID":"ses_dfc1cd836ffeH719EHffD9cPhW","info":{"id":"ses_dfc1cd836ffeH719EHffD9cPhW","slug":"quiet-tiger","projectID":"global","directory":"/tmp/loginom-fixture/project","path":"tmp/loginom-fixture/project","summary":{"additions":0,"deletions":0,"files":0},"cost":0,"tokens":{"input":20,"output":10,"reasoning":0,"cache":{"read":0,"write":0}},"title":"Fixture title","agent":"build","model":{"id":"fixture-model","providerID":"fixture","variant":"default"},"version":"local","time":{"created":1795361548234,"updated":1795361548576},"permission":[{"permission":"question","pattern":"*","action":"deny"},{"permission":"plan_enter","pattern":"*","action":"deny"},{"permission":"plan_exit","pattern":"*","action":"deny"}]}}');
INSERT INTO "event" VALUES('evt_203e33689001OOS7qMyxNHGU51','ses_dfc1cc978ffeMiptdveabobUqg',0,'session.created.1','{"sessionID":"ses_dfc1cc978ffeMiptdveabobUqg","info":{"id":"ses_dfc1cc978ffeMiptdveabobUqg","slug":"stellar-sailor","projectID":"global","directory":"/tmp/loginom-fixture/project","path":"tmp/loginom-fixture/project","cost":0,"tokens":{"input":0,"output":0,"reasoning":0,"cache":{"read":0,"write":0}},"title":"New session - 2026-11-22T15:32:32.008Z","version":"local","time":{"created":1795361552008,"updated":1795361552008},"permission":[{"permission":"question","pattern":"*","action":"deny"},{"permission":"plan_enter","pattern":"*","action":"deny"},{"permission":"plan_exit","pattern":"*","action":"deny"}]}}');
INSERT INTO "event" VALUES('evt_203e336ad001jJE7O3Q9bErxRv','ses_dfc1cc978ffeMiptdveabobUqg',1,'session.updated.1','{"sessionID":"ses_dfc1cc978ffeMiptdveabobUqg","info":{"id":"ses_dfc1cc978ffeMiptdveabobUqg","slug":"stellar-sailor","projectID":"global","directory":"/tmp/loginom-fixture/project","path":"tmp/loginom-fixture/project","cost":0,"tokens":{"input":0,"output":0,"reasoning":0,"cache":{"read":0,"write":0}},"title":"New session - 2026-11-22T15:32:32.008Z","agent":"build","model":{"id":"fixture-model","providerID":"fixture","variant":"default"},"version":"local","time":{"created":1795361552008,"updated":1795361552044},"permission":[{"permission":"question","pattern":"*","action":"deny"},{"permission":"plan_enter","pattern":"*","action":"deny"},{"permission":"plan_exit","pattern":"*","action":"deny"}]}}');
INSERT INTO "event" VALUES('evt_203e336b5001vGA52D2Ects8fj','ses_dfc1cc978ffeMiptdveabobUqg',2,'message.updated.1','{"sessionID":"ses_dfc1cc978ffeMiptdveabobUqg","info":{"id":"msg_203e336ac001u24NnbVyRA44s3","sessionID":"ses_dfc1cc978ffeMiptdveabobUqg","role":"user","time":{"created":1795361552044},"agent":"build","model":{"providerID":"fixture","modelID":"fixture-model"}}}');
INSERT INTO "event" VALUES('evt_203e336b8001QlpHlPSAFR6bRT','ses_dfc1cc978ffeMiptdveabobUqg',3,'message.part.updated.1','{"sessionID":"ses_dfc1cc978ffeMiptdveabobUqg","part":{"id":"prt_203e336b4001wPjMorT7JdwwC4","sessionID":"ses_dfc1cc978ffeMiptdveabobUqg","messageID":"msg_203e336ac001u24NnbVyRA44s3","type":"text","text":"Called the Read tool with the following input: {\"filePath\":\"notes.txt\"}","synthetic":true},"time":1795361552056}');
INSERT INTO "event" VALUES('evt_203e336ba0014h4eV8aPL0ojQD','ses_dfc1cc978ffeMiptdveabobUqg',4,'message.part.updated.1','{"sessionID":"ses_dfc1cc978ffeMiptdveabobUqg","part":{"id":"prt_203e336b4002l73vZlYyjzf9A5","sessionID":"ses_dfc1cc978ffeMiptdveabobUqg","messageID":"msg_203e336ac001u24NnbVyRA44s3","type":"text","text":"Fixture attachment: three rows of sample data.\n","synthetic":true},"time":1795361552058}');
INSERT INTO "event" VALUES('evt_203e336bc001DmpUY528jcuJeH','ses_dfc1cc978ffeMiptdveabobUqg',5,'message.part.updated.1','{"sessionID":"ses_dfc1cc978ffeMiptdveabobUqg","part":{"id":"prt_203e336b40030pB0ulvh5Om34G","sessionID":"ses_dfc1cc978ffeMiptdveabobUqg","messageID":"msg_203e336ac001u24NnbVyRA44s3","type":"file","mime":"text/plain","filename":"notes.txt","url":"data:text/plain;base64,Rml4dHVyZSBhdHRhY2htZW50OiB0aHJlZSByb3dzIG9mIHNhbXBsZSBkYXRhLgo="},"time":1795361552060}');
INSERT INTO "event" VALUES('evt_203e336be0018rxhqaMUywGTRY','ses_dfc1cc978ffeMiptdveabobUqg',6,'message.part.updated.1','{"sessionID":"ses_dfc1cc978ffeMiptdveabobUqg","part":{"id":"prt_203e336b4004eWeVQAk53AZquD","sessionID":"ses_dfc1cc978ffeMiptdveabobUqg","messageID":"msg_203e336ac001u24NnbVyRA44s3","type":"text","text":"\"Third session: what is in the attached file?\nFIXTURE-SCRIPT:W3sidGV4dCI6IlRoZSBhdHRhY2hlZCBub3RlcyBoYXZlIG9uZSBsaW5lLiJ9XQ==\""},"time":1795361552062}');
INSERT INTO "event" VALUES('evt_203e336c2001KAtBwouIpHBpvz','ses_dfc1cc978ffeMiptdveabobUqg',7,'session.updated.1','{"sessionID":"ses_dfc1cc978ffeMiptdveabobUqg","info":{"id":"ses_dfc1cc978ffeMiptdveabobUqg","slug":"stellar-sailor","projectID":"global","directory":"/tmp/loginom-fixture/project","path":"tmp/loginom-fixture/project","cost":0,"tokens":{"input":0,"output":0,"reasoning":0,"cache":{"read":0,"write":0}},"title":"New session - 2026-11-22T15:32:32.008Z","agent":"build","model":{"id":"fixture-model","providerID":"fixture","variant":"default"},"version":"local","time":{"created":1795361552008,"updated":1795361552065},"permission":[{"permission":"question","pattern":"*","action":"deny"},{"permission":"plan_enter","pattern":"*","action":"deny"},{"permission":"plan_exit","pattern":"*","action":"deny"}]}}');
INSERT INTO "event" VALUES('evt_203e336dd001vRvVvHufSKqMyc','ses_dfc1cc978ffeMiptdveabobUqg',8,'message.updated.1','{"sessionID":"ses_dfc1cc978ffeMiptdveabobUqg","info":{"id":"msg_203e336dd0016y3Uh5KixU5Izm","sessionID":"ses_dfc1cc978ffeMiptdveabobUqg","role":"assistant","time":{"created":1795361552093},"parentID":"msg_203e336ac001u24NnbVyRA44s3","modelID":"fixture-model","providerID":"fixture","mode":"build","agent":"build","path":{"cwd":"/tmp/loginom-fixture/project","root":"/"},"cost":0,"tokens":{"input":0,"output":0,"reasoning":0,"cache":{"read":0,"write":0}}}}');
INSERT INTO "event" VALUES('evt_203e33711001ywZI3YWCk24zl1','ses_dfc1cc978ffeMiptdveabobUqg',9,'session.updated.1','{"sessionID":"ses_dfc1cc978ffeMiptdveabobUqg","info":{"id":"ses_dfc1cc978ffeMiptdveabobUqg","slug":"stellar-sailor","projectID":"global","directory":"/tmp/loginom-fixture/project","path":"tmp/loginom-fixture/project","summary":{"additions":0,"deletions":0,"files":0},"cost":0,"tokens":{"input":0,"output":0,"reasoning":0,"cache":{"read":0,"write":0}},"title":"New session - 2026-11-22T15:32:32.008Z","agent":"build","model":{"id":"fixture-model","providerID":"fixture","variant":"default"},"version":"local","time":{"created":1795361552008,"updated":1795361552144},"permission":[{"permission":"question","pattern":"*","action":"deny"},{"permission":"plan_enter","pattern":"*","action":"deny"},{"permission":"plan_exit","pattern":"*","action":"deny"}]}}');
INSERT INTO "event" VALUES('evt_203e33715001Fy8uCgB550CXPz','ses_dfc1cc978ffeMiptdveabobUqg',10,'message.updated.1','{"sessionID":"ses_dfc1cc978ffeMiptdveabobUqg","info":{"id":"msg_203e336ac001u24NnbVyRA44s3","sessionID":"ses_dfc1cc978ffeMiptdveabobUqg","role":"user","time":{"created":1795361552044},"summary":{"diffs":[]},"agent":"build","model":{"providerID":"fixture","modelID":"fixture-model"}}}');
INSERT INTO "event" VALUES('evt_203e33720001TRZJ5SMEPXz07B','ses_dfc1cc978ffeMiptdveabobUqg',11,'session.updated.1','{"sessionID":"ses_dfc1cc978ffeMiptdveabobUqg","info":{"id":"ses_dfc1cc978ffeMiptdveabobUqg","slug":"stellar-sailor","projectID":"global","directory":"/tmp/loginom-fixture/project","path":"tmp/loginom-fixture/project","summary":{"additions":0,"deletions":0,"files":0},"cost":0,"tokens":{"input":0,"output":0,"reasoning":0,"cache":{"read":0,"write":0}},"title":"Fixture title","agent":"build","model":{"id":"fixture-model","providerID":"fixture","variant":"default"},"version":"local","time":{"created":1795361552008,"updated":1795361552144},"permission":[{"permission":"question","pattern":"*","action":"deny"},{"permission":"plan_enter","pattern":"*","action":"deny"},{"permission":"plan_exit","pattern":"*","action":"deny"}]}}');
INSERT INTO "event" VALUES('evt_203e3377a001UreFNEdcAoluMt','ses_dfc1cc978ffeMiptdveabobUqg',12,'message.part.updated.1','{"sessionID":"ses_dfc1cc978ffeMiptdveabobUqg","part":{"id":"prt_203e3377a001WyUVjH9Jj95pEB","sessionID":"ses_dfc1cc978ffeMiptdveabobUqg","messageID":"msg_203e336dd0016y3Uh5KixU5Izm","type":"step-start"},"time":1795361552250}');
INSERT INTO "event" VALUES('evt_203e3377c001x2WNs2msYIjf9S','ses_dfc1cc978ffeMiptdveabobUqg',13,'message.part.updated.1','{"sessionID":"ses_dfc1cc978ffeMiptdveabobUqg","part":{"id":"prt_203e3377c001Ll6gVPqTJ3UomZ","sessionID":"ses_dfc1cc978ffeMiptdveabobUqg","messageID":"msg_203e336dd0016y3Uh5KixU5Izm","type":"text","text":"","time":{"start":1795361552252}},"time":1795361552252}');
INSERT INTO "event" VALUES('evt_203e3377e0029VLD5T4LUAHa4W','ses_dfc1cc978ffeMiptdveabobUqg',14,'message.part.updated.1','{"sessionID":"ses_dfc1cc978ffeMiptdveabobUqg","part":{"id":"prt_203e3377c001Ll6gVPqTJ3UomZ","sessionID":"ses_dfc1cc978ffeMiptdveabobUqg","messageID":"msg_203e336dd0016y3Uh5KixU5Izm","type":"text","text":"The attached notes have one line.","time":{"start":1795361552252,"end":1795361552254}},"time":1795361552254}');
INSERT INTO "event" VALUES('evt_203e33781001gmdi15F09giRo0','ses_dfc1cc978ffeMiptdveabobUqg',15,'message.part.updated.1','{"sessionID":"ses_dfc1cc978ffeMiptdveabobUqg","part":{"id":"prt_203e33781001BwvDilGx1W6O3y","sessionID":"ses_dfc1cc978ffeMiptdveabobUqg","messageID":"msg_203e336dd0016y3Uh5KixU5Izm","type":"step-finish","reason":"stop","cost":0,"tokens":{"total":15,"input":10,"output":5,"reasoning":0,"cache":{"read":0,"write":0}}},"time":1795361552257}');
INSERT INTO "event" VALUES('evt_203e33783001hm77kBin1tkUnG','ses_dfc1cc978ffeMiptdveabobUqg',16,'message.updated.1','{"sessionID":"ses_dfc1cc978ffeMiptdveabobUqg","info":{"id":"msg_203e336dd0016y3Uh5KixU5Izm","sessionID":"ses_dfc1cc978ffeMiptdveabobUqg","role":"assistant","time":{"created":1795361552093},"parentID":"msg_203e336ac001u24NnbVyRA44s3","modelID":"fixture-model","providerID":"fixture","mode":"build","agent":"build","path":{"cwd":"/tmp/loginom-fixture/project","root":"/"},"cost":0,"tokens":{"total":15,"input":10,"output":5,"reasoning":0,"cache":{"read":0,"write":0}},"finish":"stop"}}');
INSERT INTO "event" VALUES('evt_203e33786001NgCm9LxAm5G4OG','ses_dfc1cc978ffeMiptdveabobUqg',17,'message.updated.1','{"sessionID":"ses_dfc1cc978ffeMiptdveabobUqg","info":{"id":"msg_203e336dd0016y3Uh5KixU5Izm","sessionID":"ses_dfc1cc978ffeMiptdveabobUqg","role":"assistant","time":{"created":1795361552093,"completed":1795361552262},"parentID":"msg_203e336ac001u24NnbVyRA44s3","modelID":"fixture-model","providerID":"fixture","mode":"build","agent":"build","path":{"cwd":"/tmp/loginom-fixture/project","root":"/"},"cost":0,"tokens":{"total":15,"input":10,"output":5,"reasoning":0,"cache":{"read":0,"write":0}},"finish":"stop"}}');
INSERT INTO "event" VALUES('evt_203e3378c0010j5A8zWd6Z34WV','ses_dfc1cc978ffeMiptdveabobUqg',18,'session.updated.1','{"sessionID":"ses_dfc1cc978ffeMiptdveabobUqg","info":{"id":"ses_dfc1cc978ffeMiptdveabobUqg","slug":"stellar-sailor","projectID":"global","directory":"/tmp/loginom-fixture/project","path":"tmp/loginom-fixture/project","summary":{"additions":0,"deletions":0,"files":0},"cost":0,"tokens":{"input":10,"output":5,"reasoning":0,"cache":{"read":0,"write":0}},"title":"Fixture title","agent":"build","model":{"id":"fixture-model","providerID":"fixture","variant":"default"},"version":"local","time":{"created":1795361552008,"updated":1795361552268},"permission":[{"permission":"question","pattern":"*","action":"deny"},{"permission":"plan_enter","pattern":"*","action":"deny"},{"permission":"plan_exit","pattern":"*","action":"deny"}]}}');
INSERT INTO "event" VALUES('evt_203e3379000155eZkZ4tyPnA8G','ses_dfc1cc978ffeMiptdveabobUqg',19,'message.updated.1','{"sessionID":"ses_dfc1cc978ffeMiptdveabobUqg","info":{"id":"msg_203e336ac001u24NnbVyRA44s3","sessionID":"ses_dfc1cc978ffeMiptdveabobUqg","role":"user","time":{"created":1795361552044},"summary":{"diffs":[]},"agent":"build","model":{"providerID":"fixture","modelID":"fixture-model"}}}');
INSERT INTO "project" VALUES('global','/',NULL,NULL,NULL,NULL,NULL,1795361542373,1795361551964,NULL,'[]',NULL);
INSERT INTO "message" VALUES('msg_203e3148c001ZnHNAhpveKwNas','ses_dfc1cebaeffeJboO7nU7RBSAUo',1795361543308,1795361543473,'{"role":"user","time":{"created":1795361543308},"agent":"build","model":{"providerID":"fixture","modelID":"fixture-model"},"summary":{"diffs":[]}}');
INSERT INTO "message" VALUES('msg_203e314c7001sRaPQZD9n760Jz','ses_dfc1cebaeffeJboO7nU7RBSAUo',1795361543367,1795361543621,'{"parentID":"msg_203e3148c001ZnHNAhpveKwNas","role":"assistant","mode":"build","agent":"build","path":{"cwd":"/tmp/loginom-fixture/project","root":"/"},"cost":0,"tokens":{"total":15,"input":10,"output":5,"reasoning":0,"cache":{"write":0,"read":0}},"modelID":"fixture-model","providerID":"fixture","time":{"created":1795361543367,"completed":1795361543620},"finish":"stop"}');
INSERT INTO "message" VALUES('msg_203e31f000015iVTYx4XEHAlEJ','ses_dfc1cebaeffeJboO7nU7RBSAUo',1795361545984,1795361546080,'{"role":"user","time":{"created":1795361545984},"agent":"build","model":{"providerID":"fixture","modelID":"fixture-model"},"summary":{"diffs":[]}}');
INSERT INTO "message" VALUES('msg_203e31f3a001uxRBloIbj4FmFJ','ses_dfc1cebaeffeJboO7nU7RBSAUo',1795361546042,1795361546236,'{"parentID":"msg_203e31f000015iVTYx4XEHAlEJ","role":"assistant","mode":"build","agent":"build","path":{"cwd":"/tmp/loginom-fixture/project","root":"/"},"cost":0,"tokens":{"total":15,"input":10,"output":5,"reasoning":0,"cache":{"write":0,"read":0}},"modelID":"fixture-model","providerID":"fixture","time":{"created":1795361546042,"completed":1795361546235},"finish":"stop"}');
INSERT INTO "message" VALUES('msg_203e327ee001LeHuKJ4J238dHQ','ses_dfc1cd836ffeH719EHffD9cPhW',1795361548270,1795361548536,'{"role":"user","time":{"created":1795361548270},"agent":"build","model":{"providerID":"fixture","modelID":"fixture-model"},"summary":{"diffs":[]}}');
INSERT INTO "message" VALUES('msg_203e32838001UZBszXYSWOSiCm','ses_dfc1cd836ffeH719EHffD9cPhW',1795361548345,1795361548524,'{"parentID":"msg_203e327ee001LeHuKJ4J238dHQ","role":"assistant","mode":"build","agent":"build","path":{"cwd":"/tmp/loginom-fixture/project","root":"/"},"cost":0,"tokens":{"total":15,"input":10,"output":5,"reasoning":0,"cache":{"write":0,"read":0}},"modelID":"fixture-model","providerID":"fixture","time":{"created":1795361548345,"completed":1795361548524},"finish":"tool-calls"}');
INSERT INTO "message" VALUES('msg_203e328ef001HwtikWPZvOvIDG','ses_dfc1cd836ffeH719EHffD9cPhW',1795361548527,1795361548559,'{"parentID":"msg_203e327ee001LeHuKJ4J238dHQ","role":"assistant","mode":"build","agent":"build","path":{"cwd":"/tmp/loginom-fixture/project","root":"/"},"cost":0,"tokens":{"total":15,"input":10,"output":5,"reasoning":0,"cache":{"write":0,"read":0}},"modelID":"fixture-model","providerID":"fixture","time":{"created":1795361548527,"completed":1795361548558},"finish":"stop"}');
INSERT INTO "message" VALUES('msg_203e336ac001u24NnbVyRA44s3','ses_dfc1cc978ffeMiptdveabobUqg',1795361552044,1795361552273,'{"role":"user","time":{"created":1795361552044},"agent":"build","model":{"providerID":"fixture","modelID":"fixture-model"},"summary":{"diffs":[]}}');
INSERT INTO "message" VALUES('msg_203e336dd0016y3Uh5KixU5Izm','ses_dfc1cc978ffeMiptdveabobUqg',1795361552093,1795361552263,'{"parentID":"msg_203e336ac001u24NnbVyRA44s3","role":"assistant","mode":"build","agent":"build","path":{"cwd":"/tmp/loginom-fixture/project","root":"/"},"cost":0,"tokens":{"total":15,"input":10,"output":5,"reasoning":0,"cache":{"write":0,"read":0}},"modelID":"fixture-model","providerID":"fixture","time":{"created":1795361552093,"completed":1795361552262},"finish":"stop"}');
INSERT INTO "part" VALUES('prt_203e31494001mzpprQLMXJwJKb','msg_203e3148c001ZnHNAhpveKwNas','ses_dfc1cebaeffeJboO7nU7RBSAUo',1795361543320,1795361543321,'{"type":"text","text":"\"First session: what is the answer?\nFIXTURE-SCRIPT:W3sidGV4dCI6IkhlbGxvISBUaGUgYW5zd2VyIGlzIDQyLiJ9XQ==\""}');
INSERT INTO "part" VALUES('prt_203e315b3001GV0uly93sStS1w','msg_203e314c7001sRaPQZD9n760Jz','ses_dfc1cebaeffeJboO7nU7RBSAUo',1795361543603,1795361543604,'{"type":"step-start"}');
INSERT INTO "part" VALUES('prt_203e315b50019oEm9i8bUFvPn6','msg_203e314c7001sRaPQZD9n760Jz','ses_dfc1cebaeffeJboO7nU7RBSAUo',1795361543605,1795361543613,'{"type":"text","text":"Hello! The answer is 42.","time":{"start":1795361543605,"end":1795361543612}}');
INSERT INTO "part" VALUES('prt_203e315bf001M3qNfA1G6hzNwr','msg_203e314c7001sRaPQZD9n760Jz','ses_dfc1cebaeffeJboO7nU7RBSAUo',1795361543615,1795361543616,'{"reason":"stop","type":"step-finish","tokens":{"total":15,"input":10,"output":5,"reasoning":0,"cache":{"write":0,"read":0}},"cost":0}');
INSERT INTO "part" VALUES('prt_203e31f03001vifR2XT2ehwRhT','msg_203e31f000015iVTYx4XEHAlEJ','ses_dfc1cebaeffeJboO7nU7RBSAUo',1795361545996,1795361545998,'{"type":"text","text":"\"Second turn in the first session.\nFIXTURE-SCRIPT:W3sidGV4dCI6IkNvbnRpbnVlZDogc3RpbGwgNDIuIn1d\""}');
INSERT INTO "part" VALUES('prt_203e31fe7001P1XqUfKZUSkMVE','msg_203e31f3a001uxRBloIbj4FmFJ','ses_dfc1cebaeffeJboO7nU7RBSAUo',1795361546215,1795361546217,'{"type":"step-start"}');
INSERT INTO "part" VALUES('prt_203e31fea001g6UFX6A9T4QEHT','msg_203e31f3a001uxRBloIbj4FmFJ','ses_dfc1cebaeffeJboO7nU7RBSAUo',1795361546219,1795361546223,'{"type":"text","text":"Continued: still 42.","time":{"start":1795361546218,"end":1795361546222}}');
INSERT INTO "part" VALUES('prt_203e31ff4001QtriM65cs5P1pz','msg_203e31f3a001uxRBloIbj4FmFJ','ses_dfc1cebaeffeJboO7nU7RBSAUo',1795361546228,1795361546229,'{"reason":"stop","type":"step-finish","tokens":{"total":15,"input":10,"output":5,"reasoning":0,"cache":{"write":0,"read":0}},"cost":0}');
INSERT INTO "part" VALUES('prt_203e3281d001FHocs23rbXKQ45','msg_203e327ee001LeHuKJ4J238dHQ','ses_dfc1cd836ffeH719EHffD9cPhW',1795361548321,1795361548323,'{"type":"text","synthetic":true,"text":"Called the Read tool with the following input: {\"filePath\":\"/tmp/loginom-fixture/project/notes.txt\"}"}');
INSERT INTO "part" VALUES('prt_203e3281d002kmqMHUi7KpvVg4','msg_203e327ee001LeHuKJ4J238dHQ','ses_dfc1cd836ffeH719EHffD9cPhW',1795361548324,1795361548325,'{"type":"text","synthetic":true,"text":"<path>/tmp/loginom-fixture/project/notes.txt</path>\n<type>file</type>\n<content>\n1: Fixture attachment: three rows of sample data.\n\n(End of file - total 1 lines)\n</content>"}');
INSERT INTO "part" VALUES('prt_203e3281d003BV0v3ffqtK83To','msg_203e327ee001LeHuKJ4J238dHQ','ses_dfc1cd836ffeH719EHffD9cPhW',1795361548326,1795361548327,'{"type":"file","mime":"text/plain","filename":"notes.txt","url":"file:///tmp/loginom-fixture/project/notes.txt"}');
INSERT INTO "part" VALUES('prt_203e3281d004YsIBxwjwYpublX','msg_203e327ee001LeHuKJ4J238dHQ','ses_dfc1cd836ffeH719EHffD9cPhW',1795361548328,1795361548329,'{"type":"text","text":"\"Second session: summarize the attached notes.\nFIXTURE-SCRIPT:W3sidG9vbCI6InJlYWQiLCJpbnB1dCI6eyJmaWxlUGF0aCI6Ii90bXAvbG9naW5vbS1maXh0dXJlL3Byb2plY3Qvbm90ZXMudHh0In19LHsidGV4dCI6IlRoZSBhdHRhY2htZW50IGhhcyB0aHJlZSByb3dzLiJ9XQ==\""}');
INSERT INTO "part" VALUES('prt_203e328d3001JpyN9ijalXOmCU','msg_203e32838001UZBszXYSWOSiCm','ses_dfc1cd836ffeH719EHffD9cPhW',1795361548499,1795361548500,'{"type":"step-start"}');
INSERT INTO "part" VALUES('prt_203e328d5001aLD3xo1NT0BXHF','msg_203e32838001UZBszXYSWOSiCm','ses_dfc1cd836ffeH719EHffD9cPhW',1795361548502,1795361548516,'{"type":"tool","tool":"read","callID":"call_5","state":{"status":"completed","input":{"filePath":"/tmp/loginom-fixture/project/notes.txt"},"output":"<path>/tmp/loginom-fixture/project/notes.txt</path>\n<type>file</type>\n<content>\n1: Fixture attachment: three rows of sample data.\n\n(End of file - total 1 lines)\n</content>","metadata":{"preview":"Fixture attachment: three rows of sample data.","truncated":false,"loaded":[],"display":{"type":"file","path":"/tmp/loginom-fixture/project/notes.txt","text":"Fixture attachment: three rows of sample data.","lineStart":1,"lineEnd":1,"totalLines":1,"truncated":false}},"title":"tmp/loginom-fixture/project/notes.txt","time":{"start":1795361548508,"end":1795361548515}}}');
INSERT INTO "part" VALUES('prt_203e328e7001wsGe26FmmeGkqd','msg_203e32838001UZBszXYSWOSiCm','ses_dfc1cd836ffeH719EHffD9cPhW',1795361548519,1795361548520,'{"reason":"tool-calls","type":"step-finish","tokens":{"total":15,"input":10,"output":5,"reasoning":0,"cache":{"write":0,"read":0}},"cost":0}');
INSERT INTO "part" VALUES('prt_203e32903001M1s2RyP067eFGv','msg_203e328ef001HwtikWPZvOvIDG','ses_dfc1cd836ffeH719EHffD9cPhW',1795361548547,1795361548548,'{"type":"step-start"}');
INSERT INTO "part" VALUES('prt_203e32906001QFYeenq2w10lJR','msg_203e328ef001HwtikWPZvOvIDG','ses_dfc1cd836ffeH719EHffD9cPhW',1795361548550,1795361548553,'{"type":"text","text":"The attachment has three rows.","time":{"start":1795361548550,"end":1795361548552}}');
INSERT INTO "part" VALUES('prt_203e3290a001vkKgxItp9gdT4M','msg_203e328ef001HwtikWPZvOvIDG','ses_dfc1cd836ffeH719EHffD9cPhW',1795361548554,1795361548555,'{"reason":"stop","type":"step-finish","tokens":{"total":15,"input":10,"output":5,"reasoning":0,"cache":{"write":0,"read":0}},"cost":0}');
INSERT INTO "part" VALUES('prt_203e336b4001wPjMorT7JdwwC4','msg_203e336ac001u24NnbVyRA44s3','ses_dfc1cc978ffeMiptdveabobUqg',1795361552056,1795361552057,'{"type":"text","synthetic":true,"text":"Called the Read tool with the following input: {\"filePath\":\"notes.txt\"}"}');
INSERT INTO "part" VALUES('prt_203e336b4002l73vZlYyjzf9A5','msg_203e336ac001u24NnbVyRA44s3','ses_dfc1cc978ffeMiptdveabobUqg',1795361552058,1795361552059,'{"type":"text","synthetic":true,"text":"Fixture attachment: three rows of sample data.\n"}');
INSERT INTO "part" VALUES('prt_203e336b40030pB0ulvh5Om34G','msg_203e336ac001u24NnbVyRA44s3','ses_dfc1cc978ffeMiptdveabobUqg',1795361552060,1795361552061,'{"type":"file","mime":"text/plain","filename":"notes.txt","url":"data:text/plain;base64,Rml4dHVyZSBhdHRhY2htZW50OiB0aHJlZSByb3dzIG9mIHNhbXBsZSBkYXRhLgo="}');
INSERT INTO "part" VALUES('prt_203e336b4004eWeVQAk53AZquD','msg_203e336ac001u24NnbVyRA44s3','ses_dfc1cc978ffeMiptdveabobUqg',1795361552062,1795361552064,'{"type":"text","text":"\"Third session: what is in the attached file?\nFIXTURE-SCRIPT:W3sidGV4dCI6IlRoZSBhdHRhY2hlZCBub3RlcyBoYXZlIG9uZSBsaW5lLiJ9XQ==\""}');
INSERT INTO "part" VALUES('prt_203e3377a001WyUVjH9Jj95pEB','msg_203e336dd0016y3Uh5KixU5Izm','ses_dfc1cc978ffeMiptdveabobUqg',1795361552250,1795361552251,'{"type":"step-start"}');
INSERT INTO "part" VALUES('prt_203e3377c001Ll6gVPqTJ3UomZ','msg_203e336dd0016y3Uh5KixU5Izm','ses_dfc1cc978ffeMiptdveabobUqg',1795361552252,1795361552255,'{"type":"text","text":"The attached notes have one line.","time":{"start":1795361552252,"end":1795361552254}}');
INSERT INTO "part" VALUES('prt_203e33781001BwvDilGx1W6O3y','msg_203e336dd0016y3Uh5KixU5Izm','ses_dfc1cc978ffeMiptdveabobUqg',1795361552257,1795361552258,'{"reason":"stop","type":"step-finish","tokens":{"total":15,"input":10,"output":5,"reasoning":0,"cache":{"write":0,"read":0}},"cost":0}');
INSERT INTO "session" VALUES('ses_dfc1cebaeffeJboO7nU7RBSAUo','global',NULL,NULL,'stellar-squid','/tmp/loginom-fixture/project','tmp/loginom-fixture/project','Fixture title','local',NULL,0,0,0,NULL,NULL,0.0,20,10,0,0,0,NULL,'[{"permission":"question","pattern":"*","action":"deny"},{"permission":"plan_enter","pattern":"*","action":"deny"},{"permission":"plan_exit","pattern":"*","action":"deny"}]','build','{"id":"fixture-model","providerID":"fixture","variant":"default"}',1795361543250,1795361546258,NULL,NULL);
INSERT INTO "session" VALUES('ses_dfc1cd836ffeH719EHffD9cPhW','global',NULL,NULL,'quiet-tiger','/tmp/loginom-fixture/project','tmp/loginom-fixture/project','Fixture title','local',NULL,0,0,0,NULL,NULL,0.0,20,10,0,0,0,NULL,'[{"permission":"question","pattern":"*","action":"deny"},{"permission":"plan_enter","pattern":"*","action":"deny"},{"permission":"plan_exit","pattern":"*","action":"deny"}]','build','{"id":"fixture-model","providerID":"fixture","variant":"default"}',1795361548234,1795361548576,NULL,NULL);
INSERT INTO "session" VALUES('ses_dfc1cc978ffeMiptdveabobUqg','global',NULL,NULL,'stellar-sailor','/tmp/loginom-fixture/project','tmp/loginom-fixture/project','Fixture title','local',NULL,0,0,0,NULL,NULL,0.0,10,5,0,0,0,NULL,'[{"permission":"question","pattern":"*","action":"deny"},{"permission":"plan_enter","pattern":"*","action":"deny"},{"permission":"plan_exit","pattern":"*","action":"deny"}]','build','{"id":"fixture-model","providerID":"fixture","variant":"default"}',1795361552008,1795361552268,NULL,NULL);
INSERT INTO "migration" VALUES('20260127222353_familiar_lady_ursula',1795361542210);
INSERT INTO "migration" VALUES('20260211171708_add_project_commands',1795361542210);
INSERT INTO "migration" VALUES('20260213144116_wakeful_the_professor',1795361542210);
INSERT INTO "migration" VALUES('20260225215848_workspace',1795361542210);
INSERT INTO "migration" VALUES('20260227213759_add_session_workspace_id',1795361542210);
INSERT INTO "migration" VALUES('20260228203230_blue_harpoon',1795361542211);
INSERT INTO "migration" VALUES('20260303231226_add_workspace_fields',1795361542211);
INSERT INTO "migration" VALUES('20260309230000_move_org_to_state',1795361542211);
INSERT INTO "migration" VALUES('20260312043431_session_message_cursor',1795361542211);
INSERT INTO "migration" VALUES('20260323234822_events',1795361542211);
INSERT INTO "migration" VALUES('20260410174513_workspace-name',1795361542211);
INSERT INTO "migration" VALUES('20260413175956_chief_energizer',1795361542211);
INSERT INTO "migration" VALUES('20260423070820_add_icon_url_override',1795361542211);
INSERT INTO "migration" VALUES('20260427172553_slow_nightmare',1795361542211);
INSERT INTO "migration" VALUES('20260428004200_add_session_path',1795361542212);
INSERT INTO "migration" VALUES('20260501142318_next_venus',1795361542212);
INSERT INTO "migration" VALUES('20260504145000_add_sync_owner',1795361542212);
INSERT INTO "migration" VALUES('20260507164347_add_workspace_time',1795361542212);
INSERT INTO "migration" VALUES('20260510033149_session_usage',1795361542212);
INSERT INTO "migration" VALUES('20260511000411_data_migration_state',1795361542213);
INSERT INTO "migration" VALUES('20260511173437_session-metadata',1795361542213);
INSERT INTO "migration" VALUES('20260601010001_normalize_storage_paths',1795361542213);
INSERT INTO "migration" VALUES('20260601202201_amazing_prowler',1795361542213);
INSERT INTO "migration" VALUES('20260602002951_lowly_union_jack',1795361542213);
INSERT INTO "migration" VALUES('20260602182828_add_project_directories',1795361542213);
INSERT INTO "migration" VALUES('20260603001617_session_message_projection_indexes',1795361542213);
INSERT INTO "migration" VALUES('20260603040000_session_message_projection_order',1795361542213);
INSERT INTO "migration" VALUES('20260603141458_session_input_inbox',1795361542213);
INSERT INTO "migration" VALUES('20260603160727_jittery_ezekiel_stane',1795361542214);
INSERT INTO "migration" VALUES('20260604172448_event_sourced_session_input',1795361542214);
INSERT INTO "migration" VALUES('20260605003541_add_session_context_snapshot',1795361542214);
INSERT INTO "migration" VALUES('20260605042240_add_context_epoch_agent',1795361542214);
INSERT INTO "migration" VALUES('20260611035744_credential',1795361542214);
INSERT INTO "migration" VALUES('20260611192811_lush_chimera',1795361542214);
INSERT INTO "migration" VALUES('20260612174303_project_dir_strategy',1795361542214);
INSERT INTO "migration" VALUES('20260622142730_simplify_session_context_epoch',1795361542214);
INSERT INTO "migration" VALUES('20260622170816_reset_v2_session_state',1795361542215);
INSERT INTO "migration" VALUES('20260622202450_simplify_session_input',1795361542215);
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
