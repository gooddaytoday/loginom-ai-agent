# Intent: stepwise scenario building with the agent

Owner decision, 2026-11-25 (`stepwise-building`), confirmed after an interview. This is the product goal that runtime, tool, skill and test work for 0.4.x serves.

## Outcome

An analyst who knows Loginom builds a scenario personally, piece by piece. The agent acts as the analyst's "hands" for long or complex steps: add, connect, configure, insert, delete, run, show.

## User

An analyst who knows Loginom node names. Requests refer to nodes by their label on the canvas, by type ("add sorting after the grouping"), or by position ("to the last node", "to the one I just added by hand").

## Main condition

The Loginom window is open next to the chat, and the analyst makes some edits by hand because that is faster. Before every step the agent takes the current scenario as it is, manual edits included, and continues from there. Changes the user made between messages are the new baseline, not a foreign state.

## One step

- The agent does exactly what was asked, nothing more. Neighbouring nodes stay untouched.
- It then runs the changed node as a self-check.
- It reports briefly: what was added, what it is connected to, whether it ran, and how many rows it produced.
- The package is saved only when the user asks.
- An ambiguous reference (for example two nodes labelled "Группировка") is asked back, never guessed.

## Success

- A simple step takes about a minute, plus the time Loginom itself needs to run the node.
- No dead ends. If a step fails, the scenario stays usable, the agent explains in one sentence what happened, and the user can continue by hand or with the next request. "The agent broke, start a new chat" is not acceptable.

## Constraint

Protection against wrong agent actions is not weakened.

- Each step re-reads the current scenario and treats it as the baseline. That is a fresh check, not trust in stale state.
- "Foreign" means only a change that happened during the agent's own action, between its observation and its verified result. The client still stops on such a change.
- A failing step cleans up its own temporary UI (menu, wizard, dialog) and confirms it. Recovery ends in a verifiable state.
- Unverified screen states are not accepted. The model does not click freely without checks. Actions with an unknown outcome are not repeated.

## Out of scope

- Building the whole scenario from one request stays supported, but it is not the focus.
- Business users who do not know Loginom nodes.
- Automatic saving.
- Changes to the Loginom server.
