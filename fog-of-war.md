Here’s what we’ve actually agreed on for fog of war so far, in plain terms.

### What is always visible

* You always see **all outposts** on the map:

  * Their **location**
  * Their **type** (HQ, Foundry, Reactor, Extractor)
  * Their **owner** (which player)

So the graph / layout is never hidden.

---

### What is *not* always visible

#### 1. Exact drone counts + specialists

You only see **exact** numbers at:

1. **Your own outposts**
2. **Enemy or neutral outposts inside your sonar radius**

For outposts **outside** your sonar radius:

* You see:

  * The **owner**
  * The **type**
* You do **not** see live drone count or specialists.
* You instead get a **“last seen” snapshot**:

  * `last_known_drones`
  * `last_known_specialists`
  * `timestamp` of when you last had vision

So UI can show something like:

* “Seen 37 drones here 02:14 ago” rather than a live count.

---

#### 2. Carriers (moving stacks)

You always see:

* **Your own carriers**, everywhere.

You see **enemy carriers** if:

1. They are inside the **sonar radius** of any of your outposts
   (normal vision), **or**
2. Their **destination** is one of your outposts
   (you always know something is coming to you).

If an enemy carrier is outside sonar and going between other players, you don’t see it at all.

---

### Fog of war + time machine

When you open the time machine at time `t0`, your client builds a **WorldView**:

* Uses **only** what you’re allowed to see at `t0`:

  * Exact info for things in sonar or you own.
  * Last-known snapshots for everything else.
  * Only visible enemy carriers.
  * Your own scheduled orders.

The time machine simulation then:

* Runs the game rules forward only with that information.
* Does **not** invent hidden enemy orders or hidden carriers.
* So its predictions are **knowledge-limited**:
  if an enemy moved a big stack out of your vision, your prediction can be wrong, and that’s intentional.

---

That’s the fog-of-war model we’ve been working with:

* Full map topology always visible.
* Live numbers only in/near your vision.
* Snapshots + hidden movement elsewhere.
* Time machine respects that same partial knowledge.
