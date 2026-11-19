# Session Stream — Flows

One socket per session, shared by every consumer.

| param | name | runs where |
|---|---|---|
| 1 | `sessionId` | registry key, then `fetch("/api/sessions/<id>/stream")` |
| 2 | `onMessage` | inside `emit()`, for every SSE frame received |
| 3 | `onReconnect` | inside `notifyReconnect()`, only when a connection is **restored**: failed-then-retry, reconnect, or re-open after close. Skipped on the first open. |

---

## 1. First hit on a session

```mermaid
sequenceDiagram
    autonumber
    participant P as page.tsx (server)
    participant UI as Chat + ConnectorStream
    participant H as useSessionStream (effect)
    participant R as streams registry
    participant RD as SessionStreamReader
    participant RT as stream route
    participant WR as SessionStreamWriter
    participant BUS as session bus

    P->>P: read session, initial journal, initial bar
    P->>UI: render Chat key=sessionId
    UI->>H: useSessionStream(id, onMessage, onOpen)
    H->>R: subscribeSessionStream(id, handler, {onOpen})
    R->>R: streams.get(id) => MISS
    R->>RD: new SessionStreamReader(id)
    RD->>RT: connect() => fetch /api/sessions/id/stream
    RT->>RT: auth, ownership, ensureAgentForSession
    RT->>WR: new SessionStreamWriter(id, userId, signal)
    WR->>BUS: subscribe session:id
    WR->>BUS: subscribe user:userId
    RT-->>RD: 200, open body
    Note over RD: first open => no reconnect handler<br/>the page already rendered initialJournal
    RD->>RD: readFrames(body) loop
    Note over R: ConnectorStream subscribes next<br/>streams.get(id) => HIT<br/>add() only, no second fetch
```

---

## 2. Mid-connection: a frame arrives

```mermaid
sequenceDiagram
    participant PR as producer
    participant BUS as session bus
    participant WR as SessionStreamWriter
    participant RD as SessionStreamReader
    participant SUB as subscribers
    participant ST as zustand stores

    PR->>BUS: publish(key, { event, data })
    BUS->>WR: listener(message)
    WR->>RD: SSE frame "event: journal|connector"
    RD->>SUB: emit({ event, data })
    SUB->>ST: applyJournalChange / updateConnector
    ST-->>SUB: React re-render
```

Frame dispatch on the client:

```mermaid
flowchart TD
    F["SSE frame"] --> E{"event name"}
    E -->|journal| J{"data.type"}
    J -->|append| A["chat store: appendJournal"]
    J -->|assistant-stream| T["chat store: applyAssistantFrame"]
    J -->|replace| RP["chat store: replaceJournal"]
    J -->|prepend| PP["chat store: prependJournal"]
    J -->|detail-bar| D["detail bar store: applyDetailBar"]
    E -->|connector| C["connector store: updateConnector(slug)"]
    E -->|transport/error| X["log / toast, no state"]
    E -->|ping comment| I["ignored by parseFrame"]
```

---

## 3. Mid-connection: the socket drops

```mermaid
stateDiagram-v2
    [*] --> Connecting: new SessionStreamReader
    Connecting --> Open: fetch ok => notifyReconnect
    Connecting --> Waiting: fetch fails / not ok
    Open --> Waiting: body ends or read error
    Waiting --> Connecting: retry timer
    Open --> Closed: close() from last unsubscribe
    Waiting --> Closed: close() from last unsubscribe
    Closed --> [*]
```

```mermaid
sequenceDiagram
    participant RD as SessionStreamReader
    participant NET as network

    NET--xRD: connection drops
    RD->>RD: catch error, stopped = false
    RD->>RD: schedule retry
    Note right of RD: attempt 0 => 1s<br/>attempt 1 => 2s<br/>attempt 2 => 5s<br/>attempt 3+ => 10s
    RD->>NET: connect() again
    NET-->>RD: 200, open
    RD->>RD: attempt = 0, notifyReconnect()
    Note over RD: onReconnect() runs =><br/>catchUpJournal fills the gap
```

If `close()` wins the race (`stopped = true`): abort controller, clear retry timer, no reconnect.

---

## 4. Switching sessions (client navigation)

```mermaid
sequenceDiagram
    autonumber
    participant U as user
    participant N as Next router
    participant C1 as Chat old
    participant CS as ConnectorStream
    participant R as streams registry
    participant S1 as SessionStreamReader old
    participant S2 as SessionStreamReader new
    participant C2 as Chat new

    U->>N: click session B
    N->>C1: unmount (Chat key changed)
    C1->>R: unsubscribe(A)
    N->>CS: useParams changes to B
    CS->>R: unsubscribe(A) in effect cleanup
    R->>S1: subscribers(A) = 0
    R->>S1: close() => abort fetch
    R->>R: streams.delete(A)
    CS->>R: subscribe(B)
    R->>S2: MISS => new + fetch
    N->>C2: mount Chat key=B
    C2->>R: subscribe(B) => HIT, add() only
```

React ordering: cleanups for the old tree run before effects for the new one, so no two sockets coexist beyond a single commit.

---

## 5. React mount rules

```mermaid
flowchart LR
    subgraph persist["Persist across sessions"]
        AS["AppShell"]
        CS["ConnectorStream (useParams)"]
    end
    subgraph remount["Remount per session"]
        CH["Chat key=sessionId"]
    end
    AS --> CH
    AS --> CS
    CH -->|"effect [sessionId]"| SUB1["subscribe(id)"]
    CS -->|"effect [sessionId]"| SUB2["subscribe(id)"]
```

- `Chat` remounts on every session change because of `key={session.id}` → cleanup unsubscribes, effect subscribes.
- `ConnectorStream` stays mounted; `useParams()` changes → same effect cleanup/subscribe.
- `useSessionStream` effect deps are `[sessionId, Boolean(onOpen)]`; the callbacks live in refs, so re-renders never resubscribe.
- Last unsubscribe of a session → `close()` + `streams.delete(id)`.
