Receiving69 atomic evidence publication

The original metadata/directory/sessionId/bytes and temporary name are retained in the publication record before temporary IO. Completed temporary close does not permit publication to a changed session. Evidence and capture guards run before rename; rename and directory sync use the retained original destination. Both physical callback and projection completion remain awaited.

A prepared original temporary may be published after the same original tuple is restored; its record is reused. Incomplete temporary preparation and unresolved rename refuse repair rather than remint temporary custody. Journal/sample/native replay and ACK/release authority remain outside this component.

The immutable diagnostic extracts production persistence verbatim and uses real kernel FS callbacks with named session-drift faults. It proves custody only, not genuine native consumer/cleanup. Frozen c795 first-false/evidence-only repair controls remain separate and unchanged.
